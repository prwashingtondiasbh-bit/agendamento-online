import { Router } from 'express';
import { db } from '../storage.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();

router.get('/stats', requireStaff, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const periodDays = req.query.periodDays ? Number(req.query.periodDays) : undefined;
    const stats = await db.getDashboardStats(tenantId, { date, periodDays });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

export default router;
