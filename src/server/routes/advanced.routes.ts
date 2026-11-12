import { Router, Request, Response } from 'express';
import { hasPermission } from '../middleware/auth.js';
import { memoryStore } from '../storage.js';
import { customerStorage } from '../customerStorage.js';
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
  ensureLoyaltyProgram,
  findCompatibleWaitlistEntriesForSlot,
  getClientLoyaltySummary,
  getReviewsSummary,
  listLocations,
  listWaitlistEntries,
  lookupGiftCardForRecipient,
  manualAdjustLoyaltyPoints,
  moderateServiceReviewVisibility,
  previewCampaignSegment,
  purchaseCustomerPackage,
  recordInventoryMovement,
  redeemGiftCard,
  redeemLoyaltyReward,
  releaseReservedCoupon,
  replyToServiceReview,
  reserveCouponUsage,
  reverseLoyaltyPointsOnRefund,
  saveCoupon,
  saveInventoryProduct,
  saveLocation,
  saveServicePackage,
  validateCouponServerSide,
} from '../advancedService.js';

const router = Router();

async function resolveCurrentClientId(req: Request, tenantId: string): Promise<string | null> {
  if (req.tenantContext?.role === 'CUSTOMER' && req.user) {
    const cli = await customerStorage.getClientForCustomerUser(
      tenantId,
      req.user.id,
      req.user.email,
      req.user.name,
      req.user.phone
    );
    return cli?.id || null;
  }
  return req.body?.clientId || (req.query?.clientId as string) || null;
}

// ==========================================
// 1. MULTIUNIDADE (LOCATIONS)
// ==========================================

router.get('/locations', (req: Request, res: Response) => {
  const tenantId = req.tenantContext?.tenantId || 'biz-1';
  const locations = listLocations(tenantId);
  return res.json({ success: true, data: locations });
});

router.post('/locations', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'locations:manage')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: apenas proprietários ou gerentes podem gerenciar unidades.',
    });
  }
  try {
    const saved = saveLocation(ctx.tenantId, req.body || {}, req.user?.id || 'admin');
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Erro ao salvar unidade.' });
  }
});

// ==========================================
// 2. LISTA DE ESPERA INTELIGENTE (WAITLIST)
// ==========================================

router.get('/waitlist', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  if (ctx.role === 'CUSTOMER') {
    const clientId = await resolveCurrentClientId(req, ctx.tenantId);
    if (!clientId) return res.json({ success: true, data: [] });
    const entries = listWaitlistEntries(ctx.tenantId, { clientId });
    return res.json({ success: true, data: entries });
  }

  if (!hasPermission(ctx.role, 'waitlist:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado à lista de espera.' });
  }

  const entries = listWaitlistEntries(ctx.tenantId, {
    serviceId: req.query.serviceId as string | undefined,
    professionalId: req.query.professionalId as string | undefined,
    desiredDate: req.query.desiredDate as string | undefined,
    status: req.query.status as string | undefined,
  });
  return res.json({ success: true, data: entries });
});

router.post('/waitlist', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const clientId =
      ctx.role === 'CUSTOMER'
        ? await resolveCurrentClientId(req, ctx.tenantId)
        : req.body?.clientId;
    if (!clientId) {
      return res.status(400).json({ success: false, error: 'Cliente não identificada.' });
    }

    const entry = createWaitlistEntry(ctx.tenantId, {
      ...req.body,
      clientId,
    });
    return res.status(201).json({ success: true, data: entry });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/waitlist/:entryId/cancel', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const actorClientId =
      ctx.role === 'CUSTOMER' ? (await resolveCurrentClientId(req, ctx.tenantId)) || undefined : undefined;
    const cancelled = cancelWaitlistEntry(ctx.tenantId, req.params.entryId, actorClientId);
    return res.json({ success: true, data: cancelled });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.get('/waitlist/compatible-slot', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'waitlist:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }

  const compatible = findCompatibleWaitlistEntriesForSlot(ctx.tenantId, {
    serviceId: String(req.query.serviceId || ''),
    professionalId: String(req.query.professionalId || ''),
    slotDateTime: String(req.query.slotDateTime || ''),
  });
  return res.json({ success: true, data: compatible });
});

