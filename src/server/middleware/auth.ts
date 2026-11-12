import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { memoryStore } from '../storage.js';
import { saasService } from '../saasService.js';
import { getSecuritySecret } from './antiBot.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  active: boolean;
  phone?: string;
  isMasterAdmin?: boolean;
}

export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'RECEPTIONIST' | 'PROFESSIONAL' | 'CUSTOMER';

export interface TenantContext {
  tenantId: string;
  role: UserRole;
  permissions: string[];
  professionalId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantContext?: TenantContext;
    }
  }
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ['*'],
  OWNER: [
    'dashboard:read',
    'agenda:read',
    'agenda:write',
    'agenda:manage_all',
    'timeblock:manage',
    'clients:read',
    'clients:write',
    'clients:internal_notes',
    'services:read',
    'services:write',
    'professionals:read',
    'professionals:write',
    'cancellations:manage',
    'business:manage',
    'financial:read',
    'financial:write',
    'financial:expenses',
    'financial:cash',
    'financial:commissions',
    'financial:reports',
    'financial:export',
    'whatsapp:read',
    'whatsapp:manage',
    'whatsapp:send_manual',
    'waitlist:read',
    'waitlist:manage',
    'loyalty:read',
    'loyalty:manage',
    'coupons:read',
    'coupons:manage',
    'packages:read',
    'packages:manage',
    'giftcards:read',
    'giftcards:manage',
    'reviews:read',
    'reviews:manage',
    'campaigns:read',
    'campaigns:manage',
    'inventory:read',
    'inventory:manage',
    'locations:read',
    'locations:manage',
  ],
  MANAGER: [
    'dashboard:read',
    'agenda:read',
    'agenda:write',
    'agenda:manage_all',
    'timeblock:manage',
    'clients:read',
    'clients:write',
    'clients:internal_notes',
    'services:read',
    'services:write',
    'professionals:read',
    'professionals:write',
    'cancellations:manage',
    'financial:read',
    'financial:write',
    'financial:expenses',
    'financial:cash',
    'financial:commissions',
    'financial:reports',
    'financial:export',
    'whatsapp:read',
    'whatsapp:manage',
    'whatsapp:send_manual',
    'waitlist:read',
    'waitlist:manage',
    'loyalty:read',
    'loyalty:manage',
    'coupons:read',
    'coupons:manage',
    'packages:read',
    'packages:manage',
    'giftcards:read',
    'giftcards:manage',
    'reviews:read',
    'reviews:manage',
    'campaigns:read',
    'campaigns:manage',
    'inventory:read',
    'inventory:manage',
    'locations:read',
    'locations:manage',
  ],
  RECEPTIONIST: [
    'dashboard:read',
    'agenda:read',
    'agenda:write',
    'agenda:manage_all',
    'timeblock:manage',
    'clients:read',
    'clients:write',
    'clients:internal_notes',
    'services:read',
    'professionals:read',
    'whatsapp:read',
    'whatsapp:send_manual',
    'waitlist:read',
    'waitlist:manage',
    'loyalty:read',
    'coupons:read',
    'packages:read',
    'giftcards:read',
    'reviews:read',
    'inventory:read',
    'locations:read',
  ],
  PROFESSIONAL: [
    'dashboard:read',
    'agenda:read',
    'agenda:write_own',
    'timeblock:manage_own',
    'clients:read_basic',
    'services:read',
    'professionals:read',
    'commissions:read_own',
    'reviews:read',
    'locations:read',
  ],
  CUSTOMER: [],
};

export function hasPermission(role: UserRole | undefined, permission: string): boolean {
  if (!role) return false;
  if (role === 'SUPER_ADMIN' || role === 'OWNER') return true;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

const revokedSessionTokens = new Set<string>();
const DEFAULT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signSessionToken(payload: Record<string, any>): string {
  const enriched = {
    ...payload,
    iat: payload.iat || Date.now(),
    exp: payload.exp || Date.now() + DEFAULT_SESSION_MAX_AGE_MS,
  };
  const bodyB64 = Buffer.from(JSON.stringify(enriched), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecuritySecret())
    .update(bodyB64)
    .digest('hex');
  return `${bodyB64}.${sig}`;
}

export function verifySessionToken(
  rawToken: string,
  options?: { strictSignature?: boolean }
): { valid: boolean; data?: any; reason?: string } {
  const clean = String(rawToken || '').trim();
  if (!clean) return { valid: false, reason: 'EMPTY_TOKEN' };

  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'MALFORMED_SIGNED_TOKEN' };
    }
    const [bodyB64, providedSig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getSecuritySecret())
      .update(bodyB64)
      .digest('hex');

    const sigBuf = Buffer.from(providedSig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    try {
      const parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
      if (parsed?.exp && Date.now() > Number(parsed.exp)) {
        return { valid: false, reason: 'SESSION_EXPIRED' };
      }
      return { valid: true, data: parsed };
    } catch {
      return { valid: false, reason: 'MALFORMED_PAYLOAD' };
    }
  }

  // Unsigned legacy Base64 JSON tokens are strictly rejected in production or when signature enforcement is requested
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.AGENDA_TEST_MODE === '1';
  if (!isTestMode || options?.strictSignature) {
    return { valid: false, reason: 'SIGNATURE_REQUIRED' };
  }

  try {
    const parsed = JSON.parse(Buffer.from(clean, 'base64').toString('utf8'));
    return { valid: true, data: parsed };
  } catch {
    return { valid: false, reason: 'MALFORMED_LEGACY_TOKEN' };
  }
}

