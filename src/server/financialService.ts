import { db, memoryStore } from './storage.js';

export function formatBrl(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safeCents < 0 ? '-' : '';
  const abs = Math.abs(safeCents);
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const reaisFormatted = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${reaisFormatted},${centavos.toString().padStart(2, '0')}`;
}

export interface PeriodFilterInput {
  preset?: string; // TODAY | LAST_7_DAYS | THIS_MONTH | LAST_MONTH | CUSTOM | ALL
  startDate?: string;
  endDate?: string;
  referenceNow?: Date;
}

export function resolvePeriodRange(input?: PeriodFilterInput): {
  preset: string;
  startDate: string;
  endDate: string;
  startMs: number;
  endMs: number;
  label: string;
} {
  const now = input?.referenceNow ? new Date(input.referenceNow) : new Date();
  const preset = (input?.preset || 'THIS_MONTH').toUpperCase();

  if (preset === 'ALL') {
    const start = new Date('2020-01-01T00:00:00.000Z');
    const end = new Date('2099-12-31T23:59:59.999Z');
    return {
      preset: 'ALL',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: 'Todo o período',
    };
  }

  if (preset === 'CUSTOM' && input?.startDate && input?.endDate) {
    const sStr = input.startDate.includes('T') ? input.startDate : `${input.startDate}T00:00:00.000Z`;
    const eStr = input.endDate.includes('T') ? input.endDate : `${input.endDate}T23:59:59.999Z`;
    const start = new Date(sStr);
    const end = new Date(eStr);
    return {
      preset: 'CUSTOM',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Período personalizado (${input.startDate.slice(0, 10)} a ${input.endDate.slice(0, 10)})`,
    };
  }

  const todayYmd = now.toISOString().slice(0, 10);

  if (preset === 'TODAY') {
    const start = new Date(`${todayYmd}T00:00:00.000Z`);
    const end = new Date(`${todayYmd}T23:59:59.999Z`);
    return {
      preset: 'TODAY',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: `Hoje (${todayYmd})`,
    };
  }

  if (preset === 'LAST_7_DAYS') {
    const end = new Date(`${todayYmd}T23:59:59.999Z`);
    const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000 + 1);
    return {
      preset: 'LAST_7_DAYS',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: 'Últimos 7 dias',
    };
  }

  if (preset === 'LAST_MONTH') {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed
    const firstDayPrevMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const lastDayPrevMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return {
      preset: 'LAST_MONTH',
      startDate: firstDayPrevMonth.toISOString(),
      endDate: lastDayPrevMonth.toISOString(),
      startMs: firstDayPrevMonth.getTime(),
      endMs: lastDayPrevMonth.getTime(),
      label: 'Mês anterior',
    };
  }

  // Default: THIS_MONTH (expanded to include last 30 days & next 30 days when no explicit dates passed so seed data is visible, or strict month if startDate specified)
  if (input?.startDate && input?.endDate) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    return {
      preset: 'THIS_MONTH',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
      label: 'Este mês',
    };
  }

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return {
    preset: 'THIS_MONTH',
    startDate: firstDay.toISOString(),
    endDate: lastDay.toISOString(),
    startMs: firstDay.getTime(),
    endMs: lastDay.getTime(),
    label: 'Este mês',
  };
}

/**
 * Rule documented for temporal classification of confirmed receipts:
 * - Uses `approvedAt` (payment confirmation date) as the primary timestamp; falls back to `createdAt` only if `approvedAt` is missing.
 */
export function getPaymentConfirmationTimestamp(payment: any): number {
  const ts = payment.approvedAt || payment.createdAt;
  return ts ? new Date(ts).getTime() : 0;
}

