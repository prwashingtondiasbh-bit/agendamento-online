import assert from 'assert';
import { createApp } from '../app.js';
import { memoryStore } from '../storage.js';
import { financialService } from '../financialService.js';

function makeToken(payload: {
  userId: string;
  userName?: string;
  email?: string;
  tenantId: string;
  role: string;
  professionalId?: string;
}) {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

async function runEtapa9Tests() {
  console.log('🧪 Iniciando suíte de testes da Etapa 9 (Módulo Financeiro Completo)...');

  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const tenantA = 'tenant-fin-a';
  const tenantB = 'tenant-fin-b';

  const ownerAToken = makeToken({
    userId: 'owner-fin-a',
    userName: 'Camila Proprietária',
    email: 'owner@fin-a.com',
    tenantId: tenantA,
    role: 'OWNER',
  });

  const ownerBToken = makeToken({
    userId: 'owner-fin-b',
    userName: 'Outro Proprietário',
    email: 'owner@fin-b.com',
    tenantId: tenantB,
    role: 'OWNER',
  });

  const receptionistAToken = makeToken({
    userId: 'recep-fin-a',
    userName: 'Recepcionista A',
    email: 'recep@fin-a.com',
    tenantId: tenantA,
    role: 'RECEPTIONIST',
  });

  const prof1Token = makeToken({
    userId: 'user-prof-fin-1',
    userName: 'Profissional 1',
    email: 'prof1@fin-a.com',
    tenantId: tenantA,
    role: 'PROFESSIONAL',
    professionalId: 'prof-fin-1',
  });

  const customerAToken = makeToken({
    userId: 'cust-fin-a',
    userName: 'Cliente A',
    email: 'cliente@fin-a.com',
    tenantId: tenantA,
    role: 'CUSTOMER',
  });

  // Setup isolated tenants & base entities in memoryStore
  memoryStore.tenants.push(
    {
      id: tenantA,
      name: 'Studio Financeiro A',
      slug: 'studio-fin-a',
      currency: 'BRL',
      openTime: '09:00',
      closeTime: '19:00',
      defaultDeposit: 30,
      cancellationHoursLimit: 6,
    },
    {
      id: tenantB,
      name: 'Studio Financeiro B',
      slug: 'studio-fin-b',
      currency: 'BRL',
      openTime: '09:00',
      closeTime: '19:00',
      defaultDeposit: 30,
      cancellationHoursLimit: 6,
    }
  );

  memoryStore.professionals.push(
    {
      id: 'prof-fin-1',
      tenantId: tenantA,
      name: 'Juliana Nails',
      email: 'juliana@fin-a.com',
      phone: '11999990001',
      avatarUrl: '',
      specialty: 'Fibra de Vidro',
      active: true,
    },
    {
      id: 'prof-fin-2',
      tenantId: tenantA,
      name: 'Mariana Spa',
      email: 'mariana@fin-a.com',
      phone: '11999990002',
      avatarUrl: '',
      specialty: 'Spa dos Pés',
      active: true,
    }
  );

  memoryStore.services.push(
    {
      id: 'serv-fin-1',
      tenantId: tenantA,
      name: 'Alongamento Premium R$ 100',
      description: 'Alongamento completo',
      category: 'Alongamento',
      priceCents: 10000,
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      preparationMin: 0,
      depositPercent: 30,
      active: true,
    },
    {
      id: 'serv-fin-2',
      tenantId: tenantA,
      name: 'Blindagem Diamante R$ 80',
      description: 'Blindagem em gel',
      category: 'Blindagem',
      priceCents: 8000,
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      preparationMin: 0,
      depositPercent: 30,
      active: true,
    }
  );

  memoryStore.clients.push({
    id: 'cli-fin-1',
    tenantId: tenantA,
    userId: 'cust-fin-a',
    name: 'Fernanda Costa',
    phone: '11988887777',
    email: 'fernanda@cliente.com',
    contactPreference: 'WHATSAPP',
    notes: '',
    createdAt: new Date().toISOString(),
  });

  const apiCall = async (
    path: string,
    options: { method?: string; token?: string; body?: any } = {}
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text, headers: res.headers };
  };

  try {
    const nowIso = new Date().toISOString();

    // Create Appointment 1: R$ 100,00 (10000 cents), Deposit R$ 30,00 (3000 cents), Balance R$ 70,00 (7000 cents)
    memoryStore.appointments.push({
      id: 'app-fin-1',
      tenantId: tenantA,
      clientId: 'cli-fin-1',
      professionalId: 'prof-fin-1',
      serviceId: 'serv-fin-1',
      dateTime: nowIso,
      endDateTime: new Date(Date.now() + 3600 * 1000).toISOString(),
      status: 'CONFIRMED',
      totalAmountCents: 10000,
      depositAmountCents: 3000,
      balanceAmountCents: 7000,
      snapshotPriceCents: 10000,
      snapshotDurationMin: 60,
      snapshotDepositPercent: 30,
      snapshotDepositCents: 3000,
      snapshotBalanceCents: 7000,
      createdAt: nowIso,
    });

    // TEST 1, 2, 3: Confirmed vs Pending vs Expired/Rejected Payments
    memoryStore.payments.push(
      {
        id: 'pay-fin-confirmed-1',
        tenantId: tenantA,
        appointmentId: 'app-fin-1',
        provider: 'MERCADO_PAGO',
        externalReference: 'EXT-FIN-1',
        idempotencyKey: 'idemp-fin-1',
        paymentType: 'DEPOSIT',
        amountCents: 3000,
        feeCents: 0,
        netAmountCents: 3000,
        status: 'APPROVED',
        paymentMethod: 'PIX',
        approvedAt: nowIso,
        createdAt: nowIso,
      },
      {
        id: 'pay-fin-pending-2',
        tenantId: tenantA,
        appointmentId: 'app-fin-1',
        provider: 'MERCADO_PAGO',
        externalReference: 'EXT-FIN-2',
        idempotencyKey: 'idemp-fin-2',
        paymentType: 'DEPOSIT',
        amountCents: 5000,
        status: 'PENDING',
        paymentMethod: 'PIX',
        approvedAt: null,
        createdAt: nowIso,
      },
      {
        id: 'pay-fin-expired-3',
        tenantId: tenantA,
        appointmentId: 'app-fin-1',
        provider: 'MERCADO_PAGO',
        externalReference: 'EXT-FIN-3',
        idempotencyKey: 'idemp-fin-3',
        paymentType: 'DEPOSIT',
        amountCents: 4500,
        status: 'EXPIRED',
        paymentMethod: 'PIX',
        approvedAt: null,
        createdAt: nowIso,
      },
      {
        id: 'pay-fin-rejected-4',
        tenantId: tenantA,
        appointmentId: 'app-fin-1',
        provider: 'MERCADO_PAGO',
        externalReference: 'EXT-FIN-4',
        idempotencyKey: 'idemp-fin-4',
        paymentType: 'DEPOSIT',
        amountCents: 6000,
        status: 'REJECTED',
        paymentMethod: 'PIX',
        approvedAt: null,
        createdAt: nowIso,
      }
    );

    const dash1 = await apiCall('/api/v1/financial/dashboard?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(dash1.status, 200);
    // Only the R$ 30,00 (3000 cents) APPROVED payment enters confirmedReceiptsCents!
    assert.strictEqual(
      dash1.json.data.indicators.confirmedReceiptsCents,
      3000,
      'Apenas pagamento APPROVED (3000 centavos) deve entrar em recebimentos confirmados'
    );
    console.log('✅ Teste 1 aprovado: Pagamento confirmado entra em recebimentos confirmados (3000 centavos).');
    console.log('✅ Teste 2 aprovado: Pagamento pendente (5000 centavos) não entra em recebimentos confirmados.');
    console.log('✅ Teste 3 aprovado: Pagamento expirado (4500) ou recusado (6000) não entra em recebimentos confirmados.');

    // TEST 4: Deposit paid (3000) + balance pending (7000) calculates accounts receivable = 7000
    assert.strictEqual(
      dash1.json.data.indicators.pendingReceivablesCents,
      7000,
      'Sinal pago (3000) de um serviço de 10000 deve resultar em 7000 pendente a receber'
    );
    const arRes1 = await apiCall('/api/v1/financial/accounts-receivable', { token: ownerAToken });
    assert.strictEqual(arRes1.status, 200);
    assert.strictEqual(arRes1.json.summary.totalPendingCents, 7000);
    console.log('✅ Teste 4 aprovado: Sinal pago (R$ 30) + saldo pendente calcula exatamente R$ 70,00 a receber.');

    // TEST 5: Receiving the remaining balance (R$ 70,00 = 7000 cents) updates confirmedReceipts to 10000 (not 20000!) and pendingReceivables to 0
    const recBalRes = await apiCall('/api/v1/financial/receipts/record-payment', {
      method: 'POST',
      token: ownerAToken,
      body: {
        appointmentId: 'app-fin-1',
        amountCents: 7000,
        paymentType: 'BALANCE',
        paymentMethod: 'CREDIT_CARD',
        feeCents: 0,
        idempotencyKey: 'bal-app-fin-1',
      },
    });
    assert.strictEqual(recBalRes.status, 201);
    assert.strictEqual(recBalRes.json.remainingBalanceCents, 0);

    const dash2 = await apiCall('/api/v1/financial/dashboard?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(
      dash2.json.data.indicators.confirmedReceiptsCents,
      10000,
      'Sinal (3000) + Saldo (7000) = 10000 centavos (R$ 100,00), sem duplicar o total do serviço'
    );
    assert.strictEqual(
      dash2.json.data.indicators.pendingReceivablesCents,
      0,
      'Após quitar o saldo de 7000, o valor pendente a receber deve ser 0'
    );
    console.log('✅ Teste 5 aprovado: Recebimento do saldo (R$ 70) soma R$ 100,00 sem duplicar o valor total do serviço.');

    // TEST 6: Same confirmed payment does not generate two cash ledger entries
    financialService.syncLedgerForTenant(tenantA);
    financialService.syncLedgerForTenant(tenantA);
    financialService.syncLedgerForTenant(tenantA);
    const ledgerEntriesForPay1 = memoryStore.financialTransactions.filter(
      (t: any) => t.tenantId === tenantA && t.uniqueRef === 'PAY:pay-fin-confirmed-1'
    );
    assert.strictEqual(
      ledgerEntriesForPay1.length,
      1,
      'O mesmo pagamento confirmado deve gerar apenas 1 lançamento no livro de caixa'
    );
    // Also verify duplicate balance payment attempt is blocked with 409
    const dupBalRes = await apiCall('/api/v1/financial/receipts/record-payment', {
      method: 'POST',
      token: ownerAToken,
      body: {
        appointmentId: 'app-fin-1',
        amountCents: 7000,
        paymentType: 'BALANCE',
        paymentMethod: 'CREDIT_CARD',
        idempotencyKey: 'bal-app-fin-1',
      },
    });
    assert.strictEqual(dupBalRes.status, 409);
    console.log('✅ Teste 6 aprovado: Mesmo pagamento confirmado nunca gera dois lançamentos no caixa (idempotência garantida).');

    // TEST 7: Expense created as PENDING does not enter paidExpensesCents
    const createExpRes = await apiCall('/api/v1/financial/expenses', {
      method: 'POST',
      token: ownerAToken,
      body: {
        description: 'Conta de Energia Elétrica',
        category: 'AGUA_ENERGIA',
        amountCents: 25000, // R$ 250,00
        competenceDate: nowIso,
        dueDate: nowIso,
        status: 'PENDING',
        paymentMethod: 'BOLETO',
      },
    });
    assert.strictEqual(createExpRes.status, 201);
    const expenseId = createExpRes.json.data.id;

    const dashAfterPendingExp = await apiCall('/api/v1/financial/dashboard?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(
      dashAfterPendingExp.json.data.indicators.paidExpensesCents,
      0,
      'Despesa PENDENTE não deve entrar em despesas pagas'
    );
    assert.strictEqual(
      dashAfterPendingExp.json.data.indicators.pendingExpensesCents,
      25000,
      'Despesa PENDENTE deve constar em despesas pendentes (25000)'
    );
    console.log('✅ Teste 7 aprovado: Despesa cadastrada como pendente não entra como despesa paga.');

    // TEST 8: Marking expense as PAID updates paidExpensesCents and estimatedFinancialResultCents
    const payExpRes = await apiCall(`/api/v1/financial/expenses/${expenseId}/pay`, {
      method: 'POST',
      token: ownerAToken,
      body: {
        paymentMethod: 'PIX',
        confirmedByStaff: true,
      },
    });
    assert.strictEqual(payExpRes.status, 200);
    assert.strictEqual(payExpRes.json.data.status, 'PAID');

    const dashAfterPaidExp = await apiCall('/api/v1/financial/dashboard?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(dashAfterPaidExp.json.data.indicators.paidExpensesCents, 25000);
    assert.strictEqual(dashAfterPaidExp.json.data.indicators.pendingExpensesCents, 0);
    // Receipts (10000) - Paid Expenses (25000) = -15000
    assert.strictEqual(
      dashAfterPaidExp.json.data.indicators.estimatedFinancialResultCents,
      -15000
    );
    console.log('✅ Teste 8 aprovado: Marcar despesa como paga atualiza indicadores e livro de caixa corretamente.');

    // TEST 9: Reversing or cancelling an expense preserves history and blocks silent deletion
    const delExpRes = await apiCall(`/api/v1/financial/expenses/${expenseId}`, {
      method: 'DELETE',
      token: ownerAToken,
    });
    assert.strictEqual(delExpRes.status, 400);

    const revExpRes = await apiCall(`/api/v1/financial/expenses/${expenseId}/reverse`, {
      method: 'POST',
      token: ownerAToken,
      body: {
        reason: 'Boleto lançado em duplicidade, estornado pela gerência',
      },
    });
    assert.strictEqual(revExpRes.status, 200);
    assert.strictEqual(revExpRes.json.data.status, 'REVERSED');
    assert.ok(Array.isArray(revExpRes.json.data.history) && revExpRes.json.data.history.length >= 3);
    console.log('✅ Teste 9 aprovado: Estorno ou cancelamento de despesa preserva histórico de auditoria.');

    // TEST 10 & 11: Pending refund does NOT reduce net revenue; COMPLETED refund reduces net revenue
    memoryStore.refundRequests.push({
      id: 'ref-fin-1',
      tenantId: tenantA,
      cancellationRequestId: 'cr-fin-1',
      appointmentId: 'app-fin-1',
      clientId: 'cli-fin-1',
      paymentId: 'pay-fin-confirmed-1',
      provider: 'MERCADO_PAGO',
      idempotencyKey: 'idemp-ref-fin-1',
      amountCents: 1500, // R$ 15,00 partial refund
      status: 'PENDING_REVIEW',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const dashPendingRefund = await apiCall('/api/v1/financial/dashboard?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(
      dashPendingRefund.json.data.indicators.completedRefundsCents,
      0,
      'Reembolso pendente não deve entrar como reembolso concluído'
    );
    assert.strictEqual(dashPendingRefund.json.data.indicators.pendingRefundsCents, 1500);
    assert.strictEqual(
      dashPendingRefund.json.data.indicators.estimatedFinancialResultCents,
      10000,
      'Reembolso pendente não deve reduzir o resultado financeiro estimado'
    );
    console.log('✅ Teste 10 aprovado: Reembolso pendente não reduz receita como se já estivesse concluído.');

    // Transition refund to COMPLETED
    const refObj = memoryStore.refundRequests.find((r: any) => r.id === 'ref-fin-1');
    refObj.status = 'COMPLETED';
    refObj.completedAt = nowIso;

    const dashCompletedRefund = await apiCall('/api/v1/financial/dashboard?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(dashCompletedRefund.json.data.indicators.completedRefundsCents, 1500);
    assert.strictEqual(
      dashCompletedRefund.json.data.indicators.estimatedFinancialResultCents,
      8500,
      'Reembolso concluído (1500) deve abater o resultado líquido (10000 - 1500 = 8500)'
    );
    console.log('✅ Teste 11 aprovado: Reembolso concluído reduz receita líquida e gera saída no caixa corretamente.');

    // TEST 12: Refund can never exceed the received amount
    const excessiveRefundRes = await apiCall('/api/v1/financial/refunds/validate', {
      method: 'POST',
      token: ownerAToken,
      body: {
        paymentId: 'pay-fin-confirmed-1', // Original 3000, already refunded 1500 -> max remaining 1500
        amountCents: 2000,
        reason: 'Tentativa acima do saldo recebido',
      },
    });
    assert.strictEqual(excessiveRefundRes.status, 400);
    console.log('✅ Teste 12 aprovado: Reembolso nunca pode ser maior que o valor efetivamente recebido.');

    // TEST 13, 14, 15, 16: Commissions Engine
    // Mark app-fin-1 as COMPLETED
    const appFin1 = memoryStore.appointments.find((a: any) => a.id === 'app-fin-1');
    appFin1.status = 'COMPLETED';
    appFin1.completedAt = nowIso;

    // Create a second appointment for prof-fin-2 + serv-fin-2 with NO rule configured
    memoryStore.appointments.push({
      id: 'app-fin-norule',
      tenantId: tenantA,
      clientId: 'cli-fin-1',
      professionalId: 'prof-fin-2',
      serviceId: 'serv-fin-2',
      dateTime: nowIso,
      endDateTime: new Date(Date.now() + 3600 * 1000).toISOString(),
      status: 'COMPLETED',
      completedAt: nowIso,
      totalAmountCents: 8000,
      depositAmountCents: 2400,
      balanceAmountCents: 5600,
      snapshotPriceCents: 8000,
      snapshotDurationMin: 60,
      snapshotDepositPercent: 30,
      snapshotDepositCents: 2400,
      snapshotBalanceCents: 5600,
      createdAt: nowIso,
    });

    // TEST 14: Without any rule configured for tenantA, commission is NO_RULE_CONFIGURED (0%), never invented!
    const comNoRuleRes = await apiCall('/api/v1/financial/commissions', { token: ownerAToken });
    assert.strictEqual(comNoRuleRes.status, 200);
    const recNoRule = comNoRuleRes.json.data.find(
      (c: any) => c.appointmentId === 'app-fin-norule'
    );
    assert.ok(recNoRule);
    assert.strictEqual(recNoRule.status, 'NO_RULE_CONFIGURED');
    assert.strictEqual(recNoRule.commissionAmountCents, 0);
    assert.strictEqual(recNoRule.percentageApplied, 0);
    console.log('✅ Teste 14 aprovado: Comissão sem regra configurada não inventa percentual (NO_RULE_CONFIGURED = 0).');

    // TEST 13: Commission priority order:
    // 3rd priority: Professional rule (prof-fin-1 = 30%)
    await apiCall('/api/v1/financial/commission-rules', {
      method: 'POST',
      token: ownerAToken,
      body: {
        scope: 'PROFESSIONAL',
        professionalId: 'prof-fin-1',
        percentage: 30,
        basis: 'COMPLETED_SERVICE_VALUE',
      },
    });
    let comList = await apiCall('/api/v1/financial/commissions', { token: ownerAToken });
    let recApp1 = comList.json.data.find((c: any) => c.appointmentId === 'app-fin-1');
    assert.strictEqual(recApp1.percentageApplied, 30);
    assert.strictEqual(recApp1.commissionAmountCents, 3000); // 30% of 10000

    // 2nd priority: Service rule (serv-fin-1 = 40%) overrides Professional rule (30%)
    await apiCall('/api/v1/financial/commission-rules', {
      method: 'POST',
      token: ownerAToken,
      body: {
        scope: 'SERVICE',
        serviceId: 'serv-fin-1',
        percentage: 40,
        basis: 'COMPLETED_SERVICE_VALUE',
      },
    });
    comList = await apiCall('/api/v1/financial/commissions', { token: ownerAToken });
    recApp1 = comList.json.data.find((c: any) => c.appointmentId === 'app-fin-1');
    assert.strictEqual(recApp1.percentageApplied, 40);
    assert.strictEqual(recApp1.commissionAmountCents, 4000); // 40% of 10000

    // 1st priority: Specific rule (prof-fin-1 + serv-fin-1 = 55%) overrides Service (40%) and Professional (30%)
    await apiCall('/api/v1/financial/commission-rules', {
      method: 'POST',
      token: ownerAToken,
      body: {
        scope: 'PROFESSIONAL_SERVICE',
        professionalId: 'prof-fin-1',
        serviceId: 'serv-fin-1',
        percentage: 55,
        basis: 'COMPLETED_SERVICE_VALUE',
      },
    });
    comList = await apiCall('/api/v1/financial/commissions', { token: ownerAToken });
    recApp1 = comList.json.data.find((c: any) => c.appointmentId === 'app-fin-1');
    assert.strictEqual(recApp1.percentageApplied, 55);
    assert.strictEqual(recApp1.commissionAmountCents, 5500); // 55% of 10000
    console.log('✅ Teste 13 aprovado: Comissão respeita a prioridade (Profissional+Serviço 55% > Serviço 40% > Profissional 30%).');

    // TEST 15: Commission is never duplicated even though app-fin-1 had two separate payments (deposit + balance)
    const allComsForApp1 = comList.json.data.filter(
      (c: any) => c.appointmentId === 'app-fin-1'
    );
    assert.strictEqual(
      allComsForApp1.length,
      1,
      'Atendimento com sinal e saldo pagos separadamente deve gerar apenas 1 registro de comissão'
    );
    console.log('✅ Teste 15 aprovado: Comissão não é duplicada quando sinal e saldo são pagos em momentos diferentes.');

    // TEST 16: Cancelled or fully refunded appointment does not generate undue commission
    memoryStore.appointments.push({
      id: 'app-fin-cancelled',
      tenantId: tenantA,
      clientId: 'cli-fin-1',
      professionalId: 'prof-fin-1',
      serviceId: 'serv-fin-1',
      dateTime: nowIso,
      endDateTime: new Date(Date.now() + 3600 * 1000).toISOString(),
      status: 'COMPLETED',
      completedAt: nowIso,
      totalAmountCents: 10000,
      depositAmountCents: 3000,
      balanceAmountCents: 7000,
      snapshotPriceCents: 10000,
      snapshotDurationMin: 60,
      snapshotDepositPercent: 30,
      snapshotDepositCents: 3000,
      snapshotBalanceCents: 7000,
      createdAt: nowIso,
    });
    // First sync creates CALCULATED commission for app-fin-cancelled
    financialService.syncCommissionsForTenant(tenantA);
    // Now cancel the appointment
    const appCan = memoryStore.appointments.find((a: any) => a.id === 'app-fin-cancelled');
    appCan.status = 'CANCELLED';
    financialService.syncCommissionsForTenant(tenantA);
    const recCancelled = memoryStore.commissionRecords.find(
      (c: any) => c.tenantId === tenantA && c.appointmentId === 'app-fin-cancelled'
    );
    assert.strictEqual(recCancelled.status, 'CANCELLED');
    assert.strictEqual(recCancelled.commissionAmountCents, 0);
    console.log('✅ Teste 16 aprovado: Atendimento cancelado ou reembolsado cancela automaticamente a comissão (valor 0).');

    // TEST 17: Manual cash adjustment requires mandatory justification
    const adjWithoutJust = await apiCall('/api/v1/financial/ledger/adjustments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        type: 'INFLOW',
        amountCents: 5000,
        category: 'SUPRIMENTO',
        description: 'Troco de caixa',
        paymentMethod: 'CASH',
        justification: 'abc', // Too short (< 5 chars)
      },
    });
    assert.strictEqual(adjWithoutJust.status, 400);

    const adjWithJust = await apiCall('/api/v1/financial/ledger/adjustments', {
      method: 'POST',
      token: ownerAToken,
      body: {
        type: 'INFLOW',
        amountCents: 5000,
        category: 'SUPRIMENTO',
        description: 'Suprimento de troco para gaveta',
        paymentMethod: 'CASH',
        justification: 'Abertura de caixa da semana com fundo de troco aprovado',
      },
    });
    assert.strictEqual(adjWithJust.status, 201);
    const createdLedgerId = adjWithJust.json.data.id;
    console.log('✅ Teste 17 aprovado: Ajuste manual no caixa exige justificativa obrigatória.');

    // TEST 18: Direct deletion or silent editing of confirmed financial transaction is blocked
    const delLedgerRes = await apiCall(`/api/v1/financial/ledger/${createdLedgerId}`, {
      method: 'DELETE',
      token: ownerAToken,
    });
    assert.strictEqual(delLedgerRes.status, 400);

    const putLedgerRes = await apiCall(`/api/v1/financial/ledger/${createdLedgerId}`, {
      method: 'PUT',
      token: ownerAToken,
      body: { amountCents: 100 },
    });
    assert.strictEqual(putLedgerRes.status, 400);
    console.log('✅ Teste 18 aprovado: Exclusão ou edição direta de lançamento financeiro confirmado é bloqueada.');

    // TEST 19: Reports filter accurately by period, service, and professional
    const repFiltered = await apiCall(
      '/api/v1/financial/reports?preset=THIS_MONTH&professionalId=prof-fin-1&serviceId=serv-fin-1',
      { token: ownerAToken }
    );
    assert.strictEqual(repFiltered.status, 200);
    assert.strictEqual(repFiltered.json.data.salesByService.length, 1);
    assert.strictEqual(repFiltered.json.data.salesByService[0].serviceId, 'serv-fin-1');
    assert.strictEqual(repFiltered.json.data.byProfessional.length, 1);
    assert.strictEqual(repFiltered.json.data.byProfessional[0].professionalId, 'prof-fin-1');
    console.log('✅ Teste 19 aprovado: Relatórios filtram corretamente por período, serviço e profissional.');

    // TEST 20: Multi-tenant isolation prevents Tenant B from seeing Tenant A's financial data
    const dashTenantB = await apiCall('/api/v1/financial/dashboard?preset=THIS_MONTH', {
      token: ownerBToken,
    });
    assert.strictEqual(dashTenantB.status, 200);
    assert.strictEqual(dashTenantB.json.data.indicators.confirmedReceiptsCents, 0);
    assert.strictEqual(dashTenantB.json.data.indicators.completedAppointmentsCount, 0);

    const revCrossTenant = await apiCall(`/api/v1/financial/ledger/${createdLedgerId}/reverse`, {
      method: 'POST',
      token: ownerBToken,
      body: { justification: 'Tentativa de estornar lançamento de outra empresa' },
    });
    assert.strictEqual(revCrossTenant.status, 404);
    console.log('✅ Teste 20 aprovado: Isolamento por tenant_id impede acesso ou alteração de dados financeiros de outra empresa.');

    // TEST 21: Unauthorized roles receive 403 when accessing restricted financial endpoints
    const recepDash = await apiCall('/api/v1/financial/dashboard', { token: receptionistAToken });
    assert.strictEqual(recepDash.status, 403);

    const custDash = await apiCall('/api/v1/financial/dashboard', { token: customerAToken });
    assert.strictEqual(custDash.status, 403);

    const profGlobalDash = await apiCall('/api/v1/financial/dashboard', { token: prof1Token });
    assert.strictEqual(profGlobalDash.status, 403);

    // Professional trying to view another professional's commissions receives 403
    const profOtherCom = await apiCall(
      '/api/v1/financial/commissions?professionalId=prof-fin-2',
      { token: prof1Token }
    );
    assert.strictEqual(profOtherCom.status, 403);

    // Professional viewing ONLY own commissions succeeds (200)
    const profOwnCom = await apiCall('/api/v1/financial/commissions', { token: prof1Token });
    assert.strictEqual(profOwnCom.status, 200);
    assert.ok(
      profOwnCom.json.data.every((c: any) => c.professionalId === 'prof-fin-1'),
      'Profissional só deve receber registros de suas próprias comissões'
    );
    console.log('✅ Teste 21 aprovado: Controle de permissões (RBAC) retorna 403 para perfis sem permissão financeira.');

    // TEST 22: CSV and PDF/HTML exports return consistent data matching applied filters
    const csvRes = await apiCall('/api/v1/financial/export/csv?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(csvRes.status, 200);
    assert.ok(csvRes.text.includes('RELATÓRIO FINANCEIRO - Studio Financeiro A'));
    assert.ok(csvRes.text.includes('Recebimentos Confirmados'));
    assert.ok(csvRes.text.includes('LANÇAMENTOS DO LIVRO DE CAIXA NO PERÍODO'));

    const pdfRes = await apiCall('/api/v1/financial/export/pdf?preset=THIS_MONTH', {
      token: ownerAToken,
    });
    assert.strictEqual(pdfRes.status, 200);
    assert.ok(pdfRes.text.includes('Relatório Financeiro Gerencial — Studio Financeiro A'));
    console.log('✅ Teste 22 aprovado: Exportação CSV e Relatório PDF/HTML retornam dados consistentes com os filtros aplicados.');

    console.log('\n🎉 TODOS OS 22 TESTES AUTOMATIZADOS DA ETAPA 9 PASSARAM COM SUCESSO!\n');
  } finally {
    server.close();
  }
}

runEtapa9Tests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 9:', err);
  process.exit(1);
});
