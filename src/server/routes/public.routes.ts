import { Router } from 'express';
import { saasService } from '../saasService.js';
import { db } from '../storage.js';
import { customerStorage } from '../customerStorage.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/v1/public/plans
 * Lists active commercial SaaS plans
 */
router.get('/plans', (_req, res) => {
  const plans = saasService.getPlansCatalog();
  res.json({
    success: true,
    data: plans,
  });
});

/**
 * GET /api/v1/public/directory
 * DESATIVADO: A vitrine pública de empresas parceiras foi desativada.
 * O agendamento é feito exclusivamente pelo link individual de cada estabelecimento (/agendar/:slug).
 */
router.get('/directory', (_req, res) => {
  res.status(404).json({
    success: false,
    code: 'DIRECTORY_DISABLED',
    error: 'O diretório público de empresas parceiras foi desativado. Utilize o link exclusivo de agendamento fornecido pelo estabelecimento (/agendar/:slug).',
  });
});

/**
 * GET /api/v1/public/tenants/:slug
 * Resolves a specific establishment by its public slug (or id) for /agendar/:slug
 */
router.get('/tenants/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const resolved = await saasService.resolvePublicEstablishmentBySlugOrId(slug);
    if (!resolved) {
      return res.status(404).json({
        success: false,
        code: 'ESTABLISHMENT_NOT_FOUND',
        error: 'Estabelecimento não encontrado. Verifique o link público informado.',
      });
    }

    res.json({
      success: true,
      data: resolved,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/tenants/:slug/available-slots
 * Returns available time slots for a given establishment slug, serviceId, professionalId, and date
 */
router.get('/tenants/:slug/available-slots', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const resolved = await saasService.resolvePublicEstablishmentBySlugOrId(slug);
    if (!resolved) {
      return res.status(404).json({
        success: false,
        code: 'ESTABLISHMENT_NOT_FOUND',
        error: 'Estabelecimento não encontrado.',
      });
    }

    if (!resolved.bookingAvailable) {
      return res.status(403).json({
        success: false,
        code: 'TENANT_BOOKING_UNAVAILABLE',
        error: resolved.unavailableReason || 'Este estabelecimento não está recebendo agendamentos online no momento.',
      });
    }

    const serviceId = String(req.query.serviceId || '');
    const professionalId = String(req.query.professionalId || '');
    const date = String(req.query.date || '');

    if (!serviceId || !professionalId || !date) {
      return res.status(400).json({
        success: false,
        error: 'Informe serviceId, professionalId e date (YYYY-MM-DD) para consultar horários disponíveis.',
      });
    }

    const availability = await db.getAvailableSlots(resolved.establishment.id, {
      serviceId,
      professionalId,
      date,
    });

    res.json({
      success: true,
      data: availability,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/tenants/:slug/appointments
 * Books an appointment in the establishment identified by :slug using the authenticated user's account
 */
router.post('/tenants/:slug/appointments', authMiddleware, async (req: any, res, next) => {
  try {
    const { slug } = req.params;
    const resolved = await saasService.resolvePublicEstablishmentBySlugOrId(slug);
    if (!resolved) {
      return res.status(404).json({
        success: false,
        code: 'ESTABLISHMENT_NOT_FOUND',
        error: 'Estabelecimento não encontrado.',
      });
    }

    const targetTenantId = resolved.establishment.id;

    // Enforce operational & subscription status
    saasService.assertTenantPublicBookingAllowed(targetTenantId);

    const body = req.body || {};
    if (
      body.priceCents !== undefined ||
      body.totalAmountCents !== undefined ||
      body.totalAmount !== undefined ||
      body.depositAmountCents !== undefined ||
      body.balanceAmountCents !== undefined ||
      body.snapshotPriceCents !== undefined ||
      body.snapshotDepositCents !== undefined ||
      body.snapshotBalanceCents !== undefined ||
      body.snapshotDepositPercent !== undefined ||
      body.status !== undefined ||
      body.paymentStatus !== undefined ||
      body.forceApprovedPayment !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Violação de segurança: o cliente não pode definir preços, valores de sinal, status de pagamento ou status do agendamento.',
      });
    }

    const { professionalId, serviceId, dateTime, date, startTime, time, notes } = body;
    const rawTime = startTime || time;
    let effectiveDateTime = String(dateTime || '').trim();
    if (!effectiveDateTime && date && rawTime) {
      const cleanTime = String(rawTime).trim();
      const timeWithSeconds = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime;
      const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(timeWithSeconds);
      effectiveDateTime = `${date}T${timeWithSeconds}${hasOffset ? '' : '-03:00'}`;
    } else if (
      effectiveDateTime &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(effectiveDateTime)
    ) {
      effectiveDateTime = `${effectiveDateTime.length === 16 ? `${effectiveDateTime}:00` : effectiveDateTime}-03:00`;
    }

    if (!professionalId || !serviceId || !effectiveDateTime) {
      return res.status(400).json({
        success: false,
        error: 'Informe serviço, profissional e data/horário para concluir o agendamento.',
      });
    }

    // Resolve or create the tenant-specific Client record for this authenticated user
    const client = await customerStorage.getClientForCustomerUser(
      targetTenantId,
      req.user.id,
      req.user.email,
      req.user.name,
      req.user.phone
    );

    const newApp = await db.createAppointment(targetTenantId, {
      clientId: client.id,
      professionalId: String(professionalId),
      serviceId: String(serviceId),
      dateTime: String(effectiveDateTime),
      origin: 'ONLINE',
      isCustomerBooking: true,
      notes: notes ? String(notes) : '',
      createdBy: req.user.id,
    });

    const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(
      req.user.id,
      req.user.email
    );

    res.status(201).json({
      success: true,
      data: {
        ...newApp,
        appointment: newApp,
        client,
        linkedEstablishments,
        establishment: {
          id: resolved.establishment.id,
          name: resolved.establishment.name,
          slug: resolved.establishment.slug,
          logoUrl: resolved.establishment.logoUrl,
          phone: resolved.establishment.phone,
          address: resolved.establishment.address,
          requireDeposit: Boolean((resolved.establishment as any).requireDeposit),
        },
      },
      message:
        newApp.status === 'CONFIRMED'
          ? 'Agendamento confirmado com sucesso (sem exigência de sinal antecipado)!'
          : 'Reserva criada com sucesso! Conclua o pagamento do sinal via Pix para confirmar.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/tenants/:slug/link
 * Permanently links an authenticated customer User to the establishment identified by :slug
 * when initiating her relationship on /agendar/:slug
 */
router.post('/tenants/:slug/link', authMiddleware, async (req: any, res, next) => {
  try {
    const { slug } = req.params;
    const resolved = await saasService.resolvePublicEstablishmentBySlugOrId(slug);
    if (!resolved) {
      return res.status(404).json({
        success: false,
        code: 'ESTABLISHMENT_NOT_FOUND',
        error: 'Estabelecimento não encontrado.',
      });
    }

    const targetTenantId = resolved.establishment.id;
    const client = await customerStorage.getClientForCustomerUser(
      targetTenantId,
      req.user.id,
      req.user.email,
      req.user.name,
      req.user.phone
    );

    const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(
      req.user.id,
      req.user.email
    );

    res.status(200).json({
      success: true,
      data: {
        customer: client,
        establishment: resolved.establishment,
        linkedEstablishments,
      },
      message: `Vínculo com ${resolved.establishment.name} confirmado com sucesso.`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
