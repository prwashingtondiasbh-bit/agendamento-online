import crypto from 'crypto';

export interface ProviderCredentials {
  phoneNumberId: string;
  wabaId?: string;
  accessToken: string;
  apiVersion?: string;
}

export interface SendTemplateMessageInput {
  credentials: ProviderCredentials;
  recipientPhone: string; // E.164 digits or +digits
  templateName: string;
  languageCode: string; // e.g. 'pt_BR'
  variables: string[];
}

export interface SendTextMessageInput {
  credentials: ProviderCredentials;
  recipientPhone: string;
  body: string;
}

export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string; // wamid
  rawStatus?: 'ACCEPTED' | 'FAILED';
  errorCode?: string;
  errorMessage?: string;
  isPermanentError?: boolean;
  retryAfterSeconds?: number;
  rawResponse?: any;
}

export interface ProviderConnectionCheckResult {
  connected: boolean;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface WebhookChallengeParams {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
}

export interface WebhookChallengeResult {
  verified: boolean;
  challenge?: string;
  error?: string;
}

export interface NormalizedWhatsAppWebhookEvent {
  providerEventId: string;
  wabaId: string;
  phoneNumberId: string;
  eventType: 'MESSAGE_STATUS' | 'INBOUND_MESSAGE';
  wamid: string;
  recipientPhone?: string;
  senderPhone?: string;
  status?: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: string;
  errorCode?: string;
  errorMessage?: string;
  rawEvent: any;
}

export interface ClassifiedProviderError {
  errorCode: string;
  errorMessage: string;
  isPermanentError: boolean;
  retryAfterSeconds?: number;
}

export interface WhatsAppProvider {
  readonly providerName: string;
  sendTemplateMessage(input: SendTemplateMessageInput): Promise<ProviderSendResult>;
  sendTextMessage(input: SendTextMessageInput): Promise<ProviderSendResult>;
  verifyConnection(credentials: ProviderCredentials): Promise<ProviderConnectionCheckResult>;
  verifyWebhookChallenge(
    params: WebhookChallengeParams,
    expectedVerifyToken: string
  ): WebhookChallengeResult;
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    appSecret: string
  ): boolean;
  normalizeWebhookEvents(payload: any): NormalizedWhatsAppWebhookEvent[];
  classifyError(status: number, errorBody: any): ClassifiedProviderError;
}

export type MetaHttpTransport = (
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
  }
) => Promise<{
  status: number;
  headers?: Record<string, string>;
  json: () => Promise<any>;
}>;

// Permanent Meta Cloud API error codes that must NOT be retried infinitely
const PERMANENT_META_ERROR_CODES = new Set<number>([
  100,    // Invalid parameter
  190,    // Access token expired / invalid OAuth token
  200,    // Permission error
  131009, // Parameter value is not valid
  131021, // Recipient cannot be sender
  131026, // Message undeliverable / Recipient not on WhatsApp
  131051, // Unsupported message type
  132000, // Template parameter count mismatch
  132001, // Template does not exist in the specified language or not approved
  132005, // Translated text too long
  132007, // Template format character policy violated
  132012, // Template parameter format mismatch
  132015, // Template is paused
  132016, // Template is disabled
  133010, // Phone number not registered
]);

// Rate limit / transient Meta Cloud API error codes
const TRANSIENT_META_ERROR_CODES = new Set<number>([
  1,      // API Unknown error
  2,      // API Service temporarily unavailable
  4,      // API Too many calls
  80007,  // Rate limit issues
  130429, // Rate limit hit
  131048, // Spam rate limit hit
  131056, // Pair rate limit hit (same recipient too fast)
  131053, // Media upload transient error
]);

export class MetaWhatsAppCloudProvider implements WhatsAppProvider {
  public readonly providerName = 'META_CLOUD_API';
  private customTransport: MetaHttpTransport | null = null;

  public setTransport(transport: MetaHttpTransport | null) {
    this.customTransport = transport;
  }

