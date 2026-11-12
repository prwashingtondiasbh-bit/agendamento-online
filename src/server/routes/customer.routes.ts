import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { customerStorage } from '../customerStorage.js';
import { db, memoryStore } from '../storage.js';
import { saasService } from '../saasService.js';
import { cancellationService } from '../cancellationService.js';
import { createCancellationRequestSchema, rescheduleAppointmentSchema } from '../validation/schemas.js';
import { signSessionToken } from '../middleware/auth.js';
import {
  antiBotGuard,
  checkLoginLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  extractClientIp,
} from '../middleware/antiBot.js';

const router = Router();

// Zod validation schemas
const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100).optional(),
  phone: z.string().trim().min(8, 'Telefone inválido').max(25).optional(),
  email: z.string().trim().email('E-mail inválido').max(100).optional(),
  contactPreference: z.enum(['WHATSAPP', 'SMS', 'EMAIL']).optional(),
});

const customerRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  phone: z.string().trim().min(8, 'Telefone inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  contactPreference: z.enum(['WHATSAPP', 'SMS', 'EMAIL']).optional(),
  tenantId: z.string().optional(),
  slug: z.string().optional(),
});

function findTenantByRef(inputTenantOrSlug: string | undefined): any | null {
  saasService.ensureSaaSSeedData();
  if (!inputTenantOrSlug || !inputTenantOrSlug.trim()) return null;
  const raw = inputTenantOrSlug.trim();
  const clean = raw.toLowerCase();
  return (
    (memoryStore.tenants as any[]).find((t) => {
      if (String(t.id || '').toLowerCase() === clean) return true;
      if (String(t.slug || '').toLowerCase() === clean) return true;
      if (
        Array.isArray(t.legacySlugs) &&
        t.legacySlugs.some((ls: any) => String(ls).toLowerCase() === clean)
      ) {
        return true;
      }
      return false;
    }) || null
  );
}

async function resolveTenantByRefAsync(inputTenantOrSlug: string | undefined): Promise<any | null> {
  if (!inputTenantOrSlug || !inputTenantOrSlug.trim()) return null;
  await saasService.syncTenantsFromMySql();
  const fromMem = findTenantByRef(inputTenantOrSlug);
  if (fromMem) return fromMem;
  const resolved = await saasService.resolvePublicEstablishmentBySlugOrId(inputTenantOrSlug);
  return resolved?.establishment || null;
}

function resolveTargetTenantId(inputTenantOrSlug: string | undefined, defaultTenantId = 'biz-1'): string {
  const found = findTenantByRef(inputTenantOrSlug);
  if (found) return found.id;
  if (!inputTenantOrSlug || !inputTenantOrSlug.trim()) return defaultTenantId;
  return inputTenantOrSlug.trim();
}

