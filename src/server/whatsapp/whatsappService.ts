import crypto from 'crypto';
import { memoryStore } from '../storage.js';
import {
  defaultWhatsAppProvider,
  WhatsAppProvider,
  ProviderCredentials,
} from './WhatsAppProvider.js';
import {
  WhatsAppConfigPublic,
  WhatsAppEventType,
  WhatsAppIntegrationStatus,
  WhatsAppMessageItem,
  WhatsAppMessageStatus,
  WhatsAppScheduledReminderItem,
  WhatsAppTemplateItem,
  WhatsAppTemplateStatus,
} from '../../types/index.js';

let activeProvider: WhatsAppProvider = defaultWhatsAppProvider;

export function setWhatsAppProvider(provider: WhatsAppProvider) {
  activeProvider = provider;
}

export function getWhatsAppProvider(): WhatsAppProvider {
  return activeProvider;
}

const ENCRYPTION_SECRET =
  process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY ||
  'agenda-beauty-etapa10-default-encryption-key-32b';

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();
}

export function encryptSecret(plainText?: string | null): string | null {
  if (!plainText || !plainText.trim()) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText.trim(), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(cipherText?: string | null): string | null {
  if (!cipherText) return null;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export interface NormalizedPhoneResult {
  valid: boolean;
  normalizedPhone: string | null;
  digitsOnly: string | null;
  error?: string;
}

/**
 * Normalizes a phone number into E.164 format (+5511999999999).
 * Rejects numbers with invalid length or missing area code.
 */
export function normalizeWhatsAppPhone(rawPhone?: string | null): NormalizedPhoneResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      valid: false,
      normalizedPhone: null,
      digitsOnly: null,
      error: 'Número de telefone não informado.',
    };
  }

  const trimmed = rawPhone.trim();
  const hasExplicitPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    return {
      valid: false,
      normalizedPhone: null,
      digitsOnly: null,
      error: 'Número de telefone não contém dígitos válidos.',
    };
  }

  // Strip leading 00 if international prefix
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // If Brazilian local number (DDD + 8 or 9 digits = 10 or 11 digits) without country code
  if (!hasExplicitPlus && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  // Validate E.164 length (between 11 and 15 digits, e.g., 55 + 2-digit DDD + 8/9 digits = 12/13 digits)
  if (digits.length < 11 || digits.length > 15) {
    return {
      valid: false,
      normalizedPhone: null,
      digitsOnly: null,
      error: `Número de telefone inválido (${rawPhone}). Informe DDI + DDD + número (ex.: +55 11 99999-9999).`,
    };
  }

  // If Brazil (+55), require 12 or 13 digits and valid DDD (11..99)
  if (digits.startsWith('55')) {
    if (digits.length !== 12 && digits.length !== 13) {
      return {
        valid: false,
        normalizedPhone: null,
        digitsOnly: null,
        error: 'Número brasileiro inválido. Deve conter DDD (2 dígitos) + 8 ou 9 dígitos.',
      };
    }
    const ddd = Number(digits.slice(2, 4));
    if (ddd < 11 || ddd > 99) {
      return {
        valid: false,
        normalizedPhone: null,
        digitsOnly: null,
        error: 'DDD brasileiro inválido.',
      };
    }
  }

  return {
    valid: true,
    normalizedPhone: `+${digits}`,
    digitsOnly: digits,
  };
}

export const DEFAULT_TEMPLATES_SPEC: Array<{
  eventType: WhatsAppEventType;
  templateName: string;
  language: string;
  category: 'UTILITY' | 'MARKETING';
  bodyPreview: string;
  variablesSchema: string[];
}> = [
  {
    eventType: 'APPOINTMENT_CONFIRMATION',
    templateName: 'agenda_beauty_confirmacao_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview:
      'Olá, {{1}}! Seu agendamento no {{2}} para o serviço {{3}} com {{4}} foi confirmado para {{5}} às {{6}}. Código: {{7}}.',
    variablesSchema: [
      'clientName',
      'establishmentName',
      'serviceName',
      'professionalName',
      'dateFormatted',
      'timeFormatted',
      'appointmentCode',
    ],
  },
  {
    eventType: 'APPOINTMENT_REMINDER',
    templateName: 'agenda_beauty_lembrete_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview:
      'Olá, {{1}}! Lembrete do seu atendimento no {{2}}: {{3}} com {{4}} em {{5}} às {{6}}. Endereço/ orientações: {{7}}.',
    variablesSchema: [
      'clientName',
      'establishmentName',
      'serviceName',
      'professionalName',
      'dateFormatted',
      'timeFormatted',
      'addressOrInstructions',
    ],
  },
  {
    eventType: 'APPOINTMENT_RESCHEDULED',
    templateName: 'agenda_beauty_reagendamento_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview:
      'Olá, {{1}}! Seu atendimento de {{2}} no {{3}} foi reagendado para {{4}} às {{5}} com {{6}}.',
    variablesSchema: [
      'clientName',
      'serviceName',
      'establishmentName',
      'newDateFormatted',
      'newTimeFormatted',
      'professionalName',
    ],
  },
  {
    eventType: 'CANCELLATION_CONFIRMED',
    templateName: 'agenda_beauty_cancelamento_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview:
      'Olá, {{1}}. Confirmamos o cancelamento do agendamento de {{2}} ({{3}} às {{4}}) no {{5}}. Protocolo: {{6}}.',
    variablesSchema: [
      'clientName',
      'serviceName',
      'dateFormatted',
      'timeFormatted',
      'establishmentName',
      'referenceCode',
    ],
  },
  {
    eventType: 'CANCELLATION_REQUEST_UPDATED',
    templateName: 'agenda_beauty_solicitacao_cancelamento_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview:
      'Olá, {{1}}. Sua solicitação de cancelamento (protocolo {{2}}) no {{3}} foi atualizada para: {{4}}. Observação: {{5}}.',
    variablesSchema: [
      'clientName',
      'referenceCode',
      'establishmentName',
      'decisionStatus',
      'note',
    ],
  },
  {
    eventType: 'PAYMENT_UPDATED',
    templateName: 'agenda_beauty_pagamento_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview:
      'Olá, {{1}}! Confirmamos o recebimento do pagamento de {{2}} referente ao serviço {{3}} no {{4}}.',
    variablesSchema: ['clientName', 'amountFormatted', 'serviceName', 'establishmentName'],
  },
  {
    eventType: 'REFUND_UPDATED',
    templateName: 'agenda_beauty_reembolso_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview:
      'Olá, {{1}}. O status do seu reembolso no valor de {{2}} referente ao atendimento no {{3}} foi atualizado para: {{4}}.',
    variablesSchema: ['clientName', 'amountFormatted', 'establishmentName', 'refundStatus'],
  },
  {
    eventType: 'MANUAL_OPERATIONAL',
    templateName: 'agenda_beauty_aviso_operacional_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    bodyPreview: 'Olá, {{1}}! Comunicado importante do {{2}} sobre seu atendimento: {{3}}.',
    variablesSchema: ['clientName', 'establishmentName', 'customOperationalNote'],
  },
  {
    eventType: 'PROMOTIONAL_CAMPAIGN',
    templateName: 'agenda_beauty_Novidades_mkt_v1',
    language: 'pt_BR',
    category: 'MARKETING',
    bodyPreview: 'Olá, {{1}}! Condição especial para você no {{2}}: {{3}}.',
    variablesSchema: ['clientName', 'establishmentName', 'offerDescription'],
  },
];

export function renderTemplatePreview(bodyPreview: string, variables: string[]): string {
  let output = bodyPreview || '';
  variables.forEach((val, idx) => {
    const placeholder = `{{${idx + 1}}}`;
    output = output.split(placeholder).join(String(val ?? ''));
  });
  return output;
}