router.post('/waitlist/:entryId/offer', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'waitlist:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado para ofertar vaga.' });
  }

  try {
    const offer = await createWaitlistOffer(ctx.tenantId, {
      waitlistEntryId: req.params.entryId,
      professionalId: String(req.body?.professionalId || ''),
      slotDateTime: String(req.body?.slotDateTime || ''),
      expiresInMinutes: req.body?.expiresInMinutes ? Number(req.body.expiresInMinutes) : 30,
      actorId: req.user?.id || 'staff',
    });
    return res.status(201).json({ success: true, data: offer });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/waitlist/offers/:offerId/accept', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const actorClientId =
      ctx.role === 'CUSTOMER' ? (await resolveCurrentClientId(req, ctx.tenantId)) || undefined : undefined;
    const accepted = await acceptWaitlistOffer(ctx.tenantId, req.params.offerId, actorClientId);
    return res.json({ success: true, data: accepted });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// ==========================================
// 3. PROGRAMA DE FIDELIDADE (LOYALTY)
// ==========================================

router.get('/loyalty', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  const program = ensureLoyaltyProgram(ctx.tenantId);
  const rewards = memoryStore.loyaltyRewards.filter((r: any) => r.tenantId === ctx.tenantId);

  if (ctx.role === 'CUSTOMER') {
    const clientId = await resolveCurrentClientId(req, ctx.tenantId);
    if (!clientId) {
      return res.json({
        success: true,
        data: { program, balance: 0, ledger: [], rewards: rewards.filter((r: any) => r.active) },
      });
    }
    const summary = getClientLoyaltySummary(ctx.tenantId, clientId);
    return res.json({ success: true, data: summary });
  }

  if (!hasPermission(ctx.role, 'loyalty:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado ao módulo de fidelidade.' });
  }

  const targetClientId = req.query.clientId as string | undefined;
  if (targetClientId) {
    return res.json({
      success: true,
      data: getClientLoyaltySummary(ctx.tenantId, targetClientId),
    });
  }

  const clientBalances = memoryStore.clients
    .filter((c: any) => c.tenantId === ctx.tenantId && c.active !== false)
    .map((c: any) => {
      const sum = getClientLoyaltySummary(ctx.tenantId, c.id);
      return {
        clientId: c.id,
        clientName: c.name,
        phone: c.phone,
        balance: sum.balance,
        earnedTotal: sum.earnedTotal,
        redeemedTotal: sum.redeemedTotal,
      };
    });

  const ledger = memoryStore.loyaltyLedgers
    .filter((l: any) => l.tenantId === ctx.tenantId)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({
    success: true,
    data: {
      program,
      rewards,
      clientBalances,
      ledger,
    },
  });
});

router.get('/loyalty/program', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  const program = ensureLoyaltyProgram(ctx.tenantId);
  const rewards = memoryStore.loyaltyRewards.filter(
    (r: any) => r.tenantId === ctx.tenantId && (ctx.role !== 'CUSTOMER' || r.active !== false)
  );
  return res.json({
    success: true,
    data: {
      program,
      rewards,
    },
  });
});

router.get('/loyalty/clients/:clientId', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  let targetClientId = req.params.clientId;
  if (ctx.role === 'CUSTOMER') {
    const myClientId = await resolveCurrentClientId(req, ctx.tenantId);
    if (!myClientId || (targetClientId !== myClientId && targetClientId !== req.user?.id)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: você só pode consultar seu próprio extrato de fidelidade.',
      });
    }
    targetClientId = myClientId;
  } else if (!hasPermission(ctx.role, 'loyalty:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado ao módulo de fidelidade.' });
  }

  const summary = getClientLoyaltySummary(ctx.tenantId, targetClientId);
  return res.json({ success: true, data: summary });
});

