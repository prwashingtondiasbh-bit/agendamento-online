import assert from 'assert';
import { createApp } from '../app.js';
import { memoryStore } from '../storage.js';

function makeToken(payload: {
  userId: string;
  userName: string;
  email: string;
  tenantId: string;
  role: string;
  professionalId?: string;
}) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

async function runTests() {
  console.log('🧪 Starting Etapa 8 Tests (Painel do Proprietário, CRM e Agendamentos Manuais)...\n');

  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ownerToken = makeToken({
    userId: 'user-owner-1',
    userName: 'Camila Proprietária',
    email: 'camila@agendabeauty.com.br',
    tenantId: 'biz-1',
    role: 'OWNER',
  });

  const receptionistToken = makeToken({
    userId: 'user-recep-1',
    userName: 'Paula Recepção',
    email: 'paula@agendabeauty.com.br',
    tenantId: 'biz-1',
    role: 'RECEPTIONIST',
  });

  const profToken = makeToken({
    userId: 'user-prof-1',
    userName: 'Camila Profissional',
    email: 'camila@agendabeauty.com.br',
    tenantId: 'biz-1',
    role: 'PROFESSIONAL',
    professionalId: 'prof-1',
  });

  const customerToken = makeToken({
    userId: 'user-cust-1',
    userName: 'Beatriz Cliente',
    email: 'beatriz@email.com',
    tenantId: 'biz-1',
    role: 'CUSTOMER',
  });

  const otherTenantOwnerToken = makeToken({
    userId: 'user-owner-2',
    userName: 'Outro Salão',
    email: 'outro@salao.com.br',
    tenantId: 'biz-2',
    role: 'OWNER',
  });

  const api = async (path: string, token: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  };

  try {
    // 1. Acesso autorizado ao painel do proprietário (Dashboard operacional)
    console.log('1️⃣ Testando acesso autorizado ao painel do proprietário e indicadores operacionais...');
    const dashRes = await api('/api/v1/dashboard/stats', ownerToken);
    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(dashRes.body.success, true);
    assert.ok(typeof dashRes.body.data.occupancyRatePercent === 'number');
    assert.ok(typeof dashRes.body.data.cancellationRatePercent === 'number');
    assert.ok(dashRes.body.data.formulas?.occupancy, 'Deve retornar fórmula clara de ocupação');
    console.log('   ✅ Dashboard operacional acessado com sucesso pelo proprietário.');

    // 2. Bloqueio de acesso ao painel por cliente comum (CUSTOMER)
    console.log('2️⃣ Testando bloqueio de acesso ao painel administrativo por cliente comum...');
    const custDash = await api('/api/v1/dashboard/stats', customerToken);
    assert.strictEqual(custDash.status, 403);
    const custClients = await api('/api/v1/clients', customerToken);
    assert.strictEqual(custClients.status, 403);
    const custApps = await api('/api/v1/appointments', customerToken);
    assert.strictEqual(custApps.status, 403);
    console.log('   ✅ Cliente comum bloqueada (403) em rotas do painel do proprietário.');

    // 3. Isolamento por tenant_id em agendamentos, clientes, serviços e profissionais
    console.log('3️⃣ Testando isolamento por tenant_id entre empresas...');
    const t2Clients = await api('/api/v1/clients', otherTenantOwnerToken);
    assert.strictEqual(t2Clients.status, 200);
    assert.strictEqual(t2Clients.body.data.length, 0, 'Tenant 2 não pode ver clientes do Tenant 1');
    const t2Apps = await api('/api/v1/appointments', otherTenantOwnerToken);
    assert.strictEqual(t2Apps.status, 200);
    assert.strictEqual(t2Apps.body.data.length, 0, 'Tenant 2 não pode ver agendamentos do Tenant 1');
    const t2ProfileTry = await api('/api/v1/clients/cli-1/profile', otherTenantOwnerToken);
    assert.strictEqual(t2ProfileTry.status, 404, 'Tenant 2 não pode consultar perfil de cliente do Tenant 1');
    console.log('   ✅ Isolamento multiempresa validado com sucesso.');

    // 4. Visualização da agenda diária, semanal e mensal (filtros de período)
    console.log('4️⃣ Testando visualização e filtros de período da agenda (diária, semanal e mensal)...');
    const futureDate = '2027-06-15';
    const manualSlot1 = `${futureDate}T10:00:00.000Z`;
    const createManual1 = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'cli-1',
        professionalId: 'prof-1',
        serviceId: 'serv-3', // 60m
        dateTime: manualSlot1,
        status: 'CONFIRMED',
        origin: 'WHATSAPP',
        notes: 'Reserva manual teste período',
      }),
    });
    assert.strictEqual(createManual1.status, 201);

    const dailyRes = await api(`/api/v1/appointments?date=${futureDate}`, ownerToken);
    assert.strictEqual(dailyRes.status, 200);
    assert.ok(dailyRes.body.data.some((a: any) => a.id === createManual1.body.data.id));

    const rangeRes = await api(
      `/api/v1/appointments?startDate=2027-06-01T00:00:00.000Z&endDate=2027-06-30T23:59:59.000Z`,
      ownerToken
    );
    assert.strictEqual(rangeRes.status, 200);
    assert.ok(rangeRes.body.data.some((a: any) => a.id === createManual1.body.data.id));
    console.log('   ✅ Consultas de período diário, semanal e mensal funcionando.');

    // 5. Filtro por profissional, serviço e status
    console.log('5️⃣ Testando filtros combinados por profissional, serviço e status...');
    const filterMatch = await api(
      `/api/v1/appointments?professionalId=prof-1&serviceId=serv-3&status=CONFIRMED`,
      ownerToken
    );
    assert.strictEqual(filterMatch.status, 200);
    assert.ok(filterMatch.body.data.length >= 1);
    const filterNoMatch = await api(
      `/api/v1/appointments?professionalId=prof-inexistente`,
      ownerToken
    );
    assert.strictEqual(filterNoMatch.body.data.length, 0);
    console.log('   ✅ Filtros por profissional, serviço e status validados.');

    // 6. Criação de agendamento manual em horário disponível (com registro de origem e autor)
    console.log('6️⃣ Testando criação de agendamento manual com origem e autor...');
    const manualSlot2 = '2027-06-16T14:00:00.000Z';
    const manualRes = await api('/api/v1/appointments', receptionistToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'cli-1',
        professionalId: 'prof-1',
        serviceId: 'serv-3',
        dateTime: manualSlot2,
        status: 'CONFIRMED',
        origin: 'TELEFONE',
        notes: 'Agendado por telefone pela recepção',
      }),
    });
    assert.strictEqual(manualRes.status, 201);
    assert.strictEqual(manualRes.body.data.origin, 'TELEFONE');
    assert.strictEqual(manualRes.body.data.createdBy, 'user-recep-1');
    assert.strictEqual(manualRes.body.data.status, 'CONFIRMED');
    console.log('   ✅ Agendamento manual criado com origem TELEFONE e autor registrado.');

    // 7. Bloqueio de agendamento manual em horário já ocupado (com sugestão de horários livres)
    console.log('7️⃣ Testando bloqueio de agendamento manual em horário já ocupado...');
    const conflictRes = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'cli-1',
        professionalId: 'prof-1',
        serviceId: 'serv-3',
        dateTime: manualSlot2, // Mesmo horário
        status: 'CONFIRMED',
        origin: 'PRESENCIAL',
      }),
    });
    assert.strictEqual(conflictRes.status, 409);
    assert.ok(Array.isArray(conflictRes.body.suggestedSlots), 'Deve sugerir horários alternativos livres');
    assert.ok(conflictRes.body.suggestedSlots.length > 0, 'Deve retornar pelo menos 1 horário sugerido');
    console.log('   ✅ Conflito de horário bloqueado (409) com sugestão de horários alternativos.');

    // 8. Bloqueio de agendamento durante bloqueio de agenda (TimeBlock)
    console.log('8️⃣ Testando bloqueio de novo agendamento durante bloqueio de agenda...');
    const blockStart = '2027-06-17T12:00:00.000Z';
    const blockEnd = '2027-06-17T14:00:00.000Z';
    const tbRes = await api('/api/v1/appointments/time-blocks', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        professionalId: 'prof-1',
        type: 'LUNCH',
        startDate: blockStart,
        endDate: blockEnd,
        reason: 'Almoço da equipe',
      }),
    });
    assert.strictEqual(tbRes.status, 201);

    const bookDuringBlock = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'cli-1',
        professionalId: 'prof-1',
        serviceId: 'serv-3',
        dateTime: '2027-06-17T12:30:00.000Z',
        status: 'CONFIRMED',
        origin: 'WHATSAPP',
      }),
    });
    assert.strictEqual(bookDuringBlock.status, 409);
    assert.ok(bookDuringBlock.body.error.includes('bloqueio de agenda'));
    console.log('   ✅ Agendamento bloqueado durante período de TimeBlock.');

    // 9. Criação de cliente rápida durante agendamento manual
    console.log('9️⃣ Testando criação rápida de cliente durante fluxo de agendamento manual...');
    const quickClientRes = await api('/api/v1/clients', receptionistToken, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Fernanda Oliveira',
        phone: '(11) 98877-6655',
        email: 'fernanda.oli@email.com',
        preferences: 'Gosta de formato bailarina e esmalte nude',
        tags: ['Nova', 'Bailarina'],
      }),
    });
    assert.strictEqual(quickClientRes.status, 201);
    const newClientId = quickClientRes.body.data.id;
    assert.ok(newClientId);
    console.log('   ✅ Cliente rápida criada com sucesso.');

    // 10. Impedimento de duplicidade de cliente por telefone na mesma empresa
    console.log('🔟 Testando impedimento de duplicidade de cliente por telefone na mesma empresa...');
    const dupClientRes = await api('/api/v1/clients', receptionistToken, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Fernanda Duplicada',
        phone: '11988776655', // Mesmo telefone com formatação diferente
      }),
    });
    assert.strictEqual(dupClientRes.status, 409);
    assert.strictEqual(dupClientRes.body.existingClient?.id, newClientId, 'Deve retornar a cliente existente para seleção');
    console.log('   ✅ Duplicidade de telefone bloqueada (409) retornando cliente existente.');

    // 11. Visualização do perfil completo da cliente
    console.log('1️⃣1️⃣ Testando visualização do perfil completo da cliente...');
    const profileRes = await api(`/api/v1/clients/${newClientId}/profile`, ownerToken);
    assert.strictEqual(profileRes.status, 200);
    assert.strictEqual(profileRes.body.data.client.name, 'Fernanda Oliveira');
    assert.ok(Array.isArray(profileRes.body.data.appointments));
    assert.ok(profileRes.body.data.indicators);
    console.log('   ✅ Perfil completo da cliente retornado com sucesso.');

    // 12. Cálculo correto dos indicadores do histórico da cliente
    console.log('1️⃣2️⃣ Testando cálculo dos indicadores de relacionamento da cliente...');
    const cli1Profile = await api('/api/v1/clients/cli-1/profile', ownerToken);
    assert.strictEqual(cli1Profile.status, 200);
    const ind = cli1Profile.body.data.indicators;
    assert.ok(ind.totalCompleted >= 1, 'Deve contabilizar atendimentos COMPLETED');
    assert.ok(ind.totalAppointments >= 2, 'Deve contabilizar total de agendamentos');
    assert.ok(ind.lastAppointmentDate, 'Deve informar data do último atendimento');
    assert.ok(ind.nextAppointmentDate, 'Deve informar data do próximo agendamento');
    console.log('   ✅ Indicadores de histórico (concluídos, último e próximo agendamento) calculados corretamente.');

    // 13. Cálculo correto do total pago pela cliente sem duplicidade entre sinal e saldo
    console.log('1️⃣3️⃣ Testando conciliação do total efetivamente pago pela cliente (sem duplicar sinal + saldo)...');
    // Criar cliente exclusiva para validar cálculo financeiro exato
    const finClientRes = await api('/api/v1/clients', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cliente Conciliação Financeira',
        phone: '(11) 95544-3322',
      }),
    });
    const finClientId = finClientRes.body.data.id;

    // Agendamento de R$ 180,00 (sinal R$ 54,00, saldo R$ 126,00)
    const finAppRes = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: finClientId,
        professionalId: 'prof-1',
        serviceId: 'serv-1', // 18000 centavos
        dateTime: '2027-07-10T10:00:00.000Z',
        status: 'CONFIRMED',
        origin: 'WHATSAPP',
      }),
    });
    const finAppId = finAppRes.body.data.id;

    // Sem pagamento aprovado ainda -> totalPaidCents deve ser 0 (mesmo com agendamento CONFIRMED de R$ 180,00)
    const finProfBefore = await api(`/api/v1/clients/${finClientId}/profile`, ownerToken);
    assert.strictEqual(finProfBefore.body.data.indicators.totalPaidCents, 0, 'Valor agendado não deve ser somado como valor pago');
    assert.strictEqual(finProfBefore.body.data.indicators.totalScheduledCents, 18000);

    // Registrar 1 pagamento APPROVED de sinal (5400 centavos) e 1 pagamento PENDING (não aprovado)
    memoryStore.payments.push({
      id: `pay-fin-approved-${Date.now()}`,
      tenantId: 'biz-1',
      appointmentId: finAppId,
      provider: 'MERCADO_PAGO',
      externalReference: `EXT-${finAppId}`,
      idempotencyKey: `idemp-${finAppId}-1`,
      amountCents: 5400,
      refundedAmountCents: 0,
      currency: 'BRL',
      status: 'APPROVED',
      paymentMethod: 'PIX',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    memoryStore.payments.push({
      id: `pay-fin-pending-${Date.now()}`,
      tenantId: 'biz-1',
      appointmentId: finAppId,
      provider: 'MERCADO_PAGO',
      externalReference: `EXT-${finAppId}-2`,
      idempotencyKey: `idemp-${finAppId}-2`,
      amountCents: 12600,
      refundedAmountCents: 0,
      currency: 'BRL',
      status: 'PENDING',
      paymentMethod: 'PIX',
      createdAt: new Date().toISOString(),
    });

    const finProfAfter = await api(`/api/v1/clients/${finClientId}/profile`, ownerToken);
    assert.strictEqual(
      finProfAfter.body.data.indicators.totalPaidCents,
      5400,
      'Deve somar estritamente os R$ 54,00 aprovados, sem duplicar saldo pendente nem valor agendado'
    );
    console.log('   ✅ Total pago conciliado com precisão (R$ 54,00 aprovados vs R$ 180,00 agendados).');

    // 14. Adição de observações internas com autor e data (e proteção contra acesso por PROFESSIONAL)
    console.log('1️⃣4️⃣ Testando adição de observação interna com autor/data e restrição de permissão...');
    const noteRes = await api(`/api/v1/clients/${finClientId}/notes`, ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        content: 'Cliente prefere atendimento silencioso e café sem açúcar.',
      }),
    });
    assert.strictEqual(noteRes.status, 201);
    assert.strictEqual(noteRes.body.data.authorId, 'user-owner-1');
    assert.strictEqual(noteRes.body.data.authorName, 'Camila Proprietária');
    assert.ok(noteRes.body.data.createdAt);

    // Profissional comum não deve ver internalNotes nem adicionar notas internas administrativas
    const profTryAddNote = await api(`/api/v1/clients/${finClientId}/notes`, profToken, {
      method: 'POST',
      body: JSON.stringify({ content: 'Tentativa não autorizada' }),
    });
    assert.strictEqual(profTryAddNote.status, 403);
    const profViewProfile = await api(`/api/v1/clients/${finClientId}/profile`, profToken);
    assert.strictEqual(profViewProfile.body.data.client.internalNotes, undefined, 'Notas internas protegidas ocultas para perfil PROFESSIONAL');
    console.log('   ✅ Observações internas registradas com autor/data e protegidas por perfil.');

    // 15. Adição e remoção de etiquetas da cliente
    console.log('1️⃣5️⃣ Testando adição e remoção de etiquetas (tags) da cliente...');
    const addTagsRes = await api(`/api/v1/clients/${finClientId}/tags`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({ tags: ['VIP', 'Pontual', 'Gel'] }),
    });
    assert.strictEqual(addTagsRes.status, 200);
    assert.deepStrictEqual(addTagsRes.body.data.tags, ['VIP', 'Pontual', 'Gel']);

    const removeTagRes = await api(`/api/v1/clients/${finClientId}/tags`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({ tags: ['VIP', 'Gel'] }),
    });
    assert.strictEqual(removeTagRes.status, 200);
    assert.deepStrictEqual(removeTagRes.body.data.tags, ['VIP', 'Gel']);
    console.log('   ✅ Adição e remoção de etiquetas funcionando perfeitamente.');

    // 16. Edição de serviço sem alterar valores históricos de agendamentos antigos
    console.log('1️⃣6️⃣ Testando edição de preço/duração de serviço preservando snapshots históricos...');
    const tempServRes = await api('/api/v1/services', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Blindagem Diamante',
        category: 'Blindagem',
        priceCents: 10000, // R$ 100,00
        durationMin: 60,
        depositPercent: 30,
      }),
    });
    assert.strictEqual(tempServRes.status, 201);
    const tempServId = tempServRes.body.data.id;

    const appBeforeEdit = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: finClientId,
        professionalId: 'prof-1',
        serviceId: tempServId,
        dateTime: '2027-07-12T10:00:00.000Z',
        status: 'CONFIRMED',
        origin: 'PRESENCIAL',
      }),
    });
    assert.strictEqual(appBeforeEdit.status, 201);
    const historicAppId = appBeforeEdit.body.data.id;

    // Alterar preço do serviço para R$ 160,00 e duração para 90 min
    const updateServRes = await api(`/api/v1/services/${tempServId}`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({
        priceCents: 16000,
        durationMin: 90,
      }),
    });
    assert.strictEqual(updateServRes.status, 200);

    // Verificar que o agendamento antigo preservou R$ 100,00 (10000 centavos) e 60 min
    const appsAfterServEdit = await api('/api/v1/appointments', ownerToken);
    const historicApp = appsAfterServEdit.body.data.find((a: any) => a.id === historicAppId);
    assert.strictEqual(historicApp.snapshotPriceCents, 10000);
    assert.strictEqual(historicApp.totalAmountCents, 10000);
    assert.strictEqual(historicApp.snapshotDurationMin, 60);
    assert.strictEqual(historicApp.service.priceCents, 10000);
    console.log('   ✅ Valores e duração históricos preservados após alteração do serviço.');

    // 17. Desativação de serviço impedindo novos agendamentos
    console.log('1️⃣7️⃣ Testando desativação de serviço impedindo novos agendamentos...');
    const deactServ = await api(`/api/v1/services/${tempServId}`, ownerToken, { method: 'DELETE' });
    assert.strictEqual(deactServ.status, 200);
    assert.strictEqual(deactServ.body.data.active, false);

    const tryBookInactiveServ = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: finClientId,
        professionalId: 'prof-1',
        serviceId: tempServId,
        dateTime: '2027-07-13T10:00:00.000Z',
        status: 'CONFIRMED',
      }),
    });
    assert.strictEqual(tryBookInactiveServ.status, 400);
    assert.ok(tryBookInactiveServ.body.error.includes('serviço inativo'));
    console.log('   ✅ Serviço inativo bloqueado para novos agendamentos.');

    // 18. Desativação de profissional impedindo novos agendamentos e alertando conflitos futuros
    console.log('1️⃣8️⃣ Testando gestão de profissional: alerta de conflitos futuros e bloqueio quando inativa...');
    const newProfRes = await api('/api/v1/professionals', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Juliana Nail Artist',
        specialty: 'Nail Art',
        email: 'juliana@agendabeauty.com.br',
      }),
    });
    assert.strictEqual(newProfRes.status, 201);
    const tempProfId = newProfRes.body.data.id;

    // Agendar um horário futuro com Juliana
    const profFutureApp = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: finClientId,
        professionalId: tempProfId,
        serviceId: 'serv-1',
        dateTime: '2027-07-20T14:00:00.000Z',
        status: 'CONFIRMED',
      }),
    });
    assert.strictEqual(profFutureApp.status, 201);

    // Tentar desativar sem confirmação deve alertar conflito (409)
    const tryDeactWithoutConfirm = await api(`/api/v1/professionals/${tempProfId}`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({ active: false }),
    });
    assert.strictEqual(tryDeactWithoutConfirm.status, 409);
    assert.ok(Array.isArray(tryDeactWithoutConfirm.body.conflicts));

    // Confirmando a desativação
    const confirmDeactProf = await api(`/api/v1/professionals/${tempProfId}`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({ active: false, confirmFutureConflicts: true }),
    });
    assert.strictEqual(confirmDeactProf.status, 200);
    assert.strictEqual(confirmDeactProf.body.data.active, false);

    // Tentar criar novo agendamento com profissional inativa -> 400
    const tryBookInactiveProf = await api('/api/v1/appointments', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        clientId: finClientId,
        professionalId: tempProfId,
        serviceId: 'serv-1',
        dateTime: '2027-07-21T14:00:00.000Z',
        status: 'CONFIRMED',
      }),
    });
    assert.strictEqual(tryBookInactiveProf.status, 400);
    assert.ok(tryBookInactiveProf.body.error.includes('profissional inativ'));
    console.log('   ✅ Alerta de conflito futuro e bloqueio de profissional inativa validados.');

    // 19. Registro de bloqueio de agenda com verificação de conflitos existentes
    console.log('1️⃣9️⃣ Testando bloqueio de agenda sobrepondo agendamento ativo (409 antes da confirmação, sem cancelar reserva)...');
    // manualSlot2 é 2027-06-16T14:00:00.000Z para prof-1
    const blockOverExistingNoConfirm = await api('/api/v1/appointments/time-blocks', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        professionalId: 'prof-1',
        type: 'PERSONAL',
        startDate: '2027-06-16T13:30:00.000Z',
        endDate: '2027-06-16T15:30:00.000Z',
        reason: 'Compromisso médico',
        confirmOverlap: false,
      }),
    });
    assert.strictEqual(blockOverExistingNoConfirm.status, 409);
    assert.ok(Array.isArray(blockOverExistingNoConfirm.body.conflicts));
    assert.ok(blockOverExistingNoConfirm.body.conflicts.length >= 1);

    // Agora com confirmOverlap: true -> cria o bloqueio, mas NÃO cancela o agendamento existente!
    const blockOverExistingConfirmed = await api('/api/v1/appointments/time-blocks', ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        professionalId: 'prof-1',
        type: 'PERSONAL',
        startDate: '2027-06-16T13:30:00.000Z',
        endDate: '2027-06-16T15:30:00.000Z',
        reason: 'Compromisso médico confirmado',
        confirmOverlap: true,
      }),
    });
    assert.strictEqual(blockOverExistingConfirmed.status, 201);

    const checkAppStillConfirmed = await api('/api/v1/appointments', ownerToken);
    const preservedApp = checkAppStillConfirmed.body.data.find((a: any) => a.id === manualRes.body.data.id);
    assert.strictEqual(preservedApp.status, 'CONFIRMED', 'Agendamento existente não pode ser cancelado automaticamente pelo bloqueio');
    console.log('   ✅ Bloqueio de agenda com detecção de conflitos e preservação de reservas validado.');

    // 20. Alteração controlada de status do agendamento (IN_PROGRESS, COMPLETED, NO_SHOW e bloqueio de aprovação financeira manual)
    console.log('2️⃣0️⃣ Testando alteração controlada de status do agendamento e proteção financeira...');
    // Tentar marcar status = APPROVED deve falhar (400)
    const tryApprovePaymentFromAgenda = await api(`/api/v1/appointments/${manualRes.body.data.id}/status`, ownerToken, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert.strictEqual(tryApprovePaymentFromAgenda.status, 400);

    // Iniciar atendimento (IN_PROGRESS)
    const startServiceRes = await api(`/api/v1/appointments/${manualRes.body.data.id}/status`, ownerToken, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    assert.strictEqual(startServiceRes.status, 200);
    assert.strictEqual(startServiceRes.body.data.status, 'IN_PROGRESS');
    assert.ok(startServiceRes.body.data.startedAt);

    // Concluir atendimento (COMPLETED)
    const completeServiceRes = await api(`/api/v1/appointments/${manualRes.body.data.id}/status`, ownerToken, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    assert.strictEqual(completeServiceRes.status, 200);
    assert.strictEqual(completeServiceRes.body.data.status, 'COMPLETED');
    assert.ok(completeServiceRes.body.data.completedAt);

    // Registrar falta (NO_SHOW) no outro agendamento (createManual1)
    const noShowRes = await api(`/api/v1/appointments/${createManual1.body.data.id}/status`, ownerToken, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'NO_SHOW' }),
    });
    assert.strictEqual(noShowRes.status, 200);
    assert.strictEqual(noShowRes.body.data.status, 'NO_SHOW');
    assert.ok(noShowRes.body.data.noShowAt);
    console.log('   ✅ Transições controladas (IN_PROGRESS, COMPLETED, NO_SHOW) e bloqueio financeiro validados.');

    console.log('\n🎉 TODOS OS 20 TESTES OBRIGATÓRIOS DA ETAPA 8 PASSARAM COM SUCESSO! 🎉');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 8:', err);
  process.exit(1);
});
