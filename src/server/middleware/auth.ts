import { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export interface TenantContext {
  tenantId: string;
  role: 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'RECEPTIONIST' | 'PROFESSIONAL';
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantContext?: TenantContext;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionCookie = req.cookies?.agenda_session || req.headers['x-session-token'];

    if (!sessionCookie) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }

    const sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString('utf8'));
    
    if (sessionData && sessionData.userId) {
      req.user = {
        id: sessionData.userId,
        name: sessionData.userName || 'Usuário',
        email: sessionData.email || '',
        active: true,
      };
      req.tenantContext = {
        tenantId: sessionData.tenantId || 'biz-1',
        role: sessionData.role || 'OWNER',
        permissions: sessionData.permissions || ['*'],
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

    if (req.tenantContext.role === 'SUPER_ADMIN') {
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