router.put('/loyalty/program', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'loyalty:manage')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: apenas proprietários ou gerentes podem configurar o programa de fidelidade.',
    });
  }

  const prog = ensureLoyaltyProgram(ctx.tenantId);
  const body = req.body || {};
  if (body.name !== undefined) prog.name = String(body.name).trim();
  if (body.active !== undefined) prog.active = Boolean(body.active);
  if (body.pointsPerReal !== undefined) prog.pointsPerReal = Math.max(1, Number(body.pointsPerReal));
  if (body.pointsExpirationDays !== undefined) {
    prog.pointsExpirationDays = body.pointsExpirationDays ? Number(body.pointsExpirationDays) : null;
  }
  if (body.minRedemptionPoints !== undefined) {
    prog.minRedemptionPoints = Math.max(1, Number(body.minRedemptionPoints));
  }
  if (body.reversalRuleOnRefund !== undefined) {
    prog.reversalRuleOnRefund = body.reversalRuleOnRefund === 'FULL' ? 'FULL' : 'PROPORTIONAL';
  }
  if (body.rulesDescription !== undefined) prog.rulesDescription = String(body.rulesDescription);
  prog.updatedBy = req.user?.id || 'admin';
  prog.updatedAt = new Date().toISOString();

  return res.json({ success: true, data: prog });
});

