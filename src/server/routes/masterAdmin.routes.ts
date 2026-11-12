import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { saasService } from '../saasService.js';
import { customerStorage } from '../customerStorage.js';
import { db, memoryStore } from '../storage.js';

const router = Router();

/**
 * GET /api/v1/master-admin/dashboard
 * Global SaaS metrics and financial summary
 */
router.get('/dashboard', async (_req, res, next) => {
  try {
    await saasService.syncTenantsFromMySql();
    const dashboard = await saasService.getMasterAdminDashboard();
    res.json({
      success: true,
      data: dashboard,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/master-admin/plans
 * Lists commercial plans and their configurable default prices
 */
router.get('/plans', (_req, res) => {
  const plans = saasService.getPlansCatalog();
  res.json({
    success: true,
    data: plans,
  });
});

/**
 * PUT /api/v1/master-admin/plans/:code
 * Updates default monthly price for a commercial plan (for new subscriptions)
 */
router.put('/plans/:code', async (req: any, res, next) => {
  try {
    const { code } = req.params;
    const { defaultPriceCents, reason } = req.body || {};

    if (defaultPriceCents === undefined || defaultPriceCents === null) {
      return res.status(400).json({
        success: false,
        error: 'Informe o valor padrão mensal em centavos (defaultPriceCents).',
      });
    }

    const updated = await saasService.updateDefaultPlanPrice({
      planCode: code as any,
      defaultPriceCents: Number(defaultPriceCents),
      actorId: req.user?.id || 'user-master-1',
      reason,
    });

    res.json({
      success: true,
      data: updated,
      message: `Preço padrão do ${updated.name} atualizado com sucesso para novas assinaturas.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/master-admin/tenants
 * Lists and filters all establishments registered on the platform
 */
router.get('/tenants', async (req, res, next) => {
  try {
    await saasService.syncTenantsFromMySql();
    const search = req.query.search ? String(req.query.search) : undefined;
    const plan = req.query.plan ? String(req.query.plan) : undefined;
    const subscriptionStatus = req.query.subscriptionStatus ? String(req.query.subscriptionStatus) : undefined;
    const operationalStatus = req.query.operationalStatus ? String(req.query.operationalStatus) : undefined;

    const list = await saasService.listMasterAdminTenants({
      search,
      plan,
      subscriptionStatus,
      operationalStatus,
    });

    res.json({
      success: true,
      data: list,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/master-admin/tenants
 * Exclusively registers a new establishment and its owner account by Master Admin
 */
router.post('/tenants', async (req: any, res, next) => {
  try {
    saasService.ensureSaaSSeedData();
    const {
      businessName,
      slug,
      ownerName,
      ownerEmail,
      ownerPhone,
      ownerPassword,
      plan,
      description,
      address,
    } = req.body || {};

    if (!businessName || !ownerName || !ownerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Informe o nome do estabelecimento, o nome do proprietário e o e-mail de acesso.',
      });
    }

    const cleanEmail = String(ownerEmail).trim().toLowerCase();
    const users = db.getUsers ? await db.getUsers() : memoryStore.users;
    const existing = users.find((u: any) => String(u.email || '').toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `O e-mail ${cleanEmail} já está cadastrado no sistema. Informe outro e-mail para o proprietário.`,
      });
    }

    const effectivePassword = (ownerPassword && String(ownerPassword).trim()) || '123456';
    const passwordHash = await bcrypt.hash(effectivePassword, 10);

    const result = await db.registerTenantWithUser({
      businessName: String(businessName).trim(),
      slug: slug ? String(slug).trim() : undefined,
      name: String(ownerName).trim(),
      email: cleanEmail,
      phone: ownerPhone ? String(ownerPhone).trim() : '',
      passwordHash,
      plan: plan === 'SIMPLE' ? 'SIMPLE' : 'COMPLETE',
      description: description ? String(description).trim() : '',
      address: address ? String(address).trim() : '',
      seedStarterCatalog: true,
    });

    await db.recordAuditLog(
      result.tenant.id,
      req.user?.id || 'user-master-1',
      'MASTER_ADMIN_TENANT_CREATED',
      {
        tenantId: result.tenant.id,
        tenantName: result.tenant.name,
        slug: result.tenant.slug,
        ownerEmail: cleanEmail,
        plan: plan === 'SIMPLE' ? 'SIMPLE' : 'COMPLETE',
      }
    );

    res.status(201).json({
      success: true,
      data: {
        tenant: result.tenant,
        owner: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          phone: result.user.phone,
          role: 'OWNER',
        },
        links: {
          publicBookingUrl: `/agendar/${result.tenant.slug}`,
          ownerLoginUrl: `/acesso-lojista`,
        },
      },
      message: `Estabelecimento "${result.tenant.name}" credenciado e cadastrado com sucesso!`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/master-admin/tenants/:tenantId
 * Detailed view of a specific establishment, its subscription, members, invoices, and audit logs
 */
router.get('/tenants/:tenantId', async (req, res, next) => {
  try {
    await saasService.syncTenantsFromMySql();
    const details = await saasService.getMasterAdminTenantDetails(req.params.tenantId);
    res.json({
      success: true,
      data: details,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/master-admin/tenants/:tenantId
 * Permanently deletes a store/establishment and its tenant-scoped records
 */
router.delete('/tenants/:tenantId', async (req: any, res, next) => {
  try {
    const { tenantId } = req.params;
    const reason = req.body?.reason || req.query?.reason;

    const result = await saasService.deleteTenant({
      tenantId,
      actorId: req.user?.id || 'user-master-1',
      reason: reason ? String(reason).trim() : undefined,
    });

    res.json({
      success: true,
      data: result,
      message: `Estabelecimento "${result.deletedTenantName}" excluído permanentemente com sucesso.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT / PATCH /api/v1/master-admin/tenants/:tenantId/plan
 * Changes a tenant's commercial plan (SIMPLE | COMPLETE)
 */
const handleTenantPlanChange = async (req: any, res: any, next: any) => {
  try {
    const { tenantId } = req.params;
    const { plan, planCode, customPriceCents, customContractedPriceCents, applyDefaultPlanPrice, usePlanDefaultPrice, reason } = req.body || {};
    const effectivePlan = plan || planCode;

    if (!effectivePlan || !['SIMPLE', 'COMPLETE', 'FREE', 'PRO'].includes(String(effectivePlan).toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Informe um plano válido (SIMPLE ou COMPLETE).',
      });
    }

    const effectiveCustomPrice = customContractedPriceCents !== undefined ? customContractedPriceCents : customPriceCents;
    const effectiveUseDefault =
      usePlanDefaultPrice !== undefined
        ? Boolean(usePlanDefaultPrice)
        : applyDefaultPlanPrice !== undefined
        ? Boolean(applyDefaultPlanPrice)
        : true;

    const result = await saasService.changeTenantPlan({
      tenantId,
      newPlan: String(effectivePlan).toUpperCase() as any,
      customContractedPriceCents: effectiveCustomPrice !== undefined ? Number(effectiveCustomPrice) : undefined,
      usePlanDefaultPrice: effectiveUseDefault,
      actorId: req.user?.id || 'user-master-1',
      reason: reason || 'Alteração administrativa de plano pelo Master Admin',
    });

    res.json({
      success: true,
      data: result,
      message: `Plano do estabelecimento alterado para ${result.planName} com sucesso.`,
    });
  } catch (err) {
    next(err);
  }
};
router.patch('/tenants/:tenantId/plan', handleTenantPlanChange);
router.put('/tenants/:tenantId/plan', handleTenantPlanChange);

/**
 * PUT / PATCH /api/v1/master-admin/tenants/:tenantId/contracted-price
 * Updates the custom contracted monthly price for a specific establishment
 */
const handleContractedPriceUpdate = async (req: any, res: any, next: any) => {
  try {
    const { tenantId } = req.params;
    const { contractedPriceCents, reason } = req.body || {};

    if (contractedPriceCents === undefined || contractedPriceCents === null) {
      return res.status(400).json({
        success: false,
        error: 'Informe o valor contratado em centavos (contractedPriceCents).',
      });
    }

    const updated = await saasService.updateTenantContractedPrice({
      tenantId,
      contractedPriceCents: Number(contractedPriceCents),
      actorId: req.user?.id || 'user-master-1',
      reason: String(reason || ''),
    });

    res.json({
      success: true,
      data: updated,
      message: 'Valor mensal contratado atualizado com sucesso.',
    });
  } catch (err) {
    next(err);
  }
};
router.patch('/tenants/:tenantId/contracted-price', handleContractedPriceUpdate);
router.put('/tenants/:tenantId/contracted-price', handleContractedPriceUpdate);

/**
 * PUT / PATCH /api/v1/master-admin/tenants/:tenantId/status
 * Updates subscription status and/or operational access status (ACTIVE, PAST_DUE, BLOCKED, CANCELLED)
 */
const handleTenantStatusUpdate = async (req: any, res: any, next: any) => {
  try {
    const { tenantId } = req.params;
    const { status, subscriptionStatus, operationalStatus, reason, nextBillingAt } = req.body || {};

    const effectiveSubStatus = subscriptionStatus || status;
    const effectiveOpStatus =
      operationalStatus ||
      (status === 'BLOCKED' || status === 'SUSPENDED'
        ? 'BLOCKED'
        : status === 'CANCELLED'
        ? 'CANCELLED'
        : status === 'ACTIVE'
        ? 'ACTIVE'
        : undefined);

    const result = await saasService.updateTenantSubscriptionAndAccessStatus({
      tenantId,
      subscriptionStatus: effectiveSubStatus,
      operationalStatus: effectiveOpStatus as any,
      reason: String(reason || ''),
      nextBillingAt,
      actorId: req.user?.id || 'user-master-1',
    });

    res.json({
      success: true,
      data: result,
      message: 'Status da assinatura e acesso operacional atualizados com sucesso.',
    });
  } catch (err) {
    next(err);
  }
};
router.patch('/tenants/:tenantId/status', handleTenantStatusUpdate);
router.put('/tenants/:tenantId/status', handleTenantStatusUpdate);

/**
 * PUT / PATCH /api/v1/master-admin/tenants/:tenantId/advanced-features
 * Enables or disables Advanced Features & Loyalty for a specific establishment
 */
const handleToggleAdvancedFeatures = async (req: any, res: any, next: any) => {
  try {
    const { tenantId } = req.params;
    const { enabled, enableAdvancedFeatures, reason } = req.body || {};
    const targetEnabled =
      enabled !== undefined ? Boolean(enabled) : Boolean(enableAdvancedFeatures);

    const result = await saasService.toggleTenantAdvancedFeatures({
      tenantId,
      enabled: targetEnabled,
      actorId: req.user?.id || 'user-master-1',
      reason: reason ? String(reason).trim() : undefined,
    });

    res.json({
      success: true,
      data: result,
      message: targetEnabled
        ? 'Recursos Avançados e Fidelidade ativados para este estabelecimento!'
        : 'Recursos Avançados e Fidelidade desativados para este estabelecimento.',
    });
  } catch (err) {
    next(err);
  }
};
router.patch('/tenants/:tenantId/advanced-features', handleToggleAdvancedFeatures);
router.put('/tenants/:tenantId/advanced-features', handleToggleAdvancedFeatures);

/**
 * POST /api/v1/master-admin/tenants/:tenantId/invoices
 * Creates a SaaS subscription invoice for an establishment
 */
router.post('/tenants/:tenantId/invoices', async (req: any, res, next) => {
  try {
    const { tenantId } = req.params;
    const { amountCents, dueDate, status, paymentMethod, notes } = req.body || {};

    const invoice = await saasService.createSaaSInvoice({
      tenantId,
      amountCents: amountCents !== undefined ? Number(amountCents) : undefined,
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      status,
      paymentMethod,
      notes,
      actorId: req.user?.id || 'user-master-1',
    });

    res.status(201).json({
      success: true,
      data: invoice,
      message: 'Cobrança de assinatura SaaS registrada com sucesso.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT / PATCH /api/v1/master-admin/invoices/:invoiceId
 * Updates a SaaS subscription invoice status (e.g., PAID, OVERDUE, CANCELLED)
 */
const handleInvoiceStatusUpdate = async (req: any, res: any, next: any) => {
  try {
    const { invoiceId } = req.params;
    const { status, notes } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Informe o novo status da cobrança (PENDING, PAID, OVERDUE ou CANCELLED).',
      });
    }

    const updated = await saasService.markSaaSInvoiceStatus({
      invoiceId,
      status: status as any,
      notes,
      actorId: req.user?.id || 'user-master-1',
    });

    res.json({
      success: true,
      data: updated,
      message: 'Status da fatura SaaS atualizado com sucesso.',
    });
  } catch (err) {
    next(err);
  }
};
router.patch('/invoices/:invoiceId', handleInvoiceStatusUpdate);
router.put('/invoices/:invoiceId', handleInvoiceStatusUpdate);

/**
 * GET /api/v1/master-admin/users
 * Lists and searches all global users and their linked establishments
 */
router.get('/users', async (req, res, next) => {
  try {
    const search = req.query.search ? String(req.query.search) : undefined;
    const role = req.query.role ? String(req.query.role) : undefined;
    const users = await saasService.listMasterAdminUsers({ search, role });
    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/master-admin/customer-links/:userId
 * Lists all permanent establishment links for a specific customer user
 */
router.get('/customer-links/:userId', async (req, res, next) => {
  try {
    saasService.ensureSaaSSeedData();
    const { userId } = req.params;
    const user = (memoryStore.users as any[]).find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário global não encontrado.',
      });
    }
    const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(
      user.id,
      user.email
    );
    res.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        linkedEstablishments,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/master-admin/customer-links/reconcile
 * Exceptional administrative customer link reconciliation by Master Admin
 * Requires mandatory justification (reason) and logs to AuditLog without deleting history
 */
router.post('/customer-links/reconcile', async (req: any, res, next) => {
  try {
    const { userId, targetTenantId, slug, sourceClientId, action, reason } = req.body || {};
    const targetRef = targetTenantId || slug;
    if (!userId || !targetRef) {
      return res.status(400).json({
        success: false,
        error: 'Informe userId e targetTenantId (ou slug) para realizar a reconciliação administrativa de vínculo.',
      });
    }

    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({
        success: false,
        code: 'REASON_REQUIRED',
        error: 'Justificativa administrativa obrigatória (mínimo de 5 caracteres) para correção excepcional de vínculo.',
      });
    }

    const result = await customerStorage.reconcileCustomerLinkByMasterAdmin({
      userId: String(userId),
      targetTenantId: String(targetRef),
      sourceClientId: sourceClientId ? String(sourceClientId) : undefined,
      action: action || 'REPAIR_LINK',
      reason: String(reason).trim(),
      actorId: req.user?.id || 'user-master-1',
    });

    res.json({
      success: true,
      data: result,
      message: 'Vínculo administrativo reconciliado com sucesso e registrado no AuditLog.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/master-admin/audit-logs
 * Lists global administrative audit logs
 */
router.get('/audit-logs', (req, res) => {
  saasService.ensureSaaSSeedData();
  const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
  const action = req.query.action ? String(req.query.action) : undefined;

  let logs = [...(memoryStore.auditLogs as any[])];
  if (tenantId) {
    logs = logs.filter((l) => l.tenantId === tenantId);
  }
  if (action) {
    logs = logs.filter((l) => String(l.action || '').includes(action));
  }
  logs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  res.json({
    success: true,
    data: logs.slice(0, 150),
  });
});

export default router;
