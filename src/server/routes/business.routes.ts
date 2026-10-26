import { Router } from 'express';
import { db } from '../storage.js';
import { businessSchema } from '../validation/schemas.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const business = await db.getBusiness(tenantId);
    res.json({ success: true, data: business });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = businessSchema.partial().parse(req.body);
    const updated = await db.updateBusiness(tenantId, validatedData);
    res.json({ success: true, data: updated, message: 'Dados da empresa atualizados com sucesso' });
  } catch (error) {
    next(error);
  }
});

export default router;
