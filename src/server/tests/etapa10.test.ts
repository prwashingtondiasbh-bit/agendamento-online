import assert from 'assert';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { memoryStore } from '../storage.js';
import { defaultWhatsAppProvider } from '../whatsapp/WhatsAppProvider.js';
import {
  cancelAppointmentReminders,
  enqueueWhatsAppMessage,
  getWhatsAppConfigPublic,
  normalizeWhatsAppPhone,
  processDueScheduledReminders,
  processSingleQueuedMessage,
  processWhatsAppWebhookPost,
  recoverStuckWhatsAppMessages,
  rescheduleAppointmentReminders,
  saveWhatsAppConfig,
  scheduleAppointmentReminders,
  testAndActivateWhatsAppConnection,
  triggerAppointmentConfirmation,
  updateClientCommunicationConsent,
} from '../whatsapp/whatsappService.js';

function makeToken(payload: {
  userId: string;
  userName: string;
  email: string;
  tenantId: string;
  role: string;
}) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

async function runTests() {
  console.log('🧪 Iniciando suíte de testes automatizados — ETAPA 10 (WhatsApp Business Cloud API)...\n');

  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ownerTokenBiz1 = makeToken({
    userId: 'user-1',
    userName: 'Camila Souza',
    email: 'camila@agendabeauty.com.br',
    tenantId: 'biz-1',
    role: 'OWNER',
  });

  const ownerTokenBiz2 = makeToken({
    userId: 'user-biz2',
    userName: 'Diretora Biz 2',
    email: 'biz2@agendabeauty.com.br',
    tenantId: 'biz-2',
    role: 'OWNER',
  });

  // Ensure second tenant exists for multi-tenant isolation tests
  if (!memoryStore.tenants.find((t: any) => t.id === 'biz-2')) {
    memoryStore.tenants.push({
      id: 'biz-2',
      name: 'Studio Elegance Rio',
      slug: 'studio-elegance-rj',
      phone: '(21) 98888-7777',
      email: 'rj@elegance.com.br',
      address: 'Av. Atlântica, 500 - RJ',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      openTime: '08:00',
      closeTime: '20:00',
      defaultDeposit: 30,
      cancellationHoursLimit: 6,
      allowCustomerReschedule: true,
      allowManualReviewOutOfPeriod: true,
      cancellationPolicyText: 'Política padrão',
      cancellationContactInstructions: 'Contato WhatsApp',
      cancellationPolicyVersion: 1,
    });
  }

  let passed = 0;

  try {
    // Configure mock Meta Cloud API transport for controlled tests
    defaultWhatsAppProvider.setTransport(async (url, options) => {
      if (options.method === 'GET') {
        if (url.includes('1099990001')) {
          return {
            status: 200,
            json: async () => ({
              id: '1099990001',
              display_phone_number: '+55 11 98765-4321',
              verified_name: 'Agenda Beauty Studio São Paulo',
              quality_rating: 'GREEN',
            }),
          };
        }
        return {
          status: 401,
          json: async () => ({
            error: { code: 190, message: 'Invalid OAuth access token.' },
          }),
        };
      }

      const body = options.body ? JSON.parse(options.body) : {};
      const to = String(body.to || '');

      // Simulate transient rate limit (HTTP 429) for specific recipient marker
      if (to === '5511942900000') {
        return {
          status: 429,
          json: async () => ({
            error: {
              code: 130429,
              message: 'Rate limit hit',
              error_user_msg: 'Limite de taxa temporário atingido.',
            },
          }),
        };
      }

      // Simulate permanent error (recipient not on WhatsApp / invalid template)
      if (to === '5511900000000') {
        return {
          status: 400,
          json: async () => ({
            error: {
              code: 131026,
              message: 'Message undeliverable',
              error_user_msg: 'O número informado não possui conta ativa no WhatsApp.',
            },
          }),
        };
      }

      const wamid = `wamid.HBgM${to}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      return {
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: to, wa_id: to }],
          messages: [{ id: wamid }],
        }),
      };
    });

    // Save valid credentials for biz-1 and activate connection
    saveWhatsAppConfig(
      'biz-1',
      {
        displayName: 'Agenda Beauty Studio SP',
        businessPhone: '+55 11 98765-4321',
        phoneNumberId: '1099990001',
        wabaId: 'waba-biz-1',
        accessToken: 'EAAG_SECRET_META_TOKEN_BIZ1',
        webhookVerifyToken: 'verify-token-biz1-secret',
        appSecret: 'app-secret-biz1-hmac',
        allowedWindowStart: '08:00',
        allowedWindowEnd: '20:00',
        reminder24hEnabled: true,
        reminder3hEnabled: true,
        customReminderEnabled: true,
        customReminderHours: 6,
      },
      'user-1'
    );

    // Before validation, status must be PENDING_CREDENTIALS (never automatically CONNECTED!)
    const preTestCfg = getWhatsAppConfigPublic('biz-1');
    assert.strictEqual(
      preTestCfg.status,
      'PENDING_CREDENTIALS',
      'Status deve iniciar como PENDING_CREDENTIALS antes da validação na Meta'
    );

    const connRes = await testAndActivateWhatsAppConnection('biz-1', 'user-1');
    assert.strictEqual(connRes.connected, true);
    assert.strictEqual(connRes.config.status, 'CONNECTED');

    // =========================================================================
    // TEST 1: Padronização e validação de telefone (E.164)
    // =========================================================================
    const normBr = normalizeWhatsAppPhone('(11) 98877-6655');
    assert.strictEqual(normBr.valid, true);
    assert.strictEqual(normBr.normalizedPhone, '+5511988776655');

    const normIntl = normalizeWhatsAppPhone('+55 21 99988-7766');
    assert.strictEqual(normIntl.valid, true);
    assert.strictEqual(normIntl.normalizedPhone, '+5521999887766');

    const normInvalid = normalizeWhatsAppPhone('12345');
    assert.strictEqual(normInvalid.valid, false);
    assert.strictEqual(normInvalid.normalizedPhone, null);
    console.log('✅ Teste 1 passou: Padronização e validação de telefone em formato E.164');
    passed++;

    // =========================================================================
    // TEST 2: Bloqueio de envio para telefone inválido
    // =========================================================================
    const invalidPhoneRes = await enqueueWhatsAppMessage({
      tenantId: 'biz-1',
      referenceId: 'ref-invalid-phone',
      eventType: 'MANUAL_OPERATIONAL',
      recipientPhone: '123',
      variables: ['Cliente Teste', 'Agenda Beauty', 'Aviso'],
    });
    assert.strictEqual(invalidPhoneRes.enqueued, false);
    assert.strictEqual(invalidPhoneRes.errorCode, 'INVALID_PHONE_NUMBER');
    console.log('✅ Teste 2 passou: Bloqueio de envio para telefone inválido');
    passed++;

    // =========================================================================
    // TEST 3: Envio operacional permitido conforme preferência/regra da cliente
    // =========================================================================
    updateClientCommunicationConsent(
      'biz-1',
      'cli-1',
      {
        phone: '(11) 97777-1111',
        whatsappOptIn: true,
        promotionalConsent: false,
      },
      'user-1'
    );

    const opRes = await enqueueWhatsAppMessage({
      tenantId: 'biz-1',
      clientId: 'cli-1',
      referenceId: 'ref-op-allowed-1',
      eventType: 'MANUAL_OPERATIONAL',
      variables: ['Beatriz Lima', 'Agenda Beauty SP', 'Seu horário está confirmado.'],
    });
    assert.strictEqual(opRes.enqueued, true);
    assert.strictEqual(opRes.message?.status, 'SENT');
    assert.ok(opRes.message?.providerMessageId?.startsWith('wamid.'));
    console.log('✅ Teste 3 passou: Envio operacional permitido mesmo sem consentimento promocional');
    passed++;

    // =========================================================================
    // TEST 4: Bloqueio de envio promocional sem consentimento específico
    // =========================================================================
    const promoBlocked = await enqueueWhatsAppMessage({
      tenantId: 'biz-1',
      clientId: 'cli-1',
      referenceId: 'promo-campaign-oct',
      eventType: 'PROMOTIONAL_CAMPAIGN',
      messageCategory: 'PROMOTIONAL',
      variables: ['Beatriz Lima', 'Agenda Beauty SP', '20% OFF em Spa dos Pés'],
    });
    assert.strictEqual(promoBlocked.enqueued, false);
    assert.strictEqual(promoBlocked.errorCode, 'PROMOTIONAL_CONSENT_REQUIRED');
    console.log('✅ Teste 4 passou: Bloqueio de envio promocional sem consentimento específico');
    passed++;

    // =========================================================================
    // TEST 5: Respeito à revogação de consentimento promocional
    // =========================================================================
    updateClientCommunicationConsent(
      'biz-1',
      'cli-1',
      {
        promotionalConsent: true,
        promotionalConsentSource: 'PORTAL_CLIENTE',
      },
      'user-1'
    );

    const promoAllowed = await enqueueWhatsAppMessage({
      tenantId: 'biz-1',
      clientId: 'cli-1',
      referenceId: 'promo-campaign-Allowed-1',
      eventType: 'PROMOTIONAL_CAMPAIGN',
      messageCategory: 'PROMOTIONAL',
      variables: ['Beatriz Lima', 'Agenda Beauty SP', 'Oferta autorizada'],
    });
    assert.strictEqual(promoAllowed.enqueued, true);

    // Now revoke promotional consent
    updateClientCommunicationConsent(
      'biz-1',
      'cli-1',
      {
        revokePromotionalConsent: true,
      },
      'user-1'
    );

    const promoAfterRevoke = await enqueueWhatsAppMessage({
      tenantId: 'biz-1',
      clientId: 'cli-1',
      referenceId: 'promo-campaign-after-revoke',
      eventType: 'PROMOTIONAL_CAMPAIGN',
      messageCategory: 'PROMOTIONAL',
      variables: ['Beatriz Lima', 'Agenda Beauty SP', 'Nova oferta bloqueada'],
    });
    assert.strictEqual(promoAfterRevoke.enqueued, false);
    assert.strictEqual(promoAfterRevoke.errorCode, 'PROMOTIONAL_CONSENT_REQUIRED');
    console.log('✅ Teste 5 passou: Respeito imediato à revogação de consentimento promocional');
    passed++;

    // =========================================================================
    // TEST 6: Enfileiramento de confirmação quando o agendamento é confirmado
    // =========================================================================
    const futureApptDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const confirmedAppt = {
      id: 'app-wa-confirmed-1',
      tenantId: 'biz-1',
      clientId: 'cli-1',
      professionalId: 'prof-1',
      serviceId: 'serv-1',
      dateTime: futureApptDate,
      endDateTime: new Date(Date.now() + 50 * 3600 * 1000).toISOString(),
      status: 'CONFIRMED',
      totalAmountCents: 18000,
      depositAmountCents: 5400,
      balanceAmountCents: 12600,
      snapshotPriceCents: 18000,
      snapshotDurationMin: 120,
      snapshotDepositPercent: 30,
      snapshotDepositCents: 5400,
      snapshotBalanceCents: 12600,
      createdAt: new Date().toISOString(),
    };
    memoryStore.appointments.push(confirmedAppt);

    const confTrigger = await triggerAppointmentConfirmation(confirmedAppt.id);
    assert.strictEqual(confTrigger.enqueued, true);
    assert.strictEqual(confTrigger.message?.eventType, 'APPOINTMENT_CONFIRMATION');
    assert.strictEqual(confTrigger.message?.status, 'SENT');
    console.log('✅ Teste 6 passou: Enfileiramento e envio de confirmação quando agendamento está CONFIRMED');
    passed++;

    // =========================================================================
    // TEST 7: Não envio de confirmação quando o agendamento está pendente de pagamento
    // =========================================================================
    const pendingAppt = {
      ...confirmedAppt,
      id: 'app-wa-pending-payment-1',
      status: 'PENDING_PAYMENT',
    };
    memoryStore.appointments.push(pendingAppt);

    const pendingTrigger = await triggerAppointmentConfirmation(pendingAppt.id);
    assert.strictEqual(pendingTrigger.enqueued, false);
    assert.strictEqual(pendingTrigger.errorCode, 'APPOINTMENT_NOT_CONFIRMED');
    console.log('✅ Teste 7 passou: Não envio de confirmação quando agendamento está PENDING_PAYMENT');
    passed++;

    // =========================================================================
    // TEST 8: Não duplicação da mesma mensagem para o mesmo evento (idempotência)
    // =========================================================================
    const dupTrigger = await triggerAppointmentConfirmation(confirmedAppt.id);
    assert.strictEqual(dupTrigger.enqueued, false);
    assert.strictEqual(dupTrigger.duplicateBlocked, true);
    assert.strictEqual(dupTrigger.errorCode, 'DUPLICATE_MESSAGE_BLOCKED');
    console.log('✅ Teste 8 passou: Idempotência impede duplicação da mesma mensagem para o mesmo evento');
    passed++;

    // =========================================================================
    // TEST 9: Programar lembretes automáticos conforme configuração do estabelecimento
    // =========================================================================
    const scheduledRems = scheduleAppointmentReminders(confirmedAppt.id);
    assert.strictEqual(
      scheduledRems.length,
      3,
      'Devem ser criados 3 lembretes (24h, 3h e personalizado de 6h)'
    );
    const types = scheduledRems.map((r) => r.reminderType).sort();
    assert.deepStrictEqual(types, ['REMINDER_24H', 'REMINDER_3H', 'REMINDER_CUSTOM']);
    console.log('✅ Teste 9 passou: Programação de lembretes automáticos (24h, 3h e personalizado)');
    passed++;

    // =========================================================================
    // TEST 10: Não enviar lembrete para agendamento cancelado ou expirado
    // =========================================================================
    const cancelAppt = {
      ...confirmedAppt,
      id: 'app-wa-to-cancel-1',
      dateTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      status: 'CONFIRMED',
    };
    memoryStore.appointments.push(cancelAppt);
    scheduleAppointmentReminders(cancelAppt.id);

    // Mark appointment as CANCELLED and cancel reminders
    cancelAppt.status = 'CANCELLED';
    cancelAppointmentReminders(cancelAppt.id, 'Cancelado pela cliente');

    // Force scheduledFor into the past and run due reminders worker
    for (const r of memoryStore.whatsappReminders) {
      if (r.appointmentId === cancelAppt.id) {
        r.scheduledFor = new Date(Date.now() - 60_000).toISOString();
      }
    }
    const dueCanceledRes = await processDueScheduledReminders('biz-1');
    const sentForCancelled = memoryStore.whatsappMessages.filter(
      (m: any) => m.appointmentId === cancelAppt.id && m.eventType === 'APPOINTMENT_REMINDER'
    );
    assert.strictEqual(sentForCancelled.length, 0);
    assert.ok(dueCanceledRes.triggered === 0);
    console.log('✅ Teste 10 passou: Não envia lembrete para agendamento cancelado ou expirado');
    passed++;

    // =========================================================================
    // TEST 11: Recalcular lembretes quando o agendamento é reagendado, sem duplicar
    // =========================================================================
    const newFutureDate = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    confirmedAppt.dateTime = newFutureDate;
    const recalcRems = rescheduleAppointmentReminders(confirmedAppt.id);
    const allRemsForAppt = memoryStore.whatsappReminders.filter(
      (r: any) => r.appointmentId === confirmedAppt.id && r.status === 'SCHEDULED'
    );
    assert.strictEqual(recalcRems.length, 3);
    assert.strictEqual(
      allRemsForAppt.length,
      3,
      'Reagendamento deve recalcular os 3 lembretes sem criar duplicatas na tabela'
    );
    console.log('✅ Teste 11 passou: Recálculo de lembretes em reagendamento sem duplicação');
    passed++;

    // =========================================================================
    // TEST 12: Respeitar a janela de horário permitida para envio de lembretes
    // =========================================================================
    // Create an appointment at 06:00 AM Sao Paulo time (09:00 UTC) so 3h before is 03:00 AM Sao Paulo time (outside 08:00-20:00 window)
    const earlyMorningAppt = {
      ...confirmedAppt,
      id: 'app-wa-window-test',
      dateTime: '2027-05-10T09:00:00.000Z', // 06:00 America/Sao_Paulo
      endDateTime: '2027-05-10T11:00:00.000Z',
      status: 'CONFIRMED',
    };
    memoryStore.appointments.push(earlyMorningAppt);
    const windowRems = scheduleAppointmentReminders(
      earlyMorningAppt.id,
      new Date('2027-05-08T12:00:00.000Z')
    );
    const rem3h = windowRems.find((r) => r.reminderType === 'REMINDER_3H');
    assert.ok(rem3h, 'Lembrete de 3h deve ser criado');
    // Check that scheduledFor in America/Sao_Paulo falls within 08:00..20:00
    const spHourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    }).format(new Date(rem3h!.scheduledFor));
    const spHour = Number(spHourStr) % 24;
    assert.ok(
      spHour >= 8 && spHour <= 20,
      `Horário do lembrete ajustado (${spHour}h SP) deve respeitar a janela permitida 08:00-20:00`
    );
    console.log('✅ Teste 12 passou: Respeito à janela de horário permitida para envio de lembretes');
    passed++;

    // =========================================================================
    // TEST 13: Tratamento de falha temporária com nova tentativa controlada
    // =========================================================================
    const rateLimitRes = await enqueueWhatsAppMessage({
      tenantId: 'biz-1',
      referenceId: 'ref-ratelimit-temp',
      eventType: 'MANUAL_OPERATIONAL',
      recipientPhone: '+5511942900000',
      variables: ['Cliente RateLimit', 'Agenda Beauty', 'Teste 429'],
    });
    assert.strictEqual(rateLimitRes.enqueued, true);
    assert.strictEqual(
      rateLimitRes.message?.status,
      'PENDING',
      'Falha temporária (429) deve manter status PENDING com nextAttemptAt agendado'
    );
    assert.strictEqual(rateLimitRes.message?.attempts, 1);
    assert.strictEqual(rateLimitRes.message?.isPermanentError, false);
    assert.ok(rateLimitRes.message?.nextAttemptAt, 'Deve definir nextAttemptAt com backoff');
    console.log('✅ Teste 13 passou: Tratamento de falha temporária (HTTP 429) com backoff e nova tentativa');
    passed++;

    // =========================================================================
    // TEST 14: Tratamento de erro permanente sem repetição infinita
    // =========================================================================
    const permErrRes = await enqueueWhatsAppMessage({
      tenantId: 'biz-1',
      referenceId: 'ref-perm-error-1',
      eventType: 'MANUAL_OPERATIONAL',
      recipientPhone: '+5511900000000',
      variables: ['Cliente Inexistente', 'Agenda Beauty', 'Teste Erro Permanente'],
    });
    assert.strictEqual(permErrRes.enqueued, true);
    assert.strictEqual(permErrRes.message?.status, 'FAILED');
    assert.strictEqual(permErrRes.message?.isPermanentError, true);
    assert.strictEqual(permErrRes.message?.attempts, 1);

    // Calling processSingleQueuedMessage again must NOT retry a permanent error
    const afterRetryAttempt = await processSingleQueuedMessage(permErrRes.message!.id);
    assert.strictEqual(
      afterRetryAttempt?.attempts,
      1,
      'Erro permanente não deve incrementar novas tentativas automáticas'
    );
    console.log('✅ Teste 14 passou: Erro permanente marcado como FAILED sem repetição infinita');
    passed++;

    // =========================================================================
    // TEST 15: Recuperação segura de mensagem presa em PROCESSING
    // =========================================================================
    const stuckMsg = {
      id: 'wamsg-stuck-1',
      tenantId: 'biz-1',
      clientId: 'cli-1',
      appointmentId: null,
      referenceId: 'ref-stuck-1',
      eventType: 'MANUAL_OPERATIONAL',
      messageCategory: 'OPERATIONAL',
      recipientPhone: '+5511977771111',
      templateName: 'agenda_beauty_aviso_operacional_v1',
      templateLanguage: 'pt_BR',
      templateVariables: ['Beatriz', 'Agenda Beauty', 'Teste Stuck'],
      renderedBody: 'Teste Stuck',
      idempotencyKey: 'biz-1:MANUAL_OPERATIONAL:ref-stuck-1:+5511977771111',
      provider: 'META_CLOUD_API',
      providerMessageId: null,
      status: 'PROCESSING',
      attempts: 1,
      maxAttempts: 3,
      nextAttemptAt: null,
      lockedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Locked 5 mins ago
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryStore.whatsappMessages.push(stuckMsg);

    const recoveredCount = recoverStuckWhatsAppMessages(60_000);
    assert.ok(recoveredCount >= 1);
    assert.strictEqual(stuckMsg.status, 'PENDING');
    assert.strictEqual(stuckMsg.lockedAt, null);
    console.log('✅ Teste 15 passou: Recuperação segura de mensagem presa em PROCESSING');
    passed++;

    // =========================================================================
    // TEST 16: Verificação inicial do webhook da Meta (GET challenge)
    // =========================================================================
    const challengeRes = await fetch(
      `${baseUrl}/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token-biz1-secret&hub.challenge=CHALLENGE_META_98765`
    );
    const challengeText = await challengeRes.text();
    assert.strictEqual(challengeRes.status, 200);
    assert.strictEqual(challengeText, 'CHALLENGE_META_98765');

    const badChallengeRes = await fetch(
      `${baseUrl}/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=CHALLENGE_META_98765`
    );
    assert.strictEqual(badChallengeRes.status, 403);
    console.log('✅ Teste 16 passou: Verificação oficial de desafio GET do webhook da Meta');
    passed++;

    // =========================================================================
    // TEST 17 & TEST 18: Validação de assinatura de webhook (X-Hub-Signature-256) e rejeição de assinatura inválida
    // =========================================================================
    const targetMsg = confTrigger.message!;
    const wamid = targetMsg.providerMessageId!;

    const webhookDeliveredPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-biz-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '5511987654321',
                  phone_number_id: '1099990001',
                },
                statuses: [
                  {
                    id: wamid,
                    status: 'delivered',
                    timestamp: '1761830000',
                    recipient_id: '5511977771111',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawDeliveredStr = JSON.stringify(webhookDeliveredPayload);
    const validHmac =
      'sha256=' +
      crypto.createHmac('sha256', 'app-secret-biz1-hmac').update(rawDeliveredStr).digest('hex');

    // Test 18 first: Invalid signature must be rejected with 401
    const invalidSigRes = await fetch(`${baseUrl}/api/v1/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: rawDeliveredStr,
    });
    assert.strictEqual(invalidSigRes.status, 401);
    console.log('✅ Teste 18 passou: Rejeição de webhook com assinatura X-Hub-Signature-256 inválida (HTTP 401)');
    passed++;

    // Test 17: Valid signature accepted
    const validSigRes = await fetch(`${baseUrl}/api/v1/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': validHmac,
      },
      body: rawDeliveredStr,
    });
    const validSigJson = await validSigRes.json();
    assert.strictEqual(validSigRes.status, 200);
    assert.strictEqual(validSigJson.received, true);
    assert.strictEqual(validSigJson.processedEvents, 1);
    console.log('✅ Teste 17 passou: Validação de assinatura HMAC-SHA256 (X-Hub-Signature-256) no webhook');
    passed++;

    // =========================================================================
    // TEST 19: Atualização idempotente de status de mensagem por webhook
    // =========================================================================
    const updatedMsgInStore = memoryStore.whatsappMessages.find((m: any) => m.id === targetMsg.id);
    assert.strictEqual(updatedMsgInStore.status, 'DELIVERED');
    assert.ok(updatedMsgInStore.deliveredAt);

    // Send the exact same webhook event again -> must be ignored as duplicate
    const dupWebhookRes = await fetch(`${baseUrl}/api/v1/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': validHmac,
      },
      body: rawDeliveredStr,
    });
    const dupWebhookJson = await dupWebhookRes.json();
    assert.strictEqual(dupWebhookJson.processedEvents, 0);
    assert.strictEqual(dupWebhookJson.duplicatesIgnored, 1);
    console.log('✅ Teste 19 passou: Atualização idempotente de status de mensagem por webhook');
    passed++;

    // =========================================================================
    // TEST 20: Proteção contra atualização fora de ordem de status
    // =========================================================================
    // First advance message to READ
    const webhookReadPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-biz-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '1099990001' },
                statuses: [
                  {
                    id: wamid,
                    status: 'read',
                    timestamp: '1761830100',
                    recipient_id: '5511977771111',
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const rawReadStr = JSON.stringify(webhookReadPayload);
    const readSig =
      'sha256=' +
      crypto.createHmac('sha256', 'app-secret-biz1-hmac').update(rawReadStr).digest('hex');
    await fetch(`${baseUrl}/api/v1/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': readSig },
      body: rawReadStr,
    });
    assert.strictEqual(updatedMsgInStore.status, 'READ');

    // Now send a late out-of-order SENT webhook for the same message
    const lateSentPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-biz-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '1099990001' },
                statuses: [
                  {
                    id: wamid,
                    status: 'sent',
                    timestamp: '1761829900',
                    recipient_id: '5511977771111',
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const rawLateSent = JSON.stringify(lateSentPayload);
    const lateSentSig =
      'sha256=' +
      crypto.createHmac('sha256', 'app-secret-biz1-hmac').update(rawLateSent).digest('hex');
    const outOfOrderRes = await fetch(`${baseUrl}/api/v1/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': lateSentSig },
      body: rawLateSent,
    });
    const outOfOrderJson = await outOfOrderRes.json();
    assert.strictEqual(outOfOrderJson.outOfOrderIgnored, 1);
    assert.strictEqual(
      updatedMsgInStore.status,
      'READ',
      'Status READ jamais deve retroceder para SENT ao receber webhook atrasado'
    );
    console.log('✅ Teste 20 passou: Proteção contra atualização fora de ordem de status (READ não retrocede para SENT)');
    passed++;

    // =========================================================================
    // TEST 21: Isolamento multiempresa (API e Webhooks)
    // =========================================================================
    saveWhatsAppConfig(
      'biz-2',
      {
        displayName: 'Studio Elegance Rio',
        phoneNumberId: '2099990002',
        wabaId: 'waba-biz-2',
        accessToken: 'EAAG_SECRET_TOKEN_BIZ2',
        appSecret: 'app-secret-biz2-hmac',
      },
      'user-biz2'
    );

    // Tenant 2 querying messages must NEVER see Tenant 1's messages
    const biz2MsgsRes = await fetch(`${baseUrl}/api/v1/whatsapp/messages`, {
      headers: { Authorization: `Bearer ${ownerTokenBiz2}` },
    });
    const biz2MsgsJson = await biz2MsgsRes.json();
    assert.strictEqual(biz2MsgsJson.success, true);
    assert.strictEqual(
      biz2MsgsJson.data.messages.length,
      0,
      'Empresa B não pode visualizar mensagens da Empresa A'
    );

    // Webhook signed by Tenant 2 attempting to mutate Tenant 1's message (wamid) must be blocked!
    const crossTenantPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-biz-2',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '2099990002' },
                statuses: [
                  {
                    id: wamid,
                    status: 'failed',
                    timestamp: '1761830999',
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const crossRaw = JSON.stringify(crossTenantPayload);
    const crossSig =
      'sha256=' +
      crypto.createHmac('sha256', 'app-secret-biz2-hmac').update(crossRaw).digest('hex');
    const crossWebhookResult = processWhatsAppWebhookPost(crossRaw, crossTenantPayload, crossSig);
    assert.strictEqual(crossWebhookResult.crossTenantBlocked, 1);
    assert.strictEqual(
      updatedMsgInStore.status,
      'READ',
      'Webhook da Empresa B não pode alterar status de mensagem pertencente à Empresa A'
    );
    console.log('✅ Teste 21 passou: Isolamento multiempresa completo (API, banco e webhooks)');
    passed++;

    // =========================================================================
    // TEST 22: Não exposição de tokens/segredos na API ou no frontend
    // =========================================================================
    const cfgApiRes = await fetch(`${baseUrl}/api/v1/whatsapp/config`, {
      headers: { Authorization: `Bearer ${ownerTokenBiz1}` },
    });
    const cfgApiJson = await cfgApiRes.json();
    const serialized = JSON.stringify(cfgApiJson);

    assert.strictEqual(cfgApiJson.success, true);
    assert.strictEqual(cfgApiJson.data.config.hasAccessTokenConfigured, true);
    assert.strictEqual(cfgApiJson.data.config.hasWebhookVerifyTokenConfigured, true);
    assert.strictEqual(cfgApiJson.data.config.hasAppSecretConfigured, true);
    assert.strictEqual(
      serialized.includes('EAAG_SECRET_META_TOKEN_BIZ1'),
      false,
      'Access Token jamais deve aparecer na resposta da API'
    );
    assert.strictEqual(
      serialized.includes('verify-token-biz1-secret'),
      false,
      'Verify Token jamais deve aparecer na resposta da API'
    );
    assert.strictEqual(
      serialized.includes('app-secret-biz1-hmac'),
      false,
      'App Secret jamais deve aparecer na resposta da API'
    );
    assert.strictEqual(
      'encryptedAccessToken' in cfgApiJson.data.config,
      false,
      'Campos criptografados internos não devem ser serializados para o frontend'
    );
    console.log('✅ Teste 22 passou: Não exposição de tokens ou segredos na API ou no frontend');
    passed++;

    console.log(`\n🎉 TODOS OS ${passed}/22 TESTES DA ETAPA 10 PASSARAM COM SUCESSO!`);
  } finally {
    defaultWhatsAppProvider.setTransport(null);
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 10:', err);
  process.exit(1);
});
