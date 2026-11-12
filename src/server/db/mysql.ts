import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Read .env without overriding already-set test environment variables
let envFileDatabaseUrl = '';
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    if (parsed.DATABASE_URL) {
      envFileDatabaseUrl = parsed.DATABASE_URL;
    }
  }
} catch {}

if (process.env.NODE_ENV !== 'test' && process.env.AGENDA_TEST_MODE !== '1') {
  dotenv.config({ override: false });
}

export const PRODUCTION_DB_PROTECTED_TOKENS = [
  'u117523286_agendonline',
  'srv1661.hstgr.io',
] as const;

export const REQUIRED_SESSION_SQL_MODES = [
  'STRICT_TRANS_TABLES',
  'STRICT_ALL_TABLES',
  'ERROR_FOR_DIVISION_BY_ZERO',
  'NO_ENGINE_SUBSTITUTION',
] as const;

export class PersistenceUnavailableError extends Error {
  statusCode = 503;
  code = 'PERSISTENCE_UNAVAILABLE';
  constructor(message = 'Persistência MySQL indisponível em modo estrito (DB_STRICT_MODE=true).') {
    super(message);
    this.name = 'PersistenceUnavailableError';
  }
}

export class ProductionDatabaseWriteBlockedError extends Error {
  statusCode = 403;
  code = 'PRODUCTION_DB_WRITE_BLOCKED_IN_TESTS';
  constructor(
    message = 'BLOQUEIO DE SEGURANÇA: Execução de testes automatizados contra o banco de produção (Hostinger) é estritamente proibida.'
  ) {
    super(message);
    this.name = 'ProductionDatabaseWriteBlockedError';
  }
}

export interface ParsedDatabaseUrlResult {
  valid: boolean;
  sanitizedUrl: string;
  host?: string;
  port?: number;
  database?: string;
  reason?: string;
}

/**
 * Removes outer whitespace and at most one pair of wrapping single or double quotes.
 * Never logs or exposes credentials.
 */
export function sanitizeDatabaseUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let cleaned = rawUrl.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2)
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

/**
 * Validates and parses a MySQL DATABASE_URL without logging secrets.
 */
export function parseAndValidateDatabaseUrl(rawUrl?: string | null): ParsedDatabaseUrlResult {
  const sanitizedUrl = sanitizeDatabaseUrl(rawUrl);
  if (!sanitizedUrl) {
    return { valid: false, sanitizedUrl: '', reason: 'MISSING_DATABASE_URL' };
  }

  if (
    sanitizedUrl.includes('[USUARIO]') ||
    sanitizedUrl.includes('[HOST]') ||
    sanitizedUrl.includes('username:password@hostname')
  ) {
    return { valid: false, sanitizedUrl: '', reason: 'PLACEHOLDER_DATABASE_URL' };
  }

  if (!sanitizedUrl.startsWith('mysql://')) {
    return { valid: false, sanitizedUrl: '', reason: 'INVALID_PROTOCOL_EXPECTED_MYSQL' };
  }

  try {
    const parsed = new URL(sanitizedUrl);
    if (parsed.protocol !== 'mysql:') {
      return { valid: false, sanitizedUrl: '', reason: 'INVALID_PROTOCOL_EXPECTED_MYSQL' };
    }
    const host = parsed.hostname;
    const database = (parsed.pathname || '').replace(/^\/+/, '');
    const port = parsed.port ? Number(parsed.port) : 3306;

    if (!host) {
      return { valid: false, sanitizedUrl: '', reason: 'MISSING_HOST' };
    }
    if (!database) {
      return { valid: false, sanitizedUrl: '', reason: 'MISSING_DATABASE_NAME' };
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { valid: false, sanitizedUrl: '', reason: 'INVALID_PORT' };
    }

    return {
      valid: true,
      sanitizedUrl,
      host,
      port,
      database,
    };
  } catch {
    return { valid: false, sanitizedUrl: '', reason: 'MALFORMED_URL_SYNTAX' };
  }
}

export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.AGENDA_TEST_MODE === '1';
}

export function isStrictPersistenceMode(): boolean {
  return process.env.DB_STRICT_MODE === 'true' || process.env.DB_STRICT_MODE === '1';
}

export function isMemoryFallbackAllowed(): boolean {
  return !isStrictPersistenceMode();
}

