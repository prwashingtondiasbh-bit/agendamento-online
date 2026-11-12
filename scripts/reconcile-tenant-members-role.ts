/**
 * SCRIPT PREPARADO PARA REMEDIAÇÃO TRANSACIONAL DOS 8 REGISTROS DE TenantMember COM role = ''
 * ATENÇÃO: Este script está preparado para revisão e NÃO deve ser executado sem aprovação formal
 * e sem que a Migração A (expansão do ENUM TenantMember.role para incluir 'CUSTOMER') tenha sido aplicada.
 *
 * Para executar após aprovação formal:
 *   CONFIRM_TENANT_MEMBER_REMEDIATION=true npx tsx scripts/reconcile-tenant-members-role.ts
 */
import mysql from 'mysql2/promise';
import {
  parseAndValidateDatabaseUrl,
  buildSessionStrictSqlModeQuery,
  isTestEnvironment,
  assertNotProductionDatabaseInTests,
} from '../src/server/db/mysql.js';

export const EXPECTED_EMPTY_ROLE_MEMBER_IDS = [
  'mem-1793115177874',
  'mem-1793116551777',
  'mem-1793117130313',
  'mem-1793117510080',
  'mem-1793117887090',
  'mem-1793118274035',
  'mem-1793118315139',
  'mem-1793119436047',
] as const;

export interface TenantMemberAuditRow {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  userEmail: string | null;
  tenantExists: number;
  clientCount: number;
  professionalCount: number;
}

