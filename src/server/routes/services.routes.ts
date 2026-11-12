import { Router } from 'express';
import { db } from '../storage.js';
import { serviceSchema } from '../validation/schemas.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const onlyActive = req.query.onlyActive === 'true';
    const services = await db.getServices(tenantId, { onlyActive });
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = serviceSchema.parse(req.body);
    
    const newService = await db.createService(tenantId, validatedData);
    res.status(201).json({ success: true, data: newService, message: 'Serviço cadastrado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const validatedData = serviceSchema.partial().parse(req.body);
    
    const updated = await db.updateService(tenantId, id, validatedData);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado neste estabelecimento' });
    }
    res.json({ success: true, data: updated, message: 'Serviço atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    
    const deactivated = await db.deleteService(tenantId, id);
    if (!deactivated) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado neste estabelecimento' });
    }
    res.json({ success: true, data: deactivated, message: 'Serviço desativado com sucesso' });
  } catch (error) {
    next(error);
  }
});

export default router;
