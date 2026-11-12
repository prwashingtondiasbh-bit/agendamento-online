import assert from 'assert';
import { createApp } from '../app.js';
import { memoryStore } from '../storage.js';
import {
  acceptWaitlistOffer,
  awardLoyaltyPointsForPayment,
  blockGiftCard,
  cancelWaitlistEntry,
  consumeCustomerPackageCredit,
  createGiftCard,
  createMarketingCampaign,
  createServiceReview,
  createWaitlistEntry,
  createWaitlistOffer,
  dispatchMarketingCampaign,
  ensureDefaultLocation,
  ensureLoyaltyProgram,
  findCompatibleWaitlistEntriesForSlot,
  getClientLoyaltySummary,
  lookupGiftCardForRecipient,
  moderateServiceReviewVisibility,
  previewCampaignSegment,
  purchaseCustomerPackage,
  recordInventoryMovement,
  redeemGiftCard,
  releaseReservedCoupon,
  replyToServiceReview,
  reserveCouponUsage,
  reverseLoyaltyPointsOnRefund,
  saveCoupon,
  saveInventoryProduct,
  saveLocation,
  saveServicePackage,
  validateCouponServerSide,
  validateLocationBookingEligibility,
} from '../advancedService.js';

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
  console.log('🧪 Iniciando suíte de testes automatizados — ETAPA 11 (Recursos Avançados)...\n');

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

  const customerTokenBiz1 = makeToken({
    userId: 'user-cust-1',
    userName: 'Beatriz Lima',
    email: 'beatriz@email.com',
    tenantId: 'biz-1',
    role: 'CUSTOMER',
  });

  const ownerTokenBiz2 = makeToken({
    userId: 'user-biz2',
    userName: 'Diretora Biz 2',
    email: 'biz2@agendabeauty.com.br',
    tenantId: 'biz-2',
    role: 'OWNER',
  });

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

  if (!memoryStore.clients.find((c: any) => c.id === 'cli-2')) {
    memoryStore.clients.push({
      id: 'cli-2',
      tenantId: 'biz-1',
      name: 'Mariana Costa',
      phone: '(11) 96666-2222',
      normalizedPhone: '+5511966662222',
      email: 'mariana@email.com',
      contactPreference: 'WHATSAPP',
      whatsappOptIn: true,
      promotionalConsent: false,
      promotionalConsentAt: null,
      promotionalConsentSource: null,
      promotionalConsentRevokedAt: null,
      notes: '',
      createdAt: new Date().toISOString(),
    });
  }

  let passed = 0;

  try {
    // =========================================================================
    // SEÇÃO 1: LISTA DE ESPERA INTELIGENTE (Testes 1 a 4)
    // =========================================================================

    // Teste 1: Cliente elegível recebe oferta compatível na lista de espera
    {
      const entry = createWaitlistEntry('biz-1', {
        clientId: 'cli-1',
        serviceId: 'serv-1',
        professionalId: 'prof-1',
        desiredDate: '2026-12-15',
        preferredPeriod: 'MORNING',
        notes: 'Prefiro entre 09h e 11h',
      });
      assert.strictEqual(entry.status, 'WAITING');

      const compatible = findCompatibleWaitlistEntriesForSlot('biz-1', {
        serviceId: 'serv-1',
        professionalId: 'prof-1',
        slotDateTime: '2026-12-15T10:00:00',
      });
      assert.ok(compatible.some((e: any) => e.id === entry.id), 'Deve encontrar a entrada compatível');

      const offer = await createWaitlistOffer('biz-1', {
        waitlistEntryId: entry.id,
        professionalId: 'prof-1',
        slotDateTime: '2026-12-15T10:00:00',
        expiresInMinutes: 30,
        actorId: 'user-1',
      });
      assert.strictEqual(offer.status, 'PENDING');
      passed++;
      console.log('✅ [01/25] Lista de espera: cliente elegível recebe oferta compatível.');
    }

    // Teste 2: Oferta expirada não pode gerar reserva
    {
      const entryExp = createWaitlistEntry('biz-1', {
        clientId: 'cli-2',
        serviceId: 'serv-1',
        professionalId: 'prof-1',
        desiredDate: '2026-12-16',
        preferredPeriod: 'AFTERNOON',
      });
      const offerExp = await createWaitlistOffer('biz-1', {
        waitlistEntryId: entryExp.id,
        professionalId: 'prof-1',
        slotDateTime: '2026-12-16T14:00:00',
        expiresInMinutes: 15,
        actorId: 'user-1',
      });
      offerExp.expiresAt = new Date(Date.now() - 60_000).toISOString();

      let expiredBlocked = false;
      try {
        await acceptWaitlistOffer('biz-1', offerExp.id, 'cli-2');
      } catch (err: any) {
        expiredBlocked = err.message.includes('expirou');
      }
      assert.strictEqual(expiredBlocked, true, 'Oferta expirada deve ser rejeitada');
      passed++;
      console.log('✅ [02/25] Lista de espera: oferta expirada não pode gerar reserva.');
    }

    // Teste 3: Duas clientes não conseguem ocupar simultaneamente a mesma vaga
    {
      const entryA = createWaitlistEntry('biz-1', {
        clientId: 'cli-1',
        serviceId: 'serv-1',
        professionalId: 'prof-1',
        desiredDate: '2026-12-18',
        preferredPeriod: 'MORNING',
      });
      const entryB = createWaitlistEntry('biz-1', {
        clientId: 'cli-2',
        serviceId: 'serv-1',
        professionalId: 'prof-1',
        desiredDate: '2026-12-18',
        preferredPeriod: 'MORNING',
      });

      const slot = '2026-12-18T09:00:00.000Z';
      const offerA = await createWaitlistOffer('biz-1', {
        waitlistEntryId: entryA.id,
        professionalId: 'prof-1',
        slotDateTime: slot,
        expiresInMinutes: 30,
        actorId: 'user-1',
      });
      // Simular segunda oferta pendente no mesmo slot para testar disputa simultânea de aceitação
      const offerB = {
        id: `wlo-race-${Date.now()}`,
        tenantId: 'biz-1',
        waitlistEntryId: entryB.id,
        clientId: 'cli-2',
        serviceId: 'serv-1',
        professionalId: 'prof-1',
        slotDateTime: offerA.slotDateTime,
        slotEndDateTime: offerA.slotEndDateTime,
        status: 'PENDING',
        offeredAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      };
      memoryStore.waitlistOffers.push(offerB);

      const results = await Promise.allSettled([
        acceptWaitlistOffer('biz-1', offerA.id, 'cli-1'),
        acceptWaitlistOffer('biz-1', offerB.id, 'cli-2'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      assert.strictEqual(fulfilled.length, 1, 'Apenas uma cliente pode confirmar a vaga');
      assert.strictEqual(rejected.length, 1, 'A segunda tentativa concorrente deve ser bloqueada');
      passed++;
      console.log('✅ [03/25] Lista de espera: duas clientes não ocupam simultaneamente a mesma vaga.');
    }

    // Teste 4: Cancelamento da solicitação na lista de espera impede novas ofertas
    {
      const entryCancel = createWaitlistEntry('biz-1', {
        clientId: 'cli-1',
        serviceId: 'serv-1',
        professionalId: 'prof-1',
        desiredDate: '2026-12-19',
        preferredPeriod: 'ANY',
      });
      cancelWaitlistEntry('biz-1', entryCancel.id, 'cli-1');

      let offerBlocked = false;
      try {
        await createWaitlistOffer('biz-1', {
          waitlistEntryId: entryCancel.id,
          professionalId: 'prof-1',
          slotDateTime: '2026-12-19T11:00:00',
          actorId: 'user-1',
        });
      } catch (err: any) {
        offerBlocked = true;
      }
      assert.strictEqual(offerBlocked, true, 'Solicitação cancelada não pode receber novas ofertas');
      passed++;
      console.log('✅ [04/25] Lista de espera: cancelamento da solicitação impede novas ofertas.');
    }

    // =========================================================================
    // SEÇÃO 2: PROGRAMA DE FIDELIDADE (Testes 5 a 8)
    // =========================================================================

    // Preparar agendamento e pagamento confirmado para teste de fidelidade
    memoryStore.appointments.push({
      id: 'app-loyalty-1',
      tenantId: 'biz-1',
      clientId: 'cli-1',
      professionalId: 'prof-1',
      serviceId: 'serv-1',
      dateTime: '2026-12-01T10:00:00.000Z',
      endDateTime: '2026-12-01T12:00:00.000Z',
      status: 'COMPLETED',
      totalAmountCents: 10000,
    });
    memoryStore.payments.push({
      id: 'pay-loyalty-unique-1',
      tenantId: 'biz-1',
      appointmentId: 'app-loyalty-1',
      paymentType: 'DEPOSIT',
      amountCents: 10000,
      status: 'APPROVED',
    });

    // Teste 5: Pagamento elegível confirmado gera pontos uma única vez
    {
      ensureLoyaltyProgram('biz-1');
      const before = getClientLoyaltySummary('biz-1', 'cli-1').balance;
      const res = await awardLoyaltyPointsForPayment('biz-1', 'pay-loyalty-unique-1', 'user-1');
      assert.strictEqual(res.awarded, true);
      assert.strictEqual(res.pointsAwarded, 100); // R$ 100,00 * 1 ponto por real = 100 pts
      const after = getClientLoyaltySummary('biz-1', 'cli-1').balance;
      assert.strictEqual(after, before + 100);
      passed++;
      console.log('✅ [05/25] Fidelidade: pagamento elegível confirmado gera pontos uma única vez.');
    }

    // Teste 6: Evento duplicado não duplica pontos (idempotência por paymentId)
    {
      const before = getClientLoyaltySummary('biz-1', 'cli-1').balance;
      const dup = await awardLoyaltyPointsForPayment('biz-1', 'pay-loyalty-unique-1', 'user-1');
      assert.strictEqual(dup.awarded, false);
      assert.strictEqual(dup.duplicateIgnored, true);
      const after = getClientLoyaltySummary('biz-1', 'cli-1').balance;
      assert.strictEqual(after, before, 'Saldo não pode mudar em evento duplicado');
      passed++;
      console.log('✅ [06/25] Fidelidade: evento duplicado não duplica pontos.');
    }

    // Teste 7: Cliente não consegue alterar o próprio saldo (403 Forbidden)
    {
      const res = await fetch(`${baseUrl}/api/v1/advanced/loyalty/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerTokenBiz1}`,
        },
        body: JSON.stringify({
          clientId: 'cli-1',
          pointsDelta: 500,
          justification: 'Tentativa de fraude pela cliente',
        }),
      });
      assert.strictEqual(res.status, 403, 'Cliente deve receber 403 ao tentar ajustar o próprio saldo');
      passed++;
      console.log('✅ [07/25] Fidelidade: cliente bloqueada (403) ao tentar alterar o próprio saldo.');
    }

    // Teste 8: Reembolso aplica a regra configurada de reversão de pontos
    {
      const before = getClientLoyaltySummary('biz-1', 'cli-1').balance;
      const rev = await reverseLoyaltyPointsOnRefund('biz-1', {
        refundReferenceId: 'ref-loyalty-1',
        paymentId: 'pay-loyalty-unique-1',
        refundedAmountCents: 5000, // R$ 50,00 reembolsado -> 50 pontos estornados
        actorId: 'user-1',
      });
      assert.strictEqual(rev.reversed, true);
      assert.strictEqual(rev.pointsReversed, 50, 'Deve reverter proporcionalmente 50 pontos');
      const after = getClientLoyaltySummary('biz-1', 'cli-1').balance;
      assert.strictEqual(after, before - 50);
      passed++;
      console.log('✅ [08/25] Fidelidade: reembolso aplica regra configurada de reversão proporcional.');
    }

    // =========================================================================
    // SEÇÃO 3: CUPONS E PROMOÇÕES (Testes 9 a 13)
    // =========================================================================

    // Teste 9: Cupom expirado é rejeitado
    {
      const expiredCoupon = saveCoupon(
        'biz-1',
        {
          code: 'EXPIRADO2020',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          startsAt: '2020-01-01T00:00:00.000Z',
          endsAt: '2020-12-31T23:59:59.000Z',
        },
        'user-1'
      );
      const check = validateCouponServerSide('biz-1', {
        code: expiredCoupon.code,
        clientId: 'cli-1',
        serviceId: 'serv-1',
        orderAmountCents: 10000,
      });
      assert.strictEqual(check.valid, false);
      assert.ok(check.error?.includes('expirado'));
      passed++;
      console.log('✅ [09/25] Cupons: cupom expirado é rejeitado.');
    }

    // Teste 10: Cupom de outra empresa é rejeitado (isolamento multi-tenant)
    {
      saveCoupon(
        'biz-2',
        {
          code: 'EXCLUSIVORJ50',
          discountType: 'PERCENTAGE',
          discountValue: 50,
          startsAt: new Date(Date.now() - 86400000).toISOString(),
          endsAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        },
        'user-biz2'
      );
      const checkCross = validateCouponServerSide('biz-1', {
        code: 'EXCLUSIVORJ50',
        clientId: 'cli-1',
        serviceId: 'serv-1',
        orderAmountCents: 10000,
      });
      assert.strictEqual(checkCross.valid, false, 'Cupom da empresa biz-2 não pode valer na biz-1');
      passed++;
      console.log('✅ [10/25] Cupons: cupom de outra empresa (tenant_id diferente) é rejeitado.');
    }

    // Teste 11: Limite de uso não é ultrapassado em operações simultâneas
    {
      saveCoupon(
        'biz-1',
        {
          code: 'UNICO1USO',
          discountType: 'FIXED_CENTS',
          discountValue: 1500,
          maxTotalUses: 1,
          maxUsesPerClient: 1,
          startsAt: new Date(Date.now() - 86400000).toISOString(),
          endsAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        },
        'user-1'
      );

      const concurrent = await Promise.allSettled([
        reserveCouponUsage('biz-1', {
          code: 'UNICO1USO',
          clientId: 'cli-1',
          appointmentId: 'app-cup-1',
          serviceId: 'serv-1',
          orderAmountCents: 10000,
        }),
        reserveCouponUsage('biz-1', {
          code: 'UNICO1USO',
          clientId: 'cli-2',
          appointmentId: 'app-cup-2',
          serviceId: 'serv-1',
          orderAmountCents: 10000,
        }),
      ]);
      const okCount = concurrent.filter((r) => r.status === 'fulfilled').length;
      const failCount = concurrent.filter((r) => r.status === 'rejected').length;
      assert.strictEqual(okCount, 1, 'Apenas 1 uso deve ser permitido quando maxTotalUses = 1');
      assert.strictEqual(failCount, 1, 'A segunda tentativa simultânea deve ser rejeitada');
      passed++;
      console.log('✅ [11/25] Cupons: limite de uso não é ultrapassado em operações simultâneas.');
    }

    // Teste 12: Desconto é calculado exclusivamente no servidor
    {
      const check = validateCouponServerSide('biz-1', {
        code: 'BEMVINDA10',
        clientId: 'cli-2',
        serviceId: 'serv-1',
        orderAmountCents: 12000, // R$ 120,00 -> 10% = R$ 12,00 (1200 centavos)
      });
      assert.strictEqual(check.valid, true);
      assert.strictEqual(check.discountCents, 1200);
      assert.strictEqual(check.finalAmountCents, 10800);
      passed++;
      console.log('✅ [12/25] Cupons: desconto calculado com precisão em centavos no servidor.');
    }

    // Teste 13: Pagamento/reserva cancelado ou expirado libera o uso reservado do cupom
    {
      releaseReservedCoupon('biz-1', 'app-cup-1');
      releaseReservedCoupon('biz-1', 'app-cup-2');
      const retryAfterRelease = await reserveCouponUsage('biz-1', {
        code: 'UNICO1USO',
        clientId: 'cli-2',
        appointmentId: 'app-cup-3',
        serviceId: 'serv-1',
        orderAmountCents: 10000,
      });
      assert.strictEqual(retryAfterRelease.discountCents, 1500, 'Após liberação, o cupom volta a ficar disponível');
      passed++;
      console.log('✅ [13/25] Cupons: cancelamento/expiração libera a reserva do cupom.');
    }

    // =========================================================================
    // SEÇÃO 4: PACOTES E CARTÕES-PRESENTE (Testes 14 a 17)
    // =========================================================================

    let sharedCustomerPkgId = '';

    // Teste 14: Consumo de pacote não ultrapassa o saldo disponível
    {
      const pkg = saveServicePackage(
        'biz-1',
        {
          name: 'Pacote Teste 1 Sessão',
          items: [{ serviceId: 'serv-1', quantity: 1 }],
          totalPriceCents: 8000,
        },
        'user-1'
      );
      const cp = purchaseCustomerPackage('biz-1', {
        clientId: 'cli-1',
        packageId: pkg.id,
        paymentConfirmed: true,
        actorId: 'user-1',
      });
      assert.strictEqual(cp.status, 'ACTIVE');

      await consumeCustomerPackageCredit('biz-1', {
        customerPackageId: cp.id,
        serviceId: 'serv-1',
        appointmentId: 'app-pkg-use-1',
        idempotencyKey: 'idem-pkg-1',
        actorId: 'user-1',
      });

      let exceededBlocked = false;
      try {
        await consumeCustomerPackageCredit('biz-1', {
          customerPackageId: cp.id,
          serviceId: 'serv-1',
          appointmentId: 'app-pkg-use-2',
          idempotencyKey: 'idem-pkg-2',
          actorId: 'user-1',
        });
      } catch (err: any) {
        exceededBlocked = true;
      }
      assert.strictEqual(exceededBlocked, true, 'Não pode consumir além do saldo de sessões');
      passed++;
      console.log('✅ [14/25] Pacotes: consumo nunca ultrapassa o saldo disponível.');
    }

    // Teste 15: Duas operações concorrentes não consomem duas vezes o último crédito
    {
      const pkgRace = saveServicePackage(
        'biz-1',
        {
          name: 'Pacote Concorrência Último Crédito',
          items: [{ serviceId: 'serv-1', quantity: 1 }],
          totalPriceCents: 8500,
        },
        'user-1'
      );
      const cpRace = purchaseCustomerPackage('biz-1', {
        clientId: 'cli-1',
        packageId: pkgRace.id,
        paymentConfirmed: true,
        actorId: 'user-1',
      });
      sharedCustomerPkgId = cpRace.id;

      const raceResults = await Promise.allSettled([
        consumeCustomerPackageCredit('biz-1', {
          customerPackageId: cpRace.id,
          serviceId: 'serv-1',
          appointmentId: 'app-race-a',
          idempotencyKey: 'race-key-a',
          actorId: 'user-1',
        }),
        consumeCustomerPackageCredit('biz-1', {
          customerPackageId: cpRace.id,
          serviceId: 'serv-1',
          appointmentId: 'app-race-b',
          idempotencyKey: 'race-key-b',
          actorId: 'user-1',
        }),
      ]);
      const fulfilled = raceResults.filter((r) => r.status === 'fulfilled');
      const rejected = raceResults.filter((r) => r.status === 'rejected');
      assert.strictEqual(fulfilled.length, 1, 'Apenas 1 operação concorrente consome o último crédito');
      assert.strictEqual(rejected.length, 1, 'A segunda operação concorrente deve falhar');
      passed++;
      console.log('✅ [15/25] Pacotes: duas operações concorrentes não consomem duas vezes o último crédito.');
    }

    // Teste 16: Cartão-presente bloqueado não pode ser utilizado
    {
      const gc = createGiftCard(
        'biz-1',
        {
          purchaserClientId: 'cli-1',
          recipientName: 'Juliana Presenteada',
          initialBalanceCents: 15000,
          paymentConfirmed: true,
        },
        'user-1'
      );
      // Verificar que lookup para presenteada não vaza dados do comprador
      const publicView = lookupGiftCardForRecipient('biz-1', gc.code);
      assert.strictEqual((publicView as any).purchaserClientId, undefined, 'Não deve expor comprador');

      blockGiftCard('biz-1', gc.id, 'Suspeita de estorno pelo comprador', 'user-1');

      let blockedRejected = false;
      try {
        await redeemGiftCard('biz-1', {
          code: gc.code,
          amountCents: 5000,
          appointmentId: 'app-gc-test',
          idempotencyKey: 'gc-idem-blocked',
          actorId: 'user-1',
        });
      } catch (err: any) {
        blockedRejected = err.message.includes('bloqueado') || err.message.includes('BLOCKED');
      }
      assert.strictEqual(blockedRejected, true, 'Cartão-presente bloqueado não pode ser resgatado');
      passed++;
      console.log('✅ [16/25] Cartões-presente: cartão bloqueado não pode ser utilizado e lookup protege dados.');
    }

    // Teste 17: Evento duplicado não duplica movimentações de pacotes ou gift cards
    {
      const gcActive = createGiftCard(
        'biz-1',
        {
          purchaserClientId: 'cli-1',
          recipientName: 'Fernanda',
          initialBalanceCents: 10000,
          paymentConfirmed: true,
        },
        'user-1'
      );
      const firstRedeem = await redeemGiftCard('biz-1', {
        code: gcActive.code,
        amountCents: 4000,
        appointmentId: 'app-gc-idem-1',
        idempotencyKey: 'gc-idem-key-100',
        actorId: 'user-1',
      });
      const duplicateRedeem = await redeemGiftCard('biz-1', {
        code: gcActive.code,
        amountCents: 4000,
        appointmentId: 'app-gc-idem-1',
        idempotencyKey: 'gc-idem-key-100',
        actorId: 'user-1',
      });
      assert.strictEqual(duplicateRedeem.duplicateIgnored, true);
      assert.strictEqual(firstRedeem.card.currentBalanceCents, 6000);
      assert.strictEqual(duplicateRedeem.card.currentBalanceCents, 6000);

      // Idempotência também no pacote já consumido com a mesma chave 'race-key-a'
      const pkgDup = await consumeCustomerPackageCredit('biz-1', {
        customerPackageId: sharedCustomerPkgId,
        serviceId: 'serv-1',
        appointmentId: 'app-race-a',
        idempotencyKey: 'race-key-a',
        actorId: 'user-1',
      });
      assert.strictEqual(pkgDup.duplicateIgnored, true);
      passed++;
      console.log('✅ [17/25] Pacotes & Gift Cards: eventos duplicados são idempotentes e não duplicam saldo.');
    }

    // =========================================================================
    // SEÇÃO 5: AVALIAÇÕES E CAMPANHAS (Testes 18 a 21)
    // =========================================================================

    // Teste 18: Atendimento não concluído não pode ser avaliado
    {
      const pendingAppId = `app-not-completed-${Date.now()}`;
      memoryStore.appointments.push({
        id: pendingAppId,
        tenantId: 'biz-1',
        clientId: 'cli-1',
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: '2026-12-20T15:00:00',
        status: 'CONFIRMED',
      });

      let rejectedUncompleted = false;
      try {
        createServiceReview('biz-1', {
          appointmentId: pendingAppId,
          clientId: 'cli-1',
          rating: 5,
          comment: 'Tentando avaliar antes de concluir',
        });
      } catch (err: any) {
        rejectedUncompleted = err.message.includes('concluídos') || err.message.includes('COMPLETED');
      }
      assert.strictEqual(rejectedUncompleted, true);
      passed++;
      console.log('✅ [18/25] Avaliações: atendimento não concluído não pode ser avaliado.');
    }

    // Teste 19: Avaliação duplicada para o mesmo agendamento é bloqueada e resposta/moderação preserva nota
    {
      const completedAppId = `app-completed-rev-${Date.now()}`;
      memoryStore.appointments.push({
        id: completedAppId,
        tenantId: 'biz-1',
        clientId: 'cli-1',
        professionalId: 'prof-1',
        serviceId: 'serv-1',
        dateTime: '2026-10-10T10:00:00',
        status: 'COMPLETED',
      });

      const rev = createServiceReview('biz-1', {
        appointmentId: completedAppId,
        clientId: 'cli-1',
        rating: 4,
        comment: 'Muito bom atendimento!',
      });
      assert.strictEqual(rev.rating, 4);

      let duplicateBlocked = false;
      try {
        createServiceReview('biz-1', {
          appointmentId: completedAppId,
          clientId: 'cli-1',
          rating: 5,
          comment: 'Segunda avaliação no mesmo agendamento',
        });
      } catch (err: any) {
        duplicateBlocked = err.message.includes('já foi avaliado');
      }
      assert.strictEqual(duplicateBlocked, true);

      // Responder e ocultar com justificativa sem alterar a nota original
      replyToServiceReview('biz-1', rev.id, 'Obrigada pelo carinho!', 'user-1');
      const moderated = moderateServiceReviewVisibility(
        'biz-1',
        rev.id,
        true,
        'Comentário arquivado para auditoria interna',
        'user-1'
      );
      assert.strictEqual(moderated.rating, 4, 'Nota original da cliente nunca pode ser alterada pelo salão');
      assert.strictEqual(moderated.comment, 'Muito bom atendimento!');
      passed++;
      console.log('✅ [19/25] Avaliações: duplicidade bloqueada e moderação preserva nota original.');
    }

    // Teste 20: Campanha respeita estritamente o consentimento de marketing
    {
      const c1 = memoryStore.clients.find((c: any) => c.id === 'cli-1');
      const c2 = memoryStore.clients.find((c: any) => c.id === 'cli-2');
      if (c1) {
        c1.promotionalConsent = true;
        c1.promotionalConsentRevokedAt = null;
      }
      if (c2) {
        c2.promotionalConsent = false;
      }

      const preview = previewCampaignSegment('biz-1', 'PROMOTIONAL_OPT_IN');
      assert.ok(preview.eligibleClients.some((c: any) => c.id === 'cli-1'));
      assert.ok(!preview.eligibleClients.some((c: any) => c.id === 'cli-2'));
      assert.ok(preview.blockedWithoutConsentCount >= 1);
      passed++;
      console.log('✅ [20/25] Campanhas: segmentação respeita estritamente o consentimento de marketing.');
    }

    // Teste 21: Campanha não gera envios duplicados quando reprocessada
    {
      const camp = createMarketingCampaign(
        'biz-1',
        {
          name: 'Campanha Primavera Nails',
          segmentType: 'PROMOTIONAL_OPT_IN',
          templateName: 'promo_primavera_nails',
          messagePreview: 'Aproveite 10% OFF na semana da primavera!',
        },
        'user-1'
      );

      const firstDispatch = await dispatchMarketingCampaign('biz-1', camp.id, true, 'user-1');
      assert.strictEqual(firstDispatch.summary.duplicatesBlocked, 0);

      const secondDispatch = await dispatchMarketingCampaign('biz-1', camp.id, true, 'user-1');
      assert.ok(secondDispatch.summary.duplicatesBlocked >= 1, 'Reprocessamento deve bloquear envios duplicados');
      assert.strictEqual(secondDispatch.summary.sentOrQueued, 0, 'Nenhum novo envio duplicado deve ocorrer');
      passed++;
      console.log('✅ [21/25] Campanhas: reprocessamento não gera envios duplicados.');
    }

    // =========================================================================
    // SEÇÃO 6: ESTOQUE E MULTIUNIDADE (Testes 22 a 25)
    // =========================================================================

    // Teste 22: Estoque não é reduzido duas vezes pelo mesmo evento (idempotência)
    {
      const prod = saveInventoryProduct(
        'biz-1',
        {
          name: 'Top Coat Gel UV',
          sku: 'TOP-UV-01',
          unit: 'UN',
          currentQuantity: 10,
          minQuantity: 3,
          unitCostCents: 2900,
        },
        'user-1'
      );

      const mov1 = await recordInventoryMovement('biz-1', {
        productId: prod.id,
        type: 'SERVICE_CONSUMPTION',
        quantityDelta: -2,
        reason: 'Consumo no atendimento #101',
        actorId: 'user-1',
        idempotencyKey: 'inv-idem-101',
      });
      assert.strictEqual(mov1.product.currentQuantity, 8);

      const movDup = await recordInventoryMovement('biz-1', {
        productId: prod.id,
        type: 'SERVICE_CONSUMPTION',
        quantityDelta: -2,
        reason: 'Consumo no atendimento #101',
        actorId: 'user-1',
        idempotencyKey: 'inv-idem-101',
      });
      assert.strictEqual(movDup.duplicateIgnored, true);
      assert.strictEqual(movDup.product.currentQuantity, 8, 'Estoque não pode ser reduzido duas vezes');
      passed++;
      console.log('✅ [22/25] Estoque: movimentação com mesma chave de idempotência não reduz estoque duas vezes.');
    }

    // Teste 23: Ajuste de estoque exige responsável e justificativa
    {
      let missingJustificationBlocked = false;
      try {
        await recordInventoryMovement('biz-1', {
          productId: 'prd-seed-1',
          type: 'ADJUSTMENT',
          quantityDelta: 5,
          reason: 'ok', // muito curto (< 3 caracteres)
          actorId: 'user-1',
        });
      } catch (err: any) {
        missingJustificationBlocked = err.message.includes('Justificativa');
      }
      assert.strictEqual(missingJustificationBlocked, true);
      passed++;
      console.log('✅ [23/25] Estoque: ajuste manual exige responsável e justificativa válida.');
    }

    // Teste 24: Serviço e profissional incompatíveis com a unidade selecionada são rejeitados
    {
      ensureDefaultLocation('biz-1');
      const branch = saveLocation(
        'biz-1',
        {
          name: 'Unidade Filial Moema',
          address: 'Al. dos Nhambiquaras, 100',
          professionalIds: ['prof-1'], // apenas prof-1 atende nesta filial
          serviceIds: ['serv-1'], // apenas serv-1 disponível nesta filial
        },
        'user-1'
      );

      const checkIncompatibleService = validateLocationBookingEligibility(
        'biz-1',
        branch.id,
        'serv-2',
        'prof-1'
      );
      assert.strictEqual(checkIncompatibleService.valid, false, 'Serviço indisponível na filial deve ser rejeitado');

      const checkIncompatibleProf = validateLocationBookingEligibility(
        'biz-1',
        branch.id,
        'serv-1',
        'prof-2'
      );
      assert.strictEqual(checkIncompatibleProf.valid, false, 'Profissional não alocada na filial deve ser rejeitada');

      // Testar via endpoint POST /api/v1/appointments
      const resApp = await fetch(`${baseUrl}/api/v1/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerTokenBiz1}`,
        },
        body: JSON.stringify({
          clientId: 'cli-1',
          professionalId: 'prof-2',
          serviceId: 'serv-1',
          locationId: branch.id,
          dateTime: '2026-12-22T14:00:00',
        }),
      });
      assert.strictEqual(resApp.status, 400, 'Endpoint de agendamento deve rejeitar profissional incompatível com a unidade');
      passed++;
      console.log('✅ [24/25] Multiunidade: serviço e profissional incompatíveis com a unidade selecionada são rejeitados.');
    }

    // Teste 25: Isolamento entre empresas (tenant_id) e RBAC em rotas avançadas
    {
      const invResBiz2 = await fetch(`${baseUrl}/api/v1/advanced/inventory`, {
        headers: { Authorization: `Bearer ${ownerTokenBiz2}` },
      });
      const invJsonBiz2 = await invResBiz2.json();
      assert.strictEqual(invJsonBiz2.success, true);
      const productsList = Array.isArray(invJsonBiz2.data)
        ? invJsonBiz2.data
        : invJsonBiz2.data?.products || [];
      assert.ok(
        !productsList.some((p: any) => p.tenantId === 'biz-1'),
        'Biz-2 não pode visualizar estoque da Biz-1'
      );

      // Cliente não pode criar campanha promocional (403)
      const campCustomerRes = await fetch(`${baseUrl}/api/v1/advanced/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerTokenBiz1}`,
        },
        body: JSON.stringify({
          name: 'Campanha Não Autorizada',
          segmentType: 'PROMOTIONAL_OPT_IN',
          templateName: 'promo_teste',
          messagePreview: 'Mensagem não autorizada',
        }),
      });
      assert.strictEqual(campCustomerRes.status, 403, 'Cliente deve receber 403 ao tentar criar campanha');
      passed++;
      console.log('✅ [25/25] Segurança Multi-tenant & RBAC: isolamento de tenant_id e bloqueio de rotas restritas validados.');
    }

    console.log(`\n🎉 Suíte Etapa 11 concluída com sucesso: ${passed}/25 testes aprovados!`);
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 11:', err);
  process.exit(1);
});
