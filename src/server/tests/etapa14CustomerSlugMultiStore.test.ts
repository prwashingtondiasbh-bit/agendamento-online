import assert from 'assert';
import http from 'http';
import { createApp } from '../app.js';
import { paymentService } from '../payments/PaymentService.js';
import * as storage from '../storage.js';

async function runEtapa14CustomerSlugMultiStoreTests() {
  console.log('\n=====================================================================');
  console.log('🧪 ETAPA 14: ARQUITETURA DA ÁREA DA CLIENTE, VÍNCULOS PERMANENTES E SLUG');
  console.log('=====================================================================\n');

  // Isolated Pix provider for deterministic testing without external network calls
  (paymentService as any).defaultProvider = {
    name: 'MERCADO_PAGO',
    async createPixPayment(input: any) {
      const id = `mp-etapa14-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      return {
        providerPaymentId: id,
        status: 'PENDING',
        qrCode: `00020126580014BR.GOV.BCB.PIX0136${id}`,
        qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        ticketUrl: `https://www.mercadopago.com.br/payments/${id}/ticket`,
        expiresAt: input.expiresAt,
        rawResponse: { id, status: 'pending' },
      };
    },
  };

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  const jsonFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${baseUrl}${path}`, options);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  try {
    const suffix = Date.now();

    // -------------------------------------------------------------------------
    // Setup: Criar 3 Lojas (Loja A = COMPLETE com sinal, Loja B = SIMPLE, Loja C = Sem vínculo com a cliente)
    // -------------------------------------------------------------------------
    const regStoreA = await jsonFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dona Loja A',
        email: `loja-a-${suffix}@salao.com`,
        password: 'password123',
        businessName: `Loja Alpha ${suffix}`,
        phone: '(11) 91111-1111',
        plan: 'COMPLETE',
      }),
    });
    assert.strictEqual(regStoreA.status, 201, 'Deve criar Loja A (COMPLETE)');
    const tokenOwnerA = regStoreA.body.token;
    const tenantIdA = regStoreA.body.data.tenant.id;
    const slugA = regStoreA.body.data.tenant.slug;

    // Habilitar sinal obrigatório na Loja A (COMPLETE)
    const cfgStoreA = await jsonFetch('/business', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOwnerA}` },
      body: JSON.stringify({
        requireDeposit: true,
        defaultDepositPercent: 30,
        depositExpirationMinutes: 15,
      }),
    });
    assert.strictEqual(cfgStoreA.status, 200, 'Loja A deve configurar sinal obrigatório');

    const profARes = await jsonFetch('/professionals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOwnerA}` },
      body: JSON.stringify({
        name: 'Especialista Alpha',
        specialty: 'Alongamento Fibra',
        email: `prof-a-${suffix}@salao.com`,
        phone: '11999990001',
        commission: 40,
      }),
    });
    assert.strictEqual(profARes.status, 201);
    const profA = profARes.body.data;

    const servARes = await jsonFetch('/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOwnerA}` },
      body: JSON.stringify({
        name: 'Alongamento Fibra Alpha',
        durationMin: 60,
        priceCents: 20000, // R$ 200,00 -> sinal 30% = R$ 60,00 (6000 centavos)
        depositPercent: 30,
        category: 'Unhas',
        professionalIds: [profA.id],
      }),
    });
    assert.strictEqual(servARes.status, 201);
    const servA = servARes.body.data;

    // Criar Loja B (SIMPLE)
    const regStoreB = await jsonFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dona Loja B',
        email: `loja-b-${suffix}@salao.com`,
        password: 'password123',
        businessName: `Loja Beta ${suffix}`,
        phone: '(21) 92222-2222',
        plan: 'SIMPLE',
      }),
    });
    assert.strictEqual(regStoreB.status, 201, 'Deve criar Loja B (SIMPLE)');
    const tokenOwnerB = regStoreB.body.token;
    const tenantIdB = regStoreB.body.data.tenant.id;
    const slugB = regStoreB.body.data.tenant.slug;

    const profBRes = await jsonFetch('/professionals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOwnerB}` },
      body: JSON.stringify({
        name: 'Especialista Beta',
        specialty: 'Manicure Tradicional',
        email: `prof-b-${suffix}@salao.com`,
        phone: '21999990002',
        commission: 50,
      }),
    });
    assert.strictEqual(profBRes.status, 201);
    const profB = profBRes.body.data;

    const servBRes = await jsonFetch('/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOwnerB}` },
      body: JSON.stringify({
        name: 'Manicure Beta',
        durationMin: 45,
        priceCents: 8000,
        depositPercent: 0,
        category: 'Manicure',
        professionalIds: [profB.id],
      }),
    });
    assert.strictEqual(servBRes.status, 201);
    const servB = servBRes.body.data;

    // Criar Loja C (Estabelecimento no qual a cliente NUNCA se cadastrou)
    const regStoreC = await jsonFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dona Loja C',
        email: `loja-c-${suffix}@salao.com`,
        password: 'password123',
        businessName: `Loja Gamma Sem Vínculo ${suffix}`,
        phone: '(31) 93333-3333',
        plan: 'COMPLETE',
      }),
    });
    assert.strictEqual(regStoreC.status, 201, 'Deve criar Loja C');
    const tenantIdC = regStoreC.body.data.tenant.id;
    const slugC = regStoreC.body.data.tenant.slug;

    // -------------------------------------------------------------------------
    // Cenário 1: Acesso inicial da cliente por /agendar/:slug
    // -------------------------------------------------------------------------
    const publicCatalogA = await jsonFetch(`/public/tenants/${slugA}`);
    assert.strictEqual(publicCatalogA.status, 200, 'Cenário 1: Deve carregar dados públicos de /agendar/:slug');
    assert.strictEqual(publicCatalogA.body.data.business.slug, slugA);
    assert.strictEqual(publicCatalogA.body.data.services.length, 1);
    assert.strictEqual(publicCatalogA.body.data.services[0].id, servA.id);
    console.log('✅ 1. Acesso inicial da cliente por /agendar/:slug validado');

    // -------------------------------------------------------------------------
    // Cenário 2: Cadastro da cliente criando User global e Client na Loja A
    // -------------------------------------------------------------------------
    const customerEmail = `cliente.unica.${suffix}@email.com`;
    const customerPassword = 'ClientePassword123!';
    const regCustomerA = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Carolina Cliente MultiLoja',
        email: customerEmail,
        phone: '(11) 98888-7777',
        password: customerPassword,
        slug: slugA,
      }),
    });
    assert.strictEqual(regCustomerA.status, 201, 'Cenário 2: Deve cadastrar cliente na Loja A');
    const customerGlobalUserId = regCustomerA.body.data.user.id;
    const clientRecordIdA = regCustomerA.body.data.client.id;
    let customerToken = regCustomerA.body.token;
    assert.strictEqual(regCustomerA.body.data.client.tenantId, tenantIdA, 'Client deve pertencer à Loja A');
    assert.strictEqual(regCustomerA.body.data.business.slug, slugA, 'Contexto inicial deve ser Loja A');
    console.log('✅ 2. Cadastro da cliente criando User global e Client na Loja A validado');

    // -------------------------------------------------------------------------
    // Cenário 7: Cliente com uma única loja entrando diretamente no painel da loja
    // -------------------------------------------------------------------------
    const myStoresSingle = await jsonFetch('/customer/my-stores', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(myStoresSingle.status, 200);
    assert.strictEqual(myStoresSingle.body.data.hasMultipleStores, false, 'Cenário 7: Com 1 loja, hasMultipleStores deve ser false');
    assert.strictEqual(myStoresSingle.body.data.total, 1, 'Deve ter exatamente 1 loja vinculada');
    assert.strictEqual(myStoresSingle.body.data.establishments[0].slug, slugA);
    console.log('✅ 7. Cliente com uma única loja entrando diretamente no painel daquela loja validado');

    // -------------------------------------------------------------------------
    // Cenários 3 e 4: Novo acesso e cadastro/login da mesma cliente na Loja B sem duplicar User e criando Client independente na Loja B
    // -------------------------------------------------------------------------
    const regCustomerSameUserOnStoreB = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Carolina Cliente MultiLoja',
        email: customerEmail,
        phone: '(11) 98888-7777',
        password: customerPassword,
        slug: slugB,
      }),
    });
    assert.ok(
      regCustomerSameUserOnStoreB.status === 200 || regCustomerSameUserOnStoreB.status === 201,
      'Cenário 3: Deve reutilizar User global ao registrar na Loja B com mesmas credenciais'
    );
    assert.strictEqual(
      regCustomerSameUserOnStoreB.body.data.user.id,
      customerGlobalUserId,
      'Cenário 3: User ID global NÃO pode ser duplicado'
    );
    const clientRecordIdB = regCustomerSameUserOnStoreB.body.data.client.id;
    assert.notStrictEqual(clientRecordIdB, clientRecordIdA, 'Cenário 4: Client na Loja B deve ser independente do Client na Loja A');
    assert.strictEqual(regCustomerSameUserOnStoreB.body.data.client.tenantId, tenantIdB);
    customerToken = regCustomerSameUserOnStoreB.body.token;
    console.log('✅ 3 e 4. Conta global User única reutilizada na Loja B + Client independente criado na Loja B validados');

    // -------------------------------------------------------------------------
    // Cenários 5, 8 e 9: Permanência dos vínculos na Loja A e Loja B + Menu "Minhas Lojas" exibindo somente estabelecimentos vinculados
    // -------------------------------------------------------------------------
    const myStoresMulti = await jsonFetch('/customer/my-stores', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(myStoresMulti.status, 200);
    assert.strictEqual(myStoresMulti.body.data.hasMultipleStores, true, 'Cenário 8: Com 2 lojas, deve habilitar menu Minhas Lojas');
    assert.strictEqual(myStoresMulti.body.data.total, 2, 'Cenário 5: Vínculos na Loja A e Loja B devem permanecer ativos');
    const linkedSlugs = myStoresMulti.body.data.establishments.map((e: any) => e.slug);
    assert.ok(linkedSlugs.includes(slugA), 'Deve incluir Loja A');
    assert.ok(linkedSlugs.includes(slugB), 'Deve incluir Loja B');
    assert.ok(!linkedSlugs.includes(slugC), 'Cenário 9: NÃO pode exibir Loja C sem vínculo');
    console.log('✅ 5, 8 e 9. Permanência dos vínculos e menu "Minhas Lojas" exclusivo para lojas vinculadas validados');

    // -------------------------------------------------------------------------
    // Cenário 6: Persistência dos vínculos após logout e novo login
    // -------------------------------------------------------------------------
    await jsonFetch('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const reloginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerEmail,
        password: customerPassword,
        slug: slugA,
      }),
    });
    assert.strictEqual(reloginRes.status, 200, 'Cenário 6: Novo login deve funcionar');
    customerToken = reloginRes.body.token;
    assert.strictEqual(reloginRes.body.data.linkedEstablishments.length, 2, 'Cenário 6: Ambos os vínculos devem persistir após logout e login');
    console.log('✅ 6. Persistência dos vínculos após logout e novo login validada');

    // -------------------------------------------------------------------------
    // Cenários 10 e 11: Troca de loja pelo menu "Minhas Lojas" e atualização de contexto/slug
    // -------------------------------------------------------------------------
    const switchToB = await jsonFetch('/customer/switch-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ slug: slugB }),
    });
    assert.strictEqual(switchToB.status, 200, 'Cenário 10: Deve trocar para Loja B com sucesso');
    assert.strictEqual(switchToB.body.data.activeStore.slug, slugB, 'Cenário 11: Contexto ativo deve ter o slug da Loja B');
    assert.strictEqual(switchToB.body.data.linkedEstablishments.length, 2, 'Trocar de loja não deve apagar vínculo com Loja A');
    customerToken = switchToB.body.token;

    const switchToA = await jsonFetch('/customer/switch-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ slug: slugA }),
    });
    assert.strictEqual(switchToA.status, 200, 'Deve voltar para Loja A');
    assert.strictEqual(switchToA.body.data.activeStore.slug, slugA);
    customerToken = switchToA.body.token;
    console.log('✅ 10 e 11. Troca de loja pelo menu "Minhas Lojas" e atualização de contexto/slug validadas');

    // -------------------------------------------------------------------------
    // Cenários 12, 13, 14, 15, 16, 17 e 18:
    // Agendamentos em Loja A (COMPLETE com sinal pendente) e Loja B (SIMPLE confirmada),
    // isolamento por slug, aviso de sinal pendente, continuar pagamento, confirmação e expiração
    // -------------------------------------------------------------------------
    const futureDateA = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const futureDateB = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString().split('T')[0];

    // Criar agendamento na Loja A (exige sinal de 30% = R$ 60,00 -> PENDING_PAYMENT)
    const bookARes = await jsonFetch(`/public/tenants/${slugA}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        serviceId: servA.id,
        professionalId: profA.id,
        date: futureDateA,
        time: '10:00',
        clientName: 'Carolina Cliente MultiLoja',
        clientPhone: '(11) 98888-7777',
        clientEmail: customerEmail,
      }),
    });
    assert.strictEqual(bookARes.status, 201, 'Deve criar agendamento na Loja A');
    const apptA = bookARes.body.data.appointment;
    assert.strictEqual(apptA.status, 'PENDING_PAYMENT', 'Agendamento na Loja A com sinal deve iniciar PENDING_PAYMENT');
    assert.strictEqual(apptA.depositAmountCents, 6000, 'Sinal na Loja A deve ser 6000 centavos (R$ 60,00)');

    // Criar agendamento na Loja B (plano SIMPLE -> CONFIRMED sem sinal)
    const bookBRes = await jsonFetch(`/public/tenants/${slugB}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        serviceId: servB.id,
        professionalId: profB.id,
        date: futureDateB,
        time: '14:00',
        clientName: 'Carolina Cliente MultiLoja',
        clientPhone: '(11) 98888-7777',
        clientEmail: customerEmail,
      }),
    });
    assert.strictEqual(bookBRes.status, 201, 'Cenário 23: Deve criar agendamento direto na Loja B (plano SIMPLE)');
    const apptB = bookBRes.body.data.appointment;
    assert.strictEqual(apptB.status, 'CONFIRMED', 'Agendamento na Loja B (SIMPLE) deve nascer CONFIRMED');

    // Cenário 12 e 13: Consultar "Meus Agendamentos" e Painel Inicial no contexto da Loja A (?slug=slugA)
    const meStoreA = await jsonFetch(`/customer/me?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(meStoreA.status, 200);
    assert.strictEqual(meStoreA.body.data.business.slug, slugA, 'Cenário 12: Slug da Loja A preservado');
    assert.strictEqual(
      meStoreA.body.data.summary.pendingDeposits.length,
      1,
      'Cenário 15: Deve exibir exatamente 1 sinal pendente na tela inicial da Loja A'
    );
    const pendingDepositAlertA = meStoreA.body.data.summary.pendingDeposits[0];
    assert.strictEqual(pendingDepositAlertA.id, apptA.id);
    assert.strictEqual(pendingDepositAlertA.depositAmountCents, 6000);
    assert.strictEqual(pendingDepositAlertA.canContinuePayment, true, 'Cenário 16: Deve permitir Continuar pagamento');

    const apptsStoreA = await jsonFetch(`/customer/appointments?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(apptsStoreA.status, 200);
    assert.strictEqual(apptsStoreA.body.data.appointments.length, 1, 'Cenário 13: Lista da Loja A deve conter apenas agendamentos da Loja A');
    assert.strictEqual(apptsStoreA.body.data.appointments[0].id, apptA.id);

    // Consultar "Meus Agendamentos" no contexto da Loja B (?slug=slugB)
    const apptsStoreB = await jsonFetch(`/customer/appointments?slug=${encodeURIComponent(slugB)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(apptsStoreB.status, 200);
    assert.strictEqual(apptsStoreB.body.data.appointments.length, 1, 'Cenário 13: Lista da Loja B deve conter apenas agendamentos da Loja B');
    assert.strictEqual(apptsStoreB.body.data.appointments[0].id, apptB.id);
    assert.strictEqual(
      apptsStoreB.body.data.pendingDeposits.length,
      0,
      'Loja B não deve exibir o sinal pendente da Loja A'
    );
    console.log('✅ 12, 13, 15, 16 e 23. Preservação de slug, isolamento de agendamentos, sinal pendente na Loja A e planos SIMPLE/COMPLETE validados');

    // Cenário 14: Isolamento de detalhes de agendamento entre lojas (tentar abrir apptB estando no contexto da Loja A)
    const crossStoreDetail = await jsonFetch(`/customer/appointments/${apptB.id}?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(
      crossStoreDetail.status,
      403,
      'Cenário 14: Deve bloquear visualização de detalhes de agendamento de outra loja'
    );
    assert.strictEqual(crossStoreDetail.body.code || crossStoreDetail.body.error?.code, 'CROSS_STORE_APPOINTMENT_MISMATCH');

    const validStoreDetailA = await jsonFetch(`/customer/appointments/${apptA.id}?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(validStoreDetailA.status, 200, 'Cenário 16: Botão Continuar pagamento deve abrir detalhes válidos na Loja A');
    assert.strictEqual(validStoreDetailA.body.data.canContinuePayment, true);
    console.log('✅ 14. Isolamento de detalhes de agendamento entre lojas validado');

    // Cenário 17: Remoção do aviso de pendência após confirmação real do pagamento
    // Gerar pagamento Pix e confirmar no backend
    const createPixRes = await jsonFetch(`/appointments/${apptA.id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(createPixRes.status, 200, 'Deve gerar cobrança Pix para o agendamento pendente da Loja A');
    const paymentIdA = createPixRes.body.data.providerPaymentId || createPixRes.body.data.id;

    await storage.db.confirmAppointmentPayment({
      tenantId: tenantIdA,
      appointmentId: apptA.id,
      providerPaymentId: paymentIdA,
      approvedAt: new Date(),
      rawResponse: { status: 'approved', simulatedWebhook: true },
      actor: 'WEBHOOK_MERCADOPAGO',
    });

    const meStoreAAfterPaid = await jsonFetch(`/customer/me?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(meStoreAAfterPaid.status, 200);
    assert.strictEqual(
      meStoreAAfterPaid.body.data.summary.pendingDeposits.length,
      0,
      'Cenário 17: Aviso de sinal pendente deve ser removido após confirmação real do pagamento'
    );
    const detailAfterPaid = await jsonFetch(`/customer/appointments/${apptA.id}?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(detailAfterPaid.body.data.status, 'CONFIRMED');
    assert.strictEqual(detailAfterPaid.body.data.depositPaid, true);
    assert.strictEqual(detailAfterPaid.body.data.canContinuePayment, false);
    console.log('✅ 17. Remoção do aviso de pendência após confirmação real do pagamento validada');

    // Cenário 18: Tratamento correto de cobrança expirada ou cancelada
    const bookExpiredRes = await jsonFetch(`/public/tenants/${slugA}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        serviceId: servA.id,
        professionalId: profA.id,
        date: futureDateA,
        time: '15:00',
        clientName: 'Carolina Cliente MultiLoja',
        clientPhone: '(11) 98888-7777',
        clientEmail: customerEmail,
      }),
    });
    assert.strictEqual(bookExpiredRes.status, 201);
    const apptExpiredId = bookExpiredRes.body.data.appointment.id;

    // Forçar expiração retroativa no banco em memória
    const rawAppt = (storage.memoryStore.appointments as any[]).find(
      (a) => a.id === apptExpiredId && a.tenantId === tenantIdA
    );
    assert.ok(rawAppt);
    rawAppt.expiresAt = new Date(Date.now() - 60 * 1000).toISOString();

    const detailExpired = await jsonFetch(`/customer/appointments/${apptExpiredId}?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(detailExpired.status, 200);
    assert.strictEqual(detailExpired.body.data.status, 'EXPIRED', 'Cenário 18: Cobrança vencida deve transicionar para EXPIRED');
    assert.strictEqual(detailExpired.body.data.canContinuePayment, false, 'Cenário 18: Cobrança expirada não pode permitir pagamento inválido');

    const meStoreAAfterExpired = await jsonFetch(`/customer/me?slug=${encodeURIComponent(slugA)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(
      meStoreAAfterExpired.body.data.summary.pendingDeposits.length,
      0,
      'Cenário 18: Agendamento expirado não deve aparecer como sinal pendente ativo'
    );
    console.log('✅ 18. Tratamento correto de cobrança expirada ou cancelada validado');

    // -------------------------------------------------------------------------
    // Cenários 19 e 21: Bloqueio de acesso ao painel de loja sem vínculo e manipulação manual de tenantId/slug
    // -------------------------------------------------------------------------
    const accessUnlinkedStoreBySlug = await jsonFetch(`/customer/me?slug=${encodeURIComponent(slugC)}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(accessUnlinkedStoreBySlug.status, 403, 'Cenário 19: Deve bloquear acesso ao painel da Loja C sem vínculo');
    assert.strictEqual(accessUnlinkedStoreBySlug.body.code || accessUnlinkedStoreBySlug.body.error?.code, 'STORE_LINK_REQUIRED');

    const switchUnlinkedStore = await jsonFetch('/customer/switch-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ slug: slugC }),
    });
    assert.strictEqual(switchUnlinkedStore.status, 403, 'Cenário 19: Deve bloquear switch-store para Loja C sem vínculo');
    assert.strictEqual(switchUnlinkedStore.body.code || switchUnlinkedStore.body.error?.code, 'STORE_LINK_REQUIRED');

    const manipulateTenantHeader = await jsonFetch('/customer/appointments', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'x-tenant-id': tenantIdC,
      },
    });
    assert.strictEqual(manipulateTenantHeader.status, 403, 'Cenário 21: Deve bloquear manipulação manual de x-tenant-id sem vínculo');
    assert.strictEqual(manipulateTenantHeader.body.code || manipulateTenantHeader.body.error?.code, 'STORE_LINK_REQUIRED');

    const mutateTenantInProfile = await jsonFetch('/customer/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ tenantId: tenantIdC, action: 'UNLINK' }),
    });
    assert.strictEqual(mutateTenantInProfile.status, 403, 'Cenário 21: Deve bloquear alteração manual de tenantId no perfil');
    assert.strictEqual(mutateTenantInProfile.body.code || mutateTenantInProfile.body.error?.code, 'PERMANENT_LINK_PROTECTION');
    console.log('✅ 19 e 21. Bloqueio de acesso a loja sem vínculo e bloqueio de manipulação manual de tenantId/slug validados');

    // -------------------------------------------------------------------------
    // Cenário 20: Bloqueio de tentativa de desvincular estabelecimento pelo painel da cliente
    // -------------------------------------------------------------------------
    const unlinkAttempt1 = await jsonFetch(`/customer/my-stores/${tenantIdA}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(unlinkAttempt1.status, 403, 'Cenário 20: DELETE /customer/my-stores/:storeId deve ser bloqueado');
    assert.strictEqual(unlinkAttempt1.body.code || unlinkAttempt1.body.error?.code, 'PERMANENT_LINK_PROTECTION');

    const unlinkAttempt2 = await jsonFetch('/customer/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ tenantId: tenantIdA }),
    });
    assert.strictEqual(unlinkAttempt2.status, 403, 'Cenário 20: POST /customer/unlink deve ser bloqueado');
    assert.strictEqual(unlinkAttempt2.body.code || unlinkAttempt2.body.error?.code, 'PERMANENT_LINK_PROTECTION');
    console.log('✅ 20. Bloqueio de tentativa de desvincular estabelecimento pelo painel da cliente validado');

    // -------------------------------------------------------------------------
    // Cenário 22: Preservação da remoção do diretório público de empresas parceiras
    // -------------------------------------------------------------------------
    const publicDirRes = await jsonFetch('/public/directory');
    assert.strictEqual(publicDirRes.status, 404, 'Cenário 22: /public/directory deve permanecer desativado (404)');
    assert.strictEqual(publicDirRes.body.code || publicDirRes.body.error?.code, 'DIRECTORY_DISABLED');

    const customerDirRes = await jsonFetch('/customer/directory', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(customerDirRes.status, 404, 'Cenário 22: /customer/directory deve permanecer desativado (404)');
    assert.strictEqual(customerDirRes.body.code || customerDirRes.body.error?.code, 'DIRECTORY_DISABLED');
    console.log('✅ 22. Preservação da remoção do diretório público de empresas parceiras validada');

    // -------------------------------------------------------------------------
    // Cenário 24: Exceção administrativa do Master Admin com auditoria obrigatória
    // -------------------------------------------------------------------------
    const masterLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'master@agendabeauty.com.br',
        password: '123456',
      }),
    });
    assert.strictEqual(masterLoginRes.status, 200, 'Master Admin deve autenticar');
    const masterToken = masterLoginRes.body.token;

    // Tentativa sem justificativa deve falhar com 400
    const reconcileWithoutReason = await jsonFetch('/master-admin/customer-links/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        userId: customerGlobalUserId,
        targetTenantId: tenantIdA,
        clientId: clientRecordIdA,
        reason: '',
      }),
    });
    assert.strictEqual(reconcileWithoutReason.status, 400, 'Cenário 24: Reconciliação sem justificativa deve ser rejeitada');
    assert.ok(
      ['REASON_REQUIRED', 'JUSTIFICATION_REQUIRED'].includes(
        reconcileWithoutReason.body.code || reconcileWithoutReason.body.error?.code
      )
    );

    // Correção administrativa excepcional com justificativa obrigatória
    const reconcileWithReason = await jsonFetch('/master-admin/customer-links/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        userId: customerGlobalUserId,
        targetTenantId: tenantIdA,
        clientId: clientRecordIdA,
        reason: 'Auditoria de suporte #9041: Reconciliação cadastral solicitada pelo estabelecimento sem exclusão de histórico.',
      }),
    });
    assert.strictEqual(reconcileWithReason.status, 200, 'Cenário 24: Master Admin deve conseguir reconciliar vínculo com justificativa');
    assert.strictEqual(reconcileWithReason.body.data.preservedHistory, true);
    assert.ok(reconcileWithReason.body.data.auditLog.id, 'Deve gerar registro em AuditLog');
    assert.strictEqual(reconcileWithReason.body.data.auditLog.action, 'MASTER_ADMIN_CUSTOMER_LINK_RECONCILED');
    console.log('✅ 24. Exceção administrativa do Master Admin com justificativa e AuditLog validada');

    console.log('\n🎉 TODOS OS 24 CENÁRIOS DA ETAPA 14 PASSARAM COM SUCESSO!\n');
  } finally {
    server.close();
  }
}

runEtapa14CustomerSlugMultiStoreTests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 14:', err);
  process.exit(1);
});
