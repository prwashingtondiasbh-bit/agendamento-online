import { Router } from 'express';
import { getPersistenceHealthStatus } from '../db/mysql.js';

const router = Router();

router.get('/', async (_req, res) => {
  const persistence = await getPersistenceHealthStatus();
  const statusCode = persistence.healthy ? 200 : 503;

  res.status(statusCode).json({
    success: persistence.healthy,
    status: persistence.healthy ? 'ok' : 'error',
    service: 'agenda-beauty-api',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    persistence: {
      mode: persistence.mode,
      strictMode: persistence.strictMode,
      connected: persistence.connected,
      sqlModeStrictConfigured: persistence.sqlModeStrictConfigured,
      ...(persistence.reason ? { reason: persistence.reason } : {}),
    },
  });
});

export default router;