router.post('/loyalty/rewards', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'loyalty:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  const body = req.body || {};
  if (!body.name || Number(body.pointsRequired || 0) <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Informe o nome da recompensa e a pontuação necessária (> 0).',
    });
  }

  const reward = {
    id: `lrew-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    name: String(body.name).trim(),
    description: body.description || '',
    pointsRequired: Math.trunc(Number(body.pointsRequired)),
    rewardType: body.rewardType || 'DISCOUNT_CENTS',
    discountCents: Math.trunc(Number(body.discountCents || 0)),
    serviceId: body.serviceId || null,
    maxRedemptionsPerClient: body.maxRedemptionsPerClient ? Number(body.maxRedemptionsPerClient) : null,
    active: body.active !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  memoryStore.loyaltyRewards.push(reward);
  return res.status(201).json({ success: true, data: reward });
});

router.post('/loyalty/earn-from-payment', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'loyalty:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const resEarn = await awardLoyaltyPointsForPayment(
      ctx.tenantId,
      String(req.body?.paymentId || ''),
      req.user?.id || 'admin'
    );
    return res.json({ success: true, data: resEarn });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/loyalty/reverse-on-refund', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'loyalty:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const resRev = await reverseLoyaltyPointsOnRefund(ctx.tenantId, {
      refundReferenceId: String(req.body?.refundReferenceId || ''),
      paymentId: String(req.body?.paymentId || ''),
      refundedAmountCents: Number(req.body?.refundedAmountCents || 0),
      actorId: req.user?.id || 'admin',
    });
    return res.json({ success: true, data: resRev });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/loyalty/redeem', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const clientId =
      ctx.role === 'CUSTOMER'
        ? await resolveCurrentClientId(req, ctx.tenantId)
        : req.body?.clientId;
    if (!clientId) {
      return res.status(400).json({ success: false, error: 'Cliente não identificada.' });
    }
    const entry = await redeemLoyaltyReward(
      ctx.tenantId,
      clientId,
      String(req.body?.rewardId || ''),
      req.body?.idempotencyKey,
      req.user?.id || 'customer'
    );
    return res.json({ success: true, data: entry });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/loyalty/adjust', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  // Explicitly block CUSTOMER from altering their own balance
  if (ctx.role === 'CUSTOMER' || !hasPermission(ctx.role, 'loyalty:manage')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: você não possui permissão para alterar manualmente o saldo de pontos.',
    });
  }

  try {
    const entry = await manualAdjustLoyaltyPoints(ctx.tenantId, {
      clientId: String(req.body?.clientId || ''),
      pointsDelta: Number(req.body?.pointsDelta || 0),
      justification: String(req.body?.justification || ''),
      actorRole: ctx.role,
      actorId: req.user?.id || 'admin',
    });
    return res.json({ success: true, data: entry });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// ==========================================
// 4. CUPONS E PROMOÇÕES (COUPONS)
// ==========================================

router.get('/coupons', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  const coupons = memoryStore.coupons
    .filter((c: any) => c.tenantId === ctx.tenantId)
    .map((c: any) => {
      const redemptions = memoryStore.couponRedemptions.filter(
        (r: any) =>
          r.tenantId === ctx.tenantId &&
          r.couponId === c.id &&
          (r.status === 'RESERVED' || r.status === 'CONSUMED')
      );
      return {
        ...c,
        usedCount: redemptions.length,
      };
    });

  return res.json({ success: true, data: coupons });
});

router.post('/coupons', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'coupons:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado para gerenciar cupons.' });
  }
  try {
    const saved = saveCoupon(ctx.tenantId, req.body || {}, req.user?.id || 'admin');
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/coupons/validate', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  const clientId =
    ctx.role === 'CUSTOMER'
      ? (await resolveCurrentClientId(req, ctx.tenantId)) || ''
      : String(req.body?.clientId || '');

  const result = validateCouponServerSide(ctx.tenantId, {
    code: String(req.body?.code || ''),
    clientId,
    serviceId: String(req.body?.serviceId || ''),
    professionalId: req.body?.professionalId ? String(req.body.professionalId) : undefined,
    orderAmountCents: Number(req.body?.orderAmountCents ?? req.body?.amountCents ?? 0),
    hasOtherPromotionApplied: Boolean(req.body?.hasOtherPromotionApplied),
  });

  if (!result.valid) {
    return res.status(400).json({ success: false, error: result.error, data: result });
  }
  return res.json({ success: true, data: result });
});

router.post('/coupons/reserve', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const clientId =
      ctx.role === 'CUSTOMER'
        ? (await resolveCurrentClientId(req, ctx.tenantId)) || ''
        : String(req.body?.clientId || '');

    const reserved = await reserveCouponUsage(ctx.tenantId, {
      code: String(req.body?.code || ''),
      clientId,
      serviceId: String(req.body?.serviceId || ''),
      professionalId: req.body?.professionalId ? String(req.body.professionalId) : undefined,
      orderAmountCents: Number(req.body?.orderAmountCents || 0),
      appointmentId: req.body?.appointmentId ? String(req.body.appointmentId) : undefined,
      idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
    });
    return res.json({ success: true, data: reserved });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/coupons/release', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });
  const released = releaseReservedCoupon(
    ctx.tenantId,
    String(req.body?.redemptionId || req.body?.appointmentId || '')
  );
  return res.json({ success: true, data: released });
});

// ==========================================
// 5. PACOTES DE SERVIÇOS (PACKAGES)
// ==========================================

router.get('/packages', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  const catalog = memoryStore.servicePackages.filter((p: any) => p.tenantId === ctx.tenantId);

  if (ctx.role === 'CUSTOMER') {
    const clientId = await resolveCurrentClientId(req, ctx.tenantId);
    const myPackages = memoryStore.customerPackages.filter(
      (cp: any) => cp.tenantId === ctx.tenantId && cp.clientId === clientId
    );
    return res.json({
      success: true,
      data: {
        catalog: catalog.filter((p: any) => p.active !== false),
        customerPackages: myPackages,
      },
    });
  }

  const customerPackages = memoryStore.customerPackages.filter(
    (cp: any) => cp.tenantId === ctx.tenantId
  );
  const usageLedger = memoryStore.packageUsageLedgers.filter(
    (l: any) => l.tenantId === ctx.tenantId
  );

  return res.json({
    success: true,
    data: {
      catalog,
      customerPackages,
      usageLedger,
    },
  });
});

router.get('/packages/customer', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  let targetClientId = (req.query.clientId as string) || '';
  if (ctx.role === 'CUSTOMER') {
    const myClientId = await resolveCurrentClientId(req, ctx.tenantId);
    if (!myClientId) return res.json({ success: true, data: [] });
    if (targetClientId && targetClientId !== myClientId && targetClientId !== req.user?.id) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: você só pode consultar seus próprios pacotes.',
      });
    }
    targetClientId = myClientId;
  } else if (!hasPermission(ctx.role, 'packages:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }

  const myPackages = memoryStore.customerPackages
    .filter((cp: any) => cp.tenantId === ctx.tenantId && (!targetClientId || cp.clientId === targetClientId))
    .map((cp: any) => {
      const pkg = memoryStore.servicePackages.find((p: any) => p.id === cp.packageId);
      const service = memoryStore.services.find((s: any) => s.id === cp.serviceId);
      return {
        ...cp,
        packageName: cp.packageName || pkg?.name || 'Pacote de Serviços',
        serviceName: cp.serviceName || service?.name || 'Serviço',
      };
    });

  return res.json({ success: true, data: myPackages });
});

router.post('/packages', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'packages:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const saved = saveServicePackage(ctx.tenantId, req.body || {}, req.user?.id || 'admin');
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/packages/purchase', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'packages:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const purchased = purchaseCustomerPackage(ctx.tenantId, {
      packageId: String(req.body?.packageId || ''),
      clientId: String(req.body?.clientId || ''),
      paymentConfirmed: Boolean(req.body?.paymentConfirmed),
      paymentMethod: req.body?.paymentMethod || 'PIX',
      actorId: req.user?.id || 'admin',
    });
    return res.status(201).json({ success: true, data: purchased });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/packages/consume', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'packages:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const resConsume = await consumeCustomerPackageCredit(ctx.tenantId, {
      customerPackageId: String(req.body?.customerPackageId || ''),
      serviceId: String(req.body?.serviceId || ''),
      appointmentId: req.body?.appointmentId ? String(req.body.appointmentId) : undefined,
      idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
      actorId: req.user?.id || 'staff',
    });
    return res.json({ success: true, data: resConsume });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// ==========================================
// 6. CARTÕES-PRESENTE (GIFT CARDS)
// ==========================================

router.get('/gift-cards/lookup/:code', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const publicCard = lookupGiftCardForRecipient(ctx.tenantId, String(req.params.code || ''));
    return res.json({ success: true, data: publicCard });
  } catch (err: any) {
    return res.status(404).json({ success: false, error: err?.message || 'Cartão-presente não encontrado' });
  }
});

router.get('/gift-cards', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  if (req.query.code) {
    try {
      const publicCard = lookupGiftCardForRecipient(ctx.tenantId, String(req.query.code));
      return res.json({ success: true, data: publicCard });
    } catch (err: any) {
      return res.status(404).json({ success: false, error: err?.message });
    }
  }

  if (!hasPermission(ctx.role, 'giftcards:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }

  const cards = memoryStore.giftCards.filter((g: any) => g.tenantId === ctx.tenantId);
  const transactions = memoryStore.giftCardTransactions.filter(
    (t: any) => t.tenantId === ctx.tenantId
  );
  return res.json({ success: true, data: { cards, transactions } });
});

router.post('/gift-cards', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'giftcards:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const card = createGiftCard(ctx.tenantId, req.body || {}, req.user?.id || 'admin');
    return res.status(201).json({ success: true, data: card });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/gift-cards/:id/block', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'giftcards:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const blocked = blockGiftCard(
      ctx.tenantId,
      req.params.id,
      String(req.body?.justification || ''),
      req.user?.id || 'admin'
    );
    return res.json({ success: true, data: blocked });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/gift-cards/redeem', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });
  try {
    const result = await redeemGiftCard(ctx.tenantId, {
      code: String(req.body?.code || ''),
      amountCents: Number(req.body?.amountCents || 0),
      appointmentId: req.body?.appointmentId ? String(req.body.appointmentId) : undefined,
      idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
      actorId: req.user?.id || 'staff',
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// ==========================================
// 7. AVALIAÇÕES E FEEDBACK (REVIEWS)
// ==========================================

router.get('/reviews', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  const includeHidden =
    ctx.role !== 'CUSTOMER' &&
    hasPermission(ctx.role, 'reviews:manage') &&
    req.query.includeHidden !== 'false';

  const summary = getReviewsSummary(ctx.tenantId, {
    serviceId: req.query.serviceId as string | undefined,
    professionalId: req.query.professionalId as string | undefined,
    includeHidden,
  });
  return res.json({ success: true, data: summary });
});

router.post('/reviews', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const clientId =
      ctx.role === 'CUSTOMER'
        ? (await resolveCurrentClientId(req, ctx.tenantId)) || ''
        : String(req.body?.clientId || '');
    const created = createServiceReview(ctx.tenantId, {
      appointmentId: String(req.body?.appointmentId || ''),
      clientId,
      rating: Number(req.body?.rating || 5),
      comment: req.body?.comment,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/reviews/:id/reply', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'reviews:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const replied = replyToServiceReview(
      ctx.tenantId,
      req.params.id,
      String(req.body?.replyText || ''),
      req.user?.id || 'admin'
    );
    return res.json({ success: true, data: replied });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/reviews/:id/visibility', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'reviews:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const updated = moderateServiceReviewVisibility(
      ctx.tenantId,
      req.params.id,
      Boolean(req.body?.hidden),
      String(req.body?.reason || ''),
      req.user?.id || 'admin'
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// ==========================================
// 8. CAMPANHAS E COMUNICAÇÃO (CAMPAIGNS)
// ==========================================

router.get('/campaigns', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'campaigns:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }

  const campaigns = memoryStore.marketingCampaigns
    .filter((c: any) => c.tenantId === ctx.tenantId)
    .map((c: any) => {
      const recipients = memoryStore.campaignRecipients.filter(
        (r: any) => r.tenantId === ctx.tenantId && r.campaignId === c.id
      );
      return {
        ...c,
        recipientsCount: recipients.length,
        sentCount: recipients.filter((r: any) => r.status === 'SENT' || r.status === 'DELIVERED')
          .length,
        skippedNoConsentCount: recipients.filter((r: any) => r.status === 'SKIPPED_NO_CONSENT')
          .length,
        failedCount: recipients.filter((r: any) => r.status === 'FAILED').length,
      };
    });

  const preview = previewCampaignSegment(
    ctx.tenantId,
    (req.query.segmentType as string) || 'PROMOTIONAL_OPT_IN',
    req.query
  );

  return res.json({
    success: true,
    data: {
      campaigns,
      preview: {
        totalInSegment: preview.totalInSegment,
        eligibleWithMarketingConsentCount: preview.eligibleWithMarketingConsentCount,
        blockedWithoutConsentCount: preview.blockedWithoutConsentCount,
      },
    },
  });
});

router.post('/campaigns', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'campaigns:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const camp = createMarketingCampaign(ctx.tenantId, req.body || {}, req.user?.id || 'admin');
    return res.status(201).json({ success: true, data: camp });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/campaigns/:id/dispatch', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'campaigns:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const result = await dispatchMarketingCampaign(
      ctx.tenantId,
      req.params.id,
      Boolean(req.body?.confirmDispatch),
      req.user?.id || 'admin'
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// ==========================================
// 9. ESTOQUE BÁSICO DE PRODUTOS (INVENTORY)
// ==========================================

router.get('/inventory', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'inventory:read')) {
    return res.status(403).json({ success: false, error: 'Acesso negado ao estoque.' });
  }

  const products = memoryStore.inventoryProducts.filter((p: any) => p.tenantId === ctx.tenantId);
  const movements = memoryStore.inventoryMovements
    .filter((m: any) => m.tenantId === ctx.tenantId)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const alerts = {
    belowMinStock: products.filter(
      (p: any) => p.active !== false && p.currentQuantity > 0 && p.currentQuantity < p.minQuantity
    ),
    outOfStock: products.filter((p: any) => p.active !== false && p.currentQuantity === 0),
  };

  return res.json({
    success: true,
    data: {
      products,
      movements,
      alerts,
    },
  });
});

router.post('/inventory/products', (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'inventory:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const saved = saveInventoryProduct(ctx.tenantId, req.body || {}, req.user?.id || 'admin');
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

router.post('/inventory/movements', async (req: Request, res: Response) => {
  const ctx = req.tenantContext;
  if (!ctx || !hasPermission(ctx.role, 'inventory:manage')) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  try {
    const result = await recordInventoryMovement(ctx.tenantId, {
      productId: String(req.body?.productId || ''),
      type: req.body?.type || 'ADJUSTMENT',
      quantityDelta: Number(req.body?.quantityDelta || 0),
      reason: String(req.body?.reason || ''),
      referenceId: req.body?.referenceId ? String(req.body.referenceId) : undefined,
      idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
      actorId: req.user?.id || 'admin',
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

export default router;