export function isProductionDatabaseUrl(rawUrl?: string | null): boolean {
  const cleaned = sanitizeDatabaseUrl(rawUrl).toLowerCase();
  if (!cleaned) return false;

  for (const token of PRODUCTION_DB_PROTECTED_TOKENS) {
    if (cleaned.includes(token)) {
      return true;
    }
  }

  const prodEnvClean = sanitizeDatabaseUrl(envFileDatabaseUrl).toLowerCase();
  if (prodEnvClean && cleaned === prodEnvClean) {
    return true;
  }

  return false;
}

/**
 * Throws ProductionDatabaseWriteBlockedError if a test attempts to use the production database URL.
 */
export function assertNotProductionDatabaseInTests(rawUrl?: string | null): void {
  const candidate = rawUrl !== undefined ? rawUrl : (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  if (isProductionDatabaseUrl(candidate)) {
    throw new ProductionDatabaseWriteBlockedError();
  }
}

/**
 * Builds the session-level SQL statement to enforce strict SQL mode on MariaDB/MySQL connections
 * without altering global server configuration.
 */
export function buildSessionStrictSqlModeQuery(): string {
  const modes = REQUIRED_SESSION_SQL_MODES.join("','");
  return `SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, '${modes}')`;
}

/**
 * Strict application-layer and session-layer validator for ENUM values.
 * Prevents MariaDB non-strict coercion of invalid ENUM strings into empty string ('').
 */
export function validateEnumValueStrict<T extends string>(
  columnName: string,
  value: unknown,
  allowedValues: readonly T[]
): T {
  if (typeof value !== 'string' || value.trim() === '') {
    const err: any = new Error(
      `Valor ENUM inválido ou vazio para ${columnName}: valores vazios ('') são bloqueados pelo modo SQL estrito.`
    );
    err.statusCode = 400;
    err.code = 'STRICT_ENUM_VALIDATION_FAILED';
    throw err;
  }
  if (!allowedValues.includes(value as T)) {
    const err: any = new Error(
      `Valor ENUM inválido '${value}' para ${columnName}. Valores permitidos: ${allowedValues.join(', ')}.`
    );
    err.statusCode = 400;
    err.code = 'STRICT_ENUM_VALIDATION_FAILED';
    throw err;
  }
  return value as T;
}

export const VALID_TENANT_MEMBER_ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'RECEPTIONIST',
  'PROFESSIONAL',
  'CUSTOMER',
] as const;

export const VALID_APPOINTMENT_STATUSES = [
  'PENDING_PAYMENT',
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
] as const;

export const VALID_TIME_BLOCK_TYPES = [
  'DAY_OFF',
  'VACATION',
  'BREAK',
  'INTERVAL',
  'LUNCH',
  'PERSONAL',
  'EXCEPTION',
] as const;

let pool: mysql.Pool | null = null;
let lastConnectionAttempt = 0;
let connectionFailed = false;
let lastFailureReason: string | null = null;

function isTransientConnectionError(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return (
    code === 'ECONNRESET' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'ER_GET_CONNECTION_TIMEOUT' ||
    msg.includes('ECONNRESET') ||
    msg.includes('Connection lost') ||
    msg.includes('closed state')
  );
}

const SELECT_CACHE_TTL_MS = 4000;
const selectQueryCache = new Map<string, { expiresAt: number; rows: any }>();
const inFlightSelectQueries = new Map<string, Promise<any>>();
let lastCacheInvalidationTime = 0;

export function invalidateQueryCache(): void {
  selectQueryCache.clear();
  inFlightSelectQueries.clear();
  lastCacheInvalidationTime = Date.now();
}

export function getLastCacheInvalidationTime(): number {
  return lastCacheInvalidationTime;
}

