import { Router } from 'express';
import { db } from '../storage.js';
import { professionalSchema } from '../validation/schemas.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const onlyActive = req.query.onlyActive === 'true';
    const professionals = await db.getProfessionals(tenantId, { onlyActive });
    res.json({ success: true, data: professionals });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = professionalSchema.parse(req.body);
    
    const newProf = await db.createProfessional(tenantId, validatedData);
    res.status(201).json({ success: true, data: newProf, message: 'Profissional cadastrado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const validatedData = professionalSchema.partial().parse(req.body);
    
    const updated = await db.updateProfessional(tenantId, id, validatedData);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Profissional não encontrado neste estabelecimento' });
    }
    res.json({ success: true, data: updated, message: 'Profissional atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const confirmFutureConflicts = req.query.confirmFutureConflicts === 'true' || req.body?.confirmFutureConflicts === true;
    
    const deactivated = await db.deleteProfessional(tenantId, id, { confirmFutureConflicts });
    if (!deactivated) {
      return res.status(404).json({ success: false, error: 'Profissional não encontrado neste estabelecimento' });
    }
    res.json({ success: true, data: deactivated, message: 'Profissional desativado com sucesso' });
  } catch (error) {
    next(error);
  }
});

export default router;