  private async request(
    url: string,
    options: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }
  ) {
    if (this.customTransport) {
      return this.customTransport(url, options);
    }

    const res = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    return {
      status: res.status,
      headers: headersObj,
      json: async () => {
        try {
          return await res.json();
        } catch {
          return {};
        }
      },
    };
  }

  public classifyError(status: number, errorBody: any): ClassifiedProviderError {
    const metaError = errorBody?.error || {};
    const codeNum = Number(metaError.code || 0);
    const subcodeNum = Number(metaError.error_subcode || 0);
    const errorCode = codeNum ? `META_${codeNum}${subcodeNum ? `_${subcodeNum}` : ''}` : `HTTP_${status}`;
    const errorMessage =
      metaError.error_user_msg ||
      metaError.message ||
      (status === 429
        ? 'Limite de taxa da API da Meta atingido (Rate Limit).'
        : status >= 500
        ? 'Instabilidade temporária nos servidores da Meta WhatsApp Cloud API.'
        : 'Falha ao comunicar com a Meta WhatsApp Cloud API.');

    if (status === 429 || TRANSIENT_META_ERROR_CODES.has(codeNum)) {
      return {
        errorCode,
        errorMessage,
        isPermanentError: false,
        retryAfterSeconds: 60,
      };
    }

    if (status >= 500) {
      return {
        errorCode,
        errorMessage,
        isPermanentError: false,
        retryAfterSeconds: 30,
      };
    }

    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      PERMANENT_META_ERROR_CODES.has(codeNum)
    ) {
      return {
        errorCode,
        errorMessage,
        isPermanentError: true,
      };
    }

    return {
      errorCode,
      errorMessage,
      isPermanentError: status < 500,
    };
  }

  public async verifyConnection(
    credentials: ProviderCredentials
  ): Promise<ProviderConnectionCheckResult> {
    const phoneNumberId = credentials.phoneNumberId?.trim();
    const accessToken = credentials.accessToken?.trim();
    const apiVersion = credentials.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!phoneNumberId || !accessToken) {
      return {
        connected: false,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage:
          'Phone Number ID e Access Token da Meta WhatsApp Cloud API são obrigatórios para validar a conexão.',
      };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(
      phoneNumberId
    )}?fields=id,display_phone_number,verified_name,quality_rating`;

    try {
      const response = await this.request(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const body = await response.json();
      if (response.status >= 200 && response.status < 300 && body?.id) {
        return {
          connected: true,
          displayPhoneNumber: body.display_phone_number || undefined,
          verifiedName: body.verified_name || undefined,
          qualityRating: body.quality_rating || 'GREEN',
        };
      }

      const classified = this.classifyError(response.status, body);
      return {
        connected: false,
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
      };
    } catch (err: any) {
      return {
        connected: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage:
          err?.message || 'Não foi possível conectar à Graph API da Meta. Verifique a conectividade.',
      };
    }
  }

  public async sendTemplateMessage(
    input: SendTemplateMessageInput
  ): Promise<ProviderSendResult> {
    const phoneNumberId = input.credentials.phoneNumberId?.trim();
    const accessToken = input.credentials.accessToken?.trim();
    const apiVersion = input.credentials.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!phoneNumberId || !accessToken) {
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage:
          'Credenciais da Meta WhatsApp Cloud API ausentes. O envio real não pode ser simulado.',
        isPermanentError: true,
      };
    }

    const toDigits = input.recipientPhone.replace(/\D/g, '');
    if (!toDigits || toDigits.length < 10 || toDigits.length > 15) {
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: 'INVALID_RECIPIENT_PHONE',
        errorMessage: 'Número de telefone da destinatária inválido para o formato E.164.',
        isPermanentError: true,
      };
    }

    const parameters = (input.variables || []).map((val) => ({
      type: 'text',
      text: String(val ?? ''),
    }));

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toDigits,
      type: 'template',
      template: {
        name: input.templateName,
        language: {
          code: input.languageCode || 'pt_BR',
        },
        ...(parameters.length > 0
          ? {
              components: [
                {
                  type: 'body',
                  parameters,
                },
              ],
            }
          : {}),
      },
    };

    const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(
      phoneNumberId
    )}/messages`;

    try {
      const response = await this.request(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      const wamid = body?.messages?.[0]?.id;

      if (response.status >= 200 && response.status < 300 && wamid) {
        return {
          success: true,
          providerMessageId: String(wamid),
          rawStatus: 'ACCEPTED',
          rawResponse: body,
        };
      }

      const classified = this.classifyError(response.status, body);
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        isPermanentError: classified.isPermanentError,
        retryAfterSeconds: classified.retryAfterSeconds,
        rawResponse: body,
      };
    } catch (err: any) {
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: 'NETWORK_TIMEOUT',
        errorMessage: err?.message || 'Falha temporária de rede ao enviar mensagem para a Meta.',
        isPermanentError: false,
        retryAfterSeconds: 30,
      };
    }
  }

  public async sendTextMessage(input: SendTextMessageInput): Promise<ProviderSendResult> {
    const phoneNumberId = input.credentials.phoneNumberId?.trim();
    const accessToken = input.credentials.accessToken?.trim();
    const apiVersion = input.credentials.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!phoneNumberId || !accessToken) {
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage:
          'Credenciais da Meta WhatsApp Cloud API ausentes. O envio real não pode ser simulado.',
        isPermanentError: true,
      };
    }

    const toDigits = input.recipientPhone.replace(/\D/g, '');
    if (!toDigits || toDigits.length < 10 || toDigits.length > 15) {
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: 'INVALID_RECIPIENT_PHONE',
        errorMessage: 'Número de telefone da destinatária inválido para o formato E.164.',
        isPermanentError: true,
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toDigits,
      type: 'text',
      text: {
        preview_url: false,
        body: input.body,
      },
    };

    const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(
      phoneNumberId
    )}/messages`;

    try {
      const response = await this.request(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      const wamid = body?.messages?.[0]?.id;

      if (response.status >= 200 && response.status < 300 && wamid) {
        return {
          success: true,
          providerMessageId: String(wamid),
          rawStatus: 'ACCEPTED',
          rawResponse: body,
        };
      }

      const classified = this.classifyError(response.status, body);
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        isPermanentError: classified.isPermanentError,
        retryAfterSeconds: classified.retryAfterSeconds,
        rawResponse: body,
      };
    } catch (err: any) {
      return {
        success: false,
        rawStatus: 'FAILED',
        errorCode: 'NETWORK_TIMEOUT',
        errorMessage: err?.message || 'Falha temporária de rede ao enviar mensagem para a Meta.',
        isPermanentError: false,
        retryAfterSeconds: 30,
      };
    }
  }

  public verifyWebhookChallenge(
    params: WebhookChallengeParams,
    expectedVerifyToken: string
  ): WebhookChallengeResult {
    if (!expectedVerifyToken) {
      return {
        verified: false,
        error: 'Token de verificação do webhook não configurado.',
      };
    }
    if (params.mode !== 'subscribe') {
      return {
        verified: false,
        error: 'hub.mode inválido (esperado: subscribe).',
      };
    }
    if (!params.verifyToken || params.verifyToken !== expectedVerifyToken) {
      return {
        verified: false,
        error: 'hub.verify_token inválido.',
      };
    }
    return {
      verified: true,
      challenge: String(params.challenge ?? ''),
    };
  }

  public verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    appSecret: string
  ): boolean {
    if (!signatureHeader || !appSecret) {
      return false;
    }
    const parts = signatureHeader.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      return false;
    }
    const receivedHex = parts[1];
    const expectedHex = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    try {
      const a = Buffer.from(receivedHex, 'hex');
      const b = Buffer.from(expectedHex, 'hex');
      if (a.length !== b.length || a.length === 0) {
        return false;
      }
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  public normalizeWebhookEvents(payload: any): NormalizedWhatsAppWebhookEvent[] {
    const events: NormalizedWhatsAppWebhookEvent[] = [];
    if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
      return events;
    }

    for (const entry of payload.entry) {
      const wabaId = String(entry?.id || '');
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        if (change?.field !== 'messages') continue;
        const value = change?.value || {};
        const phoneNumberId = String(value?.metadata?.phone_number_id || '');

        // Status updates: sent, delivered, read, failed
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const st of statuses) {
          const wamid = String(st?.id || '');
          const rawStatus = String(st?.status || '').toLowerCase();
          if (!wamid) continue;

          let mappedStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | undefined;
          if (rawStatus === 'sent') mappedStatus = 'SENT';
          else if (rawStatus === 'delivered') mappedStatus = 'DELIVERED';
          else if (rawStatus === 'read') mappedStatus = 'READ';
          else if (rawStatus === 'failed') mappedStatus = 'FAILED';

          if (!mappedStatus) continue;

          const errObj = Array.isArray(st?.errors) && st.errors.length > 0 ? st.errors[0] : null;
          const errorCode = errObj?.code ? `META_${errObj.code}` : undefined;
          const errorMessage =
            errObj?.error_data?.details || errObj?.title || errObj?.message || undefined;

          const tsSeconds = Number(st?.timestamp || 0);
          const isoTimestamp =
            tsSeconds > 0 ? new Date(tsSeconds * 1000).toISOString() : new Date().toISOString();

          const providerEventId = `${wamid}:${mappedStatus}:${tsSeconds || '0'}`;

          events.push({
            providerEventId,
            wabaId,
            phoneNumberId,
            eventType: 'MESSAGE_STATUS',
            wamid,
            recipientPhone: st?.recipient_id ? String(st.recipient_id) : undefined,
            status: mappedStatus,
            timestamp: isoTimestamp,
            errorCode,
            errorMessage,
            rawEvent: st,
          });
        }

        // Inbound customer messages (updates 24h customer care window)
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const wamid = String(msg?.id || '');
          const from = String(msg?.from || '');
          if (!wamid || !from) continue;

          const tsSeconds = Number(msg?.timestamp || 0);
          const isoTimestamp =
            tsSeconds > 0 ? new Date(tsSeconds * 1000).toISOString() : new Date().toISOString();

          events.push({
            providerEventId: `inbound:${wamid}`,
            wabaId,
            phoneNumberId,
            eventType: 'INBOUND_MESSAGE',
            wamid,
            senderPhone: from,
            timestamp: isoTimestamp,
            rawEvent: msg,
          });
        }
      }
    }

    return events;
  }
}

export const defaultWhatsAppProvider = new MetaWhatsAppCloudProvider();
