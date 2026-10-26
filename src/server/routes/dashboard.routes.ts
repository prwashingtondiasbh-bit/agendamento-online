import { Router } from 'express';
import { db } from '../storage.js';

const router = Router();

router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const stats = await db.getDashboardStats(tenantId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

export default router;
