import { Router } from 'express';
import { cancellationService } from '../cancellationService.js';
import { adminCancellationDecisionSchema, adminRefundExecutionSchema } from '../validation/schemas.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Ensure only administrative / establishment staff can access admin cancellation routes
router.use((req, res, next) => {
  if (!req.user || !req.tenantContext) {
    return res.status(401).json({ success: false, error: 'Acesso não autenticado' });
  }
  if (req.tenantContext.role === 'CUSTOMER') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: apenas a administração do estabelecimento pode gerenciar solicitações de cancelamento.',
    });
  }
  next();
});

// GET /api/v1/admin/cancellation-requests
router.get('/', requireRole(['OWNER', 'MANAGER', 'RECEPTIONIST']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'ALL';
    const requests = await cancellationService.listAdminCancellationRequests(tenantId, filter);
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/cancellation-requests/:requestId/decision
router.post('/:requestId/decision', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const requestId = req.params.requestId;
    const adminUserId = req.user?.id || 'admin';

    const parsed = adminCancellationDecisionSchema.parse(req.body);
    const updated = await cancellationService.processAdminDecision({
      tenantId,
      requestId,
      adminUserId,
      decision: parsed.decision,
      justification: parsed.justification,
      authorizeExceptionRefund: parsed.authorizeExceptionRefund,
    });

    res.json({
      success: true,
      data: updated,
      message:
        parsed.decision === 'APPROVE'
          ? 'Solicitação de cancelamento aprovada com sucesso.'
          : 'Solicitação de cancelamento rejeitada.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/cancellation-requests/:requestId/refund
router.post('/:requestId/refund', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const requestId = req.params.requestId;
    const adminUserId = req.user?.id || 'admin';

    // Check for forbidden frontend overrides before parsing
    if (req.body && (req.body.amountCents !== undefined || req.body.refundableAmountCents !== undefined)) {
      return res.status(400).json({
        success: false,
        error: 'Violação de segurança: o valor do reembolso não pode ser modificado pelo frontend.',
      });
    }

    const parsed = adminRefundExecutionSchema.parse(req.body || {});
    const updated = await cancellationService.executeRefund({
      tenantId,
      requestId,
      adminUserId,
      notes: parsed.notes,
      rawBody: req.body,
    });

    res.json({
      success: true,
      data: updated,
      message: 'Operação de reembolso processada junto ao provedor financeiro.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
