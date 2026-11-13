import bcrypt from 'bcryptjs';
import {
  getMySqlPool,
  getConnectionWithRetry,
  queryWithRetry,
  invalidateQueryCache,
  handleDbFallbackError,
  getLastCacheInvalidationTime,
} from './db/mysql.js';
import {
  db,
  memoryStore,
  DEFAULT_CANCELLATION_POLICY_TEXT,
  DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
} from './storage.js';

export type CommercialPlanType = 'SIMPLE' | 'COMPLETE';
export type TenantOperationalStatus = 'ACTIVE' | 'BLOCKED' | 'CANCELLED';
export type SubscriptionLifecycleStatus =
  | 'ACTIVE'
  | 'PENDING_PAYMENT'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'BLOCKED'
  | 'CANCELLED';

export function normalizePlanCode(rawPlan?: string | null): CommercialPlanType {
  const upper = String(rawPlan || 'COMPLETE').trim().toUpperCase();
  if (upper === 'SIMPLE' || upper === 'FREE') {
    return 'SIMPLE';
  }
  return 'COMPLETE';
}

export function normalizeOperationalStatus(rawStatus?: string | null): TenantOperationalStatus {
  const upper = String(rawStatus || 'ACTIVE').trim().toUpperCase();
  if (upper === 'BLOCKED' || upper === 'SUSPENDED') return 'BLOCKED';
  if (upper === 'CANCELLED') return 'CANCELLED';
  return 'ACTIVE';
}

export function normalizeSubscriptionStatus(rawStatus?: string | null): SubscriptionLifecycleStatus {
  const upper = String(rawStatus || 'ACTIVE').trim().toUpperCase();
  if (
    ['ACTIVE', 'PENDING_PAYMENT', 'PAST_DUE', 'SUSPENDED', 'BLOCKED', 'CANCELLED'].includes(upper)
  ) {
    return upper as SubscriptionLifecycleStatus;
  }
  return 'ACTIVE';
}

