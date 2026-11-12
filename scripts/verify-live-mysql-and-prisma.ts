import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  parseAndValidateDatabaseUrl,
  getMySqlPool,
  getPersistenceHealthStatus,
} from '../src/server/db/mysql.js';
import { db } from '../src/server/storage.js';

dotenv.config();

async function verifyLiveMySqlAndPrisma() {
  // 1. Clean outer single/double quotes in .env if present (without printing any secret)
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const rawEnv = fs.readFileSync(envPath, 'utf8');
    const updatedEnv = rawEnv.replace(
      /^DATABASE_URL=(['"])(mysql:\/\/[^'"]+)\1$/m,
      'DATABASE_URL="$2"'
    );
    if (updatedEnv !== rawEnv) {
      fs.writeFileSync(envPath, updatedEnv, 'utf8');
      console.log('[.env] Outer single quotes normalized to standard format for Prisma CLI (credentials not logged).');
    }
  }

  const parsed = parseAndValidateDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed.valid) {
    throw new Error(`DATABASE_URL inválida: ${parsed.reason}`);
  }

  // 2. Verify health status with real MySQL pool
  const health = await getPersistenceHealthStatus();

  // 3. Test live persistence of requireDeposit on Tenant 'biz-1' in MySQL
  const pool = getMySqlPool();
  if (!pool) {
    throw new Error('Pool MySQL não inicializado.');
  }

  try {
    const initialBiz = await db.getBusiness('biz-1');
    const initialRequireDeposit = Boolean(initialBiz.requireDeposit);

    // Toggle to false (Modo B: Agendamento sem sinal) and verify directly in MySQL table
    await db.updateBusiness('biz-1', { requireDeposit: false });
    const [rowsFalse]: any = await pool.query(`SELECT id, requireDeposit, defaultDeposit FROM Tenant WHERE id = 'biz-1' LIMIT 1`);
    const dbRequireDepositWhenFalse = Boolean(rowsFalse?.[0]?.requireDeposit);

    // Restore to true (Modo A: Agendamento com sinal) and verify directly in MySQL table
    await db.updateBusiness('biz-1', { requireDeposit: true });
    const [rowsTrue]: any = await pool.query(`SELECT id, requireDeposit, defaultDeposit FROM Tenant WHERE id = 'biz-1' LIMIT 1`);
    const dbRequireDepositRestored = Boolean(rowsTrue?.[0]?.requireDeposit);

    // 4. Verify remediated TenantMember role directly from MySQL
    const [sampleRemediated]: any = await pool.query(
      `SELECT tm.id, tm.userId, CAST(tm.role AS CHAR) AS role, u.email
       FROM TenantMember tm
       JOIN User u ON u.id = tm.userId
       WHERE tm.id = 'mem-1793115177874' LIMIT 1`
    );

    let resolvedUserRole: string | null = null;
    if (sampleRemediated && sampleRemediated.length > 0) {
      const foundUser = await db.findUserByEmail(sampleRemediated[0].email);
      resolvedUserRole = foundUser?.role || null;
    }

    console.log('=== VERIFICAÇÃO DE PERSISTÊNCIA REAL NO MYSQL ===');
    console.log(JSON.stringify({
      healthStatus: health,
      requireDepositPersistenceTest: {
        initialRequireDeposit,
        dbRequireDepositWhenFalse,
        dbRequireDepositRestored,
        persistedInMySqlCorrectly: dbRequireDepositWhenFalse === false && dbRequireDepositRestored === true,
      },
      remediatedCustomerLookup: {
        memberId: sampleRemediated?.[0]?.id,
        dbRole: sampleRemediated?.[0]?.role,
        findUserByEmailRole: resolvedUserRole,
      },
    }, null, 2));
  } finally {
    await pool.end();
  }
}

verifyLiveMySqlAndPrisma().catch((err) => {
  console.error('[Live MySQL Verification Error]:', err.message || err);
  process.exit(1);
});
