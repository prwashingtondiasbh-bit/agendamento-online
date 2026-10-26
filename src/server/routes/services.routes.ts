import { Router } from 'express';
import { db } from '../storage.js';
import { serviceSchema } from '../validation/schemas.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const services = await db.getServices(tenantId);
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = serviceSchema.parse(req.body);
    const newService = await db.createService(tenantId, {
      name: validatedData.name,
      description: validatedData.description || '',
      durationMin: validatedData.durationMin,
      price: validatedData.price,
      category: validatedData.category,
      active: validatedData.active ?? true,
    });
    res.status(201).json({ success: true, data: newService, message: 'Serviço cadastrado com sucesso' });
  } catch (error) {
    next(error);
  }
});

export default router;
