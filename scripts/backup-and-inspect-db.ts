import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { parseAndValidateDatabaseUrl } from '../src/server/db/mysql.js';

dotenv.config();

async function runBackupAndInspect() {
  const parsed = parseAndValidateDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed.valid) {
    throw new Error(`DATABASE_URL inválida ou ausente: ${parsed.reason}`);
  }

  const conn = await mysql.createConnection(parsed.sanitizedUrl);
  try {
    const [versionRows]: any = await conn.query(`SELECT VERSION() AS version, DATABASE() AS dbName, @@SESSION.sql_mode AS sqlMode`);
    const dbVersion = versionRows[0]?.version;
    const dbName = versionRows[0]?.dbName;
    const initialSqlMode = versionRows[0]?.sqlMode;

    const [tableRows]: any = await conn.query(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME ASC`
    );

    const tableNames: string[] = tableRows.map((r: any) => String(r.TABLE_NAME));

    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonBackupPath = path.join(backupDir, `logical-backup-pre-migration-${timestamp}.json`);
    const latestJsonBackupPath = path.join(backupDir, `logical-backup-pre-migration-latest.json`);
    const sqlBackupPath = path.join(backupDir, `logical-backup-pre-migration-${timestamp}.sql`);
    const latestSqlBackupPath = path.join(backupDir, `logical-backup-pre-migration-latest.sql`);

    const backupData: Record<string, any> = {
      metadata: {
        createdAt: new Date().toISOString(),
        dbVersion,
        tableCount: tableNames.length,
        tables: {},
      },
      ddl: {},
      data: {},
    };

    const sqlLines: string[] = [
      `-- Agenda Beauty Logical Backup Pre-Migration`,
      `-- Created At: ${new Date().toISOString()}`,
      `-- Engine Version: ${dbVersion}`,
      `SET FOREIGN_KEY_CHECKS = 0;`,
      ``,
    ];

    let totalRowsBackedUp = 0;

    for (const tableName of tableNames) {
      const [createRows]: any = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
      const ddl = createRows[0]?.['Create Table'] || '';
      backupData.ddl[tableName] = ddl;

      const [rows]: any = await conn.query(`SELECT * FROM \`${tableName}\``);
      backupData.data[tableName] = rows;
      backupData.metadata.tables[tableName] = rows.length;
      totalRowsBackedUp += rows.length;

      sqlLines.push(`-- Table: ${tableName} (${rows.length} rows)`);
      sqlLines.push(`${ddl};`);
      for (const row of rows) {
        const cols = Object.keys(row).map((c) => `\`${c}\``).join(', ');
        const vals = Object.values(row)
          .map((v) => (v === null ? 'NULL' : conn.escape(v)))
          .join(', ');
        sqlLines.push(`INSERT INTO \`${tableName}\` (${cols}) VALUES (${vals});`);
      }
      sqlLines.push('');
    }

    sqlLines.push(`SET FOREIGN_KEY_CHECKS = 1;`);

    const jsonString = JSON.stringify(backupData, null, 2);
    const sqlString = sqlLines.join('\n');

    fs.writeFileSync(jsonBackupPath, jsonString, 'utf8');
    fs.writeFileSync(latestJsonBackupPath, jsonString, 'utf8');
    fs.writeFileSync(sqlBackupPath, sqlString, 'utf8');
    fs.writeFileSync(latestSqlBackupPath, sqlString, 'utf8');

    const jsonSha256 = crypto.createHash('sha256').update(jsonString).digest('hex');
    const sqlSha256 = crypto.createHash('sha256').update(sqlString).digest('hex');

    // Inspect ENUMs and empty roles
    const [enumCols]: any = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE = 'enum'
       ORDER BY TABLE_NAME, COLUMN_NAME`
    );

    const [emptyRoleRows]: any = await conn.query(
      `SELECT tm.id, tm.tenantId, tm.userId, CAST(tm.role AS CHAR) AS role, u.email AS userEmail,
              (SELECT COUNT(*) FROM Tenant t WHERE t.id = tm.tenantId) AS tenantExists,
              (SELECT COUNT(*) FROM Client c WHERE c.tenantId = tm.tenantId AND (c.email = u.email OR c.notes LIKE CONCAT('%userId:', tm.userId, '%'))) AS clientCount,
              (SELECT COUNT(*) FROM Professional p WHERE p.tenantId = tm.tenantId AND p.email = u.email) AS professionalCount
       FROM TenantMember tm
       LEFT JOIN User u ON u.id = tm.userId
       WHERE tm.role = '' OR tm.role IS NULL`
    );

    const [allRoleCounts]: any = await conn.query(
      `SELECT CAST(role AS CHAR) AS roleValue, COUNT(*) AS cnt FROM TenantMember GROUP BY CAST(role AS CHAR)`
    );

    console.log('=== FASE A: INSPEÇÃO E BACKUP LÓGICO CONCLUÍDOS ===');
    console.log(JSON.stringify({
      databaseConnected: Boolean(dbName),
      engineVersion: dbVersion,
      initialSqlMode,
      tableCount: tableNames.length,
      tables: backupData.metadata.tables,
      totalRowsBackedUp,
      hasPrismaMigrationsTable: tableNames.includes('_prisma_migrations'),
      enums: enumCols,
      tenantMemberRoleDistribution: allRoleCounts,
      emptyRoleMembersCount: emptyRoleRows.length,
      emptyRoleMemberIds: emptyRoleRows.map((r: any) => r.id),
      backupVerification: {
        jsonBackupFile: path.basename(jsonBackupPath),
        jsonBackupBytes: Buffer.byteLength(jsonString, 'utf8'),
        jsonSha256,
        sqlBackupFile: path.basename(sqlBackupPath),
        sqlBackupBytes: Buffer.byteLength(sqlString, 'utf8'),
        sqlSha256,
        verifiedOnDisk: fs.existsSync(jsonBackupPath) && fs.statSync(jsonBackupPath).size > 0 && fs.existsSync(sqlBackupPath) && fs.statSync(sqlBackupPath).size > 0,
      },
    }, null, 2));
  } finally {
    await conn.end();
  }
}

runBackupAndInspect().catch((err) => {
  console.error('[Backup & Inspect Error]:', err.message || err);
  process.exit(1);
});
