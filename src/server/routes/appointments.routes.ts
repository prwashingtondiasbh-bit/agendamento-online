import { Router } from 'express';
import { db } from '../storage.js';
import { appointmentSchema } from '../validation/schemas.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const appointments = await db.getAppointments(tenantId);
    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = appointmentSchema.parse(req.body);
    
    const services = await db.getServices(tenantId);
    const service = services.find((s: any) => s.id === validatedData.serviceId);
    if (!service) {
      return res.status(400).json({ success: false, error: 'Serviço selecionado não encontrado nesta empresa' });
    }

    const newApp = await db.createAppointment(tenantId, {
      clientId: validatedData.clientId,
      professionalId: validatedData.professionalId,
      serviceId: validatedData.serviceId,
      dateTime: validatedData.dateTime,
      status: validatedData.status || 'CONFIRMED',
      totalAmount: Number(service.price),
      notes: validatedData.notes || '',
    });

    res.status(201).json({ success: true, data: newApp, message: 'Agendamento criado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const { status } = req.body;
    if (!['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status inválido' });
    }

    const updated = await db.updateAppointmentStatus(tenantId, id, status);
    res.json({ success: true, data: updated, message: 'Status do agendamento atualizado' });
  } catch (error) {
    next(error);
  }
});

export default router;
