import { PaymentProvider } from './types';
import { MercadoPagoPaymentProvider } from './MercadoPagoPaymentProvider';
import { db } from '../storage';

export class PaymentService {
  private defaultProvider: PaymentProvider;

  constructor(provider?: PaymentProvider) {
    this.defaultProvider = provider || new MercadoPagoPaymentProvider();
  }

  private async getProviderForTenant(tenantId?: string, customProvider?: PaymentProvider): Promise<PaymentProvider> {
    if (customProvider) return customProvider;
    if (tenantId) {
      try {
        const business = await db.getBusiness(tenantId);
        if (business?.mpAccessToken) {
          return new MercadoPagoPaymentProvider({
            accessToken: business.mpAccessToken,
            webhookSecret: business.mpWebhookSecret || undefined,
            environment: business.mpEnvironment || undefined,
          });
        }
      } catch (e) {
        // Fallback to default provider
      }
    }
    return this.defaultProvider;
  }

  private getProvider(customProvider?: PaymentProvider): PaymentProvider {
    return customProvider || this.defaultProvider;
  }

  /**
   * Generates or retrieves an existing active Pix payment for an appointment
   */
  async createPixPaymentForAppointment(
    tenantId: string,
    appointmentId: string,
    options?: { customProvider?: PaymentProvider }
  ) {
    const appointment = await db.getAppointmentById(tenantId, appointmentId);
    if (!appointment) {
      throw new Error('Agendamento não encontrado para esta empresa');
    }

    if (
      appointment.status === 'CONFIRMED' &&
      Number(appointment.depositAmountCents ?? appointment.snapshotDepositCents ?? 0) === 0
    ) {
      throw new Error(
        'Este agendamento foi confirmado sem exigência de sinal antecipado e não requer pagamento Pix.'
      );
    }

    if (appointment.status === 'CONFIRMED') {
      throw new Error('Este agendamento já está confirmado.');
    }

    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
      throw new Error(`Não é possível gerar pagamento para agendamento com status ${appointment.status}`);
    }

    const now = new Date();
    if (appointment.status === 'EXPIRED' || (appointment.expiresAt && new Date(appointment.expiresAt) < now)) {
      throw new Error('A reserva temporária deste agendamento expirou. Por favor selecione um novo horário.');
    }

    const maxTenMinutes = new Date(now.getTime() + 10 * 60 * 1000);
    const appointmentExpiresAt = appointment.expiresAt ? new Date(appointment.expiresAt) : maxTenMinutes;
    const boundedExpiresAt =
      appointmentExpiresAt.getTime() <= maxTenMinutes.getTime() ? appointmentExpiresAt : maxTenMinutes;

    // Reuse existing valid PENDING payment if still unexpired
    const existingPayment = await db.getPaymentByAppointmentId(tenantId, appointmentId);
    if (
      existingPayment &&
      existingPayment.status === 'PENDING' &&
      existingPayment.qrCode &&
      existingPayment.expiresAt &&
      new Date(existingPayment.expiresAt) > now
    ) {
      const existingExp = new Date(existingPayment.expiresAt);
      const clampedExistingExp =
        existingExp.getTime() <= boundedExpiresAt.getTime() ? existingExp : boundedExpiresAt;
      return {
        paymentId: existingPayment.id,
        appointmentId: appointment.id,
        amountCents: existingPayment.amountCents,
        status: existingPayment.status,
        qrCode: existingPayment.qrCode,
        qrCodeBase64: existingPayment.qrCodeBase64,
        ticketUrl: existingPayment.ticketUrl,
        expiresAt: clampedExistingExp.toISOString(),
        isExisting: true,
      };
    }

    const amountCents = Number(appointment.depositAmountCents || appointment.totalAmountCents || 0);
    if (amountCents <= 0) {
      throw new Error('Valor do sinal inválido para geração de cobrança.');
    }

