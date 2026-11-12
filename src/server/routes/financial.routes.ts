import { Router } from 'express';
import { requireRole, requireStaff } from '../middleware/auth.js';
import { financialService } from '../financialService.js';
import { db } from '../storage.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  payExpenseSchema,
  reverseExpenseSchema,
  recordBalancePaymentSchema,
  reconcilePaymentDiscrepancySchema,
  manualCashAdjustmentSchema,
  reverseCashTransactionSchema,
  commissionRuleSchema,
  commissionActionSchema,
} from '../validation/schemas.js';

const router = Router();

router.use(requireStaff);

// 1. Dashboard Financeiro (Visão financeira geral)
router.get('/dashboard', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { preset, startDate, endDate } = req.query;
    const data = financialService.getFinancialDashboard(tenantId, {
      preset: preset ? String(preset) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 2. Receitas e Recebimentos
router.get('/receipts', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const {
      status,
      paymentMethod,
      paymentType,
      professionalId,
      serviceId,
      startDate,
      endDate,
      page,
      pageSize,
    } = req.query;
    const result = financialService.listReceipts(tenantId, {
      status: status ? String(status) : undefined,
      paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
      paymentType: paymentType ? String(paymentType) : undefined,
      professionalId: professionalId ? String(professionalId) : undefined,
      serviceId: serviceId ? String(serviceId) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
});

// Registrar recebimento de saldo ou pagamento integral presencial
router.post('/receipts/record-payment', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = recordBalancePaymentSchema.parse(req.body);
    const result = financialService.recordBalanceOrFullPayment(tenantId, actorId, parsed);
    res.status(201).json({
      success: true,
      data: result.payment,
      remainingBalanceCents: result.remainingBalanceCents,
    });
  } catch (err) {
    next(err);
  }
});

// Conciliação / sinalização de divergência de pagamento
router.post('/receipts/:id/reconcile', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = reconcilePaymentDiscrepancySchema.parse(req.body);
    const updated = financialService.reconcilePayment(tenantId, req.params.id, actorId, parsed);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// 3. Contas a Receber (Saldos pendentes de clientes)
router.get('/accounts-receivable', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { clientId, professionalId, status, startDate, endDate } = req.query;
    const items = financialService.getAccountsReceivable(tenantId, {
      clientId: clientId ? String(clientId) : undefined,
      professionalId: professionalId ? String(professionalId) : undefined,
      status: status ? String(status) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });
    const totalPendingCents = items.reduce(
      (acc: number, item: any) => acc + Number(item.pendingBalanceCents || 0),
      0
    );
    res.json({
      success: true,
      data: items,
      summary: {
        count: items.length,
        totalPendingCents,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4 & 5. Despesas e Contas a Pagar
router.get('/expenses', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { category, status, onlyOverdue, startDate, endDate } = req.query;
    const items = financialService.listExpenses(tenantId, {
      category: category ? String(category) : undefined,
      status: status ? String(status) : undefined,
      onlyOverdue: onlyOverdue === 'true',
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

router.post('/expenses', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = createExpenseSchema.parse(req.body);
    const created = financialService.createExpense(tenantId, actorId, parsed);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.put('/expenses/:id', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = updateExpenseSchema.parse(req.body);
    const updated = financialService.updateExpense(tenantId, req.params.id, actorId, parsed);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/expenses/:id/pay', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = payExpenseSchema.parse(req.body);
    const paid = financialService.payExpense(tenantId, req.params.id, actorId, parsed);
    res.json({ success: true, data: paid });
  } catch (err) {
    next(err);
  }
});

router.post('/expenses/:id/reverse', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = reverseExpenseSchema.parse(req.body);
    const reversed = financialService.reverseOrCancelExpense(
      tenantId,
      req.params.id,
      actorId,
      parsed.reason
    );
    res.json({ success: true, data: reversed });
  } catch (err) {
    next(err);
  }
});

// Impedir exclusão silenciosa de despesas pagas/confirmadas
router.delete('/expenses/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  return res.status(400).json({
    success: false,
    error:
      'Despesas registradas não podem ser apagadas silenciosamente. Utilize a operação de cancelamento ou estorno com justificativa para preservar o histórico de auditoria.',
  });
});

// 6. Caixa e Movimentações (Livro de Caixa / Ledger)
router.get('/ledger', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { type, status, origin, startDate, endDate, page, pageSize } = req.query;
    const result = financialService.listLedgerTransactions(tenantId, {
      type: type ? String(type) : undefined,
      status: status ? String(status) : undefined,
      origin: origin ? String(origin) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
    res.json({
      success: true,
      data: result.items,
      summary: result.summary,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/ledger/adjustments', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const actorName = req.user?.name || 'Administrador';
    const parsed = manualCashAdjustmentSchema.parse(req.body);
    const entry = financialService.createManualCashAdjustment(tenantId, actorId, actorName, parsed);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

router.post('/ledger/:id/reverse', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const actorName = req.user?.name || 'Administrador';
    const parsed = reverseCashTransactionSchema.parse(req.body);
    const result = financialService.reverseLedgerTransaction(
      tenantId,
      req.params.id,
      actorId,
      actorName,
      parsed.justification
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Bloquear edição ou exclusão direta de lançamentos confirmados no livro de caixa
router.delete('/ledger/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  return res.status(400).json({
    success: false,
    error:
      'Lançamentos financeiros confirmados não podem ser excluídos diretamente. Utilize o fluxo de estorno auditado com justificativa.',
  });
});

router.put('/ledger/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  return res.status(400).json({
    success: false,
    error:
      'Lançamentos financeiros confirmados são imutáveis. Para corrigir valores, realize um estorno ou ajuste administrativo justificado.',
  });
});

// 7. Reembolsos no Módulo Financeiro
router.get('/refunds', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { status, startDate, endDate } = req.query;
    const items = financialService.listRefundsFinancial(tenantId, {
      status: status ? String(status) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

router.post('/refunds/validate', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const { paymentId, amountCents, reason } = req.body || {};
    const check = financialService.validateAndCreateRefundSafe(tenantId, actorId, {
      paymentId: String(paymentId || ''),
      amountCents: Number(amountCents || 0),
      reason: String(reason || ''),
    });
    res.json({ success: true, data: check });
  } catch (err) {
    next(err);
  }
});

// 8. Comissões e Regras de Comissão
router.get('/commission-rules', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const rules = financialService.listCommissionRules(tenantId);
    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
});

router.post('/commission-rules', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = commissionRuleSchema.parse(req.body);
    const rule = financialService.upsertCommissionRule(tenantId, actorId, parsed);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
});

router.get('/commissions', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const role = req.tenantContext!.role;
    const userProfId = req.tenantContext!.professionalId;

    if (role === 'RECEPTIONIST' || role === 'CUSTOMER') {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: seu perfil não possui permissão para consultar comissões.',
      });
    }

    let filterProfId = req.query.professionalId ? String(req.query.professionalId) : undefined;

    if (role === 'PROFESSIONAL') {
      if (!userProfId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: perfil profissional sem vínculo para consulta de comissões próprias.',
        });
      }
      if (filterProfId && filterProfId !== userProfId) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem consultar suas próprias comissões.',
        });
      }
      filterProfId = userProfId;
    }

    const { serviceId, status, startDate, endDate } = req.query;
    const result = financialService.listCommissions(tenantId, {
      professionalId: filterProfId,
      serviceId: serviceId ? String(serviceId) : undefined,
      status: status ? String(status) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });

    res.json({ success: true, data: result.items, summary: result.summary });
  } catch (err) {
    next(err);
  }
});

