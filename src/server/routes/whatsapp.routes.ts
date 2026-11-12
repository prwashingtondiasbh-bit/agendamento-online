import { Router, Request, Response } from 'express';
import { hasPermission } from '../middleware/auth.js';
import {
  ensureTenantTemplates,
  getWhatsAppConfigPublic,
  listTenantMessages,
  listTenantReminders,
  processDueScheduledReminders,
  processSingleQueuedMessage,
  processWhatsAppQueueBatch,
  saveWhatsAppConfig,
  sendManualOperationalMessage,
  testAndActivateWhatsAppConnection,
  updateClientCommunicationConsent,
  updateTenantTemplate,
} from '../whatsapp/whatsappService.js';
import { WhatsAppEventType, WhatsAppTemplateStatus } from '../../types/index.js';
import { memoryStore } from '../storage.js';

const router = Router();

/**
 * GET /api/v1/whatsapp/config
 * Returns tenant's WhatsApp Business configuration (never exposes secrets/tokens).
 */
router.get('/config', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:read')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: permissão insuficiente para visualizar a integração WhatsApp.',
    });
  }

  const config = getWhatsAppConfigPublic(ctx.tenantId);
  const templates = ensureTenantTemplates(ctx.tenantId);
  return res.json({
    success: true,
    data: {
      config,
      templates,
      webhookCallbackUrl: `${process.env.API_BASE_URL || 'http://localhost:3000/api/v1'}/webhooks/whatsapp`,
    },
  });
});

/**
 * PUT /api/v1/whatsapp/config
 * Updates tenant's WhatsApp Business configuration (OWNER or MANAGER only).
 */
router.put('/config', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:manage')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: apenas proprietários ou gerentes podem alterar a configuração do WhatsApp.',
    });
  }

  const updated = saveWhatsAppConfig(ctx.tenantId, req.body || {}, req.user?.id || 'admin');
  return res.json({
    success: true,
    data: updated,
  });
});

/**
 * POST /api/v1/whatsapp/config/test
 * Validates credentials against the official Meta Graph API before marking CONNECTED.
 */
router.post('/config/test', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:manage')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: apenas proprietários ou gerentes podem testar a conexão WhatsApp.',
    });
  }

  const result = await testAndActivateWhatsAppConnection(ctx.tenantId, req.user?.id || 'admin');
  if (!result.connected) {
    return res.status(400).json({
      success: false,
      error: result.error,
      data: result.config,
    });
  }

  return res.json({
    success: true,
    data: result.config,
  });
});

/**
 * PUT /api/v1/whatsapp/templates/:eventType
 * Updates a template mapping for an operational or promotional event.
 */
router.put('/templates/:eventType', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:manage')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: apenas proprietários ou gerentes podem configurar templates.',
    });
  }

  try {
    const eventType = req.params.eventType as WhatsAppEventType;
    const { templateName, language, status, bodyPreview, active } = req.body || {};
    const updated = updateTenantTemplate(
      ctx.tenantId,
      eventType,
      {
        templateName,
        language,
        status: status as WhatsAppTemplateStatus | undefined,
        bodyPreview,
        active,
      },
      req.user?.id || 'admin'
    );
    return res.json({
      success: true,
      data: updated,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Erro ao atualizar template.',
    });
  }
});

/**
 * PUT /api/v1/whatsapp/clients/:clientId/consent
 * Updates client phone (E.164 normalized), operational opt-in, and promotional consent / revocation.
 */
router.put('/clients/:clientId/consent', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || (!hasPermission(ctx.role, 'clients:write') && !hasPermission(ctx.role, 'whatsapp:send_manual'))) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado para atualizar consentimento de comunicação.',
    });
  }

  try {
    const updated = updateClientCommunicationConsent(
      ctx.tenantId,
      req.params.clientId,
      req.body || {},
      req.user?.id || 'staff'
    );
    return res.json({
      success: true,
      data: updated,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Erro ao atualizar consentimento.',
    });
  }
});

