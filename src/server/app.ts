import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler.js';
import {
  securityHeadersMiddleware,
  compressionMiddleware,
  robotsTxtHandler,
  sitemapXmlHandler,
} from './middleware/securityHeaders.js';
import {
  authMiddleware,
  requireMasterAdmin,
  enforceTenantOperationalAccess,
} from './middleware/auth.js';

import authRouter from './routes/auth.routes.js';
import healthRouter from './routes/health.routes.js';
import publicRouter from './routes/public.routes.js';
import masterAdminRouter from './routes/masterAdmin.routes.js';
import businessRouter from './routes/business.routes.js';
import clientsRouter from './routes/clients.routes.js';
import servicesRouter from './routes/services.routes.js';
import professionalsRouter from './routes/professionals.routes.js';
import appointmentsRouter from './routes/appointments.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import paymentsRouter from './routes/payments.routes.js';
import webhooksRouter from './routes/webhooks.routes.js';
import customerRouter from './routes/customer.routes.js';
import cancellationsRouter from './routes/cancellations.routes.js';
import financialRouter from './routes/financial.routes.js';
import whatsappRouter from './routes/whatsapp.routes.js';
import advancedRouter from './routes/advanced.routes.js';

export function createApp() {
  for (const [key, val] of Object.entries(process.env)) {
    if (typeof val === 'string' && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
      process.env[key] = val.slice(1, -1).trim();
    }
  }

  const app = express();

  // Hide server fingerprint
  app.disable('x-powered-by');

  // Trust proxy for Hostinger LiteSpeed / Passenger / Cloud Run reverse proxy environments
  app.set('trust proxy', 1);

  // Enterprise HTTP Security Headers & Gzip Compression
  app.use(securityHeadersMiddleware);
  app.use(compressionMiddleware);

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.APP_BASE_URL || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.use((req, res, next) => {
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!isProd) return callback(null, true);
        const cleanOrigin = origin.replace(/\/+$/, '');
        if (allowedOrigins.length === 0 || allowedOrigins.includes(cleanOrigin)) {
          return callback(null, true);
        }
        try {
          const parsedUrl = new URL(cleanOrigin);
          const originHost = parsedUrl.host;
          const reqHost = req.headers['x-forwarded-host'] || req.headers.host;
          if (
            (reqHost && originHost === reqHost) ||
            originHost.endsWith('.netlify.app') ||
            originHost.endsWith('.run.app')
          ) {
            return callback(null, true);
          }
        } catch {}
        return callback(new Error('Origem não autorizada pela política de CORS em produção.'));
      },
      credentials: true,
    })(req, res, next);
  });

  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // SEO Crawling Endpoints
  app.get('/robots.txt', robotsTxtHandler);
  app.get('/sitemap.xml', sitemapXmlHandler);

  // Public & Webhook routes
  app.use('/api/health', healthRouter);
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/webhooks', webhooksRouter);

  // Master Admin SaaS routes (strictly protected by authMiddleware + requireMasterAdmin)
  app.use('/api/v1/master-admin', authMiddleware, requireMasterAdmin, masterAdminRouter);

  // Customer Portal routes (register, directory, catalog, and available-slots are public; me, appointments, etc. require auth)
  app.use('/api/v1/customer', (req, res, next) => {
    if (
      req.path.startsWith('/auth') ||
      req.path === '/directory' ||
      req.path === '/catalog' ||
      req.path === '/available-slots'
    ) {
      return next();
    }
    return authMiddleware(req, res, next);
  }, customerRouter);

  // Payments & Checkout routes (public checkout + admin routes)
  app.use('/api/v1', paymentsRouter);

  // Protected multi-tenant routes (authMiddleware resolves tenant from session cookie + enforceTenantOperationalAccess blocks write actions when tenant is BLOCKED/CANCELLED)
  app.use('/api/v1/business', authMiddleware, enforceTenantOperationalAccess, businessRouter);
  app.use('/api/v1/clients', authMiddleware, enforceTenantOperationalAccess, clientsRouter);
  app.use('/api/v1/services', authMiddleware, enforceTenantOperationalAccess, servicesRouter);
  app.use('/api/v1/professionals', authMiddleware, enforceTenantOperationalAccess, professionalsRouter);
  app.use('/api/v1/appointments', authMiddleware, enforceTenantOperationalAccess, appointmentsRouter);
  app.use('/api/v1/dashboard', authMiddleware, dashboardRouter);
  app.use('/api/v1/admin/cancellation-requests', authMiddleware, enforceTenantOperationalAccess, cancellationsRouter);
  app.use('/api/v1/financial', authMiddleware, enforceTenantOperationalAccess, financialRouter);
  app.use('/api/v1/whatsapp', authMiddleware, enforceTenantOperationalAccess, whatsappRouter);
  app.use('/api/v1/advanced', authMiddleware, enforceTenantOperationalAccess, advancedRouter);

  // Unmatched API routes must return 404 JSON instead of falling through to Vite SPA HTML
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      error: `Rota da API não encontrada: ${req.method} ${req.originalUrl}`,
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