router.post('/commissions/:id/action', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const actorId = req.user?.id || 'STAFF';
    const parsed = commissionActionSchema.parse(req.body);
    const updated = financialService.updateCommissionRecord(
      tenantId,
      req.params.id,
      actorId,
      parsed
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// 9. Relatórios Gerenciais
router.get('/reports', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { preset, startDate, endDate, professionalId, serviceId } = req.query;
    const data = financialService.getFinancialReports(tenantId, {
      preset: preset ? String(preset) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      professionalId: professionalId ? String(professionalId) : undefined,
      serviceId: serviceId ? String(serviceId) : undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 10. Exportação de Dados (CSV e Relatório Imprimível/PDF)
router.get('/export/csv', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { preset, startDate, endDate } = req.query;
    const business = await db.getBusiness(tenantId);
    const csvContent = financialService.exportFinancialCsv(
      tenantId,
      business?.name || 'Agenda Beauty',
      {
        preset: preset ? String(preset) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      }
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="financeiro-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send('\uFEFF' + csvContent);
  } catch (err) {
    next(err);
  }
});

router.get('/export/pdf', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const { preset, startDate, endDate } = req.query;
    const business = await db.getBusiness(tenantId);
    const htmlContent = financialService.exportFinancialPrintableHtml(
      tenantId,
      business?.name || 'Agenda Beauty',
      {
        preset: preset ? String(preset) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      }
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (err) {
    next(err);
  }
});

export default router;
