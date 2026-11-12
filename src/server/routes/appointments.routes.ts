import { Router } from 'express';
import { db } from '../storage.js';
import { customerStorage } from '../customerStorage.js';
import { appointmentSchema, timeBlockSchema, updateAppointmentAdminSchema } from '../validation/schemas.js';
import { requireStaff } from '../middleware/auth.js';
import {
  triggerAppointmentCancelled,
  triggerAppointmentConfirmation,
  triggerAppointmentRescheduled,
} from '../whatsapp/whatsappService.js';
import {
  consumeInventoryOnCompletedAppointment,
  releaseReservedCoupon,
  reserveCouponUsage,
  validateLocationBookingEligibility,
} from '../advancedService.js';

const router = Router();

// Check available slots for a service, professional, and date in America/Sao_Paulo
router.get('/available-slots', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const serviceId = String(req.query.serviceId || '');
    const professionalId = String(req.query.professionalId || '');
    const date = String(req.query.date || '');

    if (!serviceId || !professionalId || !date) {
      return res.status(400).json({
        success: false,
        error: 'Informe serviceId, professionalId e date (YYYY-MM-DD) para consultar horários disponíveis.',
      });
    }

    const availability = await db.getAvailableSlots(tenantId, {
      serviceId,
      professionalId,
      date,
    });

    res.json({ success: true, data: availability });
  } catch (error) {
    next(error);
  }
});

// List time blocks for the establishment
router.get('/time-blocks', requireStaff, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role;
    const scopedProfId =
      role === 'PROFESSIONAL' && req.tenantContext?.professionalId
        ? req.tenantContext.professionalId
        : typeof req.query.professionalId === 'string'
        ? req.query.professionalId
        : undefined;

    const blocks = await db.getTimeBlocks(tenantId, { professionalId: scopedProfId });
    res.json({ success: true, data: blocks });
  } catch (error) {
    next(error);
  }
});

// Create a time block (with conflict detection against active appointments)
router.post('/time-blocks', requireStaff, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role;
    const validated = timeBlockSchema.parse(req.body);

    if (role === 'PROFESSIONAL' && req.tenantContext?.professionalId) {
      if (validated.professionalId && validated.professionalId !== req.tenantContext.professionalId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem registrar bloqueios na própria agenda.',
        });
      }
      validated.professionalId = req.tenantContext.professionalId;
    }

    const created = await db.createTimeBlock(tenantId, {
      professionalId: validated.professionalId || null,
      type: validated.type,
      startDate: validated.startDate,
      endDate: validated.endDate,
      reason: validated.reason || null,
      createdBy: req.user?.id || 'staff',
      confirmOverlap: Boolean(validated.confirmOverlap),
    });

    res.status(201).json({
      success: true,
      data: created,
      message: 'Bloqueio de agenda registrado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

// Delete a time block
router.delete('/time-blocks/:id', requireStaff, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const result = await db.deleteTimeBlock(tenantId, id, req.user?.id || null);
    res.json({ success: true, data: result, message: 'Bloqueio de agenda removido com sucesso' });
  } catch (error) {
    next(error);
  }
});

// List appointments (for staff panel; customers must use /api/v1/customer/appointments)
router.get('/', requireStaff, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role;
    let appointments = await db.getAppointments(tenantId);

    // Enforce professional scope if logged in as PROFESSIONAL with bound professionalId
    if (role === 'PROFESSIONAL' && req.tenantContext?.professionalId) {
      appointments = appointments.filter(
        (a: any) => a.professionalId === req.tenantContext?.professionalId
      );
    }

    // Optional query filters (professionalId, serviceId, status, date, startDate, endDate)
    const { professionalId, serviceId, status, date, startDate, endDate } = req.query;
    if (typeof professionalId === 'string' && professionalId && professionalId !== 'ALL') {
      appointments = appointments.filter((a: any) => a.professionalId === professionalId);
    }
    if (typeof serviceId === 'string' && serviceId && serviceId !== 'ALL') {
      appointments = appointments.filter((a: any) => a.serviceId === serviceId);
    }
    if (typeof status === 'string' && status && status !== 'ALL') {
      appointments = appointments.filter((a: any) => a.status === status);
    }
    if (typeof date === 'string' && date) {
      appointments = appointments.filter((a: any) => {
        try {
          return new Date(a.dateTime).toISOString().split('T')[0] === date;
        } catch {
          return false;
        }
      });
    }
    if (typeof startDate === 'string' && startDate) {
      const sMs = new Date(startDate).getTime();
      appointments = appointments.filter((a: any) => new Date(a.dateTime).getTime() >= sMs);
    }
    if (typeof endDate === 'string' && endDate) {
      const eMs = new Date(endDate).getTime();
      appointments = appointments.filter((a: any) => new Date(a.dateTime).getTime() <= eMs);
    }

    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
});