    const provider = await this.getProviderForTenant(tenantId, options?.customProvider);
    const idempotencyKey = `mp-pix-${tenantId}-${appointmentId}-${Date.now()}`;
    const externalReference = `TENANT:${tenantId}|APP:${appointmentId}`;
    const serviceName = appointment.service?.name || 'Serviço Beauty';
    const expiresAt = boundedExpiresAt;

    let clientName = appointment.client?.name || '';
    let clientEmail = appointment.client?.email || '';
    let clientPhone = appointment.client?.phone || '';

    if (!clientName && appointment.clientId) {
      try {
        const clients = await db.getClients(tenantId);
        const foundClient = clients.find((c: any) => c.id === appointment.clientId);
        if (foundClient) {
          clientName = foundClient.name || '';
          if (!clientEmail) clientEmail = foundClient.email || '';
          if (!clientPhone) clientPhone = foundClient.phone || '';
        }
      } catch {}
    }

    const cleanClientName = clientName ? clientName.trim() : 'Cliente';
    const nameParts = cleanClientName.split(' ');
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'AgendaBeauty';
    if (!clientEmail) clientEmail = `cliente.${appointment.clientId || appointment.client?.id || 'anon'}@agendabeauty.com.br`;

    // Customer name explicitly at the beginning so it appears in the bank statement (extrato bancário)
    const pixDescription = cleanClientName !== 'Cliente'
      ? `${cleanClientName} - Sinal ${serviceName}`.substring(0, 100)
      : `Sinal ${serviceName}`.substring(0, 100);

    const providerResult = await provider.createPixPayment({
      amountCents,
      description: pixDescription,
      externalReference,
      idempotencyKey,
      expiresAt,
      payer: {
        email: clientEmail,
        firstName,
        lastName,
        phone: clientPhone,
      },
      metadata: {
        tenantId,
        appointmentId,
        serviceId: appointment.serviceId,
        clientName: cleanClientName,
      },
    });

    const paymentRecord = await db.createPayment({
      tenantId,
      appointmentId,
      provider: 'MERCADO_PAGO',
      providerPaymentId: providerResult.providerPaymentId,
      externalReference,
      idempotencyKey,
      amountCents,
      currency: 'BRL',
      status: providerResult.status,
      paymentMethod: 'PIX',
      qrCode: providerResult.qrCode,
      qrCodeBase64: providerResult.qrCodeBase64,
      ticketUrl: providerResult.ticketUrl,
      expiresAt: providerResult.expiresAt || expiresAt,
      rawResponse: providerResult.rawResponse,
    });