export function validateAuditRowsAgainstExpected(rows: TenantMemberAuditRow[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (rows.length !== EXPECTED_EMPTY_ROLE_MEMBER_IDS.length) {
    errors.push(
      `Divergência de contagem: esperados exatamente ${EXPECTED_EMPTY_ROLE_MEMBER_IDS.length} registros com role = '', encontrados ${rows.length}.`
    );
  }

  const foundIds = rows.map((r) => r.id).sort();
  const expectedSorted = [...EXPECTED_EMPTY_ROLE_MEMBER_IDS].sort();

  if (JSON.stringify(foundIds) !== JSON.stringify(expectedSorted)) {
    errors.push(
      `Divergência de IDs: esperados [${expectedSorted.join(', ')}], encontrados [${foundIds.join(', ')}].`
    );
  }

  for (const row of rows) {
    if (!row.userEmail || !String(row.userId).startsWith('user-cust-')) {
      errors.push(`Registro ${row.id}: userId '${row.userId}' inválido ou não segue padrão de cliente ('user-cust-*').`);
    }
    if (!row.tenantExists || row.tenantId !== 'biz-1') {
      errors.push(`Registro ${row.id}: tenantId '${row.tenantId}' inválido ou inexistente.`);
    }
    if (Number(row.clientCount) < 1) {
      errors.push(`Registro ${row.id}: nenhum registro Client vinculado a userId '${row.userId}'.`);
    }
    if (Number(row.professionalCount) > 0) {
      errors.push(`Registro ${row.id}: usuário possui vínculo em Professional e não pode ser classificado automaticamente como CUSTOMER.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function runTenantMemberRemediation() {
  if (isTestEnvironment()) {
    assertNotProductionDatabaseInTests();
    throw new Error('BLOQUEIO: Este script não pode ser executado durante suítes de testes automatizados.');
  }

  if (process.env.CONFIRM_TENANT_MEMBER_REMEDIATION !== 'true') {
    console.log(
      '[DRY-RUN / BLOQUEADO] Script preparado, mas não executado. Defina CONFIRM_TENANT_MEMBER_REMEDIATION=true após aprovação formal da migração.'
    );
    return { executed: false, reason: 'CONFIRMATION_ENV_NOT_SET' };
  }

  const parsed = parseAndValidateDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed.valid) {
    throw new Error(`DATABASE_URL inválida ou ausente: ${parsed.reason}`);
  }

  const conn = await mysql.createConnection(parsed.sanitizedUrl);
  try {
    await conn.query(buildSessionStrictSqlModeQuery());
    await conn.beginTransaction();

    // 1. Confirm that TenantMember.role ENUM already includes 'CUSTOMER'
    const [colRows]: any = await conn.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantMember' AND COLUMN_NAME = 'role'`
    );
    const columnType = String(colRows?.[0]?.COLUMN_TYPE || '');
    if (!columnType.includes("'CUSTOMER'")) {
      throw new Error(
        `PRÉ-CONDIÇÃO FALHOU: A coluna TenantMember.role (${columnType}) ainda não inclui 'CUSTOMER'. Execute a Migração A primeiro.`
      );
    }

    // 2. Lock and inspect all rows where role = ''
    const [emptyRows]: any = await conn.query(
      `SELECT tm.id,
              tm.tenantId,
              tm.userId,
              CAST(tm.role AS CHAR) AS role,
              u.email AS userEmail,
              (SELECT COUNT(*) FROM Tenant t WHERE t.id = tm.tenantId) AS tenantExists,
              (SELECT COUNT(*) FROM Client c WHERE c.tenantId = tm.tenantId AND (c.email = u.email OR c.notes LIKE CONCAT('%userId:', tm.userId, '%'))) AS clientCount,
              (SELECT COUNT(*) FROM Professional p WHERE p.tenantId = tm.tenantId AND p.email = u.email) AS professionalCount
       FROM TenantMember tm
       LEFT JOIN User u ON u.id = tm.userId
       WHERE tm.role = ''
       FOR UPDATE`
    );

    const validation = validateAuditRowsAgainstExpected(emptyRows);
    if (!validation.valid) {
      throw new Error(`ABORTANDO TRANSAÇÃO — Validação prévia falhou:\n - ${validation.errors.join('\n - ')}`);
    }

    // 3. Execute targeted UPDATE only on the 8 verified IDs
    const placeholders = EXPECTED_EMPTY_ROLE_MEMBER_IDS.map(() => '?').join(', ');
    const [updateResult]: any = await conn.execute(
      `UPDATE TenantMember
       SET role = 'CUSTOMER', updatedAt = NOW()
       WHERE role = '' AND id IN (${placeholders})`,
      [...EXPECTED_EMPTY_ROLE_MEMBER_IDS]
    );

    if (updateResult.affectedRows !== EXPECTED_EMPTY_ROLE_MEMBER_IDS.length) {
      throw new Error(
        `ABORTANDO TRANSAÇÃO — affectedRows (${updateResult.affectedRows}) diferente do esperado (${EXPECTED_EMPTY_ROLE_MEMBER_IDS.length}).`
      );
    }

    // 4. Verify zero remaining empty roles
    const [remaining]: any = await conn.query(
      `SELECT COUNT(*) AS cnt FROM TenantMember WHERE role = '' OR role IS NULL`
    );
    if (Number(remaining?.[0]?.cnt || 0) !== 0) {
      throw new Error(`ABORTANDO TRANSAÇÃO — Ainda restam registros com role vazio após UPDATE.`);
    }

    await conn.commit();
    console.log(
      `[SUCESSO] ${updateResult.affectedRows} registros de TenantMember atualizados para role = 'CUSTOMER':`,
      EXPECTED_EMPTY_ROLE_MEMBER_IDS
    );
    return {
      executed: true,
      affectedRows: updateResult.affectedRows,
      updatedIds: [...EXPECTED_EMPTY_ROLE_MEMBER_IDS],
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

// Run only if invoked directly via CLI with explicit confirmation flag
if (process.argv[1]?.endsWith('reconcile-tenant-members-role.ts')) {
  runTenantMemberRemediation().catch((err) => {
    console.error('[Erro na Reconciliação de TenantMember]:', err.message || err);
    process.exit(1);
  });
}
