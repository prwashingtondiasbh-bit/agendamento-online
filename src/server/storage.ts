// Resilient multi-tenant storage service supporting Hostinger MySQL and fallback memory store
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  getMySqlPool,
  markConnectionFailed,
  getConnectionWithRetry,
  queryWithRetry,
  executeWithRetry,
  handleDbFallbackError,
  validateEnumValueStrict,
  VALID_TENANT_MEMBER_ROLES,
  VALID_APPOINTMENT_STATUSES,
  VALID_TIME_BLOCK_TYPES,
} from './db/mysql.js';
import { saasService } from './saasService.js';

export const DEFAULT_CANCELLATION_POLICY_TEXT =
  'Cancelamentos ou reagendamentos solicitados com no mínimo o prazo de antecedência configurado pelo estabelecimento garantem a remarcação sem custos ou a solicitação de estorno integral do valor pago a título de sinal via Pix, processado em até 1 dia útil. Solicitações efetuadas após o prazo limite de antecedência acarretam a retenção do valor do sinal para cobertura da reserva exclusiva de horário e custos operacionais da profissional. Casos fortuitos ou de força maior devidamente justificados poderão ser submetidos à análise individual da administração do salão, respeitadas as normas do Código de Defesa do Consumidor.';

export const DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS =
  'Em caso de imprevistos de última hora, necessidade de reagendamento emergencial ou dúvidas sobre o estorno do sinal, entre em contato diretamente pelo WhatsApp ou telefone oficial do estabelecimento informando seu nome completo e o código do agendamento para atendimento prioritário.';