function createNewPool(dbUrl: string): mysql.Pool {
  const newPool = mysql.createPool({
    uri: dbUrl,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 6,
    idleTimeout: 60000, // keep connections warm for 60s to avoid TCP handshake latency
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 3000,
    connectTimeout: 5000,
  });

  // Intercept pool.execute so any direct write invalidates the SELECT cache immediately
  const origPoolExecute = newPool.execute.bind(newPool);
  (newPool as any).execute = async (...args: any[]) => {
    invalidateQueryCache();
    const res = await (origPoolExecute as any)(...args);
    invalidateQueryCache();
    return res;
  };

  // Intercept getConnection so transactions/writes on pooled connections also invalidate cache
  const origGetConnection = newPool.getConnection.bind(newPool);
  (newPool as any).getConnection = async () => {
    const conn = await origGetConnection();
    if (conn && !(conn as any).__cacheWrapped) {
      (conn as any).__cacheWrapped = true;
      const origConnExecute = conn.execute.bind(conn);
      (conn as any).execute = async (...args: any[]) => {
        invalidateQueryCache();
        const res = await (origConnExecute as any)(...args);
        invalidateQueryCache();
        return res;
      };
      const origCommit = conn.commit.bind(conn);
      (conn as any).commit = async () => {
        const res = await origCommit();
        invalidateQueryCache();
        return res;
      };
    }
    return conn;
  };

  // Enforce strict SQL mode at the session level for every newly opened connection
  const rawCallbackPool = (newPool as any).pool;
  if (rawCallbackPool && typeof rawCallbackPool.on === 'function') {
    rawCallbackPool.on('connection', (connection: any) => {
      if (connection && typeof connection.on === 'function') {
        connection.on('error', (connErr: any) => {
          if (isTransientConnectionError(connErr)) {
            pool = null;
          }
        });
      }
      if (connection && typeof connection.query === 'function') {
        connection.query(buildSessionStrictSqlModeQuery(), () => {
          // Ignore transient errors during background session initialization
        });
      }
    });
  }

  // Handle socket reset errors on idle connection pool
  (newPool as any).on('error', (err: any) => {
    if (isTransientConnectionError(err)) {
      pool = null; // force recreation on next request
    }
  });

  return newPool;
}

/**
 * Handles SQL read/write errors according to DB_STRICT_MODE.
 * In strict mode, errors are NEVER masked as silent memoryStore successes.
 */
export function handleDbFallbackError(operation: string, err: any): void {
  if (
    err instanceof PersistenceUnavailableError ||
    err instanceof ProductionDatabaseWriteBlockedError ||
    err?.code === 'PERSISTENCE_UNAVAILABLE' ||
    err?.code === 'PRODUCTION_DB_WRITE_BLOCKED_IN_TESTS' ||
    err?.code === 'STRICT_ENUM_VALIDATION_FAILED'
  ) {
    throw err;
  }

  if (isTransientConnectionError(err)) {
    resetPool();
  }

  if (isStrictPersistenceMode()) {
    throw new PersistenceUnavailableError(
      `Erro de persistência SQL em modo estrito durante '${operation}': ${err?.code || err?.message || 'Falha no banco'}`
    );
  }
}

