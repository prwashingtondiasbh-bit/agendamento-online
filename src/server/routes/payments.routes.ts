import { Router, Request, Response, NextFunction } from 'express';
import { paymentService } from '../payments/PaymentService.js';
import { db, memoryStore } from '../storage.js';
import { customerStorage } from '../customerStorage.js';
import { saasService } from '../saasService.js';
import {
  authMiddleware,
  extractRawSessionToken,
  isSessionTokenRevoked,
  requireRole,
} from '../middleware/auth.js';

const router = Router();

// Middleware to resolve tenant and check permission
async function resolveTenantForAppointment(req: Request, res: Response, next: NextFunction) {
  saasService.ensureSaaSSeedData();
  const { appointmentId } = req.params;
  if (!appointmentId) {
    return res.status(400).json({ success: false, error: 'Identificador de agendamento não fornecido' });
  }

  // Extract session context if cookie/token is present
  const rawToken = extractRawSessionToken(req);
  if (!req.tenantContext && rawToken && !isSessionTokenRevoked(rawToken)) {
    try {
      const sessionData = JSON.parse(Buffer.from(rawToken, 'base64').toString('utf8'));
      if (sessionData && sessionData.userId) {
        req.user = {
          id: sessionData.userId,
          name: sessionData.userName || 'Usuário',
          email: sessionData.email || '',
          active: true,
          isMasterAdmin: Boolean(sessionData.isMasterAdmin),
        };
        req.tenantContext = {
          tenantId: sessionData.tenantId || 'biz-1',
          role: sessionData.role || 'OWNER',
          permissions: sessionData.permissions || ['*'],
        };
      }
    } catch (e) {}
  }

  // Look for appointment across all known tenants or memoryStore
  let appointment: any = null;
  const memMatch = (memoryStore.appointments as any[]).find((a) => a.id === appointmentId);
  if (memMatch) {
    appointment = await db.getAppointmentById(memMatch.tenantId, appointmentId);
  } else {
    const allTenantIds = Array.from(
      new Set(['biz-1', 'biz-2', 'biz-3', ...(memoryStore.tenants as any[]).map((t) => t.id)])
    );
    for (const tId of allTenantIds) {
      const found = await db.getAppointmentById(tId, appointmentId);
      if (found) {
        appointment = found;
        break;
      }
    }
  }

  if (!appointment) {
    return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
  }

  // Access verification when logged in
  if (req.tenantContext && req.user) {
    if (req.tenantContext.role === 'CUSTOMER') {
      // Customer can pay/poll their own appointment across any establishment they booked in
      const ownership = await customerStorage.resolveCustomerAppointmentOwnership(
        req.user.id,
        req.user.email,
        appointmentId
      );
      if (!ownership || ownership.tenantId !== appointment.tenantId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: este agendamento pertence a outro cliente ou estabelecimento.',
        });
      }
    } else if (
      req.tenantContext.role !== 'SUPER_ADMIN' &&
      !req.user.isMasterAdmin &&
      req.tenantContext.tenantId !== appointment.tenantId
    ) {
      // Staff/Owner cannot access another tenant's appointment unless they are a member of that tenant
      const memberships = saasService.getUserMemberships(req.user.id);
      const hasAccess = memberships.some((m: any) => m.tenantId === appointment.tenantId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: agendamento pertence a outro estabelecimento',
        });
      }
    }
  }

  (req as any).resolvedAppointment = appointment;
  (req as any).resolvedTenantId = appointment.tenantId;
  next();
}

/**
 * POST /api/v1/appointments/:appointmentId/payment
 * Generates or returns dynamic Pix payment
 */
router.post('/appointments/:appointmentId/payment', resolveTenantForAppointment, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).resolvedTenantId;
    const { appointmentId } = req.params;

    // Enforce plan deposit capability on backend
    try {
      saasService.assertPlanAllowsDeposit(tenantId);
    } catch (planErr: any) {
      return res.status(planErr.statusCode || 403).json({
        success: false,
        code: planErr.code || 'PLAN_DOES_NOT_ALLOW_DEPOSIT',
        error: planErr.message,
      });
    }

    const payment = await paymentService.createPixPaymentForAppointment(tenantId, appointmentId);
    return res.status(200).json({
      success: true,
      data: payment,
      message: payment.isExisting
        ? 'Cobrança Pix pendente recuperada com sucesso'
        : 'Cobrança Pix gerada com sucesso',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Falha ao processar pagamento Pix',
    });
  }
});

/**
 * GET /api/v1/appointments/:appointmentId/payment-status
 * Polling endpoint for customer checkout
 */
router.get('/appointments/:appointmentId/payment-status', resolveTenantForAppointment, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).resolvedTenantId;
    const { appointmentId } = req.params;

    const status = await paymentService.getPaymentStatus(tenantId, appointmentId);
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Erro ao consultar status do pagamento',
    });
  }
});

/**
 * GET /api/v1/payments
 * Administrative view of payments (restricted to OWNER and MANAGER)
 */
router.get('/payments', authMiddleware, requireRole(['OWNER', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { status, startDate, endDate } = req.query as {
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    const payments = await paymentService.listPayments(tenantId, {
      status,
      startDate,
      endDate,
    });

    return res.status(200).json({
      success: true,
      data: payments,
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/v1/payments/:id/reconcile
 * Manual reconciliation with Mercado Pago API (restricted to OWNER and MANAGER)
 */
router.post('/payments/:id/reconcile', authMiddleware, requireRole(['OWNER', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { id } = req.params;

    const result = await paymentService.reconcilePayment(tenantId, id);
    return res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Erro ao reconciliar pagamento',
    });
  }
});

export default router;
