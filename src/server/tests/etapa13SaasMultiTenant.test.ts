import assert from 'assert';
import http from 'http';
import { createApp } from '../app.js';
import { paymentService } from '../payments/PaymentService.js';

async function runEtapa13Tests() {
  console.log('\n=====================================================================');
  console.log('🧪 ETAPA 13: TESTES AUTOMATIZADOS SAAS MULTIEMPRESA, PLANOS E MASTER ADMIN');
  console.log('=====================================================================\n');

  // Configure isolated test Pix provider so tests never make external network calls
  (paymentService as any).defaultProvider = {
    name: 'MERCADO_PAGO',
    async createPixPayment(input: any) {
      const id = `mp-test-${Date.now()}`;
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
    // -------------------------------------------------------------------------
    // 1. Criação de múltiplas empresas com isolamento de dados
    // -------------------------------------------------------------------------
    const suffix = Date.now();
    const regSalonARes = await jsonFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Proprietária Studio Alpha',
        email: `alpha-${suffix}@salao.com`,
        password: 'password123',
        businessName: `Studio Alpha ${suffix}`,
        phone: '(11) 91111-2222',
        plan: 'COMPLETE',
      }),
    });
    assert.strictEqual(regSalonARes.status, 201, 'Deve criar Empresa Alpha');
    const tokenSalonA = regSalonARes.body.token;
    const tenantIdA = regSalonARes.body.data.tenant.id;
    const slugA = regSalonARes.body.data.tenant.slug;

    const regSalonBRes = await jsonFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Proprietária Studio Beta',
        email: `beta-${suffix}@salao.com`,
        password: 'password123',
        businessName: `Studio Beta ${suffix}`,
        phone: '(21) 93333-4444',
        plan: 'SIMPLE',
      }),
    });
    assert.strictEqual(regSalonBRes.status, 201, 'Deve criar Empresa Beta');
    const tokenSalonB = regSalonBRes.body.token;
    const tenantIdB = regSalonBRes.body.data.tenant.id;
    const slugB = regSalonBRes.body.data.tenant.slug;

    assert.notStrictEqual(tenantIdA, tenantIdB, 'Tenant IDs devem ser distintos');
    assert.notStrictEqual(slugA, slugB, 'Slugs públicos devem ser distintos');

    // Criar serviço e profissional em Alpha e em Beta
    const profARes = await jsonFetch('/professionals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonA}` },
      body: JSON.stringify({
        name: 'Profissional Alpha',
        specialty: 'Alongamento Gel',
        email: `prof-a-${suffix}@salao.com`,
        phone: '11999990001',
        commission: 40,
      }),
    });
    assert.strictEqual(profARes.status, 201);
    const profA = profARes.body.data;

    const servARes = await jsonFetch('/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonA}` },
      body: JSON.stringify({
        name: 'Serviço Exclusivo Alpha',
        durationMin: 60,
        priceCents: 20000,
        depositPercent: 30,
        category: 'Gel',
        professionalIds: [profA.id],
      }),
    });
    assert.strictEqual(servARes.status, 201);
    const servA = servARes.body.data;

    const profBRes = await jsonFetch('/professionals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonB}` },
      body: JSON.stringify({
        name: 'Profissional Beta',
        specialty: 'Manicure Clássica',
        email: `prof-b-${suffix}@salao.com`,
        phone: '21999990002',
        commission: 50,
      }),
    });
    assert.strictEqual(profBRes.status, 201);
    const profB = profBRes.body.data;

    const servBRes = await jsonFetch('/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonB}` },
      body: JSON.stringify({
        name: 'Serviço Exclusivo Beta',
        durationMin: 45,
        priceCents: 9000,
        depositPercent: 30,
        category: 'Manicure',
        professionalIds: [profB.id],
      }),
    });
    assert.strictEqual(servBRes.status, 201);
    const servB = servBRes.body.data;

    console.log('✅ [1/18] Criação de múltiplas empresas com isolamento de catálogo e profissionais validada');

    // -------------------------------------------------------------------------
    // 2. Bloqueio de acesso cruzado entre empresas (Tenant A não acessa Tenant B)
    // -------------------------------------------------------------------------
    const listServFromB = await jsonFetch('/services', {
      headers: { Authorization: `Bearer ${tokenSalonB}` },
    });
    assert.strictEqual(
      listServFromB.body.data.some((s: any) => s.id === servA.id),
      false,
      'Empresa B não pode listar serviços da Empresa A'
    );

    const editServAFromB = await jsonFetch(`/services/${servA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonB}` },
      body: JSON.stringify({ name: 'Tentativa Invasão Cross-Tenant' }),
    });
    assert.strictEqual(editServAFromB.status, 404, 'Empresa B não pode editar serviço da Empresa A');
    console.log('✅ [2/18] Bloqueio de acesso cruzado (Cross-Tenant IDOR) entre empresas validado');

    // -------------------------------------------------------------------------
    // 3. Cadastro e login de cliente com conta global única
    // -------------------------------------------------------------------------
    const custEmail = `cliente-multi-${suffix}@email.com`;
    const custRegRes = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Carolina MultiSalão',
        email: custEmail,
        phone: '(11) 97777-8888',
        password: 'password123',
        contactPreference: 'WHATSAPP',
      }),
    });
    assert.strictEqual(custRegRes.status, 201, 'Cadastro de cliente deve retornar 201');
    const custLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: custEmail, password: 'password123' }),
    });
    assert.strictEqual(custLoginRes.status, 200, 'Login de cliente deve funcionar');
    const customerToken = custLoginRes.body.token;
    console.log('✅ [3/18] Cadastro e login de cliente com conta única validados');

    // -------------------------------------------------------------------------
    // 4. Agendamento do cliente na Empresa A (Plano Completo — Com Sinal)
    // -------------------------------------------------------------------------
    const futureDateA = '2027-05-10';
    const bookARes = await jsonFetch(`/public/tenants/${slugA}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        serviceId: servA.id,
        professionalId: profA.id,
        date: futureDateA,
        startTime: '10:00',
        notes: 'Reserva na Empresa A',
      }),
    });
    assert.strictEqual(bookARes.status, 201, 'Cliente deve conseguir agendar na Empresa A');
    assert.strictEqual(bookARes.body.data.tenantId, tenantIdA);
    assert.strictEqual(bookARes.body.data.status, 'PENDING_PAYMENT', 'Empresa A (Plano Completo c/ sinal) deve iniciar PENDING_PAYMENT');
    assert.strictEqual(Number(bookARes.body.data.depositAmountCents) > 0, true, 'Deve calcular sinal na Empresa A');
    console.log('✅ [4/18] Agendamento do cliente na Empresa A (Plano Completo com sinal) validado');

    // -------------------------------------------------------------------------
    // 5. Agendamento do MESMO cliente na Empresa B (Plano Simples — Sem Sinal)
    // -------------------------------------------------------------------------
    const futureDateB = '2027-05-11';
    const bookBRes = await jsonFetch(`/public/tenants/${slugB}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        serviceId: servB.id,
        professionalId: profB.id,
        date: futureDateB,
        startTime: '14:00',
        notes: 'Reserva na Empresa B',
      }),
    });
    assert.strictEqual(bookBRes.status, 201, 'Mesma cliente deve conseguir agendar na Empresa B');
    assert.strictEqual(bookBRes.body.data.tenantId, tenantIdB);
    assert.strictEqual(bookBRes.body.data.status, 'CONFIRMED', 'Empresa B (Plano Simples) deve confirmar imediatamente sem sinal');
    assert.strictEqual(Number(bookBRes.body.data.depositAmountCents || 0), 0, 'Sinal deve ser 0 na Empresa B (Plano Simples)');
    console.log('✅ [5/18] Agendamento da mesma cliente na Empresa B (Plano Simples sem sinal) validado');

    // -------------------------------------------------------------------------
    // 6. Visualização dos agendamentos de diferentes empresas na área do cliente
    // -------------------------------------------------------------------------
    const myAppsRes = await jsonFetch('/customer/appointments', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(myAppsRes.status, 200);
    const myApps = myAppsRes.body.data.all || myAppsRes.body.data;
    assert.strictEqual(myApps.length, 2, 'Cliente deve visualizar os 2 agendamentos (Empresa A e Empresa B)');
    const hasA = myApps.some((a: any) => a.tenantId === tenantIdA && a.establishment?.slug === slugA);
    const hasB = myApps.some((a: any) => a.tenantId === tenantIdB && a.establishment?.slug === slugB);
    assert.strictEqual(hasA && hasB, true, 'Cada agendamento deve exibir os dados do estabelecimento correspondente');
    console.log('✅ [6/18] Visualização unificada de agendamentos multiempresa na área da cliente validada');

    // -------------------------------------------------------------------------
    // 7. Visualização pela empresa apenas dos seus próprios clientes e agendamentos
    // -------------------------------------------------------------------------
    const appsSalonARes = await jsonFetch('/appointments', {
      headers: { Authorization: `Bearer ${tokenSalonA}` },
    });
    const appsSalonBRes = await jsonFetch('/appointments', {
      headers: { Authorization: `Bearer ${tokenSalonB}` },
    });
    assert.strictEqual(
      appsSalonARes.body.data.every((a: any) => a.tenantId === tenantIdA),
      true,
      'Empresa A vê apenas seus próprios agendamentos'
    );
    assert.strictEqual(
      appsSalonBRes.body.data.every((a: any) => a.tenantId === tenantIdB),
      true,
      'Empresa B vê apenas seus próprios agendamentos'
    );

    const clientsSalonARes = await jsonFetch('/clients', {
      headers: { Authorization: `Bearer ${tokenSalonA}` },
    });
    const clientsSalonBRes = await jsonFetch('/clients', {
      headers: { Authorization: `Bearer ${tokenSalonB}` },
    });
    assert.strictEqual(clientsSalonARes.body.data.length, 1);
    assert.strictEqual(clientsSalonBRes.body.data.length, 1);
    assert.notStrictEqual(
      clientsSalonARes.body.data[0].id,
      clientsSalonBRes.body.data[0].id,
      'Cada empresa possui seu próprio registro Client isolado para o mesmo User'
    );
    console.log('✅ [7/18] Isolamento de registros Client e agendamentos por estabelecimento validado');

    // -------------------------------------------------------------------------
    // 8. Funcionamento do link público /agendar/:slug carregando apenas a empresa correta
    // -------------------------------------------------------------------------
    const pubSlugARes = await jsonFetch(`/public/tenants/${slugA}`);
    assert.strictEqual(pubSlugARes.status, 200);
    assert.strictEqual(pubSlugARes.body.data.establishment.id, tenantIdA);
    assert.strictEqual(
      pubSlugARes.body.data.services.every((s: any) => s.id === servA.id),
      true,
      'Link público de Alpha carrega somente serviços de Alpha'
    );
    console.log('✅ [8/18] Link público /agendar/:slug carregando apenas dados da empresa correta validado');

    // -------------------------------------------------------------------------
    // 9. Erro amigável para slug inexistente
    // -------------------------------------------------------------------------
    const invalidSlugRes = await jsonFetch('/public/tenants/salao-inexistente-999999');
    assert.strictEqual(invalidSlugRes.status, 404);
    assert.strictEqual(invalidSlugRes.body.code, 'ESTABLISHMENT_NOT_FOUND');
    console.log('✅ [9/18] Erro amigável 404 (ESTABLISHMENT_NOT_FOUND) para slug inexistente validado');

    // -------------------------------------------------------------------------
    // 10. Bloqueio de recursos de sinal para empresa no Plano Simples
    // -------------------------------------------------------------------------
    const tryEnableDepositOnSimple = await jsonFetch('/business', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonB}` },
      body: JSON.stringify({
        name: `Studio Beta ${suffix}`,
        requireDeposit: true,
        defaultDeposit: 30,
      }),
    });
    assert.strictEqual(tryEnableDepositOnSimple.status, 403, 'Plano Simples não pode ativar requireDeposit');
    assert.strictEqual(tryEnableDepositOnSimple.body.code, 'PLAN_DOES_NOT_ALLOW_DEPOSIT');

    const tryPixOnSimple = await jsonFetch(`/appointments/${bookBRes.body.data.id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonB}` },
    });
    assert.strictEqual(tryPixOnSimple.status, 403, 'Plano Simples não pode gerar cobrança Pix de sinal');
    console.log('✅ [10/18] Bloqueio de configuração e cobrança de sinal no Plano Simples validado');

    // -------------------------------------------------------------------------
    // 11. Funcionamento do sinal para empresa no Plano Completo
    // -------------------------------------------------------------------------
    const updateCompleteDeposit = await jsonFetch('/business', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonA}` },
      body: JSON.stringify({
        name: `Studio Alpha ${suffix}`,
        requireDeposit: true,
        defaultDeposit: 40,
      }),
    });
    assert.strictEqual(updateCompleteDeposit.status, 200, 'Plano Completo pode configurar sinal normalmente');
    assert.strictEqual(updateCompleteDeposit.body.data.requireDeposit, true);
    assert.strictEqual(updateCompleteDeposit.body.data.defaultDeposit, 40);

    const createPixOnComplete = await jsonFetch(`/appointments/${bookARes.body.data.id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(createPixOnComplete.status, 200, 'Plano Completo permite gerar cobrança Pix para o agendamento');
    assert.ok(createPixOnComplete.body.data.qrCode, 'Deve retornar QR Code Pix');
    console.log('✅ [11/18] Funcionamento completo do sinal e geração de Pix no Plano Completo validado');

    // -------------------------------------------------------------------------
    // Login como Master Admin para os testes 12 a 17
    // -------------------------------------------------------------------------
    const masterLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'master@agendabeauty.com.br', password: '123456' }),
    });
    assert.strictEqual(masterLoginRes.status, 200, 'Login Master Admin deve funcionar');
    const masterToken = masterLoginRes.body.token;
    assert.strictEqual(masterLoginRes.body.data.user.isMasterAdmin, true);

    // -------------------------------------------------------------------------
    // 12. Alteração de plano pelo Master Admin refletindo nas permissões da empresa
    // -------------------------------------------------------------------------
    const upgradeBetaRes = await jsonFetch(`/master-admin/tenants/${tenantIdB}/plan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        planCode: 'COMPLETE',
        reason: 'Upgrade solicitado pela proprietária Beta',
      }),
    });
    assert.strictEqual(upgradeBetaRes.status, 200);
    assert.strictEqual(upgradeBetaRes.body.data.plan, 'COMPLETE');

    // Agora Beta deve conseguir habilitar requireDeposit!
    const enableDepAfterUpgrade = await jsonFetch('/business', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonB}` },
      body: JSON.stringify({
        name: `Studio Beta ${suffix}`,
        requireDeposit: true,
        defaultDeposit: 30,
      }),
    });
    assert.strictEqual(enableDepAfterUpgrade.status, 200, 'Após upgrade para Plano Completo, Beta pode ativar sinal');
    assert.strictEqual(enableDepAfterUpgrade.body.data.requireDeposit, true);

    // Faz downgrade de volta para SIMPLE e verifica que requireDeposit é desativado automaticamente
    const downgradeBetaRes = await jsonFetch(`/master-admin/tenants/${tenantIdB}/plan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        planCode: 'SIMPLE',
        reason: 'Retorno ao Plano Simples para teste',
      }),
    });
    assert.strictEqual(downgradeBetaRes.status, 200);
    const bizBetaCheck = await jsonFetch('/business', {
      headers: { Authorization: `Bearer ${tokenSalonB}` },
    });
    assert.strictEqual(bizBetaCheck.body.data.requireDeposit, false, 'Downgrade para SIMPLE desativa requireDeposit');
    console.log('✅ [12/18] Alteração de plano pelo Master Admin refletindo nas permissões da empresa validada');

    // -------------------------------------------------------------------------
    // 13. Alteração do preço padrão de um plano pelo Master Admin sem sobrescrever contratos vigentes
    // -------------------------------------------------------------------------
    const detailAlphaBefore = await jsonFetch(`/master-admin/tenants/${tenantIdA}`, {
      headers: { Authorization: `Bearer ${masterToken}` },
    });
    const alphaContractedBefore = detailAlphaBefore.body.data.subscription.contractedPriceCents;

    const updatePlanCatalogRes = await jsonFetch('/master-admin/plans/COMPLETE', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        defaultPriceCents: 11990,
        reason: 'Reajuste anual da tabela de novos clientes',
      }),
    });
    assert.strictEqual(updatePlanCatalogRes.status, 200);
    assert.strictEqual(updatePlanCatalogRes.body.data.defaultPriceCents, 11990);

    const detailAlphaAfter = await jsonFetch(`/master-admin/tenants/${tenantIdA}`, {
      headers: { Authorization: `Bearer ${masterToken}` },
    });
    assert.strictEqual(
      detailAlphaAfter.body.data.subscription.contractedPriceCents,
      alphaContractedBefore,
      'Alterar preço padrão do plano não deve sobrescrever o valor contratado de assinaturas vigentes'
    );
    console.log('✅ [13/18] Alteração de preço padrão do plano sem afetar contratos ativos validada');

    // -------------------------------------------------------------------------
    // 14. Alteração do valor contratado de uma empresa específica pelo Master Admin
    // -------------------------------------------------------------------------
    const customPriceRes = await jsonFetch(`/master-admin/tenants/${tenantIdA}/contracted-price`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        contractedPriceCents: 7990,
        reason: 'Condição comercial fidelidade 12 meses',
      }),
    });
    assert.strictEqual(customPriceRes.status, 200);
    assert.strictEqual(customPriceRes.body.data.contractedPriceCents, 7990);
    assert.strictEqual(customPriceRes.body.data.priceOverrideReason, 'Condição comercial fidelidade 12 meses');
    console.log('✅ [14/18] Alteração de valor contratado personalizado por empresa com auditoria validada');

    // -------------------------------------------------------------------------
    // 15. Bloqueio de empresa inadimplente pelo Master Admin
    // -------------------------------------------------------------------------
    const blockAlphaRes = await jsonFetch(`/master-admin/tenants/${tenantIdA}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        status: 'BLOCKED',
        reason: 'Fatura SaaS vencida há mais de 15 dias',
      }),
    });
    assert.strictEqual(blockAlphaRes.status, 200);
    assert.strictEqual(blockAlphaRes.body.data.tenant.status, 'BLOCKED');

    // Tentativa de escrita administrativa pelo salão bloqueado deve retornar 403 TENANT_ACCESS_SUSPENDED
    const tryAdminWriteBlocked = await jsonFetch('/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalonA}` },
      body: JSON.stringify({
        name: 'Serviço Bloqueado',
        duration: 30,
        price: 50,
      }),
    });
    assert.strictEqual(tryAdminWriteBlocked.status, 403, 'Empresa bloqueada não pode criar serviços');
    assert.strictEqual(tryAdminWriteBlocked.body.code, 'TENANT_ACCESS_SUSPENDED');
    console.log('✅ [15/18] Bloqueio administrativo de empresa inadimplente pelo Master Admin validado');

    // -------------------------------------------------------------------------
    // 16. Impedimento de novos agendamentos online para empresa bloqueada
    // -------------------------------------------------------------------------
    const tryPublicBookBlocked = await jsonFetch(`/public/tenants/${slugA}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        serviceId: servA.id,
        professionalId: profA.id,
        date: '2027-05-15',
        startTime: '11:00',
      }),
    });
    assert.strictEqual(tryPublicBookBlocked.status, 403, 'Empresa bloqueada não pode receber novos agendamentos públicos');
    assert.strictEqual(tryPublicBookBlocked.body.code, 'TENANT_BOOKING_UNAVAILABLE');

    const directoryPublicRes = await jsonFetch('/public/directory');
    assert.strictEqual(
      directoryPublicRes.status,
      404,
      'Endpoint público de diretório deve retornar 404 após desativação'
    );
    assert.strictEqual(
      directoryPublicRes.body.code,
      'DIRECTORY_DISABLED',
      'Código de retorno deve ser DIRECTORY_DISABLED'
    );

    const directoryCustomerRes = await jsonFetch('/customer/directory', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(
      directoryCustomerRes.status,
      404,
      'Endpoint de diretório do cliente deve retornar 404 após desativação'
    );
    assert.strictEqual(
      directoryCustomerRes.body.code,
      'DIRECTORY_DISABLED',
      'Código de retorno do cliente deve ser DIRECTORY_DISABLED'
    );
    console.log('✅ [16/18] Impedimento de agendamentos para empresa bloqueada e desativação total dos endpoints de diretório público validados');

    // -------------------------------------------------------------------------
    // 17. Desbloqueio/reativação da empresa pelo Master Admin e retorno do funcionamento
    // -------------------------------------------------------------------------
    const unblockAlphaRes = await jsonFetch(`/master-admin/tenants/${tenantIdA}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterToken}` },
      body: JSON.stringify({
        status: 'ACTIVE',
        reason: 'Pagamento da fatura SaaS confirmado',
      }),
    });
    assert.strictEqual(unblockAlphaRes.status, 200);
    assert.strictEqual(unblockAlphaRes.body.data.tenant.status, 'ACTIVE');

    const tryPublicBookUnblocked = await jsonFetch(`/public/tenants/${slugA}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        serviceId: servA.id,
        professionalId: profA.id,
        date: '2027-05-15',
        startTime: '11:00',
      }),
    });
    assert.strictEqual(tryPublicBookUnblocked.status, 201, 'Empresa reativada volta a receber agendamentos normalmente');
    console.log('✅ [17/18] Desbloqueio/reativação da empresa pelo Master Admin e restauração operacional validados');

    // -------------------------------------------------------------------------
    // 18. Bloqueio de acesso ao painel Master Admin por usuários comuns (Cliente e Proprietário)
    // -------------------------------------------------------------------------
    const customerTryMaster = await jsonFetch('/master-admin/dashboard', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(customerTryMaster.status, 403, 'Cliente não pode acessar rotas Master Admin');

    const ownerTryMaster = await jsonFetch('/master-admin/dashboard', {
      headers: { Authorization: `Bearer ${tokenSalonA}` },
    });
    assert.strictEqual(ownerTryMaster.status, 403, 'Proprietário de salão comum não pode acessar rotas Master Admin');
    console.log('✅ [18/18] Proteção estrita das rotas Master Admin contra clientes e proprietários comuns validada');

    console.log('\n🎉 TODOS OS 18 CENÁRIOS OBRIGATÓRIOS DA ETAPA 13 PASSARAM COM SUCESSO!\n');
  } finally {
    server.close();
  }
}

runEtapa13Tests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 13:', err);
  process.exit(1);
});
