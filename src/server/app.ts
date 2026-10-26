import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

import authRouter from './routes/auth.routes.js';
import healthRouter from './routes/health.routes.js';
import businessRouter from './routes/business.routes.js';
import clientsRouter from './routes/clients.routes.js';
import servicesRouter from './routes/services.routes.js';
import professionalsRouter from './routes/professionals.routes.js';
import appointmentsRouter from './routes/appointments.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';

export function createApp() {
  const app = express();

  // Trust proxy for Cloud Run / reverse proxy environments
  app.set('trust proxy', 1);

  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // Public & Auth routes
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);

  // Protected multi-tenant routes (authMiddleware resolves tenant from session cookie)
  app.use('/api/v1/business', authMiddleware, businessRouter);
  app.use('/api/v1/clients', authMiddleware, clientsRouter);
  app.use('/api/v1/services', authMiddleware, servicesRouter);
  app.use('/api/v1/professionals', authMiddleware, professionalsRouter);
  app.use('/api/v1/appointments', authMiddleware, appointmentsRouter);
  app.use('/api/v1/dashboard', authMiddleware, dashboardRouter);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
