import { Request, Response, NextFunction } from 'express';
import { memoryStore } from '../storage.js';
import { saasService } from '../saasService.js';

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

    const sessionData = JSON.parse(Buffer.from(rawSession, 'base64').toString('utf8'));
    
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