// Create appointment (supports online customer booking & manual staff booking)
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role || 'OWNER';

    // Never allow faking an approved payment or manipulating financial values on appointment creation
    if (
      req.body.paymentStatus === 'APPROVED' ||
      req.body.forceApprovedPayment === true ||
      req.body.depositAmountCents !== undefined ||
      req.body.balanceAmountCents !== undefined ||
      req.body.snapshotPriceCents !== undefined ||
      req.body.snapshotDepositCents !== undefined ||
      req.body.snapshotBalanceCents !== undefined ||
      req.body.snapshotDepositPercent !== undefined ||
      (role === 'CUSTOMER' &&
        (req.body.priceCents !== undefined ||
          req.body.totalAmountCents !== undefined ||
          req.body.totalAmount !== undefined))
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Operação não permitida: valores financeiros, sinal e status de pagamento são calculados exclusivamente pelo servidor.',
      });
    }

    const validatedData = appointmentSchema.parse(req.body);

    if (role === 'PROFESSIONAL' && req.tenantContext?.professionalId) {
      if (validatedData.professionalId !== req.tenantContext.professionalId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem registrar agendamentos para si mesmas.',
        });
      }
    }

    const services = await db.getServices(tenantId);
    const service = services.find((s: any) => s.id === validatedData.serviceId);
    if (!service) {
      return res.status(400).json({ success: false, error: 'Serviço selecionado não encontrado nesta empresa' });
    }
    if (service.active === false) {
      return res.status(400).json({ success: false, error: 'Não é possível agendar um serviço inativo.' });
    }

    const professionals = await db.getProfessionals(tenantId);
    const professional = professionals.find((p: any) => p.id === validatedData.professionalId);
    if (!professional) {
      return res.status(400).json({ success: false, error: 'Profissional selecionada não encontrada nesta empresa' });
    }
    if (professional.active === false) {
      return res.status(400).json({ success: false, error: 'Não é possível agendar com uma profissional inativa.' });
    }

    let resolvedClientId = validatedData.clientId;
    if (role === 'CUSTOMER' && req.user) {
      const customerClient = await customerStorage.getClientForCustomerUser(
        tenantId,
        req.user.id,
        req.user.email,
        req.user.name,
        (req.user as any).phone
      );
      if (customerClient) {
        resolvedClientId = customerClient.id;
      }
    } else {
      const clients = await db.getClients(tenantId);
      const client = clients.find((c: any) => c.id === resolvedClientId);
      if (!client) {
        return res.status(400).json({
          success: false,
          error: 'Cliente selecionada não encontrada neste estabelecimento',
        });
      }
    }

    // Validate Multi-unit eligibility if locationId is specified
    if (req.body.locationId) {
      const locCheck = validateLocationBookingEligibility(
        tenantId,
        String(req.body.locationId),
        validatedData.serviceId,
        validatedData.professionalId
      );
      if (!locCheck.valid) {
        return res.status(400).json({ success: false, error: locCheck.error });
      }
    }

    // Validate and reserve coupon on server if couponCode is provided
    let reservedRedemption: any = null;
    let finalPriceCents = Number(service.priceCents || 0);
    if (req.body.couponCode) {
      try {
        reservedRedemption = await reserveCouponUsage(tenantId, {
          code: String(req.body.couponCode),
          clientId: resolvedClientId,
          serviceId: validatedData.serviceId,
          professionalId: validatedData.professionalId,
          orderAmountCents: finalPriceCents,
        });
        finalPriceCents = reservedRedemption.finalAmountCents;
      } catch (cpnErr: any) {
        return res.status(400).json({
          success: false,
          error: cpnErr?.message || 'Cupom promocional inválido.',
        });
      }
    }

    let newApp: any;
    try {
      newApp = await db.createAppointment(tenantId, {
        clientId: resolvedClientId,
        professionalId: validatedData.professionalId,
        serviceId: validatedData.serviceId,
        dateTime: validatedData.dateTime,
        status: role === 'CUSTOMER' ? undefined : (validatedData.status || 'CONFIRMED'),
        origin: role === 'CUSTOMER' ? 'ONLINE' : (validatedData.origin || 'PRESENCIAL'),
        isCustomerBooking: role === 'CUSTOMER',
        createdBy: req.user?.id || null,
        _serverCalculatedPriceCents: finalPriceCents,
        totalAmount: finalPriceCents / 100,
        notes: validatedData.notes || '',
        allowOutsideHours: Boolean(validatedData.allowOutsideHours),
      });
    } catch (createErr) {
      if (reservedRedemption) {
        releaseReservedCoupon(tenantId, reservedRedemption.id);
      }
      throw createErr;
    }

    if (reservedRedemption && newApp) {
      reservedRedemption.appointmentId = newApp.id;
      newApp.couponCode = reservedRedemption.couponCode;
      newApp.discountCents = reservedRedemption.discountCents;
    }
    if (req.body.locationId && newApp) {
      newApp.locationId = String(req.body.locationId);
    }

    // Non-blocking WhatsApp trigger: only sends confirmation if status is CONFIRMED
    if (newApp && newApp.status === 'CONFIRMED') {
      triggerAppointmentConfirmation(newApp.id).catch(() => {});
    }

    res.status(201).json({ success: true, data: newApp, message: 'Agendamento criado com sucesso' });
  } catch (error) {
    next(error);
  }
});