export function slugifyBusinessName(name: string, suffix?: string): string {
  const base = String(name || 'estabelecimento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'estabelecimento';
  return suffix ? `${base}-${suffix}` : base;
}

let lastFullSyncTimestamp = 0;
let syncInFlightPromise: Promise<void> | null = null;

export const saasService = {
  ensureSaaSSeedData() {
    const store = memoryStore as any;

    if (!Array.isArray(store.saasPlanCatalog) || store.saasPlanCatalog.length === 0) {
      const nowIso = new Date().toISOString();
      store.saasPlanCatalog = [
        {
          id: 'plan-simple',
          code: 'SIMPLE' as CommercialPlanType,
          name: 'Plano Simples — Agendamento',
          description:
            'Cadastro de clientes, serviços, profissionais, agenda de horários, gestão básica e link público de agendamento (sem cobrança de sinal antecipado).',
          defaultPriceCents: 4990,
          allowDeposit: false,
          features: [
            'Cadastro de clientes (CRM)',
            'Catálogo de serviços e profissionais',
            'Agenda de horários e bloqueios',
            'Link público de agendamento (/agendar/:slug)',
            'Diretório de Empresas Parceiras',
          ],
          active: true,
          updatedBy: 'system',
          priceHistory: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: 'plan-complete',
          code: 'COMPLETE' as CommercialPlanType,
          name: 'Plano Completo — Agendamento com Sinal',
          description:
            'Inclui todos os recursos do Plano Simples + configuração de sinal antecipado, cobrança dinâmica via Pix (Mercado Pago), controle de pagamentos e gestão financeira avançada.',
          defaultPriceCents: 9990,
          allowDeposit: true,
          features: [
            'Todos os recursos do Plano Simples',
            'Configuração de sinal antecipado (%)',
            'Cobrança dinâmica via Pix (Mercado Pago)',
            'Controle de pagamentos e reembolsos de sinal',
            'Gestão financeira completa, caixa e comissões',
          ],
          active: true,
          updatedBy: 'system',
          priceHistory: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ];
    }

    // Ensure biz-1 has status, description, logoUrl, isPublished
    const biz1 = store.tenants.find((t: any) => t.id === 'biz-1');
    if (biz1) {
      if (!biz1.status) biz1.status = 'ACTIVE';
      if (biz1.isPublished === undefined) biz1.isPublished = true;
      if (!biz1.description) {
        biz1.description =
          'Especialistas em alongamento de fibra de vidro, nail art delicada e spa dos pés em São Paulo.';
      }
      if (biz1.logoUrl === undefined) biz1.logoUrl = '';
      if (!biz1.cancellationPolicyText || !String(biz1.cancellationPolicyText).trim()) {
        biz1.cancellationPolicyText = DEFAULT_CANCELLATION_POLICY_TEXT;
      }
      if (!biz1.cancellationContactInstructions || !String(biz1.cancellationContactInstructions).trim()) {
        biz1.cancellationContactInstructions = DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS;
      }
    }

    // Ensure all registered tenants have complete cancellation policy and contact instructions
    for (const t of store.tenants) {
      if (t.enableAdvancedFeatures === undefined) {
        t.enableAdvancedFeatures = false;
      }
      if (!t.cancellationPolicyText || !String(t.cancellationPolicyText).trim()) {
        t.cancellationPolicyText = DEFAULT_CANCELLATION_POLICY_TEXT;
      }
      if (!t.cancellationContactInstructions || !String(t.cancellationContactInstructions).trim()) {
        t.cancellationContactInstructions = DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS;
      }
    }

    // Ensure Master Admin user always exists and uses updated email
    const existingMaster = store.users.find(
      (u: any) =>
        u.id === 'user-master-1' ||
        u.isMasterAdmin ||
        u.role === 'SUPER_ADMIN' ||
        String(u.email || '').toLowerCase() === 'prwashingtondiasbh@gmail.com' ||
        String(u.email || '').toLowerCase() === 'master@agendabeauty.com.br'
    );
    if (!existingMaster) {
      store.users.push({
        id: 'user-master-1',
        name: 'Master Admin SaaS',
        email: 'prwashingtondiasbh@gmail.com',
        phone: '(11) 99999-0000',
        passwordHash: bcrypt.hashSync('123456', 10),
        tenantId: 'biz-1',
        role: 'SUPER_ADMIN',
        isMasterAdmin: true,
        professionalId: undefined,
        resetToken: null,
        resetExpires: null,
        active: true,
      });
    } else if (String(existingMaster.email || '').toLowerCase() === 'master@agendabeauty.com.br') {
      existingMaster.email = 'prwashingtondiasbh@gmail.com';
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.AGENDA_TEST_MODE === '1';

    if (isTestMode) {
      // Partner business biz-belle-2 exists strictly during automated multi-store testing
      if (!store.tenants.some((t: any) => t.id === 'biz-belle-2')) {
        store.tenants.push({
          id: 'biz-belle-2',
          name: 'Belle Époque Nail & Spa Rio',
          slug: 'belle-epoque-rio',
          description:
            'Estúdio especializado em blindagem em gel, esmaltação artística e cuidados completos com confirmação imediata.',
          logoUrl: '',
          phone: '(21) 99888-7766',
          email: 'contato@belleepoque.com.br',
          address: 'Rua Visconde de Pirajá, 450 - Ipanema, RJ',
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
          openTime: '09:00',
          closeTime: '19:00',
          status: 'ACTIVE',
          isPublished: true,
          blockedReason: null,
          blockedAt: null,
          cancelledAt: null,
          cancelledReason: null,
          requireDeposit: false,
          defaultDeposit: 0,
          cancellationHoursLimit: 6,
          allowCustomerReschedule: true,
          allowManualReviewOutOfPeriod: true,
          cancellationPolicyText: DEFAULT_CANCELLATION_POLICY_TEXT,
          cancellationContactInstructions: DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
          cancellationPolicyVersion: 1,
          createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
        });
      }

      if (!store.users.some((u: any) => u.email === 'helena@belleepoque.com.br')) {
        store.users.push({
          id: 'user-owner-2',
          name: 'Helena Vasconcelos',
          email: 'helena@belleepoque.com.br',
          phone: '(21) 99888-7766',
          passwordHash: bcrypt.hashSync('123456', 10),
          tenantId: 'biz-belle-2',
          role: 'OWNER',
          isMasterAdmin: false,
          professionalId: 'prof-b2-1',
          resetToken: null,
          resetExpires: null,
          active: true,
        });
      }

      // Ensure biz-belle-2 professionals & services exist
      if (!store.professionals.some((p: any) => p.id === 'prof-b2-1')) {
        store.professionals.push(
          {
            id: 'prof-b2-1',
            tenantId: 'biz-belle-2',
            name: 'Helena Vasconcelos',
            email: 'helena@belleepoque.com.br',
            phone: '(21) 99888-7766',
            avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
            specialty: 'Blindagem em Gel & Nail Art',
            active: true,
          },
          {
            id: 'prof-b2-2',
            tenantId: 'biz-belle-2',
            name: 'Marina Castro',
            email: 'marina@belleepoque.com.br',
            phone: '(21) 99777-6655',
            avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
            specialty: 'Esmaltação em Gel & Spa das Mãos',
            active: true,
          }
        );
      }

      if (!store.services.some((s: any) => s.id === 'serv-b2-1')) {
        store.services.push(
          {
            id: 'serv-b2-1',
            tenantId: 'biz-belle-2',
            name: 'Blindagem Diamante em Gel',
            description: 'Proteção estrutural para unhas naturais com brilho duradouro',
            category: 'Blindagem',
            priceCents: 12000,
            durationMin: 60,
            bufferBeforeMin: 0,
            bufferAfterMin: 10,
            preparationMin: 0,
            depositPercent: 0,
            active: true,
          },
          {
            id: 'serv-b2-2',
            tenantId: 'biz-belle-2',
            name: 'Manicure & Pedicure Clássica Spa',
            description: 'Cuticulagem completa, esfoliação e esmaltação tradicional',
            category: 'Manicure',
            priceCents: 7500,
            durationMin: 60,
            bufferBeforeMin: 0,
            bufferAfterMin: 10,
            preparationMin: 0,
            depositPercent: 0,
            active: true,
          }
        );
      }

      // Seed test customer & appointment for test runner only
      if (!store.users.some((u: any) => u.email === 'beatriz@email.com')) {
        store.users.push({
          id: 'user-cust-1',
          name: 'Beatriz Lima',
          email: 'beatriz@email.com',
          passwordHash: bcrypt.hashSync('123456', 10),
          tenantId: 'biz-1',
          role: 'CUSTOMER',
          professionalId: undefined,
          resetToken: null,
          resetExpires: null,
          active: true,
        });
      }

      if (!store.clients.some((c: any) => c.id === 'cli-1')) {
        store.clients.push({
          id: 'cli-1',
          tenantId: 'biz-1',
          userId: 'user-cust-1',
          name: 'Beatriz Lima',
          phone: '(11) 97777-1111',
          normalizedPhone: '+5511977771111',
          email: 'beatriz@email.com',
          contactPreference: 'WHATSAPP',
          whatsappOptIn: true,
          promotionalConsent: false,
          notes: 'Prefere esmalte claro e formato amendoado.',
          createdAt: new Date().toISOString(),
        });
      }

      if (!store.appointments.some((a: any) => a.id === 'app-seed-1')) {
        store.appointments.push({
          id: 'app-seed-1',
          tenantId: 'biz-1',
          clientId: 'cli-1',
          professionalId: 'prof-1',
          serviceId: 'serv-1',
          dateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          endDateTime: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
          status: 'CONFIRMED',
          totalAmountCents: 18000,
          depositAmountCents: 5400,
          balanceAmountCents: 12600,
          snapshotPriceCents: 18000,
          snapshotDurationMin: 120,
          snapshotDepositPercent: 30,
          snapshotDepositCents: 5400,
          snapshotBalanceCents: 12600,
          snapshotCancellationHours: 6,
          snapshotPolicyText: DEFAULT_CANCELLATION_POLICY_TEXT,
          snapshotPolicyVersion: 1,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      // In normal / production runtime: strip test-only seed records (biz-belle-2, beatriz, cli-1, app-seed-*)
      store.tenants = store.tenants.filter((t: any) => t.id !== 'biz-belle-2');
      store.users = store.users.filter(
        (u: any) =>
          u.id !== 'user-owner-2' &&
          u.id !== 'user-cust-1' &&
          u.email !== 'beatriz@email.com' &&
          u.email !== 'helena@belleepoque.com.br'
      );
      store.professionals = store.professionals.filter((p: any) => p.tenantId !== 'biz-belle-2');
      store.services = store.services.filter((s: any) => s.tenantId !== 'biz-belle-2');
      store.clients = store.clients.filter((c: any) => c.tenantId !== 'biz-belle-2' && c.id !== 'cli-1');
      store.appointments = store.appointments.filter((a: any) => a.id !== 'app-seed-1' && a.id !== 'app-seed-2');
    }

    // Ensure subscriptions array exists
    if (!Array.isArray(store.subscriptions)) {
      store.subscriptions = [];
    }

    for (const tenant of store.tenants) {
      const existingSub = store.subscriptions.find((s: any) => s.tenantId === tenant.id);
      if (!existingSub) {
        const defaultPlan: CommercialPlanType = tenant.id === 'biz-belle-2' ? 'SIMPLE' : 'COMPLETE';
        const planMeta = store.saasPlanCatalog.find((p: any) => p.code === defaultPlan);
        const priceCents = planMeta?.defaultPriceCents ?? (defaultPlan === 'COMPLETE' ? 9990 : 4990);
        const now = new Date();
        const nextBilling = new Date(now.getTime() + 25 * 24 * 3600 * 1000).toISOString();
        store.subscriptions.push({
          id: `sub-${tenant.id}`,
          tenantId: tenant.id,
          plan: defaultPlan,
          status: 'ACTIVE' as SubscriptionLifecycleStatus,
          contractedPriceCents: priceCents,
          billingCycle: 'MONTHLY',
          startedAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
          expiresAt: nextBilling,
          nextBillingAt: nextBilling,
          cancelledAt: null,
          statusReason: 'Assinatura ativa em dia',
          updatedBy: 'system',
          history: [],
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
    }

    // Ensure saasInvoices array exists (SaaS billing strictly separated from customer Pix deposits!)
    if (!Array.isArray(store.saasInvoices)) {
      const now = new Date();
      store.saasInvoices = [
        {
          id: 'saas-inv-seed-1',
          tenantId: 'biz-1',
          subscriptionId: 'sub-biz-1',
          plan: 'COMPLETE',
          amountCents: 9990,
          dueDate: new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
          paidAt: new Date(now.getTime() - 6 * 24 * 3600 * 1000).toISOString(),
          status: 'PAID',
          paymentMethod: 'PIX',
          externalReference: 'SAAS-INV-BIZ1-01',
          notes: 'Mensalidade Plano Completo quitada',
          createdBy: 'system',
          createdAt: new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
          updatedAt: new Date(now.getTime() - 6 * 24 * 3600 * 1000).toISOString(),
        },
        {
          id: 'saas-inv-seed-2',
          tenantId: 'biz-belle-2',
          subscriptionId: 'sub-biz-belle-2',
          plan: 'SIMPLE',
          amountCents: 4990,
          dueDate: new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString(),
          paidAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString(),
          status: 'PAID',
          paymentMethod: 'PIX',
          externalReference: 'SAAS-INV-BIZ2-01',
          notes: 'Mensalidade Plano Simples quitada',
          createdBy: 'system',
          createdAt: new Date(now.getTime() - 8 * 24 * 3600 * 1000).toISOString(),
          updatedAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString(),
        },
      ];
    }

    // Ensure tenantMembers array exists and mirrors establishment staff memberships (excluding platform Master Admin)
    if (!Array.isArray(store.tenantMembers)) {
      store.tenantMembers = [];
    }
    store.tenantMembers = store.tenantMembers.filter(
      (tm: any) =>
        tm.role !== 'SUPER_ADMIN' &&
        !store.users.some(
          (u: any) =>
            u.id === tm.userId &&
            (u.isMasterAdmin ||
              u.role === 'SUPER_ADMIN' ||
              String(u.email || '').toLowerCase() === 'prwashingtondiasbh@gmail.com')
        )
    );
    for (const u of store.users) {
      if (
        u.tenantId &&
        u.role &&
        u.role !== 'CUSTOMER' &&
        u.role !== 'SUPER_ADMIN' &&
        !u.isMasterAdmin &&
        String(u.email || '').toLowerCase() !== 'prwashingtondiasbh@gmail.com'
      ) {
        const exists = store.tenantMembers.some(
          (tm: any) => tm.userId === u.id && tm.tenantId === u.tenantId
        );
        if (!exists) {
          store.tenantMembers.push({
            id: `tm-${u.id}-${u.tenantId}`,
            tenantId: u.tenantId,
            userId: u.id,
            role: u.role,
            professionalId: u.professionalId || undefined,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  },

  getPlansCatalog() {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    return store.saasPlanCatalog.map((p: any) => ({
      ...p,
      formattedDefaultPrice: (Number(p.defaultPriceCents || 0) / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    }));
  },

  getPlanMetadata(planCode: string) {
    this.ensureSaaSSeedData();
    const normalized = normalizePlanCode(planCode);
    const store = memoryStore as any;
    const found = store.saasPlanCatalog.find((p: any) => p.code === normalized);
    return (
      found || {
        id: normalized === 'SIMPLE' ? 'plan-simple' : 'plan-complete',
        code: normalized,
        name:
          normalized === 'SIMPLE'
            ? 'Plano Simples — Agendamento'
            : 'Plano Completo — Agendamento com Sinal',
        description: '',
        defaultPriceCents: normalized === 'SIMPLE' ? 4990 : 9990,
        allowDeposit: normalized === 'COMPLETE',
        features: [],
        active: true,
      }
    );
  },

  getTenantSubscription(tenantId: string) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    let sub = store.subscriptions.find((s: any) => s.tenantId === tenantId);
    if (!sub) {
      const planMeta = this.getPlanMetadata('COMPLETE');
      const now = new Date();
      const nextBilling = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
      sub = {
        id: `sub-${tenantId}`,
        tenantId,
        plan: 'COMPLETE' as CommercialPlanType,
        status: 'ACTIVE' as SubscriptionLifecycleStatus,
        contractedPriceCents: planMeta.defaultPriceCents,
        billingCycle: 'MONTHLY',
        startedAt: now.toISOString(),
        expiresAt: nextBilling,
        nextBillingAt: nextBilling,
        cancelledAt: null,
        statusReason: 'Assinatura inicial ativa',
        updatedBy: 'system',
        history: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      store.subscriptions.push(sub);
    }

    const normalizedPlan = normalizePlanCode(sub.plan);
    const planMeta = this.getPlanMetadata(normalizedPlan);
    return {
      ...sub,
      plan: normalizedPlan,
      rawPlan: sub.plan,
      planName: planMeta.name,
      allowDeposit: Boolean(planMeta.allowDeposit),
      status: normalizeSubscriptionStatus(sub.status),
      contractedPriceCents: Number(sub.contractedPriceCents ?? planMeta.defaultPriceCents),
      formattedContractedPrice: (
        Number(sub.contractedPriceCents ?? planMeta.defaultPriceCents) / 100
      ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    };
  },

  getTenantCapabilities(tenantId: string) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    const tenant = store.tenants.find((t: any) => t.id === tenantId);
    const sub = this.getTenantSubscription(tenantId);

    const operationalStatus = normalizeOperationalStatus(
      tenant?.status ||
        (sub.status === 'BLOCKED' || sub.status === 'SUSPENDED'
          ? 'BLOCKED'
          : sub.status === 'CANCELLED'
          ? 'CANCELLED'
          : 'ACTIVE')
    );

    const isBlockedOrCancelled =
      operationalStatus === 'BLOCKED' ||
      operationalStatus === 'CANCELLED' ||
      sub.status === 'BLOCKED' ||
      sub.status === 'SUSPENDED' ||
      sub.status === 'CANCELLED';

    return {
      plan: sub.plan,
      planName: sub.planName,
      allowDeposit: sub.plan === 'COMPLETE',
      enableAdvancedFeatures: Boolean(tenant?.enableAdvancedFeatures),
      operationalStatus,
      subscriptionStatus: sub.status,
      canWriteAdmin: !isBlockedOrCancelled,
      canAcceptOnlineBookings: !isBlockedOrCancelled,
      blockedReason: tenant?.blockedReason || tenant?.cancelledReason || sub.statusReason || null,
    };
  },

  assertTenantOperationalWriteAllowed(tenantId: string) {
    const caps = this.getTenantCapabilities(tenantId);
    if (!caps.canWriteAdmin) {
      const err: any = new Error(
        caps.operationalStatus === 'CANCELLED' || caps.subscriptionStatus === 'CANCELLED'
          ? `Acesso administrativo suspenso: a assinatura deste estabelecimento encontra-se CANCELADA (${caps.blockedReason || 'Entre em contato com o suporte comercial para reativação'}).`
          : `Acesso administrativo suspenso temporariamente (${caps.blockedReason || 'Pendência de assinatura SaaS'}). Regularize sua assinatura para liberar alterações e novos agendamentos.`
      );
      err.statusCode = 403;
      err.code = 'TENANT_ACCESS_SUSPENDED';
      throw err;
    }
  },

  assertTenantPublicBookingAllowed(tenantId: string) {
    const caps = this.getTenantCapabilities(tenantId);
    if (!caps.canAcceptOnlineBookings) {
      const err: any = new Error(
        'Este estabelecimento não está recebendo novos agendamentos online no momento.'
      );
      err.statusCode = 403;
      err.code = 'TENANT_BOOKING_UNAVAILABLE';
      throw err;
    }
  },

  assertPlanAllowsDeposit(tenantId: string) {
    const caps = this.getTenantCapabilities(tenantId);
    if (!caps.allowDeposit) {
      const err: any = new Error(
        'Recurso indisponível no Plano Simples (Agendamento). Faça upgrade para o Plano Completo para habilitar a exigência de sinal antecipado via Pix.'
      );
      err.statusCode = 403;
      err.code = 'PLAN_DOES_NOT_ALLOW_DEPOSIT';
      throw err;
    }
  },

  async updateDefaultPlanPrice(params: {
    planCode: CommercialPlanType;
    defaultPriceCents: number;
    actorId: string;
    reason?: string;
  }) {
    this.ensureSaaSSeedData();
    const code = normalizePlanCode(params.planCode);
    const priceCents = Math.round(Number(params.defaultPriceCents));
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      const err: any = new Error('O valor mensal padrão do plano deve ser informado em centavos inteiros não-negativos.');
      err.statusCode = 400;
      throw err;
    }

    const store = memoryStore as any;
    const planItem = store.saasPlanCatalog.find((p: any) => p.code === code);
    if (!planItem) {
      const err: any = new Error('Plano comercial não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const previousPriceCents = Number(planItem.defaultPriceCents);
    const nowIso = new Date().toISOString();

    planItem.defaultPriceCents = priceCents;
    planItem.updatedBy = params.actorId;
    planItem.updatedAt = nowIso;
    if (!Array.isArray(planItem.priceHistory)) planItem.priceHistory = [];
    planItem.priceHistory.unshift({
      timestamp: nowIso,
      actor: params.actorId,
      previousPriceCents,
      newPriceCents: priceCents,
      reason: params.reason || 'Atualização do preço padrão para novas assinaturas',
    });

    await db.recordAuditLog('biz-1', params.actorId, 'SAAS_PLAN_DEFAULT_PRICE_UPDATED', {
      planCode: code,
      previousPriceCents,
      newPriceCents: priceCents,
      reason: params.reason || 'Atualização do preço padrão para novas assinaturas',
    });

    return {
      ...planItem,
      formattedDefaultPrice: (priceCents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    };
  },

  async changeTenantPlan(params: {
    tenantId: string;
    newPlan: CommercialPlanType;
    customContractedPriceCents?: number;
    usePlanDefaultPrice?: boolean;
    actorId: string;
    reason: string;
  }) {
    await this.syncTenantsFromMySql();
    const store = memoryStore as any;
    const tenant = store.tenants.find((t: any) => t.id === params.tenantId);
    if (!tenant) {
      const err: any = new Error('Estabelecimento não encontrado.');
      err.statusCode = 404;
      throw err;
    }
    if (!params.reason || params.reason.trim().length < 3) {
      const err: any = new Error('Informe o motivo da alteração de plano (mínimo de 3 caracteres).');
      err.statusCode = 400;
      throw err;
    }

    const targetPlan = normalizePlanCode(params.newPlan);
    const planMeta = this.getPlanMetadata(targetPlan);
    const currentSub = this.getTenantSubscription(params.tenantId);
    const rawSub = store.subscriptions.find((s: any) => s.tenantId === params.tenantId);

    const previousPlan = currentSub.plan;
    const previousPriceCents = currentSub.contractedPriceCents;

    let nextPriceCents = previousPriceCents;
    if (params.customContractedPriceCents !== undefined && params.customContractedPriceCents !== null) {
      const parsed = Math.round(Number(params.customContractedPriceCents));
      if (!Number.isInteger(parsed) || parsed < 0) {
        const err: any = new Error('Valor contratado inválido.');
        err.statusCode = 400;
        throw err;
      }
      nextPriceCents = parsed;
    } else if (params.usePlanDefaultPrice !== false && previousPlan !== targetPlan) {
      nextPriceCents = planMeta.defaultPriceCents;
    }

    const nowIso = new Date().toISOString();
    rawSub.plan = targetPlan;
    rawSub.contractedPriceCents = nextPriceCents;
    rawSub.updatedBy = params.actorId;
    rawSub.updatedAt = nowIso;
    if (!Array.isArray(rawSub.history)) rawSub.history = [];
    rawSub.history.unshift({
      timestamp: nowIso,
      actor: params.actorId,
      action: 'PLAN_CHANGED',
      previousPlan,
      newPlan: targetPlan,
      previousPriceCents,
      newPriceCents: nextPriceCents,
      reason: params.reason.trim(),
    });

    // If downgraded to SIMPLE, disable requireDeposit on tenant for future bookings without touching historical appointments
    if (targetPlan === 'SIMPLE' && tenant.requireDeposit) {
      tenant.requireDeposit = false;
    }

    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `UPDATE Subscription SET plan = ?, contractedPriceCents = ?, updatedBy = ?, history = ?, updatedAt = NOW() WHERE tenantId = ?`,
          [targetPlan, nextPriceCents, params.actorId, JSON.stringify(rawSub.history), params.tenantId]
        );
        if (targetPlan === 'SIMPLE') {
          await pool.execute(`UPDATE Tenant SET requireDeposit = 0, updatedAt = NOW() WHERE id = ?`, [params.tenantId]);
        }
      } catch (e) {
        handleDbFallbackError('changeTenantPlan', e);
      }
    }

    await db.recordAuditLog(params.tenantId, params.actorId, 'SAAS_TENANT_PLAN_CHANGED', {
      tenantId: params.tenantId,
      tenantName: tenant.name,
      previousPlan,
      newPlan: targetPlan,
      previousPriceCents,
      newPriceCents: nextPriceCents,
      reason: params.reason.trim(),
    });

    return this.getTenantSubscription(params.tenantId);
  },

  async updateTenantContractedPrice(params: {
    tenantId: string;
    contractedPriceCents: number;
    actorId: string;
    reason: string;
  }) {
    await this.syncTenantsFromMySql();
    const store = memoryStore as any;
    const tenant = store.tenants.find((t: any) => t.id === params.tenantId);
    if (!tenant) {
      const err: any = new Error('Estabelecimento não encontrado.');
      err.statusCode = 404;
      throw err;
    }
    if (!params.reason || params.reason.trim().length < 3) {
      const err: any = new Error('Informe o motivo da alteração do valor contratado (mínimo de 3 caracteres).');
      err.statusCode = 400;
      throw err;
    }

    const priceCents = Math.round(Number(params.contractedPriceCents));
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      const err: any = new Error('O valor contratado deve ser um número inteiro em centavos não-negativo.');
      err.statusCode = 400;
      throw err;
    }

    const currentSub = this.getTenantSubscription(params.tenantId);
    const rawSub = store.subscriptions.find((s: any) => s.tenantId === params.tenantId);
    const previousPriceCents = currentSub.contractedPriceCents;
    const nowIso = new Date().toISOString();

    rawSub.contractedPriceCents = priceCents;
    rawSub.priceOverrideReason = params.reason.trim();
    rawSub.updatedBy = params.actorId;
    rawSub.updatedAt = nowIso;
    if (!Array.isArray(rawSub.history)) rawSub.history = [];
    rawSub.history.unshift({
      timestamp: nowIso,
      actor: params.actorId,
      action: 'CONTRACTED_PRICE_UPDATED',
      previousPriceCents,
      newPriceCents: priceCents,
      reason: params.reason.trim(),
    });

    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `UPDATE Subscription SET contractedPriceCents = ?, updatedBy = ?, history = ?, updatedAt = NOW() WHERE tenantId = ?`,
          [priceCents, params.actorId, JSON.stringify(rawSub.history), params.tenantId]
        );
      } catch (e) {
        handleDbFallbackError('updateTenantContractedPrice', e);
      }
    }

    await db.recordAuditLog(params.tenantId, params.actorId, 'SAAS_CONTRACTED_PRICE_UPDATED', {
      tenantId: params.tenantId,
      tenantName: tenant.name,
      previousPriceCents,
      newPriceCents: priceCents,
      reason: params.reason.trim(),
    });

    return this.getTenantSubscription(params.tenantId);
  },

  async updateTenantSubscriptionAndAccessStatus(params: {
    tenantId: string;
    subscriptionStatus?: SubscriptionLifecycleStatus;
    operationalStatus?: TenantOperationalStatus;
    nextBillingAt?: string | null;
    actorId: string;
    reason: string;
  }) {
    await this.syncTenantsFromMySql();
    const store = memoryStore as any;
    const tenant = store.tenants.find((t: any) => t.id === params.tenantId);
    if (!tenant) {
      const err: any = new Error('Estabelecimento não encontrado.');
      err.statusCode = 404;
      throw err;
    }
    if (!params.reason || params.reason.trim().length < 3) {
      const err: any = new Error('Informe o motivo da alteração de status (mínimo de 3 caracteres).');
      err.statusCode = 400;
      throw err;
    }

    const currentSub = this.getTenantSubscription(params.tenantId);
    const rawSub = store.subscriptions.find((s: any) => s.tenantId === params.tenantId);
    const previousSubStatus = currentSub.status;
    const previousOpStatus = normalizeOperationalStatus(tenant.status);

    const nextSubStatus = params.subscriptionStatus
      ? normalizeSubscriptionStatus(params.subscriptionStatus)
      : previousSubStatus;

    let nextOpStatus: TenantOperationalStatus = previousOpStatus;
    if (params.operationalStatus) {
      nextOpStatus = normalizeOperationalStatus(params.operationalStatus);
    } else if (nextSubStatus === 'BLOCKED' || nextSubStatus === 'SUSPENDED') {
      nextOpStatus = 'BLOCKED';
    } else if (nextSubStatus === 'CANCELLED') {
      nextOpStatus = 'CANCELLED';
    } else if (nextSubStatus === 'ACTIVE') {
      nextOpStatus = 'ACTIVE';
    }

    const nowIso = new Date().toISOString();
    rawSub.status = nextSubStatus;
    rawSub.statusReason = params.reason.trim();
    rawSub.updatedBy = params.actorId;
    rawSub.updatedAt = nowIso;
    if (params.nextBillingAt !== undefined) {
      rawSub.nextBillingAt = params.nextBillingAt;
      rawSub.expiresAt = params.nextBillingAt;
    }
    if (nextSubStatus === 'CANCELLED' || nextOpStatus === 'CANCELLED') {
      rawSub.cancelledAt = nowIso;
      tenant.cancelledAt = nowIso;
      tenant.cancelledReason = params.reason.trim();
    }

    tenant.status = nextOpStatus;
    if (nextOpStatus === 'BLOCKED') {
      tenant.blockedReason = params.reason.trim();
      tenant.blockedAt = nowIso;
      tenant.blockedBy = params.actorId;
    } else if (nextOpStatus === 'ACTIVE') {
      tenant.blockedReason = null;
      tenant.blockedAt = null;
      tenant.blockedBy = null;
    }

    if (!Array.isArray(rawSub.history)) rawSub.history = [];
    rawSub.history.unshift({
      timestamp: nowIso,
      actor: params.actorId,
      action: `STATUS_${nextOpStatus}_${nextSubStatus}`,
      previousStatus: `${previousOpStatus}/${previousSubStatus}`,
      newStatus: `${nextOpStatus}/${nextSubStatus}`,
      reason: params.reason.trim(),
    });

    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `UPDATE Tenant SET status = ?, blockedReason = ?, blockedAt = ?, blockedBy = ?, cancelledAt = ?, cancelledReason = ?, updatedAt = NOW() WHERE id = ?`,
          [
            nextOpStatus,
            tenant.blockedReason || null,
            tenant.blockedAt ? new Date(tenant.blockedAt) : null,
            tenant.blockedBy || null,
            tenant.cancelledAt ? new Date(tenant.cancelledAt) : null,
            tenant.cancelledReason || null,
            params.tenantId,
          ]
        );
        await pool.execute(
          `UPDATE Subscription SET status = ?, statusReason = ?, nextBillingAt = ?, expiresAt = ?, cancelledAt = ?, updatedBy = ?, history = ?, updatedAt = NOW() WHERE tenantId = ?`,
          [
            nextSubStatus,
            rawSub.statusReason,
            rawSub.nextBillingAt ? new Date(rawSub.nextBillingAt) : null,
            rawSub.expiresAt ? new Date(rawSub.expiresAt) : null,
            rawSub.cancelledAt ? new Date(rawSub.cancelledAt) : null,
            params.actorId,
            JSON.stringify(rawSub.history),
            params.tenantId,
          ]
        );
      } catch (e) {
        handleDbFallbackError('updateTenantSubscriptionAndAccessStatus', e);
      }
    }

    await db.recordAuditLog(params.tenantId, params.actorId, 'SAAS_TENANT_STATUS_UPDATED', {
      tenantId: params.tenantId,
      tenantName: tenant.name,
      previousOperationalStatus: previousOpStatus,
      newOperationalStatus: nextOpStatus,
      previousSubscriptionStatus: previousSubStatus,
      newSubscriptionStatus: nextSubStatus,
      reason: params.reason.trim(),
    });

    return {
      tenant,
      subscription: this.getTenantSubscription(params.tenantId),
      capabilities: this.getTenantCapabilities(params.tenantId),
    };
  },

  async toggleTenantAdvancedFeatures(params: {
    tenantId: string;
    enabled: boolean;
    actorId: string;
    reason?: string;
  }) {
    await this.syncTenantsFromMySql();
    const store = memoryStore as any;
    const tenant = store.tenants.find((t: any) => t.id === params.tenantId);
    if (!tenant) {
      const err: any = new Error('Estabelecimento não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const previousState = Boolean(tenant.enableAdvancedFeatures);
    const nextState = Boolean(params.enabled);
    tenant.enableAdvancedFeatures = nextState;

    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `UPDATE Tenant SET enableAdvancedFeatures = ?, updatedAt = NOW() WHERE id = ?`,
          [nextState ? 1 : 0, params.tenantId]
        );
      } catch (e) {
        handleDbFallbackError('toggleTenantAdvancedFeatures', e);
      }
    }

    await db.recordAuditLog(params.tenantId, params.actorId, 'SAAS_ADVANCED_FEATURES_TOGGLED', {
      tenantId: params.tenantId,
      tenantName: tenant.name,
      previousState,
      newState: nextState,
      reason: params.reason || (nextState ? 'Ativação pelo Super Admin' : 'Desativação pelo Super Admin'),
    });

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      enableAdvancedFeatures: nextState,
      capabilities: this.getTenantCapabilities(params.tenantId),
    };
  },

  async createSaaSInvoice(params: {
    tenantId: string;
    amountCents?: number;
    dueDate: string;
    status?: 'PENDING' | 'PAID' | 'OVERDUE';
    paymentMethod?: string;
    notes?: string;
    actorId: string;
  }) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    const tenant = store.tenants.find((t: any) => t.id === params.tenantId);
    if (!tenant) {
      const err: any = new Error('Estabelecimento não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const sub = this.getTenantSubscription(params.tenantId);
    const amountCents =
      params.amountCents !== undefined
        ? Math.round(Number(params.amountCents))
        : sub.contractedPriceCents;

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      const err: any = new Error('Valor da cobrança SaaS deve ser maior que zero.');
      err.statusCode = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const status = params.status || 'PENDING';
    const inv = {
      id: `saas-inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId: params.tenantId,
      subscriptionId: sub.id,
      plan: sub.plan,
      amountCents,
      dueDate: new Date(params.dueDate).toISOString(),
      paidAt: status === 'PAID' ? nowIso : null,
      status,
      paymentMethod: params.paymentMethod || 'PIX',
      externalReference: `SAAS-INV-${params.tenantId}-${Date.now()}`,
      notes: params.notes || `Mensalidade ${sub.planName}`,
      createdBy: params.actorId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.saasInvoices.unshift(inv);

    if (status === 'OVERDUE') {
      const rawSub = store.subscriptions.find((s: any) => s.tenantId === params.tenantId);
      if (rawSub && rawSub.status === 'ACTIVE') {
        rawSub.status = 'PAST_DUE';
        rawSub.statusReason = 'Fatura SaaS vencida pendente de regularização';
      }
    }

    await db.recordAuditLog(params.tenantId, params.actorId, 'SAAS_INVOICE_CREATED', {
      invoiceId: inv.id,
      tenantId: params.tenantId,
      amountCents,
      status,
      dueDate: inv.dueDate,
    });

    return inv;
  },

  async markSaaSInvoiceStatus(params: {
    invoiceId: string;
    status: 'PAID' | 'OVERDUE' | 'CANCELLED';
    actorId: string;
    notes?: string;
  }) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    const inv = store.saasInvoices.find((i: any) => i.id === params.invoiceId);
    if (!inv) {
      const err: any = new Error('Cobrança de assinatura não encontrada.');
      err.statusCode = 404;
      throw err;
    }

    const previousStatus = inv.status;
    const nowIso = new Date().toISOString();
    inv.status = params.status;
    inv.updatedAt = nowIso;
    if (params.status === 'PAID') {
      inv.paidAt = nowIso;
      const rawSub = store.subscriptions.find((s: any) => s.tenantId === inv.tenantId);
      if (rawSub && ['PENDING_PAYMENT', 'PAST_DUE'].includes(rawSub.status)) {
        rawSub.status = 'ACTIVE';
        rawSub.statusReason = 'Pagamento de mensalidade confirmado';
        rawSub.nextBillingAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        rawSub.expiresAt = rawSub.nextBillingAt;
      }
    } else if (params.status === 'OVERDUE') {
      const rawSub = store.subscriptions.find((s: any) => s.tenantId === inv.tenantId);
      if (rawSub && rawSub.status === 'ACTIVE') {
        rawSub.status = 'PAST_DUE';
        rawSub.statusReason = params.notes || 'Fatura marcada como em atraso';
      }
    }
    if (params.notes) inv.notes = params.notes;

    await db.recordAuditLog(inv.tenantId, params.actorId, 'SAAS_INVOICE_STATUS_UPDATED', {
      invoiceId: inv.id,
      previousStatus,
      newStatus: params.status,
      notes: params.notes || '',
    });

    return inv;
  },

  async syncTenantsFromMySql() {
    this.ensureSaaSSeedData();
    const pool = getMySqlPool();
    if (!pool) return;

    const now = Date.now();
    if (now - lastFullSyncTimestamp < 30000 && lastFullSyncTimestamp >= getLastCacheInvalidationTime()) {
      return;
    }

    if (syncInFlightPromise) {
      return syncInFlightPromise;
    }

    syncInFlightPromise = (async () => {
      const store = memoryStore as any;
      try {
        const [
          [rows],
          [subRows],
          [userRows],
          [clientRows],
          [serviceRows],
          [profRows],
          [appRows],
        ]: any = await Promise.all([
          queryWithRetry(`SELECT * FROM Tenant ORDER BY createdAt ASC`),
          queryWithRetry(`SELECT * FROM Subscription`).catch(() => [null]),
          queryWithRetry(
            `SELECT u.*, tm.tenantId as memberTenantId, tm.role as memberRole
             FROM User u
             LEFT JOIN TenantMember tm ON tm.userId = u.id`
          ).catch(() => [null]),
          queryWithRetry(`SELECT * FROM Client`).catch(() => [null]),
          queryWithRetry(`SELECT * FROM Service`).catch(() => [null]),
          queryWithRetry(`SELECT * FROM Professional`).catch(() => [null]),
          queryWithRetry(`SELECT * FROM Appointment`).catch(() => [null]),
        ]);

        if (Array.isArray(rows) && rows.length > 0) {
          const syncedTenants: any[] = [];
          for (const r of rows) {
            const existing = store.tenants.find((t: any) => t.id === r.id);
            const merged = {
              ...(existing || {}),
              ...r,
              slug: r.slug || existing?.slug || slugifyBusinessName(r.name),
              legacySlugs: Array.from(
                new Set([
                  ...(Array.isArray(existing?.legacySlugs) ? existing.legacySlugs : []),
                  existing?.slug,
                  r.slug,
                  r.id === 'biz-1' ? 'agenda-beauty-sp' : undefined,
                  r.id === 'biz-1' ? 'agenda-beauty' : undefined,
                ].filter(Boolean).map((s) => String(s).toLowerCase()))
              ),
              description: r.description ?? existing?.description ?? '',
              logoUrl: r.logoUrl ?? existing?.logoUrl ?? '',
              status: r.status ?? existing?.status ?? 'ACTIVE',
              isPublished: r.isPublished !== undefined ? Boolean(r.isPublished) : (existing?.isPublished !== false),
              requireDeposit: r.requireDeposit !== undefined ? Boolean(r.requireDeposit) : (existing?.requireDeposit ?? true),
              defaultDeposit: Number(r.defaultDeposit ?? existing?.defaultDeposit ?? 30),
              cancellationHoursLimit: Number(r.cancellationHoursLimit ?? existing?.cancellationHoursLimit ?? 6),
              allowCustomerReschedule:
                r.allowCustomerReschedule !== undefined
                  ? Boolean(r.allowCustomerReschedule)
                  : (existing?.allowCustomerReschedule ?? true),
              allowManualReviewOutOfPeriod:
                r.allowManualReviewOutOfPeriod !== undefined
                  ? Boolean(r.allowManualReviewOutOfPeriod)
                  : (existing?.allowManualReviewOutOfPeriod ?? true),
              cancellationPolicyText:
                r.cancellationPolicyText ?? existing?.cancellationPolicyText ?? DEFAULT_CANCELLATION_POLICY_TEXT,
              cancellationContactInstructions:
                r.cancellationContactInstructions ??
                existing?.cancellationContactInstructions ??
                DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
              cancellationPolicyVersion: Number(r.cancellationPolicyVersion ?? existing?.cancellationPolicyVersion ?? 1),
              enableAdvancedFeatures:
                r.enableAdvancedFeatures !== undefined
                  ? Boolean(r.enableAdvancedFeatures)
                  : Boolean(existing?.enableAdvancedFeatures),
            };
            syncedTenants.push(merged);
          }
          store.tenants = syncedTenants;
          for (const t of store.tenants) {
            this.getTenantSubscription(t.id);
          }
        }

        if (Array.isArray(subRows) && subRows.length > 0) {
          for (const sr of subRows) {
            const existingSub = store.subscriptions.find((s: any) => s.tenantId === sr.tenantId);
            const parsedHistory =
              typeof sr.history === 'string'
                ? (() => {
                    try {
                      return JSON.parse(sr.history);
                    } catch {
                      return [];
                    }
                  })()
                : Array.isArray(sr.history)
                ? sr.history
                : [];
            if (existingSub) {
              Object.assign(existingSub, {
                ...sr,
                plan: normalizePlanCode(sr.plan),
                status: normalizeSubscriptionStatus(sr.status),
                contractedPriceCents: Number(sr.contractedPriceCents ?? existingSub.contractedPriceCents ?? 9990),
                history: parsedHistory,
              });
            }
          }
        }

        if (Array.isArray(clientRows) && clientRows.length > 0) {
          store.clients = clientRows.map((c: any) => {
            const userIdMatch = typeof c.notes === 'string' ? c.notes.match(/userId:([^\s]+)/) : null;
            return {
              ...c,
              userId: c.userId || (userIdMatch ? userIdMatch[1] : undefined),
            };
          });
        }

        if (Array.isArray(userRows) && userRows.length > 0) {
          const masterUsers = store.users.filter(
            (u: any) =>
              u.isMasterAdmin ||
              u.role === 'SUPER_ADMIN' ||
              String(u.email || '').toLowerCase() === 'prwashingtondiasbh@gmail.com'
          );

          const dedupedUsersMap = new Map<string, any>();
          for (const u of userRows) {
            if (!u || !u.id) continue;
            if (
              u.id === 'user-master-1' &&
              String(u.email || '').toLowerCase() === 'master@agendabeauty.com.br'
            ) {
              u.email = 'prwashingtondiasbh@gmail.com';
              pool
                .execute(
                  `UPDATE User SET email = 'prwashingtondiasbh@gmail.com', updatedAt = NOW() WHERE id = 'user-master-1'`
                )
                .catch(() => {});
            }
            const existingMem = store.users.find(
              (mu: any) =>
                mu.id === u.id ||
                String(mu.email || '').toLowerCase() === String(u.email || '').toLowerCase()
            );
            const emailLower = String(u.email || '').toLowerCase();
            const isMaster = Boolean(
              u.isMasterAdmin ||
                u.role === 'SUPER_ADMIN' ||
                u.memberRole === 'SUPER_ADMIN' ||
                existingMem?.isMasterAdmin ||
                emailLower === 'prwashingtondiasbh@gmail.com'
            );
            const isInClients = (store.clients || []).some(
              (c: any) =>
                c.userId === u.id ||
                (emailLower && String(c.email || '').toLowerCase() === emailLower) ||
                String(c.notes || '').includes(`userId:${u.id}`)
            );

            let resolvedRole = u.memberRole || u.role || existingMem?.role;
            if (isMaster) {
              resolvedRole = 'SUPER_ADMIN';
            } else if (!resolvedRole) {
              if (String(u.id).startsWith('user-cust-') || isInClients) {
                resolvedRole = 'CUSTOMER';
              } else {
                resolvedRole = 'OWNER';
              }
            }

            const resolvedTenantId =
              u.memberTenantId || u.tenantId || existingMem?.tenantId || 'biz-1';

            if (u.memberTenantId && u.memberRole) {
              const hasTm = store.tenantMembers.some(
                (tm: any) => tm.userId === u.id && tm.tenantId === u.memberTenantId
              );
              if (!hasTm) {
                store.tenantMembers.push({
                  id: `tm-${u.id}-${u.memberTenantId}`,
                  tenantId: u.memberTenantId,
                  userId: u.id,
                  role: u.memberRole,
                });
              }
            }

            if (!dedupedUsersMap.has(u.id)) {
              const { memberTenantId, memberRole, ...cleanUser } = u;
              dedupedUsersMap.set(u.id, {
                ...(existingMem || {}),
                ...cleanUser,
                tenantId: resolvedTenantId,
                role: resolvedRole,
                active: u.active !== undefined ? Boolean(u.active) : true,
                isMasterAdmin: isMaster,
              });
            }
          }

          const dbUsers = Array.from(dedupedUsersMap.values());
          for (const mu of masterUsers) {
            if (
              !dbUsers.some(
                (du: any) =>
                  String(du.email || '').toLowerCase() === String(mu.email || '').toLowerCase()
              )
            ) {
              dbUsers.push(mu);
            }
          }
          store.users = dbUsers;
        }

        if (Array.isArray(serviceRows) && serviceRows.length > 0) {
          store.services = serviceRows.map((s: any) => ({
            ...s,
            active: s.active !== undefined ? Boolean(s.active) : true,
          }));
        }
        if (Array.isArray(profRows) && profRows.length > 0) {
          store.professionals = profRows.map((p: any) => ({
            ...p,
            active: p.active !== undefined ? Boolean(p.active) : true,
          }));
        }
        if (Array.isArray(appRows) && appRows.length > 0) {
          store.appointments = appRows;
        }

        lastFullSyncTimestamp = Date.now();
      } catch (e) {
        handleDbFallbackError('syncTenantsFromMySql', e);
      } finally {
        syncInFlightPromise = null;
      }
    })();

    return syncInFlightPromise;
  },

  async getPublicPartnerDirectory(filters?: { search?: string; category?: string }) {
    await this.syncTenantsFromMySql();
    const store = memoryStore as any;
    const search = String(filters?.search || '').trim().toLowerCase();
    const category = String(filters?.category || '').trim().toLowerCase();

    const activeTenants = store.tenants.filter((t: any) => {
      const caps = this.getTenantCapabilities(t.id);
      if (!caps.canAcceptOnlineBookings) return false;
      if (t.isPublished === false) return false;
      return true;
    });

    const items = [];
    for (const t of activeTenants) {
      const services = await db.getServices(t.id, { onlyActive: true });
      const professionals = await db.getProfessionals(t.id, { onlyActive: true });
      const caps = this.getTenantCapabilities(t.id);

      if (search) {
        const matchName = String(t.name || '').toLowerCase().includes(search);
        const matchAddress = String(t.address || '').toLowerCase().includes(search);
        const matchDesc = String(t.description || '').toLowerCase().includes(search);
        const matchService = services.some(
          (s: any) =>
            String(s.name || '').toLowerCase().includes(search) ||
            String(s.category || '').toLowerCase().includes(search)
        );
        if (!matchName && !matchAddress && !matchDesc && !matchService) {
          continue;
        }
      }

      if (category && category !== 'all') {
        const hasCat = services.some((s: any) =>
          String(s.category || '').toLowerCase().includes(category)
        );
        if (!hasCat) continue;
      }

      const effectiveRequireDeposit = caps.allowDeposit ? Boolean(t.requireDeposit) : false;

      items.push({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description:
          t.description ||
          'Estabelecimento parceiro oficial Nuvem Agenda com agendamento online rápido e seguro.',
        logoUrl: t.logoUrl || '',
        phone: t.phone || '',
        email: t.email || '',
        address: t.address || 'Endereço sob consulta',
        openTime: t.openTime || '08:00',
        closeTime: t.closeTime || '20:00',
        timezone: t.timezone || 'America/Sao_Paulo',
        requireDeposit: effectiveRequireDeposit,
        defaultDeposit: effectiveRequireDeposit ? Number(t.defaultDeposit ?? 30) : 0,
        plan: caps.plan,
        publicBookingPath: `/agendar/${t.slug}`,
        servicesCount: services.length,
        professionalsCount: professionals.length,
        featuredServices: services.slice(0, 4).map((s: any) => ({
          id: s.id,
          name: s.name,
          category: s.category || 'Beleza',
          priceCents: Number(s.priceCents || 0),
          durationMin: Number(s.durationMin || 60),
        })),
      });
    }

    return items;
  },

  async resolvePublicEstablishmentBySlugOrId(slugOrId: string) {
    await this.syncTenantsFromMySql();
    const store = memoryStore as any;
    const clean = String(slugOrId || '').trim().toLowerCase();
    if (!clean) return null;

    let tenant = store.tenants.find((t: any) => {
      if (String(t.slug || '').toLowerCase() === clean) return true;
      if (String(t.id || '').toLowerCase() === clean) return true;
      if (Array.isArray(t.legacySlugs) && t.legacySlugs.some((ls: any) => String(ls).toLowerCase() === clean)) {
        return true;
      }
      if (slugifyBusinessName(t.name) === clean) return true;
      return false;
    });

    // Fallback aliases for default main establishment biz-1
    if (
      !tenant &&
      ['agenda-beauty', 'agenda-beauty-sp', 'seu-salao', 'agenda-beauty-studio', 'agenda-beauty-studio-sao-paulo'].includes(
        clean
      )
    ) {
      tenant = store.tenants.find((t: any) => t.id === 'biz-1');
    }

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.AGENDA_TEST_MODE === '1';
    if (!tenant && !isTestMode && store.tenants.length === 1) {
      tenant = store.tenants[0];
    }

    if (!tenant) {
      return null;
    }

    const caps = this.getTenantCapabilities(tenant.id);
    if (!caps.canAcceptOnlineBookings) {
      const blockedBiz = {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl || '',
        description: tenant.description || '',
        phone: tenant.phone || '',
        address: tenant.address || '',
      };
      return {
        bookingAvailable: false,
        reason: 'Este estabelecimento não está recebendo novos agendamentos online no momento.',
        unavailableReason: 'Este estabelecimento não está recebendo novos agendamentos online no momento.',
        establishment: blockedBiz,
        business: blockedBiz,
        services: [],
        professionals: [],
      };
    }

    const [services, professionals] = await Promise.all([
      db.getServices(tenant.id, { onlyActive: true }),
      db.getProfessionals(tenant.id, { onlyActive: true }),
    ]);

    const effectiveRequireDeposit = caps.allowDeposit ? Boolean(tenant.requireDeposit) : false;

    const activeBiz = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      description:
        tenant.description ||
        'Agende seu horário online com rapidez, confirmação automática e transparência.',
      logoUrl: tenant.logoUrl || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      address: tenant.address || '',
      timezone: tenant.timezone || 'America/Sao_Paulo',
      currency: tenant.currency || 'BRL',
      openTime: tenant.openTime || '08:00',
      closeTime: tenant.closeTime || '20:00',
      requireDeposit: effectiveRequireDeposit,
      defaultDeposit: effectiveRequireDeposit ? Number(tenant.defaultDeposit ?? 30) : 0,
      cancellationHoursLimit: Number(tenant.cancellationHoursLimit ?? 6),
      allowCustomerReschedule: tenant.allowCustomerReschedule ?? true,
      allowManualReviewOutOfPeriod: tenant.allowManualReviewOutOfPeriod ?? true,
      cancellationPolicyText:
        tenant.cancellationPolicyText || DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions:
        tenant.cancellationContactInstructions || DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      enableAdvancedFeatures: Boolean(tenant.enableAdvancedFeatures),
      plan: caps.plan,
    };

    return {
      bookingAvailable: true,
      establishment: activeBiz,
      business: activeBiz,
      services: services.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        category: s.category || 'Geral',
        priceCents: Number(s.priceCents || 0),
        durationMin: Number(s.durationMin || 60),
        depositPercent: effectiveRequireDeposit
          ? Number(s.depositPercent ?? tenant.defaultDeposit ?? 30)
          : 0,
        active: Boolean(s.active),
        professionals: s.professionals || [],
      })),
      professionals: professionals.map((p: any) => ({
        id: p.id,
        name: p.name,
        specialty: p.specialty || 'Especialista',
        avatarUrl: p.avatarUrl || '',
        active: Boolean(p.active),
        workingHours: p.workingHours || [],
      })),
    };
  },

  getUserMemberships(userId: string) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    const user = store.users.find((u: any) => u.id === userId);
    if (
      user &&
      (user.isMasterAdmin ||
        user.role === 'SUPER_ADMIN' ||
        String(user.email || '').toLowerCase() === 'prwashingtondiasbh@gmail.com')
    ) {
      return [];
    }
    const memberships = store.tenantMembers.filter((tm: any) => tm.userId === userId);
    if (
      user &&
      user.tenantId &&
      user.role &&
      user.role !== 'CUSTOMER' &&
      user.role !== 'SUPER_ADMIN' &&
      !memberships.some((m: any) => m.tenantId === user.tenantId)
    ) {
      memberships.push({
        id: `tm-${user.id}-${user.tenantId}`,
        tenantId: user.tenantId,
        userId: user.id,
        role: user.role,
        professionalId: user.professionalId,
      });
    }

    return memberships
      .map((m: any) => {
        const t = store.tenants.find((tn: any) => tn.id === m.tenantId);
        if (!t) return null;
        const sub = this.getTenantSubscription(t.id);
        return {
          tenantId: t.id,
          tenantName: t.name,
          slug: t.slug,
          role: m.role,
          professionalId: m.professionalId || undefined,
          status: normalizeOperationalStatus(t.status),
          plan: sub.plan,
          planName: sub.planName,
        };
      })
      .filter(Boolean);
  },

  async createAdditionalEstablishmentForOwner(params: {
    ownerUserId: string;
    businessName: string;
    phone?: string;
    email?: string;
    address?: string;
    description?: string;
    plan?: CommercialPlanType;
  }) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    const user = store.users.find((u: any) => u.id === params.ownerUserId);
    if (!user) {
      const err: any = new Error('Usuário proprietário não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const tenantId = `biz-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let slug = slugifyBusinessName(params.businessName);
    if (store.tenants.some((t: any) => t.slug === slug)) {
      slug = slugifyBusinessName(
        params.businessName,
        Math.random().toString(36).substring(2, 6)
      );
    }

    const chosenPlan = normalizePlanCode(params.plan || 'COMPLETE');
    const planMeta = this.getPlanMetadata(chosenPlan);
    const nowIso = new Date().toISOString();
    const nextBillingIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const newTenant = {
      id: tenantId,
      name: params.businessName.trim(),
      slug,
      description:
        params.description?.trim() ||
        `Bem-vinda ao ${params.businessName.trim()}. Agende seu horário online!`,
      logoUrl: '',
      phone: params.phone?.trim() || user.phone || '',
      email: params.email?.trim() || user.email || '',
      address: params.address?.trim() || '',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      openTime: '08:00',
      closeTime: '20:00',
      status: 'ACTIVE' as TenantOperationalStatus,
      isPublished: true,
      requireDeposit: chosenPlan === 'COMPLETE',
      defaultDeposit: chosenPlan === 'COMPLETE' ? 30 : 0,
      cancellationHoursLimit: 6,
      allowCustomerReschedule: true,
      allowManualReviewOutOfPeriod: true,
      cancellationPolicyText: DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions: DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      cancellationPolicyVersion: 1,
      createdAt: nowIso,
    };

    store.tenants.push(newTenant);
    store.tenantMembers.push({
      id: `tm-${user.id}-${tenantId}`,
      tenantId,
      userId: user.id,
      role: 'OWNER',
      createdAt: nowIso,
    });
    store.subscriptions.push({
      id: `sub-${tenantId}`,
      tenantId,
      plan: chosenPlan,
      status: 'ACTIVE' as SubscriptionLifecycleStatus,
      contractedPriceCents: planMeta.defaultPriceCents,
      billingCycle: 'MONTHLY',
      startedAt: nowIso,
      expiresAt: nextBillingIso,
      nextBillingAt: nextBillingIso,
      cancelledAt: null,
      statusReason: 'Assinatura criada no cadastro da empresa',
      updatedBy: user.id,
      history: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    await db.recordAuditLog(tenantId, user.id, 'TENANT_ESTABLISHMENT_CREATED', {
      tenantId,
      name: newTenant.name,
      slug: newTenant.slug,
      plan: chosenPlan,
    });

    return {
      tenant: newTenant,
      subscription: this.getTenantSubscription(tenantId),
      memberships: this.getUserMemberships(user.id),
    };
  },

  getMasterAdminDashboard(periodDays = 30) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    const now = Date.now();
    const periodStartMs = now - periodDays * 24 * 3600 * 1000;

    const tenants = store.tenants;
    const subscriptions = tenants.map((t: any) => ({
      tenant: t,
      sub: this.getTenantSubscription(t.id),
      caps: this.getTenantCapabilities(t.id),
    }));

    const totalBusinesses = tenants.length;
    const activeBusinesses = subscriptions.filter(
      (x: any) => x.caps.operationalStatus === 'ACTIVE'
    ).length;
    const blockedBusinesses = subscriptions.filter(
      (x: any) => x.caps.operationalStatus === 'BLOCKED'
    ).length;
    const cancelledBusinesses = subscriptions.filter(
      (x: any) => x.caps.operationalStatus === 'CANCELLED'
    ).length;

    const simplePlanCount = subscriptions.filter(
      (x: any) => x.sub.plan === 'SIMPLE' && x.sub.status !== 'CANCELLED'
    ).length;
    const completePlanCount = subscriptions.filter(
      (x: any) => x.sub.plan === 'COMPLETE' && x.sub.status !== 'CANCELLED'
    ).length;

    const pastDueSubscriptionsCount = subscriptions.filter(
      (x: any) => x.sub.status === 'PAST_DUE' || x.sub.status === 'PENDING_PAYMENT'
    ).length;

    // Expected Monthly Recurring Revenue (MRR) from active/non-cancelled subscriptions
    const expectedMrrCents = subscriptions
      .filter((x: any) => ['ACTIVE', 'PAST_DUE', 'PENDING_PAYMENT'].includes(x.sub.status))
      .reduce((acc: number, x: any) => acc + Number(x.sub.contractedPriceCents || 0), 0);

    // SaaS Invoices (strictly separated from end-customer appointment Pix deposits!)
    const saasInvoices = store.saasInvoices || [];
    const receivedSaaSRevenueCents = saasInvoices
      .filter((inv: any) => inv.status === 'PAID')
      .reduce((acc: number, inv: any) => acc + Number(inv.amountCents || 0), 0);

    const pendingSaaSRevenueCents = saasInvoices
      .filter((inv: any) => inv.status === 'PENDING' || inv.status === 'OVERDUE')
      .reduce((acc: number, inv: any) => acc + Number(inv.amountCents || 0), 0);

    const overdueSaaSInvoicesCount = saasInvoices.filter(
      (inv: any) => inv.status === 'OVERDUE'
    ).length;

    const newBusinessesInPeriod = tenants.filter((t: any) => {
      if (!t.createdAt) return true;
      return new Date(t.createdAt).getTime() >= periodStartMs;
    }).length;

    const formattedExpectedMrr = (expectedMrrCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    const formattedReceivedSaaSRevenue = (receivedSaaSRevenueCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    const formattedPendingSaaSRevenue = (pendingSaaSRevenueCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    return {
      totalBusinesses,
      activeBusinesses,
      blockedBusinesses,
      cancelledBusinesses,
      totals: {
        totalBusinesses,
        activeBusinesses,
        blockedBusinesses,
        cancelledBusinesses,
        newBusinessesInPeriod,
        totalGlobalUsers: store.users.length,
      },
      subscriptionsByPlan: {
        SIMPLE: simplePlanCount,
        COMPLETE: completePlanCount,
      },
      pastDueSubscriptionsCount,
      overdueSaaSInvoicesCount,
      delinquency: {
        overdueSubscriptionsCount: pastDueSubscriptionsCount,
        overdueSaaSInvoicesCount,
        blockedBusinessesCount: blockedBusinesses,
      },
      expectedMrrCents,
      formattedExpectedMrr,
      receivedSaaSRevenueCents,
      formattedReceivedSaaSRevenue,
      pendingSaaSRevenueCents,
      formattedPendingSaaSRevenue,
      revenue: {
        expectedMrrCents,
        formattedExpectedMrr,
        receivedSaasCents: receivedSaaSRevenueCents,
        formattedReceivedSaas: formattedReceivedSaaSRevenue,
        pendingSaasCents: pendingSaaSRevenueCents,
        formattedPendingSaas: formattedPendingSaaSRevenue,
      },
      newBusinessesInPeriod,
      periodDays,
      totalGlobalUsers: store.users.length,
    };
  },

  listMasterAdminTenants(filters?: {
    search?: string;
    plan?: string;
    subscriptionStatus?: string;
    operationalStatus?: string;
  }) {
    this.ensureSaaSSeedData();
    const store = memoryStore as any;
    const search = String(filters?.search || '').trim().toLowerCase();
    const planFilter = String(filters?.plan || 'ALL').toUpperCase();
    const subStatusFilter = String(filters?.subscriptionStatus || 'ALL').toUpperCase();
    const opStatusFilter = String(filters?.operationalStatus || 'ALL').toUpperCase();

    return store.tenants
      .map((t: any) => {
        const sub = this.getTenantSubscription(t.id);
        const caps = this.getTenantCapabilities(t.id);
        const ownerUser =
          store.users.find((u: any) => u.tenantId === t.id && u.role === 'OWNER') ||
          store.users.find((u: any) =>
            store.tenantMembers.some(
              (tm: any) => tm.tenantId === t.id && tm.userId === u.id && tm.role === 'OWNER'
            )
          );
        const linkedUsersCount = store.users.filter(
          (u: any) =>
            !u.isMasterAdmin &&
            u.role !== 'SUPER_ADMIN' &&
            String(u.email || '').toLowerCase() !== 'prwashingtondiasbh@gmail.com' &&
            (u.tenantId === t.id ||
              store.tenantMembers.some((tm: any) => tm.tenantId === t.id && tm.userId === u.id))
        ).length;
        const appointmentsCount = store.appointments.filter(
          (a: any) => a.tenantId === t.id
        ).length;
        const clientsCount = store.clients.filter((c: any) => c.tenantId === t.id).length;
        const servicesCount = store.services.filter((s: any) => s.tenantId === t.id).length;
        const professionalsCount = store.professionals.filter((p: any) => p.tenantId === t.id).length;
        const invoices = (store.saasInvoices || []).filter((i: any) => i.tenantId === t.id);

        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          description: t.description || '',
          logoUrl: t.logoUrl || '',
          phone: t.phone || '',
          email: t.email || '',
          address: t.address || '',
          requireDeposit: caps.allowDeposit ? Boolean(t.requireDeposit) : false,
          defaultDeposit: Number(t.defaultDeposit ?? 30),
          enableAdvancedFeatures: Boolean(t.enableAdvancedFeatures),
          isPublished: t.isPublished !== false,
          status: caps.operationalStatus,
          operationalStatus: caps.operationalStatus,
          blockedReason: caps.blockedReason,
          blockedAt: t.blockedAt || null,
          cancelledAt: t.cancelledAt || sub.cancelledAt || null,
          createdAt: t.createdAt || new Date().toISOString(),
          owner: ownerUser
            ? { id: ownerUser.id, name: ownerUser.name, email: ownerUser.email }
            : null,
          linkedUsersCount,
          appointmentsCount,
          clientsCount,
          servicesCount,
          professionalsCount,
          metrics: {
            clientsCount,
            servicesCount,
            appointmentsCount,
            professionalsCount,
            linkedUsersCount,
          },
          subscription: sub,
          invoices,
        };
      })
      .filter((item: any) => {
        if (search) {
          const mName = String(item.name || '').toLowerCase().includes(search);
          const mSlug = String(item.slug || '').toLowerCase().includes(search);
          const mEmail = String(item.email || '').toLowerCase().includes(search);
          const mOwner = String(item.owner?.name || '').toLowerCase().includes(search) ||
            String(item.owner?.email || '').toLowerCase().includes(search);
          if (!mName && !mSlug && !mEmail && !mOwner) return false;
        }
        if (planFilter !== 'ALL' && item.subscription.plan !== planFilter) {
          return false;
        }
        if (subStatusFilter !== 'ALL' && item.subscription.status !== subStatusFilter) {
          return false;
        }
        if (opStatusFilter !== 'ALL' && item.operationalStatus !== opStatusFilter) {
          return false;
        }
        return true;
      });
  },

  getMasterAdminTenantDetails(tenantId: string) {
    const all = this.listMasterAdminTenants();
    const found = all.find((t: any) => t.id === tenantId);
    if (!found) return null;

    const store = memoryStore as any;
    const members = store.users
      .filter(
        (u: any) =>
          !u.isMasterAdmin &&
          u.role !== 'SUPER_ADMIN' &&
          String(u.email || '').toLowerCase() !== 'prwashingtondiasbh@gmail.com' &&
          ((u.tenantId === tenantId && u.role !== 'CUSTOMER') ||
            store.tenantMembers.some((tm: any) => tm.tenantId === tenantId && tm.userId === u.id))
      )
      .map((u: any) => {
        const tm = store.tenantMembers.find(
          (m: any) => m.tenantId === tenantId && m.userId === u.id
        );
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: tm?.role || u.role,
          active: u.active !== false,
        };
      });

    const auditHistory = store.auditLogs
      .filter((log: any) => log.tenantId === tenantId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    return {
      ...found,
      tenant: {
        id: found.id,
        name: found.name,
        slug: found.slug,
        status: found.operationalStatus,
        operationalStatus: found.operationalStatus,
        blockedReason: found.blockedReason,
        requireDeposit: found.requireDeposit,
        defaultDeposit: found.defaultDeposit,
        enableAdvancedFeatures: Boolean(found.enableAdvancedFeatures),
        isPublished: found.isPublished,
      },
      members,
      auditHistory,
    };
  },

  async listMasterAdminUsers(filters?: { search?: string; role?: string }) {
    await this.syncTenantsFromMySql();
    const store = memoryStore as any;
    const search = String(filters?.search || '').trim().toLowerCase();
    const roleFilter = String(filters?.role || 'ALL').toUpperCase();

    return store.users
      .map((u: any) => {
        const staffMemberships = this.getUserMemberships(u.id);
        const customerProfiles = store.clients
          .filter((c: any) => c.userId === u.id || c.email === u.email)
          .map((c: any) => {
            const tn = store.tenants.find((t: any) => t.id === c.tenantId);
            return {
              clientId: c.id,
              tenantId: c.tenantId,
              tenantName: tn?.name || c.tenantId,
            };
          });

        const effectiveRole = u.isMasterAdmin || u.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : u.role;

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          role: effectiveRole,
          primaryRole: effectiveRole,
          isMasterAdmin: Boolean(u.isMasterAdmin || u.role === 'SUPER_ADMIN'),
          active: u.active !== false,
          staffMemberships,
          memberships: staffMemberships,
          customerProfiles,
          customerEstablishments: customerProfiles,
        };
      })
      .filter((u: any) => {
        if (search) {
          const mName = String(u.name || '').toLowerCase().includes(search);
          const mEmail = String(u.email || '').toLowerCase().includes(search);
          if (!mName && !mEmail) return false;
        }
        if (roleFilter !== 'ALL' && u.role !== roleFilter) {
          return false;
        }
        return true;
      });
  },

  async deleteTenant(params: { tenantId: string; actorId: string; reason?: string }) {
    this.ensureSaaSSeedData();
    lastFullSyncTimestamp = 0;
    await this.syncTenantsFromMySql();

    const store = memoryStore as any;
    const tenantId = String(params.tenantId || '').trim();
    if (!tenantId) {
      const err: any = new Error('ID do estabelecimento inválido.');
      err.statusCode = 400;
      throw err;
    }

    let tenant = store.tenants.find((t: any) => t.id === tenantId);
    const pool = getMySqlPool();

    if (!tenant && pool) {
      try {
        const [rows]: any = await queryWithRetry(`SELECT * FROM Tenant WHERE id = ? LIMIT 1`, [tenantId]);
        if (Array.isArray(rows) && rows.length > 0) {
          tenant = rows[0];
        }
      } catch (e) {
        handleDbFallbackError('deleteTenantLookup', e);
      }
    }

    if (!tenant) {
      const err: any = new Error('Estabelecimento não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const tenantName = String(tenant.name || tenantId);
    const tenantSlug = String(tenant.slug || '');
    const reason = String(params.reason || '').trim() || 'Exclusão permanente solicitada pelo Super Admin';

    const candidateUserIds = new Set<string>();
    const deletedProfIds = new Set<string>();

    for (const tm of store.tenantMembers || []) {
      if (tm.tenantId === tenantId && tm.userId) {
        candidateUserIds.add(tm.userId);
      }
    }
    for (const u of store.users || []) {
      if (
        u.tenantId === tenantId &&
        !u.isMasterAdmin &&
        u.role !== 'SUPER_ADMIN' &&
        u.role !== 'CUSTOMER' &&
        String(u.email || '').toLowerCase() !== 'prwashingtondiasbh@gmail.com'
      ) {
        candidateUserIds.add(u.id);
      }
    }
    for (const p of store.professionals || []) {
      if (p.tenantId === tenantId && p.id) {
        deletedProfIds.add(p.id);
      }
    }

    const removedOrphanedUsers: string[] = [];

    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();

        const [tmRows]: any = await conn.query(
          `SELECT userId FROM TenantMember WHERE tenantId = ?`,
          [tenantId]
        );
        if (Array.isArray(tmRows)) {
          for (const row of tmRows) {
            if (row?.userId) candidateUserIds.add(row.userId);
          }
        }

        const [profRows]: any = await conn.query(
          `SELECT id FROM Professional WHERE tenantId = ?`,
          [tenantId]
        );
        if (Array.isArray(profRows)) {
          for (const row of profRows) {
            if (row?.id) deletedProfIds.add(row.id);
          }
        }

        // Delete tenant row; foreign keys cascade all tenant-scoped tables and SET NULL on AuditLog/WebhookEvent
        const [delRes]: any = await conn.execute(`DELETE FROM Tenant WHERE id = ?`, [tenantId]);
        if (!delRes || Number(delRes.affectedRows || 0) === 0) {
          // Ensure consistency if tenant only existed in memory or was already absent in MySQL
        }

        // Remove staff-only users that no longer belong to any other store or client profile
        for (const uid of candidateUserIds) {
          if (!uid || uid === params.actorId || uid === 'user-master-1') continue;

          const [uRows]: any = await conn.query(
            `SELECT id, email FROM User WHERE id = ? LIMIT 1`,
            [uid]
          );
          const dbUser = Array.isArray(uRows) && uRows.length > 0 ? uRows[0] : null;
          const memUser = (store.users || []).find((u: any) => u.id === uid);
          const emailLower = String(dbUser?.email || memUser?.email || '').toLowerCase();

          if (
            !dbUser ||
            emailLower === 'prwashingtondiasbh@gmail.com' ||
            memUser?.isMasterAdmin ||
            memUser?.role === 'SUPER_ADMIN' ||
            memUser?.role === 'CUSTOMER' ||
            String(uid).startsWith('user-cust-')
          ) {
            continue;
          }

          const [remTmRows]: any = await conn.query(
            `SELECT COUNT(*) as cnt FROM TenantMember WHERE userId = ?`,
            [uid]
          );
          const remTm = Number(remTmRows?.[0]?.cnt || 0);
          if (remTm > 0) continue;

          const [remCliRows]: any = await conn.query(
            `SELECT COUNT(*) as cnt FROM Client WHERE (email IS NOT NULL AND LOWER(email) = LOWER(?)) OR notes LIKE ?`,
            [emailLower, `%userId:${uid}%`]
          );
          const remCli = Number(remCliRows?.[0]?.cnt || 0);
          if (remCli > 0) continue;

          await conn.execute(
            `DELETE FROM User WHERE id = ? AND LOWER(email) <> 'prwashingtondiasbh@gmail.com'`,
            [uid]
          );
          removedOrphanedUsers.push(uid);
        }

        await conn.commit();
        invalidateQueryCache();
      } catch (e) {
        if (conn) {
          try {
            await conn.rollback();
          } catch {}
        }
        handleDbFallbackError('deleteTenant', e);
      } finally {
        if (conn) {
          try {
            conn.release();
          } catch {}
        }
      }
    }

    // Purge all tenant-scoped records from memoryStore
    const filterByTenant = (arrName: string) => {
      if (Array.isArray(store[arrName])) {
        store[arrName] = store[arrName].filter((item: any) => item?.tenantId !== tenantId);
      }
    };

    store.tenants = (store.tenants || []).filter((t: any) => t.id !== tenantId);
    const tenantScopedArrays = [
      'subscriptions',
      'saasInvoices',
      'tenantMembers',
      'professionals',
      'timeBlocks',
      'services',
      'clients',
      'appointments',
      'payments',
      'notifications',
      'cancellationRequests',
      'refundRequests',
      'expenses',
      'financialTransactions',
      'commissionRules',
      'commissionRecords',
      'whatsappConfigs',
      'whatsappTemplates',
      'whatsappMessages',
      'whatsappReminders',
      'whatsappWebhookEvents',
      'businessLocations',
      'waitlistEntries',
      'waitlistOffers',
      'loyaltyPrograms',
      'loyaltyRewards',
      'loyaltyLedgers',
      'coupons',
      'couponRedemptions',
      'servicePackages',
      'customerPackages',
      'packageUsageLedgers',
      'giftCards',
      'giftCardTransactions',
      'serviceReviews',
      'marketingCampaigns',
      'campaignRecipients',
      'inventoryProducts',
      'inventoryMovements',
    ];
    for (const arrName of tenantScopedArrays) {
      filterByTenant(arrName);
    }

    if (Array.isArray(store.workingHours) && deletedProfIds.size > 0) {
      store.workingHours = store.workingHours.filter(
        (wh: any) => !deletedProfIds.has(wh?.professionalId)
      );
    }

    // Remove orphaned staff users in memoryStore and rebind multi-store users to a remaining store
    store.users = (store.users || []).reduce((acc: any[], u: any) => {
      const isProtected =
        Boolean(u.isMasterAdmin) ||
        u.role === 'SUPER_ADMIN' ||
        String(u.email || '').toLowerCase() === 'prwashingtondiasbh@gmail.com' ||
        u.id === params.actorId ||
        u.id === 'user-master-1';

      if (isProtected) {
        if (u.tenantId === tenantId) {
          const fallbackTenant = (store.tenants || [])[0]?.id || 'biz-1';
          acc.push({ ...u, tenantId: fallbackTenant });
        } else {
          acc.push(u);
        }
        return acc;
      }

      const remainingMembership = (store.tenantMembers || []).find((tm: any) => tm.userId === u.id);
      const hasRemainingClientProfile = (store.clients || []).some(
        (c: any) =>
          c.userId === u.id ||
          (u.email && String(c.email || '').toLowerCase() === String(u.email || '').toLowerCase()) ||
          String(c.notes || '').includes(`userId:${u.id}`)
      );

      const wasLinkedToDeletedTenant =
        candidateUserIds.has(u.id) || u.tenantId === tenantId || removedOrphanedUsers.includes(u.id);

      if (wasLinkedToDeletedTenant) {
        if (remainingMembership) {
          acc.push({
            ...u,
            tenantId: remainingMembership.tenantId,
            role: remainingMembership.role || u.role,
          });
          return acc;
        }
        if (u.role === 'CUSTOMER' || hasRemainingClientProfile) {
          const nextTenant = (store.clients || []).find((c: any) => c.userId === u.id)?.tenantId || u.tenantId;
          acc.push({ ...u, tenantId: nextTenant });
          return acc;
        }
        // Orphaned staff-only user: drop cleanly
        return acc;
      }

      acc.push(u);
      return acc;
    }, []);

    // Preserve global audit log entry without referencing deleted Tenant FK
    if (Array.isArray(store.auditLogs)) {
      store.auditLogs = store.auditLogs.map((log: any) =>
        log.tenantId === tenantId ? { ...log, tenantId: null } : log
      );
    }

    lastFullSyncTimestamp = 0;

    await db.recordAuditLog(null, params.actorId, 'SAAS_TENANT_DELETED', {
      deletedTenantId: tenantId,
      deletedTenantName: tenantName,
      deletedTenantSlug: tenantSlug,
      reason,
      removedUsersCount: removedOrphanedUsers.length,
    });

    return {
      deletedTenantId: tenantId,
      deletedTenantName: tenantName,
      deletedTenantSlug: tenantSlug,
      reason,
    };
  },
};
