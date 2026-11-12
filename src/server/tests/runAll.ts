import { execSync } from 'child_process';
import { isProductionDatabaseUrl, assertNotProductionDatabaseInTests } from '../db/mysql.js';

const testFiles = [
  'src/server/tests/monetary.test.ts',
  'src/server/tests/concurrency.test.ts',
  'src/server/tests/security.test.ts',
  'src/server/tests/api.test.ts',
  'src/server/tests/payment.test.ts',
  'src/server/tests/customer.test.ts',
  'src/server/tests/cancellation.test.ts',
  'src/server/tests/etapa8.test.ts',
  'src/server/tests/etapa9.test.ts',
  'src/server/tests/etapa10.test.ts',
  'src/server/tests/etapa11.test.ts',
  'src/server/tests/etapa12c2SecurityReconcileDeposit.test.ts',
  'src/server/tests/etapa13SaasMultiTenant.test.ts',
  'src/server/tests/etapa14CustomerSlugMultiStore.test.ts',
];

console.log('==========================================================');
console.log('🚀 EXECUTANDO TODAS AS SUÍTES DE TESTES DO AGENDA BEAUTY');
console.log('🔒 MODO ISOLADO ATIVO: Proibida qualquer escrita no banco de produção');
console.log('==========================================================\n');

// Enforce strict isolation: by default tests run in isolated memory mode and NEVER touch production DB
const allowDedicatedDbTests = process.env.ALLOW_DB_INTEGRATION_TESTS === 'true';
if (allowDedicatedDbTests) {
  const testDbUrl = process.env.TEST_DATABASE_URL || '';
  if (!testDbUrl) {
    console.error('❌ ERRO: ALLOW_DB_INTEGRATION_TESTS=true requer TEST_DATABASE_URL dedicada.');
    process.exit(1);
  }
  if (isProductionDatabaseUrl(testDbUrl)) {
    console.error('❌ BLOQUEIO DE SEGURANÇA: TEST_DATABASE_URL aponta para o banco de produção (Hostinger). Abortando.');
    process.exit(1);
  }
  assertNotProductionDatabaseInTests(testDbUrl);
}

const isolatedTestEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
  AGENDA_TEST_MODE: '1',
  ALLOW_DB_INTEGRATION_TESTS: allowDedicatedDbTests ? 'true' : 'false',
  // Clear DATABASE_URL unless explicitly running against a verified non-production TEST_DATABASE_URL
  DATABASE_URL: allowDedicatedDbTests ? (process.env.TEST_DATABASE_URL || '') : '',
  DB_STRICT_MODE: 'false',
};

let failed = 0;

for (const file of testFiles) {
  console.log(`\n----------------------------------------------------------`);
  console.log(`▶ Rodando: ${file}`);
  console.log(`----------------------------------------------------------`);
  try {
    execSync(`npx tsx ${file}`, {
      stdio: 'inherit',
      env: isolatedTestEnv,
    });
  } catch (err) {
    console.error(`❌ Falha na suíte: ${file}`);
    failed++;
  }
}

console.log('\n==========================================================');
if (failed === 0) {
  console.log(`✅ TODAS AS ${testFiles.length} SUÍTES DE TESTES PASSARAM COM SUCESSO (ISOLADAS)!`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} SUÍTE(S) FALHARAM.`);
  process.exit(1);
}