export function getMySqlPool(): mysql.Pool | null {
  const strict = isStrictPersistenceMode();
  const inTests = isTestEnvironment();

  // 1. Test environment isolation guard
  if (inTests) {
    const allowDbIntegration = process.env.ALLOW_DB_INTEGRATION_TESTS === 'true';
    if (!allowDbIntegration && !strict) {
      // Default test mode: strictly isolated in-memory storage, zero remote DB access
      return null;
    }

    const candidateTestUrl = allowDbIntegration
      ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
      : process.env.DATABASE_URL;

    // Block accidental connection to production database during tests
    assertNotProductionDatabaseInTests(candidateTestUrl);

    if (allowDbIntegration && !candidateTestUrl) {
      throw new PersistenceUnavailableError(
        'ALLOW_DB_INTEGRATION_TESTS=true requer TEST_DATABASE_URL apontando para um banco de testes dedicado.'
      );
    }
  }

  if (connectionFailed && Date.now() - lastConnectionAttempt < 15000) {
    if (strict) {
      throw new PersistenceUnavailableError(
        `Conexão MySQL marcada como indisponível (${lastFailureReason || 'CONNECTION_FAILED'}).`
      );
    }
    return null;
  }

  if (pool) return pool;

  const rawEnvUrl = inTests && process.env.ALLOW_DB_INTEGRATION_TESTS === 'true'
    ? (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

  const parsed = parseAndValidateDatabaseUrl(rawEnvUrl);
  if (!parsed.valid) {
    lastFailureReason = parsed.reason || 'INVALID_DATABASE_URL';
    if (strict) {
      throw new PersistenceUnavailableError(
        `Configuração DATABASE_URL ausente ou inválida em modo estrito (${lastFailureReason}).`
      );
    }
    return null;
  }

  // Keep process.env.DATABASE_URL normalized without surrounding quotes (only outside default isolated tests)
  if (!inTests && process.env.DATABASE_URL !== parsed.sanitizedUrl) {
    process.env.DATABASE_URL = parsed.sanitizedUrl;
  }

  try {
    lastConnectionAttempt = Date.now();
    pool = createNewPool(parsed.sanitizedUrl);
    connectionFailed = false;
    lastFailureReason = null;
    return pool;
  } catch (err: any) {
    connectionFailed = true;
    lastFailureReason = err?.code || err?.message || 'POOL_INIT_ERROR';
    if (strict) {
      throw new PersistenceUnavailableError(
        `Falha ao inicializar pool MySQL em modo estrito (${lastFailureReason}).`
      );
    }
    return null;
  }
}

export function resetPool() {
  if (pool) {
    try {
      pool.end().catch(() => {});
    } catch {}
    pool = null;
  }
  connectionFailed = false;
  lastFailureReason = null;
}

export function markConnectionFailed(reason?: string) {
  connectionFailed = true;
  lastConnectionAttempt = Date.now();
  if (reason) lastFailureReason = reason;
}

/**
 * Acquires a pooled connection and verifies it is alive, retrying once if an idle socket was reset.
 */
export async function getConnectionWithRetry(): Promise<mysql.PoolConnection> {
  const p = getMySqlPool();
  if (!p) {
    if (isStrictPersistenceMode()) {
      throw new PersistenceUnavailableError('Pool MySQL indisponível para transação em modo estrito.');
    }
    throw new Error('MySQL pool unavailable');
  }

  try {
    const conn = await p.getConnection();
    return conn;
  } catch (err: any) {
    if (isTransientConnectionError(err)) {
      resetPool();
      const freshPool = getMySqlPool();
      if (freshPool) {
        return await freshPool.getConnection();
      }
    }
    if (isStrictPersistenceMode()) {
      throw new PersistenceUnavailableError(`Erro ao obter conexão SQL em modo estrito: ${err?.code || err?.message}`);
    }
    throw err;
  }
}

/**
 * Resilient query executor that automatically retries if ECONNRESET or socket drop occurs.
 */
export async function queryWithRetry<T = any>(sql: string, params: any[] = []): Promise<[T, any]> {
  const p = getMySqlPool();
  if (!p) {
    if (isStrictPersistenceMode()) {
      throw new PersistenceUnavailableError('Pool MySQL indisponível para leitura em modo estrito.');
    }
    throw new Error('MySQL pool unavailable');
  }

  const normalizedSql = sql.trim();
  const isSelectQuery = normalizedSql.toUpperCase().startsWith('SELECT ') && !isTestEnvironment();

  if (!isSelectQuery) {
    invalidateQueryCache();
  } else {
    const cacheKey = `${normalizedSql}::${JSON.stringify(params)}`;
    const now = Date.now();
    const cached = selectQueryCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return [cached.rows, []] as any;
    }

    const inFlight = inFlightSelectQueries.get(cacheKey);
    if (inFlight) {
      return (await inFlight) as any;
    }

    const queryPromise = (async () => {
      try {
        const result: any = await p.query(sql, params);
        selectQueryCache.set(cacheKey, {
          expiresAt: Date.now() + SELECT_CACHE_TTL_MS,
          rows: result[0],
        });
        return result;
      } catch (err: any) {
        if (isTransientConnectionError(err)) {
          resetPool();
          const freshPool = getMySqlPool();
          if (freshPool) {
            const retryRes: any = await freshPool.query(sql, params);
            selectQueryCache.set(cacheKey, {
              expiresAt: Date.now() + SELECT_CACHE_TTL_MS,
              rows: retryRes[0],
            });
            return retryRes;
          }
        }
        if (isStrictPersistenceMode()) {
          throw new PersistenceUnavailableError(`Erro SQL na leitura em modo estrito: ${err.code || err.message}`);
        }
        throw err;
      } finally {
        inFlightSelectQueries.delete(cacheKey);
      }
    })();

    inFlightSelectQueries.set(cacheKey, queryPromise);
    return (await queryPromise) as any;
  }

  try {
    return (await p.query(sql, params)) as any;
  } catch (err: any) {
    if (isTransientConnectionError(err)) {
      resetPool();
      const freshPool = getMySqlPool();
      if (freshPool) {
        return (await freshPool.query(sql, params)) as any;
      }
    }
    if (isStrictPersistenceMode()) {
      throw new PersistenceUnavailableError(`Erro SQL na leitura em modo estrito: ${err.code || err.message}`);
    }
    throw err;
  }
}

/**
 * Resilient statement executor that automatically retries if ECONNRESET occurs.
 */
