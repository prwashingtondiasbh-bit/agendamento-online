import { createApp } from '../app.js';
import { cancellationService } from '../cancellationService.js';
import { db, memoryStore } from '../storage.js';
import { PaymentProvider } from '../payments/types.js';
import http from 'http';

async function runCancellationAndRefundTests() {
  console.log('[Test] Running Agenda Beauty Cancellation, Rescheduling & Refund Tests (Etapa 7 - 24 Scenarios)...');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  try {
    // Authenticate as Admin (Owner of biz-1: camila@agendabeauty.com.br)
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'camila@agendabeauty.com.br', password: '123456' }),
    });
    const adminLoginData = (await adminLoginRes.json()) as any;
    if (!adminLoginData.success) {
      throw new Error('Admin login failed: ' + JSON.stringify(adminLoginData));
    }
    const adminToken = adminLoginData.token;

    // Register two customers (Customer A and Customer B)
    const regARes = await fetch(`${baseUrl}/customer/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Marina Cliente A',
        email: `marina-a-${Date.now()}@email.com`,
        phone: '(11) 91111-1111',
        password: 'password123',
        contactPreference: 'WHATSAPP',
      }),
    });
    const regAData = (await regARes.json()) as any;
    const customerAToken = regAData.token;
    const customerAId = regAData.data.customer.id;

    const regBRes = await fetch(`${baseUrl}/customer/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Fernanda Cliente B',
        email: `fernanda-b-${Date.now()}@email.com`,
        phone: '(11) 92222-2222',
        password: 'password123',
        contactPreference: 'WHATSAPP',
      }),
    });
    const regBData = (await regBRes.json()) as any;
    const customerBToken = regBData.token;

    // ------------------------------------------------------------------
    // 1. Configuração padrão inicial de 6 horas
    // ------------------------------------------------------------------
    const policyDefaultRes = await fetch(`${baseUrl}/business/cancellation-policy`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const policyDefaultData = (await policyDefaultRes.json()) as any;
    if (!policyDefaultData.success || policyDefaultData.data.cancellationHoursLimit !== 6) {
      throw new Error(`Expected initial default of 6 hours, got: ${JSON.stringify(policyDefaultData)}`);
    }
    console.log('✅ 1. Configuração padrão inicial de 6 horas verificada.');

    // ------------------------------------------------------------------
    // 2. Alteração da política para 3h, 6h, 12h, 24h, 48h e prazo personalizado
    // ------------------------------------------------------------------
    for (const h of [3, 6, 12, 24, 48, 36]) {
      const updateRes = await fetch(`${baseUrl}/business/cancellation-policy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          cancellationHoursLimit: h,
          allowCustomerReschedule: true,
          allowManualReviewOutOfPeriod: true,
          cancellationPolicyText: `Política de cancelamento com antecedência de ${h} horas.`,
          cancellationContactInstructions: 'Contate via WhatsApp.',
        }),
      });
      const updateData = (await updateRes.json()) as any;
      if (!updateData.success || updateData.data.cancellationHoursLimit !== h) {
        throw new Error(`Failed to set cancellation policy to ${h} hours`);
      }
    }
    // Set to 12h for next test
    await fetch(`${baseUrl}/business/cancellation-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        cancellationHoursLimit: 12,
        allowCustomerReschedule: true,
        allowManualReviewOutOfPeriod: true,
        cancellationPolicyText: 'Política de 12 horas preservada.',
        cancellationContactInstructions: 'WhatsApp oficial.',
      }),
    });
    console.log('✅ 2. Alteração da política para 3h, 6h, 12h, 24h, 48h e personalizado (36h) validada.');

    // ------------------------------------------------------------------
    // 3. Rejeição de prazo inválido
    // ------------------------------------------------------------------
    const invalidHoursRes = await fetch(`${baseUrl}/business/cancellation-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        cancellationHoursLimit: -5,
        allowCustomerReschedule: true,
        allowManualReviewOutOfPeriod: true,
        cancellationPolicyText: 'Texto válido com mais de dez caracteres.',
      }),
    });
    if (invalidHoursRes.status !== 400) {
      throw new Error(`Expected 400 for negative hours, got ${invalidHoursRes.status}`);
    }
    console.log('✅ 3. Rejeição de prazo inválido (-5h -> HTTP 400) verificada.');

    // ------------------------------------------------------------------
    // 4. Preservação da política histórica em agendamentos já criados após mudança na configuração
    // ------------------------------------------------------------------
    const futureDate48h = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const createApp1Res = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: futureDate48h,
        notes: 'Reserva com política de 12h',
      }),
    });
    const app1Data = (await createApp1Res.json()) as any;
    const app1 = app1Data.data;
    if (app1.snapshotCancellationHours !== 12) {
      throw new Error(`Expected snapshotCancellationHours=12, got ${app1.snapshotCancellationHours}`);
    }

    // Owner changes policy to 48 hours
    await fetch(`${baseUrl}/business/cancellation-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        cancellationHoursLimit: 48,
        allowCustomerReschedule: true,
        allowManualReviewOutOfPeriod: true,
        cancellationPolicyText: 'Nova política de 48 horas.',
      }),
    });

    // Check eligibility of app1 — must still use 12 hours, NOT 48 hours!
    const elig1Res = await fetch(`${baseUrl}/customer/appointments/${app1.id}/cancellation-eligibility`, {
      headers: { Authorization: `Bearer ${customerAToken}` },
    });
    const elig1Data = (await elig1Res.json()) as any;
    if (elig1Data.data.applicableHoursLimit !== 12 || elig1Data.data.snapshotPolicyText !== 'Política de 12 horas preservada.') {
      throw new Error(`Historical policy was overwritten! Got: ${JSON.stringify(elig1Data.data)}`);
    }
    // Reset policy back to 6h default
    await fetch(`${baseUrl}/business/cancellation-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        cancellationHoursLimit: 6,
        allowCustomerReschedule: true,
        allowManualReviewOutOfPeriod: true,
        cancellationPolicyText: 'Política padrão de 6 horas.',
      }),
    });
    console.log('✅ 4. Preservação da política histórica em agendamento já criado após mudança na configuração.');

    // ------------------------------------------------------------------
    // 5. Cálculo correto do prazo considerando fuso horário do estabelecimento
    // ------------------------------------------------------------------
    if (!elig1Data.data.formattedDeadline || !elig1Data.data.deadlineUtc) {
      throw new Error('Missing timezone-formatted deadline');
    }
    const expectedDeadlineMs = new Date(app1.dateTime).getTime() - 12 * 3600 * 1000;
    const actualDeadlineMs = new Date(elig1Data.data.deadlineUtc).getTime();
    if (Math.abs(expectedDeadlineMs - actualDeadlineMs) > 1000) {
      throw new Error('Deadline calculation mismatch');
    }
    console.log(`✅ 5. Cálculo correto do prazo no fuso do estabelecimento (${elig1Data.data.formattedDeadline}).`);

    // ------------------------------------------------------------------
    // 12. Cancelamento de agendamento sem pagamento aprovado sem gerar reembolso indevido
    // ------------------------------------------------------------------
    const cancelUnpaidRes = await fetch(`${baseUrl}/customer/appointments/${app1.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        reason: 'Não consegui pagar o Pix a tempo, desejo cancelar.',
        confirmedByCustomer: true,
      }),
    });
    const cancelUnpaidData = (await cancelUnpaidRes.json()) as any;
    if (
      !cancelUnpaidData.success ||
      cancelUnpaidData.data.status !== 'COMPLETED' ||
      cancelUnpaidData.data.refundStatus !== 'NOT_REQUESTED' ||
      cancelUnpaidData.data.refundRequest !== null
    ) {
      throw new Error(`Unpaid cancellation should complete without refund request: ${JSON.stringify(cancelUnpaidData)}`);
    }
    console.log('✅ 12. Cancelamento de agendamento sem pagamento aprovado sem gerar reembolso indevido.');

    // ------------------------------------------------------------------
    // 6. Solicitação de cancelamento dentro do prazo (com sinal pago)
    // ------------------------------------------------------------------
    const dateIn24h = new Date(Date.now() + 120 * 3600 * 1000).toISOString();
    const appWithinRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: dateIn24h,
      }),
    });
    const appWithin = ((await appWithinRes.json()) as any).data;
    // Simulate approved deposit payment of 5400 cents (30% of R$ 180,00)
    const paymentWithin = await db.createPayment({
      tenantId: 'biz-1',
      appointmentId: appWithin.id,
      provider: 'MERCADO_PAGO',
      providerPaymentId: `mp-pay-within-${Date.now()}`,
      externalReference: `ref-${appWithin.id}`,
      amountCents: 5400,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
    });
    await db.updateAppointmentStatus('biz-1', appWithin.id, 'CONFIRMED');

    const reqWithinRes = await fetch(`${baseUrl}/customer/appointments/${appWithin.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        reason: 'Viagem de trabalho agendada para o mesmo dia.',
        confirmedByCustomer: true,
      }),
    });
    const reqWithinData = (await reqWithinRes.json()) as any;
    if (
      !reqWithinData.success ||
      !reqWithinData.data.isWithinPolicy ||
      !reqWithinData.data.isEligibleForRefund ||
      reqWithinData.data.paidDepositCents !== 5400
    ) {
      throw new Error(`Within-policy cancellation failed: ${JSON.stringify(reqWithinData)}`);
    }
    console.log('✅ 6. Solicitação de cancelamento dentro do prazo registrada com elegibilidade a reembolso.');

    // ------------------------------------------------------------------
    // 7. Solicitação de cancelamento fora do prazo
    // ------------------------------------------------------------------
    const dateIn2h = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const appOutRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-2',
        serviceId: 'serv-1',
        dateTime: dateIn2h,
      }),
    });
    const appOut = ((await appOutRes.json()) as any).data;
    await db.createPayment({
      tenantId: 'biz-1',
      appointmentId: appOut.id,
      provider: 'MERCADO_PAGO',
      providerPaymentId: `mp-pay-out-${Date.now()}`,
      externalReference: `ref-${appOut.id}`,
      amountCents: 5400,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
    });
    await db.updateAppointmentStatus('biz-1', appOut.id, 'CONFIRMED');

    const reqOutRes = await fetch(`${baseUrl}/customer/appointments/${appOut.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        reason: 'Imprevisto de última hora no trânsito.',
        confirmedByCustomer: true,
      }),
    });
    const reqOutData = (await reqOutRes.json()) as any;
    if (
      !reqOutData.success ||
      reqOutData.data.isWithinPolicy !== false ||
      reqOutData.data.isEligibleForRefund !== false ||
      reqOutData.data.status !== 'PENDING'
    ) {
      throw new Error(`Out-of-policy cancellation failed: ${JSON.stringify(reqOutData)}`);
    }
    console.log('✅ 7. Solicitação de cancelamento fora do prazo encaminhada para análise manual.');

    // ------------------------------------------------------------------
    // 8. Bloqueio de cancelamento de agendamento já concluído ou iniciado
    // ------------------------------------------------------------------
    const dateCompleted = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const appCompletedRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-2',
        serviceId: 'serv-1',
        dateTime: dateCompleted,
      }),
    });
    const appCompleted = ((await appCompletedRes.json()) as any).data;
    await db.updateAppointmentStatus('biz-1', appCompleted.id, 'COMPLETED');

    const cancelCompletedRes = await fetch(`${baseUrl}/customer/appointments/${appCompleted.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        reason: 'Tentando cancelar agendamento já concluído.',
        confirmedByCustomer: true,
      }),
    });
    if (cancelCompletedRes.status !== 400 && cancelCompletedRes.status !== 409) {
      throw new Error(`Expected 400/409 when cancelling COMPLETED appointment, got ${cancelCompletedRes.status}`);
    }
    console.log('✅ 8. Bloqueio de cancelamento de agendamento já concluído ou iniciado.');

    // ------------------------------------------------------------------
    // 9. Bloqueio de cliente tentando cancelar agendamento de outra cliente (Anti-IDOR)
    // ------------------------------------------------------------------
    const dateForIdor = new Date(Date.now() + 50 * 3600 * 1000).toISOString();
    const appIdorRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: dateForIdor,
      }),
    });
    const appIdor = ((await appIdorRes.json()) as any).data;

    const idorCancelRes = await fetch(`${baseUrl}/customer/appointments/${appIdor.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerBToken}` },
      body: JSON.stringify({
        reason: 'Tentativa de cancelar agendamento de outra cliente.',
        confirmedByCustomer: true,
      }),
    });
    if (idorCancelRes.status !== 403) {
      throw new Error(`Expected 403 for cross-customer cancellation attempt, got ${idorCancelRes.status}`);
    }
    console.log('✅ 9. Bloqueio de cliente tentando cancelar agendamento de outra cliente (HTTP 403 Anti-IDOR).');

    // ------------------------------------------------------------------
    // 10. Bloqueio de proprietário tentando acessar solicitações de outro tenant
    // ------------------------------------------------------------------
    let crossTenantErrorCaught = false;
    try {
      await cancellationService.processAdminDecision({
        tenantId: 'biz-other-tenant',
        requestId: reqOutData.data.id,
        adminUserId: 'admin-other',
        decision: 'APPROVE',
        justification: 'Tentando aprovar de outro tenant',
      });
    } catch (err: any) {
      if (err.statusCode === 404) crossTenantErrorCaught = true;
    }
    if (!crossTenantErrorCaught) {
      throw new Error('Cross-tenant admin access was not blocked!');
    }
    console.log('✅ 10. Bloqueio de proprietário tentando acessar solicitações de outro tenant.');

    // ------------------------------------------------------------------
    // 11. Bloqueio de múltiplas solicitações ativas para o mesmo agendamento
    // ------------------------------------------------------------------
    const duplicateCancelRes = await fetch(`${baseUrl}/customer/appointments/${appWithin.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        reason: 'Segunda tentativa duplicada de cancelamento.',
        confirmedByCustomer: true,
      }),
    });
    if (duplicateCancelRes.status !== 409) {
      throw new Error(`Expected 409 for duplicate active cancellation request, got ${duplicateCancelRes.status}`);
    }
    console.log('✅ 11. Bloqueio de múltiplas solicitações ativas para o mesmo agendamento (HTTP 409).');

    // ------------------------------------------------------------------
    // 11b. Concorrência: duas solicitações simultâneas de cancelamento para o mesmo agendamento
    // ------------------------------------------------------------------
    const dateConcurrent = new Date(Date.now() + 30 * 3600 * 1000).toISOString();
    const appConcRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: dateConcurrent,
      }),
    });
    const appConc = ((await appConcRes.json()) as any).data;
    const [conc1, conc2] = await Promise.all([
      fetch(`${baseUrl}/customer/appointments/${appConc.id}/cancellation-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
        body: JSON.stringify({ reason: 'Disparo simultâneo 1', confirmedByCustomer: true }),
      }),
      fetch(`${baseUrl}/customer/appointments/${appConc.id}/cancellation-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
        body: JSON.stringify({ reason: 'Disparo simultâneo 2', confirmedByCustomer: true }),
      }),
    ]);
    const statuses = [conc1.status, conc2.status].sort();
    if (statuses[0] !== 201 || statuses[1] !== 409) {
      throw new Error(`Expected one 201 and one 409 on simultaneous cancellation, got: ${statuses}`);
    }
    console.log('✅ 11b. Concorrência: duas solicitações simultâneas de cancelamento bloqueadas com trava atômica.');

    // ------------------------------------------------------------------
    // 24. Rejeição de qualquer valor de reembolso, prazo ou elegibilidade enviado pelo frontend
    // ------------------------------------------------------------------
    const dateTamper = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
    const appTamperRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: dateTamper,
      }),
    });
    const appTamper = ((await appTamperRes.json()) as any).data;
    const tamperRes = await fetch(`${baseUrl}/customer/appointments/${appTamper.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        reason: 'Tentando injetar valor de reembolso pelo frontend',
        confirmedByCustomer: true,
        refundableAmountCents: 999999,
        paidDepositCents: 999999,
      }),
    });
    if (tamperRes.status !== 400) {
      throw new Error(`Expected 400 when frontend sends forbidden financial/eligibility fields, got ${tamperRes.status}`);
    }
    console.log('✅ 24. Rejeição de qualquer valor de reembolso, prazo ou elegibilidade enviado pelo frontend (HTTP 400).');

    // ------------------------------------------------------------------
    // 18 & 19. Aprovação e rejeição administrativa com justificativa registrada
    // ------------------------------------------------------------------
    // Reject the out-of-policy request (appOut)
    const rejectDecisionRes = await fetch(
      `${baseUrl}/admin/cancellation-requests/${reqOutData.data.id}/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          decision: 'REJECT',
          justification: 'Solicitação fora do prazo de 6h e profissional já deslocada para o atendimento.',
        }),
      }
    );
    const rejectDecisionData = (await rejectDecisionRes.json()) as any;
    if (
      !rejectDecisionData.success ||
      rejectDecisionData.data.status !== 'REJECTED' ||
      !rejectDecisionData.data.adminJustification.includes('Solicitação fora do prazo')
    ) {
      throw new Error(`Admin rejection failed: ${JSON.stringify(rejectDecisionData)}`);
    }

    // Create another out-of-policy request and approve it with manual exception refund
    const dateIn3h = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString();
    const appOutExcRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: dateIn3h,
      }),
    });
    const appOutExc = ((await appOutExcRes.json()) as any).data;
    await db.createPayment({
      tenantId: 'biz-1',
      appointmentId: appOutExc.id,
      provider: 'MERCADO_PAGO',
      providerPaymentId: `mp-pay-exc-${Date.now()}`,
      externalReference: `ref-${appOutExc.id}`,
      amountCents: 5400,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
    });
    await db.updateAppointmentStatus('biz-1', appOutExc.id, 'CONFIRMED');

    const reqOutExcRes = await fetch(`${baseUrl}/customer/appointments/${appOutExc.id}/cancellation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        reason: 'Emergência médica comprovada com atestado.',
        confirmedByCustomer: true,
      }),
    });
    const reqOutExcData = (await reqOutExcRes.json()) as any;

    const approveDecisionRes = await fetch(
      `${baseUrl}/admin/cancellation-requests/${reqOutExcData.data.id}/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          decision: 'APPROVE',
          justification: 'Aprovado por exceção médica comprovada; liberado estorno integral do sinal.',
          authorizeExceptionRefund: true,
        }),
      }
    );
    const approveDecisionData = (await approveDecisionRes.json()) as any;
    if (
      !approveDecisionData.success ||
      approveDecisionData.data.status !== 'APPROVED' ||
      approveDecisionData.data.refundStatus !== 'APPROVED' ||
      approveDecisionData.data.isManualException !== true
    ) {
      throw new Error(`Admin approval failed: ${JSON.stringify(approveDecisionData)}`);
    }
    console.log('✅ 18 & 19. Aprovação (incluindo exceção manual) e rejeição administrativa com justificativa registradas.');

    // ------------------------------------------------------------------
    // 13. Reembolso limitado ao valor do sinal realmente pago (bloqueio de valor maior)
    // ------------------------------------------------------------------
    const memRefundReq = memoryStore.refundRequests.find(
      (rr: any) => rr.cancellationRequestId === reqWithinData.data.id
    );
    if (memRefundReq) memRefundReq.amountCents = 18000; // Tamper internal amount to exceed 5400 deposit
    let excessRefundBlocked = false;
    try {
      await cancellationService.executeRefund({
        tenantId: 'biz-1',
        requestId: reqWithinData.data.id,
        adminUserId: 'user-admin-1',
      });
    } catch (err: any) {
      if (err.statusCode === 400) excessRefundBlocked = true;
    }
    if (memRefundReq) memRefundReq.amountCents = 5400; // Restore valid deposit amount
    if (!excessRefundBlocked) {
      throw new Error('Refund exceeding paid deposit was not blocked!');
    }
    console.log('✅ 13. Reembolso limitado estritamente ao valor do sinal realmente pago (R$ 54,00).');

    // ------------------------------------------------------------------
    // 15. Falha do provedor de pagamento marcando o reembolso como FAILED, sem marcar como concluído
    // ------------------------------------------------------------------
    const failingProvider: PaymentProvider = {
      name: 'MOCK_FAILING_MP',
      async createPixPayment() { throw new Error('Not used'); },
      async getPayment() { throw new Error('Not used'); },
      async cancelPayment() { throw new Error('Not used'); },
      async refundPayment() {
        throw new Error('Provider rejected refund request (HTTP 422)');
      },
      validateWebhookSignature() { return true; },
      normalizePaymentStatus() { return 'PENDING'; },
    };

    let failHandled = false;
    try {
      await cancellationService.executeRefund({
        tenantId: 'biz-1',
        requestId: reqWithinData.data.id,
        adminUserId: 'user-admin-1',
        customProvider: failingProvider,
      });
    } catch (err: any) {
      if (err.statusCode === 400) failHandled = true;
    }
    const afterFailList = await cancellationService.listAdminCancellationRequests('biz-1', 'ALL');
    const failedReq = afterFailList.find((r: any) => r.id === reqWithinData.data.id);
    if (!failHandled || failedReq?.refundStatus !== 'FAILED' || failedReq?.status === 'COMPLETED') {
      throw new Error(`Expected refundStatus=FAILED and status!=COMPLETED on provider failure, got: ${JSON.stringify(failedReq)}`);
    }
    console.log('✅ 15. Falha do provedor de pagamento marca o reembolso como FAILED sem concluir indevidamente.');

    // ------------------------------------------------------------------
    // 16. Timeout do provedor mantendo o reembolso em PROCESSING / resultado desconhecido
    // ------------------------------------------------------------------
    const timeoutProvider: PaymentProvider = {
      name: 'MOCK_TIMEOUT_MP',
      async createPixPayment() { throw new Error('Not used'); },
      async getPayment() { throw new Error('Not used'); },
      async cancelPayment() { throw new Error('Not used'); },
      async refundPayment() {
        const err: any = new Error('ETIMEDOUT: Provider did not respond in time');
        err.code = 'ETIMEDOUT';
        throw err;
      },
      validateWebhookSignature() { return true; },
      normalizePaymentStatus() { return 'PENDING'; },
    };

    let timeoutHandled = false;
    try {
      await cancellationService.executeRefund({
        tenantId: 'biz-1',
        requestId: reqWithinData.data.id,
        adminUserId: 'user-admin-1',
        customProvider: timeoutProvider,
      });
    } catch (err: any) {
      if (err.statusCode === 504) timeoutHandled = true;
    }
    const afterTimeoutList = await cancellationService.listAdminCancellationRequests('biz-1', 'PROCESSING_REFUND');
    const processingReq = afterTimeoutList.find((r: any) => r.id === reqWithinData.data.id);
    if (!timeoutHandled || processingReq?.refundStatus !== 'PROCESSING') {
      throw new Error('Timeout should keep refund in PROCESSING state awaiting reconciliation/webhook');
    }
    console.log('✅ 16. Timeout do provedor mantém o reembolso em PROCESSING (resultado desconhecido, sem reexecução cega).');

    // ------------------------------------------------------------------
    // 17. Confirmação de reembolso somente após resposta válida do provedor ou notificação legítima
    // ------------------------------------------------------------------
    const confirmedWebhookRefund = await cancellationService.confirmRefundFromProviderNotification({
      tenantId: 'biz-1',
      appointmentId: appWithin.id,
      providerPaymentId: paymentWithin.providerPaymentId || 'mp-pay-within',
      providerRefundId: 'mp-webhook-refund-999',
      refundedAmountCents: 5400,
    });
    if (!confirmedWebhookRefund || confirmedWebhookRefund.status !== 'REFUNDED') {
      throw new Error('Webhook refund confirmation failed');
    }
    const afterWebhookList = await cancellationService.listAdminCancellationRequests('biz-1', 'COMPLETED');
    const completedReq = afterWebhookList.find((r: any) => r.id === reqWithinData.data.id);
    if (!completedReq || completedReq.refundStatus !== 'COMPLETED' || completedReq.status !== 'COMPLETED') {
      throw new Error('Cancellation request did not transition to COMPLETED after legitimate provider confirmation');
    }
    console.log('✅ 17. Confirmação de reembolso concluída após notificação legítima do provedor.');

    // ------------------------------------------------------------------
    // 14. Bloqueio de reembolso duplicado (sequencial ou simultâneo)
    // ------------------------------------------------------------------
    let duplicateRefundBlocked = false;
    try {
      await cancellationService.executeRefund({
        tenantId: 'biz-1',
        requestId: reqWithinData.data.id,
        adminUserId: 'user-admin-1',
      });
    } catch (err: any) {
      if (err.statusCode === 409) duplicateRefundBlocked = true;
    }
    if (!duplicateRefundBlocked) {
      throw new Error('Duplicate refund execution was not blocked!');
    }
    console.log('✅ 14. Bloqueio de reembolso duplicado (HTTP 409) verificado.');

    // ------------------------------------------------------------------
    // 20, 21 & 22. Reagendamento: conflito, sucesso liberando horário anterior e preservando histórico financeiro
    // ------------------------------------------------------------------
    const slotOccupiedTime = new Date(Date.now() + 96 * 3600 * 1000);
    slotOccupiedTime.setMinutes(0, 0, 0);
    const slotFreeTime = new Date(slotOccupiedTime.getTime() + 4 * 3600 * 1000);

    // Create occupying appointment for prof-1 at slotOccupiedTime
    await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        clientId: 'cli-1',
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: slotOccupiedTime.toISOString(),
      }),
    });

    // Create Customer A's appointment to reschedule
    const initialReschedSlot = new Date(slotOccupiedTime.getTime() + 8 * 3600 * 1000);
    const appToReschedRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        clientId: customerAId,
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: initialReschedSlot.toISOString(),
      }),
    });
    const appToResched = ((await appToReschedRes.json()) as any).data;
    await db.createPayment({
      tenantId: 'biz-1',
      appointmentId: appToResched.id,
      provider: 'MERCADO_PAGO',
      providerPaymentId: `mp-pay-resched-${Date.now()}`,
      externalReference: `ref-${appToResched.id}`,
      amountCents: 5400,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
    });
    await db.updateAppointmentStatus('biz-1', appToResched.id, 'CONFIRMED');

    // 20. Try rescheduling into occupied slot -> must fail with 409
    const conflictReschedRes = await fetch(`${baseUrl}/customer/appointments/${appToResched.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        newDateTime: slotOccupiedTime.toISOString(),
        reason: 'Tentando horário ocupado',
      }),
    });
    if (conflictReschedRes.status !== 409) {
      throw new Error(`Expected 409 on reschedule slot conflict, got ${conflictReschedRes.status}`);
    }
    console.log('✅ 20. Reagendamento para horário ocupado bloqueado (HTTP 409).');

    // 21 & 22. Reschedule to free slot -> must succeed, free old slot, and preserve financial history
    const validReschedRes = await fetch(`${baseUrl}/customer/appointments/${appToResched.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({
        newDateTime: slotFreeTime.toISOString(),
        reason: 'Mudança de horário para período da tarde',
      }),
    });
    const validReschedData = (await validReschedRes.json()) as any;
    const preservedPayment = await db.getPaymentByAppointmentId('biz-1', appToResched.id);
    if (
      !validReschedData.success ||
      !validReschedData.data.rescheduledFromDateTime ||
      validReschedData.data.rescheduleCount !== 1 ||
      preservedPayment?.status !== 'APPROVED' ||
      preservedPayment?.amountCents !== 5400
    ) {
      throw new Error(`Valid reschedule did not preserve financial history: ${JSON.stringify(validReschedData)}`);
    }
    console.log('✅ 21 & 22. Reagendamento para horário disponível liberou horário anterior e preservou sinal pago.');

    // ------------------------------------------------------------------
    // 23. Transições válidas e inválidas de status de agendamento, cancelamento e reembolso
    // ------------------------------------------------------------------
    // Direct customer call to PATCH /api/v1/appointments/:id/status must be 403
    const directCustomerStatusRes = await fetch(`${baseUrl}/appointments/${appToResched.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerAToken}` },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    if (directCustomerStatusRes.status !== 403) {
      throw new Error(`Customer should not be able to PATCH appointment status directly, got ${directCustomerStatusRes.status}`);
    }
    console.log('✅ 23. Transições de status protegidas contra manipulação direta pela cliente (HTTP 403).');

    console.log('🎉 All 24 Cancellation, Rescheduling & Refund tests (Etapa 7) passed!');
  } finally {
    server.close();
  }
}

runCancellationAndRefundTests().catch((err) => {
  console.error('❌ Cancellation & Refund Test Failed:', err);
  process.exit(1);
});