// Middleware to ensure customer identity and permanent establishment link are resolved from server session
async function resolveCustomerContext(req: any, res: any, next: any) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Acesso não autenticado' });
    }

    await saasService.syncTenantsFromMySql();

    const explicitStoreRef = String(
      req.query?.slug ||
        req.query?.tenantId ||
        req.headers?.['x-tenant-slug'] ||
        req.headers?.['x-tenant-id'] ||
        ''
    ).trim();

    const isBookingCreation = req.method === 'POST' && req.path === '/appointments';
    const isSwitchStore = req.method === 'POST' && req.path === '/switch-store';
    const isUnlinkAttempt =
      req.method === 'DELETE' || req.path === '/unlink' || req.path.startsWith('/my-stores/') || req.path.startsWith('/establishments/');

    if (explicitStoreRef && !isBookingCreation && !isSwitchStore && !isUnlinkAttempt) {
      const targetTenant = await resolveTenantByRefAsync(explicitStoreRef);
      if (!targetTenant) {
        return res.status(404).json({
          success: false,
          code: 'ESTABLISHMENT_NOT_FOUND',
          error: 'Estabelecimento não encontrado.',
        });
      }

      let linkedClient = await customerStorage.hasClientLinkInTenant(
        targetTenant.id,
        req.user.id,
        req.user.email
      );

      // Allow salon owners/staff/super_admin previewing the customer portal to resolve their client profile
      if (!linkedClient && req.tenantContext?.role && req.tenantContext.role !== 'CUSTOMER') {
        linkedClient = await customerStorage.getClientForCustomerUser(
          targetTenant.id,
          req.user.id,
          req.user.email,
          req.user.name,
          (req.user as any).phone
        );
      }

      // If the customer's active session is scoped to this store or she has 0 linked stores yet, establish/restore the link
      if (!linkedClient && (!req.tenantContext?.role || req.tenantContext.role === 'CUSTOMER')) {
        const existingStores = await customerStorage.getLinkedEstablishmentsForCustomer(
          req.user.id,
          req.user.email
        );
        if (req.tenantContext?.tenantId === targetTenant.id || existingStores.length === 0) {
          linkedClient = await customerStorage.getClientForCustomerUser(
            targetTenant.id,
            req.user.id,
            req.user.email,
            req.user.name,
            (req.user as any).phone
          );
        }
      }

      if (!linkedClient) {
        return res.status(403).json({
          success: false,
          code: 'STORE_LINK_REQUIRED',
          error: 'Acesso negado: você não possui vínculo cadastrado com este estabelecimento.',
        });
      }

      const freshBusiness = await db.getBusiness(targetTenant.id);
      req.activeTenantId = targetTenant.id;
      req.activeSlug = freshBusiness?.slug || targetTenant.slug || targetTenant.id;
      req.explicitStoreRequested = true;
      req.customer = linkedClient;
      return next();
    }

    // No explicit store query/header: resolve from session tenantId or existing linked establishments
    let fallbackTenantId = req.tenantContext?.tenantId || 'biz-1';
    const resolvedFallbackTenant = await resolveTenantByRefAsync(fallbackTenantId);
    if (resolvedFallbackTenant?.id) {
      fallbackTenantId = resolvedFallbackTenant.id;
    }

    let client = await customerStorage.hasClientLinkInTenant(
      fallbackTenantId,
      req.user.id,
      req.user.email
    );

    if (!client) {
      const linkedStores = await customerStorage.getLinkedEstablishmentsForCustomer(
        req.user.id,
        req.user.email
      );
      if (linkedStores.length > 0) {
        fallbackTenantId = linkedStores[0].tenantId;
        client = await customerStorage.hasClientLinkInTenant(
          fallbackTenantId,
          req.user.id,
          req.user.email
        );
      }
    }

    if (!client) {
      client = await customerStorage.getClientForCustomerUser(
        fallbackTenantId,
        req.user.id,
        req.user.email,
        req.user.name,
        (req.user as any).phone
      );
    }

    if (!client) {
      return res.status(404).json({ success: false, error: 'Perfil de cliente não encontrado' });
    }

    const activeTenant = await db.getBusiness(client.tenantId);
    req.activeTenantId = client.tenantId;
    req.activeSlug = activeTenant?.slug || client.tenantId;
    req.explicitStoreRequested = false;
    req.customer = client;
    next();
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------
// PUBLIC CUSTOMER AUTHENTICATION (Register & Login by Store Slug)
// -------------------------------------------------------------
router.post('/auth/register', antiBotGuard({ mode: 'register' }), async (req, res, next) => {
  try {
    await saasService.syncTenantsFromMySql();
    if (req.body?.role === 'SUPER_ADMIN' || req.body?.isMasterAdmin === true) {
      return res.status(403).json({
        success: false,
        code: 'PRIVILEGE_ESCALATION_BLOCKED',
        error: 'Não é permitido registrar conta de cliente com privilégios administrativos.',
      });
    }

    const parseResult = customerRegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstIssue = (parseResult.error as any).issues?.[0] || (parseResult.error as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: firstIssue?.message || 'Dados inválidos',
      });
    }

    const { name, email, phone, password, contactPreference, tenantId, slug } = parseResult.data;
    const requestedStoreRef = slug || tenantId;
    let resolvedTenantId = 'biz-1';
    if (requestedStoreRef) {
      const targetTenant = await resolveTenantByRefAsync(requestedStoreRef);
      if (!targetTenant) {
        return res.status(404).json({
          success: false,
          code: 'ESTABLISHMENT_NOT_FOUND',
          error: 'Estabelecimento informado não foi encontrado.',
        });
      }
      resolvedTenantId = targetTenant.id;
    }

    // Check if global User already exists
    const existing = await db.findUserByEmail(email);
    if (existing) {
      // Single global account rule: if existing user is a CUSTOMER and provides valid credentials on a store,
      // reuse the global User and link/retrieve the Client record in resolvedTenantId without duplicating User!
      if (existing.role === 'CUSTOMER' && existing.passwordHash) {
        const validPassword = await bcrypt.compare(password, existing.passwordHash);
        if (validPassword && requestedStoreRef) {
          const client = await customerStorage.getClientForCustomerUser(
            resolvedTenantId,
            existing.id,
            existing.email,
            name || existing.name,
            phone || (existing as any).phone
          );
          const sessionPayload = signSessionToken({
            userId: existing.id,
            userName: existing.name,
            email: existing.email,
            phone: client.phone || (existing as any).phone,
            tenantId: resolvedTenantId,
            role: 'CUSTOMER',
            permissions: ['customer:*'],
          });

          res.cookie('agenda_session', sessionPayload, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 30 * 24 * 60 * 60 * 1000,
          });

          const business = await db.getBusiness(resolvedTenantId);
          const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(
            existing.id,
            existing.email
          );

          return res.status(201).json({
            success: true,
            token: sessionPayload,
            data: {
              customer: client,
              client,
              user: { id: existing.id, name: existing.name, email: existing.email, role: 'CUSTOMER' },
              business,
              linkedEstablishments,
            },
            message: 'Conta global reconhecida e vinculada a este estabelecimento com sucesso!',
          });
        }
      }
      return res.status(400).json({
        success: false,
        error: 'Este e-mail já está em uso. Caso já possua conta no Agenda Beauty, faça login com suas credenciais.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await customerStorage.registerCustomerWithUser({
      name,
      email,
      phone,
      passwordHash,
      tenantId: resolvedTenantId,
      contactPreference: contactPreference || 'WHATSAPP',
    });

    // Generate signed session cookie
    const sessionPayload = signSessionToken({
      userId: result.user.id,
      userName: result.user.name,
      email: result.user.email,
      phone: result.client.phone,
      tenantId: result.client.tenantId,
      role: 'CUSTOMER',
      permissions: ['customer:*'],
    });

    res.cookie('agenda_session', sessionPayload, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    const business = await db.getBusiness(resolvedTenantId);
    const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(
      result.user.id,
      result.user.email
    );

    res.status(201).json({
      success: true,
      token: sessionPayload,
      data: {
        customer: result.client,
        client: result.client,
        user: { id: result.user.id, name: result.user.name, email: result.user.email, role: 'CUSTOMER' },
        business,
        linkedEstablishments,
      },
      message: 'Cadastro realizado com sucesso!',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', antiBotGuard({ mode: 'login' }), async (req, res, next) => {
  try {
    await saasService.syncTenantsFromMySql();
    const { email: rawEmail, password, slug, tenantId } = req.body || {};
    const email = String(rawEmail || '').trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios' });
    }

    const lockout = checkLoginLockout(req, email);
    if (lockout.locked) {
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_FAILED_ATTEMPTS',
        retryAfterSeconds: lockout.retryAfterSec,
        error: `Muitas tentativas de login inválidas. Aguarde ${Math.ceil(lockout.retryAfterSec / 60)} minuto(s) e tente novamente.`,
      });
    }

    const user = await db.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      const failState = recordFailedLoginAttempt(req, email);
      if (failState.lockedNow) {
        return res.status(429).json({
          success: false,
          code: 'TOO_MANY_FAILED_ATTEMPTS',
          retryAfterSeconds: failState.retryAfterSec,
          error: 'Muitas tentativas inválidas. Acesso temporariamente bloqueado por segurança.',
        });
      }
      return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos' });
    }

    if (user.active === false) {
      return res.status(403).json({
        success: false,
        code: 'USER_INACTIVE',
        error: 'Sua conta de usuário encontra-se desativada.',
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const failState = recordFailedLoginAttempt(req, email);
      if (failState.lockedNow) {
        return res.status(429).json({
          success: false,
          code: 'TOO_MANY_FAILED_ATTEMPTS',
          retryAfterSeconds: failState.retryAfterSec,
          error: 'Muitas tentativas inválidas consecutivas. Aguarde alguns minutos.',
        });
      }
      return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos' });
    }

    // Prevent administrative/staff accounts from authenticating through the public customer login endpoint
    if (
      (user as any).isMasterAdmin ||
      ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL'].includes(String(user.role || ''))
    ) {
      await db.recordAuditLog(
        null,
        user.id,
        'SECURITY_UNAUTHORIZED_PORTAL_LOGIN_ATTEMPT',
        { portalType: 'CUSTOMER_ENDPOINT', attemptedEmail: email, actualRole: user.role },
        extractClientIp(req)
      ).catch(() => {});
      return res.status(403).json({
        success: false,
        code: 'PORTAL_ACCESS_DENIED',
        error: 'Esta área de login é exclusiva para clientes. Utilize o acesso apropriado para lojistas ou administradores.',
      });
    }

    clearFailedLoginAttempts(req, email);

    const requestedStoreRef = String(slug || tenantId || '').trim();
    let targetTenantId = user.tenantId || 'biz-1';
    let client: any = null;

    if (requestedStoreRef) {
      const targetTenant = await resolveTenantByRefAsync(requestedStoreRef);
      if (!targetTenant) {
        return res.status(404).json({
          success: false,
          code: 'ESTABLISHMENT_NOT_FOUND',
          error: 'Estabelecimento informado não foi encontrado.',
        });
      }
      targetTenantId = targetTenant.id;
      client = await customerStorage.getClientForCustomerUser(
        targetTenantId,
        user.id,
        user.email,
        user.name,
        (user as any).phone
      );
    } else {
      const linkedStores = await customerStorage.getLinkedEstablishmentsForCustomer(user.id, user.email);
      if (linkedStores.length > 0) {
        const primaryMatch = linkedStores.find((s: any) => s.tenantId === targetTenantId);
        targetTenantId = primaryMatch ? primaryMatch.tenantId : linkedStores[0].tenantId;
      }
      client = await customerStorage.getClientForCustomerUser(
        targetTenantId,
        user.id,
        user.email,
        user.name,
        (user as any).phone
      );
    }

    const sessionPayload = signSessionToken({
      userId: user.id,
      userName: user.name,
      email: user.email,
      phone: client?.phone || (user as any).phone,
      tenantId: targetTenantId,
      role: 'CUSTOMER',
      permissions: ['customer:*'],
      iat: Date.now(),
    });

    res.cookie('agenda_session', sessionPayload, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const business = await db.getBusiness(targetTenantId);
    const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(user.id, user.email);

    res.json({
      success: true,
      token: sessionPayload,
      data: {
        customer: client,
        client,
        user: { id: user.id, name: user.name, email: user.email, role: user.role || 'CUSTOMER' },
        tenantId: targetTenantId,
        tenant: business,
        business,
        linkedEstablishments,
      },
      message: 'Login realizado com sucesso!',
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// PUBLIC / CUSTOMER PARTNER DIRECTORY (DESATIVADO)
// -------------------------------------------------------------
router.get('/directory', (_req, res) => {
  res.status(404).json({
    success: false,
    code: 'DIRECTORY_DISABLED',
    error: 'O diretório público de empresas parceiras foi desativado. Utilize o link exclusivo de agendamento fornecido pelo estabelecimento (/agendar/:slug).',
  });
});

function extractSessionTenantFallback(req: any): string | undefined {
  if (req.tenantContext?.tenantId) return req.tenantContext.tenantId;
  const authHeader = req.headers?.authorization;
  const bearerToken =
    authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;
  const raw = req.cookies?.agenda_session || req.headers?.['x-session-token'] || bearerToken;
  if (raw && typeof raw === 'string') {
    try {
      const parsed = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'));
      if (parsed?.tenantId) return String(parsed.tenantId);
    } catch {}
  }
  return undefined;
}

router.get('/catalog', async (req, res, next) => {
  try {
    const requestedTenant = String(
      req.query.tenantId ||
        req.query.slug ||
        req.headers['x-tenant-slug'] ||
        req.headers['x-tenant-id'] ||
        ''
    ).trim();

    let tenantId = extractSessionTenantFallback(req) || 'biz-1';
    if (requestedTenant) {
      const resolved = await resolveTenantByRefAsync(requestedTenant);
      tenantId = resolved?.id || resolveTargetTenantId(requestedTenant, 'biz-1');
    } else {
      const resolvedFallback = await resolveTenantByRefAsync(tenantId);
      if (resolvedFallback?.id) tenantId = resolvedFallback.id;
    }

    const [business, services, professionals] = await Promise.all([
      db.getBusiness(tenantId),
      db.getServices(tenantId, { onlyActive: true }),
      db.getProfessionals(tenantId, { onlyActive: true }),
    ]);

    const effectiveRequireDeposit =
      business?.requireDeposit !== undefined ? Boolean(business.requireDeposit) : true;
    const effectiveDefaultDeposit = effectiveRequireDeposit
      ? Number(business?.defaultDeposit ?? 30)
      : 0;

    res.json({
      success: true,
      data: {
        business: business
          ? {
              id: business.id,
              name: business.name,
              slug: business.slug,
              description: business.description || '',
              logoUrl: business.logoUrl || '',
              status: business.status || 'ACTIVE',
              phone: business.phone,
              email: business.email,
              address: business.address,
              timezone: business.timezone || 'America/Sao_Paulo',
              currency: business.currency || 'BRL',
              openTime: business.openTime || '08:00',
              closeTime: business.closeTime || '20:00',
              requireDeposit: effectiveRequireDeposit,
              defaultDeposit: effectiveDefaultDeposit,
              cancellationHoursLimit: business.cancellationHoursLimit ?? 6,
              allowCustomerReschedule: business.allowCustomerReschedule ?? true,
              allowManualReviewOutOfPeriod: business.allowManualReviewOutOfPeriod ?? true,
              cancellationPolicyText: business.cancellationPolicyText,
              cancellationContactInstructions: business.cancellationContactInstructions,
            }
          : null,
        services: services.map((s: any) => ({
          ...s,
          depositPercent: effectiveRequireDeposit
            ? Number(s.depositPercent ?? effectiveDefaultDeposit ?? 30)
            : 0,
        })),
        professionals: professionals.map((p: any) => ({
          id: p.id,
          name: p.name,
          specialty: p.specialty,
          avatarUrl: p.avatarUrl,
          active: p.active,
          workingHours: p.workingHours,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/available-slots', async (req, res, next) => {
  try {
    const requestedTenant = String(
      req.query.tenantId ||
        req.query.slug ||
        req.headers['x-tenant-slug'] ||
        req.headers['x-tenant-id'] ||
        ''
    ).trim();

    let tenantId = extractSessionTenantFallback(req) || 'biz-1';
    if (requestedTenant) {
      const resolved = await resolveTenantByRefAsync(requestedTenant);
      tenantId = resolved?.id || resolveTargetTenantId(requestedTenant, 'biz-1');
    } else {
      const resolvedFallback = await resolveTenantByRefAsync(tenantId);
      if (resolvedFallback?.id) tenantId = resolvedFallback.id;
    }

    const serviceId = String(req.query.serviceId || '');
    const professionalId = String(req.query.professionalId || '');
    const date = String(req.query.date || '');

    if (!serviceId || !professionalId || !date) {
      return res.status(400).json({
        success: false,
        error: 'Informe serviceId, professionalId e date (YYYY-MM-DD) para consultar horários disponíveis.',
      });
    }

    const availability = await db.getAvailableSlots(tenantId, {
      serviceId,
      professionalId,
      date,
    });

    res.json({
      success: true,
      data: availability,
    });
  } catch (err) {
    next(err);
  }
});

// All following customer endpoints require authenticated session
router.use(resolveCustomerContext);

// -------------------------------------------------------------
// GET /api/v1/customer/my-stores (and /establishments) - Menu "Minhas Lojas"
// -------------------------------------------------------------
const handleGetMyStores = async (req: any, res: any, next: any) => {
  try {
    const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(
      req.user.id,
      req.user.email
    );
    const activeTenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const activeStoreFromLinks =
      linkedEstablishments.find((s: any) => s.tenantId === activeTenantId) ||
      linkedEstablishments[0] ||
      null;
    const effectiveTenantId = activeStoreFromLinks?.tenantId || activeTenantId;
    const fullBusiness = await db.getBusiness(effectiveTenantId);
    const activeStore = activeStoreFromLinks || fullBusiness || null;

    res.json({
      success: true,
      data: {
        stores: linkedEstablishments,
        establishments: linkedEstablishments,
        linkedEstablishments,
        total: linkedEstablishments.length,
        activeTenantId: effectiveTenantId,
        activeSlug: activeStore?.slug || fullBusiness?.slug || req.activeSlug || effectiveTenantId,
        activeStore: fullBusiness || activeStore,
        business: fullBusiness || activeStore,
        hasMultipleStores: linkedEstablishments.length >= 2,
      },
    });
  } catch (err) {
    next(err);
  }
};
router.get('/my-stores', handleGetMyStores);
router.get('/establishments', handleGetMyStores);

// -------------------------------------------------------------
// POST /api/v1/customer/switch-store - Switch Active Store Context (Preserving All Permanent Links)
// -------------------------------------------------------------
router.post('/switch-store', async (req: any, res, next) => {
  try {
    const { slug, tenantId } = req.body || {};
    const targetRef = String(slug || tenantId || '').trim();
    if (!targetRef) {
      return res.status(400).json({
        success: false,
        error: 'Informe o slug ou identificador do estabelecimento para alternar.',
      });
    }

    const targetTenant = await resolveTenantByRefAsync(targetRef);
    if (!targetTenant) {
      return res.status(404).json({
        success: false,
        code: 'ESTABLISHMENT_NOT_FOUND',
        error: 'Estabelecimento não encontrado.',
      });
    }

    // Strict verification: customer can ONLY switch to a store where she has a valid permanent Client link
    const linkedClient = await customerStorage.hasClientLinkInTenant(
      targetTenant.id,
      req.user.id,
      req.user.email
    );
    if (!linkedClient) {
      return res.status(403).json({
        success: false,
        code: 'STORE_LINK_REQUIRED',
        error: 'Acesso negado: você não possui vínculo cadastrado com este estabelecimento.',
      });
    }

    const sessionPayload = signSessionToken({
      userId: req.user.id,
      userName: req.user.name,
      email: req.user.email,
      phone: linkedClient.phone || req.user.phone,
      tenantId: targetTenant.id,
      role: 'CUSTOMER',
      permissions: ['customer:*'],
      iat: Date.now(),
    });

    res.cookie('agenda_session', sessionPayload, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const business = await db.getBusiness(targetTenant.id);
    const linkedEstablishments = await customerStorage.getLinkedEstablishmentsForCustomer(
      req.user.id,
      req.user.email
    );
    const storeAppointments = await customerStorage.getCustomerAppointments(
      targetTenant.id,
      linkedClient.id
    );

    res.json({
      success: true,
      token: sessionPayload,
      data: {
        customer: linkedClient,
        business,
        activeStore: business,
        activeTenantId: targetTenant.id,
        activeSlug: targetTenant.slug || targetTenant.id,
        linkedEstablishments,
        pendingDeposits: storeAppointments.pendingDeposits,
      },
      message: `Painel alternado para ${business.name}.`,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// PERMANENT LINK PROTECTION: Block Customer Unlink / Delete Attempts
// -------------------------------------------------------------
const rejectPermanentLinkRemoval = (_req: any, res: any) => {
  return res.status(403).json({
    success: false,
    code: 'PERMANENT_LINK_PROTECTION',
    error: 'O vínculo com o estabelecimento é permanente e não pode ser removido ou desvinculado pela cliente.',
  });
};
router.delete('/my-stores/:storeId', rejectPermanentLinkRemoval);
router.delete('/establishments/:storeId', rejectPermanentLinkRemoval);
router.delete('/link', rejectPermanentLinkRemoval);
router.post('/unlink', rejectPermanentLinkRemoval);
router.delete('/me', rejectPermanentLinkRemoval);

// -------------------------------------------------------------
// GET /api/v1/customer/me - Authenticated Customer Profile for Active Store
// -------------------------------------------------------------
router.get('/me', async (req: any, res, next) => {
  try {
    const tenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const [business, linkedEstablishments, storeAppointments] = await Promise.all([
      db.getBusiness(tenantId),
      customerStorage.getLinkedEstablishmentsForCustomer(req.user.id, req.user.email),
      customerStorage.getCustomerAppointments(tenantId, req.customer.id),
    ]);

    res.json({
      success: true,
      data: {
        customer: {
          id: req.customer.id,
          tenantId,
          name: req.customer.name,
          phone: req.customer.phone,
          email: req.customer.email,
          contactPreference: req.customer.contactPreference || 'WHATSAPP',
          createdAt: req.customer.createdAt,
        },
        business: business ? {
          id: business.id,
          name: business.name,
          slug: business.slug,
          description: business.description,
          logoUrl: business.logoUrl,
          phone: business.phone,
          email: business.email,
          address: business.address,
          openTime: business.openTime,
          closeTime: business.closeTime,
          timezone: business.timezone,
          requireDeposit: business.requireDeposit !== undefined ? Boolean(business.requireDeposit) : true,
          defaultDeposit: business.defaultDeposit ?? 30,
          cancellationHoursLimit: business.cancellationHoursLimit,
          allowCustomerReschedule: business.allowCustomerReschedule,
          allowManualReviewOutOfPeriod: business.allowManualReviewOutOfPeriod,
          cancellationPolicyText: business.cancellationPolicyText,
          cancellationContactInstructions: business.cancellationContactInstructions,
          cancellationPolicyVersion: business.cancellationPolicyVersion,
        } : null,
        linkedEstablishments,
        pendingDeposits: storeAppointments.pendingDeposits,
        summary: storeAppointments,
      },
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// PATCH /api/v1/customer/me - Update Allowed Customer Profile Fields
// -------------------------------------------------------------
router.patch('/me', async (req: any, res, next) => {
  try {
    const body = req.body || {};
    const hasAllowedProfileField =
      body.name !== undefined ||
      body.phone !== undefined ||
      body.email !== undefined ||
      body.contactPreference !== undefined;

    if (
      body.unlink === true ||
      body.removeLink === true ||
      ((body.tenantId !== undefined || body.slug !== undefined) && !hasAllowedProfileField)
    ) {
      return res.status(403).json({
        success: false,
        code: 'PERMANENT_LINK_PROTECTION',
        error: 'Não é permitido alterar o tenantId ou desvincular sua conta do estabelecimento.',
      });
    }

    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      const firstIssue = (parseResult.error as any).issues?.[0] || (parseResult.error as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: firstIssue?.message || 'Dados inválidos',
      });
    }

    const tenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const updated = await customerStorage.updateCustomerProfile(
      tenantId,
      req.customer.id,
      req.user.id,
      parseResult.data
    );

    res.json({
      success: true,
      data: updated,
      message: 'Seus dados foram atualizados com sucesso.',
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/v1/customer/appointments - Customer Appointments (Scoped by Slug/Store when requested)
// -------------------------------------------------------------
router.get('/appointments', async (req: any, res, next) => {
  try {
    if (req.explicitStoreRequested) {
      // Strictly isolated to the active establishment verified by resolveCustomerContext
      const storeResult = await customerStorage.getCustomerAppointments(
        req.activeTenantId,
        req.customer.id
      );
      return res.json({
        success: true,
        data: storeResult,
      });
    }

    const primaryTenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const result = await customerStorage.getCustomerAppointmentsAcrossTenants(
      primaryTenantId,
      req.user.id,
      req.user.email,
      req.user.name,
      req.user.phone
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// POST /api/v1/customer/appointments - Create Customer Appointment (Supports Multi-Establishment)
// -------------------------------------------------------------
router.post('/appointments', async (req: any, res, next) => {
  try {
    const body = req.body || {};
    const requestedTenantOrSlug = body.tenantId || body.slug || req.query?.slug || req.query?.tenantId;
    const targetTenantId = requestedTenantOrSlug
      ? resolveTargetTenantId(String(requestedTenantOrSlug), req.activeTenantId || req.tenantContext?.tenantId || 'biz-1')
      : req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';

    // Verify target tenant exists
    const targetTenantExists = (memoryStore.tenants as any[]).some((t) => t.id === targetTenantId);
    if (!targetTenantExists) {
      return res.status(404).json({
        success: false,
        code: 'ESTABLISHMENT_NOT_FOUND',
        error: 'Estabelecimento selecionado não encontrado.',
      });
    }

    // Check operational status
    saasService.assertTenantPublicBookingAllowed(targetTenantId);

    if (
      body.priceCents !== undefined ||
      body.totalAmountCents !== undefined ||
      body.totalAmount !== undefined ||
      body.depositAmountCents !== undefined ||
      body.balanceAmountCents !== undefined ||
      body.snapshotPriceCents !== undefined ||
      body.snapshotDepositCents !== undefined ||
      body.snapshotBalanceCents !== undefined ||
      body.snapshotDepositPercent !== undefined ||
      body.status !== undefined ||
      body.paymentStatus !== undefined ||
      body.forceApprovedPayment !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Violação de segurança: o cliente não pode definir preços, valores de sinal, status de pagamento ou status do agendamento.',
      });
    }

    const { professionalId, serviceId, dateTime, notes } = body;
    if (!professionalId || !serviceId || !dateTime) {
      return res.status(400).json({
        success: false,
        error: 'Informe serviço, profissional e data/horário para concluir o agendamento.',
      });
    }

    // Resolve or create the customer's permanent Client record inside targetTenantId
    const targetClient =
      targetTenantId === req.customer?.tenantId
        ? req.customer
        : await customerStorage.getClientForCustomerUser(
            targetTenantId,
            req.user.id,
            req.user.email,
            req.user.name,
            req.user.phone
          );

    const newApp = await db.createAppointment(targetTenantId, {
      clientId: targetClient.id,
      professionalId: String(professionalId),
      serviceId: String(serviceId),
      dateTime: String(dateTime),
      origin: 'ONLINE',
      isCustomerBooking: true,
      notes: notes ? String(notes) : '',
      createdBy: req.user?.id || targetClient.id,
    });

    const business = await db.getBusiness(targetTenantId);

    res.status(201).json({
      success: true,
      data: {
        ...newApp,
        establishment: business
          ? {
              id: business.id,
              name: business.name,
              slug: business.slug,
              logoUrl: business.logoUrl || '',
              phone: business.phone || '',
              address: business.address || '',
              requireDeposit: Boolean(business.requireDeposit),
            }
          : undefined,
      },
      message:
        newApp.status === 'CONFIRMED'
          ? 'Agendamento confirmado com sucesso (sem exigência de sinal antecipado)!'
          : 'Reserva criada com sucesso! Conclua o pagamento do sinal via Pix para confirmar.',
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/v1/customer/appointments/:id - Specific Appointment Details
// -------------------------------------------------------------
router.get('/appointments/:id', async (req: any, res, next) => {
  try {
    const appointmentId = req.params.id;
    const ownership = await customerStorage.resolveCustomerAppointmentOwnership(
      req.user.id,
      req.user.email,
      appointmentId
    );
    if (!ownership) {
      return res.status(404).json({
        success: false,
        error: 'Agendamento não encontrado ou não pertence a esta cliente.',
      });
    }

    if (req.explicitStoreRequested && ownership.tenantId !== req.activeTenantId) {
      return res.status(403).json({
        success: false,
        code: 'CROSS_STORE_APPOINTMENT_MISMATCH',
        error: 'Este agendamento pertence a outro estabelecimento e não faz parte do painel da loja atual.',
      });
    }

    const appointment = await customerStorage.getCustomerAppointmentById(
      ownership.tenantId,
      ownership.clientId,
      appointmentId
    );
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Agendamento não encontrado ou não pertence a esta cliente.',
      });
    }

    res.json({
      success: true,
      data: appointment,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/v1/customer/appointments/:appointmentId/cancellation-eligibility
// -------------------------------------------------------------
router.get('/appointments/:appointmentId/cancellation-eligibility', async (req: any, res, next) => {
  try {
    const appointmentId = req.params.appointmentId;
    const ownership = await customerStorage.resolveCustomerAppointmentOwnership(
      req.user.id,
      req.user.email,
      appointmentId
    );
    if (req.explicitStoreRequested && ownership && ownership.tenantId !== req.activeTenantId) {
      return res.status(403).json({
        success: false,
        code: 'CROSS_STORE_APPOINTMENT_MISMATCH',
        error: 'Este agendamento pertence a outro estabelecimento.',
      });
    }
    const tenantId = ownership ? ownership.tenantId : (req.activeTenantId || req.tenantContext?.tenantId || 'biz-1');
    const clientId = ownership ? ownership.clientId : req.customer.id;

    const eligibility = await cancellationService.calculateCancellationEligibility({
      tenantId,
      appointmentId,
      clientId,
    });

    res.json({
      success: true,
      data: eligibility,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// POST /api/v1/customer/appointments/:appointmentId/cancellation-requests
// -------------------------------------------------------------
router.post('/appointments/:appointmentId/cancellation-requests', async (req: any, res, next) => {
  try {
    const appointmentId = req.params.appointmentId;
    const ownership = await customerStorage.resolveCustomerAppointmentOwnership(
      req.user.id,
      req.user.email,
      appointmentId
    );
    if (req.explicitStoreRequested && ownership && ownership.tenantId !== req.activeTenantId) {
      return res.status(403).json({
        success: false,
        code: 'CROSS_STORE_APPOINTMENT_MISMATCH',
        error: 'Este agendamento pertence a outro estabelecimento.',
      });
    }
    const tenantId = ownership ? ownership.tenantId : (req.activeTenantId || req.tenantContext?.tenantId || 'biz-1');
    const clientId = ownership ? ownership.clientId : req.customer.id;

    // Reject frontend attempts to manipulate financial values or status directly
    if (
      req.body &&
      (req.body.refundableAmountCents !== undefined ||
        req.body.paidDepositCents !== undefined ||
        req.body.amountCents !== undefined ||
        req.body.status !== undefined ||
        req.body.refundStatus !== undefined)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Violação de segurança: o frontend não pode definir valores de reembolso ou status.',
      });
    }

    const parsed = createCancellationRequestSchema.parse(req.body || {});
    const requestRecord = await cancellationService.createCancellationRequest({
      tenantId,
      appointmentId,
      clientId,
      reason: parsed.reason,
      confirmedByCustomer: parsed.confirmedByCustomer,
      rawBody: req.body,
    });

    res.status(201).json({
      success: true,
      data: requestRecord,
      message: `Solicitação de cancelamento ${requestRecord.referenceCode} registrada com sucesso.`,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// POST /api/v1/customer/appointments/:appointmentId/cancel-pending
// Instantly cancels an unpaid pending pre-reservation and frees the schedule
// -------------------------------------------------------------
router.post('/appointments/:appointmentId/cancel-pending', async (req: any, res, next) => {
  try {
    const appointmentId = req.params.appointmentId;
    const ownership = await customerStorage.resolveCustomerAppointmentOwnership(
      req.user.id,
      req.user.email,
      appointmentId
    );
    const tenantId = ownership ? ownership.tenantId : (req.activeTenantId || req.tenantContext?.tenantId || 'biz-1');
    const existing = await db.getAppointmentById(tenantId, appointmentId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
    }
    if (existing.status !== 'PENDING_PAYMENT' && existing.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'Apenas pré-agendamentos pendentes de confirmação podem ser cancelados diretamente por este fluxo.',
      });
    }
    const updated = await db.updateAppointmentStatus(tenantId, appointmentId, 'CANCELLED', req.user.id);
    res.json({
      success: true,
      data: updated,
      message: 'Pré-agendamento cancelado com sucesso. O horário foi liberado imediatamente na agenda do estabelecimento.',
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// POST /api/v1/customer/appointments/:appointmentId/reschedule
// -------------------------------------------------------------
router.post('/appointments/:appointmentId/reschedule', async (req: any, res, next) => {
  try {
    const appointmentId = req.params.appointmentId;
    const ownership = await customerStorage.resolveCustomerAppointmentOwnership(
      req.user.id,
      req.user.email,
      appointmentId
    );
    if (req.explicitStoreRequested && ownership && ownership.tenantId !== req.activeTenantId) {
      return res.status(403).json({
        success: false,
        code: 'CROSS_STORE_APPOINTMENT_MISMATCH',
        error: 'Este agendamento pertence a outro estabelecimento.',
      });
    }
    const tenantId = ownership ? ownership.tenantId : (req.activeTenantId || req.tenantContext?.tenantId || 'biz-1');
    const clientId = ownership ? ownership.clientId : req.customer.id;

    if (
      req.body &&
      (req.body.priceCents !== undefined ||
        req.body.totalAmountCents !== undefined ||
        req.body.depositAmountCents !== undefined ||
        req.body.serviceId !== undefined)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Não é permitido alterar valores financeiros ou trocar de serviço diretamente pelo reagendamento.',
      });
    }

    const parsed = rescheduleAppointmentSchema.parse(req.body || {});
    const updatedAppointment = await cancellationService.rescheduleAppointment({
      tenantId,
      appointmentId,
      clientId,
      newDateTime: parsed.newDateTime,
      reason: parsed.reason,
      rawBody: req.body,
    });

    res.json({
      success: true,
      data: updatedAppointment,
      message: 'Horário reagendado com sucesso!',
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/v1/customer/cancellation-requests
// -------------------------------------------------------------
router.get('/cancellation-requests', async (req: any, res, next) => {
  try {
    const tenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const list = await cancellationService.listCustomerCancellationRequests(tenantId, req.customer.id);
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/v1/customer/refund-requests
// -------------------------------------------------------------
router.get('/refund-requests', async (req: any, res, next) => {
  try {
    const tenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const list = await cancellationService.listCustomerRefundRequests(tenantId, req.customer.id);
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/v1/customer/payments - Customer Payments History (Scoped by Store when requested)
// -------------------------------------------------------------
router.get('/payments', async (req: any, res, next) => {
  try {
    if (req.explicitStoreRequested) {
      const storePayments = await customerStorage.getCustomerPayments(
        req.activeTenantId,
        req.customer.id
      );
      return res.json({
        success: true,
        data: storePayments,
      });
    }

    const primaryTenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const payments = await customerStorage.getCustomerPaymentsAcrossTenants(
      primaryTenantId,
      req.user.id,
      req.user.email
    );

    res.json({
      success: true,
      data: payments,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/v1/customer/notifications - Customer Notifications for Active Store
// -------------------------------------------------------------
router.get('/notifications', async (req: any, res, next) => {
  try {
    const tenantId = req.activeTenantId || req.tenantContext?.tenantId || 'biz-1';
    const notifications = await customerStorage.getCustomerNotifications(tenantId, req.customer.id);

    res.json({
      success: true,
      data: notifications,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// PATCH /api/v1/customer/notifications/:id/read - Mark Single Read
// -------------------------------------------------------------
router.patch('/notifications/:id/read', async (req: any, res, next) => {
  try {
    const success = await customerStorage.markCustomerNotificationRead(req.customer.id, req.params.id);
    res.json({ success });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// POST /api/v1/customer/notifications/read-all - Mark All Read
// -------------------------------------------------------------
router.post('/notifications/read-all', async (req: any, res, next) => {
  try {
    await customerStorage.markAllCustomerNotificationsRead(req.customer.id);
    res.json({ success: true, message: 'Todas as notificações foram marcadas como lidas.' });
  } catch (err) {
    next(err);
  }
});

export default router;