export async function executeWithRetry<T = any>(sql: string, params: any[] = []): Promise<[T, any]> {
  const p = getMySqlPool();
  if (!p) {
    if (isStrictPersistenceMode()) {
      throw new PersistenceUnavailableError('Pool MySQL indisponível para escrita em modo estrito.');
    }
    throw new Error('MySQL pool unavailable');
  }

  invalidateQueryCache();

  try {
    const res = (await p.execute(sql, params)) as any;
    invalidateQueryCache();
    return res;
  } catch (err: any) {
    if (isTransientConnectionError(err)) {
      resetPool();
      const freshPool = getMySqlPool();
      if (freshPool) {
        const retryRes = (await freshPool.execute(sql, params)) as any;
        invalidateQueryCache();
        return retryRes;
      }
    }
    if (isStrictPersistenceMode()) {
      throw new PersistenceUnavailableError(`Erro SQL na escrita em modo estrito: ${err.code || err.message}`);
    }
    throw err;
  }
}

export async function testDbConnection(): Promise<boolean> {
  try {
    const [rows] = await queryWithRetry('SELECT 1 as connected');
    connectionFailed = false;
    lastFailureReason = null;
    return Boolean(rows);
  } catch (err: any) {
    markConnectionFailed(err?.code || err?.message);
    if (isStrictPersistenceMode()) {
      throw new PersistenceUnavailableError(`Teste de conexão MySQL falhou em modo estrito: ${err?.code || err?.message}`);
    }
    return false;
  }
}

export async function getPersistenceHealthStatus(): Promise<{
  healthy: boolean;
  mode: 'MYSQL_ACTIVE' | 'MEMORY_FALLBACK_ALLOWED' | 'PERSISTENCE_FAILURE';
  strictMode: boolean;
  connected: boolean;
  sqlModeStrictConfigured: boolean;
  reason?: string;
}> {
  const strictMode = isStrictPersistenceMode();
  const parsed = parseAndValidateDatabaseUrl(process.env.DATABASE_URL);

  if (isTestEnvironment() && process.env.ALLOW_DB_INTEGRATION_TESTS !== 'true' && !strictMode) {
    return {
      healthy: true,
      mode: 'MEMORY_FALLBACK_ALLOWED',
      strictMode: false,
      connected: false,
      sqlModeStrictConfigured: true,
      reason: 'ISOLATED_TEST_MEMORY_MODE',
    };
  }

  if (!parsed.valid) {
    if (strictMode) {
      return {
        healthy: false,
        mode: 'PERSISTENCE_FAILURE',
        strictMode: true,
        connected: false,
        sqlModeStrictConfigured: true,
        reason: parsed.reason || 'INVALID_DATABASE_URL',
      };
    }
    return {
      healthy: true,
      mode: 'MEMORY_FALLBACK_ALLOWED',
      strictMode: false,
      connected: false,
      sqlModeStrictConfigured: true,
      reason: parsed.reason || 'MEMORY_DEMO_MODE',
    };
  }

  try {
    const p = getMySqlPool();
    if (!p) {
      return {
        healthy: !strictMode,
        mode: strictMode ? 'PERSISTENCE_FAILURE' : 'MEMORY_FALLBACK_ALLOWED',
        strictMode,
        connected: false,
        sqlModeStrictConfigured: true,
        reason: lastFailureReason || 'POOL_UNAVAILABLE',
      };
    }
    await p.query('SELECT 1 as ok');
    return {
      healthy: true,
      mode: 'MYSQL_ACTIVE',
      strictMode,
      connected: true,
      sqlModeStrictConfigured: true,
    };
  } catch (err: any) {
    markConnectionFailed(err?.code || err?.message);
    if (strictMode) {
      return {
        healthy: false,
        mode: 'PERSISTENCE_FAILURE',
        strictMode: true,
        connected: false,
        sqlModeStrictConfigured: true,
        reason: err?.code || 'MYSQL_PING_FAILED',
      };
    }
    return {
      healthy: true,
      mode: 'MEMORY_FALLBACK_ALLOWED',
      strictMode: false,
      connected: false,
      sqlModeStrictConfigured: true,
      reason: err?.code || 'MYSQL_PING_FAILED_FALLBACK_ACTIVE',
    };
  }
}

export function resetMySqlPoolForTests() {
  pool = null;
  connectionFailed = false;
  lastFailureReason = null;
}

export { pool };