/**
 * GET /api/v1/whatsapp/clients-consent
 * Lists clients of the authenticated tenant with their phone & consent status.
 */
router.get('/clients-consent', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:read')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado.',
    });
  }

  const clients = memoryStore.clients
    .filter((c: any) => c.tenantId === ctx.tenantId && c.active !== false)
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      normalizedPhone: c.normalizedPhone || null,
      whatsappOptIn: c.whatsappOptIn !== false,
      promotionalConsent: Boolean(c.promotionalConsent) && !c.promotionalConsentRevokedAt,
      promotionalConsentAt: c.promotionalConsentAt || null,
      promotionalConsentSource: c.promotionalConsentSource || null,
      promotionalConsentRevokedAt: c.promotionalConsentRevokedAt || null,
    }));

  return res.json({
    success: true,
    data: clients,
  });
});

/**
 * GET /api/v1/whatsapp/messages
 * Lists WhatsApp message queue & history strictly isolated by tenant.
 */
router.get('/messages', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:read')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado ao histórico de mensagens do WhatsApp.',
    });
  }

  const messages = listTenantMessages(ctx.tenantId, {
    status: req.query.status ? String(req.query.status) : undefined,
    eventType: req.query.eventType ? String(req.query.eventType) : undefined,
    clientId: req.query.clientId ? String(req.query.clientId) : undefined,
    appointmentId: req.query.appointmentId ? String(req.query.appointmentId) : undefined,
  });

  const reminders = listTenantReminders(
    ctx.tenantId,
    req.query.appointmentId ? String(req.query.appointmentId) : undefined
  );

  return res.json({
    success: true,
    data: {
      messages,
      reminders,
    },
  });
});

/**
 * POST /api/v1/whatsapp/send-manual
 * Sends an operational WhatsApp message to an existing client of the tenant.
 */
router.post('/send-manual', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:send_manual')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: seu perfil não possui permissão para enviar mensagens manuais.',
    });
  }

  const { clientId, appointmentId, customOperationalNote, useFreeText } = req.body || {};
  const result = await sendManualOperationalMessage({
    tenantId: ctx.tenantId,
    clientId: String(clientId || ''),
    appointmentId: appointmentId ? String(appointmentId) : null,
    customOperationalNote: String(customOperationalNote || ''),
    useFreeText: Boolean(useFreeText),
    requestedBy: req.user?.id || 'staff',
  });

  if (!result.enqueued && !result.duplicateBlocked) {
    return res.status(400).json({
      success: false,
      errorCode: result.errorCode,
      error: result.errorMessage,
    });
  }

  return res.json({
    success: true,
    duplicateBlocked: Boolean(result.duplicateBlocked),
    data: result.message,
  });
});

/**
 * POST /api/v1/whatsapp/messages/:messageId/retry
 * Manually retries a failed message in the tenant's queue.
 */
router.post('/messages/:messageId/retry', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:send_manual')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado.',
    });
  }

  const msg = memoryStore.whatsappMessages.find(
    (m: any) => m.id === req.params.messageId && m.tenantId === ctx.tenantId
  );
  if (!msg) {
    return res.status(404).json({
      success: false,
      error: 'Mensagem não encontrada neste estabelecimento.',
    });
  }

  msg.status = 'PENDING';
  msg.isPermanentError = false;
  msg.attempts = 0;
  msg.lockedAt = null;
  const updated = await processSingleQueuedMessage(msg.id);

  return res.json({
    success: true,
    data: updated,
  });
});

/**
 * POST /api/v1/whatsapp/worker/run
 * Processes due reminders and pending queue messages for the tenant.
 */
router.post('/worker/run', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'whatsapp:manage')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado.',
    });
  }

  const remindersResult = await processDueScheduledReminders(ctx.tenantId);
  const queueResult = await processWhatsAppQueueBatch(ctx.tenantId);

  return res.json({
    success: true,
    data: {
      reminders: remindersResult,
      queue: queueResult,
    },
  });
});

export default router;
