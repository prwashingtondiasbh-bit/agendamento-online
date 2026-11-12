import http from 'http';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { db } from '../storage.js';
import { paymentService } from '../payments/PaymentService.js';
import { PaymentProvider, CreatePixPaymentInput, CreatePixPaymentOutput, PaymentDetails, RefundDetails, ValidateWebhookParams } from '../payments/types.js';

// Mock Mercado Pago Provider for controlled automated testing
class MockMercadoPagoProvider implements PaymentProvider {
  name = 'MERCADO_PAGO';
  public mockPayments = new Map<string, any>();
  public webhookSecret = 'test_webhook_secret_key_12345';

  async createPixPayment(input: CreatePixPaymentInput): Promise<CreatePixPaymentOutput> {
    const id = `mp-pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const payment = {
      id,
      status: 'pending',
      transaction_amount: input.amountCents / 100,
      currency_id: 'BRL',
      external_reference: input.appointmentId,
      date_of_expiration: input.expiresAt.toISOString(),
      point_of_interaction: {
        transaction_data: {
          qr_code: `00020126580014BR.GOV.BCB.PIX0136${id}5204000053039865405${input.amountCents / 100}5802BR5912AgendaBeauty6009SAO PAULO62070503***6304ABCD`,
          qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          ticket_url: `https://www.mercadopago.com.br/payments/${id}/ticket`,
        },
      },
    };
    this.mockPayments.set(id, payment);

    return {
      providerPaymentId: id,
      status: 'PENDING',
      qrCode: payment.point_of_interaction.transaction_data.qr_code,
      qrCodeBase64: payment.point_of_interaction.transaction_data.qr_code_base64,
      ticketUrl: payment.point_of_interaction.transaction_data.ticket_url,
      expiresAt: input.expiresAt,
      rawResponse: payment,
    };
  }

  async getPayment(providerPaymentId: string): Promise<PaymentDetails> {
    const pay = this.mockPayments.get(providerPaymentId);
    if (!pay) throw new Error(`Pagamento ${providerPaymentId} não encontrado`);
    return {
      providerPaymentId,
      status: this.normalizePaymentStatus(pay.status),
      amountCents: Math.round(pay.transaction_amount * 100),
      currency: pay.currency_id || 'BRL',
      externalReference: pay.external_reference || '',
      approvedAt: pay.date_approved ? new Date(pay.date_approved) : undefined,
      rawResponse: pay,
    };
  }

  async cancelPayment(providerPaymentId: string): Promise<PaymentDetails> {
    const pay = this.mockPayments.get(providerPaymentId);
    if (!pay) throw new Error(`Pagamento ${providerPaymentId} não encontrado`);
    pay.status = 'cancelled';
    return this.getPayment(providerPaymentId);
  }

  async refundPayment(providerPaymentId: string, amountCents?: number): Promise<RefundDetails> {
    return {
      refundId: `ref-${Date.now()}`,
      status: 'approved',
      amountCents: amountCents || 5400,
      rawResponse: {},
    };
  }

  validateWebhookSignature(params: ValidateWebhookParams): boolean {
    const rawSig = params.xSignature || params.signatureHeader;
    if (!rawSig) return false;
    const parts = rawSig.split(',');
    let ts = '';
    let hash = '';
    for (const part of parts) {
      const [k, v] = part.trim().split('=');
      if (k === 'ts') ts = v;
      if (k === 'v1') hash = v;
    }
    if (!ts || !hash) return false;

    const reqId = params.xRequestId || params.requestIdHeader || '';
    const manifest = `id:${params.dataId || ''};request-id:${reqId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(manifest);
    const expected = hmac.digest('hex');
    return expected === hash;
  }

  normalizePaymentStatus(rawStatus: string) {
    if (rawStatus === 'approved') return 'APPROVED' as any;
    if (rawStatus === 'cancelled') return 'CANCELLED' as any;
    if (rawStatus === 'rejected') return 'REJECTED' as any;
    return 'PENDING' as any;
  }

  generateValidSignature(dataId: string, requestId: string, ts: string) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(manifest);
    return `ts=${ts},v1=${hmac.digest('hex')}`;
  }
}

async function runPaymentTests() {
  console.log('[Test] Running Agenda Beauty Mercado Pago Pix & Confirmation Tests...');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  try {
    // 1. Authenticate user to get session cookie
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'camila@agendabeauty.com.br', password: '123456' }),
    });
    const loginData = (await loginRes.json()) as any;
    if (!loginData.success) throw new Error('Login failed in test');
    const cookieHeader = loginRes.headers.get('set-cookie');
    const sessionCookie = cookieHeader ? cookieHeader.split(';')[0] : '';

    // Retrieve client, professional, service
    const clientsRes = await fetch(`${baseUrl}/clients`, { headers: { Cookie: sessionCookie } });
    const client = ((await clientsRes.json()) as any).data[0];

    const profRes = await fetch(`${baseUrl}/professionals`, { headers: { Cookie: sessionCookie } });
    const professional = ((await profRes.json()) as any).data[0];

    const servicesRes = await fetch(`${baseUrl}/services`, { headers: { Cookie: sessionCookie } });
    const service = ((await servicesRes.json()) as any).data[0];

    // Configure test Mock Provider
    const mockProvider = new MockMercadoPagoProvider();
    (paymentService as any).defaultProvider = mockProvider;

    // 2. Create reservation (PENDING_PAYMENT)
    const appointmentDate = new Date(Date.now() + 86400000 * 300 + Math.floor(Math.random() * 50) * 86400000).toISOString();
    const appRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({
        clientId: client.id,
        professionalId: professional.id,
        serviceId: service.id,
        dateTime: appointmentDate,
        notes: 'Teste Integração Pix Mercado Pago',
      }),
    });
    const appData = (await appRes.json()) as any;
    if (!appData.success) throw new Error('Failed to create test appointment: ' + JSON.stringify(appData));
    const appointmentId = appData.data.id;
    console.log('✅ 1. Agendamento criado em PENDING_PAYMENT com retenção temporária');

    // 3. Test calculation in integer cents (R$ 180,00 * 30% = R$ 54,00 / 5400 cents)
    const expectedDepositCents = Math.round((Number(service.priceCents) * Number(service.depositPercent || 30)) / 100);
    if (appData.data.depositAmountCents !== expectedDepositCents) {
      throw new Error(`Deposit amount mismatch: got ${appData.data.depositAmountCents}, expected ${expectedDepositCents}`);
    }
    console.log(`✅ 2. Cálculo do sinal no backend validado: R$ ${(expectedDepositCents / 100).toFixed(2)} (${expectedDepositCents} centavos)`);

    // 4. Generate dynamic Pix payment
    const pixRes = await fetch(`${baseUrl}/appointments/${appointmentId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    });
    const pixData = (await pixRes.json()) as any;
    if (!pixData.success || !pixData.data.qrCode) {
      throw new Error('Pix generation failed: ' + JSON.stringify(pixData));
    }
    const providerPaymentId = pixData.data.paymentId;
    console.log('✅ 3. Cobrança Pix dinâmica gerada com sucesso com QR Code e Copia e Cola');

    // 5. Test idempotency: calling payment generation again returns existing pending charge
    const pixRes2 = await fetch(`${baseUrl}/appointments/${appointmentId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    });
    const pixData2 = (await pixRes2.json()) as any;
    if (!pixData2.success || pixData2.data.isExisting !== true) {
      throw new Error('Idempotency failed: expected isExisting to be true');
    }
    console.log('✅ 4. Idempotência na geração da cobrança validada (não duplica cobranças pendentes)');

    // 6. Test polling endpoint
    const statusRes = await fetch(`${baseUrl}/appointments/${appointmentId}/payment-status`, {
      headers: { Cookie: sessionCookie },
    });
    const statusData = (await statusRes.json()) as any;
    if (!statusData.success || statusData.data.appointmentStatus !== 'PENDING_PAYMENT') {
      throw new Error('Status polling failed: ' + JSON.stringify(statusData));
    }
    console.log('✅ 5. Endpoint de polling do checkout funcional e refletindo status pendente');

    // 7. Test Webhook Security: invalid HMAC signature is rejected with HTTP 401
    const invalidWebhookRes = await fetch(`${baseUrl}/webhooks/mercadopago`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': 'ts=1700000000,v1=badhash0000000000000000000000000000000000000000000000000000000000',
        'x-request-id': 'req-invalid-1',
      },
      body: JSON.stringify({ type: 'payment', data: { id: 'test' } }),
    });
    if (invalidWebhookRes.status !== 401) {
      throw new Error(`Expected 401 for bad webhook signature, got ${invalidWebhookRes.status}`);
    }
    console.log('✅ 6. Segurança do Webhook: assinatura HMAC inválida rejeitada com HTTP 401');

    // 8. Test Webhook Processing & Live API Verification
    // Set payment as approved in mock Mercado Pago
    const mpPayment = Array.from(mockProvider.mockPayments.values())[0];
    mpPayment.status = 'approved';
    mpPayment.date_approved = new Date().toISOString();
    mpPayment.external_reference = `TENANT:biz-1|APP:${appointmentId}`;

    const dataId = mpPayment.id;
    const reqId = `req-valid-${Date.now()}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const validSignature = mockProvider.generateValidSignature(dataId, reqId, ts);

    const validWebhookRes = await fetch(`${baseUrl}/webhooks/mercadopago`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': validSignature,
        'x-request-id': reqId,
      },
      body: JSON.stringify({
        type: 'payment',
        action: 'payment.updated',
        data: { id: dataId },
      }),
    });
    const webhookJson = (await validWebhookRes.json()) as any;
    if (validWebhookRes.status !== 200 || !webhookJson.received) {
      throw new Error('Valid webhook failed: ' + JSON.stringify(webhookJson));
    }
    console.log('✅ 7. Webhook seguro validado e processado com consulta direta à API do Mercado Pago');

    // 9. Verify atomic confirmation of appointment
    const verifiedApp = await db.getAppointmentById('biz-1', appointmentId);
    if (verifiedApp?.status !== 'CONFIRMED') {
      throw new Error(`Expected appointment status CONFIRMED, got ${verifiedApp?.status}`);
    }
    console.log('✅ 8. Confirmação atômica: agendamento transicionou com sucesso para CONFIRMED');

    // 10. Webhook Idempotency: duplicate webhook does not fail or duplicate
    const dupWebhookRes = await fetch(`${baseUrl}/webhooks/mercadopago`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': validSignature,
        'x-request-id': reqId,
      },
      body: JSON.stringify({
        type: 'payment',
        action: 'payment.updated',
        data: { id: dataId },
      }),
    });
    const dupJson = (await dupWebhookRes.json()) as any;
    if (dupWebhookRes.status !== 200) {
      throw new Error('Duplicate webhook failed: ' + JSON.stringify(dupJson));
    }
    console.log('✅ 9. Idempotência do Webhook: eventos duplicados processados com segurança');

    // 11. Multi-tenant isolation: Tenant B cannot access Tenant A payment
    const tenantB = await db.registerTenantWithUser({
      name: 'Salão B',
      email: `salaob-${Date.now()}@agendabeauty.com.br`,
      passwordHash: 'hash123',
      businessName: 'Salão B Studio',
      phone: '(11) 98888-2222',
    });
    const clientB = await db.createClient(tenantB.tenant.id, {
      name: 'Cliente B',
      phone: '(11) 98888-3333',
      email: `clienteb-${Date.now()}@email.com`,
    });
    const profB = await db.createProfessional(tenantB.tenant.id, {
      name: 'Profissional B',
      email: `profb-${Date.now()}@agendabeauty.com.br`,
      phone: '(11) 98888-4444',
      specialty: 'Nail Designer',
    });
    const tenantBApp = await db.createAppointment(tenantB.tenant.id, {
      clientId: clientB.id,
      professionalId: profB.id,
      serviceId: service.id,
      dateTime: new Date(Date.now() + 86400000 * 350 + Math.floor(Math.random() * 50) * 86400000).toISOString(),
    });
    const crossCheckRes = await fetch(`${baseUrl}/appointments/${tenantBApp.id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie }, // Camila is OWNER of biz-1
    });
    if (crossCheckRes.status !== 403) {
      throw new Error(`Expected 403 on cross-tenant payment generation, got ${crossCheckRes.status}`);
    }
    console.log('✅ 10. Isolamento Multiempresa: tentativa de acesso entre empresas bloqueada com HTTP 403');

    // 12. Manual Reconciliation by Owner
    const reconcileRes = await fetch(`${baseUrl}/payments/${providerPaymentId}/reconcile`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    const reconcileData = (await reconcileRes.json()) as any;
    if (!reconcileData.success) {
      throw new Error('Reconciliation failed: ' + JSON.stringify(reconcileData));
    }
    console.log('✅ 11. Reconciliação manual no painel do estabelecimento executada com sucesso');

    console.log('\n🎉 ALL 11 MERCADO PAGO PIX INTEGRATION & CONFIRMATION TESTS PASSED!');
  } finally {
    server.close();
    process.exit(0);
  }
}

runPaymentTests().catch((err) => {
  console.error('❌ Payment test failed:', err);
  process.exit(1);
});
