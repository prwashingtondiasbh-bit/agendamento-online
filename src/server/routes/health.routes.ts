import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    name: 'Agenda Beauty API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    timezone: process.env.DEFAULT_TIMEZONE || 'America/Sao_Paulo',
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