export function extractRawSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const raw = req.cookies?.agenda_session || req.headers['x-session-token'] || bearerToken;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export function revokeSessionToken(rawToken: string | null | undefined): void {
  if (rawToken && typeof rawToken === 'string') {
    revokedSessionTokens.add(rawToken.trim());
  }
}

export function isSessionTokenRevoked(rawToken: string | null | undefined): boolean {
  if (!rawToken || typeof rawToken !== 'string') return false;
  return revokedSessionTokens.has(rawToken.trim());
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    saasService.ensureSaaSSeedData();
    const rawSession = extractRawSessionToken(req);

    if (!rawSession) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }

    if (isSessionTokenRevoked(rawSession)) {
      return res.status(401).json({ success: false, error: 'Sessão encerrada. Faça login novamente.' });
    }

    const strictSignature = req.headers['x-enforce-token-signature'] === 'true';
    const verified = verifySessionToken(rawSession, { strictSignature });
    if (!verified.valid || !verified.data) {
      return res.status(401).json({
        success: false,
        code: verified.reason || 'INVALID_SESSION',
        error: 'Sessão inválida ou expirada. Faça login novamente.',
      });
    }

    const sessionData = verified.data;
    
    if (sessionData && sessionData.userId) {
      const serverUser = (memoryStore.users as any[]).find(
        (u) => u.id === sessionData.userId || (sessionData.email && u.email === sessionData.email)
      );
      if (serverUser && serverUser.active === false) {
        return res.status(403).json({
          success: false,
          code: 'USER_INACTIVE',
          error: 'Sua conta de usuário está desativada.',
        });
      }

      const verifiedIsMasterAdmin = serverUser
        ? Boolean(serverUser.isMasterAdmin || serverUser.role === 'SUPER_ADMIN')
        : Boolean(sessionData.role === 'SUPER_ADMIN' && String(sessionData.userId).startsWith('user-master'));

      let role: UserRole = sessionData.role || 'OWNER';
      if (role === 'SUPER_ADMIN' && !verifiedIsMasterAdmin && serverUser) {
        role = (serverUser.role as UserRole) || 'OWNER';
      }

      req.user = {
        id: sessionData.userId,
        name: sessionData.userName || serverUser?.name || 'Usuário',
        email: serverUser?.email || sessionData.email || '',
        phone: serverUser?.phone || sessionData.phone || undefined,
        active: true,
        isMasterAdmin: verifiedIsMasterAdmin,
      };
      req.tenantContext = {
        tenantId: sessionData.tenantId || serverUser?.tenantId || 'biz-1',
        role,
        permissions: sessionData.permissions || ROLE_PERMISSIONS[role] || [],
        professionalId: sessionData.professionalId || serverUser?.professionalId || undefined,
      };
      return next();
    }

    return res.status(401).json({ success: false, error: 'Sessão inválida' });
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Erro de autenticação' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantContext) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }

    if (req.tenantContext.role === 'SUPER_ADMIN' && req.user?.isMasterAdmin) {
      return next();
    }

    if (!allowedRoles.includes(req.tenantContext.role)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: permissões insuficientes para esta operação',
      });
    }

    next();
  };
}

export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.tenantContext) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }
  if (!req.user.isMasterAdmin && req.tenantContext.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      code: 'MASTER_ADMIN_REQUIRED',
      error: 'Acesso restrito ao Master Admin global do Agenda Beauty.',
    });
  }
  const serverUser = (memoryStore.users as any[]).find((u) => u.id === req.user!.id);
  if (serverUser && !serverUser.isMasterAdmin && serverUser.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      code: 'MASTER_ADMIN_REQUIRED',
      error: 'Acesso restrito ao Master Admin global do Agenda Beauty.',
    });
  }
  next();
}

export function enforceTenantOperationalAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext) {
    return next();
  }
  if (req.user?.isMasterAdmin || req.tenantContext.role === 'SUPER_ADMIN') {
    return next();
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    return next();
  }
  try {
    saasService.assertTenantOperationalWriteAllowed(req.tenantContext.tenantId);
    return next();
  } catch (err: any) {
    return res.status(err.statusCode || 403).json({
      success: false,
      code: err.code || 'TENANT_ACCESS_SUSPENDED',
      error: err.message || 'O acesso administrativo deste estabelecimento encontra-se suspenso.',
      blockedReason: err.blockedReason || null,
    });
  }
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }
  if (req.tenantContext.role === 'CUSTOMER') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: clientes não possuem acesso ao painel administrativo do estabelecimento.',
    });
  }
  next();
}