function ensureTenantConfigRecord(tenantId: string): any {
  let cfg = memoryStore.whatsappConfigs.find((c: any) => c.tenantId === tenantId);
  if (!cfg) {
    const tenant = memoryStore.tenants.find((t: any) => t.id === tenantId);
    const now = new Date().toISOString();
    cfg = {
      id: `wacfg-${tenantId}`,
      tenantId,
      provider: 'META_CLOUD_API',
      status: 'PENDING_CREDENTIALS' as WhatsAppIntegrationStatus,
      displayName: tenant?.name || 'Estabelecimento Agenda Beauty',
      businessPhone: tenant?.phone || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
      encryptedAccessToken: process.env.WHATSAPP_ACCESS_TOKEN
        ? encryptSecret(process.env.WHATSAPP_ACCESS_TOKEN)
        : null,
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null,
      encryptedAppSecret: process.env.WHATSAPP_APP_SECRET
        ? encryptSecret(process.env.WHATSAPP_APP_SECRET)
        : null,
      enableBookingConfirmation: true,
      enableReminders: true,
      enableRescheduleAlerts: true,
      enableCancellationAlerts: true,
      enablePaymentAlerts: true,
      enableRefundAlerts: true,
      reminder24hEnabled: true,
      reminder3hEnabled: true,
      customReminderHours: null,
      customReminderEnabled: false,
      allowedWindowStart: '08:00',
      allowedWindowEnd: '20:00',
      lastTestedAt: null,
      lastError: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.whatsappConfigs.push(cfg);
  }
  return cfg;
}

export function ensureTenantTemplates(tenantId: string): WhatsAppTemplateItem[] {
  const existing = memoryStore.whatsappTemplates.filter((t: any) => t.tenantId === tenantId);
  if (existing.length === 0) {
    const now = new Date().toISOString();
    for (const spec of DEFAULT_TEMPLATES_SPEC) {
      memoryStore.whatsappTemplates.push({
        id: `watpl-${tenantId}-${spec.eventType.toLowerCase()}`,
        tenantId,
        eventType: spec.eventType,
        templateName: spec.templateName,
        language: spec.language,
        category: spec.category,
        status: 'APPROVED' as WhatsAppTemplateStatus,
        bodyPreview: spec.bodyPreview,
        variablesSchema: spec.variablesSchema,
        active: true,
        updatedBy: 'system',
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return memoryStore.whatsappTemplates.filter((t: any) => t.tenantId === tenantId);
}

/**
 * Returns the public configuration for a tenant.
 * NEVER returns access tokens, verify tokens, or app secrets!
 */
export function getWhatsAppConfigPublic(tenantId: string): WhatsAppConfigPublic {
  const cfg = ensureTenantConfigRecord(tenantId);
  return {
    id: cfg.id,
    tenantId: cfg.tenantId,
    provider: cfg.provider,
    status: cfg.status,
    displayName: cfg.displayName || '',
    businessPhone: cfg.businessPhone || '',
    phoneNumberId: cfg.phoneNumberId || '',
    wabaId: cfg.wabaId || '',
    hasAccessTokenConfigured: Boolean(cfg.encryptedAccessToken),
    hasWebhookVerifyTokenConfigured: Boolean(cfg.webhookVerifyToken),
    hasAppSecretConfigured: Boolean(cfg.encryptedAppSecret),
    enableBookingConfirmation: Boolean(cfg.enableBookingConfirmation),
    enableReminders: Boolean(cfg.enableReminders),
    enableRescheduleAlerts: Boolean(cfg.enableRescheduleAlerts),
    enableCancellationAlerts: Boolean(cfg.enableCancellationAlerts),
    enablePaymentAlerts: Boolean(cfg.enablePaymentAlerts),
    enableRefundAlerts: Boolean(cfg.enableRefundAlerts),
    reminder24hEnabled: Boolean(cfg.reminder24hEnabled),
    reminder3hEnabled: Boolean(cfg.reminder3hEnabled),
    customReminderHours: cfg.customReminderHours ?? null,
    customReminderEnabled: Boolean(cfg.customReminderEnabled),
    allowedWindowStart: cfg.allowedWindowStart || '08:00',
    allowedWindowEnd: cfg.allowedWindowEnd || '20:00',
    lastTestedAt: cfg.lastTestedAt || null,
    lastError: cfg.lastError || null,
    updatedBy: cfg.updatedBy || null,
    updatedAt: cfg.updatedAt,
  };
}

export interface UpdateWhatsAppConfigInput {
  displayName?: string;
  businessPhone?: string;
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
  enableBookingConfirmation?: boolean;
  enableReminders?: boolean;
  enableRescheduleAlerts?: boolean;
  enableCancellationAlerts?: boolean;
  enablePaymentAlerts?: boolean;
  enablePaymentUpdated?: boolean;
  enableRefundAlerts?: boolean;
  reminder24hEnabled?: boolean;
  reminder3hEnabled?: boolean;
  customReminderHours?: number | null;
  customReminderEnabled?: boolean;
  allowedWindowStart?: string;
  allowedWindowEnd?: boolean | string;
  disconnect?: boolean;
}

export function saveWhatsAppConfig(
  tenantId: string,
  input: UpdateWhatsAppConfigInput,
  actorUserId: string
): WhatsAppConfigPublic {
  const cfg = ensureTenantConfigRecord(tenantId);
  const now = new Date().toISOString();

  if (input.disconnect) {
    cfg.status = 'DISCONNECTED';
    cfg.encryptedAccessToken = null;
    cfg.lastError = null;
    cfg.updatedBy = actorUserId;
    cfg.updatedAt = now;
    memoryStore.auditLogs.push({
      id: `audit-wa-${Date.now()}`,
      tenantId,
      userId: actorUserId,
      action: 'WHATSAPP_DISCONNECTED',
      details: { status: 'DISCONNECTED' },
      createdAt: now,
    });
    return getWhatsAppConfigPublic(tenantId);
  }

  let credentialsModified = false;
  if (input.displayName !== undefined) cfg.displayName = input.displayName.trim();
  if (input.businessPhone !== undefined) cfg.businessPhone = input.businessPhone.trim();
  if (input.phoneNumberId !== undefined && input.phoneNumberId.trim() !== cfg.phoneNumberId) {
    cfg.phoneNumberId = input.phoneNumberId.trim();
    credentialsModified = true;
  }
  if (input.wabaId !== undefined) cfg.wabaId = input.wabaId.trim();

  if (input.accessToken !== undefined && input.accessToken.trim() !== '') {
    cfg.encryptedAccessToken = encryptSecret(input.accessToken.trim());
    credentialsModified = true;
  }
  if (input.webhookVerifyToken !== undefined && input.webhookVerifyToken.trim() !== '') {
    cfg.webhookVerifyToken = input.webhookVerifyToken.trim();
  }
  if (input.appSecret !== undefined && input.appSecret.trim() !== '') {
    cfg.encryptedAppSecret = encryptSecret(input.appSecret.trim());
  }

  if (input.enableBookingConfirmation !== undefined) {
    cfg.enableBookingConfirmation = Boolean(input.enableBookingConfirmation);
  }
  if (input.enableReminders !== undefined) {
    cfg.enableReminders = Boolean(input.enableReminders);
  }
  if (input.enableRescheduleAlerts !== undefined) {
    cfg.enableRescheduleAlerts = Boolean(input.enableRescheduleAlerts);
  }
  if (input.enableCancellationAlerts !== undefined) {
    cfg.enableCancellationAlerts = Boolean(input.enableCancellationAlerts);
  }
  if (input.enablePaymentAlerts !== undefined) {
    cfg.enablePaymentAlerts = Boolean(input.enablePaymentAlerts);
  }
  if (input.enableRefundAlerts !== undefined) {
    cfg.enableRefundAlerts = Boolean(input.enableRefundAlerts);
  }
  if (input.reminder24hEnabled !== undefined) {
    cfg.reminder24hEnabled = Boolean(input.reminder24hEnabled);
  }
  if (input.reminder3hEnabled !== undefined) {
    cfg.reminder3hEnabled = Boolean(input.reminder3hEnabled);
  }
  if (input.customReminderHours !== undefined) {
    cfg.customReminderHours =
      input.customReminderHours && Number(input.customReminderHours) > 0
        ? Math.floor(Number(input.customReminderHours))
        : null;
  }
  if (input.customReminderEnabled !== undefined) {
    cfg.customReminderEnabled = Boolean(input.customReminderEnabled);
  }
  if (typeof input.allowedWindowStart === 'string' && /^\d{2}:\d{2}$/.test(input.allowedWindowStart)) {
    cfg.allowedWindowStart = input.allowedWindowStart;
  }
  if (typeof input.allowedWindowEnd === 'string' && /^\d{2}:\d{2}$/.test(input.allowedWindowEnd)) {
    cfg.allowedWindowEnd = input.allowedWindowEnd;
  }

  // Rule: Never mark integration as CONNECTED without verifying credentials with the provider!
  if (credentialsModified) {
    cfg.status = 'PENDING_CREDENTIALS';
    cfg.lastError = null;
  } else if (!cfg.phoneNumberId || !cfg.encryptedAccessToken) {
    if (cfg.status !== 'DISCONNECTED') {
      cfg.status = 'PENDING_CREDENTIALS';
    }
  }

  cfg.updatedBy = actorUserId;
  cfg.updatedAt = now;

  memoryStore.auditLogs.push({
    id: `audit-wa-cfg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    userId: actorUserId,
    action: 'WHATSAPP_CONFIG_UPDATED',
    details: {
      phoneNumberId: cfg.phoneNumberId,
      wabaId: cfg.wabaId,
      status: cfg.status,
      hasAccessToken: Boolean(cfg.encryptedAccessToken),
    },
    createdAt: now,
  });

  return getWhatsAppConfigPublic(tenantId);
}

/**
 * Explicitly activates/validates the connection against the Meta Cloud API.
 * Only marks CONNECTED if the provider confirms the credentials and phoneNumberId.
 */
export async function testAndActivateWhatsAppConnection(
  tenantId: string,
  actorUserId: string
): Promise<{
  connected: boolean;
  config: WhatsAppConfigPublic;
  error?: string;
}> {
  const cfg = ensureTenantConfigRecord(tenantId);
  const accessToken = decryptSecret(cfg.encryptedAccessToken) || '';
  const phoneNumberId = cfg.phoneNumberId || '';
  const now = new Date().toISOString();

  if (!phoneNumberId || !accessToken) {
    cfg.status = 'PENDING_CREDENTIALS';
    cfg.lastTestedAt = now;
    cfg.lastError =
      'Credenciais pendentes: configure o Phone Number ID e o Access Token permanente da Meta Cloud API.';
    cfg.updatedBy = actorUserId;
    cfg.updatedAt = now;
    return {
      connected: false,
      config: getWhatsAppConfigPublic(tenantId),
      error: cfg.lastError,
    };
  }

  const check = await activeProvider.verifyConnection({
    phoneNumberId,
    wabaId: cfg.wabaId,
    accessToken,
  });

  cfg.lastTestedAt = now;
  cfg.updatedBy = actorUserId;
  cfg.updatedAt = now;

  if (check.connected) {
    cfg.status = 'CONNECTED';
    cfg.lastError = null;
    if (check.displayPhoneNumber) {
      cfg.businessPhone = check.displayPhoneNumber;
    }
    if (check.verifiedName && !cfg.displayName) {
      cfg.displayName = check.verifiedName;
    }
    return {
      connected: true,
      config: getWhatsAppConfigPublic(tenantId),
    };
  } else {
    cfg.status = 'ERROR';
    cfg.lastError = check.errorMessage || 'Falha ao validar credenciais na Meta WhatsApp Cloud API.';
    return {
      connected: false,
      config: getWhatsAppConfigPublic(tenantId),
      error: cfg.lastError,
    };
  }
}

export function getTenantCredentials(tenantId: string): ProviderCredentials | null {
  const cfg = ensureTenantConfigRecord(tenantId);
  const accessToken = decryptSecret(cfg.encryptedAccessToken);
  if (!cfg.phoneNumberId || !accessToken) {
    return null;
  }
  return {
    phoneNumberId: cfg.phoneNumberId,
    wabaId: cfg.wabaId || undefined,
    accessToken,
  };
}

export function updateTenantTemplate(
  tenantId: string,
  eventType: WhatsAppEventType,
  input: {
    templateName?: string;
    language?: string;
    status?: WhatsAppTemplateStatus;
    bodyPreview?: string;
    active?: boolean;
  },
  actorUserId: string
): WhatsAppTemplateItem {
  ensureTenantTemplates(tenantId);
  const tpl = memoryStore.whatsappTemplates.find(
    (t: any) => t.tenantId === tenantId && t.eventType === eventType
  );
  if (!tpl) {
    throw new Error(`Template para o evento ${eventType} não encontrado.`);
  }

  if (input.templateName !== undefined && input.templateName.trim()) {
    tpl.templateName = input.templateName.trim();
  }
  if (input.language !== undefined && input.language.trim()) {
    tpl.language = input.language.trim();
  }
  if (input.status !== undefined) {
    tpl.status = input.status;
  }
  if (input.bodyPreview !== undefined && input.bodyPreview.trim()) {
    tpl.bodyPreview = input.bodyPreview.trim();
  }
  if (input.active !== undefined) {
    tpl.active = Boolean(input.active);
  }
  tpl.updatedBy = actorUserId;
  tpl.updatedAt = new Date().toISOString();

  return tpl;
}

// ==========================================
// CONSENTIMENTO E TELEFONE DE CLIENTES
// ==========================================

export interface ClientCommunicationConsentInput {
  phone?: string;
  whatsappOptIn?: boolean;
  promotionalConsent?: boolean;
  promotionalConsentSource?: string;
  revokePromotionalConsent?: boolean;
}

export function updateClientCommunicationConsent(
  tenantId: string,
  clientId: string,
  input: ClientCommunicationConsentInput,
  actorId: string
) {
  const client = memoryStore.clients.find(
    (c: any) => c.id === clientId && c.tenantId === tenantId
  );
  if (!client) {
    throw new Error('Cliente não encontrada neste estabelecimento.');
  }

  const now = new Date().toISOString();

  if (input.phone !== undefined) {
    const norm = normalizeWhatsAppPhone(input.phone);
    if (!norm.valid || !norm.normalizedPhone) {
      throw new Error(norm.error || 'Número de telefone inválido.');
    }
    client.phone = input.phone.trim();
    client.normalizedPhone = norm.normalizedPhone;
    // Rule: Providing a phone number NEVER automatically grants promotional consent!
    if (client.promotionalConsent === undefined) {
      client.promotionalConsent = false;
    }
  } else if (!client.normalizedPhone && client.phone) {
    const norm = normalizeWhatsAppPhone(client.phone);
    if (norm.valid) {
      client.normalizedPhone = norm.normalizedPhone;
    }
  }

  if (input.whatsappOptIn !== undefined) {
    client.whatsappOptIn = Boolean(input.whatsappOptIn);
  }

  if (input.revokePromotionalConsent || input.promotionalConsent === false) {
    client.promotionalConsent = false;
    client.promotionalConsentRevokedAt = now;
  } else if (input.promotionalConsent === true) {
    client.promotionalConsent = true;
    client.promotionalConsentAt = now;
    client.promotionalConsentSource = input.promotionalConsentSource || 'ADMIN_PANEL';
    client.promotionalConsentRevokedAt = null;
  }

  client.updatedAt = now;

  memoryStore.auditLogs.push({
    id: `audit-consent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    userId: actorId,
    action: 'CLIENT_COMMUNICATION_CONSENT_UPDATED',
    details: {
      clientId,
      normalizedPhone: client.normalizedPhone,
      whatsappOptIn: client.whatsappOptIn,
      promotionalConsent: client.promotionalConsent,
      promotionalConsentRevokedAt: client.promotionalConsentRevokedAt,
    },
    createdAt: now,
  });

  return {
    clientId: client.id,
    name: client.name,
    phone: client.phone,
    normalizedPhone: client.normalizedPhone || null,
    whatsappOptIn: client.whatsappOptIn !== false,
    promotionalConsent: Boolean(client.promotionalConsent),
    promotionalConsentAt: client.promotionalConsentAt || null,
    promotionalConsentSource: client.promotionalConsentSource || null,
    promotionalConsentRevokedAt: client.promotionalConsentRevokedAt || null,
  };
}

// ==========================================
// FILA PERSISTENTE E ENVIO COM IDEMPOTÊNCIA
// ==========================================

export interface EnqueueMessageOptions {
  tenantId: string;
  clientId?: string | null;
  appointmentId?: string | null;
  referenceId: string;
  eventType: WhatsAppEventType;
  messageCategory?: 'OPERATIONAL' | 'PROMOTIONAL';
  recipientPhone?: string;
  variables?: string[];
  freeTextBody?: string; // Only allowed for MANUAL_OPERATIONAL if 24h window open
  requestedBy?: string;
  idempotencyKeyOverride?: string;
  processImmediately?: boolean;
}

export interface EnqueueResult {
  enqueued: boolean;
  duplicateBlocked?: boolean;
  message?: WhatsAppMessageItem;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Checks whether the client has sent an inbound WhatsApp message to this tenant within the last 24 hours.
 */
export function hasActive24hCustomerServiceWindow(tenantId: string, normalizedPhone: string): boolean {
  const digits = normalizedPhone.replace(/\D/g, '');
  const cutoff = Date.now() - 24 * 3600 * 1000;
  return memoryStore.whatsappWebhookEvents.some((ev: any) => {
    if (ev.tenantId !== tenantId || ev.eventStatus !== 'INBOUND_MESSAGE') return false;
    const senderDigits = String(ev.payload?.senderPhone || '').replace(/\D/g, '');
    const ts = new Date(ev.processedAt).getTime();
    return senderDigits === digits && ts >= cutoff;
  });
}

export async function enqueueWhatsAppMessage(
  options: EnqueueMessageOptions
): Promise<EnqueueResult> {
  const {
    tenantId,
    clientId,
    appointmentId,
    referenceId,
    eventType,
    requestedBy,
    processImmediately = true,
  } = options;

  const cfg = ensureTenantConfigRecord(tenantId);
  ensureTenantTemplates(tenantId);

  // Determine category
  const category: 'OPERATIONAL' | 'PROMOTIONAL' =
    options.messageCategory ||
    (eventType === 'PROMOTIONAL_CAMPAIGN' ? 'PROMOTIONAL' : 'OPERATIONAL');

  // Check tenant event toggle
  if (eventType === 'APPOINTMENT_CONFIRMATION' && !cfg.enableBookingConfirmation) {
    return {
      enqueued: false,
      errorCode: 'EVENT_DISABLED',
      errorMessage: 'O envio automático de confirmação de agendamento está desativado pelo estabelecimento.',
    };
  }
  if (eventType === 'APPOINTMENT_REMINDER' && !cfg.enableReminders) {
    return {
      enqueued: false,
      errorCode: 'EVENT_DISABLED',
      errorMessage: 'O envio automático de lembretes está desativado pelo estabelecimento.',
    };
  }
  if (eventType === 'APPOINTMENT_RESCHEDULED' && !cfg.enableRescheduleAlerts) {
    return {
      enqueued: false,
      errorCode: 'EVENT_DISABLED',
      errorMessage: 'O aviso de reagendamento está desativado pelo estabelecimento.',
    };
  }
  if (
    (eventType === 'CANCELLATION_CONFIRMED' || eventType === 'CANCELLATION_REQUEST_UPDATED') &&
    !cfg.enableCancellationAlerts
  ) {
    return {
      enqueued: false,
      errorCode: 'EVENT_DISABLED',
      errorMessage: 'Os avisos de cancelamento estão desativados pelo estabelecimento.',
    };
  }
  if (eventType === 'PAYMENT_UPDATED' && !cfg.enablePaymentAlerts) {
    return {
      enqueued: false,
      errorCode: 'EVENT_DISABLED',
      errorMessage: 'Os avisos de pagamento estão desativados pelo estabelecimento.',
    };
  }
  if (eventType === 'REFUND_UPDATED' && !cfg.enableRefundAlerts) {
    return {
      enqueued: false,
      errorCode: 'EVENT_DISABLED',
      errorMessage: 'Os avisos de reembolso estão desativados pelo estabelecimento.',
    };
  }

  // Resolve client & consent
  let client: any = null;
  if (clientId) {
    client = memoryStore.clients.find((c: any) => c.id === clientId && c.tenantId === tenantId);
    if (!client) {
      return {
        enqueued: false,
        errorCode: 'CLIENT_NOT_FOUND_OR_CROSS_TENANT',
        errorMessage: 'Cliente não pertence ao estabelecimento autenticado.',
      };
    }
  }

  // Enforce consent rules!
  if (client) {
    if (category === 'PROMOTIONAL') {
      const hasPromoConsent =
        Boolean(client.promotionalConsent) && !client.promotionalConsentRevokedAt;
      if (!hasPromoConsent) {
        return {
          enqueued: false,
          errorCode: 'PROMOTIONAL_CONSENT_REQUIRED',
          errorMessage:
            'Envio promocional bloqueado: a cliente não concedeu consentimento promocional específico ou revogou a autorização.',
        };
      }
    } else {
      // Operational message
      if (client.whatsappOptIn === false) {
        return {
          enqueued: false,
          errorCode: 'OPERATIONAL_OPT_OUT',
          errorMessage: 'A cliente optou por não receber comunicações via WhatsApp.',
        };
      }
    }
  }

  const rawPhone = options.recipientPhone || client?.normalizedPhone || client?.phone || '';
  const phoneNorm = normalizeWhatsAppPhone(rawPhone);
  if (!phoneNorm.valid || !phoneNorm.normalizedPhone) {
    return {
      enqueued: false,
      errorCode: 'INVALID_PHONE_NUMBER',
      errorMessage: phoneNorm.error || 'Número de WhatsApp da cliente é inválido.',
    };
  }

  if (client && !client.normalizedPhone) {
    client.normalizedPhone = phoneNorm.normalizedPhone;
  }

  // Check template vs 24h free text window
  const tpl = memoryStore.whatsappTemplates.find(
    (t: any) => t.tenantId === tenantId && t.eventType === eventType
  );

  let templateName: string | null = null;
  let templateLanguage: string | null = 'pt_BR';
  let renderedBody = '';
  const variables = options.variables || [];

  if (options.freeTextBody) {
    // Free text requires active 24h window
    if (!hasActive24hCustomerServiceWindow(tenantId, phoneNorm.normalizedPhone)) {
      return {
        enqueued: false,
        errorCode: 'OUTSIDE_24H_WINDOW_TEMPLATE_REQUIRED',
        errorMessage:
          'Fora da janela de atendimento de 24h da Meta: é obrigatório utilizar um template aprovado.',
      };
    }
    renderedBody = options.freeTextBody.trim();
  } else {
    if (!tpl || !tpl.active) {
      return {
        enqueued: false,
        errorCode: 'TEMPLATE_NOT_CONFIGURED',
        errorMessage: `Nenhum template ativo configurado para o evento ${eventType}.`,
      };
    }
    if (tpl.status !== 'APPROVED') {
      return {
        enqueued: false,
        errorCode: 'TEMPLATE_NOT_APPROVED',
        errorMessage: `O template "${tpl.templateName}" está com status ${tpl.status}. Apenas templates APPROVED na Meta podem ser utilizados.`,
      };
    }
    templateName = tpl.templateName;
    templateLanguage = tpl.language || 'pt_BR';
    renderedBody = renderTemplatePreview(tpl.bodyPreview, variables);
  }

  const idempotencyKey =
    options.idempotencyKeyOverride ||
    `${tenantId}:${eventType}:${referenceId}:${phoneNorm.normalizedPhone}`;

  const existingMsg = memoryStore.whatsappMessages.find(
    (m: any) => m.idempotencyKey === idempotencyKey && m.status !== 'CANCELLED'
  );
  if (existingMsg) {
    return {
      enqueued: false,
      duplicateBlocked: true,
      message: formatMessageItem(existingMsg),
      errorCode: 'DUPLICATE_MESSAGE_BLOCKED',
      errorMessage: 'Mensagem idempotente já registrada para este evento e destinatária.',
    };
  }

  const now = new Date().toISOString();
  const msgRecord: any = {
    id: `wamsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    clientId: client?.id || clientId || null,
    appointmentId: appointmentId || null,
    referenceId,
    eventType,
    messageCategory: category,
    recipientPhone: phoneNorm.normalizedPhone,
    templateName,
    templateLanguage,
    templateVariables: variables,
    renderedBody,
    idempotencyKey,
    provider: 'META_CLOUD_API',
    providerMessageId: null,
    status: 'PENDING' as WhatsAppMessageStatus,
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: now,
    lockedAt: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    cancelledAt: null,
    isPermanentError: false,
    errorCode: null,
    errorMessage: null,
    requestedBy: requestedBy || 'system',
    statusHistory: [
      {
        timestamp: now,
        status: 'PENDING',
        actor: requestedBy || 'system',
        note: 'Mensagem enfileirada para envio.',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.whatsappMessages.push(msgRecord);

  if (processImmediately) {
    await processSingleQueuedMessage(msgRecord.id);
  }

  return {
    enqueued: true,
    message: formatMessageItem(msgRecord),
  };
}

/**
 * Recovers messages stuck in PROCESSING for longer than lockTimeoutMs (default 2 minutes)
 * so they are not lost or duplicated.
 */
export function recoverStuckWhatsAppMessages(lockTimeoutMs = 120_000): number {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let recovered = 0;

  for (const msg of memoryStore.whatsappMessages) {
    if (msg.status === 'PROCESSING' && msg.lockedAt) {
      const lockedTime = new Date(msg.lockedAt).getTime();
      if (nowMs - lockedTime >= lockTimeoutMs) {
        if (msg.attempts >= msg.maxAttempts) {
          msg.status = 'FAILED';
          msg.failedAt = nowIso;
          msg.lockedAt = null;
          msg.errorCode = 'LOCK_TIMEOUT_MAX_ATTEMPTS';
          msg.errorMessage = 'Mensagem expirou o tempo de processamento e atingiu o limite de tentativas.';
          msg.statusHistory.push({
            timestamp: nowIso,
            status: 'FAILED',
            actor: 'watchdog',
            note: msg.errorMessage,
          });
        } else {
          msg.status = 'PENDING';
          msg.lockedAt = null;
          msg.nextAttemptAt = nowIso;
          msg.statusHistory.push({
            timestamp: nowIso,
            status: 'PENDING',
            actor: 'watchdog',
            note: 'Mensagem recuperada de PROCESSING travado para nova tentativa.',
          });
        }
        msg.updatedAt = nowIso;
        recovered++;
      }
    }
  }

  return recovered;
}

/**
 * Processes a single queued message with concurrency lock, retry backoff, and permanent failure classification.
 */
export async function processSingleQueuedMessage(messageId: string): Promise<WhatsAppMessageItem | null> {
  const msg = memoryStore.whatsappMessages.find((m: any) => m.id === messageId);
  if (!msg) return null;

  // Prevent concurrent processing or reprocessing terminal states
  if (
    msg.status === 'PROCESSING' ||
    msg.status === 'SENT' ||
    msg.status === 'DELIVERED' ||
    msg.status === 'READ' ||
    msg.status === 'CANCELLED' ||
    (msg.status === 'FAILED' && msg.isPermanentError)
  ) {
    return formatMessageItem(msg);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Acquire lock
  msg.status = 'PROCESSING';
  msg.lockedAt = nowIso;
  msg.attempts = (msg.attempts || 0) + 1;
  msg.updatedAt = nowIso;
  msg.statusHistory.push({
    timestamp: nowIso,
    status: 'PROCESSING',
    actor: 'queue-worker',
    note: `Iniciando tentativa ${msg.attempts}/${msg.maxAttempts}.`,
  });

  const credentials = getTenantCredentials(msg.tenantId);
  if (!credentials) {
    // Do NOT simulate real sending when credentials are absent!
    msg.status = 'FAILED';
    msg.lockedAt = null;
    msg.failedAt = nowIso;
    msg.isPermanentError = true;
    msg.errorCode = 'MISSING_CREDENTIALS';
    msg.errorMessage =
      'Credenciais oficiais da Meta WhatsApp Cloud API não configuradas para este estabelecimento. O envio real não foi executado.';
    msg.updatedAt = nowIso;
    msg.statusHistory.push({
      timestamp: nowIso,
      status: 'FAILED',
      actor: 'queue-worker',
      note: msg.errorMessage,
    });
    return formatMessageItem(msg);
  }

  let sendResult;
  if (msg.templateName) {
    sendResult = await activeProvider.sendTemplateMessage({
      credentials,
      recipientPhone: msg.recipientPhone,
      templateName: msg.templateName,
      languageCode: msg.templateLanguage || 'pt_BR',
      variables: Array.isArray(msg.templateVariables) ? msg.templateVariables : [],
    });
  } else {
    sendResult = await activeProvider.sendTextMessage({
      credentials,
      recipientPhone: msg.recipientPhone,
      body: msg.renderedBody || '',
    });
  }

  const doneIso = new Date().toISOString();
  msg.lockedAt = null;
  msg.updatedAt = doneIso;

  if (sendResult.success && sendResult.providerMessageId) {
    // Important: SENT means accepted by Meta API. Never mark DELIVERED or READ until webhook arrives!
    msg.status = 'SENT';
    msg.providerMessageId = sendResult.providerMessageId;
    msg.sentAt = doneIso;
    msg.errorCode = null;
    msg.errorMessage = null;
    msg.nextAttemptAt = null;
    msg.statusHistory.push({
      timestamp: doneIso,
      status: 'SENT',
      actor: 'meta-cloud-api',
      note: `Aceita pela API da Meta (wamid: ${sendResult.providerMessageId}). Aguardando confirmação de entrega via webhook.`,
    });
  } else {
    const isPermanent = Boolean(sendResult.isPermanentError);
    msg.errorCode = sendResult.errorCode || 'SEND_ERROR';
    msg.errorMessage = sendResult.errorMessage || 'Erro ao enviar mensagem via Meta Cloud API.';

    if (isPermanent || msg.attempts >= msg.maxAttempts) {
      msg.status = 'FAILED';
      msg.failedAt = doneIso;
      msg.isPermanentError = isPermanent;
      msg.nextAttemptAt = null;
      msg.statusHistory.push({
        timestamp: doneIso,
        status: 'FAILED',
        actor: 'meta-cloud-api',
        note: isPermanent
          ? `Falha permanente (${msg.errorCode}): ${msg.errorMessage}`
          : `Limite máximo de tentativas (${msg.maxAttempts}) atingido: ${msg.errorMessage}`,
      });
    } else {
      // Progressive backoff: attempt 1 -> 30s, attempt 2 -> 120s, attempt 3 -> 300s
      const baseBackoffSec = sendResult.retryAfterSeconds || Math.pow(2, msg.attempts) * 15;
      const nextRetry = new Date(Date.now() + baseBackoffSec * 1000).toISOString();
      msg.status = 'PENDING';
      msg.nextAttemptAt = nextRetry;
      msg.statusHistory.push({
        timestamp: doneIso,
        status: 'PENDING',
        actor: 'queue-worker',
        note: `Falha temporária (${msg.errorCode}): ${msg.errorMessage}. Nova tentativa agendada para ${nextRetry}.`,
      });
    }
  }

  return formatMessageItem(msg);
}

/**
 * Processes all due PENDING messages in the queue.
 */
export async function processWhatsAppQueueBatch(
  tenantId?: string,
  nowOverride?: Date
): Promise<{ processed: number; sent: number; failed: number; reScheduled: number }> {
  recoverStuckWhatsAppMessages();
  const nowMs = (nowOverride || new Date()).getTime();

  const dueMessages = memoryStore.whatsappMessages.filter((m: any) => {
    if (tenantId && m.tenantId !== tenantId) return false;
    if (m.status !== 'PENDING') return false;
    if (!m.nextAttemptAt) return true;
    return new Date(m.nextAttemptAt).getTime() <= nowMs;
  });

  let sent = 0;
  let failed = 0;
  let reScheduled = 0;

  for (const m of dueMessages) {
    const res = await processSingleQueuedMessage(m.id);
    if (res?.status === 'SENT') sent++;
    else if (res?.status === 'FAILED') failed++;
    else if (res?.status === 'PENDING') reScheduled++;
  }

  return {
    processed: dueMessages.length,
    sent,
    failed,
    reScheduled,
  };
}

// ==========================================
// LEMBRETES AUTOMÁTICOS E JANELA DE HORÁRIO
// ==========================================

function parseTimeMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '08:00').split(':').map((n) => Number(n) || 0);
  return h * 60 + m;
}

function getLocalHoursAndMinutes(date: Date, timeZone: string): { hours: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0) % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return { hours: h, minutes: m };
  } catch {
    return { hours: date.getUTCHours(), minutes: date.getUTCMinutes() };
  }
}

/**
 * Adjusts a target reminder timestamp so it falls inside the establishment's allowed communication window.
 * If the target time is after `allowedWindowEnd`, shifts it back to `allowedWindowEnd` on the same day.
 * If the target time is before `allowedWindowStart`, shifts it forward to `allowedWindowStart` on the same day
 * (provided that is still strictly before the appointment time; otherwise shifts to previous day's `allowedWindowEnd`).
 */
export function adjustToAllowedWindow(
  rawReminderDate: Date,
  appointmentDate: Date,
  allowedStart: string,
  allowedEnd: string,
  timeZone = 'America/Sao_Paulo'
): Date {
  const startMin = parseTimeMinutes(allowedStart || '08:00');
  const endMin = parseTimeMinutes(allowedEnd || '20:00');
  const { hours, minutes } = getLocalHoursAndMinutes(rawReminderDate, timeZone);
  const currentMin = hours * 60 + minutes;

  if (currentMin >= startMin && currentMin <= endMin) {
    return rawReminderDate;
  }

  if (currentMin > endMin) {
    // Shift back to allowedEnd on the same day
    const diffMinutes = currentMin - endMin;
    return new Date(rawReminderDate.getTime() - diffMinutes * 60 * 1000);
  }

  // currentMin < startMin: try shifting forward to allowedStart on the same day
  const forwardDiffMinutes = startMin - currentMin;
  const candidateForward = new Date(rawReminderDate.getTime() + forwardDiffMinutes * 60 * 1000);
  if (candidateForward.getTime() < appointmentDate.getTime() - 30 * 60 * 1000) {
    return candidateForward;
  }

  // Otherwise shift back to previous day's allowedEnd
  const minutesFromPrevEnd = currentMin + (24 * 60 - endMin);
  return new Date(rawReminderDate.getTime() - minutesFromPrevEnd * 60 * 1000);
}

/**
 * Schedules or refreshes reminders (24h, 3h, custom) for a confirmed appointment.
 * Prevents duplicates and respects tenant configuration.
 */
export function scheduleAppointmentReminders(appointmentId: string, nowOverride?: Date): WhatsAppScheduledReminderItem[] {
  const appt = memoryStore.appointments.find((a: any) => a.id === appointmentId);
  if (!appt) return [];

  // Only CONFIRMED appointments should have active reminders
  if (appt.status !== 'CONFIRMED') {
    cancelAppointmentReminders(appointmentId, `Agendamento com status ${appt.status}`);
    return [];
  }

  const cfg = ensureTenantConfigRecord(appt.tenantId);
  if (!cfg.enableReminders) {
    return [];
  }

  const tenant = memoryStore.tenants.find((t: any) => t.id === appt.tenantId);
  const timeZone = tenant?.timezone || 'America/Sao_Paulo';
  const apptDate = new Date(appt.dateTime);
  const now = nowOverride || new Date();
  const nowIso = now.toISOString();

  const desiredReminders: Array<{
    reminderType: 'REMINDER_24H' | 'REMINDER_3H' | 'REMINDER_CUSTOM';
    leadTimeHours: number;
  }> = [];

  if (cfg.reminder24hEnabled) {
    desiredReminders.push({ reminderType: 'REMINDER_24H', leadTimeHours: 24 });
  }
  if (cfg.reminder3hEnabled) {
    desiredReminders.push({ reminderType: 'REMINDER_3H', leadTimeHours: 3 });
  }
  if (cfg.customReminderEnabled && cfg.customReminderHours && cfg.customReminderHours > 0) {
    desiredReminders.push({
      reminderType: 'REMINDER_CUSTOM',
      leadTimeHours: Number(cfg.customReminderHours),
    });
  }

  const createdOrUpdated: WhatsAppScheduledReminderItem[] = [];

  for (const spec of desiredReminders) {
    const rawTarget = new Date(apptDate.getTime() - spec.leadTimeHours * 3600 * 1000);
    const adjustedTarget = adjustToAllowedWindow(
      rawTarget,
      apptDate,
      cfg.allowedWindowStart || '08:00',
      cfg.allowedWindowEnd || '20:00',
      timeZone
    );

    const existing = memoryStore.whatsappReminders.find(
      (r: any) =>
        r.tenantId === appt.tenantId &&
        r.appointmentId === appt.id &&
        r.reminderType === spec.reminderType
    );

    // If appointment is already in the past, skip
    if (apptDate.getTime() <= now.getTime()) {
      continue;
    }

    if (existing) {
      if (existing.status === 'SCHEDULED' || existing.status === 'CANCELLED') {
        existing.leadTimeHours = spec.leadTimeHours;
        existing.scheduledFor = adjustedTarget.toISOString();
        existing.status = 'SCHEDULED';
        existing.skipReason = null;
        existing.updatedAt = nowIso;
      }
      createdOrUpdated.push(formatReminderItem(existing));
    } else {
      const remRecord = {
        id: `warem-${appt.id}-${spec.reminderType.toLowerCase()}-${Date.now()}`,
        tenantId: appt.tenantId,
        appointmentId: appt.id,
        clientId: appt.clientId,
        reminderType: spec.reminderType,
        leadTimeHours: spec.leadTimeHours,
        scheduledFor: adjustedTarget.toISOString(),
        status: 'SCHEDULED' as const,
        messageQueueId: null,
        skipReason: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      memoryStore.whatsappReminders.push(remRecord);
      createdOrUpdated.push(formatReminderItem(remRecord));
    }
  }

  return createdOrUpdated;
}

/**
 * Cancels any pending reminders and queued reminder messages for an appointment.
 */
export function cancelAppointmentReminders(appointmentId: string, reason = 'Agendamento cancelado'): number {
  const nowIso = new Date().toISOString();
  let count = 0;

  for (const rem of memoryStore.whatsappReminders) {
    if (rem.appointmentId === appointmentId && (rem.status === 'SCHEDULED' || rem.status === 'QUEUED')) {
      rem.status = 'CANCELLED';
      rem.skipReason = reason;
      rem.updatedAt = nowIso;
      count++;
    }
  }

  // Also cancel any unsent reminder messages in the queue for this appointment
  for (const msg of memoryStore.whatsappMessages) {
    if (
      msg.appointmentId === appointmentId &&
      msg.eventType === 'APPOINTMENT_REMINDER' &&
      msg.status === 'PENDING'
    ) {
      msg.status = 'CANCELLED';
      msg.cancelledAt = nowIso;
      msg.updatedAt = nowIso;
      msg.statusHistory.push({
        timestamp: nowIso,
        status: 'CANCELLED',
        actor: 'system',
        note: reason,
      });
    }
  }

  return count;
}

/**
 * Recalculates reminders when an appointment is rescheduled without duplicating reminders.
 */
export function rescheduleAppointmentReminders(appointmentId: string, nowOverride?: Date): WhatsAppScheduledReminderItem[] {
  const appt = memoryStore.appointments.find((a: any) => a.id === appointmentId);
  if (!appt) return [];

  // Cancel any existing SCHEDULED/QUEUED reminders first, then reset them to new times
  for (const rem of memoryStore.whatsappReminders) {
    if (rem.appointmentId === appointmentId) {
      rem.status = 'CANCELLED';
      rem.messageQueueId = null;
      rem.skipReason = 'Recalculado por reagendamento';
    }
  }

  // Cancel any pending unsent reminder messages in the queue
  const nowIso = (nowOverride || new Date()).toISOString();
  for (const msg of memoryStore.whatsappMessages) {
    if (
      msg.appointmentId === appointmentId &&
      msg.eventType === 'APPOINTMENT_REMINDER' &&
      msg.status === 'PENDING'
    ) {
      msg.status = 'CANCELLED';
      msg.cancelledAt = nowIso;
      msg.updatedAt = nowIso;
    }
  }

  return scheduleAppointmentReminders(appointmentId, nowOverride);
}

/**
 * Processes due scheduled reminders:
 * - Revalidates that the appointment is still CONFIRMED (skips if CANCELLED, EXPIRED, COMPLETED, etc.).
 * - Respects the tenant's allowed communication hours window.
 * - Enqueues the reminder message with an idempotency key that includes the appointment dateTime so rescheduled appointments can receive their new reminder without duplicating for the same slot.
 */
export async function processDueScheduledReminders(
  tenantId?: string,
  nowOverride?: Date
): Promise<{ evaluated: number; triggered: number; skipped: number }> {
  const now = nowOverride || new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const due = memoryStore.whatsappReminders.filter((r: any) => {
    if (tenantId && r.tenantId !== tenantId) return false;
    if (r.status !== 'SCHEDULED') return false;
    return new Date(r.scheduledFor).getTime() <= nowMs;
  });

  let triggered = 0;
  let skipped = 0;

  for (const rem of due) {
    const appt = memoryStore.appointments.find(
      (a: any) => a.id === rem.appointmentId && a.tenantId === rem.tenantId
    );
    if (!appt || appt.status !== 'CONFIRMED') {
      rem.status = 'SKIPPED';
      rem.skipReason = appt
        ? `Agendamento não está confirmado (status atual: ${appt.status}).`
        : 'Agendamento não encontrado.';
      rem.updatedAt = nowIso;
      skipped++;
      continue;
    }

    if (new Date(appt.dateTime).getTime() <= nowMs) {
      rem.status = 'SKIPPED';
      rem.skipReason = 'Horário do atendimento já passou.';
      rem.updatedAt = nowIso;
      skipped++;
      continue;
    }

    const cfg = ensureTenantConfigRecord(rem.tenantId);
    const tenant = memoryStore.tenants.find((t: any) => t.id === rem.tenantId);
    const timeZone = tenant?.timezone || 'America/Sao_Paulo';

    // Check if current time is within allowed window
    const { hours, minutes } = getLocalHoursAndMinutes(now, timeZone);
    const nowMin = hours * 60 + minutes;
    const startMin = parseTimeMinutes(cfg.allowedWindowStart || '08:00');
    const endMin = parseTimeMinutes(cfg.allowedWindowEnd || '20:00');

    if (nowMin < startMin || nowMin > endMin) {
      // Adjust scheduledFor to next allowed window instead of sending at night
      rem.scheduledFor = adjustToAllowedWindow(
        now,
        new Date(appt.dateTime),
        cfg.allowedWindowStart || '08:00',
        cfg.allowedWindowEnd || '20:00',
        timeZone
      ).toISOString();
      rem.updatedAt = nowIso;
      skipped++;
      continue;
    }

    const client = memoryStore.clients.find(
      (c: any) => c.id === appt.clientId && c.tenantId === appt.tenantId
    );
    const service = memoryStore.services.find((s: any) => s.id === appt.serviceId);
    const prof = memoryStore.professionals.find((p: any) => p.id === appt.professionalId);
    const { dateFormatted, timeFormatted } = formatDateTimePtBr(appt.dateTime, timeZone);

    const idempotencyKey = `${rem.tenantId}:APPOINTMENT_REMINDER:${appt.id}:${rem.reminderType}:${appt.dateTime}`;

    const enq = await enqueueWhatsAppMessage({
      tenantId: rem.tenantId,
      clientId: appt.clientId,
      appointmentId: appt.id,
      referenceId: `${appt.id}:${rem.reminderType}`,
      eventType: 'APPOINTMENT_REMINDER',
      variables: [
        client?.name || 'Cliente',
        tenant?.name || 'Agenda Beauty',
        service?.name || 'Serviço',
        prof?.name || 'Profissional',
        dateFormatted,
        timeFormatted,
        tenant?.address || 'Compareça com 10 minutos de antecedência',
      ],
      idempotencyKeyOverride: idempotencyKey,
      processImmediately: true,
    });

    if (enq.message) {
      rem.messageQueueId = enq.message.id;
      rem.status = enq.message.status === 'SENT' ? 'SENT' : 'QUEUED';
      rem.updatedAt = nowIso;
      triggered++;
    } else {
      rem.status = 'SKIPPED';
      rem.skipReason = enq.errorMessage || 'Não foi possível enfileirar o lembrete.';
      rem.updatedAt = nowIso;
      skipped++;
    }
  }

  return {
    evaluated: due.length,
    triggered,
    skipped,
  };
}

// ==========================================
// GATILHOS OPERACIONAIS (NÃO-BLOQUEANTES)
// ==========================================

function formatDateTimePtBr(isoDate: string, timeZone = 'America/Sao_Paulo'): {
  dateFormatted: string;
  timeFormatted: string;
} {
  try {
    const d = new Date(isoDate);
    const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
    const timeFormatted = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
    return { dateFormatted, timeFormatted };
  } catch {
    return { dateFormatted: isoDate.slice(0, 10), timeFormatted: isoDate.slice(11, 16) };
  }
}

function formatCentsPtBr(cents: number): string {
  const reais = (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
  return `R$ ${reais}`;
}

/**
 * Triggers booking confirmation message ONLY when the appointment is CONFIRMED.
 * Never throws or fails the appointment flow if WhatsApp fails.
 */
export async function triggerAppointmentConfirmation(appointmentId: string): Promise<EnqueueResult> {
  try {
    const appt = memoryStore.appointments.find((a: any) => a.id === appointmentId);
    if (!appt) {
      return {
        enqueued: false,
        errorCode: 'APPOINTMENT_NOT_FOUND',
        errorMessage: 'Agendamento não encontrado.',
      };
    }

    // Rule 7: Only send confirmation when appointment is genuinely CONFIRMED!
    if (appt.status !== 'CONFIRMED') {
      return {
        enqueued: false,
        errorCode: 'APPOINTMENT_NOT_CONFIRMED',
        errorMessage: `Confirmação não enviada: o agendamento está com status ${appt.status} (aguardando confirmação/pagamento).`,
      };
    }

    const tenant = memoryStore.tenants.find((t: any) => t.id === appt.tenantId);
    const client = memoryStore.clients.find(
      (c: any) => c.id === appt.clientId && c.tenantId === appt.tenantId
    );
    const service = memoryStore.services.find((s: any) => s.id === appt.serviceId);
    const prof = memoryStore.professionals.find((p: any) => p.id === appt.professionalId);
    const { dateFormatted, timeFormatted } = formatDateTimePtBr(
      appt.dateTime,
      tenant?.timezone || 'America/Sao_Paulo'
    );

    // Also schedule automatic reminders for this confirmed appointment
    scheduleAppointmentReminders(appt.id);

    return await enqueueWhatsAppMessage({
      tenantId: appt.tenantId,
      clientId: appt.clientId,
      appointmentId: appt.id,
      referenceId: appt.id,
      eventType: 'APPOINTMENT_CONFIRMATION',
      variables: [
        client?.name || 'Cliente',
        tenant?.name || 'Agenda Beauty',
        service?.name || 'Serviço',
        prof?.name || 'Profissional',
        dateFormatted,
        timeFormatted,
        appt.id.slice(-6).toUpperCase(),
      ],
    });
  } catch (err: any) {
    return {
      enqueued: false,
      errorCode: 'INTERNAL_TRIGGER_ERROR',
      errorMessage: err?.message || 'Erro interno ao disparar confirmação.',
    };
  }
}

export async function triggerAppointmentRescheduled(appointmentId: string): Promise<EnqueueResult> {
  try {
    const appt = memoryStore.appointments.find((a: any) => a.id === appointmentId);
    if (!appt) {
      return {
        enqueued: false,
        errorCode: 'APPOINTMENT_NOT_FOUND',
        errorMessage: 'Agendamento não encontrado.',
      };
    }

    // Recalculate reminders for the new date/time and cancel old ones
    rescheduleAppointmentReminders(appt.id);

    const tenant = memoryStore.tenants.find((t: any) => t.id === appt.tenantId);
    const client = memoryStore.clients.find(
      (c: any) => c.id === appt.clientId && c.tenantId === appt.tenantId
    );
    const service = memoryStore.services.find((s: any) => s.id === appt.serviceId);
    const prof = memoryStore.professionals.find((p: any) => p.id === appt.professionalId);
    const { dateFormatted, timeFormatted } = formatDateTimePtBr(
      appt.dateTime,
      tenant?.timezone || 'America/Sao_Paulo'
    );

    return await enqueueWhatsAppMessage({
      tenantId: appt.tenantId,
      clientId: appt.clientId,
      appointmentId: appt.id,
      referenceId: `${appt.id}:resched:${appt.rescheduleCount || 1}:${appt.dateTime}`,
      eventType: 'APPOINTMENT_RESCHEDULED',
      variables: [
        client?.name || 'Cliente',
        service?.name || 'Serviço',
        tenant?.name || 'Agenda Beauty',
        dateFormatted,
        timeFormatted,
        prof?.name || 'Profissional',
      ],
    });
  } catch (err: any) {
    return {
      enqueued: false,
      errorCode: 'INTERNAL_TRIGGER_ERROR',
      errorMessage: err?.message || 'Erro ao disparar aviso de reagendamento.',
    };
  }
}

export async function triggerAppointmentCancelled(
  appointmentId: string,
  referenceCode?: string
): Promise<EnqueueResult> {
  try {
    const appt = memoryStore.appointments.find((a: any) => a.id === appointmentId);
    if (!appt) {
      return {
        enqueued: false,
        errorCode: 'APPOINTMENT_NOT_FOUND',
        errorMessage: 'Agendamento não encontrado.',
      };
    }

    // Cancel any scheduled reminders so cancelled appointments NEVER receive reminders!
    cancelAppointmentReminders(appt.id, 'Agendamento cancelado');

    const tenant = memoryStore.tenants.find((t: any) => t.id === appt.tenantId);
    const client = memoryStore.clients.find(
      (c: any) => c.id === appt.clientId && c.tenantId === appt.tenantId
    );
    const service = memoryStore.services.find((s: any) => s.id === appt.serviceId);
    const { dateFormatted, timeFormatted } = formatDateTimePtBr(
      appt.dateTime,
      tenant?.timezone || 'America/Sao_Paulo'
    );

    return await enqueueWhatsAppMessage({
      tenantId: appt.tenantId,
      clientId: appt.clientId,
      appointmentId: appt.id,
      referenceId: `${appt.id}:cancelled`,
      eventType: 'CANCELLATION_CONFIRMED',
      variables: [
        client?.name || 'Cliente',
        service?.name || 'Serviço',
        dateFormatted,
        timeFormatted,
        tenant?.name || 'Agenda Beauty',
        referenceCode || appt.id.slice(-6).toUpperCase(),
      ],
    });
  } catch (err: any) {
    return {
      enqueued: false,
      errorCode: 'INTERNAL_TRIGGER_ERROR',
      errorMessage: err?.message || 'Erro ao disparar aviso de cancelamento.',
    };
  }
}

export async function triggerCancellationRequestUpdated(
  cancellationRequestId: string,
  decisionLabel: string,
  note?: string
): Promise<EnqueueResult> {
  try {
    const req = memoryStore.cancellationRequests.find((r: any) => r.id === cancellationRequestId);
    if (!req) {
      return {
        enqueued: false,
        errorCode: 'CANCELLATION_REQUEST_NOT_FOUND',
        errorMessage: 'Solicitação de cancelamento não encontrada.',
      };
    }

    const tenant = memoryStore.tenants.find((t: any) => t.id === req.tenantId);
    const client = memoryStore.clients.find(
      (c: any) => c.id === req.clientId && c.tenantId === req.tenantId
    );

    return await enqueueWhatsAppMessage({
      tenantId: req.tenantId,
      clientId: req.clientId,
      appointmentId: req.appointmentId,
      referenceId: `${req.id}:${req.status}`,
      eventType: 'CANCELLATION_REQUEST_UPDATED',
      variables: [
        client?.name || 'Cliente',
        req.referenceCode || req.id,
        tenant?.name || 'Agenda Beauty',
        decisionLabel,
        note || req.adminJustification || 'Consulte o portal da cliente para mais detalhes.',
      ],
    });
  } catch (err: any) {
    return {
      enqueued: false,
      errorCode: 'INTERNAL_TRIGGER_ERROR',
      errorMessage: err?.message || 'Erro ao disparar atualização de solicitação.',
    };
  }
}

export async function triggerPaymentUpdated(paymentId: string): Promise<EnqueueResult> {
  try {
    const payment = memoryStore.payments.find((p: any) => p.id === paymentId);
    if (!payment || payment.status !== 'APPROVED') {
      return {
        enqueued: false,
        errorCode: 'PAYMENT_NOT_APPROVED',
        errorMessage: 'Aviso de pagamento só é enviado para pagamentos aprovados.',
      };
    }

    const appt = memoryStore.appointments.find((a: any) => a.id === payment.appointmentId);
    const tenant = memoryStore.tenants.find((t: any) => t.id === payment.tenantId);
    const client = appt
      ? memoryStore.clients.find((c: any) => c.id === appt.clientId && c.tenantId === payment.tenantId)
      : null;
    const service = appt ? memoryStore.services.find((s: any) => s.id === appt.serviceId) : null;

    return await enqueueWhatsAppMessage({
      tenantId: payment.tenantId,
      clientId: client?.id || null,
      appointmentId: appt?.id || null,
      referenceId: `${payment.id}:APPROVED`,
      eventType: 'PAYMENT_UPDATED',
      variables: [
        client?.name || 'Cliente',
        formatCentsPtBr(payment.amountCents),
        service?.name || 'Atendimento',
        tenant?.name || 'Agenda Beauty',
      ],
    });
  } catch (err: any) {
    return {
      enqueued: false,
      errorCode: 'INTERNAL_TRIGGER_ERROR',
      errorMessage: err?.message || 'Erro ao disparar aviso de pagamento.',
    };
  }
}

export async function triggerRefundUpdated(refundRequestId: string): Promise<EnqueueResult> {
  try {
    const refund = memoryStore.refundRequests.find((r: any) => r.id === refundRequestId);
    if (!refund) {
      return {
        enqueued: false,
        errorCode: 'REFUND_NOT_FOUND',
        errorMessage: 'Reembolso não encontrado.',
      };
    }

    const tenant = memoryStore.tenants.find((t: any) => t.id === refund.tenantId);
    const client = memoryStore.clients.find(
      (c: any) => c.id === refund.clientId && c.tenantId === refund.tenantId
    );

    const statusPt: Record<string, string> = {
      APPROVED: 'Aprovado para processamento',
      PROCESSING: 'Em processamento no provedor Pix',
      COMPLETED: 'Reembolso concluído com sucesso',
      FAILED: 'Falha no processamento (em revisão pela administração)',
      REJECTED: 'Não aprovado conforme política aplicável',
    };

    return await enqueueWhatsAppMessage({
      tenantId: refund.tenantId,
      clientId: refund.clientId,
      appointmentId: refund.appointmentId,
      referenceId: `${refund.id}:${refund.status}`,
      eventType: 'REFUND_UPDATED',
      variables: [
        client?.name || 'Cliente',
        formatCentsPtBr(refund.amountCents),
        tenant?.name || 'Agenda Beauty',
        statusPt[refund.status] || refund.status,
      ],
    });
  } catch (err: any) {
    return {
      enqueued: false,
      errorCode: 'INTERNAL_TRIGGER_ERROR',
      errorMessage: err?.message || 'Erro ao disparar aviso de reembolso.',
    };
  }
}

// ==========================================
// ENVIO MANUAL OPERACIONAL COM RATE LIMIT
// ==========================================

export interface ManualSendInput {
  tenantId: string;
  clientId: string;
  appointmentId?: string | null;
  customOperationalNote: string;
  useFreeText?: boolean;
  requestedBy: string;
}

export async function sendManualOperationalMessage(input: ManualSendInput): Promise<EnqueueResult> {
  const client = memoryStore.clients.find(
    (c: any) => c.id === input.clientId && c.tenantId === input.tenantId
  );
  if (!client) {
    return {
      enqueued: false,
      errorCode: 'CLIENT_NOT_FOUND_OR_CROSS_TENANT',
      errorMessage: 'Cliente não encontrada ou pertence a outro estabelecimento.',
    };
  }

  const note = (input.customOperationalNote || '').trim();
  if (!note || note.length < 3) {
    return {
      enqueued: false,
      errorCode: 'INVALID_MESSAGE_BODY',
      errorMessage: 'Informe o conteúdo operacional da mensagem (mínimo de 3 caracteres).',
    };
  }

  // Anti-spam rate limit: max 3 manual messages to the same client within 5 minutes
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recentManualCount = memoryStore.whatsappMessages.filter(
    (m: any) =>
      m.tenantId === input.tenantId &&
      m.clientId === input.clientId &&
      m.eventType === 'MANUAL_OPERATIONAL' &&
      new Date(m.createdAt).getTime() >= fiveMinAgo
  ).length;

  if (recentManualCount >= 3) {
    return {
      enqueued: false,
      errorCode: 'MANUAL_RATE_LIMIT_EXCEEDED',
      errorMessage:
        'Limite de segurança atingido: aguarde alguns minutos antes de enviar novas mensagens manuais para a mesma cliente.',
    };
  }

  const tenant = memoryStore.tenants.find((t: any) => t.id === input.tenantId);
  const contentHash = crypto.createHash('md5').update(note).digest('hex').slice(0, 10);

  if (input.useFreeText) {
    const norm = normalizeWhatsAppPhone(client.normalizedPhone || client.phone);
    if (!norm.valid || !norm.normalizedPhone) {
      return {
        enqueued: false,
        errorCode: 'INVALID_PHONE_NUMBER',
        errorMessage: norm.error || 'Telefone da cliente inválido.',
      };
    }
    if (!hasActive24hCustomerServiceWindow(input.tenantId, norm.normalizedPhone)) {
      return {
        enqueued: false,
        errorCode: 'OUTSIDE_24H_WINDOW_TEMPLATE_REQUIRED',
        errorMessage:
          'Envio de texto livre bloqueado: não há janela de atendimento de 24h aberta pela cliente. Utilize o envio via template aprovado.',
      };
    }

    return await enqueueWhatsAppMessage({
      tenantId: input.tenantId,
      clientId: client.id,
      appointmentId: input.appointmentId || null,
      referenceId: `manual:${client.id}:${contentHash}`,
      eventType: 'MANUAL_OPERATIONAL',
      freeTextBody: note,
      requestedBy: input.requestedBy,
      // Force free-text path by passing a temporary marker handled below
      idempotencyKeyOverride: `${input.tenantId}:MANUAL_TEXT:${client.id}:${contentHash}`,
    });
  }

  return await enqueueWhatsAppMessage({
    tenantId: input.tenantId,
    clientId: client.id,
    appointmentId: input.appointmentId || null,
    referenceId: `manual:${client.id}:${contentHash}`,
    eventType: 'MANUAL_OPERATIONAL',
    variables: [client.name, tenant?.name || 'Agenda Beauty', note],
    requestedBy: input.requestedBy,
  });
}

// ==========================================
// WEBHOOKS DA META (VERIFICAÇÃO E STATUS)
// ==========================================

const STATUS_PROGRESSION_RANK: Record<string, number> = {
  PENDING: 0,
  PROCESSING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 1,
  CANCELLED: 4,
};

export function verifyWhatsAppWebhookChallenge(query: Record<string, any>): {
  status: number;
  body: string;
} {
  const mode = String(query['hub.mode'] || '');
  const verifyToken = String(query['hub.verify_token'] || '');
  const challenge = String(query['hub.challenge'] || '');

  // Match against any configured tenant verify token or global env token
  const matchingTenantCfg = memoryStore.whatsappConfigs.find(
    (c: any) => c.webhookVerifyToken && c.webhookVerifyToken === verifyToken
  );
  const expectedToken =
    matchingTenantCfg?.webhookVerifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';

  const check = activeProvider.verifyWebhookChallenge(
    { mode, verifyToken, challenge },
    expectedToken
  );

  if (check.verified) {
    return { status: 200, body: check.challenge || '' };
  }
  return { status: 403, body: check.error || 'Webhook verification failed' };
}

export interface ProcessWebhookPostResult {
  httpStatus: number;
  accepted: boolean;
  processedEvents: number;
  duplicatesIgnored: number;
  outOfOrderIgnored: number;
  crossTenantBlocked: number;
  error?: string;
}

export function processWhatsAppWebhookPost(
  rawBody: string | Buffer,
  payload: any,
  signatureHeader?: string
): ProcessWebhookPostResult {
  const normalizedEvents = activeProvider.normalizeWebhookEvents(payload);

  // Determine the tenant config from the payload's phoneNumberId or wabaId
  const firstPhoneNumberId =
    normalizedEvents[0]?.phoneNumberId ||
    payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ||
    '';
  const firstWabaId = normalizedEvents[0]?.wabaId || payload?.entry?.[0]?.id || '';

  const matchedConfig = memoryStore.whatsappConfigs.find(
    (c: any) =>
      (firstPhoneNumberId && c.phoneNumberId === String(firstPhoneNumberId)) ||
      (firstWabaId && c.wabaId === String(firstWabaId))
  );

  const appSecret =
    (matchedConfig ? decryptSecret(matchedConfig.encryptedAppSecret) : null) ||
    process.env.WHATSAPP_APP_SECRET ||
    '';

  // If an app secret is configured on the tenant or environment, strictly validate HMAC-SHA256!
  if (appSecret) {
    const isValidSig = activeProvider.verifyWebhookSignature(rawBody, signatureHeader, appSecret);
    if (!isValidSig) {
      return {
        httpStatus: 401,
        accepted: false,
        processedEvents: 0,
        duplicatesIgnored: 0,
        outOfOrderIgnored: 0,
        crossTenantBlocked: 0,
        error: 'Assinatura X-Hub-Signature-256 inválida ou ausente.',
      };
    }
  } else if (signatureHeader) {
    // If caller supplied a signature header when no secret is set, reject forged signature
    return {
      httpStatus: 401,
      accepted: false,
      processedEvents: 0,
      duplicatesIgnored: 0,
      outOfOrderIgnored: 0,
      crossTenantBlocked: 0,
      error: 'App Secret não configurado para validar a assinatura X-Hub-Signature-256.',
    };
  }

  let processedEvents = 0;
  let duplicatesIgnored = 0;
  let outOfOrderIgnored = 0;
  let crossTenantBlocked = 0;
  const nowIso = new Date().toISOString();

  for (const ev of normalizedEvents) {
    // 1. Idempotency check on providerEventId
    const alreadyProcessed = memoryStore.whatsappWebhookEvents.find(
      (e: any) => e.providerEventId === ev.providerEventId
    );
    if (alreadyProcessed) {
      duplicatesIgnored++;
      continue;
    }

    // Resolve tenant owning this phoneNumberId / wabaId
    const eventTenantCfg = memoryStore.whatsappConfigs.find(
      (c: any) =>
        (ev.phoneNumberId && c.phoneNumberId === ev.phoneNumberId) ||
        (ev.wabaId && c.wabaId === ev.wabaId)
    );
    const eventTenantId = eventTenantCfg?.tenantId || null;

    if (ev.eventType === 'INBOUND_MESSAGE') {
      memoryStore.whatsappWebhookEvents.push({
        id: `wawev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tenantId: eventTenantId,
        providerEventId: ev.providerEventId,
        wabaId: ev.wabaId,
        phoneNumberId: ev.phoneNumberId,
        wamid: ev.wamid,
        eventStatus: 'INBOUND_MESSAGE',
        payload: ev,
        processedAt: ev.timestamp || nowIso,
      });
      processedEvents++;
      continue;
    }

    // 2. Locate message by wamid (providerMessageId)
    const msg = memoryStore.whatsappMessages.find((m: any) => m.providerMessageId === ev.wamid);
    if (!msg) {
      // Record event for audit even if message was not originated here
      memoryStore.whatsappWebhookEvents.push({
        id: `wawev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tenantId: eventTenantId,
        providerEventId: ev.providerEventId,
        wabaId: ev.wabaId,
        phoneNumberId: ev.phoneNumberId,
        wamid: ev.wamid,
        eventStatus: ev.status,
        payload: ev,
        processedAt: nowIso,
      });
      continue;
    }

    // 3. Multi-tenant isolation: webhook from Tenant B's WABA/phoneNumberId MUST NOT mutate Tenant A's message!
    const msgTenantCfg = memoryStore.whatsappConfigs.find((c: any) => c.tenantId === msg.tenantId);
    if (
      (ev.phoneNumberId &&
        msgTenantCfg?.phoneNumberId &&
        ev.phoneNumberId !== msgTenantCfg.phoneNumberId) ||
      (ev.wabaId && msgTenantCfg?.wabaId && ev.wabaId !== msgTenantCfg.wabaId) ||
      (eventTenantId && eventTenantId !== msg.tenantId)
    ) {
      crossTenantBlocked++;
      continue;
    }

    // 4. Out-of-order status protection (e.g., DELIVERED or READ already reached, then late SENT arrives)
    const currentRank = STATUS_PROGRESSION_RANK[msg.status] ?? 0;
    const incomingStatus = ev.status!;
    const incomingRank = STATUS_PROGRESSION_RANK[incomingStatus] ?? 0;

    if (
      (msg.status === 'DELIVERED' || msg.status === 'READ') &&
      incomingRank < currentRank
    ) {
      outOfOrderIgnored++;
      memoryStore.whatsappWebhookEvents.push({
        id: `wawev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tenantId: msg.tenantId,
        providerEventId: ev.providerEventId,
        wabaId: ev.wabaId,
        phoneNumberId: ev.phoneNumberId,
        wamid: ev.wamid,
        eventStatus: `IGNORED_OUT_OF_ORDER_${incomingStatus}`,
        payload: ev,
        processedAt: nowIso,
      });
      continue;
    }

    // Apply status update
    msg.status = incomingStatus;
    msg.updatedAt = nowIso;
    if (incomingStatus === 'SENT' && !msg.sentAt) {
      msg.sentAt = ev.timestamp || nowIso;
    } else if (incomingStatus === 'DELIVERED') {
      if (!msg.sentAt) msg.sentAt = ev.timestamp || nowIso;
      msg.deliveredAt = ev.timestamp || nowIso;
    } else if (incomingStatus === 'READ') {
      if (!msg.sentAt) msg.sentAt = ev.timestamp || nowIso;
      if (!msg.deliveredAt) msg.deliveredAt = ev.timestamp || nowIso;
      msg.readAt = ev.timestamp || nowIso;
    } else if (incomingStatus === 'FAILED') {
      msg.failedAt = ev.timestamp || nowIso;
      msg.errorCode = ev.errorCode || 'WEBHOOK_DELIVERY_FAILED';
      msg.errorMessage = ev.errorMessage || 'A Meta reportou falha na entrega da mensagem.';
      msg.isPermanentError = true;
    }

    msg.statusHistory.push({
      timestamp: ev.timestamp || nowIso,
      status: incomingStatus,
      actor: 'meta-webhook',
      note:
        incomingStatus === 'FAILED'
          ? `Falha reportada via webhook (${msg.errorCode}): ${msg.errorMessage}`
          : `Status atualizado via webhook oficial da Meta para ${incomingStatus}.`,
    });

    memoryStore.whatsappWebhookEvents.push({
      id: `wawev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenantId: msg.tenantId,
      providerEventId: ev.providerEventId,
      wabaId: ev.wabaId,
      phoneNumberId: ev.phoneNumberId,
      wamid: ev.wamid,
      eventStatus: incomingStatus,
      payload: ev,
      processedAt: nowIso,
    });

    processedEvents++;
  }

  return {
    httpStatus: 200,
    accepted: true,
    processedEvents,
    duplicatesIgnored,
    outOfOrderIgnored,
    crossTenantBlocked,
  };
}

// ==========================================
// CONSULTAS E HISTÓRICO MULTIEMPRESA
// ==========================================

function formatMessageItem(m: any): WhatsAppMessageItem {
  const client = m.clientId
    ? memoryStore.clients.find((c: any) => c.id === m.clientId && c.tenantId === m.tenantId)
    : null;
  return {
    id: m.id,
    tenantId: m.tenantId,
    clientId: m.clientId || null,
    clientName: client?.name || 'Cliente',
    appointmentId: m.appointmentId || null,
    referenceId: m.referenceId || null,
    eventType: m.eventType,
    messageCategory: m.messageCategory || 'OPERATIONAL',
    recipientPhone: m.recipientPhone,
    templateName: m.templateName || null,
    templateLanguage: m.templateLanguage || 'pt_BR',
    templateVariables: Array.isArray(m.templateVariables) ? m.templateVariables : [],
    renderedBody: m.renderedBody || null,
    idempotencyKey: m.idempotencyKey,
    provider: m.provider || 'META_CLOUD_API',
    providerMessageId: m.providerMessageId || null,
    status: m.status,
    attempts: m.attempts || 0,
    maxAttempts: m.maxAttempts || 3,
    nextAttemptAt: m.nextAttemptAt || null,
    sentAt: m.sentAt || null,
    deliveredAt: m.deliveredAt || null,
    readAt: m.readAt || null,
    failedAt: m.failedAt || null,
    cancelledAt: m.cancelledAt || null,
    isPermanentError: Boolean(m.isPermanentError),
    errorCode: m.errorCode || null,
    errorMessage: m.errorMessage || null,
    requestedBy: m.requestedBy || null,
    statusHistory: Array.isArray(m.statusHistory) ? m.statusHistory : [],
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function formatReminderItem(r: any): WhatsAppScheduledReminderItem {
  const appt = memoryStore.appointments.find(
    (a: any) => a.id === r.appointmentId && a.tenantId === r.tenantId
  );
  const client = memoryStore.clients.find(
    (c: any) => c.id === r.clientId && c.tenantId === r.tenantId
  );
  const service = appt ? memoryStore.services.find((s: any) => s.id === appt.serviceId) : null;

  return {
    id: r.id,
    tenantId: r.tenantId,
    appointmentId: r.appointmentId,
    clientId: r.clientId,
    clientName: client?.name || 'Cliente',
    serviceName: service?.name || 'Serviço',
    appointmentDateTime: appt?.dateTime || undefined,
    reminderType: r.reminderType,
    leadTimeHours: r.leadTimeHours,
    scheduledFor: r.scheduledFor,
    status: r.status,
    messageQueueId: r.messageQueueId || null,
    skipReason: r.skipReason || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function listTenantMessages(
  tenantId: string,
  filters?: {
    status?: string;
    eventType?: string;
    clientId?: string;
    appointmentId?: string;
  }
): WhatsAppMessageItem[] {
  return memoryStore.whatsappMessages
    .filter((m: any) => {
      if (m.tenantId !== tenantId) return false;
      if (filters?.status && m.status !== filters.status) return false;
      if (filters?.eventType && m.eventType !== filters.eventType) return false;
      if (filters?.clientId && m.clientId !== filters.clientId) return false;
      if (filters?.appointmentId && m.appointmentId !== filters.appointmentId) return false;
      return true;
    })
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(formatMessageItem);
}

export function listTenantReminders(
  tenantId: string,
  appointmentId?: string
): WhatsAppScheduledReminderItem[] {
  return memoryStore.whatsappReminders
    .filter((r: any) => {
      if (r.tenantId !== tenantId) return false;
      if (appointmentId && r.appointmentId !== appointmentId) return false;
      return true;
    })
    .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
    .map(formatReminderItem);
}
