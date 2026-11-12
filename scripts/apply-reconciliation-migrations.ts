import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {
  parseAndValidateDatabaseUrl,
  buildSessionStrictSqlModeQuery,
  isTestEnvironment,
  assertNotProductionDatabaseInTests,
} from '../src/server/db/mysql.js';
import { runTenantMemberRemediation } from './reconcile-tenant-members-role.js';

dotenv.config();

const MIGRATION_ORDER = [
  '20261026_baseline_core_schema',
  '20261027_etapa7_cancellation_refund',
  '20261028_etapa8_owner_crm_agenda',
  '20261029_etapa9_financial_module',
  '20261030_etapa10_whatsapp_business',
  '20261031_etapa11_advanced_features',
  '20261101_etapa12_deposit_policy_and_indexes',
  '20261102_etapa13_saas_multitenant_master_admin',
] as const;

async function applyMigrationFolder(conn: mysql.Connection, migrationName: string) {
  const sqlFilePath = path.resolve(process.cwd(), 'prisma', 'migrations', migrationName, 'migration.sql');
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`Arquivo de migration não encontrado: ${sqlFilePath}`);
  }
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

  const [existing]: any = await conn.query(
    `SELECT id, checksum, finished_at FROM _prisma_migrations WHERE migration_name = ? LIMIT 1`,
    [migrationName]
  );

  if (existing && existing.length > 0 && existing[0].finished_at) {
    return { migrationName, status: 'ALREADY_APPLIED', checksum };
  }

  const startedAt = new Date();
  await conn.query(sqlContent);
  const finishedAt = new Date();

  const migrationId = crypto.randomUUID();
  await conn.execute(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
    [migrationId, checksum, finishedAt, migrationName, startedAt]
  );

  return { migrationName, status: 'APPLIED', checksum };
}