    return {
      paymentId: paymentRecord.id,
      appointmentId: appointment.id,
      amountCents,
      status: paymentRecord.status,
      qrCode: providerResult.qrCode,
      qrCodeBase64: providerResult.qrCodeBase64,
      ticketUrl: providerResult.ticketUrl,
      expiresAt: paymentRecord.expiresAt,
      isExisting: false,
    };
  }

  /**
   * Retrieves checkout payment and appointment status
   */
  async getPaymentStatus(
    tenantId: string,
    appointmentId: string,
    options?: { customProvider?: PaymentProvider }
  ) {
    const appointment = await db.getAppointmentById(tenantId, appointmentId);
    if (!appointment) {
      throw new Error('Agendamento não encontrado para esta empresa');
    }

    const payment = await db.getPaymentByAppointmentId(tenantId, appointmentId);

    // If appointment is already confirmed, return immediately
    if (appointment.status === 'CONFIRMED') {
      return {
        appointmentStatus: 'CONFIRMED',
        paymentStatus: 'APPROVED',
        paidAt: payment?.approvedAt || appointment.updatedAt || new Date().toISOString(),
        expiresAt: appointment.expiresAt,
      };
    }

    // If payment is pending and has a providerPaymentId, do a live status check as polling fallback
    if (payment && payment.status === 'PENDING' && payment.providerPaymentId) {
      try {
        const provider = await this.getProviderForTenant(tenantId, options?.customProvider);
        const livePayment = await provider.getPayment(payment.providerPaymentId);
        if (livePayment && livePayment.status === 'APPROVED') {
          // Confirm automatically
          const confirmResult = await db.confirmAppointmentPayment({
            tenantId,
            appointmentId,
            paymentId: payment.id,
            providerPaymentId: payment.providerPaymentId,
            approvedAt: livePayment.approvedAt || new Date(),
            rawResponse: livePayment.rawResponse,
            actor: 'POLLING_CHECKOUT',
          });
          return {
            appointmentStatus: confirmResult.appointment.status,
            paymentStatus: 'APPROVED',
            paidAt: livePayment.approvedAt || new Date().toISOString(),
            expiresAt: appointment.expiresAt,
          };
        }
      } catch (e) {
        // Fallback silently to recorded status
      }
    }

    return {
      appointmentStatus: appointment.status,
      paymentStatus: payment?.status || 'PENDING',
      expiresAt: appointment.expiresAt,
    };
  }

  /**
   * Processes an incoming Mercado Pago webhook securely
   */
  async processWebhook(params: {
    headers: Record<string, string | string[] | undefined>;
    query: any;
    body: any;
    customProvider?: PaymentProvider;
  }) {
    const { headers, query, body } = params;
    const provider = this.getProvider(params.customProvider);

    // 1. Signature validation
    const signatureHeader = (headers['x-signature'] as string) || '';
    const requestIdHeader = (headers['x-request-id'] as string) || '';
    const dataId = (body?.data?.id || query?.['data.id'] || query?.id || body?.id || '').toString();

    const isSignatureValid = provider.validateWebhookSignature({
      xSignature: signatureHeader,
      xRequestId: requestIdHeader,
      dataId,
    });

    if (!isSignatureValid) {
      await db.createWebhookEvent({
        eventType: body?.type || query?.type || 'UNKNOWN',
        resourceId: dataId,
        payload: { body, query, headers: { 'x-signature': signatureHeader, 'x-request-id': requestIdHeader } },
        processingStatus: 'IGNORED',
      });
      throw new Error('Assinatura do webhook inválida ou ausente');
    }

    // 2. Identify event and resource
    const eventType = body?.type || body?.action || query?.type || query?.topic || 'payment';
    const providerEventId = (headers['x-request-id'] as string) || (body?.id ? String(body.id) : undefined);

    // Idempotency: verify if event was already processed
    if (providerEventId) {
      const existingEvent = await db.getWebhookEventByProviderEventId('MERCADO_PAGO', providerEventId);
      if (existingEvent && existingEvent.processingStatus === 'PROCESSED') {
        return { status: 'ALREADY_PROCESSED', eventId: existingEvent.id };
      }
    }

    const webhookEvent = await db.createWebhookEvent({
      provider: 'MERCADO_PAGO',
      providerEventId,
      resourceId: dataId,
      eventType: String(eventType),
      payload: { body, query },
      processingStatus: 'PENDING',
    });

    // 3. We only handle payment events
    const isPaymentEvent =
      eventType === 'payment' ||
      eventType === 'payment.created' ||
      eventType === 'payment.updated' ||
      query?.topic === 'payment';

    if (!isPaymentEvent || !dataId) {
      await db.updateWebhookEvent(webhookEvent.id, {
        processingStatus: 'IGNORED',
        processedAt: new Date(),
      });
      return { status: 'IGNORED', reason: 'Not a payment resource' };
    }

    // 4. Live fetch from Mercado Pago API - NEVER trust the payload alone!
    try {
      const paymentDetails = await provider.getPayment(dataId);
      if (!paymentDetails) {
        throw new Error(`Pagamento ${dataId} não encontrado no Mercado Pago`);
      }

      // 5. Parse external reference: TENANT:<tenantId>|APP:<appointmentId>
      const extRef = paymentDetails.externalReference || '';
      const tenantMatch = extRef.match(/TENANT:([^|]+)/);
      const appMatch = extRef.match(/APP:([^|]+)/);

      if (!tenantMatch || !appMatch) {
        throw new Error(`Referência externa inválida no Mercado Pago: ${extRef}`);
      }

      const tenantId = tenantMatch[1];
      const appointmentId = appMatch[1];

      // Update webhook event with identified tenantId
      await db.updateWebhookEvent(webhookEvent.id, { tenantId });

      // 6. Handle payment status
      if (paymentDetails.status === 'APPROVED') {
        const confirmResult = await db.confirmAppointmentPayment({
          tenantId,
          appointmentId,
          providerPaymentId: dataId,
          approvedAt: paymentDetails.approvedAt || new Date(),
          rawResponse: paymentDetails.rawResponse,
          actor: 'WEBHOOK_MERCADOPAGO',
        });

        await db.updateWebhookEvent(webhookEvent.id, {
          processingStatus: 'PROCESSED',
          processedAt: new Date(),
        });

        return {
          status: 'CONFIRMED',
          appointmentId: confirmResult.appointment.id,
          tenantId,
        };
      } else if (paymentDetails.status === 'REFUNDED') {
        const { cancellationService } = await import('../cancellationService.js');
        const refundResult = await cancellationService.confirmRefundFromProviderNotification({
          tenantId,
          appointmentId,
          providerPaymentId: dataId,
          rawResponse: paymentDetails.rawResponse,
          actor: 'WEBHOOK_MERCADOPAGO',
        });

        await db.updateWebhookEvent(webhookEvent.id, {
          processingStatus: 'PROCESSED',
          processedAt: new Date(),
        });

        return refundResult;
      } else if (paymentDetails.status === 'REJECTED' || paymentDetails.status === 'CANCELLED') {
        const pay = await db.getPaymentByExternalReference(extRef);
        if (pay) {
          await db.updatePayment(pay.id, {
            status: paymentDetails.status,
            rawResponse: paymentDetails.rawResponse,
          });
        }
        await db.updateWebhookEvent(webhookEvent.id, {
          processingStatus: 'PROCESSED',
          processedAt: new Date(),
        });
        return { status: paymentDetails.status, tenantId, appointmentId };
      }

      await db.updateWebhookEvent(webhookEvent.id, {
        processingStatus: 'PROCESSED',
        processedAt: new Date(),
      });

      return { status: paymentDetails.status, tenantId, appointmentId };
    } catch (err: any) {
      await db.updateWebhookEvent(webhookEvent.id, {
        processingStatus: 'FAILED',
        lastError: err.message || String(err),
      });
      throw err;
    }
  }

  /**
   * Lists payments for a tenant
   */
  async listPayments(tenantId: string, filters?: { status?: string; startDate?: string; endDate?: string }) {
    return await db.listPayments(tenantId, filters);
  }

  /**
   * Admin manual reconciliation
   */
  async reconcilePayment(tenantId: string, paymentId: string, options?: { customProvider?: PaymentProvider }) {
    const payment = await db.getPaymentById(tenantId, paymentId);
    if (!payment) {
      throw new Error('Pagamento não encontrado');
    }

    if (payment.status === 'APPROVED') {
      return { success: true, message: 'Pagamento já aprovado previamente.', payment };
    }

    if (!payment.providerPaymentId) {
      throw new Error('Pagamento sem identificador do provedor para reconciliação.');
    }

    const provider = this.getProvider(options?.customProvider);
    const details = await provider.getPayment(payment.providerPaymentId);

    if (details.status === 'APPROVED') {
      const result = await db.confirmAppointmentPayment({
        tenantId,
        appointmentId: payment.appointmentId,
        paymentId: payment.id,
        providerPaymentId: payment.providerPaymentId,
        approvedAt: details.approvedAt || new Date(),
        rawResponse: details.rawResponse,
        actor: 'ADMIN_RECONCILE',
      });
      return { success: true, message: 'Pagamento aprovado e agendamento confirmado com sucesso.', result };
    }

    await db.updatePayment(payment.id, {
      status: details.status,
      rawResponse: details.rawResponse,
    });

    return {
      success: false,
      message: `Status atual no Mercado Pago: ${details.status}`,
      status: details.status,
    };
  }
}

export const paymentService = new PaymentService();