export function isPaymentConfirmed(payment: any): boolean {
  return ['APPROVED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status) && Boolean(payment.approvedAt || payment.status === 'APPROVED');
}

export const financialService = {
  /**
   * Synchronizes confirmed payments, paid expenses, completed refunds, and paid commissions
   * into the tenant's cash ledger (`memoryStore.financialTransactions`) idempotently using `uniqueRef`.
   */
  syncLedgerForTenant(tenantId: string) {
    // 1. Confirmed Payments -> INFLOW
    const tenantPayments = memoryStore.payments.filter((p: any) => p.tenantId === tenantId);
    for (const pay of tenantPayments) {
      if (!isPaymentConfirmed(pay)) continue;
      const uniqueRef = `PAY:${pay.id}`;
      const existing = memoryStore.financialTransactions.find(
        (t: any) => t.tenantId === tenantId && t.uniqueRef === uniqueRef
      );
      const amountCents = Number(pay.amountCents || 0);
      const feeCents = pay.feeCents !== undefined && pay.feeCents !== null ? Number(pay.feeCents) : null;
      const netAmountCents =
        pay.netAmountCents !== undefined && pay.netAmountCents !== null
          ? Number(pay.netAmountCents)
          : amountCents - (feeCents || 0);

      const app = memoryStore.appointments.find((a: any) => a.id === pay.appointmentId);
      const client = app ? memoryStore.clients.find((c: any) => c.id === app.clientId) : null;
      const service = app ? memoryStore.services.find((s: any) => s.id === app.serviceId) : null;
      const pType = pay.paymentType || (app && amountCents < Number(app.snapshotPriceCents || app.totalAmountCents || 0) ? 'DEPOSIT' : 'FULL');
      const pTypeLabel = pType === 'DEPOSIT' ? 'Sinal' : pType === 'BALANCE' ? 'Saldo' : 'Pagamento Integral';

      if (!existing) {
        const occurredAt = pay.approvedAt || pay.createdAt || new Date().toISOString();
        memoryStore.financialTransactions.push({
          id: `ftx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          tenantId,
          uniqueRef,
          type: 'INFLOW',
          origin: pay.provider === 'PRESENCIAL' ? 'PAYMENT_PRESENCIAL' : 'PAYMENT_PROVIDER',
          originId: pay.id,
          amountCents,
          feeCents,
          netAmountCents,
          category: `RECEITA_${pType}`,
          description: `${pTypeLabel} — ${service?.name || 'Atendimento'} (${client?.name || 'Cliente'})`,
          paymentMethod: pay.paymentMethod || 'PIX',
          actorId: pay.createdBy || 'SYSTEM',
          actorName: pay.provider === 'PRESENCIAL' ? 'Recepção / Painel' : pay.provider || 'Mercado Pago',
          status: pay.reconciliationStatus === 'DISCREPANCY' ? 'FLAGGED_FOR_REVIEW' : 'CONFIRMED',
          reconciliationStatus: pay.reconciliationStatus || 'RECONCILED',
          reconciliationDiscrepancy: pay.reconciliationDiscrepancy || null,
          justification: null,
          history: [
            {
              timestamp: occurredAt,
              actor: 'SYSTEM',
              action: 'LEDGER_ENTRY_CREATED',
              note: `Entrada automática referente ao pagamento confirmado ${pay.id}`,
            },
          ],
          occurredAt,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
      } else {
        // Keep reconciliation status synced if flagged
        if (pay.reconciliationStatus === 'DISCREPANCY') {
          existing.reconciliationStatus = 'DISCREPANCY';
          existing.status = 'FLAGGED_FOR_REVIEW';
          existing.reconciliationDiscrepancy = pay.reconciliationDiscrepancy || existing.reconciliationDiscrepancy;
        }
      }
    }

    // 2. Paid Expenses -> OUTFLOW
    const tenantExpenses = memoryStore.expenses.filter((e: any) => e.tenantId === tenantId);
    for (const exp of tenantExpenses) {
      if (exp.status === 'PAID' || exp.status === 'REVERSED') {
        const uniqueRef = `EXP:${exp.id}`;
        const existing = memoryStore.financialTransactions.find(
          (t: any) => t.tenantId === tenantId && t.uniqueRef === uniqueRef
        );
        const occurredAt = exp.paidAt || exp.updatedAt || exp.createdAt;
        if (!existing) {
          memoryStore.financialTransactions.push({
            id: `ftx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            tenantId,
            uniqueRef,
            type: 'OUTFLOW',
            origin: 'EXPENSE_PAID',
            originId: exp.id,
            amountCents: Number(exp.amountCents),
            feeCents: 0,
            netAmountCents: Number(exp.amountCents),
            category: exp.category || 'OUTRAS',
            description: `Despesa paga: ${exp.description}`,
            paymentMethod: exp.paymentMethod || 'PIX',
            actorId: exp.paidBy || exp.createdBy || 'SYSTEM',
            actorName: 'Administração',
            status: exp.status === 'REVERSED' ? 'REVERSED' : 'CONFIRMED',
            reconciliationStatus: 'RECONCILED',
            reconciliationDiscrepancy: null,
            justification: exp.cancellationReason || null,
            history: [
              {
                timestamp: occurredAt,
                actor: exp.paidBy || 'STAFF',
                action: 'EXPENSE_OUTFLOW_RECORDED',
                note: `Saída de caixa gerada pelo pagamento da despesa ${exp.id}`,
              },
            ],
            occurredAt,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          });
        } else if (exp.status === 'REVERSED' && existing.status !== 'REVERSED') {
          existing.status = 'REVERSED';
          existing.updatedAt = new Date().toISOString();
        }
      }
    }

    // 3. Completed Refunds -> OUTFLOW
    const tenantRefunds = memoryStore.refundRequests.filter((r: any) => r.tenantId === tenantId);
    for (const ref of tenantRefunds) {
      if (ref.status !== 'COMPLETED') continue;
      const uniqueRef = `REF:${ref.id}`;
      const existing = memoryStore.financialTransactions.find(
        (t: any) => t.tenantId === tenantId && t.uniqueRef === uniqueRef
      );
      if (!existing) {
        const occurredAt = ref.completedAt || ref.updatedAt || ref.createdAt;
        const app = memoryStore.appointments.find((a: any) => a.id === ref.appointmentId);
        const client = memoryStore.clients.find((c: any) => c.id === ref.clientId);
        memoryStore.financialTransactions.push({
          id: `ftx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          tenantId,
          uniqueRef,
          type: 'OUTFLOW',
          origin: 'REFUND_COMPLETED',
          originId: ref.id,
          amountCents: Number(ref.amountCents),
          feeCents: 0,
          netAmountCents: Number(ref.amountCents),
          category: 'REEMBOLSO_CLIENTE',
          description: `Reembolso concluído — ${client?.name || 'Cliente'} (Agendamento ${app?.id || ref.appointmentId})`,
          paymentMethod: 'PIX',
          actorId: ref.authorizedBy || 'SYSTEM',
          actorName: 'Administração',
          status: 'CONFIRMED',
          reconciliationStatus: 'RECONCILED',
          reconciliationDiscrepancy: null,
          justification: null,
          history: [
            {
              timestamp: occurredAt,
              actor: ref.authorizedBy || 'SYSTEM',
              action: 'REFUND_OUTFLOW_RECORDED',
              note: `Saída de caixa referente ao reembolso concluído ${ref.id}`,
            },
          ],
          occurredAt,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
      }
    }
  },

  /**
   * Synchronizes and calculates CommissionRecords for all appointments of the tenant.
   * Priority order (Section 11):
   * 1. Specific rule for (professionalId + serviceId) [scope === 'PROFESSIONAL_SERVICE']
   * 2. Service rule (serviceId) [scope === 'SERVICE']
   * 3. Professional rule (professionalId) [scope === 'PROFESSIONAL']
   * Never invents a percentage if no rule is configured!
   * Guarantees 1 CommissionRecord per (tenantId, appointmentId).
   */
  syncCommissionsForTenant(tenantId: string) {
    const appointments = memoryStore.appointments.filter((a: any) => a.tenantId === tenantId);
    const activeRules = memoryStore.commissionRules.filter(
      (r: any) => r.tenantId === tenantId && r.active !== false
    );

    for (const app of appointments) {
      // Find applicable rule according to strict priority
      const ruleProfService = activeRules.find(
        (r: any) =>
          r.scope === 'PROFESSIONAL_SERVICE' &&
          r.professionalId === app.professionalId &&
          r.serviceId === app.serviceId
      );
      const ruleService = activeRules.find(
        (r: any) =>
          r.scope === 'SERVICE' &&
          (!r.professionalId || r.professionalId === null) &&
          r.serviceId === app.serviceId
      );
      const ruleProf = activeRules.find(
        (r: any) =>
          r.scope === 'PROFESSIONAL' &&
          r.professionalId === app.professionalId &&
          (!r.serviceId || r.serviceId === null)
      );

      const matchedRule = ruleProfService || ruleService || ruleProf || null;

      // Calculate net confirmed paid for this appointment
      const appPayments = memoryStore.payments.filter(
        (p: any) => p.tenantId === tenantId && p.appointmentId === app.id && isPaymentConfirmed(p)
      );
      const totalConfirmedPaidCents = appPayments.reduce((acc: number, p: any) => acc + Number(p.amountCents || 0), 0);
      const completedRefundsCents = memoryStore.refundRequests
        .filter((r: any) => r.tenantId === tenantId && r.appointmentId === app.id && r.status === 'COMPLETED')
        .reduce((acc: number, r: any) => acc + Number(r.amountCents || 0), 0);
      const paymentRefundedFallback = appPayments.reduce(
        (acc: number, p: any) => acc + Number(p.refundedAmountCents || 0),
        0
      );
      const effectiveRefundedCents = Math.max(completedRefundsCents, paymentRefundedFallback);
      const netReceivedForAppCents = Math.max(0, totalConfirmedPaidCents - effectiveRefundedCents);

      const contractedServiceCents = Number(app.snapshotPriceCents ?? app.totalAmountCents ?? 0);

      let existingRecord = memoryStore.commissionRecords.find(
        (cr: any) => cr.tenantId === tenantId && cr.appointmentId === app.id
      );

      const isCancelledOrInvalid = ['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(app.status) ||
        (totalConfirmedPaidCents > 0 && netReceivedForAppCents === 0 && effectiveRefundedCents >= totalConfirmedPaidCents);

      if (isCancelledOrInvalid) {
        if (existingRecord && existingRecord.status !== 'CANCELLED') {
          existingRecord.status = 'CANCELLED';
          existingRecord.commissionAmountCents = 0;
          existingRecord.cancelledAt = new Date().toISOString();
          existingRecord.adjustmentReason = `Agendamento ${app.status} ou integralmente reembolsado — comissão cancelada automaticamente.`;
          existingRecord.history = [
            ...(existingRecord.history || []),
            {
              timestamp: new Date().toISOString(),
              actor: 'SYSTEM',
              action: 'COMMISSION_AUTO_CANCELLED',
              toStatus: 'CANCELLED',
              note: existingRecord.adjustmentReason,
            },
          ];
          existingRecord.updatedAt = new Date().toISOString();
        }
        continue;
      }

      if (!matchedRule) {
        if (!existingRecord) {
          memoryStore.commissionRecords.push({
            id: `com-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            tenantId,
            appointmentId: app.id,
            professionalId: app.professionalId,
            serviceId: app.serviceId,
            ruleId: null,
            ruleScope: null,
            percentageApplied: 0,
            baseAmountCents: contractedServiceCents,
            commissionAmountCents: 0,
            status: 'NO_RULE_CONFIGURED',
            approvedBy: null,
            approvedAt: null,
            paidBy: null,
            paidAt: null,
            cancelledBy: null,
            cancelledAt: null,
            adjustmentReason: 'Nenhuma regra de comissão configurada para esta profissional ou serviço.',
            history: [],
            createdAt: app.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else if (existingRecord.status === 'NO_RULE_CONFIGURED' || existingRecord.status === 'PENDING_CALCULATION') {
          existingRecord.status = 'NO_RULE_CONFIGURED';
          existingRecord.commissionAmountCents = 0;
          existingRecord.percentageApplied = 0;
        }
        continue;
      }

      // A rule exists! Determine base amount according to rule basis
      const basis = matchedRule.basis || 'COMPLETED_SERVICE_VALUE';
      const baseAmountCents =
        basis === 'RECEIVED_AMOUNT' ? netReceivedForAppCents : contractedServiceCents;
      const calculatedCents =
        Math.round((baseAmountCents * Number(matchedRule.percentage)) / 100) +
        Number(matchedRule.fixedCents || 0);

      // Eligible to be CALCULATED when appointment is COMPLETED (or RECEIVED_AMOUNT > 0 when basis is RECEIVED_AMOUNT and COMPLETED)
      const isEligibleCalculated = app.status === 'COMPLETED';
      const targetInitialStatus = isEligibleCalculated ? 'CALCULATED' : 'PENDING_CALCULATION';

      if (!existingRecord) {
        memoryStore.commissionRecords.push({
          id: `com-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          tenantId,
          appointmentId: app.id,
          professionalId: app.professionalId,
          serviceId: app.serviceId,
          ruleId: matchedRule.id,
          ruleScope: matchedRule.scope,
          percentageApplied: Number(matchedRule.percentage),
          baseAmountCents,
          commissionAmountCents: isEligibleCalculated ? calculatedCents : calculatedCents,
          status: targetInitialStatus,
          approvedBy: null,
          approvedAt: null,
          paidBy: null,
          paidAt: null,
          cancelledBy: null,
          cancelledAt: null,
          adjustmentReason: null,
          history: [
            {
              timestamp: new Date().toISOString(),
              actor: 'SYSTEM',
              action: 'COMMISSION_SYNCED',
              toStatus: targetInitialStatus,
              note: `Regra aplicada: ${matchedRule.scope} (${matchedRule.percentage}%)`,
            },
          ],
          createdAt: app.completedAt || app.dateTime || app.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Only auto-update if not yet APPROVED, PAID, or manually adjusted
        if (['NO_RULE_CONFIGURED', 'PENDING_CALCULATION', 'CALCULATED'].includes(existingRecord.status) && !existingRecord.manuallyAdjusted) {
          existingRecord.ruleId = matchedRule.id;
          existingRecord.ruleScope = matchedRule.scope;
          existingRecord.percentageApplied = Number(matchedRule.percentage);
          existingRecord.baseAmountCents = baseAmountCents;
          existingRecord.commissionAmountCents = calculatedCents;
          existingRecord.status = targetInitialStatus;
          existingRecord.adjustmentReason = null;
          existingRecord.updatedAt = new Date().toISOString();
        }
      }
    }
  },

  /**
   * Computes Accounts Receivable (`Contas a Receber` / `Valores pendentes`) for a tenant.
   * Anti-duplicidade rule:
   * - Never sums service total + deposit + balance.
   * - For each eligible appointment (`CONFIRMED`, `IN_PROGRESS`, `COMPLETED`), calculates:
   *   `pendingBalanceCents = Math.max(0, contractedTotalCents - netConfirmedPaidCents)`
   * - Excludes `CANCELLED`, `EXPIRED`, `NO_SHOW`, and `PENDING_PAYMENT` (unconfirmed hold).
   */
  getAccountsReceivable(
    tenantId: string,
    filters?: {
      clientId?: string;
      professionalId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    const appointments = memoryStore.appointments.filter((a: any) => a.tenantId === tenantId);
    const items: any[] = [];

    for (const app of appointments) {
      if (!['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(app.status)) {
        continue;
      }
      if (filters?.clientId && app.clientId !== filters.clientId) continue;
      if (filters?.professionalId && filters.professionalId !== 'ALL' && app.professionalId !== filters.professionalId) continue;
      if (filters?.status && filters.status !== 'ALL' && app.status !== filters.status) continue;

      if (filters?.startDate) {
        if (new Date(app.dateTime).getTime() < new Date(filters.startDate).getTime()) continue;
      }
      if (filters?.endDate) {
        if (new Date(app.dateTime).getTime() > new Date(filters.endDate).getTime()) continue;
      }

      const contractedTotalCents = Number(app.snapshotPriceCents ?? app.totalAmountCents ?? 0);
      const depositExpectedCents = Number(app.snapshotDepositCents ?? app.depositAmountCents ?? 0);

      const appConfirmedPayments = memoryStore.payments.filter(
        (p: any) => p.tenantId === tenantId && p.appointmentId === app.id && isPaymentConfirmed(p)
      );
      const confirmedPaidCents = appConfirmedPayments.reduce(
        (acc: number, p: any) => acc + Number(p.amountCents || 0),
        0
      );

      const completedRefundsCents = memoryStore.refundRequests
        .filter((r: any) => r.tenantId === tenantId && r.appointmentId === app.id && r.status === 'COMPLETED')
        .reduce((acc: number, r: any) => acc + Number(r.amountCents || 0), 0);
      const paymentRefundedFallback = appConfirmedPayments.reduce(
        (acc: number, p: any) => acc + Number(p.refundedAmountCents || 0),
        0
      );
      const refundedCents = Math.max(completedRefundsCents, paymentRefundedFallback);
      const netConfirmedPaidCents = Math.max(0, confirmedPaidCents - refundedCents);
      const pendingBalanceCents = Math.max(0, contractedTotalCents - netConfirmedPaidCents);

      if (pendingBalanceCents > 0) {
        const client = memoryStore.clients.find((c: any) => c.id === app.clientId);
        const prof = memoryStore.professionals.find((p: any) => p.id === app.professionalId);
        const serv = memoryStore.services.find((s: any) => s.id === app.serviceId);

        items.push({
          appointmentId: app.id,
          clientId: app.clientId,
          clientName: client?.name || 'Cliente',
          clientPhone: client?.phone || '',
          professionalId: app.professionalId,
          professionalName: prof?.name || 'Profissional',
          serviceId: app.serviceId,
          serviceName: serv?.name || 'Serviço',
          appointmentDateTime: app.dateTime,
          appointmentStatus: app.status,
          contractedTotalCents,
          depositExpectedCents,
          confirmedPaidCents,
          refundedCents,
          netConfirmedPaidCents,
          pendingBalanceCents,
          dueDate: app.dateTime,
        });
      }
    }

    return items.sort(
      (a, b) => new Date(a.appointmentDateTime).getTime() - new Date(b.appointmentDateTime).getTime()
    );
  },

  /**
   * Section 4: Visão Financeira Geral (Dashboard Financeiro)
   * Computes all 11 mandatory indicators and their explicit calculation formulas.
   */
  getFinancialDashboard(tenantId: string, periodInput?: PeriodFilterInput) {
    this.syncLedgerForTenant(tenantId);
    this.syncCommissionsForTenant(tenantId);

    const period = resolvePeriodRange(periodInput);
    const inPeriod = (isoOrDate: any) => {
      if (!isoOrDate) return false;
      const ms = new Date(isoOrDate).getTime();
      return ms >= period.startMs && ms <= period.endMs;
    };

    // 1. Confirmed payments in period (using approvedAt || createdAt)
    const confirmedPaymentsInPeriod = memoryStore.payments.filter(
      (p: any) =>
        p.tenantId === tenantId &&
        isPaymentConfirmed(p) &&
        inPeriod(p.approvedAt || p.createdAt)
    );

    const confirmedReceiptsCents = confirmedPaymentsInPeriod.reduce(
      (acc: number, p: any) => acc + Number(p.amountCents || 0),
      0
    );

    const confirmedFeesCents = confirmedPaymentsInPeriod.reduce(
      (acc: number, p: any) => acc + Number(p.feeCents || 0),
      0
    );

    // Manual INFLOW / OUTFLOW adjustments in period
    const manualAdjustmentsInPeriod = memoryStore.financialTransactions.filter(
      (t: any) =>
        t.tenantId === tenantId &&
        t.origin === 'MANUAL_ADJUSTMENT' &&
        t.status === 'CONFIRMED' &&
        inPeriod(t.occurredAt)
    );
    const manualInflowCents = manualAdjustmentsInPeriod
      .filter((t: any) => t.type === 'INFLOW')
      .reduce((acc: number, t: any) => acc + Number(t.amountCents || 0), 0);
    const manualOutflowCents = manualAdjustmentsInPeriod
      .filter((t: any) => t.type === 'OUTFLOW')
      .reduce((acc: number, t: any) => acc + Number(t.amountCents || 0), 0);

    const totalConfirmedReceiptsCents = confirmedReceiptsCents + manualInflowCents;

    // 2. Pending receivables (Contas a receber)
    // If preset is THIS_MONTH or ALL, include active receivables; if custom/specific period, filter by appointment dateTime in period or all active if preset is THIS_MONTH
    const receivables = this.getAccountsReceivable(
      tenantId,
      period.preset === 'CUSTOM' || period.preset === 'LAST_MONTH' || period.preset === 'TODAY'
        ? { startDate: period.startDate, endDate: period.endDate }
        : undefined
    );
    const pendingReceivablesCents = receivables.reduce(
      (acc: number, r: any) => acc + Number(r.pendingBalanceCents || 0),
      0
    );

    // 3. Completed services sales in period (Competência de atendimentos concluídos)
    const completedAppsInPeriod = memoryStore.appointments.filter(
      (a: any) =>
        a.tenantId === tenantId &&
        a.status === 'COMPLETED' &&
        inPeriod(a.completedAt || a.dateTime)
    );
    const completedServicesSalesCents = completedAppsInPeriod.reduce(
      (acc: number, a: any) => acc + Number(a.snapshotPriceCents ?? a.totalAmountCents ?? 0),
      0
    );
    const completedAppointmentsCount = completedAppsInPeriod.length;
    const averageTicketCents =
      completedAppointmentsCount > 0
        ? Math.round(completedServicesSalesCents / completedAppointmentsCount)
        : 0;

    // 4. Expenses: Paid vs Pending vs Overdue
    const tenantExpenses = memoryStore.expenses.filter((e: any) => e.tenantId === tenantId);
    const paidExpensesInPeriod = tenantExpenses.filter(
      (e: any) => e.status === 'PAID' && inPeriod(e.paidAt || e.competenceDate)
    );
    const paidExpensesCents =
      paidExpensesInPeriod.reduce((acc: number, e: any) => acc + Number(e.amountCents || 0), 0) +
      manualOutflowCents;

    const pendingExpensesInPeriod = tenantExpenses.filter(
      (e: any) =>
        e.status === 'PENDING' &&
        (period.preset === 'THIS_MONTH' || period.preset === 'ALL'
          ? true
          : inPeriod(e.dueDate || e.competenceDate))
    );
    const pendingExpensesCents = pendingExpensesInPeriod.reduce(
      (acc: number, e: any) => acc + Number(e.amountCents || 0),
      0
    );

    const nowMs = Date.now();
    const overdueExpensesCents = tenantExpenses
      .filter((e: any) => e.status === 'PENDING' && new Date(e.dueDate).getTime() < nowMs)
      .reduce((acc: number, e: any) => acc + Number(e.amountCents || 0), 0);

    // 5. Refunds: Completed vs Pending
    const tenantRefunds = memoryStore.refundRequests.filter((r: any) => r.tenantId === tenantId);
    const completedRefundsInPeriod = tenantRefunds.filter(
      (r: any) => r.status === 'COMPLETED' && inPeriod(r.completedAt || r.updatedAt || r.createdAt)
    );
    const completedRefundsCents = completedRefundsInPeriod.reduce(
      (acc: number, r: any) => acc + Number(r.amountCents || 0),
      0
    );
    const pendingRefundsCents = tenantRefunds
      .filter((r: any) => ['PENDING_REVIEW', 'APPROVED', 'PROCESSING'].includes(r.status))
      .reduce((acc: number, r: any) => acc + Number(r.amountCents || 0), 0);

    // 6. Commissions: Calculated / Approved vs Paid
    const tenantCommissions = memoryStore.commissionRecords.filter(
      (c: any) => c.tenantId === tenantId
    );
    const calculatedCommissionsCents = tenantCommissions
      .filter(
        (c: any) =>
          ['CALCULATED', 'APPROVED'].includes(c.status) &&
          inPeriod(c.createdAt || c.updatedAt)
      )
      .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0);

    const approvedCommissionsCents = tenantCommissions
      .filter((c: any) => c.status === 'APPROVED' && inPeriod(c.approvedAt || c.createdAt))
      .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0);

    const paidCommissionsCents = tenantCommissions
      .filter((c: any) => c.status === 'PAID' && inPeriod(c.paidAt || c.updatedAt))
      .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0);

    // Paid commissions that were NOT separately registered as an Expense
    const paidCommissionsNotInExpensesCents = tenantCommissions
      .filter(
        (c: any) =>
          c.status === 'PAID' &&
          !c.registeredAsExpenseId &&
          inPeriod(c.paidAt || c.updatedAt)
      )
      .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0);

    // 7. Estimated Financial Result (Gerencial, não contábil)
    // Formula: Recebimentos confirmados − Reembolsos concluídos − Despesas pagas − Taxas financeiras confirmadas
    const estimatedFinancialResultCents =
      totalConfirmedReceiptsCents -
      completedRefundsCents -
      paidExpensesCents -
      confirmedFeesCents;

    const estimatedResultAfterPaidCommissionsCents =
      estimatedFinancialResultCents - paidCommissionsNotInExpensesCents;

    const hasEnoughData =
      totalConfirmedReceiptsCents > 0 ||
      pendingReceivablesCents > 0 ||
      completedAppointmentsCount > 0 ||
      paidExpensesCents > 0 ||
      pendingExpensesCents > 0;

    return {
      period: {
        preset: period.preset,
        startDate: period.startDate,
        endDate: period.endDate,
        label: period.label,
      },
      indicators: {
        confirmedReceiptsCents: totalConfirmedReceiptsCents,
        pendingReceivablesCents,
        completedServicesSalesCents,
        completedAppointmentsCount,
        averageTicketCents,
        paidExpensesCents,
        pendingExpensesCents,
        overdueExpensesCents,
        completedRefundsCents,
        pendingRefundsCents,
        calculatedCommissionsCents,
        approvedCommissionsCents,
        paidCommissionsCents,
        confirmedFeesCents,
        estimatedFinancialResultCents,
        estimatedResultAfterPaidCommissionsCents,
        hasEnoughData,
      },
      formulas: {
        confirmedReceipts:
          'Soma dos pagamentos com status APROVADO/CONFIRMADO pela data de confirmação (approvedAt) no período + ajustes manuais de entrada confirmados. Pagamentos pendentes ou expirados nunca entram.',
        pendingReceivables:
          'Soma de (Valor contratado snapshotPriceCents − Valor líquido confirmado já recebido) dos agendamentos ativos/concluídos (CONFIRMED, IN_PROGRESS, COMPLETED). Sem duplicar sinal + saldo.',
        completedServicesSales:
          'Soma do valor contratado (snapshotPriceCents) dos atendimentos efetivamente CONCLUÍDOS (COMPLETED) no período (visão de competência).',
        paidExpenses:
          'Soma das despesas com status PAGA (PAID) confirmadas pela data de pagamento (paidAt) no período.',
        pendingExpenses:
          'Soma das despesas registradas com status PENDENTE (PENDING) ainda não quitadas.',
        completedRefunds:
          'Soma exclusiva dos reembolsos com status CONCLUÍDO (COMPLETED) no período. Reembolsos em análise ou processamento não abatem receita.',
        commissions:
          'Calculadas com base nas regras ativas (Prioridade: Profissional+Serviço > Serviço > Profissional). Separadas em Calculadas/Aprovadas e Efetivamente Pagas.',
        estimatedFinancialResult:
          'Resultado Gerencial Estimado = Recebimentos Confirmados − Reembolsos Concluídos − Despesas Pagas − Taxas Financeiras Confirmadas (não substitui demonstrativo contábil oficial).',
        averageTicket:
          'Ticket Médio (Competência de Serviços Concluídos) = Valor total dos serviços concluídos no período ÷ Quantidade de atendimentos concluídos no período.',
      },
    };
  },

  /**
   * Section 5: Receitas e Recebimentos
   */
  listReceipts(
    tenantId: string,
    filters?: {
      status?: string;
      paymentMethod?: string;
      paymentType?: string;
      professionalId?: string;
      serviceId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    }
  ) {
    let payments = memoryStore.payments.filter((p: any) => p.tenantId === tenantId);

    const enriched = payments.map((p: any) => {
      const app = memoryStore.appointments.find((a: any) => a.id === p.appointmentId) || null;
      const client = app ? memoryStore.clients.find((c: any) => c.id === app.clientId) : null;
      const prof = app ? memoryStore.professionals.find((pr: any) => pr.id === app.professionalId) : null;
      const serv = app ? memoryStore.services.find((s: any) => s.id === app.serviceId) : null;

      const amountCents = Number(p.amountCents || 0);
      const contractedCents = app ? Number(app.snapshotPriceCents ?? app.totalAmountCents ?? amountCents) : amountCents;
      const paymentType =
        p.paymentType || (amountCents < contractedCents ? 'DEPOSIT' : 'FULL');
      const feeCents = p.feeCents !== undefined && p.feeCents !== null ? Number(p.feeCents) : null;
      const netAmountCents =
        p.netAmountCents !== undefined && p.netAmountCents !== null
          ? Number(p.netAmountCents)
          : feeCents !== null
          ? amountCents - feeCents
          : null;

      return {
        ...p,
        paymentType,
        feeCents,
        feeAvailable: feeCents !== null,
        netAmountCents,
        reconciliationStatus: p.reconciliationStatus || (isPaymentConfirmed(p) ? 'RECONCILED' : 'PENDING'),
        clientName: client?.name || 'Cliente',
        clientId: client?.id || app?.clientId || null,
        professionalName: prof?.name || 'Profissional',
        professionalId: prof?.id || app?.professionalId || null,
        serviceName: serv?.name || 'Serviço',
        serviceId: serv?.id || app?.serviceId || null,
        appointmentDateTime: app?.dateTime || null,
        appointmentStatus: app?.status || null,
        contractedTotalCents: contractedCents,
      };
    });

    let filtered = enriched;
    if (filters?.status && filters.status !== 'ALL') {
      filtered = filtered.filter((p: any) => p.status === filters.status);
    }
    if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
      filtered = filtered.filter((p: any) => p.paymentMethod === filters.paymentMethod);
    }
    if (filters?.paymentType && filters.paymentType !== 'ALL') {
      filtered = filtered.filter((p: any) => p.paymentType === filters.paymentType);
    }
    if (filters?.professionalId && filters.professionalId !== 'ALL') {
      filtered = filtered.filter((p: any) => p.professionalId === filters.professionalId);
    }
    if (filters?.serviceId && filters.serviceId !== 'ALL') {
      filtered = filtered.filter((p: any) => p.serviceId === filters.serviceId);
    }
    if (filters?.startDate) {
      const startMs = new Date(filters.startDate).getTime();
      filtered = filtered.filter(
        (p: any) => new Date(p.approvedAt || p.createdAt).getTime() >= startMs
      );
    }
    if (filters?.endDate) {
      const endMs = new Date(filters.endDate).getTime();
      filtered = filtered.filter(
        (p: any) => new Date(p.approvedAt || p.createdAt).getTime() <= endMs
      );
    }

    filtered.sort(
      (a: any, b: any) =>
        new Date(b.approvedAt || b.createdAt).getTime() -
        new Date(a.approvedAt || a.createdAt).getTime()
    );

    const page = Math.max(1, Number(filters?.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters?.pageSize || 50)));
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  },

  /**
   * Records an in-person / balance / full payment for an appointment (`BALANCE` or `FULL`).
   * Protects against:
   * - Recording payment on CANCELLED or EXPIRED appointments
   * - Duplicate balance payment (idempotencyKey or exceeding remaining balance)
   * - Double-counting deposit + balance + service total
   */
  recordBalanceOrFullPayment(
    tenantId: string,
    actorId: string,
    data: {
      appointmentId: string;
      amountCents: number;
      paymentType?: 'BALANCE' | 'FULL' | 'DEPOSIT';
      paymentMethod: string;
      feeCents?: number | null;
      idempotencyKey?: string;
      notes?: string;
    }
  ) {
    const app = memoryStore.appointments.find(
      (a: any) => a.id === data.appointmentId && a.tenantId === tenantId
    );
    if (!app) {
      const err: any = new Error('Agendamento não encontrado para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (['CANCELLED', 'EXPIRED'].includes(app.status)) {
      const err: any = new Error(
        `Não é permitido registrar recebimento para um agendamento com status ${app.status}.`
      );
      err.statusCode = 400;
      throw err;
    }

    const idempotencyKey =
      data.idempotencyKey || `bal-${tenantId}-${data.appointmentId}-${data.paymentType || 'BALANCE'}-${data.amountCents}`;

    const existingByIdemp = memoryStore.payments.find(
      (p: any) => p.tenantId === tenantId && p.idempotencyKey === idempotencyKey && isPaymentConfirmed(p)
    );
    if (existingByIdemp) {
      const err: any = new Error(
        'Este recebimento já foi registrado anteriormente (proteção contra duplicidade de saldo).'
      );
      err.statusCode = 409;
      err.existingPayment = existingByIdemp;
      throw err;
    }

    const contractedTotalCents = Number(app.snapshotPriceCents ?? app.totalAmountCents ?? 0);
    const confirmedPayments = memoryStore.payments.filter(
      (p: any) => p.tenantId === tenantId && p.appointmentId === app.id && isPaymentConfirmed(p)
    );
    const alreadyPaidCents = confirmedPayments.reduce(
      (acc: number, p: any) => acc + Number(p.amountCents || 0),
      0
    );
    const completedRefundsCents = memoryStore.refundRequests
      .filter((r: any) => r.tenantId === tenantId && r.appointmentId === app.id && r.status === 'COMPLETED')
      .reduce((acc: number, r: any) => acc + Number(r.amountCents || 0), 0);
    const netAlreadyPaidCents = Math.max(0, alreadyPaidCents - completedRefundsCents);
    const remainingBalanceCents = Math.max(0, contractedTotalCents - netAlreadyPaidCents);

    if (remainingBalanceCents === 0) {
      const err: any = new Error(
        'O valor integral deste agendamento já foi totalmente recebido. Não há saldo pendente.'
      );
      err.statusCode = 409;
      throw err;
    }

    if (data.amountCents > remainingBalanceCents) {
      const err: any = new Error(
        `O valor informado (${formatBrl(data.amountCents)}) excede o saldo pendente do agendamento (${formatBrl(remainingBalanceCents)}).`
      );
      err.statusCode = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const feeCents = data.feeCents !== undefined && data.feeCents !== null ? Number(data.feeCents) : 0;
    const netAmountCents = data.amountCents - feeCents;
    const paymentType =
      data.paymentType || (netAlreadyPaidCents > 0 ? 'BALANCE' : data.amountCents === contractedTotalCents ? 'FULL' : 'DEPOSIT');

    const newPayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      appointmentId: app.id,
      provider: 'PRESENCIAL',
      providerPaymentId: `pres-${Date.now()}`,
      externalReference: `EXT-${app.id}-${paymentType}`,
      idempotencyKey,
      paymentType,
      amountCents: data.amountCents,
      feeCents,
      netAmountCents,
      refundedAmountCents: 0,
      currency: 'BRL',
      status: 'APPROVED',
      paymentMethod: data.paymentMethod,
      reconciliationStatus: 'RECONCILED',
      notes: data.notes || null,
      createdBy: actorId,
      approvedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    memoryStore.payments.push(newPayment);

    // Update appointment balanceAmountCents remaining if needed
    const newRemaining = Math.max(0, remainingBalanceCents - data.amountCents);
    app.balanceAmountCents = newRemaining;
    if (app.status === 'PENDING_PAYMENT' || app.status === 'PENDING') {
      app.status = 'CONFIRMED';
    }

    this.syncLedgerForTenant(tenantId);
    this.syncCommissionsForTenant(tenantId);

    db.recordAuditLog(tenantId, actorId, 'FINANCIAL_PAYMENT_RECORDED', {
      paymentId: newPayment.id,
      appointmentId: app.id,
      paymentType,
      amountCents: data.amountCents,
      remainingBalanceCents: newRemaining,
    });

    return {
      payment: newPayment,
      remainingBalanceCents: newRemaining,
    };
  },

  /**
   * Section 9: Conciliação Financeira
   * Flags or resolves a discrepancy between internal payment record and external provider data.
   * Also blocks unauthorized manual approval of PENDING provider Pix payments without valid provider verification.
   */
  reconcilePayment(
    tenantId: string,
    paymentId: string,
    actorId: string,
    input: {
      providerAmountCents?: number;
      providerStatus?: string;
      feeCents?: number | null;
      notes: string;
    }
  ) {
    const payment = memoryStore.payments.find(
      (p: any) => p.id === paymentId && p.tenantId === tenantId
    );
    if (!payment) {
      const err: any = new Error('Pagamento não encontrado para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    // Block manual approval of a PENDING external provider payment from the financial screen without provider confirmation
    if (
      payment.provider === 'MERCADO_PAGO' &&
      payment.status !== 'APPROVED' &&
      input.providerStatus === 'MANUAL_FORCE_APPROVE'
    ) {
      const err: any = new Error(
        'Não é permitido aprovar manualmente um pagamento Pix do provedor sem confirmação autêntica do provedor/webhook.'
      );
      err.statusCode = 400;
      throw err;
    }

    const discrepancies: string[] = [];
    if (
      input.providerAmountCents !== undefined &&
      Number(input.providerAmountCents) !== Number(payment.amountCents)
    ) {
      discrepancies.push(
        `Divergência de valor: registrado ${formatBrl(payment.amountCents)} vs provedor ${formatBrl(input.providerAmountCents)}`
      );
    }
    if (
      input.providerStatus &&
      input.providerStatus.toUpperCase() !== String(payment.status).toUpperCase()
    ) {
      discrepancies.push(
        `Divergência de status: registrado ${payment.status} vs provedor ${input.providerStatus}`
      );
    }

    if (input.feeCents !== undefined && input.feeCents !== null) {
      payment.feeCents = Number(input.feeCents);
      payment.netAmountCents = Number(payment.amountCents) - Number(input.feeCents);
    }

    if (discrepancies.length > 0) {
      payment.reconciliationStatus = 'DISCREPANCY';
      payment.reconciliationDiscrepancy = `${discrepancies.join(' | ')} — Nota: ${input.notes}`;
    } else {
      payment.reconciliationStatus = 'RECONCILED';
      payment.reconciliationDiscrepancy = null;
    }
    payment.updatedAt = new Date().toISOString();

    this.syncLedgerForTenant(tenantId);

    db.recordAuditLog(tenantId, actorId, 'PAYMENT_RECONCILIATION_CHECK', {
      paymentId,
      reconciliationStatus: payment.reconciliationStatus,
      discrepancies,
      notes: input.notes,
    });

    return payment;
  },

  /**
   * Section 7: Despesas e Contas a Pagar
   */
  listExpenses(
    tenantId: string,
    filters?: {
      category?: string;
      status?: string;
      onlyOverdue?: boolean;
      startDate?: string;
      endDate?: string;
    }
  ) {
    const nowMs = Date.now();
    let list = memoryStore.expenses
      .filter((e: any) => e.tenantId === tenantId)
      .map((e: any) => ({
        ...e,
        isOverdue: e.status === 'PENDING' && new Date(e.dueDate).getTime() < nowMs,
      }));

    if (filters?.category && filters.category !== 'ALL') {
      list = list.filter((e: any) => e.category === filters.category);
    }
    if (filters?.status && filters.status !== 'ALL') {
      list = list.filter((e: any) => e.status === filters.status);
    }
    if (filters?.onlyOverdue) {
      list = list.filter((e: any) => e.isOverdue);
    }
    if (filters?.startDate) {
      const sMs = new Date(filters.startDate).getTime();
      list = list.filter((e: any) => new Date(e.dueDate || e.competenceDate).getTime() >= sMs);
    }
    if (filters?.endDate) {
      const eMs = new Date(filters.endDate).getTime();
      list = list.filter((e: any) => new Date(e.dueDate || e.competenceDate).getTime() <= eMs);
    }

    return list.sort(
      (a: any, b: any) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
    );
  },

  createExpense(
    tenantId: string,
    actorId: string,
    data: {
      description: string;
      category: string;
      amountCents: number;
      competenceDate: string;
      dueDate: string;
      status?: 'PENDING' | 'PAID';
      paymentMethod?: string | null;
      notes?: string | null;
    }
  ) {
    if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) {
      const err: any = new Error('O valor da despesa deve ser um número inteiro positivo em centavos.');
      err.statusCode = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const isPaid = data.status === 'PAID';

    const newExpense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      description: data.description.trim(),
      category: data.category || 'OUTRAS',
      amountCents: data.amountCents,
      competenceDate: new Date(data.competenceDate).toISOString(),
      dueDate: new Date(data.dueDate).toISOString(),
      paidAt: isPaid ? nowIso : null,
      status: isPaid ? 'PAID' : 'PENDING',
      paymentMethod: data.paymentMethod || null,
      notes: data.notes || null,
      createdBy: actorId,
      paidBy: isPaid ? actorId : null,
      cancelledBy: null,
      cancellationReason: null,
      history: [
        {
          timestamp: nowIso,
          actor: actorId,
          action: 'EXPENSE_CREATED',
          toStatus: isPaid ? 'PAID' : 'PENDING',
          note: isPaid ? 'Despesa cadastrada já como paga' : 'Despesa registrada como pendente',
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    memoryStore.expenses.push(newExpense);
    if (isPaid) {
      this.syncLedgerForTenant(tenantId);
    }

    db.recordAuditLog(tenantId, actorId, 'EXPENSE_CREATED', {
      expenseId: newExpense.id,
      amountCents: newExpense.amountCents,
      status: newExpense.status,
    });

    return newExpense;
  },

  updateExpense(
    tenantId: string,
    expenseId: string,
    actorId: string,
    data: {
      description?: string;
      category?: string;
      amountCents?: number;
      competenceDate?: string;
      dueDate?: string;
      paymentMethod?: string | null;
      notes?: string | null;
    }
  ) {
    const exp = memoryStore.expenses.find(
      (e: any) => e.id === expenseId && e.tenantId === tenantId
    );
    if (!exp) {
      const err: any = new Error('Despesa não encontrada para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (exp.status === 'PAID') {
      const err: any = new Error(
        'Não é permitido alterar o valor ou dados de uma despesa já paga sem antes realizar o estorno auditado.'
      );
      err.statusCode = 400;
      throw err;
    }

    if (exp.status === 'CANCELLED' || exp.status === 'REVERSED') {
      const err: any = new Error(`Não é permitido editar uma despesa com status ${exp.status}.`);
      err.statusCode = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    if (data.description !== undefined) exp.description = data.description.trim();
    if (data.category !== undefined) exp.category = data.category;
    if (data.amountCents !== undefined) exp.amountCents = data.amountCents;
    if (data.competenceDate !== undefined) exp.competenceDate = new Date(data.competenceDate).toISOString();
    if (data.dueDate !== undefined) exp.dueDate = new Date(data.dueDate).toISOString();
    if (data.paymentMethod !== undefined) exp.paymentMethod = data.paymentMethod;
    if (data.notes !== undefined) exp.notes = data.notes;
    exp.updatedAt = nowIso;

    exp.history = [
      ...(exp.history || []),
      {
        timestamp: nowIso,
        actor: actorId,
        action: 'EXPENSE_UPDATED',
        toStatus: exp.status,
        note: 'Dados da despesa atualizados',
      },
    ];

    return exp;
  },

  payExpense(
    tenantId: string,
    expenseId: string,
    actorId: string,
    data: {
      paymentMethod: string;
      paidAt?: string;
      notes?: string;
    }
  ) {
    const exp = memoryStore.expenses.find(
      (e: any) => e.id === expenseId && e.tenantId === tenantId
    );
    if (!exp) {
      const err: any = new Error('Despesa não encontrada para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (exp.status === 'PAID') {
      const err: any = new Error('Esta despesa já consta como paga.');
      err.statusCode = 409;
      throw err;
    }

    if (exp.status === 'CANCELLED' || exp.status === 'REVERSED') {
      const err: any = new Error(`Não é possível pagar uma despesa com status ${exp.status}.`);
      err.statusCode = 400;
      throw err;
    }

    const nowIso = data.paidAt ? new Date(data.paidAt).toISOString() : new Date().toISOString();
    const prevStatus = exp.status;
    exp.status = 'PAID';
    exp.paidAt = nowIso;
    exp.paidBy = actorId;
    exp.paymentMethod = data.paymentMethod || exp.paymentMethod || 'PIX';
    if (data.notes) {
      exp.notes = exp.notes ? `${exp.notes} | ${data.notes}` : data.notes;
    }
    exp.updatedAt = nowIso;
    exp.history = [
      ...(exp.history || []),
      {
        timestamp: nowIso,
        actor: actorId,
        action: 'EXPENSE_PAID',
        fromStatus: prevStatus,
        toStatus: 'PAID',
        note: `Despesa marcada como paga via ${exp.paymentMethod}`,
      },
    ];

    this.syncLedgerForTenant(tenantId);

    db.recordAuditLog(tenantId, actorId, 'EXPENSE_PAID', {
      expenseId: exp.id,
      amountCents: exp.amountCents,
      paymentMethod: exp.paymentMethod,
    });

    return exp;
  },

  reverseOrCancelExpense(
    tenantId: string,
    expenseId: string,
    actorId: string,
    reason: string
  ) {
    const exp = memoryStore.expenses.find(
      (e: any) => e.id === expenseId && e.tenantId === tenantId
    );
    if (!exp) {
      const err: any = new Error('Despesa não encontrada para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (exp.status === 'CANCELLED' || exp.status === 'REVERSED') {
      const err: any = new Error(`Esta despesa já foi ${exp.status === 'REVERSED' ? 'estornada' : 'cancelada'}.`);
      err.statusCode = 409;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const wasPaid = exp.status === 'PAID';
    const prevStatus = exp.status;
    const newStatus = wasPaid ? 'REVERSED' : 'CANCELLED';

    exp.status = newStatus;
    exp.cancelledBy = actorId;
    exp.cancellationReason = reason;
    exp.updatedAt = nowIso;
    exp.history = [
      ...(exp.history || []),
      {
        timestamp: nowIso,
        actor: actorId,
        action: wasPaid ? 'EXPENSE_REVERSED' : 'EXPENSE_CANCELLED',
        fromStatus: prevStatus,
        toStatus: newStatus,
        note: `Motivo: ${reason}`,
      },
    ];

    if (wasPaid) {
      this.syncLedgerForTenant(tenantId);
      // Record compensating REVERSAL entry in ledger
      const revRef = `EXP_REV:${exp.id}`;
      const existingRev = memoryStore.financialTransactions.find(
        (t: any) => t.tenantId === tenantId && t.uniqueRef === revRef
      );
      if (!existingRev) {
        memoryStore.financialTransactions.push({
          id: `ftx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          tenantId,
          uniqueRef: revRef,
          type: 'REVERSAL',
          origin: 'REVERSAL',
          originId: exp.id,
          amountCents: Number(exp.amountCents),
          feeCents: 0,
          netAmountCents: Number(exp.amountCents),
          category: exp.category || 'ESTORNO_DESPESA',
          description: `Estorno de despesa paga: ${exp.description}`,
          paymentMethod: exp.paymentMethod || 'PIX',
          actorId,
          actorName: 'Administração',
          status: 'CONFIRMED',
          reconciliationStatus: 'RECONCILED',
          reconciliationDiscrepancy: null,
          justification: reason,
          history: [
            {
              timestamp: nowIso,
              actor: actorId,
              action: 'EXPENSE_REVERSAL_LEDGER_ENTRY',
              note: reason,
            },
          ],
          occurredAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }

    db.recordAuditLog(tenantId, actorId, wasPaid ? 'EXPENSE_REVERSED' : 'EXPENSE_CANCELLED', {
      expenseId: exp.id,
      amountCents: exp.amountCents,
      reason,
    });

    return exp;
  },

  /**
   * Section 8: Controle de Caixa e Movimentações (Ledger)
   */
  listLedgerTransactions(
    tenantId: string,
    filters?: {
      type?: string;
      status?: string;
      origin?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    }
  ) {
    this.syncLedgerForTenant(tenantId);

    let txs = memoryStore.financialTransactions.filter((t: any) => t.tenantId === tenantId);

    if (filters?.type && filters.type !== 'ALL') {
      txs = txs.filter((t: any) => t.type === filters.type);
    }
    if (filters?.status && filters.status !== 'ALL') {
      txs = txs.filter((t: any) => t.status === filters.status);
    }
    if (filters?.origin && filters.origin !== 'ALL') {
      txs = txs.filter((t: any) => t.origin === filters.origin);
    }
    if (filters?.startDate) {
      const sMs = new Date(filters.startDate).getTime();
      txs = txs.filter((t: any) => new Date(t.occurredAt).getTime() >= sMs);
    }
    if (filters?.endDate) {
      const eMs = new Date(filters.endDate).getTime();
      txs = txs.filter((t: any) => new Date(t.occurredAt).getTime() <= eMs);
    }

    txs.sort(
      (a: any, b: any) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );

    const activeConfirmed = txs.filter((t: any) => t.status === 'CONFIRMED');
    const totalInflowCents = activeConfirmed
      .filter((t: any) => t.type === 'INFLOW')
      .reduce((acc: number, t: any) => acc + Number(t.amountCents || 0), 0);
    const totalOutflowCents = activeConfirmed
      .filter((t: any) => t.type === 'OUTFLOW')
      .reduce((acc: number, t: any) => acc + Number(t.amountCents || 0), 0);
    const totalFeesCents = activeConfirmed
      .filter((t: any) => t.type === 'INFLOW')
      .reduce((acc: number, t: any) => acc + Number(t.feeCents || 0), 0);

    const page = Math.max(1, Number(filters?.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters?.pageSize || 50)));
    const total = txs.length;
    const items = txs.slice((page - 1) * pageSize, page * pageSize);

    return {
      items,
      summary: {
        totalInflowCents,
        totalOutflowCents,
        totalFeesCents,
        netCashBalanceCents: totalInflowCents - totalOutflowCents - totalFeesCents,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  },

  createManualCashAdjustment(
    tenantId: string,
    actorId: string,
    actorName: string,
    data: {
      type: 'INFLOW' | 'OUTFLOW';
      amountCents: number;
      category: string;
      description: string;
      paymentMethod: string;
      justification: string;
      occurredAt?: string;
    }
  ) {
    if (!data.justification || data.justification.trim().length < 5) {
      const err: any = new Error(
        'Todo ajuste administrativo de caixa exige justificativa obrigatória (mínimo 5 caracteres).'
      );
      err.statusCode = 400;
      throw err;
    }

    const nowIso = data.occurredAt ? new Date(data.occurredAt).toISOString() : new Date().toISOString();
    const id = `ftx-adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const entry = {
      id,
      tenantId,
      uniqueRef: `ADJ:${id}`,
      type: data.type,
      origin: 'MANUAL_ADJUSTMENT',
      originId: id,
      amountCents: data.amountCents,
      feeCents: 0,
      netAmountCents: data.amountCents,
      category: data.category || 'AJUSTE_ADMINISTRATIVO',
      description: data.description.trim(),
      paymentMethod: data.paymentMethod || 'CASH',
      actorId,
      actorName: actorName || 'Administrador',
      status: 'CONFIRMED',
      reconciliationStatus: 'RECONCILED',
      reconciliationDiscrepancy: null,
      justification: data.justification.trim(),
      history: [
        {
          timestamp: nowIso,
          actor: actorId,
          action: 'MANUAL_ADJUSTMENT_CREATED',
          note: data.justification.trim(),
        },
      ],
      occurredAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    memoryStore.financialTransactions.push(entry);

    db.recordAuditLog(tenantId, actorId, 'FINANCIAL_MANUAL_ADJUSTMENT', {
      transactionId: id,
      type: data.type,
      amountCents: data.amountCents,
      justification: data.justification,
    });

    return entry;
  },

  reverseLedgerTransaction(
    tenantId: string,
    transactionId: string,
    actorId: string,
    actorName: string,
    justification: string
  ) {
    if (!justification || justification.trim().length < 5) {
      const err: any = new Error(
        'Todo estorno de lançamento de caixa exige justificativa obrigatória (mínimo 5 caracteres).'
      );
      err.statusCode = 400;
      throw err;
    }

    const tx = memoryStore.financialTransactions.find(
      (t: any) => t.id === transactionId && t.tenantId === tenantId
    );
    if (!tx) {
      const err: any = new Error('Lançamento financeiro não encontrado para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (tx.status === 'REVERSED') {
      const err: any = new Error('Este lançamento financeiro já foi estornado anteriormente.');
      err.statusCode = 409;
      throw err;
    }

    const nowIso = new Date().toISOString();
    tx.status = 'REVERSED';
    tx.justification = justification.trim();
    tx.updatedAt = nowIso;
    tx.history = [
      ...(tx.history || []),
      {
        timestamp: nowIso,
        actor: actorId,
        action: 'TRANSACTION_REVERSED',
        note: justification.trim(),
      },
    ];

    const reversalEntry = {
      id: `ftx-rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      uniqueRef: `REV:${tx.id}`,
      type: 'REVERSAL',
      origin: 'REVERSAL',
      originId: tx.id,
      amountCents: tx.amountCents,
      feeCents: 0,
      netAmountCents: tx.amountCents,
      category: 'ESTORNO_CAIXA',
      description: `Estorno auditado: ${tx.description}`,
      paymentMethod: tx.paymentMethod,
      actorId,
      actorName: actorName || 'Administrador',
      status: 'CONFIRMED',
      reconciliationStatus: 'RECONCILED',
      reconciliationDiscrepancy: null,
      justification: justification.trim(),
      history: [
        {
          timestamp: nowIso,
          actor: actorId,
          action: 'REVERSAL_ENTRY_CREATED',
          note: justification.trim(),
        },
      ],
      occurredAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    memoryStore.financialTransactions.push(reversalEntry);

    db.recordAuditLog(tenantId, actorId, 'FINANCIAL_TRANSACTION_REVERSED', {
      originalTransactionId: tx.id,
      reversalTransactionId: reversalEntry.id,
      amountCents: tx.amountCents,
      justification,
    });

    return { original: tx, reversal: reversalEntry };
  },

  /**
   * Section 10: Reembolsos no Módulo Financeiro
   */
  listRefundsFinancial(tenantId: string, filters?: { status?: string; startDate?: string; endDate?: string }) {
    let refunds = memoryStore.refundRequests.filter((r: any) => r.tenantId === tenantId);

    if (filters?.status && filters.status !== 'ALL') {
      refunds = refunds.filter((r: any) => r.status === filters.status);
    }
    if (filters?.startDate) {
      const sMs = new Date(filters.startDate).getTime();
      refunds = refunds.filter((r: any) => new Date(r.createdAt).getTime() >= sMs);
    }
    if (filters?.endDate) {
      const eMs = new Date(filters.endDate).getTime();
      refunds = refunds.filter((r: any) => new Date(r.createdAt).getTime() <= eMs);
    }

    return refunds
      .map((r: any) => {
        const app = memoryStore.appointments.find((a: any) => a.id === r.appointmentId);
        const client = memoryStore.clients.find((c: any) => c.id === r.clientId);
        const payment = r.paymentId
          ? memoryStore.payments.find((p: any) => p.id === r.paymentId)
          : memoryStore.payments.find((p: any) => p.appointmentId === r.appointmentId);
        const cr = memoryStore.cancellationRequests.find((c: any) => c.id === r.cancellationRequestId);

        return {
          ...r,
          clientName: client?.name || 'Cliente',
          appointmentDateTime: app?.dateTime || null,
          originalPaymentAmountCents: Number(payment?.amountCents || cr?.paidDepositCents || r.amountCents || 0),
          requestedRefundCents: Number(r.amountCents || 0),
          completedRefundCents: r.status === 'COMPLETED' ? Number(r.amountCents || 0) : 0,
          cancellationReason: cr?.reason || null,
          adminJustification: cr?.adminJustification || null,
        };
      })
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  validateAndCreateRefundSafe(
    tenantId: string,
    actorId: string,
    data: {
      paymentId: string;
      amountCents: number;
      reason: string;
    }
  ) {
    const payment = memoryStore.payments.find(
      (p: any) => p.id === data.paymentId && p.tenantId === tenantId
    );
    if (!payment) {
      const err: any = new Error('Pagamento original não encontrado para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (!isPaymentConfirmed(payment)) {
      const err: any = new Error(
        'Não é permitido solicitar ou executar reembolso para um pagamento que não foi efetivamente aprovado.'
      );
      err.statusCode = 400;
      throw err;
    }

    const existingRefundsForPayment = memoryStore.refundRequests
      .filter(
        (r: any) =>
          r.tenantId === tenantId &&
          (r.paymentId === payment.id || r.appointmentId === payment.appointmentId) &&
          ['PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED'].includes(r.status)
      )
      .reduce((acc: number, r: any) => acc + Number(r.amountCents || 0), 0);

    const maxRefundableCents = Math.max(0, Number(payment.amountCents) - existingRefundsForPayment);

    if (data.amountCents <= 0 || data.amountCents > maxRefundableCents) {
      const err: any = new Error(
        `Valor de reembolso inválido (${formatBrl(data.amountCents)}). O reembolso nunca pode ser maior que o saldo efetivamente recebido disponível para devolução (${formatBrl(maxRefundableCents)}).`
      );
      err.statusCode = 400;
      throw err;
    }

    return { maxRefundableCents, valid: true };
  },

  /**
   * Section 11: Comissões de Profissionais
   */
  listCommissionRules(tenantId: string) {
    const rules = memoryStore.commissionRules.filter((r: any) => r.tenantId === tenantId);
    return rules.map((r: any) => {
      const prof = r.professionalId
        ? memoryStore.professionals.find((p: any) => p.id === r.professionalId)
        : null;
      const serv = r.serviceId
        ? memoryStore.services.find((s: any) => s.id === r.serviceId)
        : null;
      return {
        ...r,
        professionalName: prof?.name || (r.scope === 'SERVICE' ? 'Todas as profissionais' : '—'),
        serviceName: serv?.name || (r.scope === 'PROFESSIONAL' ? 'Todos os serviços' : '—'),
      };
    });
  },

  upsertCommissionRule(
    tenantId: string,
    actorId: string,
    data: {
      scope: 'PROFESSIONAL_SERVICE' | 'SERVICE' | 'PROFESSIONAL';
      professionalId?: string | null;
      serviceId?: string | null;
      percentage: number;
      fixedCents?: number;
      basis?: 'COMPLETED_SERVICE_VALUE' | 'RECEIVED_AMOUNT';
      active?: boolean;
    }
  ) {
    if (data.scope === 'PROFESSIONAL_SERVICE' && (!data.professionalId || !data.serviceId)) {
      const err: any = new Error(
        'Para regra específica Profissional + Serviço, informe professionalId e serviceId.'
      );
      err.statusCode = 400;
      throw err;
    }
    if (data.scope === 'SERVICE' && !data.serviceId) {
      const err: any = new Error('Para regra por Serviço, informe serviceId.');
      err.statusCode = 400;
      throw err;
    }
    if (data.scope === 'PROFESSIONAL' && !data.professionalId) {
      const err: any = new Error('Para regra por Profissional, informe professionalId.');
      err.statusCode = 400;
      throw err;
    }

    const normProfId = data.scope === 'SERVICE' ? null : data.professionalId || null;
    const normServId = data.scope === 'PROFESSIONAL' ? null : data.serviceId || null;

    const existing = memoryStore.commissionRules.find(
      (r: any) =>
        r.tenantId === tenantId &&
        r.scope === data.scope &&
        (r.professionalId || null) === normProfId &&
        (r.serviceId || null) === normServId
    );

    const nowIso = new Date().toISOString();

    if (existing) {
      existing.percentage = data.percentage;
      existing.fixedCents = data.fixedCents ?? existing.fixedCents ?? 0;
      existing.basis = data.basis || existing.basis || 'COMPLETED_SERVICE_VALUE';
      existing.active = data.active !== undefined ? data.active : true;
      existing.updatedAt = nowIso;
      this.syncCommissionsForTenant(tenantId);
      return existing;
    }

    const newRule = {
      id: `crule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      scope: data.scope,
      professionalId: normProfId,
      serviceId: normServId,
      percentage: data.percentage,
      fixedCents: data.fixedCents ?? 0,
      basis: data.basis || 'COMPLETED_SERVICE_VALUE',
      active: data.active !== undefined ? data.active : true,
      createdBy: actorId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    memoryStore.commissionRules.push(newRule);
    this.syncCommissionsForTenant(tenantId);

    db.recordAuditLog(tenantId, actorId, 'COMMISSION_RULE_CONFIGURED', {
      ruleId: newRule.id,
      scope: newRule.scope,
      percentage: newRule.percentage,
    });

    return newRule;
  },

  listCommissions(
    tenantId: string,
    filters?: {
      professionalId?: string;
      serviceId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    this.syncCommissionsForTenant(tenantId);

    let records = memoryStore.commissionRecords.filter((c: any) => c.tenantId === tenantId);

    if (filters?.professionalId && filters.professionalId !== 'ALL') {
      records = records.filter((c: any) => c.professionalId === filters.professionalId);
    }
    if (filters?.serviceId && filters.serviceId !== 'ALL') {
      records = records.filter((c: any) => c.serviceId === filters.serviceId);
    }
    if (filters?.status && filters.status !== 'ALL') {
      records = records.filter((c: any) => c.status === filters.status);
    }

    const enriched = records.map((c: any) => {
      const app = memoryStore.appointments.find((a: any) => a.id === c.appointmentId);
      const prof = memoryStore.professionals.find((p: any) => p.id === c.professionalId);
      const serv = memoryStore.services.find((s: any) => s.id === c.serviceId);
      const client = app ? memoryStore.clients.find((cl: any) => cl.id === app.clientId) : null;

      return {
        ...c,
        professionalName: prof?.name || 'Profissional',
        serviceName: serv?.name || 'Serviço',
        clientName: client?.name || 'Cliente',
        appointmentDateTime: app?.dateTime || c.createdAt,
        appointmentStatus: app?.status || 'UNKNOWN',
      };
    });

    let dateFiltered = enriched;
    if (filters?.startDate) {
      const sMs = new Date(filters.startDate).getTime();
      dateFiltered = dateFiltered.filter(
        (c: any) => new Date(c.appointmentDateTime || c.createdAt).getTime() >= sMs
      );
    }
    if (filters?.endDate) {
      const eMs = new Date(filters.endDate).getTime();
      dateFiltered = dateFiltered.filter(
        (c: any) => new Date(c.appointmentDateTime || c.createdAt).getTime() <= eMs
      );
    }

    dateFiltered.sort(
      (a: any, b: any) =>
        new Date(b.appointmentDateTime || b.createdAt).getTime() -
        new Date(a.appointmentDateTime || a.createdAt).getTime()
    );

    const summary = {
      pendingCalculationCents: dateFiltered
        .filter((c: any) => c.status === 'PENDING_CALCULATION')
        .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0),
      calculatedCents: dateFiltered
        .filter((c: any) => c.status === 'CALCULATED')
        .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0),
      approvedCents: dateFiltered
        .filter((c: any) => c.status === 'APPROVED')
        .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0),
      paidCents: dateFiltered
        .filter((c: any) => c.status === 'PAID')
        .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0),
      cancelledCents: dateFiltered
        .filter((c: any) => c.status === 'CANCELLED')
        .reduce((acc: number, c: any) => acc + Number(c.commissionAmountCents || 0), 0),
      noRuleCount: dateFiltered.filter((c: any) => c.status === 'NO_RULE_CONFIGURED').length,
    };

    return { items: dateFiltered, summary };
  },

  updateCommissionRecord(
    tenantId: string,
    commissionId: string,
    actorId: string,
    input: {
      action: 'APPROVE' | 'PAY' | 'CANCEL' | 'ADJUST';
      adjustedAmountCents?: number;
      paymentMethod?: string;
      registerAsExpense?: boolean;
      reason?: string;
    }
  ) {
    this.syncCommissionsForTenant(tenantId);

    const record = memoryStore.commissionRecords.find(
      (c: any) => c.id === commissionId && c.tenantId === tenantId
    );
    if (!record) {
      const err: any = new Error('Registro de comissão não encontrado para este estabelecimento.');
      err.statusCode = 404;
      throw err;
    }

    if (record.status === 'NO_RULE_CONFIGURED' && input.action !== 'ADJUST' && input.action !== 'CANCEL') {
      const err: any = new Error(
        'Não há regra de comissão configurada para este atendimento. Configure uma regra antes de aprovar ou pagar.'
      );
      err.statusCode = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const prevStatus = record.status;

    if (input.action === 'APPROVE') {
      if (record.status === 'PAID' || record.status === 'CANCELLED') {
        const err: any = new Error(`Não é possível aprovar comissão com status ${record.status}.`);
        err.statusCode = 400;
        throw err;
      }
      record.status = 'APPROVED';
      record.approvedBy = actorId;
      record.approvedAt = nowIso;
    } else if (input.action === 'PAY') {
      if (record.status === 'PAID') {
        const err: any = new Error('Esta comissão já foi paga anteriormente.');
        err.statusCode = 409;
        throw err;
      }
      if (record.status === 'CANCELLED') {
        const err: any = new Error('Não é permitido pagar uma comissão cancelada.');
        err.statusCode = 400;
        throw err;
      }
      record.status = 'PAID';
      if (!record.approvedBy) {
        record.approvedBy = actorId;
        record.approvedAt = nowIso;
      }
      record.paidBy = actorId;
      record.paidAt = nowIso;

      // Optionally register as paid expense or direct ledger entry (never both to avoid double counting)
      const prof = memoryStore.professionals.find((p: any) => p.id === record.professionalId);
      if (input.registerAsExpense) {
        const exp = this.createExpense(tenantId, actorId, {
          description: `Pagamento de comissão — ${prof?.name || 'Profissional'} (Atendimento ${record.appointmentId})`,
          category: 'OUTRAS',
          amountCents: record.commissionAmountCents,
          competenceDate: nowIso,
          dueDate: nowIso,
          status: 'PAID',
          paymentMethod: input.paymentMethod || 'PIX',
          notes: input.reason || 'Comissão quitada pelo módulo financeiro',
        });
        record.registeredAsExpenseId = exp.id;
      } else {
        const comRef = `COM:${record.id}`;
        const existingTx = memoryStore.financialTransactions.find(
          (t: any) => t.tenantId === tenantId && t.uniqueRef === comRef
        );
        if (!existingTx) {
          memoryStore.financialTransactions.push({
            id: `ftx-com-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            uniqueRef: comRef,
            type: 'OUTFLOW',
            origin: 'COMMISSION_PAID',
            originId: record.id,
            amountCents: record.commissionAmountCents,
            feeCents: 0,
            netAmountCents: record.commissionAmountCents,
            category: 'COMISSAO_PROFISSIONAL',
            description: `Comissão paga — ${prof?.name || 'Profissional'}`,
            paymentMethod: input.paymentMethod || 'PIX',
            actorId,
            actorName: 'Administração',
            status: 'CONFIRMED',
            reconciliationStatus: 'RECONCILED',
            reconciliationDiscrepancy: null,
            justification: input.reason || null,
            history: [],
            occurredAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      }
    } else if (input.action === 'CANCEL') {
      if (!input.reason || input.reason.trim().length < 3) {
        const err: any = new Error('Informe o motivo para cancelar a comissão.');
        err.statusCode = 400;
        throw err;
      }
      record.status = 'CANCELLED';
      record.cancelledBy = actorId;
      record.cancelledAt = nowIso;
      record.adjustmentReason = input.reason.trim();
      record.commissionAmountCents = 0;
    } else if (input.action === 'ADJUST') {
      if (input.adjustedAmountCents === undefined || input.adjustedAmountCents < 0) {
        const err: any = new Error('Informe o valor ajustado em centavos.');
        err.statusCode = 400;
        throw err;
      }
      if (!input.reason || input.reason.trim().length < 3) {
        const err: any = new Error('Informe a justificativa do ajuste de comissão.');
        err.statusCode = 400;
        throw err;
      }
      record.commissionAmountCents = input.adjustedAmountCents;
      record.adjustmentReason = input.reason.trim();
      record.manuallyAdjusted = true;
      if (record.status === 'NO_RULE_CONFIGURED' || record.status === 'PENDING_CALCULATION') {
        record.status = 'CALCULATED';
      }
    }

    record.updatedAt = nowIso;
    record.history = [
      ...(record.history || []),
      {
        timestamp: nowIso,
        actor: actorId,
        action: `COMMISSION_${input.action}`,
        fromStatus: prevStatus,
        toStatus: record.status,
        note: input.reason || '',
      },
    ];

    return record;
  },

  /**
   * Section 12: Relatórios Gerenciais Completos e Comparação entre Períodos
   */
  getFinancialReports(
    tenantId: string,
    filters?: {
      preset?: string;
      startDate?: string;
      endDate?: string;
      professionalId?: string;
      serviceId?: string;
    }
  ) {
    this.syncLedgerForTenant(tenantId);
    this.syncCommissionsForTenant(tenantId);

    const period = resolvePeriodRange(filters);
    const dashboard = this.getFinancialDashboard(tenantId, filters);

    // Compute previous period of equal duration for comparison
    const durationMs = Math.max(24 * 3600 * 1000, period.endMs - period.startMs);
    const prevEnd = new Date(period.startMs - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const prevDashboard = this.getFinancialDashboard(tenantId, {
      preset: 'CUSTOM',
      startDate: prevStart.toISOString(),
      endDate: prevEnd.toISOString(),
    });

    const inPeriod = (iso: any) => {
      if (!iso) return false;
      const ms = new Date(iso).getTime();
      return ms >= period.startMs && ms <= period.endMs;
    };

    // 1. Receipts by day
    const receiptsByDayMap: Record<string, { date: string; amountCents: number; count: number }> = {};
    const confirmedPayments = memoryStore.payments.filter(
      (p: any) =>
        p.tenantId === tenantId &&
        isPaymentConfirmed(p) &&
        inPeriod(p.approvedAt || p.createdAt)
    );
    for (const p of confirmedPayments) {
      const app = memoryStore.appointments.find((a: any) => a.id === p.appointmentId);
      if (filters?.professionalId && filters.professionalId !== 'ALL' && app?.professionalId !== filters.professionalId) continue;
      if (filters?.serviceId && filters.serviceId !== 'ALL' && app?.serviceId !== filters.serviceId) continue;

      const day = new Date(p.approvedAt || p.createdAt).toISOString().slice(0, 10);
      if (!receiptsByDayMap[day]) receiptsByDayMap[day] = { date: day, amountCents: 0, count: 0 };
      receiptsByDayMap[day].amountCents += Number(p.amountCents || 0);
      receiptsByDayMap[day].count += 1;
    }

    // 2. Sales by Service
    const salesByServiceMap: Record<
      string,
      { serviceId: string; serviceName: string; completedCount: number; salesCents: number; receivedCents: number }
    > = {};
    const tenantApps = memoryStore.appointments.filter(
      (a: any) => a.tenantId === tenantId && inPeriod(a.dateTime)
    );
    for (const a of tenantApps) {
      if (filters?.professionalId && filters.professionalId !== 'ALL' && a.professionalId !== filters.professionalId) continue;
      if (filters?.serviceId && filters.serviceId !== 'ALL' && a.serviceId !== filters.serviceId) continue;

      const serv = memoryStore.services.find((s: any) => s.id === a.serviceId);
      const sId = a.serviceId;
      if (!salesByServiceMap[sId]) {
        salesByServiceMap[sId] = {
          serviceId: sId,
          serviceName: serv?.name || 'Serviço',
          completedCount: 0,
          salesCents: 0,
          receivedCents: 0,
        };
      }
      if (a.status === 'COMPLETED') {
        salesByServiceMap[sId].completedCount += 1;
        salesByServiceMap[sId].salesCents += Number(a.snapshotPriceCents ?? a.totalAmountCents ?? 0);
      }
      const appPaid = memoryStore.payments
        .filter((p: any) => p.tenantId === tenantId && p.appointmentId === a.id && isPaymentConfirmed(p))
        .reduce((acc: number, p: any) => acc + Number(p.amountCents || 0), 0);
      salesByServiceMap[sId].receivedCents += appPaid;
    }

    // 3. Performance by Professional
    const byProfessionalMap: Record<
      string,
      {
        professionalId: string;
        professionalName: string;
        completedCount: number;
        cancelledCount: number;
        noShowCount: number;
        serviceRevenueCents: number;
        commissionsCalculatedCents: number;
        commissionsPaidCents: number;
      }
    > = {};
    for (const prof of memoryStore.professionals.filter((p: any) => p.tenantId === tenantId)) {
      if (filters?.professionalId && filters.professionalId !== 'ALL' && prof.id !== filters.professionalId) continue;
      byProfessionalMap[prof.id] = {
        professionalId: prof.id,
        professionalName: prof.name,
        completedCount: 0,
        cancelledCount: 0,
        noShowCount: 0,
        serviceRevenueCents: 0,
        commissionsCalculatedCents: 0,
        commissionsPaidCents: 0,
      };
    }
    for (const a of tenantApps) {
      if (!byProfessionalMap[a.professionalId]) continue;
      if (filters?.serviceId && filters.serviceId !== 'ALL' && a.serviceId !== filters.serviceId) continue;
      if (a.status === 'COMPLETED') {
        byProfessionalMap[a.professionalId].completedCount += 1;
        byProfessionalMap[a.professionalId].serviceRevenueCents += Number(a.snapshotPriceCents ?? a.totalAmountCents ?? 0);
      } else if (a.status === 'CANCELLED') {
        byProfessionalMap[a.professionalId].cancelledCount += 1;
      } else if (a.status === 'NO_SHOW') {
        byProfessionalMap[a.professionalId].noShowCount += 1;
      }
    }
    for (const c of memoryStore.commissionRecords.filter((cr: any) => cr.tenantId === tenantId)) {
      if (!byProfessionalMap[c.professionalId]) continue;
      if (['CALCULATED', 'APPROVED'].includes(c.status)) {
        byProfessionalMap[c.professionalId].commissionsCalculatedCents += Number(c.commissionAmountCents || 0);
      } else if (c.status === 'PAID') {
        byProfessionalMap[c.professionalId].commissionsPaidCents += Number(c.commissionAmountCents || 0);
      }
    }

    // 4. Expenses by Category
    const expensesByCategoryMap: Record<
      string,
      { category: string; paidCents: number; pendingCents: number; count: number }
    > = {};
    for (const e of memoryStore.expenses.filter((ex: any) => ex.tenantId === tenantId)) {
      if (!inPeriod(e.paidAt || e.dueDate || e.competenceDate) && period.preset !== 'THIS_MONTH' && period.preset !== 'ALL') {
        continue;
      }
      if (e.status === 'CANCELLED' || e.status === 'REVERSED') continue;
      const cat = e.category || 'OUTRAS';
      if (!expensesByCategoryMap[cat]) {
        expensesByCategoryMap[cat] = { category: cat, paidCents: 0, pendingCents: 0, count: 0 };
      }
      expensesByCategoryMap[cat].count += 1;
      if (e.status === 'PAID') {
        expensesByCategoryMap[cat].paidCents += Number(e.amountCents || 0);
      } else if (e.status === 'PENDING') {
        expensesByCategoryMap[cat].pendingCents += Number(e.amountCents || 0);
      }
    }

    // 5. Cancellations & No-shows summary
    const cancellationsCount = tenantApps.filter((a: any) => a.status === 'CANCELLED').length;
    const noShowsCount = tenantApps.filter((a: any) => a.status === 'NO_SHOW').length;

    return {
      period: dashboard.period,
      currentIndicators: dashboard.indicators,
      previousPeriodComparison: {
        previousStartDate: prevDashboard.period.startDate,
        previousEndDate: prevDashboard.period.endDate,
        previousConfirmedReceiptsCents: prevDashboard.indicators.confirmedReceiptsCents,
        previousPaidExpensesCents: prevDashboard.indicators.paidExpensesCents,
        previousEstimatedResultCents: prevDashboard.indicators.estimatedFinancialResultCents,
        receiptsDeltaCents:
          dashboard.indicators.confirmedReceiptsCents -
          prevDashboard.indicators.confirmedReceiptsCents,
      },
      receiptsByDay: Object.values(receiptsByDayMap).sort((a, b) => a.date.localeCompare(b.date)),
      salesByService: Object.values(salesByServiceMap),
      byProfessional: Object.values(byProfessionalMap),
      expensesByCategory: Object.values(expensesByCategoryMap),
      cancellationsAndNoShows: {
        cancellationsCount,
        noShowsCount,
        completedRefundsCents: dashboard.indicators.completedRefundsCents,
      },
    };
  },

  /**
   * Section 12: Exportação CSV gerada no backend
   */
  exportFinancialCsv(tenantId: string, businessName: string, filters?: PeriodFilterInput) {
    const dashboard = this.getFinancialDashboard(tenantId, filters);
    const ledger = this.listLedgerTransactions(tenantId, {
      startDate: dashboard.period.startDate,
      endDate: dashboard.period.endDate,
      pageSize: 500,
    });

    const escapeCsv = (val: any) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines: string[] = [];
    lines.push(`"RELATÓRIO FINANCEIRO - ${businessName.replace(/"/g, '""')}"`);
    lines.push(`"Período de Referência";${escapeCsv(dashboard.period.label)};"Início";${escapeCsv(dashboard.period.startDate.slice(0, 10))};"Fim";${escapeCsv(dashboard.period.endDate.slice(0, 10))}`);
    lines.push(`"Gerado em";${escapeCsv(new Date().toISOString())}`);
    lines.push('');
    lines.push('"RESUMO DOS INDICADORES DO PERÍODO";"VALOR (CENTAVOS)";"VALOR FORMATADO (R$)"');
    lines.push(`"Recebimentos Confirmados";${dashboard.indicators.confirmedReceiptsCents};${escapeCsv(formatBrl(dashboard.indicators.confirmedReceiptsCents))}`);
    lines.push(`"Valores Pendentes (Contas a Receber)";${dashboard.indicators.pendingReceivablesCents};${escapeCsv(formatBrl(dashboard.indicators.pendingReceivablesCents))}`);
    lines.push(`"Vendas de Serviços Concluídos (Competência)";${dashboard.indicators.completedServicesSalesCents};${escapeCsv(formatBrl(dashboard.indicators.completedServicesSalesCents))}`);
    lines.push(`"Despesas Pagas";${dashboard.indicators.paidExpensesCents};${escapeCsv(formatBrl(dashboard.indicators.paidExpensesCents))}`);
    lines.push(`"Despesas Pendentes";${dashboard.indicators.pendingExpensesCents};${escapeCsv(formatBrl(dashboard.indicators.pendingExpensesCents))}`);
    lines.push(`"Reembolsos Concluídos";${dashboard.indicators.completedRefundsCents};${escapeCsv(formatBrl(dashboard.indicators.completedRefundsCents))}`);
    lines.push(`"Comissões Calculadas/Aprovadas";${dashboard.indicators.calculatedCommissionsCents};${escapeCsv(formatBrl(dashboard.indicators.calculatedCommissionsCents))}`);
    lines.push(`"Comissões Pagas";${dashboard.indicators.paidCommissionsCents};${escapeCsv(formatBrl(dashboard.indicators.paidCommissionsCents))}`);
    lines.push(`"Resultado Financeiro Estimado (Gerencial)";${dashboard.indicators.estimatedFinancialResultCents};${escapeCsv(formatBrl(dashboard.indicators.estimatedFinancialResultCents))}`);
    lines.push('');
    lines.push('"LANÇAMENTOS DO LIVRO DE CAIXA NO PERÍODO"');
    lines.push('"ID";"DATA/HORA";"TIPO";"ORIGEM";"CATEGORIA";"DESCRIÇÃO";"FORMA PAGTO";"STATUS";"VALOR BRUTO (R$)";"TAXA (R$)";"VALOR LÍQUIDO (R$)"');

    for (const tx of ledger.items) {
      lines.push(
        [
          escapeCsv(tx.id),
          escapeCsv(tx.occurredAt),
          escapeCsv(tx.type),
          escapeCsv(tx.origin),
          escapeCsv(tx.category),
          escapeCsv(tx.description),
          escapeCsv(tx.paymentMethod || '—'),
          escapeCsv(tx.status),
          escapeCsv(formatBrl(tx.amountCents)),
          escapeCsv(tx.feeCents !== null && tx.feeCents !== undefined ? formatBrl(tx.feeCents) : 'Indisponível'),
          escapeCsv(formatBrl(tx.netAmountCents)),
        ].join(';')
      );
    }

    return lines.join('\n');
  },

  /**
   * Section 12: Relatório Imprimível / PDF HTML estruturado no backend
   */
  exportFinancialPrintableHtml(tenantId: string, businessName: string, filters?: PeriodFilterInput) {
    const report = this.getFinancialReports(tenantId, filters);
    const ind = report.currentIndicators;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório Financeiro — ${businessName}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1c1917; margin: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; color: #be123c; }
    .meta { font-size: 12px; color: #57534e; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .card { border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px; background: #fafaf9; }
    .card-label { font-size: 11px; color: #57534e; text-transform: uppercase; }
    .card-val { font-size: 18px; font-weight: bold; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th, td { border: 1px solid #d6d3d1; padding: 8px; text-align: left; }
    th { background: #f5f5f4; font-weight: bold; }
    .note { margin-top: 24px; font-size: 11px; color: #78716c; border-top: 1px solid #e7e5e4; padding-top: 12px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;">
    <button onclick="window.print()" style="padding:8px 16px;background:#e11d48;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
      Imprimir / Salvar em PDF
    </button>
  </div>
  <h1>Relatório Financeiro Gerencial — ${businessName}</h1>
  <div class="meta">
    <strong>Período filtrado:</strong> ${report.period.label} (${report.period.startDate.slice(0, 10)} até ${report.period.endDate.slice(0, 10)})<br/>
    <strong>Emitido em:</strong> ${new Date().toLocaleString('pt-BR')}
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">Recebimentos Confirmados</div>
      <div class="card-val">${formatBrl(ind.confirmedReceiptsCents)}</div>
    </div>
    <div class="card">
      <div class="card-label">Contas a Receber (Saldos Pendentes)</div>
      <div class="card-val">${formatBrl(ind.pendingReceivablesCents)}</div>
    </div>
    <div class="card">
      <div class="card-label">Vendas de Serviços Concluídos</div>
      <div class="card-val">${formatBrl(ind.completedServicesSalesCents)} (${ind.completedAppointmentsCount} atend.)</div>
    </div>
    <div class="card">
      <div class="card-label">Despesas Pagas</div>
      <div class="card-val">${formatBrl(ind.paidExpensesCents)}</div>
    </div>
    <div class="card">
      <div class="card-label">Reembolsos Concluídos</div>
      <div class="card-val">${formatBrl(ind.completedRefundsCents)}</div>
    </div>
    <div class="card">
      <div class="card-label">Resultado Financeiro Estimado</div>
      <div class="card-val">${formatBrl(ind.estimatedFinancialResultCents)}</div>
    </div>
  </div>

  <h2>Desempenho por Serviço</h2>
  <table>
    <thead>
      <tr>
        <th>Serviço</th>
        <th>Atendimentos Concluídos</th>
        <th>Valor Contratado Concluído</th>
        <th>Recebimento Confirmado</th>
      </tr>
    </thead>
    <tbody>
      ${report.salesByService
        .map(
          (s: any) => `<tr>
        <td>${s.serviceName}</td>
        <td>${s.completedCount}</td>
        <td>${formatBrl(s.salesCents)}</td>
        <td>${formatBrl(s.receivedCents)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <h2>Desempenho e Comissões por Profissional</h2>
  <table>
    <thead>
      <tr>
        <th>Profissional</th>
        <th>Concluídos</th>
        <th>Cancelados / Faltas</th>
        <th>Comissões Calculadas/Aprovadas</th>
        <th>Comissões Pagas</th>
      </tr>
    </thead>
    <tbody>
      ${report.byProfessional
        .map(
          (p: any) => `<tr>
        <td>${p.professionalName}</td>
        <td>${p.completedCount}</td>
        <td>${p.cancelledCount} / ${p.noShowCount}</td>
        <td>${formatBrl(p.commissionsCalculatedCents)}</td>
        <td>${formatBrl(p.commissionsPaidCents)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="note">
    Nota Técnica: O Resultado Financeiro Estimado (${formatBrl(ind.estimatedFinancialResultCents)}) é um indicador gerencial calculado como (Recebimentos Confirmados − Reembolsos Concluídos − Despesas Pagas − Taxas Confirmadas) e não substitui demonstrativos contábeis oficiais.
  </div>
</body>
</html>`;
  },
};
