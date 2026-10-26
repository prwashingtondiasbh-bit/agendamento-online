import { Router } from 'express';
import { db } from '../storage.js';
import { professionalSchema } from '../validation/schemas.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const professionals = await db.getProfessionals(tenantId);
    res.json({ success: true, data: professionals });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = professionalSchema.parse(req.body);
    const newProf = await db.createProfessional(tenantId, {
      name: validatedData.name,
      email: validatedData.email || '',
      phone: validatedData.phone || '',
      specialty: validatedData.specialty,
      avatarUrl: validatedData.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      active: validatedData.active ?? true,
    });
    res.status(201).json({ success: true, data: newProf, message: 'Profissional cadastrado com sucesso' });
  } catch (error) {
    next(error);
  }
});

export default router;
