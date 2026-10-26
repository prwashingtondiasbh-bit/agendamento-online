import { Router } from 'express';
import { db } from '../storage.js';
import { clientSchema } from '../validation/schemas.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const clients = await db.getClients(tenantId);
    res.json({ success: true, data: clients });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = clientSchema.parse(req.body);
    const newClient = await db.createClient(tenantId, {
      name: validatedData.name,
      phone: validatedData.phone,
      email: validatedData.email || '',
      notes: validatedData.notes || '',
    });
    res.status(201).json({ success: true, data: newClient, message: 'Cliente cadastrado com sucesso' });
  } catch (error) {
    next(error);
  }
});

export default router;