// Controlled status transitions for existing appointments (Section 12)
router.patch('/:id/status', requireStaff, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role;
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    // Never allow marking payment as APPROVED from the agenda
    if (status === 'APPROVED' || paymentStatus === 'APPROVED') {
      return res.status(400).json({
        success: false,
        error: 'Operação bloqueada: não é permitido aprovar pagamentos manualmente pela agenda.',
      });
    }

    const validStatuses = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status de agendamento inválido' });
    }

    const existing = await db.getAppointmentById(tenantId, id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado neste estabelecimento' });
    }

    if (role === 'PROFESSIONAL' && req.tenantContext?.professionalId) {
      if (existing.professionalId !== req.tenantContext.professionalId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: você só pode atualizar o status dos seus próprios atendimentos.',
        });
      }
    }

    const updated = await db.updateAppointmentStatus(tenantId, id, status, req.user?.id || null);

    // Non-blocking triggers on status transition
    if (status === 'CONFIRMED') {
      triggerAppointmentConfirmation(id).catch(() => {});
    } else if (status === 'CANCELLED') {
      releaseReservedCoupon(tenantId, id);
      triggerAppointmentCancelled(id).catch(() => {});
    } else if (status === 'COMPLETED') {
      consumeInventoryOnCompletedAppointment(tenantId, id, req.user?.id || 'staff').catch(() => {});
    }

    res.json({ success: true, data: updated, message: 'Status do agendamento atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

// Reschedule / change professional / update notes from admin agenda (Section 12)
router.put('/:id', requireStaff, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role;
    const { id } = req.params;

    if (req.body.paymentStatus === 'APPROVED' || req.body.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        error: 'Operação bloqueada: não é permitido alterar status financeiro pela agenda.',
      });
    }

    const existing = await db.getAppointmentById(tenantId, id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado neste estabelecimento' });
    }

    if (role === 'PROFESSIONAL' && req.tenantContext?.professionalId) {
      if (existing.professionalId !== req.tenantContext.professionalId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais não podem alterar agendamentos de outros profissionais.',
        });
      }
      if (req.body.professionalId && req.body.professionalId !== req.tenantContext.professionalId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais não podem transferir agendamentos para outros profissionais.',
        });
      }
    }

    const validated = updateAppointmentAdminSchema.parse(req.body);
    const updated = await db.updateAppointmentDetails(tenantId, id, {
      dateTime: validated.dateTime,
      professionalId: validated.professionalId,
      notes: validated.notes,
      reason: validated.reason,
      updatedBy: req.user?.id || 'staff',
    });

    if (validated.dateTime && validated.dateTime !== existing.dateTime) {
      triggerAppointmentRescheduled(id).catch(() => {});
    }

    res.json({
      success: true,
      data: updated,
      message: 'Agendamento atualizado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