async function runApplyReconciliation() {
  if (isTestEnvironment()) {
    assertNotProductionDatabaseInTests();
    throw new Error('BLOQUEIO: Este script não pode ser executado em ambiente de testes.');
  }

  // 1. Confirm logical backup exists before touching anything
  const latestBackupJson = path.resolve(process.cwd(), 'backups', 'logical-backup-pre-migration-latest.json');
  const latestBackupSql = path.resolve(process.cwd(), 'backups', 'logical-backup-pre-migration-latest.sql');
  if (!fs.existsSync(latestBackupJson) || fs.statSync(latestBackupJson).size === 0 || !fs.existsSync(latestBackupSql) || fs.statSync(latestBackupSql).size === 0) {
    throw new Error('PRÉ-CONDIÇÃO FALHOU: Backup lógico pré-migração não encontrado ou vazio em /backups.');
  }

  const parsed = parseAndValidateDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed.valid) {
    throw new Error(`DATABASE_URL inválida ou ausente: ${parsed.reason}`);
  }

  const conn = await mysql.createConnection({
    uri: parsed.sanitizedUrl,
    multipleStatements: true,
  });

  try {
    await conn.query(buildSessionStrictSqlModeQuery());

    // 2. Ensure _prisma_migrations table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`checksum\` VARCHAR(64) NOT NULL,
        \`finished_at\` DATETIME(3) NULL,
        \`migration_name\` VARCHAR(255) NOT NULL,
        \`logs\` TEXT NULL,
        \`rolled_back_at\` DATETIME(3) NULL,
        \`started_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`applied_steps_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    const appliedMigrations: any[] = [];

    // 3. Apply Baseline + Migration A (expands ENUMs including TenantMember.role -> 'CUSTOMER')
    const baselineResult = await applyMigrationFolder(conn, '20261026_baseline_core_schema');
    appliedMigrations.push(baselineResult);

    // 4. Remediate the 8 fictional TenantMember rows with role = '' -> 'CUSTOMER'
    const [emptyCheck]: any = await conn.query(`SELECT COUNT(*) AS cnt FROM TenantMember WHERE role = '' OR role IS NULL`);
    let remediationResult: any = { executed: false, reason: 'ALREADY_REMEDIATED_ZERO_EMPTY_ROLES' };
    if (Number(emptyCheck?.[0]?.cnt || 0) > 0) {
      process.env.CONFIRM_TENANT_MEMBER_REMEDIATION = 'true';
      remediationResult = await runTenantMemberRemediation();
    }

    // 5. Apply remaining migrations (Stages 7, 8, 9, 10, 11, and 12)
    for (const migName of MIGRATION_ORDER.slice(1)) {
      const res = await applyMigrationFolder(conn, migName);
      appliedMigrations.push(res);
    }

    // 6. Post-migration verification queries
    const [tableRows]: any = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME ASC`
    );
    const allTables = tableRows.map((r: any) => String(r.TABLE_NAME));
    const domainTables = allTables.filter((t: string) => t !== '_prisma_migrations');

    const [enumCols]: any = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE = 'enum'
       ORDER BY TABLE_NAME, COLUMN_NAME`
    );

    const [tenantRequireDepositCol]: any = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'requireDeposit'`
    );

    const [roleDist]: any = await conn.query(
      `SELECT CAST(role AS CHAR) AS roleValue, COUNT(*) AS cnt FROM TenantMember GROUP BY CAST(role AS CHAR)`
    );

    // Verify 0 empty ENUM values across existing tables
    const [invalidEnums]: any = await conn.query(`
      SELECT 'TenantMember.role' AS col, COUNT(*) AS invalidCount FROM TenantMember WHERE role = '' OR role IS NULL
      UNION ALL
      SELECT 'Appointment.status', COUNT(*) FROM Appointment WHERE status = '' OR status IS NULL
      UNION ALL
      SELECT 'TimeBlock.type', COUNT(*) FROM TimeBlock WHERE type = '' OR type IS NULL
      UNION ALL
      SELECT 'Payment.status', COUNT(*) FROM Payment WHERE status = '' OR status IS NULL
      UNION ALL
      SELECT 'WebhookEvent.processingStatus', COUNT(*) FROM WebhookEvent WHERE processingStatus = '' OR processingStatus IS NULL
    `);

    // Verify 0 orphan records across core relationships
    const [orphanCheck]: any = await conn.query(`
      SELECT 'TenantMember->Tenant' AS rel, COUNT(*) AS orphans FROM TenantMember tm LEFT JOIN Tenant t ON t.id = tm.tenantId WHERE t.id IS NULL
      UNION ALL
      SELECT 'TenantMember->User', COUNT(*) FROM TenantMember tm LEFT JOIN User u ON u.id = tm.userId WHERE u.id IS NULL
      UNION ALL
      SELECT 'Appointment->Tenant', COUNT(*) FROM Appointment a LEFT JOIN Tenant t ON t.id = a.tenantId WHERE t.id IS NULL
      UNION ALL
      SELECT 'Appointment->Client', COUNT(*) FROM Appointment a LEFT JOIN Client c ON c.id = a.clientId WHERE c.id IS NULL
      UNION ALL
      SELECT 'Appointment->Professional', COUNT(*) FROM Appointment a LEFT JOIN Professional p ON p.id = a.professionalId WHERE p.id IS NULL
      UNION ALL
      SELECT 'Appointment->Service', COUNT(*) FROM Appointment a LEFT JOIN Service s ON s.id = a.serviceId WHERE s.id IS NULL
      UNION ALL
      SELECT 'Payment->Appointment', COUNT(*) FROM Payment p LEFT JOIN Appointment a ON a.id = p.appointmentId WHERE a.id IS NULL
    `);

    const [prismaMigrationsRows]: any = await conn.query(
      `SELECT migration_name, checksum, started_at, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY migration_name ASC`
    );

    console.log('=== FASE B & C: MIGRATIONS E RECONCILIAÇÃO APLICADAS COM SUCESSO ===');
    console.log(JSON.stringify({
      appliedMigrations,
      remediationResult,
      totalTablesInDatabase: allTables.length,
      domainTablesCount: domainTables.length,
      hasPrismaMigrationsTable: allTables.includes('_prisma_migrations'),
      tenantRequireDepositCol: tenantRequireDepositCol[0] || null,
      tenantMemberRoleDistributionAfter: roleDist,
      invalidEnumCheck: invalidEnums,
      orphanRelationshipsCheck: orphanCheck,
      prismaMigrationsRecorded: prismaMigrationsRows,
      updatedCoreEnums: enumCols.filter((e: any) => ['TenantMember', 'Appointment', 'TimeBlock', 'Payment', 'WebhookEvent'].includes(e.TABLE_NAME)),
    }, null, 2));
  } finally {
    await conn.end();
  }
}

runApplyReconciliation().catch((err) => {
  console.error('[Apply Reconciliation Error]:', err.message || err);
  process.exit(1);
});
