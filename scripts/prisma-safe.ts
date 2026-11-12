import { spawnSync } from 'child_process';
import { sanitizeDatabaseUrl } from '../src/server/db/mysql.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: npx tsx scripts/prisma-safe.ts <comandos-prisma>');
  process.exit(1);
}

const cleanUrl = sanitizeDatabaseUrl(process.env.DATABASE_URL);
const env = {
  ...process.env,
  ...(cleanUrl ? { DATABASE_URL: cleanUrl } : {}),
};

const result = spawnSync('npx', ['prisma', ...args], {
  env,
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