export const memoryStore = {
  tenants: [
    {
      id: 'biz-1',
      name: 'Agenda Beauty Studio São Paulo',
      slug: 'agenda-beauty-sp',
      phone: '(11) 98765-4321',
      email: 'sp@agendabeauty.com.br',
      address: 'Alameda dos Anjos, 1000 - SP',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      openTime: '08:00',
      closeTime: '20:00',
      requireDeposit: true,
      defaultDeposit: 30,
      cancellationHoursLimit: 6,
      allowCustomerReschedule: true,
      allowManualReviewOutOfPeriod: true,
      cancellationPolicyText: DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions: DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      cancellationPolicyVersion: 1,
      mpPublicKey: 'APP_USR-ddb9ac86-37b6-420c-9d55-4e4e98b31f0b',
      mpAccessToken: 'APP_USR-8630035486188154-111207-b81ea906b07580ee5b1ed4843d3ee54a-3838667538',
      mpWebhookSecret: null,
      mpEnvironment: 'sandbox',
      enableAdvancedFeatures: false,
    },
  ] as any[],

  users: [
    {
      id: 'user-1',
      name: 'Camila Souza',
      email: 'camila@agendabeauty.com.br',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-1',
      role: 'OWNER',
      professionalId: 'prof-1',
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
    {
      id: 'user-manager-1',
      name: 'Renata Gerente',
      email: 'gerente@agendabeauty.com.br',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-1',
      role: 'MANAGER',
      professionalId: undefined,
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
    {
      id: 'user-recep-1',
      name: 'Paula Recepção',
      email: 'recepcao@agendabeauty.com.br',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-1',
      role: 'RECEPTIONIST',
      professionalId: undefined,
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
    {
      id: 'user-prof-2',
      name: 'Larissa Mendes',
      email: 'larissa@agendabeauty.com.br',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-1',
      role: 'PROFESSIONAL',
      professionalId: 'prof-2',
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
    {
      id: 'user-prof-3',
      name: 'Bruna Alves',
      email: 'bruna@agendabeauty.com.br',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-1',
      role: 'PROFESSIONAL',
      professionalId: 'prof-3',
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
    {
      id: 'user-cust-1794484626621',
      name: 'Osineia Santos',
      email: 'osineia.sa@gmail.com',
      phone: '31988003407',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-1',
      role: 'CUSTOMER',
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
  ] as any[],

  professionals: [
    { id: 'prof-1', tenantId: 'biz-1', name: 'Camila Souza', email: 'camila@agendabeauty.com.br', phone: '(11) 99111-2233', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', specialty: 'Alongamento em Gel', active: true },
    { id: 'prof-2', tenantId: 'biz-1', name: 'Larissa Mendes', email: 'larissa@agendabeauty.com.br', phone: '(11) 99222-3344', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', specialty: 'Manutenção & Nail Art', active: true },
    { id: 'prof-3', tenantId: 'biz-1', name: 'Bruna Alves', email: 'bruna@agendabeauty.com.br', phone: '(11) 99333-4455', avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', specialty: 'Spa dos Pés & Esmaltação em Gel', active: true },
  ],

  workingHours: [
    { id: 'wh-1', professionalId: 'prof-1', dayOfWeek: 1, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
  ],

  timeBlocks: [] as any[],

  clients: [
    {
      id: 'cli-1',
      tenantId: 'biz-1',
      userId: 'user-cust-1',
      name: 'Beatriz Lima',
      phone: '(11) 98888-7777',
      email: 'beatriz@exemplo.com',
      contactPreference: 'WHATSAPP',
      notes: 'userId:user-cust-1 pref:WHATSAPP',
      internalNotes: [],
      tags: [],
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'cli-1794484626621',
      tenantId: 'biz-1',
      userId: 'user-cust-1794484626621',
      name: 'Osineia Santos',
      phone: '31988003407',
      email: 'osineia.sa@gmail.com',
      contactPreference: 'WHATSAPP',
      notes: 'userId:user-cust-1794484626621 pref:WHATSAPP',
      internalNotes: [],
      tags: [],
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
  ] as any[],

  services: [
    { id: 'serv-1', tenantId: 'biz-1', name: 'Alongamento em Gel (Fibra)', description: 'Fibra de vidro completa', category: 'Alongamento', priceCents: 18000, durationMin: 120, bufferBeforeMin: 0, bufferAfterMin: 15, preparationMin: 10, depositPercent: 30, active: true },
    { id: 'serv-2', tenantId: 'biz-1', name: 'Manutenção em Gel', description: 'Manutenção periódica de alongamento', category: 'Manutenção', priceCents: 11000, durationMin: 90, bufferBeforeMin: 0, bufferAfterMin: 10, preparationMin: 5, depositPercent: 30, active: true },
    { id: 'serv-3', tenantId: 'biz-1', name: 'Spa dos Pés & Plástica', description: 'Tratamento intensivo de hidratação e esfoliação', category: 'Pedicure', priceCents: 9000, durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 10, preparationMin: 5, depositPercent: 30, active: true },
  ],

  appointments: [
    {
      id: 'app-osineia-1',
      tenantId: 'biz-1',
      clientId: 'cli-1794484626621',
      professionalId: 'prof-1',
      serviceId: 'serv-1',
      dateTime: '2026-11-13T14:00:00.000Z',
      endDateTime: '2026-11-13T16:00:00.000Z',
      status: 'CONFIRMED',
      origin: 'ONLINE',
      totalAmountCents: 18000,
      depositAmountCents: 5400,
      balanceAmountCents: 12600,
      snapshotPriceCents: 18000,
      snapshotDurationMin: 120,
      snapshotCancellationHours: 6,
      snapshotPolicyText: DEFAULT_CANCELLATION_POLICY_TEXT,
      snapshotPolicyVersion: 1,
      paymentStatus: 'APPROVED',
      depositPaid: true,
      notes: 'Agendamento confirmado via Pix online',
      createdAt: '2026-11-12T10:00:00.000Z',
    },
    {
      id: 'app-seed-2',
      tenantId: 'biz-1',
      clientId: 'cli-1',
      professionalId: 'prof-1',
      serviceId: 'serv-2',
      dateTime: '2026-11-14T10:00:00.000Z',
      endDateTime: '2026-11-14T11:30:00.000Z',
      status: 'CONFIRMED',
      origin: 'ONLINE',
      totalAmountCents: 11000,
      depositAmountCents: 3300,
      balanceAmountCents: 7700,
      snapshotPriceCents: 11000,
      snapshotDurationMin: 90,
      snapshotCancellationHours: 6,
      snapshotPolicyText: DEFAULT_CANCELLATION_POLICY_TEXT,
      snapshotPolicyVersion: 1,
      paymentStatus: 'APPROVED',
      depositPaid: true,
      notes: 'Manutenção em gel confirmada',
      createdAt: '2026-11-11T12:00:00.000Z',
    },
  ] as any[],

  payments: [
    {
      id: 'pay-osineia-1',
      tenantId: 'biz-1',
      appointmentId: 'app-osineia-1',
      provider: 'MERCADO_PAGO',
      providerPaymentId: 'mp-osineia-1',
      externalReference: 'TENANT:biz-1|APP:app-osineia-1',
      idempotencyKey: 'mp-pix-biz-1-app-osineia-1',
      amountCents: 5400,
      currency: 'BRL',
      status: 'APPROVED',
      paymentMethod: 'PIX',
      qrCode: '00020126580014br.gov.bcb.pix0136mercadopago-sandbox-pay-osineia-152040000530398654054.005802BR5920AGENDA BEAUTY STUDIO6009SAO PAULO62070503***6304ABCD',
      ticketUrl: 'https://www.mercadopago.com.br',
      approvedAt: '2026-11-12T10:05:00.000Z',
      createdAt: '2026-11-12T10:00:00.000Z',
    },
    {
      id: 'pay-seed-2',
      tenantId: 'biz-1',
      appointmentId: 'app-seed-2',
      provider: 'MERCADO_PAGO',
      providerPaymentId: 'mp-seed-2',
      externalReference: 'TENANT:biz-1|APP:app-seed-2',
      idempotencyKey: 'mp-pix-biz-1-app-seed-2',
      amountCents: 3300,
      currency: 'BRL',
      status: 'APPROVED',
      paymentMethod: 'PIX',
      ticketUrl: 'https://www.mercadopago.com.br',
      approvedAt: '2026-11-11T12:05:00.000Z',
      createdAt: '2026-11-11T12:00:00.000Z',
    },
  ] as any[],
  notifications: [] as any[],
  cancellationRequests: [] as any[],
  refundRequests: [] as any[],
  webhookEvents: [] as any[],
  auditLogs: [] as any[],
  expenses: [] as any[],
  financialTransactions: [] as any[],
  commissionRules: [
    {
      id: 'crule-seed-1',
      tenantId: 'biz-1',
      scope: 'PROFESSIONAL',
      professionalId: 'prof-1',
      serviceId: null,
      percentage: 40,
      fixedCents: 0,
      basis: 'COMPLETED_SERVICE_VALUE',
      active: true,
      createdBy: 'user-1',
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'crule-seed-2',
      tenantId: 'biz-1',
      scope: 'SERVICE',
      professionalId: null,
      serviceId: 'serv-1',
      percentage: 45,
      fixedCents: 0,
      basis: 'COMPLETED_SERVICE_VALUE',
      active: true,
      createdBy: 'user-1',
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
  ] as any[],
  commissionRecords: [] as any[],
  whatsappConfigs: [] as any[],
  whatsappTemplates: [] as any[],
  whatsappMessages: [] as any[],
  whatsappReminders: [] as any[],
  whatsappWebhookEvents: [] as any[],
  businessLocations: [
    {
      id: 'loc-main-biz-1',
      tenantId: 'biz-1',
      name: 'Unidade Principal — Jardins SP',
      address: 'Alameda dos Anjos, 1000 - SP',
      phone: '(11) 98765-4321',
      timezone: 'America/Sao_Paulo',
      openTime: '08:00',
      closeTime: '20:00',
      professionalIds: ['prof-1', 'prof-2', 'prof-3'],
      serviceIds: ['serv-1', 'serv-2', 'serv-3'],
      isMain: true,
      active: true,
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
  ] as any[],
  waitlistEntries: [] as any[],
  waitlistOffers: [] as any[],
  loyaltyPrograms: [
    {
      id: 'lprog-biz-1',
      tenantId: 'biz-1',
      name: 'Clube Fidelidade Agenda Beauty',
      active: true,
      pointsPerReal: 1,
      pointsExpirationDays: 365,
      minRedemptionPoints: 50,
      eligibleServiceIds: null,
      eligibleCategories: null,
      reversalRuleOnRefund: 'PROPORTIONAL',
      rulesDescription:
        'Acumule 1 ponto a cada R$ 1,00 efetivamente pago em atendimentos realizados. Em caso de reembolso, os pontos correspondentes são estornados proporcionalmente.',
      updatedBy: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as any[],
  loyaltyRewards: [
    {
      id: 'lrew-seed-1',
      tenantId: 'biz-1',
      name: 'Desconto R$ 30,00 em Manutenção',
      description: 'Abatimento de R$ 30,00 em qualquer manutenção em gel.',
      pointsRequired: 150,
      rewardType: 'DISCOUNT_CENTS',
      discountCents: 3000,
      serviceId: 'serv-2',
      maxRedemptionsPerClient: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'lrew-seed-2',
      tenantId: 'biz-1',
      name: 'Spa dos Pés Cortesia',
      description: 'Sessão completa de Spa dos Pés gratuita.',
      pointsRequired: 300,
      rewardType: 'FREE_SERVICE',
      discountCents: 9000,
      serviceId: 'serv-3',
      maxRedemptionsPerClient: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as any[],
  loyaltyLedgers: [] as any[],
  coupons: [
    {
      id: 'cpn-seed-1',
      tenantId: 'biz-1',
      code: 'BEMVINDA10',
      name: 'Boas-vindas 10% OFF',
      description: '10% de desconto na primeira reserva ou compras acima de R$ 80,00.',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscountCents: 3000,
      minPurchaseCents: 8000,
      startsAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
      maxTotalUses: 100,
      maxUsesPerClient: 1,
      firstPurchaseOnly: false,
      eligibleServiceIds: null,
      eligibleProfessionalIds: null,
      allowedClientIds: null,
      allowStacking: false,
      campaignId: null,
      active: true,
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as any[],
  couponRedemptions: [] as any[],
  servicePackages: [
    {
      id: 'pkg-seed-1',
      tenantId: 'biz-1',
      name: 'Pacote 4 Manutenções em Gel',
      description: '4 sessões de Manutenção em Gel com preço especial (validade de 120 dias).',
      items: [{ serviceId: 'serv-2', quantity: 4 }],
      totalPriceCents: 38000,
      validityDays: 120,
      allowedProfessionalIds: null,
      allowManualRenewal: true,
      cancellationPolicy:
        'Cancelamentos respeitando a antecedência mínima preservam o crédito da sessão no pacote.',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as any[],
  customerPackages: [] as any[],
  packageUsageLedgers: [] as any[],
  giftCards: [] as any[],
  giftCardTransactions: [] as any[],
  serviceReviews: [
    {
      id: 'rev-seed-1',
      tenantId: 'biz-1',
      appointmentId: 'app-seed-2',
      clientId: 'cli-1',
      serviceId: 'serv-2',
      professionalId: 'prof-1',
      rating: 5,
      comment: 'Atendimento impecável, minhas unhas duraram mais de 3 semanas intactas!',
      replyText: 'Muito obrigada pelo carinho, Beatriz! Esperamos você no próximo mês.',
      repliedBy: 'user-1',
      repliedAt: new Date(Date.now() - 13 * 24 * 3600 * 1000).toISOString(),
      hidden: false,
      hiddenReason: null,
      hiddenBy: null,
      hiddenAt: null,
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 13 * 24 * 3600 * 1000).toISOString(),
    },
  ] as any[],
  marketingCampaigns: [] as any[],
  campaignRecipients: [] as any[],
  inventoryProducts: [
    {
      id: 'prd-seed-1',
      tenantId: 'biz-1',
      name: 'Gel Construtor Pink UV 30g',
      sku: 'GEL-PINK-30G',
      category: 'GÉIS E FIBRAS',
      unit: 'UN',
      currentQuantity: 12,
      minQuantity: 5,
      unitCostCents: 4500,
      salePriceCents: null,
      serviceConsumption: [{ serviceId: 'serv-1', quantityPerAppointment: 1 }],
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prd-seed-2',
      tenantId: 'biz-1',
      name: 'Kit Lixas Descartáveis 100/180',
      sku: 'LIXA-100-180',
      category: 'DESCARTÁVEIS',
      unit: 'UN',
      currentQuantity: 3,
      minQuantity: 10,
      unitCostCents: 350,
      salePriceCents: null,
      serviceConsumption: [],
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as any[],
  inventoryMovements: [] as any[],
};

export const db = {
  async findUserByEmail(email: string) {
    saasService.ensureSaaSSeedData();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return null;

    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await queryWithRetry(
          `SELECT u.id, u.name, u.email, u.passwordHash, u.resetToken, u.resetExpires, u.active,
                  tm.tenantId, tm.role
           FROM User u
           LEFT JOIN TenantMember tm ON tm.userId = u.id
           WHERE LOWER(u.email) = LOWER(?) LIMIT 1`,
          [cleanEmail]
        );
        if (rows && rows.length > 0) {
          const u = rows[0];
          const memUser = memoryStore.users.find(
            (mu) => String(mu.email || '').toLowerCase() === cleanEmail || mu.id === u.id
          );
          const isInClients = (memoryStore.clients as any[]).some(
            (c) =>
              c.userId === u.id ||
              String(c.email || '').toLowerCase() === cleanEmail ||
              String(c.notes || '').includes(`userId:${u.id}`)
          );
          const resolvedRole =
            u.role && String(u.role).trim() !== ''
              ? u.role
              : memUser?.role ||
                (String(u.id).startsWith('user-cust-') || isInClients ? 'CUSTOMER' : 'OWNER');

          const hydratedUser = {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: memUser?.phone || undefined,
            passwordHash: u.passwordHash,
            tenantId: u.tenantId || memUser?.tenantId || 'biz-1',
            role: resolvedRole,
            isMasterAdmin: Boolean(memUser?.isMasterAdmin || resolvedRole === 'SUPER_ADMIN'),
            professionalId: memUser?.professionalId,
            resetToken: u.resetToken,
            resetExpires: u.resetExpires,
            active: Boolean(u.active),
          };
          if (memUser) {
            Object.assign(memUser, hydratedUser);
          } else {
            memoryStore.users.push(hydratedUser);
          }
          return hydratedUser;
        }
      } catch (e) {
        handleDbFallbackError('findUserByEmail', e);
      }
    }
    const foundMem =
      memoryStore.users.find((u) => String(u.email || '').toLowerCase() === cleanEmail) || null;
    if (foundMem && !foundMem.role) {
      const isInClients = (memoryStore.clients as any[]).some(
        (c) =>
          c.userId === foundMem.id ||
          String(c.email || '').toLowerCase() === cleanEmail ||
          String(c.notes || '').includes(`userId:${foundMem.id}`)
      );
      foundMem.role =
        String(foundMem.id).startsWith('user-cust-') || isInClients ? 'CUSTOMER' : 'OWNER';
    }
    return foundMem;
  },

  async getUsers() {
    saasService.ensureSaaSSeedData();
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await queryWithRetry(`SELECT id, name, email, active FROM User`);
        return rows.map((r: any) => ({ ...r, active: Boolean(r.active) }));
      } catch (e) {
        handleDbFallbackError('getUsers', e);
      }
    }
    return memoryStore.users;
  },

  async registerTenantWithUser(data: {
    name: string;
    email: string;
    passwordHash: string;
    businessName: string;
    phone: string;
    plan?: 'SIMPLE' | 'COMPLETE';
    slug?: string;
    description?: string;
    address?: string;
    seedStarterCatalog?: boolean;
  }) {
    saasService.ensureSaaSSeedData();
    const tenantId = `biz-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    let slug = data.slug
      ? String(data.slug)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      : '';
    const baseSlug = (data.businessName || 'salao')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'salao';

    if (!slug) {
      slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    } else if (memoryStore.tenants.some((t: any) => String(t.slug || '').toLowerCase() === slug)) {
      slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    const now = new Date();
    const selectedPlan = data.plan === 'SIMPLE' ? 'SIMPLE' : 'COMPLETE';
    const planMeta = saasService.getPlanMetadata(selectedPlan);
    const initialRequireDeposit = Boolean(planMeta.allowDeposit);

    const pool = getMySqlPool();
    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();
        await conn.execute(
          `INSERT INTO Tenant (id, name, slug, phone, email, address, timezone, currency, openTime, closeTime, requireDeposit, defaultDeposit, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            data.businessName,
            slug,
            data.phone,
            data.email,
            data.address || '',
            'America/Sao_Paulo',
            'BRL',
            '08:00',
            '20:00',
            initialRequireDeposit ? 1 : 0,
            initialRequireDeposit ? 30 : 0,
            now,
            now,
          ]
        );
        await conn.execute(
          `INSERT INTO User (id, name, email, passwordHash, active, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [userId, data.name, data.email, data.passwordHash, now, now]
        );
        const ownerRole = validateEnumValueStrict('TenantMember.role', 'OWNER', VALID_TENANT_MEMBER_ROLES);
        await conn.execute(
          `INSERT INTO TenantMember (id, tenantId, userId, role, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [`mem-${Date.now()}`, tenantId, userId, ownerRole, now, now]
        );
        await conn.commit();
      } catch (e) {
        if (conn) await conn.rollback();
        handleDbFallbackError('registerTenantWithUser', e);
      } finally {
        if (conn) conn.release();
      }
    }

    const newTenant = {
      id: tenantId,
      name: data.businessName,
      slug,
      description: data.description || '',
      logoUrl: '',
      status: 'ACTIVE',
      isPublished: true,
      blockedReason: null,
      blockedAt: null,
      blockedBy: null,
      phone: data.phone,
      email: data.email,
      address: data.address || '',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      openTime: '08:00',
      closeTime: '20:00',
      requireDeposit: initialRequireDeposit,
      defaultDeposit: initialRequireDeposit ? 30 : 0,
      cancellationHoursLimit: 6,
      allowCustomerReschedule: true,
      allowManualReviewOutOfPeriod: true,
      cancellationPolicyText: DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions: DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      cancellationPolicyVersion: 1,
      enableAdvancedFeatures: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const newUser = {
      id: userId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash: data.passwordHash,
      tenantId,
      role: 'OWNER',
      isMasterAdmin: false,
      resetToken: null,
      resetExpires: null,
      active: true,
      createdAt: now.toISOString(),
    };
    memoryStore.tenants.push(newTenant);
    memoryStore.users.push(newUser);
    ((memoryStore as any).tenantMembers as any[]).push({
      id: `tm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      userId,
      role: 'OWNER',
      createdAt: now.toISOString(),
    });
    ((memoryStore as any).subscriptions as any[]).push({
      id: `sub-${tenantId}`,
      tenantId,
      plan: selectedPlan,
      status: 'ACTIVE',
      contractedPriceCents: planMeta.defaultPriceCents,
      billingCycle: 'MONTHLY',
      startedAt: now.toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      nextBillingAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      cancelledAt: null,
      statusReason: 'Assinatura inicial criada no cadastro do estabelecimento',
      updatedBy: userId,
      history: [
        {
          timestamp: now.toISOString(),
          actorId: userId,
          action: 'SUBSCRIPTION_CREATED',
          plan: selectedPlan,
          contractedPriceCents: planMeta.defaultPriceCents,
          status: 'ACTIVE',
        },
      ],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    // Seed default professional and starter services for new tenant only when explicitly requested (e.g. Master Admin portal)
    if (data.seedStarterCatalog) {
      const defaultProfId = `prof-${tenantId}-1`;
      (memoryStore.professionals as any[]).push({
        id: defaultProfId,
        tenantId,
        name: data.name || 'Especialista',
        specialty: 'Nail Designer & Manicure',
        avatarUrl: '',
        color: '#e11d48',
        active: true,
        workingHours: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '19:00', active: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '19:00', active: true },
          { dayOfWeek: 3, startTime: '09:00', endTime: '19:00', active: true },
          { dayOfWeek: 4, startTime: '09:00', endTime: '19:00', active: true },
          { dayOfWeek: 5, startTime: '09:00', endTime: '19:00', active: true },
          { dayOfWeek: 6, startTime: '09:00', endTime: '18:00', active: true },
        ],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      const starterServices = [
        {
          id: `serv-${tenantId}-1`,
          tenantId,
          name: 'Manicure e Pedicure Completa',
          category: 'Unhas',
          description: 'Cutilagem russa combinada, hidratação profunda e esmaltação de alta durabilidade.',
          priceCents: 8500,
          price: 85,
          durationMin: 75,
          bufferBeforeMin: 0,
          bufferAfterMin: 10,
          preparationMin: 0,
          depositPercent: initialRequireDeposit ? 30 : 0,
          active: true,
          professionals: [{ professionalId: defaultProfId }],
        },
        {
          id: `serv-${tenantId}-2`,
          tenantId,
          name: 'Alongamento em Fibra de Vidro',
          category: 'Alongamento',
          description: 'Alongamento resistente com aspecto natural, curvatura C e acabamento impecável.',
          priceCents: 19000,
          price: 190,
          durationMin: 120,
          bufferBeforeMin: 0,
          bufferAfterMin: 15,
          preparationMin: 0,
          depositPercent: initialRequireDeposit ? 30 : 0,
          active: true,
          professionals: [{ professionalId: defaultProfId }],
        },
        {
          id: `serv-${tenantId}-3`,
          tenantId,
          name: 'Spa dos Pés com Massagem Relaxante',
          category: 'Spa',
          description: 'Esfoliação revigorante, imersão em sais aromáticos e massagem relaxante.',
          priceCents: 9500,
          price: 95,
          durationMin: 50,
          bufferBeforeMin: 0,
          bufferAfterMin: 10,
          preparationMin: 0,
          depositPercent: initialRequireDeposit ? 30 : 0,
          active: true,
          professionals: [{ professionalId: defaultProfId }],
        },
      ];
      memoryStore.services.push(...starterServices);
    }

    return { tenant: newTenant, user: newUser };
  },

  async savePasswordResetToken(email: string, token: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `UPDATE User SET resetToken = ?, resetExpires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email = ?`,
          [token, email]
        );
      } catch (e) {}
    }
    const user = memoryStore.users.find(u => u.email === email);
    if (user) { user.resetToken = token; return true; }
    return true;
  },

  async resetUserPassword(email: string, token: string, passwordHash: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [res]: any = await pool.execute(
          `UPDATE User SET passwordHash = ?, resetToken = NULL, resetExpires = NULL WHERE email = ? AND resetToken = ?`,
          [passwordHash, email, token]
        );
        if (res.affectedRows > 0) return true;
      } catch (e) {}
    }
    const user = memoryStore.users.find(u => u.email === email);
    if (user && user.resetToken === token) {
      user.passwordHash = passwordHash;
      user.resetToken = null;
      return true;
    }
    return false;
  },

  async getBusiness(tenantId = 'biz-1') {
    saasService.ensureSaaSSeedData();
    const cleanRef = String(tenantId || 'biz-1').trim().toLowerCase();
    const memTenant = memoryStore.tenants.find(
      (t: any) =>
        String(t.id || '').toLowerCase() === cleanRef ||
        String(t.slug || '').toLowerCase() === cleanRef ||
        (Array.isArray(t.legacySlugs) &&
          t.legacySlugs.some((ls: any) => String(ls).toLowerCase() === cleanRef))
    );
    const resolvedId = memTenant?.id || tenantId;
    const subscription = saasService.getTenantSubscription(resolvedId);
    const planCapabilities = saasService.getTenantCapabilities(resolvedId);
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await queryWithRetry(
          `SELECT * FROM Tenant WHERE id = ? OR LOWER(slug) = LOWER(?) LIMIT 1`,
          [resolvedId, tenantId]
        );
        if (rows && rows.length > 0) {
          const r = rows[0];
          const rawRequireDeposit = r.requireDeposit !== undefined ? Boolean(r.requireDeposit) : (memTenant?.requireDeposit ?? true);
          const mergedTenant = {
            ...(memTenant || {}),
            ...r,
            slug: r.slug || memTenant?.slug || 'agenda-beauty-sp',
            legacySlugs: Array.from(
              new Set([
                ...(Array.isArray((memTenant as any)?.legacySlugs) ? (memTenant as any).legacySlugs : []),
                memTenant?.slug,
                r.slug,
                tenantId === 'biz-1' ? 'agenda-beauty-sp' : undefined,
                tenantId === 'biz-1' ? 'agenda-beauty' : undefined,
              ].filter(Boolean).map((s) => String(s).toLowerCase()))
            ),
            description: r.description ?? memTenant?.description ?? '',
            logoUrl: r.logoUrl ?? memTenant?.logoUrl ?? '',
            status: r.status ?? memTenant?.status ?? 'ACTIVE',
            isPublished: r.isPublished !== undefined ? Boolean(r.isPublished) : (memTenant?.isPublished !== false),
            blockedReason: r.blockedReason ?? memTenant?.blockedReason ?? null,
            blockedAt: r.blockedAt ?? memTenant?.blockedAt ?? null,
            cancelledReason: r.cancelledReason ?? memTenant?.cancelledReason ?? null,
            requireDeposit: planCapabilities.allowDeposit
              ? (memTenant?.requireDeposit !== undefined ? Boolean(memTenant.requireDeposit) : rawRequireDeposit)
              : false,
            defaultDeposit: Number(memTenant?.defaultDeposit ?? r.defaultDeposit ?? 30),
            cancellationHoursLimit: Number(memTenant?.cancellationHoursLimit ?? r.cancellationHoursLimit ?? 6),
            allowCustomerReschedule: memTenant?.allowCustomerReschedule !== undefined
              ? Boolean(memTenant.allowCustomerReschedule)
              : (r.allowCustomerReschedule !== undefined ? Boolean(r.allowCustomerReschedule) : true),
            allowManualReviewOutOfPeriod: memTenant?.allowManualReviewOutOfPeriod !== undefined
              ? Boolean(memTenant.allowManualReviewOutOfPeriod)
              : (r.allowManualReviewOutOfPeriod !== undefined ? Boolean(r.allowManualReviewOutOfPeriod) : true),
            cancellationPolicyText:
              (memTenant?.cancellationPolicyText && String(memTenant.cancellationPolicyText).trim()) ||
              (r.cancellationPolicyText && String(r.cancellationPolicyText).trim()) ||
              DEFAULT_CANCELLATION_POLICY_TEXT,
            cancellationContactInstructions:
              (memTenant?.cancellationContactInstructions && String(memTenant.cancellationContactInstructions).trim()) ||
              (r.cancellationContactInstructions && String(r.cancellationContactInstructions).trim()) ||
              DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
            cancellationPolicyVersion: Number(memTenant?.cancellationPolicyVersion ?? r.cancellationPolicyVersion ?? 1),
            mpPublicKey: r.mpPublicKey ?? memTenant?.mpPublicKey ?? null,
            mpAccessToken: r.mpAccessToken ?? memTenant?.mpAccessToken ?? null,
            mpWebhookSecret: r.mpWebhookSecret ?? memTenant?.mpWebhookSecret ?? null,
            mpEnvironment: r.mpEnvironment ?? memTenant?.mpEnvironment ?? 'sandbox',
            enableAdvancedFeatures:
              r.enableAdvancedFeatures !== undefined
                ? Boolean(r.enableAdvancedFeatures)
                : Boolean(memTenant?.enableAdvancedFeatures),
          };
          if (memTenant) {
            Object.assign(memTenant, mergedTenant);
          } else {
            memoryStore.tenants.push(mergedTenant);
          }
          return {
            ...mergedTenant,
            subscription,
            planCapabilities,
          };
        }
      } catch (e) {
        handleDbFallbackError('getBusiness', e);
      }
    }
    const fallback = memTenant || memoryStore.tenants[0];
    const rawRequireDeposit = fallback?.requireDeposit !== undefined ? Boolean(fallback.requireDeposit) : true;
    return {
      ...fallback,
      description: fallback?.description || '',
      logoUrl: fallback?.logoUrl || '',
      status: fallback?.status || 'ACTIVE',
      isPublished: fallback?.isPublished !== false,
      blockedReason: fallback?.blockedReason || null,
      blockedAt: fallback?.blockedAt || null,
      cancelledReason: fallback?.cancelledReason || null,
      requireDeposit: planCapabilities.allowDeposit ? rawRequireDeposit : false,
      defaultDeposit: Number(fallback?.defaultDeposit ?? 30),
      cancellationHoursLimit: Number(fallback?.cancellationHoursLimit ?? 6),
      allowCustomerReschedule: fallback?.allowCustomerReschedule ?? true,
      allowManualReviewOutOfPeriod: fallback?.allowManualReviewOutOfPeriod ?? true,
      cancellationPolicyText:
        (fallback?.cancellationPolicyText && String(fallback.cancellationPolicyText).trim()) ||
        DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions:
        (fallback?.cancellationContactInstructions && String(fallback.cancellationContactInstructions).trim()) ||
        DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      cancellationPolicyVersion: Number(fallback?.cancellationPolicyVersion ?? 1),
      mpPublicKey: fallback?.mpPublicKey ?? null,
      mpAccessToken: fallback?.mpAccessToken ?? null,
      mpWebhookSecret: fallback?.mpWebhookSecret ?? null,
      mpEnvironment: fallback?.mpEnvironment ?? 'sandbox',
      enableAdvancedFeatures: Boolean(fallback?.enableAdvancedFeatures),
      subscription,
      planCapabilities,
    };
  },

  async updateBusiness(tenantId: string, data: any) {
    saasService.ensureSaaSSeedData();
    saasService.assertTenantOperationalWriteAllowed(tenantId);

    const planCapabilities = saasService.getTenantCapabilities(tenantId);
    if (data.requireDeposit === true) {
      saasService.assertPlanAllowsDeposit(tenantId);
    }

    if (data.cancellationHoursLimit !== undefined) {
      const hours = Number(data.cancellationHoursLimit);
      if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
        const err: any = new Error('Prazo de cancelamento inválido: deve ser um valor inteiro positivo entre 1 e 720 horas.');
        err.statusCode = 400;
        throw err;
      }
    }

    let biz = memoryStore.tenants.find(t => t.id === tenantId);
    if (!biz) {
      const fetched = await this.getBusiness(tenantId);
      biz = { ...fetched, id: tenantId };
      memoryStore.tenants.push(biz);
    }

    if (data.slug !== undefined && data.slug !== null && String(data.slug).trim() !== '') {
      const normalizedSlug = String(data.slug)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (normalizedSlug.length >= 2) {
        if (!biz.slug || String(biz.slug).toLowerCase() !== normalizedSlug) {
          const conflict = memoryStore.tenants.find(
            (t) => t.id !== tenantId && String(t.slug || '').toLowerCase() === normalizedSlug
          );
          if (conflict) {
            const err: any = new Error('Este link público (slug) já está em uso por outro estabelecimento.');
            err.statusCode = 409;
            throw err;
          }
          if (biz.slug && String(biz.slug).toLowerCase() !== normalizedSlug) {
            biz.legacySlugs = Array.from(
              new Set([
                ...(Array.isArray(biz.legacySlugs) ? biz.legacySlugs : []),
                String(biz.slug).toLowerCase(),
              ])
            );
          }
        }
        data.slug = normalizedSlug;
      }
    } else {
      delete data.slug;
    }

    const nextRequireDeposit = planCapabilities.allowDeposit
      ? data.requireDeposit !== undefined
        ? Boolean(data.requireDeposit)
        : biz.requireDeposit !== undefined
        ? Boolean(biz.requireDeposit)
        : true
      : false;

    let finalDefaultDeposit: number;
    if (data.defaultDeposit !== undefined && data.defaultDeposit !== null) {
      const dep = Number(data.defaultDeposit);
      if (Number.isInteger(dep) && dep >= 0 && dep <= 100) {
        finalDefaultDeposit = dep;
      } else {
        finalDefaultDeposit = nextRequireDeposit ? 30 : 0;
      }
    } else {
      finalDefaultDeposit = Number(biz.defaultDeposit ?? (nextRequireDeposit ? 30 : 0));
    }
    if (nextRequireDeposit && (!finalDefaultDeposit || finalDefaultDeposit < 1)) {
      finalDefaultDeposit = 30; // auto-fallback to standard 30% when enabling deposit
    }
    if (!Number.isInteger(finalDefaultDeposit) || finalDefaultDeposit < 0 || finalDefaultDeposit > 100) {
      finalDefaultDeposit = nextRequireDeposit ? 30 : 0;
    }

    let finalCancellationHours = Number(
      data.cancellationHoursLimit !== undefined && data.cancellationHoursLimit !== null
        ? data.cancellationHoursLimit
        : biz.cancellationHoursLimit ?? 6
    );
    if (!Number.isInteger(finalCancellationHours) || finalCancellationHours < 1 || finalCancellationHours > 720) {
      finalCancellationHours = 6;
    }

    const policyKeys = [
      'cancellationHoursLimit',
      'allowCustomerReschedule',
      'allowManualReviewOutOfPeriod',
      'cancellationPolicyText',
      'cancellationContactInstructions',
    ];
    const hasPolicyChange = policyKeys.some((k) => data[k] !== undefined && data[k] !== biz[k]);
    const nextVersion = hasPolicyChange ? Number(biz.cancellationPolicyVersion || 1) + 1 : Number(biz.cancellationPolicyVersion || 1);

    const updatedData = {
      ...data,
      requireDeposit: nextRequireDeposit,
      defaultDeposit: finalDefaultDeposit,
      cancellationHoursLimit: finalCancellationHours,
      ...(hasPolicyChange ? { cancellationPolicyVersion: nextVersion } : {}),
    };

    const pool = getMySqlPool();
    if (pool) {
      try {
        const fields: string[] = [];
        const values: any[] = [];
        const allowedTenantColumns = [
          'name',
          'slug',
          'description',
          'logoUrl',
          'isPublished',
          'phone',
          'email',
          'address',
          'timezone',
          'currency',
          'openTime',
          'closeTime',
          'requireDeposit',
          'defaultDeposit',
          ...policyKeys,
          'cancellationPolicyVersion',
          'mpPublicKey',
          'mpAccessToken',
          'mpWebhookSecret',
          'mpEnvironment',
        ];
        for (const [key, val] of Object.entries(updatedData)) {
          if (allowedTenantColumns.includes(key) && val !== undefined) {
            fields.push(`${key} = ?`);
            values.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
          }
        }
        if (fields.length > 0) {
          values.push(tenantId);
          await executeWithRetry(`UPDATE Tenant SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
        }
      } catch (e) {
        handleDbFallbackError('updateBusiness', e);
      }
    }

    Object.assign(biz, updatedData);

    // Synchronize services deposit percent so that client booking and catalog immediately reflect changes
    if (data.defaultDeposit !== undefined || data.requireDeposit !== undefined) {
      for (const s of memoryStore.services) {
        if (s.tenantId === tenantId) {
          s.depositPercent = nextRequireDeposit ? finalDefaultDeposit : 0;
        }
      }
    }

    return {
      ...biz,
      description: biz.description || '',
      logoUrl: biz.logoUrl || '',
      status: biz.status || 'ACTIVE',
      isPublished: biz.isPublished !== false,
      requireDeposit: planCapabilities.allowDeposit ? (biz.requireDeposit !== undefined ? Boolean(biz.requireDeposit) : true) : false,
      defaultDeposit: Number(biz.defaultDeposit ?? 30),
      cancellationHoursLimit: Number(biz.cancellationHoursLimit ?? 6),
      allowCustomerReschedule: biz.allowCustomerReschedule ?? true,
      allowManualReviewOutOfPeriod: biz.allowManualReviewOutOfPeriod ?? true,
      cancellationPolicyText: biz.cancellationPolicyText || DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions: biz.cancellationContactInstructions || DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      cancellationPolicyVersion: Number(biz.cancellationPolicyVersion ?? 1),
      mpPublicKey: biz.mpPublicKey || null,
      mpAccessToken: biz.mpAccessToken || null,
      mpWebhookSecret: biz.mpWebhookSecret || null,
      mpEnvironment: biz.mpEnvironment || 'sandbox',
      subscription: saasService.getTenantSubscription(tenantId),
      planCapabilities,
    };
  },

  async getProfessionals(tenantId: string, options?: { onlyActive?: boolean }) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const sql = options?.onlyActive
          ? `SELECT * FROM Professional WHERE tenantId = ? AND active = 1 ORDER BY createdAt ASC`
          : `SELECT * FROM Professional WHERE tenantId = ? ORDER BY createdAt ASC`;
        const [rows]: any = await queryWithRetry(sql, [tenantId]);
        if (rows && rows.length > 0) {
          const profIds = rows.map((r: any) => r.id);
          const [whRows]: any = await queryWithRetry(
            `SELECT * FROM WorkingHour WHERE professionalId IN (${profIds.map(() => '?').join(',')})`,
            profIds
          );
          const [tbRows]: any = await queryWithRetry(`SELECT * FROM TimeBlock WHERE tenantId = ?`, [tenantId]);

          return rows.map((p: any) => ({
            ...p,
            active: Boolean(p.active),
            workingHours: whRows.filter((wh: any) => wh.professionalId === p.id),
            timeBlocks: tbRows.filter((tb: any) => tb.professionalId === p.id),
          }));
        }
      } catch (e) {
        handleDbFallbackError('getProfessionals', e);
      }
    }
    return memoryStore.professionals
      .filter(p => p.tenantId === tenantId && (!options?.onlyActive || p.active !== false))
      .map(p => ({
        ...p,
        active: p.active !== false,
        workingHours: memoryStore.workingHours.filter(wh => wh.professionalId === p.id),
        timeBlocks: memoryStore.timeBlocks.filter(tb => tb.tenantId === tenantId && tb.professionalId === p.id),
      }));
  },

  async createProfessional(tenantId: string, data: any) {
    const { workingHours, ...profData } = data;
    const id = `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const defaultWorkingHours = workingHours && Array.isArray(workingHours) && workingHours.length > 0
      ? workingHours
      : [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00',
          endTime: '19:00',
          breakStart: '12:00',
          breakEnd: '13:00',
        }));

    const pool = getMySqlPool();

    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();
        await conn.execute(
          `INSERT INTO Professional (id, tenantId, name, email, phone, avatarUrl, specialty, active, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [id, tenantId, profData.name, profData.email || null, profData.phone || null, profData.avatarUrl || null, profData.specialty || null, now, now]
        );

        for (const wh of defaultWorkingHours) {
          await conn.execute(
            `INSERT INTO WorkingHour (id, professionalId, dayOfWeek, startTime, endTime, breakStart, breakEnd)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              `wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              id,
              Number(wh.dayOfWeek),
              wh.startTime,
              wh.endTime,
              wh.breakStart || null,
              wh.breakEnd || null,
            ]
          );
        }
        await conn.commit();
      } catch (e) {
        if (conn) await conn.rollback();
        handleDbFallbackError('createProfessional', e);
      } finally {
        if (conn) conn.release();
      }
    }

    const savedWh = defaultWorkingHours.map((wh: any) => ({
      id: `wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      professionalId: id,
      dayOfWeek: Number(wh.dayOfWeek),
      startTime: wh.startTime,
      endTime: wh.endTime,
      breakStart: wh.breakStart || null,
      breakEnd: wh.breakEnd || null,
    }));
    savedWh.forEach((wh: any) => memoryStore.workingHours.push(wh));

    const newProf = {
      id,
      tenantId,
      ...profData,
      active: profData.active !== undefined ? Boolean(profData.active) : true,
      workingHours: savedWh,
      timeBlocks: [],
    };
    memoryStore.professionals.push(newProf);
    return newProf;
  },

  async checkProfessionalFutureConflicts(tenantId: string, professionalId: string, newActive?: boolean, newWorkingHours?: any[]) {
    const now = new Date();
    const allApps = await this.getAppointments(tenantId);
    const futureApps = allApps.filter((a: any) => {
      if (a.professionalId !== professionalId) return false;
      if (!['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status)) return false;
      if (new Date(a.dateTime) <= now) return false;
      if (a.status === 'PENDING_PAYMENT') {
        if (a.expiresAt && new Date(a.expiresAt) < now) return false;
        if (!a.expiresAt && a.createdAt && (now.getTime() - new Date(a.createdAt).getTime() > 10 * 60000)) return false;
      }
      return true;
    });

    if (newActive === false && futureApps.length > 0) {
      return futureApps;
    }

    if (newWorkingHours && Array.isArray(newWorkingHours) && futureApps.length > 0) {
      const affected = futureApps.filter((a: any) => {
        const start = new Date(a.dateTime);
        const end = new Date(a.endDateTime || new Date(start.getTime() + 60 * 60000));
        const day = start.getDay();
        const wh = newWorkingHours.find((w: any) => Number(w.dayOfWeek) === day);
        if (!wh) return true;
        const toMins = (hhmm: string) => {
          const [h, m] = hhmm.split(':').map(Number);
          return h * 60 + m;
        };
        const appStartMins = start.getHours() * 60 + start.getMinutes();
        const appEndMins = end.getHours() * 60 + end.getMinutes();
        if (appStartMins < toMins(wh.startTime) || appEndMins > toMins(wh.endTime)) {
          return true;
        }
        if (wh.breakStart && wh.breakEnd) {
          const bStart = toMins(wh.breakStart);
          const bEnd = toMins(wh.breakEnd);
          if (appStartMins < bEnd && appEndMins > bStart) {
            return true;
          }
        }
        return false;
      });
      return affected;
    }

    return [];
  },

  async updateProfessional(tenantId: string, id: string, data: any) {
    const { workingHours, confirmFutureConflicts, ...profData } = data;

    const existingProf = memoryStore.professionals.find(p => p.id === id && p.tenantId === tenantId);
    if (!existingProf) {
      const allProfs = await this.getProfessionals(tenantId);
      if (!allProfs.some((p: any) => p.id === id)) {
        const err: any = new Error('Profissional não encontrado para este estabelecimento');
        err.statusCode = 404;
        throw err;
      }
    }

    if (!confirmFutureConflicts && (profData.active === false || (workingHours && Array.isArray(workingHours)))) {
      const conflicts = await this.checkProfessionalFutureConflicts(tenantId, id, profData.active, workingHours);
      if (conflicts.length > 0) {
        const err: any = new Error(
          `Atenção: existem ${conflicts.length} agendamento(s) futuro(s) que seriam afetados por esta alteração de disponibilidade ou desativação.`
        );
        err.statusCode = 409;
        err.conflicts = conflicts;
        throw err;
      }
    }

    const pool = getMySqlPool();

    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, val] of Object.entries(profData)) {
          if (['name', 'email', 'phone', 'avatarUrl', 'specialty', 'active'].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(key === 'active' ? (val ? 1 : 0) : val);
          }
        }
        if (fields.length > 0) {
          values.push(id, tenantId);
          await conn.execute(`UPDATE Professional SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ? AND tenantId = ?`, values);
        }

        if (workingHours && Array.isArray(workingHours)) {
          await conn.execute(`DELETE FROM WorkingHour WHERE professionalId = ?`, [id]);
          for (const wh of workingHours) {
            await conn.execute(
              `INSERT INTO WorkingHour (id, professionalId, dayOfWeek, startTime, endTime, breakStart, breakEnd)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                `wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                id,
                Number(wh.dayOfWeek),
                wh.startTime,
                wh.endTime,
                wh.breakStart || null,
                wh.breakEnd || null,
              ]
            );
          }
        }
        await conn.commit();
      } catch (e) {
        if (conn) await conn.rollback();
        handleDbFallbackError('updateProfessional', e);
      } finally {
        if (conn) conn.release();
      }
    }

    const prof = memoryStore.professionals.find(p => p.id === id && p.tenantId === tenantId);
    if (prof) {
      Object.assign(prof, profData);
      if (workingHours && Array.isArray(workingHours)) {
        memoryStore.workingHours = memoryStore.workingHours.filter(wh => wh.professionalId !== id);
        workingHours.forEach((wh: any) =>
          memoryStore.workingHours.push({
            id: `wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            professionalId: id,
            dayOfWeek: Number(wh.dayOfWeek),
            startTime: wh.startTime,
            endTime: wh.endTime,
            breakStart: wh.breakStart || null,
            breakEnd: wh.breakEnd || null,
          })
        );
      }
      return {
        ...prof,
        workingHours: memoryStore.workingHours.filter(wh => wh.professionalId === id),
        timeBlocks: memoryStore.timeBlocks.filter(tb => tb.tenantId === tenantId && tb.professionalId === id),
      };
    }
    return null;
  },

  async deleteProfessional(tenantId: string, id: string, options?: { confirmFutureConflicts?: boolean }) {
    if (!options?.confirmFutureConflicts) {
      const conflicts = await this.checkProfessionalFutureConflicts(tenantId, id, false);
      if (conflicts.length > 0) {
        const err: any = new Error(
          `Atenção: existem ${conflicts.length} agendamento(s) futuro(s) vinculados a esta profissional. Reagende ou confirme a desativação.`
        );
        err.statusCode = 409;
        err.conflicts = conflicts;
        throw err;
      }
    }

    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(`UPDATE Professional SET active = 0, updatedAt = NOW() WHERE id = ? AND tenantId = ?`, [id, tenantId]);
      } catch (e) {}
    }
    const prof = memoryStore.professionals.find(p => p.id === id && p.tenantId === tenantId);
    if (prof) { prof.active = false; return prof; }
    return null;
  },

  async getTimeBlocks(tenantId: string, filters?: { professionalId?: string }) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        let sql = `SELECT * FROM TimeBlock WHERE tenantId = ?`;
        const params: any[] = [tenantId];
        if (filters?.professionalId) {
          sql += ` AND (professionalId = ? OR professionalId IS NULL)`;
          params.push(filters.professionalId);
        }
        sql += ` ORDER BY startDate ASC`;
        const [rows]: any = await queryWithRetry(sql, params);
        if (rows) {
          return rows.map((r: any) => ({
            ...r,
            startDate: new Date(r.startDate).toISOString(),
            endDate: new Date(r.endDate).toISOString(),
            professional: r.professionalId
              ? memoryStore.professionals.find(p => p.id === r.professionalId) || { id: r.professionalId, name: 'Profissional' }
              : null,
          }));
        }
      } catch (e) {
        handleDbFallbackError('getTimeBlocks', e);
      }
    }

    return memoryStore.timeBlocks
      .filter((tb: any) => {
        if (tb.tenantId !== tenantId) return false;
        if (filters?.professionalId && tb.professionalId && tb.professionalId !== filters.professionalId) return false;
        return true;
      })
      .map((tb: any) => ({
        ...tb,
        professional: tb.professionalId ? memoryStore.professionals.find(p => p.id === tb.professionalId) || null : null,
      }))
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  },

  async createTimeBlock(tenantId: string, data: {
    professionalId?: string | null;
    type: string;
    startDate: string;
    endDate: string;
    reason?: string | null;
    createdBy?: string | null;
    confirmOverlap?: boolean;
  }) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      const err: any = new Error('Período do bloqueio inválido: a data/hora final deve ser posterior à inicial.');
      err.statusCode = 400;
      throw err;
    }

    if (data.professionalId) {
      const prof = memoryStore.professionals.find(p => p.id === data.professionalId && p.tenantId === tenantId);
      if (!prof) {
        const allProfs = await this.getProfessionals(tenantId);
        if (!allProfs.some((p: any) => p.id === data.professionalId)) {
          const err: any = new Error('Profissional informada para o bloqueio não pertence a este estabelecimento.');
          err.statusCode = 400;
          throw err;
        }
      }
    }

    // Check overlapping active appointments (Section 11)
    const appointments = await this.getAppointments(tenantId);
    const overlappingAppointments = appointments.filter((app: any) => {
      if (!['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(app.status)) return false;
      if (app.status === 'PENDING_PAYMENT') {
        const now = new Date();
        if (app.expiresAt && new Date(app.expiresAt) < now) return false;
        if (!app.expiresAt && app.createdAt && (now.getTime() - new Date(app.createdAt).getTime() > 10 * 60000)) return false;
      }
      if (data.professionalId && app.professionalId !== data.professionalId) return false;
      const appStart = new Date(app.dateTime).getTime();
      const appEnd = new Date(app.endDateTime || new Date(appStart + 60 * 60000)).getTime();
      return start.getTime() < appEnd && end.getTime() > appStart;
    });

    if (overlappingAppointments.length > 0 && !data.confirmOverlap) {
      const err: any = new Error(
        `Conflito detectado: existem ${overlappingAppointments.length} agendamento(s) ativo(s) no período deste bloqueio. Confirme se deseja registrar o bloqueio mantendo os agendamentos existentes para tratativa manual.`
      );
      err.statusCode = 409;
      err.conflicts = overlappingAppointments;
      throw err;
    }

    const id = `tb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const validatedType = validateEnumValueStrict('TimeBlock.type', data.type || 'INTERVAL', VALID_TIME_BLOCK_TYPES);
    const pool = getMySqlPool();

    if (pool) {
      try {
        await pool.execute(
          `INSERT INTO TimeBlock (id, tenantId, professionalId, type, startDate, endDate, reason, createdBy, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, tenantId, data.professionalId || null, validatedType, start, end, data.reason || null, data.createdBy || null, now]
        );
      } catch (e) {
        handleDbFallbackError('createTimeBlock', e);
      }
    }

    const newBlock = {
      id,
      tenantId,
      professionalId: data.professionalId || null,
      type: data.type || 'INTERVAL',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      reason: data.reason || '',
      createdBy: data.createdBy || null,
      createdAt: now.toISOString(),
      overlappingAppointmentsCount: overlappingAppointments.length,
    };

    memoryStore.timeBlocks.push(newBlock);
    await this.recordAuditLog(tenantId, data.createdBy || null, 'TIME_BLOCK_CREATED', {
      timeBlockId: id,
      professionalId: newBlock.professionalId,
      type: newBlock.type,
      startDate: newBlock.startDate,
      endDate: newBlock.endDate,
      overlappingAppointmentsCount: overlappingAppointments.length,
    });

    return {
      ...newBlock,
      professional: newBlock.professionalId
        ? memoryStore.professionals.find(p => p.id === newBlock.professionalId) || null
        : null,
    };
  },

  async deleteTimeBlock(tenantId: string, id: string, actorId?: string | null) {
    const existing = memoryStore.timeBlocks.find((tb: any) => tb.id === id && tb.tenantId === tenantId);
    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(`DELETE FROM TimeBlock WHERE id = ? AND tenantId = ?`, [id, tenantId]);
      } catch (e) {}
    }
    const idx = memoryStore.timeBlocks.findIndex((tb: any) => tb.id === id && tb.tenantId === tenantId);
    if (idx >= 0) {
      memoryStore.timeBlocks.splice(idx, 1);
    } else if (!existing && !pool) {
      const err: any = new Error('Bloqueio de agenda não encontrado.');
      err.statusCode = 404;
      throw err;
    }
    await this.recordAuditLog(tenantId, actorId || null, 'TIME_BLOCK_DELETED', { timeBlockId: id });
    return { id, deleted: true };
  },

  async getServices(tenantId: string, options?: { onlyActive?: boolean }) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const sql = options?.onlyActive
          ? `SELECT * FROM Service WHERE tenantId = ? AND active = 1 ORDER BY createdAt ASC`
          : `SELECT * FROM Service WHERE tenantId = ? ORDER BY createdAt ASC`;
        const [rows]: any = await queryWithRetry(sql, [tenantId]);
        if (rows && rows.length > 0) {
          const serviceIds = rows.map((r: any) => r.id);
          const [spRows]: any = await queryWithRetry(
            `SELECT sp.serviceId, sp.professionalId, p.name as profName
             FROM ServiceProfessional sp
             JOIN Professional p ON p.id = sp.professionalId
             WHERE sp.serviceId IN (${serviceIds.map(() => '?').join(',')})`,
            serviceIds
          );

          return rows.map((s: any) => ({
            ...s,
            active: Boolean(s.active),
            priceCents: Number(s.priceCents || Math.round(Number(s.price || 0) * 100)),
            depositPercent: Number(s.depositPercent || 30),
            durationMin: Number(s.durationMin || 60),
            bufferBeforeMin: Number(s.bufferBeforeMin || 0),
            bufferAfterMin: Number(s.bufferAfterMin || 0),
            preparationMin: Number(s.preparationMin || 0),
            professionals: spRows
              .filter((sp: any) => sp.serviceId === s.id)
              .map((sp: any) => ({ professionalId: sp.professionalId, professional: { id: sp.professionalId, name: sp.profName } })),
          }));
        }
      } catch (e) {
        handleDbFallbackError('getServices', e);
      }
    }
    return memoryStore.services
      .filter(s => s.tenantId === tenantId && (!options?.onlyActive || s.active !== false))
      .map(s => ({
        ...s,
        active: s.active !== false,
      }));
  },

  async createService(tenantId: string, data: any) {
    const { professionalIds, ...serviceData } = data;
    const id = `serv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const priceCents = Number(serviceData.priceCents || Math.round(Number(serviceData.price || 0) * 100));
    const price = priceCents / 100;
    const pool = getMySqlPool();

    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();
        await conn.execute(
          `INSERT INTO Service (id, tenantId, name, description, durationMin, price, category, active, priceCents, bufferBeforeMin, bufferAfterMin, preparationMin, depositPercent, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            tenantId,
            serviceData.name,
            serviceData.description || null,
            Number(serviceData.durationMin || 60),
            price,
            serviceData.category || 'Geral',
            priceCents,
            Number(serviceData.bufferBeforeMin || 0),
            Number(serviceData.bufferAfterMin || 0),
            Number(serviceData.preparationMin || 0),
            Number(serviceData.depositPercent || 30),
            now,
            now,
          ]
        );

        if (professionalIds && Array.isArray(professionalIds)) {
          for (const pid of professionalIds) {
            await conn.execute(
              `INSERT INTO ServiceProfessional (id, serviceId, professionalId) VALUES (?, ?, ?)`,
              [`sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, id, pid]
            );
          }
        }
        await conn.commit();
      } catch (e) {
        if (conn) await conn.rollback();
        handleDbFallbackError('createService', e);
      } finally {
        if (conn) conn.release();
      }
    }

    const newService = {
      id,
      tenantId,
      ...serviceData,
      priceCents,
      active: serviceData.active !== undefined ? Boolean(serviceData.active) : true,
      professionals: Array.isArray(professionalIds)
        ? professionalIds.map((pid: string) => ({
            professionalId: pid,
            professional: memoryStore.professionals.find(p => p.id === pid) || { id: pid, name: '' },
          }))
        : [],
    };
    memoryStore.services.push(newService);
    return newService;
  },

  async updateService(tenantId: string, id: string, data: any) {
    const { professionalIds, ...serviceData } = data;
    const pool = getMySqlPool();

    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();
        const priceCents = serviceData.priceCents !== undefined ? Number(serviceData.priceCents) : undefined;
        const price = priceCents !== undefined ? priceCents / 100 : undefined;

        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, val] of Object.entries(serviceData)) {
          if (['name', 'description', 'durationMin', 'category', 'active', 'bufferBeforeMin', 'bufferAfterMin', 'preparationMin', 'depositPercent'].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(key === 'active' ? (val ? 1 : 0) : val);
          }
        }
        if (priceCents !== undefined) {
          fields.push('priceCents = ?', 'price = ?');
          values.push(priceCents, price);
        }

        if (fields.length > 0) {
          values.push(id, tenantId);
          await conn.execute(`UPDATE Service SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ? AND tenantId = ?`, values);
        }

        if (professionalIds && Array.isArray(professionalIds)) {
          await conn.execute(`DELETE FROM ServiceProfessional WHERE serviceId = ?`, [id]);
          for (const pid of professionalIds) {
            await conn.execute(
              `INSERT INTO ServiceProfessional (id, serviceId, professionalId) VALUES (?, ?, ?)`,
              [`sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, id, pid]
            );
          }
        }
        await conn.commit();
      } catch (e) {
        if (conn) await conn.rollback();
        handleDbFallbackError('updateService', e);
      } finally {
        if (conn) conn.release();
      }
    }

    const serv = memoryStore.services.find(s => s.id === id && s.tenantId === tenantId);
    if (serv) {
      Object.assign(serv, serviceData);
      if (professionalIds && Array.isArray(professionalIds)) {
        (serv as any).professionals = professionalIds.map((pid: string) => ({
          professionalId: pid,
          professional: memoryStore.professionals.find(p => p.id === pid) || { id: pid, name: '' },
        }));
      }
      return serv;
    }
    return null;
  },

  async deleteService(tenantId: string, id: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(`UPDATE Service SET active = 0, updatedAt = NOW() WHERE id = ? AND tenantId = ?`, [id, tenantId]);
      } catch (e) {}
    }
    const serv = memoryStore.services.find(s => s.id === id && s.tenantId === tenantId);
    if (serv) { serv.active = false; return serv; }
    return null;
  },

  normalizePhone(phone: string): string {
    return String(phone || '').replace(/\D/g, '');
  },

  enrichClientRecord(r: any, tenantAppointments: any[], hideInternalNotes = false) {
    const memClient = memoryStore.clients.find(c => c.id === r.id);
    const clientApps = tenantAppointments.filter((a: any) => a.clientId === r.id);
    const completedCount = clientApps.filter((a: any) => a.status === 'COMPLETED').length;
    const activeOrCompletedCount = clientApps.filter((a: any) =>
      ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(a.status)
    ).length;
    const isRecurring = completedCount >= 1 || activeOrCompletedCount > 1;

    const rawTags = r.tags ?? (memClient as any)?.tags ?? [];
    const parsedTags = typeof rawTags === 'string' ? (() => { try { return JSON.parse(rawTags); } catch { return []; } })() : (Array.isArray(rawTags) ? rawTags : []);

    const rawInternalNotes = r.internalNotes ?? (memClient as any)?.internalNotes ?? [];
    const parsedInternalNotes = typeof rawInternalNotes === 'string'
      ? (() => { try { return JSON.parse(rawInternalNotes); } catch { return []; } })()
      : (Array.isArray(rawInternalNotes) ? rawInternalNotes : []);

    const rawConsent = r.communicationConsent ?? (memClient as any)?.communicationConsent ?? { whatsapp: true, sms: false, email: true };
    const parsedConsent = typeof rawConsent === 'string'
      ? (() => { try { return JSON.parse(rawConsent); } catch { return { whatsapp: true, sms: false, email: true }; } })()
      : rawConsent;

    return {
      ...r,
      preferences: r.preferences ?? (memClient as any)?.preferences ?? r.notes ?? '',
      tags: parsedTags,
      internalNotes: hideInternalNotes ? undefined : parsedInternalNotes,
      communicationConsent: parsedConsent,
      active: r.active !== undefined ? Boolean(r.active) : ((memClient as any)?.active ?? true),
      appointmentsCount: clientApps.length,
      completedAppointmentsCount: completedCount,
      isRecurring,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    };
  },

  async getClients(tenantId: string, options?: { hideInternalNotes?: boolean }) {
    const tenantApps = memoryStore.appointments.filter(a => a.tenantId === tenantId);
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await queryWithRetry(
          `SELECT * FROM Client WHERE tenantId = ? ORDER BY createdAt DESC`,
          [tenantId]
        );
        if (rows && rows.length > 0) {
          return rows.map((r: any) => this.enrichClientRecord(r, tenantApps, options?.hideInternalNotes));
        }
      } catch (e) {
        handleDbFallbackError('getClients', e);
      }
    }
    return memoryStore.clients
      .filter(c => c.tenantId === tenantId)
      .map(c => this.enrichClientRecord(c, tenantApps, options?.hideInternalNotes));
  },

  async queryClients(tenantId: string, filters?: {
    search?: string;
    type?: 'ALL' | 'NEW' | 'RECURRING';
    tag?: string;
    page?: number;
    limit?: number;
    hideInternalNotes?: boolean;
  }) {
    const allClients = await this.getClients(tenantId, { hideInternalNotes: filters?.hideInternalNotes });

    // Collect all unique tags across the tenant's clients
    const tagSet = new Set<string>();
    allClients.forEach((c: any) => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach((t: string) => tagSet.add(t));
      }
    });

    let filtered = [...allClients];

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const qDigits = this.normalizePhone(q);
      filtered = filtered.filter((c: any) => {
        const nameMatch = String(c.name || '').toLowerCase().includes(q);
        const emailMatch = String(c.email || '').toLowerCase().includes(q);
        const phoneMatch = String(c.phone || '').toLowerCase().includes(q) ||
          (qDigits.length >= 3 && this.normalizePhone(c.phone).includes(qDigits));
        return nameMatch || emailMatch || phoneMatch;
      });
    }

    if (filters?.type === 'RECURRING') {
      filtered = filtered.filter((c: any) => Boolean(c.isRecurring));
    } else if (filters?.type === 'NEW') {
      filtered = filtered.filter((c: any) => !c.isRecurring);
    }

    if (filters?.tag && filters.tag !== 'ALL') {
      filtered = filtered.filter((c: any) =>
        Array.isArray(c.tags) && c.tags.some((t: string) => t.toLowerCase() === filters.tag!.toLowerCase())
      );
    }

    const page = Math.max(1, Number(filters?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(filters?.limit || 50)));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      availableTags: Array.from(tagSet),
    };
  },

  async createClient(tenantId: string, data: any) {
    const normalizedPhone = this.normalizePhone(data.phone);
    if (normalizedPhone.length < 8) {
      const err: any = new Error('Telefone inválido: informe pelo menos 8 dígitos numéricos.');
      err.statusCode = 400;
      throw err;
    }

    // Check duplicate phone within the same tenant
    const existingClients = await this.getClients(tenantId);
    const duplicate = existingClients.find((c: any) => this.normalizePhone(c.phone) === normalizedPhone);
    if (duplicate) {
      if (data.allowExistingReturn) {
        return { ...duplicate, alreadyExisted: true };
      }
      const err: any = new Error('Já existe uma cliente cadastrada com este telefone neste estabelecimento.');
      err.statusCode = 409;
      err.existingClient = duplicate;
      throw err;
    }

    const id = `cli-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const pool = getMySqlPool();

    if (pool) {
      try {
        await executeWithRetry(
          `INSERT INTO Client (id, tenantId, name, phone, email, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, tenantId, data.name.trim(), data.phone.trim(), data.email || null, data.notes || null, now, now]
        );
      } catch (e) {
        handleDbFallbackError('createClient', e);
      }
    }

    const newClient = {
      id,
      tenantId,
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email || '',
      notes: data.notes || '',
      preferences: data.preferences || data.notes || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      internalNotes: [],
      communicationConsent: data.communicationConsent || { whatsapp: true, sms: false, email: true },
      active: data.active !== undefined ? Boolean(data.active) : true,
      createdAt: now.toISOString(),
    };
    memoryStore.clients.push(newClient as any);
    return this.enrichClientRecord(newClient, memoryStore.appointments.filter(a => a.tenantId === tenantId));
  },

  async updateClient(tenantId: string, clientId: string, data: any, actor?: { id: string; name: string }) {
    const existingClients = await this.getClients(tenantId);
    const existing = existingClients.find((c: any) => c.id === clientId);
    if (!existing) {
      const err: any = new Error('Cliente não encontrada neste estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (data.phone) {
      const normalized = this.normalizePhone(data.phone);
      const duplicate = existingClients.find(
        (c: any) => c.id !== clientId && this.normalizePhone(c.phone) === normalized
      );
      if (duplicate) {
        const err: any = new Error('Já existe outra cliente cadastrada com este telefone neste estabelecimento.');
        err.statusCode = 409;
        err.existingClient = duplicate;
        throw err;
      }
    }

    const pool = getMySqlPool();
    if (pool) {
      try {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [k, v] of Object.entries(data)) {
          if (['name', 'phone', 'email', 'notes'].includes(k) && v !== undefined) {
            fields.push(`${k} = ?`);
            values.push(v);
          }
        }
        if (fields.length > 0) {
          values.push(clientId, tenantId);
          await pool.execute(`UPDATE Client SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ? AND tenantId = ?`, values);
        }
      } catch (e) {}
    }

    let memClient = memoryStore.clients.find(c => c.id === clientId && c.tenantId === tenantId) as any;
    if (!memClient) {
      memClient = { ...existing, tenantId };
      memoryStore.clients.push(memClient);
    }

    if (data.name !== undefined) memClient.name = data.name.trim();
    if (data.phone !== undefined) memClient.phone = data.phone.trim();
    if (data.email !== undefined) memClient.email = data.email || '';
    if (data.notes !== undefined) memClient.notes = data.notes || '';
    if (data.preferences !== undefined) memClient.preferences = data.preferences || '';
    if (data.tags !== undefined && Array.isArray(data.tags)) {
      memClient.tags = Array.from(new Set(data.tags.map((t: string) => t.trim()).filter(Boolean)));
    }
    if (data.communicationConsent !== undefined) {
      memClient.communicationConsent = {
        ...(memClient.communicationConsent || { whatsapp: true, sms: false, email: true }),
        ...data.communicationConsent,
        updatedAt: new Date().toISOString(),
      };
    }
    if (data.active !== undefined) {
      memClient.active = Boolean(data.active);
    }

    await this.recordAuditLog(tenantId, actor?.id || null, 'CLIENT_UPDATED', {
      clientId,
      updatedFields: Object.keys(data),
    });

    return this.enrichClientRecord(memClient, memoryStore.appointments.filter(a => a.tenantId === tenantId));
  },

  async addClientInternalNote(tenantId: string, clientId: string, noteData: { content: string; authorId: string; authorName: string }) {
    const existingClients = await this.getClients(tenantId);
    const existing = existingClients.find((c: any) => c.id === clientId);
    if (!existing) {
      const err: any = new Error('Cliente não encontrada neste estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    let memClient = memoryStore.clients.find(c => c.id === clientId && c.tenantId === tenantId) as any;
    if (!memClient) {
      memClient = { ...existing, tenantId };
      memoryStore.clients.push(memClient);
    }

    if (!Array.isArray(memClient.internalNotes)) {
      memClient.internalNotes = Array.isArray(existing.internalNotes) ? [...existing.internalNotes] : [];
    }

    const newNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      content: noteData.content.trim(),
      authorId: noteData.authorId,
      authorName: noteData.authorName,
      createdAt: new Date().toISOString(),
    };

    memClient.internalNotes.unshift(newNote);

    await this.recordAuditLog(tenantId, noteData.authorId, 'CLIENT_INTERNAL_NOTE_ADDED', {
      clientId,
      noteId: newNote.id,
    });

    return {
      note: newNote,
      client: this.enrichClientRecord(memClient, memoryStore.appointments.filter(a => a.tenantId === tenantId)),
    };
  },

  async getClientProfile(tenantId: string, clientId: string, options?: { hideInternalNotes?: boolean }) {
    const allClients = await this.getClients(tenantId, { hideInternalNotes: options?.hideInternalNotes });
    const client = allClients.find((c: any) => c.id === clientId);
    if (!client) {
      return null;
    }

    const allAppointments = await this.getAppointments(tenantId);
    const clientAppointments = allAppointments
      .filter((a: any) => a.clientId === clientId)
      .sort((a: any, b: any) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    const allPayments = await this.listPayments(tenantId);
    const clientAppIds = new Set(clientAppointments.map((a: any) => a.id));
    const clientPayments = allPayments.filter((p: any) => clientAppIds.has(p.appointmentId));

    // Reconciled financial calculation (Section 7):
    // Sum strictly APPROVED payments (or partially refunded ones net of refundedAmountCents).
    // Never sum PENDING/CREATED/REJECTED/CANCELLED/REFUNDED or double-count deposit + balance!
    const totalPaidCents = clientPayments.reduce((sum: number, p: any) => {
      if (p.status === 'APPROVED') {
        const net = Math.max(0, Number(p.amountCents || 0) - Number(p.refundedAmountCents || 0));
        return sum + net;
      }
      return sum;
    }, 0);

    const totalScheduledCents = clientAppointments
      .filter((a: any) => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(a.status))
      .reduce((sum: number, a: any) => sum + Number(a.snapshotPriceCents ?? a.totalAmountCents ?? 0), 0);

    const now = new Date();
    const completedApps = clientAppointments.filter((a: any) => a.status === 'COMPLETED');
    const cancelledApps = clientAppointments.filter((a: any) => a.status === 'CANCELLED');
    const noShowApps = clientAppointments.filter((a: any) => a.status === 'NO_SHOW');

    const pastCompletedOrConfirmed = clientAppointments
      .filter((a: any) => ['COMPLETED', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status) && new Date(a.dateTime) <= now)
      .sort((a: any, b: any) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    const futureActive = clientAppointments
      .filter((a: any) => ['CONFIRMED', 'PENDING', 'PENDING_PAYMENT', 'IN_PROGRESS'].includes(a.status) && new Date(a.dateTime) > now)
      .sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    return {
      client,
      appointments: clientAppointments,
      indicators: {
        totalCompleted: completedApps.length,
        totalCancelled: cancelledApps.length,
        totalNoShows: noShowApps.length,
        totalAppointments: clientAppointments.length,
        lastAppointmentDate: pastCompletedOrConfirmed[0]?.dateTime || completedApps[0]?.dateTime || null,
        nextAppointmentDate: futureActive[0]?.dateTime || null,
        totalPaidCents,
        totalPaidReais: totalPaidCents / 100,
        totalScheduledCents,
        isRecurring: completedApps.length >= 1 || clientAppointments.filter((a: any) => ['CONFIRMED', 'COMPLETED'].includes(a.status)).length > 1,
      },
    };
  },

  async getAppointments(tenantId: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        await executeWithRetry(
          `UPDATE Appointment SET status = 'EXPIRED' WHERE tenantId = ? AND status = 'PENDING_PAYMENT' AND (expiresAt < NOW() OR (expiresAt IS NULL AND createdAt < DATE_SUB(NOW(), INTERVAL 10 MINUTE)))`,
          [tenantId]
        );

        const [rows]: any = await queryWithRetry(
          `SELECT a.*,
                  c.name as clientName, c.phone as clientPhone, c.email as clientEmail,
                  p.name as profName, p.specialty as profSpecialty,
                  s.name as serviceName, s.durationMin as serviceDurationMin, s.priceCents as servPriceCents
           FROM Appointment a
           LEFT JOIN Client c ON c.id = a.clientId
           LEFT JOIN Professional p ON p.id = a.professionalId
           LEFT JOIN Service s ON s.id = a.serviceId
           WHERE a.tenantId = ?
           ORDER BY a.dateTime ASC`,
          [tenantId]
        );

        return rows.map((r: any) => {
          const memApp = memoryStore.appointments.find(a => a.id === r.id);
          const snapPrice = Number(r.snapshotPriceCents || r.totalAmountCents || Math.round(Number(r.totalAmount || 0) * 100));
          const snapDur = Number(r.snapshotDurationMin || r.serviceDurationMin || 60);
          return {
            ...r,
            status: memApp?.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : r.status,
            origin: r.origin || memApp?.origin || 'ONLINE',
            createdBy: r.createdBy || memApp?.createdBy || null,
            updatedBy: r.updatedBy || memApp?.updatedBy || null,
            startedAt: r.startedAt || memApp?.startedAt || null,
            completedAt: r.completedAt || memApp?.completedAt || null,
            noShowAt: r.noShowAt || memApp?.noShowAt || null,
            totalAmountCents: snapPrice,
            depositAmountCents: Number(r.depositAmountCents || 0),
            balanceAmountCents: Number(r.balanceAmountCents || 0),
            snapshotPriceCents: snapPrice,
            snapshotDurationMin: snapDur,
            snapshotCancellationHours: r.snapshotCancellationHours !== undefined ? r.snapshotCancellationHours : (memApp?.snapshotCancellationHours ?? null),
            snapshotPolicyText: r.snapshotPolicyText !== undefined ? r.snapshotPolicyText : (memApp?.snapshotPolicyText ?? null),
            snapshotPolicyVersion: r.snapshotPolicyVersion !== undefined ? r.snapshotPolicyVersion : (memApp?.snapshotPolicyVersion ?? null),
            policyAcceptedAt: r.policyAcceptedAt !== undefined ? r.policyAcceptedAt : (memApp?.policyAcceptedAt ?? null),
            rescheduledFromDateTime: r.rescheduledFromDateTime !== undefined ? r.rescheduledFromDateTime : (memApp?.rescheduledFromDateTime ?? null),
            rescheduledAt: r.rescheduledAt !== undefined ? r.rescheduledAt : (memApp?.rescheduledAt ?? null),
            rescheduleCount: Number(r.rescheduleCount ?? memApp?.rescheduleCount ?? 0),
            rescheduleHistory: r.rescheduleHistory ?? memApp?.rescheduleHistory ?? [],
            client: r.clientId ? { id: r.clientId, name: r.clientName, phone: r.clientPhone, email: r.clientEmail } : null,
            professional: r.professionalId ? { id: r.professionalId, name: r.profName, specialty: r.profSpecialty } : null,
            service: r.serviceId ? { id: r.serviceId, name: r.serviceName, durationMin: snapDur, priceCents: snapPrice } : null,
          };
        });
      } catch (e) {
        handleDbFallbackError('getAppointments', e);
      }
    }

    const now = new Date();
    memoryStore.appointments.forEach((app: any) => {
      if (app.status === 'PENDING_PAYMENT' && app.expiresAt && new Date(app.expiresAt) < now) {
        app.status = 'EXPIRED';
      }
    });

    return memoryStore.appointments
      .filter(app => app.tenantId === tenantId)
      .map(app => {
        const rawService = memoryStore.services.find(s => s.id === app.serviceId) || null;
        return {
          ...app,
          origin: app.origin || 'ONLINE',
          client: memoryStore.clients.find(c => c.id === app.clientId) || null,
          professional: memoryStore.professionals.find(p => p.id === app.professionalId) || null,
          service: rawService
            ? {
                ...rawService,
                // Preserve historical snapshot values on the appointment's service representation
                priceCents: Number(app.snapshotPriceCents ?? app.totalAmountCents ?? rawService.priceCents),
                durationMin: Number(app.snapshotDurationMin ?? rawService.durationMin),
              }
            : null,
        };
      });
  },

  getSaoPauloHourMinute(d: Date): { hour: number; minute: number; dayOfWeek: number; dateStr: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    }).formatToParts(d);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const hour = Number(map.hour === '24' ? '0' : map.hour);
    const minute = Number(map.minute || '0');
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = weekdayMap[map.weekday] ?? d.getUTCDay();
    const dateStr = `${map.year}-${map.month}-${map.day}`;
    return { hour, minute, dayOfWeek, dateStr };
  },

  async getAvailableSlots(
    tenantId: string,
    params: { serviceId: string; professionalId: string; date: string }
  ) {
    const business = await this.getBusiness(tenantId);
    const timezone = business?.timezone || 'America/Sao_Paulo';
    const openTime = business?.openTime || '08:00';
    const closeTime = business?.closeTime || '20:00';

    const service = memoryStore.services.find((s) => s.id === params.serviceId && s.tenantId === tenantId);
    if (!service || service.active === false) {
      const err: any = new Error('Serviço não encontrado ou inativo para este estabelecimento.');
      err.statusCode = 400;
      throw err;
    }

    const prof = memoryStore.professionals.find((p) => p.id === params.professionalId && p.tenantId === tenantId);
    if (!prof || prof.active === false) {
      const err: any = new Error('Profissional não encontrada ou inativa neste estabelecimento.');
      err.statusCode = 400;
      throw err;
    }

    const [openH] = openTime.split(':').map(Number);
    const [closeH] = closeTime.split(':').map(Number);
    const prepMin = Number(service.preparationMin || 0);
    const totalDurationMin =
      Number(service.durationMin || 60) +
      Number(service.bufferBeforeMin || 0) +
      Number(service.bufferAfterMin || 0);

    const now = new Date();
    const allApps = await this.getAppointments(tenantId);
    const activeApps = allApps.filter((a: any) => {
      if (a.tenantId !== tenantId || a.professionalId !== params.professionalId) return false;
      // Liberate schedule: Cancelled, Expired, or No-Show appointments never block the schedule
      if (!['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status)) return false;
      // Pending deposits that expired or timed out (>10 min) liberate the schedule
      if (a.status === 'PENDING_PAYMENT') {
        if (a.expiresAt && new Date(a.expiresAt) < now) return false;
        if (!a.expiresAt && a.createdAt && (now.getTime() - new Date(a.createdAt).getTime() > 10 * 60000)) return false;
      }
      return true;
    });

    const activeBlocks = memoryStore.timeBlocks.filter(
      (tb: any) => tb.tenantId === tenantId && (!tb.professionalId || tb.professionalId === params.professionalId)
    );

    const profWh = memoryStore.workingHours.filter((wh: any) => wh.professionalId === params.professionalId);

    const slots: Array<{
      time: string;
      dateTimeIso: string;
      available: boolean;
      reason: string | null;
    }> = [];

    for (let h = openH; h < closeH; h++) {
      const hh = String(h).padStart(2, '0');
      const timeLabel = `${hh}:00`;
      // Construct timestamp explicitly in America/Sao_Paulo (-03:00)
      const requestedStart = new Date(`${params.date}T${timeLabel}:00-03:00`);
      if (isNaN(requestedStart.getTime())) continue;

      const effectiveStart = new Date(requestedStart.getTime() + prepMin * 60000);
      const effectiveEnd = new Date(effectiveStart.getTime() + totalDurationMin * 60000);

      let available = true;
      let reason: string | null = null;

      // Check break window if workingHours configured for this day
      const spInfo = this.getSaoPauloHourMinute(requestedStart);
      const whForDay = profWh.find((w: any) => Number(w.dayOfWeek) === spInfo.dayOfWeek);
      if (whForDay && whForDay.breakStart && whForDay.breakEnd) {
        const [bsH, bsM] = String(whForDay.breakStart).split(':').map(Number);
        const [beH, beM] = String(whForDay.breakEnd).split(':').map(Number);
        const breakStartMs = new Date(`${params.date}T${String(bsH).padStart(2, '0')}:${String(bsM || 0).padStart(2, '0')}:00-03:00`).getTime();
        const breakEndMs = new Date(`${params.date}T${String(beH).padStart(2, '0')}:${String(beM || 0).padStart(2, '0')}:00-03:00`).getTime();
        if (effectiveStart.getTime() < breakEndMs && effectiveEnd.getTime() > breakStartMs) {
          available = false;
          reason = 'INTERVALO_PROFISSIONAL';
        }
      }

      // Check TimeBlocks
      if (available) {
        const blockConflict = activeBlocks.find((tb: any) => {
          const bStart = new Date(tb.startDate).getTime();
          const bEnd = new Date(tb.endDate).getTime();
          return effectiveStart.getTime() < bEnd && effectiveEnd.getTime() > bStart;
        });
        if (blockConflict) {
          available = false;
          reason = 'BLOQUEIO_AGENDA';
        }
      }

      // Check Appointments
      if (available) {
        const appConflict = activeApps.find((a: any) => {
          const aStart = new Date(a.dateTime).getTime();
          const aEnd = new Date(a.endDateTime || new Date(aStart + 60 * 60000)).getTime();
          return effectiveStart.getTime() < aEnd && effectiveEnd.getTime() > aStart;
        });
        if (appConflict) {
          available = false;
          reason = 'HORARIO_OCUPADO';
        }
      }

      slots.push({
        time: timeLabel,
        dateTimeIso: requestedStart.toISOString(),
        available,
        reason,
      });
    }

    return {
      tenantId,
      timezone,
      date: params.date,
      serviceId: params.serviceId,
      professionalId: params.professionalId,
      openTime,
      closeTime,
      slots,
      availableSlots: slots.filter((s) => s.available).map((s) => s.time),
      occupiedSlots: slots.filter((s) => !s.available).map((s) => ({ time: s.time, reason: s.reason })),
    };
  },

  async getSuggestedSlots(tenantId: string, professionalId: string, serviceId: string, requestedDateTime: Date): Promise<string[]> {
    const suggestions: string[] = [];
    const baseTime = requestedDateTime.getTime();
    const offsetsMinutes = [30, 60, -60, 90, 120, 150, 180, 240];
    const rawApps = await this.getAppointments(tenantId);
    const now = new Date();
    const allApps = rawApps.filter(
      (a: any) => {
        if (a.tenantId !== tenantId || a.professionalId !== professionalId) return false;
        if (!['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status)) return false;
        if (a.status === 'PENDING_PAYMENT') {
          if (a.expiresAt && new Date(a.expiresAt) < now) return false;
          if (!a.expiresAt && a.createdAt && (now.getTime() - new Date(a.createdAt).getTime() > 10 * 60000)) return false;
        }
        return true;
      }
    );
    const blocks = memoryStore.timeBlocks.filter(
      (tb: any) => tb.tenantId === tenantId && (!tb.professionalId || tb.professionalId === professionalId)
    );
    const service = memoryStore.services.find(s => s.id === serviceId);
    const durationMs = Number(service?.durationMin || 60) * 60000;

    for (const offset of offsetsMinutes) {
      const candidateStart = new Date(baseTime + offset * 60000);
      const candidateEnd = new Date(candidateStart.getTime() + durationMs);
      const spTime = this.getSaoPauloHourMinute(candidateStart);
      if (spTime.hour < 8 || spTime.hour >= 20) continue;

      const hasAppOverlap = allApps.some((a: any) => {
        const s = new Date(a.dateTime).getTime();
        const e = new Date(a.endDateTime).getTime();
        return candidateStart.getTime() < e && candidateEnd.getTime() > s;
      });
      const hasBlockOverlap = blocks.some((tb: any) => {
        const s = new Date(tb.startDate).getTime();
        const e = new Date(tb.endDate).getTime();
        return candidateStart.getTime() < e && candidateEnd.getTime() > s;
      });

      if (!hasAppOverlap && !hasBlockOverlap) {
        suggestions.push(candidateStart.toISOString());
        if (suggestions.length >= 3) break;
      }
    }
    return suggestions;
  },

  async createAppointment(tenantId: string, data: any) {
    saasService.ensureSaaSSeedData();
    const isCustomerOrOnline = Boolean(data.isCustomerBooking || (data.origin || 'ONLINE') === 'ONLINE');
    if (isCustomerOrOnline) {
      saasService.assertTenantPublicBookingAllowed(tenantId);
    } else {
      saasService.assertTenantOperationalWriteAllowed(tenantId);
    }

    const pool = getMySqlPool();
    let service: any = null;
    const business: any = await this.getBusiness(tenantId);
    const planCapabilities = saasService.getTenantCapabilities(tenantId);

    if (pool) {
      try {
        const [sRows]: any = await queryWithRetry(`SELECT * FROM Service WHERE id = ? AND tenantId = ? LIMIT 1`, [data.serviceId, tenantId]);
        if (sRows && sRows.length > 0) service = sRows[0];
      } catch (e) {}
    }

    if (!service) service = memoryStore.services.find(s => s.id === data.serviceId && s.tenantId === tenantId);
    if (!service) {
      const err: any = new Error('Serviço não encontrado para este estabelecimento');
      err.statusCode = 400;
      throw err;
    }
    if (service.active === false || service.active === 0) {
      const err: any = new Error('Não é possível criar agendamento para um serviço inativo.');
      err.statusCode = 400;
      throw err;
    }

    const prof = memoryStore.professionals.find(p => p.id === data.professionalId && p.tenantId === tenantId);
    if (prof && (prof.active === false || (prof as any).active === 0)) {
      const err: any = new Error('Não é possível criar agendamento para um profissional inativo.');
      err.statusCode = 400;
      throw err;
    }

    const startDateTime = new Date(new Date(data.dateTime).getTime() + Number(service.preparationMin || 0) * 60000);
    const totalDurationMin = Number(service.durationMin) + Number(service.bufferAfterMin || 0) + Number(service.bufferBeforeMin || 0);
    const endDateTime = new Date(startDateTime.getTime() + totalDurationMin * 60000);

    // Check TimeBlocks for this tenant/professional (Section 11 & 13)
    const activeBlocks = memoryStore.timeBlocks.filter(
      (tb: any) => tb.tenantId === tenantId && (!tb.professionalId || tb.professionalId === data.professionalId)
    );
    const overlappingBlock = activeBlocks.find((tb: any) => {
      const bStart = new Date(tb.startDate).getTime();
      const bEnd = new Date(tb.endDate).getTime();
      return startDateTime.getTime() < bEnd && endDateTime.getTime() > bStart;
    });
    if (overlappingBlock) {
      const suggestedSlots = await this.getSuggestedSlots(tenantId, data.professionalId, data.serviceId, startDateTime);
      const blockErr: any = new Error(
        `Horário indisponível: existe um bloqueio de agenda (${overlappingBlock.reason || overlappingBlock.type}) neste período.`
      );
      blockErr.statusCode = 409;
      blockErr.suggestedSlots = suggestedSlots;
      throw blockErr;
    }

    const officialServicePriceCents = Number(service.priceCents || Math.round(Number(service.price || 0) * 100));
    const priceCents =
      data._serverCalculatedPriceCents !== undefined && Number.isFinite(Number(data._serverCalculatedPriceCents))
        ? Math.max(0, Math.round(Number(data._serverCalculatedPriceCents)))
        : officialServicePriceCents;

    const requireDeposit = planCapabilities.allowDeposit
      ? business?.requireDeposit !== undefined
        ? Boolean(business.requireDeposit)
        : true
      : false;
    const configuredDepositPercent =
      service.depositPercent !== undefined && service.depositPercent !== null
        ? Number(service.depositPercent)
        : Number(business?.defaultDeposit ?? 30);

    const depositPercent = requireDeposit ? Math.max(0, Math.min(100, configuredDepositPercent)) : 0;
    const depositAmountCents =
      requireDeposit && depositPercent > 0 ? Math.round((priceCents * depositPercent) / 100) : 0;
    const balanceAmountCents = Math.max(0, priceCents - depositAmountCents);

    const origin = data.origin || 'ONLINE';
    const isOnlineCustomerBooking = Boolean(data.isCustomerBooking || origin === 'ONLINE');

    const allowedInitialStatuses = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'];
    let initialStatus: string;
    if (!requireDeposit || depositAmountCents === 0) {
      // No-deposit policy: confirm immediately without temporary payment lock
      if (isOnlineCustomerBooking || !data.status || data.status === 'PENDING_PAYMENT') {
        initialStatus = 'CONFIRMED';
      } else {
        initialStatus = allowedInitialStatuses.includes(data.status) ? data.status : 'CONFIRMED';
      }
    } else {
      // Mandatory deposit policy: customer online booking must start as PENDING_PAYMENT
      if (data.isCustomerBooking) {
        initialStatus = 'PENDING_PAYMENT';
      } else {
        initialStatus = allowedInitialStatuses.includes(data.status) ? data.status : 'PENDING_PAYMENT';
      }
    }

    validateEnumValueStrict('Appointment.status', initialStatus, VALID_APPOINTMENT_STATUSES);

    const expiresAt =
      initialStatus === 'PENDING_PAYMENT' ? new Date(Date.now() + 10 * 60000) : null;
    const id = `app-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();

    // Historical cancellation policy snapshot at the time of booking
    const isLegacyNoPolicy = Boolean(data.legacyNoPolicy);
    const snapshotCancellationHours = isLegacyNoPolicy ? null : Number(business?.cancellationHoursLimit ?? 6);
    const snapshotPolicyText = isLegacyNoPolicy ? null : (business?.cancellationPolicyText || DEFAULT_CANCELLATION_POLICY_TEXT);
    const snapshotPolicyVersion = isLegacyNoPolicy ? null : Number(business?.cancellationPolicyVersion ?? 1);
    const policyAcceptedAt = isLegacyNoPolicy ? null : now.toISOString();

    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();

        // Expire outdated pending appointments
        await conn.execute(
          `UPDATE Appointment SET status = 'EXPIRED' WHERE tenantId = ? AND status = 'PENDING_PAYMENT' AND (expiresAt < NOW() OR (expiresAt IS NULL AND createdAt < DATE_SUB(NOW(), INTERVAL 10 MINUTE)))`,
          [tenantId]
        );

        // Check concurrency conflict with row lock
        const [conflicts]: any = await conn.query(
          `SELECT id FROM Appointment
           WHERE tenantId = ? AND professionalId = ?
             AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'PENDING')
             AND ? < endDateTime AND ? > dateTime
           FOR UPDATE`,
          [tenantId, data.professionalId, startDateTime, endDateTime]
        );

        if (conflicts && conflicts.length > 0) {
          await conn.rollback();
          const suggestedSlots = await this.getSuggestedSlots(tenantId, data.professionalId, data.serviceId, startDateTime);
          const conflictErr: any = new Error('Horário indisponível: conflito com agendamento existente.');
          conflictErr.statusCode = 409;
          conflictErr.suggestedSlots = suggestedSlots;
          throw conflictErr;
        }

        const dbStatus = validateEnumValueStrict(
          'Appointment.status',
          initialStatus,
          VALID_APPOINTMENT_STATUSES
        );
        await conn.execute(
          `INSERT INTO Appointment (
             id, tenantId, clientId, professionalId, serviceId, dateTime, endDateTime,
             status, origin, expiresAt, totalAmount, totalAmountCents, depositAmountCents, balanceAmountCents,
             snapshotPriceCents, snapshotDurationMin, snapshotDepositPercent, snapshotDepositCents, snapshotBalanceCents,
             snapshotCancellationHours, snapshotPolicyText, snapshotPolicyVersion, policyAcceptedAt,
             createdBy, updatedBy, notes, createdAt, updatedAt
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, tenantId, data.clientId, data.professionalId, data.serviceId,
            startDateTime, endDateTime, dbStatus, origin, expiresAt, priceCents / 100,
            priceCents, depositAmountCents, balanceAmountCents,
            priceCents, Number(service.durationMin), depositPercent, depositAmountCents, balanceAmountCents,
            snapshotCancellationHours, snapshotPolicyText, snapshotPolicyVersion,
            policyAcceptedAt ? new Date(policyAcceptedAt) : null,
            data.createdBy || null, data.createdBy || null,
            data.notes || null, now, now
          ]
        );

        await conn.commit();
      } catch (err: any) {
        if (conn) await conn.rollback();
        if (err.message?.includes('Horário indisponível')) throw err;
        handleDbFallbackError('createAppointment', err);
      } finally {
        if (conn) conn.release();
      }
    }

    // Memory concurrency check
    const overlapping = memoryStore.appointments.find((app: any) => {
      if (app.professionalId !== data.professionalId) return false;
      if (!['PENDING_PAYMENT', 'CONFIRMED', 'PENDING', 'IN_PROGRESS'].includes(app.status)) return false;
      if (app.status === 'PENDING_PAYMENT') {
        if (app.expiresAt && new Date(app.expiresAt) < now) return false;
        if (!app.expiresAt && app.createdAt && (now.getTime() - new Date(app.createdAt).getTime() > 10 * 60000)) return false;
      }
      const appStart = new Date(app.dateTime).getTime();
      const appEnd = new Date(app.endDateTime).getTime();
      return startDateTime.getTime() < appEnd && endDateTime.getTime() > appStart;
    });

    if (overlapping && !pool) {
      const suggestedSlots = await this.getSuggestedSlots(tenantId, data.professionalId, data.serviceId, startDateTime);
      const conflictErr: any = new Error('Horário indisponível: conflito com agendamento existente.');
      conflictErr.statusCode = 409;
      conflictErr.suggestedSlots = suggestedSlots;
      throw conflictErr;
    }

    const newApp = {
      id,
      tenantId,
      clientId: data.clientId,
      professionalId: data.professionalId,
      serviceId: data.serviceId,
      dateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      status: initialStatus,
      origin,
      createdBy: data.createdBy || null,
      updatedBy: data.createdBy || null,
      startedAt: null,
      completedAt: null,
      noShowAt: null,
      expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
      totalAmountCents: priceCents,
      depositAmountCents,
      balanceAmountCents,
      snapshotPriceCents: priceCents,
      snapshotDurationMin: Number(service.durationMin),
      snapshotDepositPercent: depositPercent,
      snapshotDepositCents: depositAmountCents,
      snapshotBalanceCents: balanceAmountCents,
      snapshotCancellationHours,
      snapshotPolicyText,
      snapshotPolicyVersion,
      policyAcceptedAt,
      rescheduledFromDateTime: null,
      rescheduledAt: null,
      rescheduleCount: 0,
      rescheduleHistory: [],
      notes: data.notes || '',
      createdAt: now.toISOString(),
    };

    memoryStore.appointments.push(newApp);
    return {
      ...newApp,
      client: memoryStore.clients.find(c => c.id === newApp.clientId) || null,
      professional: memoryStore.professionals.find(p => p.id === newApp.professionalId) || null,
      service: memoryStore.services.find(s => s.id === newApp.serviceId) || null,
    };
  },

  async updateAppointmentStatus(tenantId: string, id: string, status: any, actorId?: string | null) {
    validateEnumValueStrict('Appointment.status', status, VALID_APPOINTMENT_STATUSES);
    const existing = await this.getAppointmentById(tenantId, id);
    if (!existing) {
      const err: any = new Error('Agendamento não encontrado para este estabelecimento');
      err.statusCode = 404;
      throw err;
    }

    if (['CANCELLED', 'EXPIRED'].includes(existing.status) && ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'].includes(status)) {
      const err: any = new Error(`Transição de estado inválida: não é possível alterar um agendamento ${existing.status} para ${status}.`);
      err.statusCode = 400;
      throw err;
    }

    const now = new Date();
    const pool = getMySqlPool();
    if (pool) {
      try {
        const startedAtCol = status === 'IN_PROGRESS' ? now : existing.startedAt || null;
        const completedAtCol = status === 'COMPLETED' ? now : existing.completedAt || null;
        const noShowAtCol = status === 'NO_SHOW' ? now : existing.noShowAt || null;
        await pool.execute(
          `UPDATE Appointment SET status = ?, updatedBy = ?, startedAt = ?, completedAt = ?, noShowAt = ?, updatedAt = NOW() WHERE id = ? AND tenantId = ?`,
          [status, actorId || null, startedAtCol, completedAtCol, noShowAtCol, id, tenantId]
        );
      } catch (e) {
        handleDbFallbackError('updateAppointmentStatus', e);
      }
    }

    const app = memoryStore.appointments.find(a => a.id === id && a.tenantId === tenantId);
    if (app) {
      const previousStatus = app.status;
      app.status = status;
      app.updatedBy = actorId || null;
      if (status === 'IN_PROGRESS') app.startedAt = now.toISOString();
      if (status === 'COMPLETED') app.completedAt = now.toISOString();
      if (status === 'NO_SHOW') app.noShowAt = now.toISOString();

      await this.recordAuditLog(tenantId, actorId || null, 'APPOINTMENT_STATUS_UPDATED', {
        appointmentId: id,
        fromStatus: previousStatus,
        toStatus: status,
      });

      return {
        ...app,
        client: memoryStore.clients.find(c => c.id === app.clientId) || null,
        professional: memoryStore.professionals.find(p => p.id === app.professionalId) || null,
        service: memoryStore.services.find(s => s.id === app.serviceId) || null,
      };
    }
    return { id, status, updatedBy: actorId || null };
  },

  async updateAppointmentDetails(tenantId: string, id: string, data: {
    dateTime?: string;
    professionalId?: string;
    notes?: string | null;
    reason?: string;
    updatedBy?: string | null;
  }) {
    const existing = await this.getAppointmentById(tenantId, id);
    if (!existing) {
      const err: any = new Error('Agendamento não encontrado para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(existing.status)) {
      const err: any = new Error(`Não é possível reagendar ou alterar profissional de um agendamento com status ${existing.status}.`);
      err.statusCode = 400;
      throw err;
    }

    const targetProfessionalId = data.professionalId || existing.professionalId;
    const prof = memoryStore.professionals.find(p => p.id === targetProfessionalId && p.tenantId === tenantId);
    if (prof && prof.active === false) {
      const err: any = new Error('Não é possível transferir o atendimento para uma profissional inativa.');
      err.statusCode = 400;
      throw err;
    }

    const durationMin = Number(existing.snapshotDurationMin || existing.service?.durationMin || 60);
    const targetStart = data.dateTime ? new Date(data.dateTime) : new Date(existing.dateTime);
    const targetEnd = new Date(targetStart.getTime() + durationMin * 60000);

    // Check TimeBlock conflicts
    const activeBlocks = memoryStore.timeBlocks.filter(
      (tb: any) => tb.tenantId === tenantId && (!tb.professionalId || tb.professionalId === targetProfessionalId)
    );
    const overlappingBlock = activeBlocks.find((tb: any) => {
      const bStart = new Date(tb.startDate).getTime();
      const bEnd = new Date(tb.endDate).getTime();
      return targetStart.getTime() < bEnd && targetEnd.getTime() > bStart;
    });
    if (overlappingBlock) {
      const err: any = new Error('Horário indisponível: existe um bloqueio de agenda neste período para a profissional selecionada.');
      err.statusCode = 409;
      throw err;
    }

    // Check overlapping appointments
    const allApps = await this.getAppointments(tenantId);
    const conflict = allApps.find((a: any) => {
      if (a.id === id) return false;
      if (a.professionalId !== targetProfessionalId) return false;
      if (!['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status)) return false;
      if (a.status === 'PENDING_PAYMENT') {
        const now = new Date();
        if (a.expiresAt && new Date(a.expiresAt) < now) return false;
        if (!a.expiresAt && a.createdAt && (now.getTime() - new Date(a.createdAt).getTime() > 10 * 60000)) return false;
      }
      const aStart = new Date(a.dateTime).getTime();
      const aEnd = new Date(a.endDateTime || new Date(aStart + 60 * 60000)).getTime();
      return targetStart.getTime() < aEnd && targetEnd.getTime() > aStart;
    });

    if (conflict) {
      const suggestedSlots = await this.getSuggestedSlots(tenantId, targetProfessionalId, existing.serviceId, targetStart);
      const err: any = new Error('Horário indisponível: conflito com outro agendamento ativo.');
      err.statusCode = 409;
      err.suggestedSlots = suggestedSlots;
      throw err;
    }

    const now = new Date();
    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `UPDATE Appointment SET dateTime = ?, endDateTime = ?, professionalId = ?, notes = ?, updatedAt = NOW() WHERE id = ? AND tenantId = ?`,
          [targetStart, targetEnd, targetProfessionalId, data.notes !== undefined ? data.notes : existing.notes, id, tenantId]
        );
      } catch (e) {}
    }

    let memApp = memoryStore.appointments.find(a => a.id === id && a.tenantId === tenantId);
    if (!memApp) {
      memApp = { ...existing, tenantId };
      memoryStore.appointments.push(memApp);
    }

    if (data.dateTime && data.dateTime !== existing.dateTime) {
      memApp.rescheduledFromDateTime = existing.dateTime;
      memApp.rescheduledAt = now.toISOString();
      memApp.rescheduleCount = Number(memApp.rescheduleCount || 0) + 1;
      const history = Array.isArray(memApp.rescheduleHistory) ? [...memApp.rescheduleHistory] : [];
      history.push({
        fromDateTime: existing.dateTime,
        toDateTime: targetStart.toISOString(),
        fromProfessionalId: existing.professionalId,
        toProfessionalId: targetProfessionalId,
        actor: data.updatedBy || 'STAFF',
        reason: data.reason || 'Alteração pelo painel administrativo',
        timestamp: now.toISOString(),
      });
      memApp.rescheduleHistory = history;
    }

    memApp.dateTime = targetStart.toISOString();
    memApp.endDateTime = targetEnd.toISOString();
    memApp.professionalId = targetProfessionalId;
    if (data.notes !== undefined) memApp.notes = data.notes || '';
    memApp.updatedBy = data.updatedBy || null;

    await this.recordAuditLog(tenantId, data.updatedBy || null, 'APPOINTMENT_UPDATED_ADMIN', {
      appointmentId: id,
      fromDateTime: existing.dateTime,
      toDateTime: memApp.dateTime,
      fromProfessionalId: existing.professionalId,
      toProfessionalId: targetProfessionalId,
      reason: data.reason || '',
    });

    return this.getAppointmentById(tenantId, id);
  },

  async getAppointmentById(tenantId: string, id: string) {
    const memApp = memoryStore.appointments.find(a => a.id === id && a.tenantId === tenantId);
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await queryWithRetry(
          `SELECT a.*,
                  c.name as clientName, c.phone as clientPhone, c.email as clientEmail,
                  p.name as profName, p.specialty as profSpecialty,
                  s.name as serviceName, s.durationMin as serviceDurationMin, s.priceCents as servPriceCents
           FROM Appointment a
           LEFT JOIN Client c ON c.id = a.clientId
           LEFT JOIN Professional p ON p.id = a.professionalId
           LEFT JOIN Service s ON s.id = a.serviceId
           WHERE a.id = ? AND a.tenantId = ? LIMIT 1`,
          [id, tenantId]
        );
        if (rows && rows.length > 0) {
          const r = rows[0];
          const snapPrice = Number(r.snapshotPriceCents || r.totalAmountCents || Math.round(Number(r.totalAmount || 0) * 100));
          const snapDur = Number(r.snapshotDurationMin || r.serviceDurationMin || 60);
          return {
            ...r,
            status: memApp?.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : r.status,
            origin: r.origin || memApp?.origin || 'ONLINE',
            createdBy: r.createdBy || memApp?.createdBy || null,
            updatedBy: r.updatedBy || memApp?.updatedBy || null,
            startedAt: r.startedAt || memApp?.startedAt || null,
            completedAt: r.completedAt || memApp?.completedAt || null,
            noShowAt: r.noShowAt || memApp?.noShowAt || null,
            totalAmountCents: snapPrice,
            depositAmountCents: Number(r.depositAmountCents || 0),
            balanceAmountCents: Number(r.balanceAmountCents || 0),
            snapshotPriceCents: snapPrice,
            snapshotDurationMin: snapDur,
            snapshotCancellationHours: r.snapshotCancellationHours !== undefined ? r.snapshotCancellationHours : (memApp?.snapshotCancellationHours ?? null),
            snapshotPolicyText: r.snapshotPolicyText !== undefined ? r.snapshotPolicyText : (memApp?.snapshotPolicyText ?? null),
            snapshotPolicyVersion: r.snapshotPolicyVersion !== undefined ? r.snapshotPolicyVersion : (memApp?.snapshotPolicyVersion ?? null),
            policyAcceptedAt: r.policyAcceptedAt !== undefined ? r.policyAcceptedAt : (memApp?.policyAcceptedAt ?? null),
            rescheduledFromDateTime: r.rescheduledFromDateTime !== undefined ? r.rescheduledFromDateTime : (memApp?.rescheduledFromDateTime ?? null),
            rescheduledAt: r.rescheduledAt !== undefined ? r.rescheduledAt : (memApp?.rescheduledAt ?? null),
            rescheduleCount: Number(r.rescheduleCount ?? memApp?.rescheduleCount ?? 0),
            rescheduleHistory: r.rescheduleHistory ?? memApp?.rescheduleHistory ?? [],
            client: r.clientId ? { id: r.clientId, name: r.clientName, phone: r.clientPhone, email: r.clientEmail } : null,
            professional: r.professionalId ? { id: r.professionalId, name: r.profName, specialty: r.profSpecialty } : null,
            service: r.serviceId ? { id: r.serviceId, name: r.serviceName, durationMin: snapDur, priceCents: snapPrice } : null,
          };
        }
      } catch (e) {}
    }

    if (!memApp) return null;
    const rawService = memoryStore.services.find(s => s.id === memApp.serviceId) || null;
    return {
      ...memApp,
      origin: memApp.origin || 'ONLINE',
      client: memoryStore.clients.find(c => c.id === memApp.clientId) || null,
      professional: memoryStore.professionals.find(p => p.id === memApp.professionalId) || null,
      service: rawService
        ? {
            ...rawService,
            priceCents: Number(memApp.snapshotPriceCents ?? memApp.totalAmountCents ?? rawService.priceCents),
            durationMin: Number(memApp.snapshotDurationMin ?? rawService.durationMin),
          }
        : null,
    };
  },

  async createPayment(data: any) {
    const id = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const pool = getMySqlPool();

    if (pool) {
      try {
        await executeWithRetry(
          `INSERT INTO Payment (
             id, tenantId, appointmentId, provider, providerPaymentId, externalReference,
             idempotencyKey, amountCents, currency, status, paymentMethod, qrCode, qrCodeBase64,
             ticketUrl, expiresAt, rawResponse, createdAt, updatedAt
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            data.tenantId,
            data.appointmentId,
            data.provider || 'MERCADO_PAGO',
            data.providerPaymentId || null,
            data.externalReference,
            data.idempotencyKey,
            data.amountCents,
            data.currency || 'BRL',
            data.status || 'PENDING',
            data.paymentMethod || 'PIX',
            data.qrCode || null,
            data.qrCodeBase64 || null,
            data.ticketUrl || null,
            data.expiresAt ? new Date(data.expiresAt) : null,
            data.rawResponse ? JSON.stringify(data.rawResponse) : null,
            now,
            now,
          ]
        );
      } catch (e) {
        handleDbFallbackError('createPayment', e);
      }
    }

    const payment = {
      id,
      tenantId: data.tenantId,
      appointmentId: data.appointmentId,
      provider: data.provider || 'MERCADO_PAGO',
      providerPaymentId: data.providerPaymentId || null,
      externalReference: data.externalReference,
      idempotencyKey: data.idempotencyKey,
      amountCents: data.amountCents,
      currency: data.currency || 'BRL',
      status: data.status || 'PENDING',
      paymentMethod: data.paymentMethod || 'PIX',
      qrCode: data.qrCode || null,
      qrCodeBase64: data.qrCodeBase64 || null,
      ticketUrl: data.ticketUrl || null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
      approvedAt: null,
      rawResponse: data.rawResponse || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    memoryStore.payments.push(payment);
    return payment;
  },

  async getPaymentById(tenantId: string, id: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await pool.query(
          `SELECT * FROM Payment WHERE id = ? AND tenantId = ? LIMIT 1`,
          [id, tenantId]
        );
        if (rows && rows.length > 0) {
          const pay = rows[0];
          const appointment = await this.getAppointmentById(tenantId, pay.appointmentId);
          return { ...pay, appointment };
        }
      } catch (e) {}
    }
    const pay = memoryStore.payments.find((p: any) => p.id === id && p.tenantId === tenantId);
    if (!pay) return null;
    const appointment = memoryStore.appointments.find((a: any) => a.id === pay.appointmentId) || null;
    return {
      ...pay,
      appointment: appointment ? {
        ...appointment,
        client: memoryStore.clients.find(c => c.id === appointment.clientId) || null,
        professional: memoryStore.professionals.find(p => p.id === appointment.professionalId) || null,
        service: memoryStore.services.find(s => s.id === appointment.serviceId) || null,
      } : null,
    };
  },

  async getPaymentByAppointmentId(tenantId: string, appointmentId: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await pool.query(
          `SELECT * FROM Payment WHERE appointmentId = ? AND tenantId = ? ORDER BY createdAt DESC LIMIT 1`,
          [appointmentId, tenantId]
        );
        if (rows && rows.length > 0) return rows[0];
      } catch (e) {}
    }
    const payments = memoryStore.payments.filter((p: any) => p.appointmentId === appointmentId && p.tenantId === tenantId);
    return payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
  },

  async getPaymentByProviderId(providerPaymentId: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await pool.query(
          `SELECT * FROM Payment WHERE providerPaymentId = ? LIMIT 1`,
          [providerPaymentId]
        );
        if (rows && rows.length > 0) {
          const pay = rows[0];
          const appointment = await this.getAppointmentById(pay.tenantId, pay.appointmentId);
          return { ...pay, appointment };
        }
      } catch (e) {}
    }
    const pay = memoryStore.payments.find((p: any) => p.providerPaymentId === providerPaymentId);
    if (!pay) return null;
    return {
      ...pay,
      appointment: memoryStore.appointments.find((a: any) => a.id === pay.appointmentId) || null,
    };
  },

  async getPaymentByExternalReference(externalReference: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await pool.query(
          `SELECT * FROM Payment WHERE externalReference = ? LIMIT 1`,
          [externalReference]
        );
        if (rows && rows.length > 0) {
          const pay = rows[0];
          const appointment = await this.getAppointmentById(pay.tenantId, pay.appointmentId);
          return { ...pay, appointment };
        }
      } catch (e) {}
    }
    const pay = memoryStore.payments.find((p: any) => p.externalReference === externalReference);
    if (!pay) return null;
    return {
      ...pay,
      appointment: memoryStore.appointments.find((a: any) => a.id === pay.appointmentId) || null,
    };
  },

  async updatePayment(id: string, data: any) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, val] of Object.entries(data)) {
          if (['status', 'providerPaymentId', 'approvedAt', 'rawResponse'].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(key === 'rawResponse' && typeof val === 'object' ? JSON.stringify(val) : val);
          }
        }
        if (fields.length > 0) {
          values.push(id);
          await pool.execute(`UPDATE Payment SET ${fields.join(', ')}, updatedAt = NOW() WHERE id = ?`, values);
        }
      } catch (e) {}
    }
    const index = memoryStore.payments.findIndex((p: any) => p.id === id);
    if (index >= 0) {
      memoryStore.payments[index] = {
        ...memoryStore.payments[index],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      return memoryStore.payments[index];
    }
    return null;
  },

  async listPayments(tenantId: string, filters?: { status?: string; startDate?: string; endDate?: string; clientId?: string }) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        let sql = `
          SELECT p.*,
                 a.dateTime as appointmentDateTime, a.status as appointmentStatus,
                 c.name as clientName, pr.name as profName, s.name as serviceName
          FROM Payment p
          LEFT JOIN Appointment a ON a.id = p.appointmentId
          LEFT JOIN Client c ON c.id = a.clientId
          LEFT JOIN Professional pr ON pr.id = a.professionalId
          LEFT JOIN Service s ON s.id = a.serviceId
          WHERE p.tenantId = ?
        `;
        const params: any[] = [tenantId];
        if (filters?.status && filters.status !== 'ALL') {
          sql += ` AND p.status = ?`;
          params.push(filters.status);
        }
        if (filters?.startDate) {
          sql += ` AND p.createdAt >= ?`;
          params.push(new Date(filters.startDate));
        }
        if (filters?.endDate) {
          sql += ` AND p.createdAt <= ?`;
          params.push(new Date(filters.endDate));
        }
        sql += ` ORDER BY p.createdAt DESC`;

        const [rows]: any = await queryWithRetry(sql, params);
        return rows.map((r: any) => ({
          ...r,
          appointment: r.appointmentId ? {
            id: r.appointmentId,
            dateTime: r.appointmentDateTime,
            status: r.appointmentStatus,
            client: { name: r.clientName },
            professional: { name: r.profName },
            service: { name: r.serviceName },
          } : null,
        }));
      } catch (e) {
        handleDbFallbackError('listPayments', e);
      }
    }

    let result = memoryStore.payments.filter((p: any) => p.tenantId === tenantId);
    if (filters?.status && filters.status !== 'ALL') {
      result = result.filter((p: any) => p.status === filters.status);
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate).getTime();
      result = result.filter((p: any) => new Date(p.createdAt).getTime() >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate).getTime();
      result = result.filter((p: any) => new Date(p.createdAt).getTime() <= end);
    }

    return result.map((p: any) => {
      const app = memoryStore.appointments.find((a: any) => a.id === p.appointmentId);
      return {
        ...p,
        appointment: app ? {
          ...app,
          client: memoryStore.clients.find(c => c.id === app.clientId) || null,
          professional: memoryStore.professionals.find(p => p.id === app.professionalId) || null,
          service: memoryStore.services.find(s => s.id === app.serviceId) || null,
        } : null,
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async createWebhookEvent(data: {
    tenantId?: string;
    provider?: string;
    providerEventId?: string;
    resourceId?: string;
    eventType: string;
    payload?: any;
    processingStatus?: string;
  }) {
    const id = `wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const pool = getMySqlPool();

    if (pool) {
      try {
        await pool.execute(
          `INSERT INTO WebhookEvent (id, tenantId, provider, providerEventId, resourceId, eventType, payload, processingStatus, attempts, receivedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            id,
            data.tenantId || null,
            data.provider || 'MERCADO_PAGO',
            data.providerEventId || null,
            data.resourceId || null,
            data.eventType,
            data.payload ? JSON.stringify(data.payload) : null,
            data.processingStatus || 'PENDING',
            now,
          ]
        );
      } catch (e) {}
    }

    const event = {
      id,
      tenantId: data.tenantId || null,
      provider: data.provider || 'MERCADO_PAGO',
      providerEventId: data.providerEventId || null,
      resourceId: data.resourceId || null,
      eventType: data.eventType,
      payload: data.payload || null,
      processingStatus: data.processingStatus || 'PENDING',
      attempts: 1,
      receivedAt: now.toISOString(),
      processedAt: null,
      lastError: null,
    };
    memoryStore.webhookEvents.push(event);
    return event;
  },

  async getWebhookEventByProviderEventId(provider: string, providerEventId: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await pool.query(
          `SELECT * FROM WebhookEvent WHERE provider = ? AND providerEventId = ? LIMIT 1`,
          [provider, providerEventId]
        );
        if (rows && rows.length > 0) return rows[0];
      } catch (e) {}
    }
    return memoryStore.webhookEvents.find((w: any) => w.provider === provider && w.providerEventId === providerEventId) || null;
  },

  async updateWebhookEvent(id: string, data: any) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        const fields: string[] = [];
        const values: any[] = [];
        for (const [key, val] of Object.entries(data)) {
          fields.push(`${key} = ?`);
          const serialized = typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
          values.push(key === 'processedAt' && val ? new Date(val as any) : serialized);
        }
        if (fields.length > 0) {
          values.push(id);
          await pool.execute(`UPDATE WebhookEvent SET ${fields.join(', ')} WHERE id = ?`, values);
        }
      } catch (e) {}
    }
    const index = memoryStore.webhookEvents.findIndex((w: any) => w.id === id);
    if (index >= 0) {
      memoryStore.webhookEvents[index] = { ...memoryStore.webhookEvents[index], ...data };
      return memoryStore.webhookEvents[index];
    }
    return null;
  },

  async confirmAppointmentPayment(params: {
    tenantId: string;
    appointmentId: string;
    paymentId?: string;
    providerPaymentId?: string;
    approvedAt?: Date;
    rawResponse?: any;
    actor?: string;
  }) {
    const { tenantId, appointmentId, paymentId, providerPaymentId, approvedAt, rawResponse, actor } = params;
    const pool = getMySqlPool();

    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();

        const [appRows]: any = await conn.query(
          `SELECT * FROM Appointment WHERE id = ? AND tenantId = ? FOR UPDATE`,
          [appointmentId, tenantId]
        );

        if (!appRows || appRows.length === 0) {
          await conn.rollback();
          throw new Error('Agendamento não encontrado para esta empresa');
        }

        const appointment = appRows[0];

        if (appointment.status === 'CONFIRMED') {
          if (paymentId) {
            await conn.execute(
              `UPDATE Payment SET status = 'APPROVED', approvedAt = ? WHERE id = ?`,
              [approvedAt || new Date(), paymentId]
            );
          }
          await conn.commit();
          const fullApp = await this.getAppointmentById(tenantId, appointmentId);
          return { appointment: fullApp, alreadyConfirmed: true };
        }

        if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
          await conn.rollback();
          throw new Error(`Não é possível confirmar agendamento com status ${appointment.status}`);
        }

        const [conflicts]: any = await conn.query(
          `SELECT id FROM Appointment
           WHERE tenantId = ? AND professionalId = ? AND status = 'CONFIRMED' AND id != ?
             AND ? < endDateTime AND ? > dateTime`,
          [tenantId, appointment.professionalId, appointment.id, appointment.dateTime, appointment.endDateTime]
        );

        if (conflicts && conflicts.length > 0) {
          await conn.rollback();
          throw new Error('Conflito de agendamento: horário já concedido a outra reserva confirmada.');
        }

        await conn.execute(
          `UPDATE Appointment SET status = 'CONFIRMED', updatedAt = NOW() WHERE id = ?`,
          [appointment.id]
        );

        if (paymentId) {
          await conn.execute(
            `UPDATE Payment SET status = 'APPROVED', providerPaymentId = COALESCE(?, providerPaymentId), approvedAt = ?, rawResponse = COALESCE(?, rawResponse), updatedAt = NOW() WHERE id = ?`,
            [providerPaymentId || null, approvedAt || new Date(), rawResponse ? JSON.stringify(rawResponse) : null, paymentId]
          );
        } else {
          await conn.execute(
            `UPDATE Payment SET status = 'APPROVED', providerPaymentId = COALESCE(?, providerPaymentId), approvedAt = ?, rawResponse = COALESCE(?, rawResponse), updatedAt = NOW() WHERE appointmentId = ? AND tenantId = ?`,
            [providerPaymentId || null, approvedAt || new Date(), rawResponse ? JSON.stringify(rawResponse) : null, appointment.id, tenantId]
          );
        }

        await conn.execute(
          `INSERT INTO AuditLog (id, tenantId, action, details, createdAt)
           VALUES (?, ?, 'APPOINTMENT_CONFIRMED_PIX', ?, NOW())`,
          [
            `audit-${Date.now()}`,
            tenantId,
            JSON.stringify({ appointmentId: appointment.id, paymentId, providerPaymentId, actor: actor || 'WEBHOOK_MERCADOPAGO' }),
          ]
        );

        await conn.commit();
        const fullApp = await this.getAppointmentById(tenantId, appointmentId);
        return { appointment: fullApp, payment: { id: paymentId, status: 'APPROVED' } };
      } catch (err) {
        if (conn) await conn.rollback();
        handleDbFallbackError('confirmAppointmentPayment', err);
      } finally {
        if (conn) conn.release();
      }
    }

    // Fallback in-memory
    const appointment = memoryStore.appointments.find((a: any) => a.id === appointmentId && a.tenantId === tenantId);
    if (!appointment) {
      throw new Error('Agendamento não encontrado para esta empresa');
    }

    if (appointment.status === 'CONFIRMED') {
      const pay = memoryStore.payments.find((p: any) => p.appointmentId === appointmentId);
      if (pay) {
        pay.status = 'APPROVED';
        pay.approvedAt = (approvedAt || new Date()).toISOString();
      }
      return {
        appointment: {
          ...appointment,
          client: memoryStore.clients.find(c => c.id === appointment.clientId) || null,
          professional: memoryStore.professionals.find(p => p.id === appointment.professionalId) || null,
          service: memoryStore.services.find(s => s.id === appointment.serviceId) || null,
        },
        alreadyConfirmed: true,
      };
    }

    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
      throw new Error(`Não é possível confirmar agendamento com status ${appointment.status}`);
    }

    const appStart = new Date(appointment.dateTime).getTime();
    const appEnd = new Date(appointment.endDateTime).getTime();
    const conflict = memoryStore.appointments.find((a: any) => {
      if (a.id === appointment.id) return false;
      if (a.professionalId !== appointment.professionalId) return false;
      if (a.status !== 'CONFIRMED') return false;
      const start = new Date(a.dateTime).getTime();
      const end = new Date(a.endDateTime).getTime();
      return appStart < end && appEnd > start;
    });

    if (conflict) {
      throw new Error('Conflito de agendamento: horário já concedido a outra reserva confirmada.');
    }

    appointment.status = 'CONFIRMED';
    const pay = memoryStore.payments.find((p: any) => (paymentId ? p.id === paymentId : p.appointmentId === appointmentId));
    if (pay) {
      pay.status = 'APPROVED';
      if (providerPaymentId) pay.providerPaymentId = providerPaymentId;
      pay.approvedAt = (approvedAt || new Date()).toISOString();
      if (rawResponse) pay.rawResponse = rawResponse;
    }

    const log = {
      id: `audit-${Date.now()}`,
      tenantId,
      action: 'APPOINTMENT_CONFIRMED_PIX',
      details: {
        appointmentId: appointment.id,
        paymentId: pay?.id,
        providerPaymentId,
        actor: actor || 'WEBHOOK_MERCADOPAGO',
      },
      createdAt: new Date().toISOString(),
    };
    memoryStore.auditLogs.push(log);

    return {
      appointment: {
        ...appointment,
        client: memoryStore.clients.find(c => c.id === appointment.clientId) || null,
        professional: memoryStore.professionals.find(p => p.id === appointment.professionalId) || null,
        service: memoryStore.services.find(s => s.id === appointment.serviceId) || null,
      },
      payment: pay,
    };
  },

  async recordAuditLog(tenantId: string, userId: string | null, action: string, details: any, ipAddress?: string) {
    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `INSERT INTO AuditLog (id, tenantId, userId, action, details, ipAddress, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [
            `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            userId || null,
            action,
            details ? JSON.stringify(details) : null,
            ipAddress || null,
          ]
        );
      } catch (e) {}
    }
    memoryStore.auditLogs.push({
      id: `audit-${Date.now()}`,
      tenantId,
      userId,
      action,
      details,
      ipAddress,
      createdAt: new Date().toISOString(),
    });
  },

  async getDashboardStats(tenantId: string, options?: { date?: string; periodDays?: number }) {
    const appointments = await this.getAppointments(tenantId);
    const clients = await this.getClients(tenantId);
    const services = await this.getServices(tenantId);
    const professionals = await this.getProfessionals(tenantId);
    const timeBlocks = await this.getTimeBlocks(tenantId);
    const business = await this.getBusiness(tenantId);

    const now = options?.date ? new Date(options.date) : new Date();
    const todayStr = now.toISOString().split('T')[0];

    const isSameDay = (iso: string) => {
      try {
        return new Date(iso).toISOString().split('T')[0] === todayStr;
      } catch {
        return false;
      }
    };

    const todayAppointments = appointments.filter((a: any) => isSameDay(a.dateTime));
    const upcomingAppointments = appointments.filter(
      (a: any) =>
        ['CONFIRMED', 'PENDING', 'PENDING_PAYMENT', 'IN_PROGRESS'].includes(a.status) &&
        new Date(a.dateTime).getTime() >= now.getTime()
    );
    const completedTodayCount = todayAppointments.filter((a: any) => a.status === 'COMPLETED').length;
    const completedCount = appointments.filter((a: any) => a.status === 'COMPLETED').length;
    const confirmedCount = appointments.filter((a: any) =>
      ['CONFIRMED', 'PENDING_PAYMENT', 'PENDING', 'IN_PROGRESS'].includes(a.status)
    ).length;
    const cancelledCount = appointments.filter((a: any) => a.status === 'CANCELLED').length;
    const noShowCount = appointments.filter((a: any) => a.status === 'NO_SHOW').length;

    // Calculate working minutes available today across active professionals (discounting breaks and timeBlocks)
    const activeProfs = professionals.filter((p: any) => p.active !== false);
    const dayOfWeek = now.getDay();
    const parseMins = (hhmm: string, fallback: number) => {
      if (!hhmm || !hhmm.includes(':')) return fallback;
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const defaultStartMins = parseMins(business?.openTime || '09:00', 9 * 60);
    const defaultEndMins = parseMins(business?.closeTime || '19:00', 19 * 60);

    let availableMinutesToday = 0;
    for (const prof of activeProfs) {
      const whList = Array.isArray(prof.workingHours) ? prof.workingHours : [];
      const whToday = whList.find((w: any) => Number(w.dayOfWeek) === dayOfWeek);
      let grossMins = 0;
      if (whList.length > 0) {
        if (whToday) {
          const s = parseMins(whToday.startTime, defaultStartMins);
          const e = parseMins(whToday.endTime, defaultEndMins);
          grossMins = Math.max(0, e - s);
          if (whToday.breakStart && whToday.breakEnd) {
            const bs = parseMins(whToday.breakStart, 12 * 60);
            const be = parseMins(whToday.breakEnd, 13 * 60);
            grossMins = Math.max(0, grossMins - Math.max(0, be - bs));
          }
        }
      } else {
        // Default 9h work day (10h minus 1h lunch) when no explicit day row is set
        grossMins = Math.max(0, defaultEndMins - defaultStartMins - 60);
      }

      // Discount timeBlocks overlapping today for this professional
      const todayStartMs = new Date(`${todayStr}T00:00:00.000Z`).getTime();
      const todayEndMs = new Date(`${todayStr}T23:59:59.999Z`).getTime();
      const profBlocksToday = timeBlocks.filter((tb: any) => {
        if (tb.professionalId && tb.professionalId !== prof.id) return false;
        const bs = new Date(tb.startDate).getTime();
        const be = new Date(tb.endDate).getTime();
        return bs < todayEndMs && be > todayStartMs;
      });
      let blockedMins = 0;
      for (const tb of profBlocksToday) {
        const bs = Math.max(todayStartMs, new Date(tb.startDate).getTime());
        const be = Math.min(todayEndMs, new Date(tb.endDate).getTime());
        blockedMins += Math.round(Math.max(0, be - bs) / 60000);
      }

      availableMinutesToday += Math.max(0, grossMins - blockedMins);
    }

    const activeTodayApps = todayAppointments.filter((a: any) =>
      ['CONFIRMED', 'PENDING', 'PENDING_PAYMENT', 'IN_PROGRESS', 'COMPLETED'].includes(a.status)
    );
    const bookedMinutesToday = activeTodayApps.reduce(
      (sum: number, a: any) => sum + Number(a.snapshotDurationMin || a.service?.durationMin || 60),
      0
    );

    const remainingMinutesToday = Math.max(0, availableMinutesToday - bookedMinutesToday);
    const availableSlotsToday = Math.floor(remainingMinutesToday / 60);

    // Occupancy Rate: if today has available minutes, compute today's or period occupancy
    const occupancyRatePercent = availableMinutesToday > 0
      ? Math.min(100, Math.round((bookedMinutesToday / availableMinutesToday) * 100))
      : 0;

    const validTotalForCancelRate = appointments.filter((a: any) => a.status !== 'EXPIRED').length;
    const cancellationRatePercent = validTotalForCancelRate > 0
      ? Math.round((cancelledCount / validTotalForCancelRate) * 100)
      : 0;

    const recurringClientsCount = clients.filter((c: any) => Boolean(c.isRecurring)).length;
    const newClientsCount = Math.max(0, clients.length - recurringClientsCount);

    const pendingCancellationRequestsCount = memoryStore.cancellationRequests.filter(
      (cr: any) => cr.tenantId === tenantId && cr.status === 'PENDING'
    ).length;

    const totalRevenueCents = appointments
      .filter((a: any) => a.status === 'COMPLETED' || a.status === 'CONFIRMED')
      .reduce((sum: number, a: any) => sum + Number(a.totalAmountCents || 0), 0);

    return {
      totalRevenue: totalRevenueCents / 100,
      totalAppointments: appointments.length,
      completedAppointments: completedCount,
      confirmedAppointments: confirmedCount,
      totalClients: clients.length,
      totalServices: services.filter((s: any) => s.active !== false).length,
      totalProfessionals: activeProfs.length,
      currency: business?.currency || 'BRL',
      periodLabel: 'Visão operacional do dia e acumulado do estabelecimento',
      todayDate: todayStr,
      todayAppointmentsCount: todayAppointments.length,
      upcomingAppointmentsCount: upcomingAppointments.length,
      completedTodayCount,
      cancelledCount,
      noShowCount,
      availableSlotsToday,
      availableMinutesToday,
      bookedMinutesToday,
      occupancyRatePercent,
      cancellationRatePercent,
      newClientsCount,
      recurringClientsCount,
      pendingCancellationRequestsCount,
      formulas: {
        occupancy: 'Minutos agendados hoje ÷ Minutos de expediente disponíveis hoje (descontando intervalos e bloqueios de agenda) × 100',
        cancellation: 'Total de agendamentos cancelados ÷ Total de agendamentos válidos (excluindo reservas expiradas) × 100',
        clientsClassification: 'Recorrentes: clientes com pelo menos 1 atendimento concluído ou mais de 1 agendamento ativo; Novas: clientes em primeiro agendamento',
      },
    };
  },
};

