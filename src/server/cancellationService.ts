import { db, memoryStore, DEFAULT_CANCELLATION_POLICY_TEXT, DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS } from './storage.js';
import { getMySqlPool } from './db/mysql.js';
import { PaymentProvider } from './payments/types.js';
import { MercadoPagoPaymentProvider } from './payments/MercadoPagoPaymentProvider.js';
import { CancellationRequestStatus, RefundRequestStatus } from '../types/index.js';

// In-memory concurrency locks to prevent race conditions on simultaneous requests
const activeAppointmentCancellationLocks = new Set<string>();
const activeRefundExecutionLocks = new Set<string>();

export const VALID_CANCELLATION_TRANSITIONS: Record<CancellationRequestStatus, CancellationRequestStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'],
  APPROVED: ['COMPLETED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export const VALID_REFUND_TRANSITIONS: Record<RefundRequestStatus, RefundRequestStatus[]> = {
  NOT_REQUESTED: ['PENDING_REVIEW', 'APPROVED'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  FAILED: ['PROCESSING', 'COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
};

export function assertValidCancellationTransition(from: CancellationRequestStatus, to: CancellationRequestStatus) {
  if (from === to) return;
  const allowed = VALID_CANCELLATION_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err: any = new Error(`Transição de estado de cancelamento inválida: ${from} -> ${to}`);
    err.statusCode = 400;
    throw err;
  }
}

export function assertValidRefundTransition(from: RefundRequestStatus, to: RefundRequestStatus) {
  if (from === to) return;
  const allowed = VALID_REFUND_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err: any = new Error(`Transição de estado de reembolso inválida: ${from} -> ${to}`);
    err.statusCode = 400;
    throw err;
  }
}

export function formatInTimezone(dateInput: Date | string, timezone = 'America/Sao_Paulo'): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return d.toISOString();
  }
}

export class CancellationService {
  private defaultProvider: PaymentProvider;

  constructor(provider?: PaymentProvider) {
    this.defaultProvider = provider || new MercadoPagoPaymentProvider();
  }

  private getProvider(customProvider?: PaymentProvider): PaymentProvider {
    return customProvider || this.defaultProvider;
  }

  /**
   * 1. Get or update establishment cancellation policy
   */
  async getCancellationPolicy(tenantId: string) {
    const business = await db.getBusiness(tenantId);
    return {
      tenantId,
      cancellationHoursLimit: Number(business?.cancellationHoursLimit ?? 6),
      allowCustomerReschedule: business?.allowCustomerReschedule ?? true,
      allowManualReviewOutOfPeriod: business?.allowManualReviewOutOfPeriod ?? true,
      cancellationPolicyText: business?.cancellationPolicyText || DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions: business?.cancellationContactInstructions || DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      cancellationPolicyVersion: Number(business?.cancellationPolicyVersion ?? 1),
      timezone: business?.timezone || 'America/Sao_Paulo',
    };
  }

  async updateCancellationPolicy(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    data: {
      cancellationHoursLimit: number;
      allowCustomerReschedule?: boolean;
      allowManualReviewOutOfPeriod?: boolean;
      cancellationPolicyText?: string;
      cancellationContactInstructions?: string;
    }
  ) {
    if (actorRole === 'CUSTOMER') {
      const err: any = new Error('Acesso negado: clientes não têm permissão para alterar a política de cancelamento.');
      err.statusCode = 403;
      throw err;
    }

    const hours = Number(data.cancellationHoursLimit);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      const err: any = new Error('Prazo de cancelamento inválido: informe um número inteiro positivo entre 1 e 720 horas.');
      err.statusCode = 400;
      throw err;
    }

    const updated = await db.updateBusiness(tenantId, {
      cancellationHoursLimit: hours,
      ...(data.allowCustomerReschedule !== undefined ? { allowCustomerReschedule: Boolean(data.allowCustomerReschedule) } : {}),
      ...(data.allowManualReviewOutOfPeriod !== undefined ? { allowManualReviewOutOfPeriod: Boolean(data.allowManualReviewOutOfPeriod) } : {}),
      ...(data.cancellationPolicyText !== undefined ? { cancellationPolicyText: data.cancellationPolicyText } : {}),
      ...(data.cancellationContactInstructions !== undefined ? { cancellationContactInstructions: data.cancellationContactInstructions } : {}),
    });

    await db.recordAuditLog(tenantId, actorUserId, 'CANCELLATION_POLICY_UPDATED', {
      cancellationHoursLimit: updated.cancellationHoursLimit,
      allowCustomerReschedule: updated.allowCustomerReschedule,
      allowManualReviewOutOfPeriod: updated.allowManualReviewOutOfPeriod,
      cancellationPolicyVersion: updated.cancellationPolicyVersion,
    });

    return {
      tenantId,
      cancellationHoursLimit: updated.cancellationHoursLimit,
      allowCustomerReschedule: updated.allowCustomerReschedule,
      allowManualReviewOutOfPeriod: updated.allowManualReviewOutOfPeriod,
      cancellationPolicyText: updated.cancellationPolicyText,
      cancellationContactInstructions: updated.cancellationContactInstructions,
      cancellationPolicyVersion: updated.cancellationPolicyVersion,
    };
  }

  /**
   * 2. Calculate cancellation deadline and eligibility using historical reservation snapshot
   */
  async calculateCancellationEligibility(params: {
    tenantId: string;
    appointmentId: string;
    clientId?: string;
    now?: Date;
  }) {
    const { tenantId, appointmentId, clientId } = params;
    const evaluationTime = params.now || new Date();

    const appointment = await db.getAppointmentById(tenantId, appointmentId);
    if (!appointment) {
      const err: any = new Error('Agendamento não encontrado para esta empresa.');
      err.statusCode = 404;
      throw err;
    }

    if (clientId && appointment.clientId !== clientId) {
      const err: any = new Error('Acesso negado: este agendamento não pertence à cliente autenticada.');
      err.statusCode = 403;
      throw err;
    }

    const business = await db.getBusiness(tenantId);
    const timezone = business?.timezone || 'America/Sao_Paulo';

    // Determine whether this appointment has a preserved historical policy
    const hasHistoricalPolicy =
      appointment.snapshotCancellationHours !== null &&
      appointment.snapshotCancellationHours !== undefined &&
      appointment.policyAcceptedAt !== null &&
      appointment.policyAcceptedAt !== undefined;

    // Use historical snapshot if present; otherwise apply documented fallback rule without fabricating policyAcceptedAt
    const applicableHoursLimit = hasHistoricalPolicy
      ? Number(appointment.snapshotCancellationHours)
      : Number(business?.cancellationHoursLimit ?? 6);

    const applicablePolicyText = hasHistoricalPolicy
      ? appointment.snapshotPolicyText || DEFAULT_CANCELLATION_POLICY_TEXT
      : business?.cancellationPolicyText || DEFAULT_CANCELLATION_POLICY_TEXT;

    const applicablePolicyVersion = hasHistoricalPolicy
      ? Number(appointment.snapshotPolicyVersion ?? 1)
      : null;

    const appointmentDate = new Date(appointment.dateTime);
    const appointmentTimeMs = appointmentDate.getTime();
    const deadlineMs = appointmentTimeMs - applicableHoursLimit * 3600 * 1000;
    const deadlineDate = new Date(deadlineMs);
    const nowMs = evaluationTime.getTime();

    const hoursNoticeCalculated = Number(((appointmentTimeMs - nowMs) / (3600 * 1000)).toFixed(2));
    const isWithinTimeLimit = nowMs <= deadlineMs;
    const isWithinPolicy = isWithinTimeLimit && hasHistoricalPolicy;

    // Inspect real payment status — ONLY confirmed (APPROVED) payments count as received money!
    const payment = await db.getPaymentByAppointmentId(tenantId, appointmentId);
    const isPaymentConfirmed = Boolean(payment && (payment.status === 'APPROVED' || payment.status === 'REFUND_PENDING' || payment.status === 'REFUNDED'));
    const grossPaidCents = isPaymentConfirmed ? Number(payment.amountCents || 0) : 0;
    const alreadyRefundedCents = isPaymentConfirmed ? Number(payment.refundedAmountCents || 0) : 0;
    const paidDepositCents = Math.max(0, grossPaidCents - alreadyRefundedCents);

    const totalAmountCents = Number(appointment.totalAmountCents || 0);
    const balanceAmountCents = Number(appointment.balanceAmountCents || Math.max(0, totalAmountCents - Number(appointment.depositAmountCents || 0)));

    // Check existing active cancellation request
    const existingRequest = memoryStore.cancellationRequests.find(
      (r: any) => r.appointmentId === appointmentId && r.tenantId === tenantId && r.status !== 'CANCELLED'
    );

    let canRequestCancellation = true;
    let blockReason: string | null = null;

    if (existingRequest) {
      canRequestCancellation = false;
      blockReason = `Já existe uma solicitação de cancelamento (${existingRequest.referenceCode}) com status ${existingRequest.status}.`;
    } else if (appointment.status === 'COMPLETED') {
      canRequestCancellation = false;
      blockReason = 'Não é possível solicitar cancelamento automático de um atendimento já concluído.';
    } else if (appointment.status === 'CANCELLED' || appointment.status === 'EXPIRED') {
      canRequestCancellation = false;
      blockReason = 'Este agendamento já se encontra cancelado ou expirado.';
    } else if (nowMs >= appointmentTimeMs) {
      canRequestCancellation = false;
      blockReason = 'O horário do atendimento já foi iniciado ou ultrapassado.';
    }

    const isEligibleForRefund = isWithinPolicy && paidDepositCents > 0;
    const requiresManualReview = !isWithinPolicy || !hasHistoricalPolicy;

    let eligibilityMessage = '';
    if (!canRequestCancellation) {
      eligibilityMessage = blockReason || 'Cancelamento indisponível para este agendamento.';
    } else if (!hasHistoricalPolicy) {
      eligibilityMessage =
        'Agendamento anterior ao registro de política histórica: sua solicitação será encaminhada para análise manual do estabelecimento, sem presumir aceite automático.';
    } else if (isWithinPolicy) {
      if (paidDepositCents > 0) {
        eligibilityMessage = `Dentro do prazo de ${applicableHoursLimit}h. Você é elegível para solicitar o reembolso integral do sinal efetivamente pago (${(paidDepositCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`;
      } else {
        eligibilityMessage = `Dentro do prazo de ${applicableHoursLimit}h. Como não há sinal pago confirmado, o horário será liberado sem necessidade de reembolso financeiro.`;
      }
    } else {
      eligibilityMessage = `Solicitação fora do prazo padrão de ${applicableHoursLimit}h (limite era ${formatInTimezone(deadlineDate, timezone)}). Você ainda pode registrar a solicitação para análise manual de exceção pelo estabelecimento, preservados os direitos legais aplicáveis.`;
    }

    const formattedPaidDeposit = (paidDepositCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    return {
      appointmentId: appointment.id,
      tenantId,
      appointmentStatus: appointment.status,
      serviceName: appointment.service?.name || 'Serviço',
      professionalName: appointment.professional?.name || 'Profissional',
      appointmentDateTime: appointment.dateTime,
      formattedAppointmentDateTime: formatInTimezone(appointmentDate, timezone),
      deadlineUtc: deadlineDate.toISOString(),
      deadlineIso: deadlineDate.toISOString(),
      formattedDeadline: formatInTimezone(deadlineDate, timezone),
      timezone,
      hasHistoricalPolicy,
      snapshotCancellationHours: hasHistoricalPolicy ? Number(appointment.snapshotCancellationHours) : null,
      applicableHoursLimit,
      hoursLimit: applicableHoursLimit,
      snapshotPolicyText: applicablePolicyText,
      policyText: applicablePolicyText,
      snapshotPolicyVersion: applicablePolicyVersion,
      policyAcceptedAt: appointment.policyAcceptedAt || null,
      hoursNoticeCalculated,
      hoursRemaining: hoursNoticeCalculated,
      isWithinTimeLimit,
      isWithinPolicy,
      canRequestCancellation,
      canReschedule: canRequestCancellation && Boolean(business?.allowCustomerReschedule ?? true) && isWithinTimeLimit,
      isEligibleForRefund,
      requiresManualReview,
      totalAmountCents,
      paidDepositCents,
      formattedPaidDeposit,
      pendingBalanceCents: balanceAmountCents,
      refundableAmountCents: isEligibleForRefund ? paidDepositCents : 0,
      maxPotentialRefundCents: paidDepositCents,
      paymentStatus: payment?.status || 'NONE',
      paymentId: payment?.id || null,
      eligibilityMessage,
      reasonMessage: eligibilityMessage,
      legalNotice:
        'A confirmação do reembolso depende da validação e processamento efetivo pelo provedor de pagamento (Mercado Pago). A política interna do estabelecimento não exclui direitos legais obrigatórios do consumidor.',
      contactInstructions: business?.cancellationContactInstructions || DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      existingRequest: existingRequest || null,
    };
  }

  /**
   * 3. Create a customer cancellation request safely with concurrency lock
   */
  async createCancellationRequest(params: {
    tenantId: string;
    appointmentId: string;
    clientId: string;
    reason?: string;
    confirmedByCustomer: boolean;
    now?: Date;
    rawBody?: any;
  }) {
    const { tenantId, appointmentId, clientId, reason, confirmedByCustomer } = params;
    const evaluationTime = params.now || new Date();

    // Reject any frontend attempt to inject or manipulate financial amounts or statuses
    if (
      params.rawBody &&
      (params.rawBody.refundableAmountCents !== undefined ||
        params.rawBody.paidDepositCents !== undefined ||
        params.rawBody.amountCents !== undefined ||
        params.rawBody.status !== undefined ||
        params.rawBody.refundStatus !== undefined)
    ) {
      const err: any = new Error('Violação de segurança: o frontend não tem permissão para definir valores de reembolso ou status diretamente.');
      err.statusCode = 400;
      throw err;
    }

    if (!confirmedByCustomer) {
      const err: any = new Error('Confirmação explícita obrigatória para enviar a solicitação de cancelamento.');
      err.statusCode = 400;
      throw err;
    }

    const lockKey = `${tenantId}:${appointmentId}`;
    if (activeAppointmentCancellationLocks.has(lockKey)) {
      const err: any = new Error('Operação simultânea bloqueada: já existe uma solicitação de cancelamento sendo processada para esta reserva.');
      err.statusCode = 409;
      throw err;
    }

    activeAppointmentCancellationLocks.add(lockKey);
    try {
      // Check if an active request already exists
      const duplicate = memoryStore.cancellationRequests.find(
        (r: any) => r.appointmentId === appointmentId && r.tenantId === tenantId && r.status !== 'CANCELLED'
      );
      if (duplicate) {
        const err: any = new Error(`Solicitação duplicada: já existe a solicitação ${duplicate.referenceCode} para este agendamento.`);
        err.statusCode = 409;
        throw err;
      }

      const eligibility = await this.calculateCancellationEligibility({
        tenantId,
        appointmentId,
        clientId,
        now: evaluationTime,
      });

      if (!eligibility.canRequestCancellation) {
        const err: any = new Error(eligibility.eligibilityMessage || 'Não é possível cancelar este agendamento.');
        err.statusCode = 400;
        throw err;
      }

      const nowIso = evaluationTime.toISOString();
      const referenceCode = `CANC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const requestId = `creq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      let initialStatus: CancellationRequestStatus = 'PENDING';
      let initialRefundStatus: RefundRequestStatus = 'NOT_REQUESTED';
      let refundableAmountCents = 0;

      // Case 1: No deposit was effectively paid (e.g., PENDING_PAYMENT or unpaid)
      if (eligibility.paidDepositCents === 0) {
        initialStatus = 'COMPLETED';
        initialRefundStatus = 'NOT_REQUESTED';
        refundableAmountCents = 0;
        // Release the appointment slot immediately
        await db.updateAppointmentStatus(tenantId, appointmentId, 'CANCELLED');
      }
      // Case 2: Deposit was paid AND request is within the accepted historical policy deadline
      else if (eligibility.isWithinPolicy) {
        initialStatus = 'APPROVED';
        initialRefundStatus = 'APPROVED'; // Approved for refund execution, NOT completed until provider confirms!
        refundableAmountCents = eligibility.paidDepositCents;
        await db.updateAppointmentStatus(tenantId, appointmentId, 'CANCELLED');
      }
      // Case 3: Deposit was paid AND request is outside deadline (or legacy without recorded policy)
      else {
        initialStatus = 'PENDING';
        initialRefundStatus = 'PENDING_REVIEW';
        refundableAmountCents = 0; // Requires manual decision by owner
      }

      const history = [
        {
          timestamp: nowIso,
          actor: `CUSTOMER:${clientId}`,
          toStatus: initialStatus,
          refundStatus: initialRefundStatus,
          note: eligibility.isWithinPolicy
            ? `Solicitação enviada dentro do prazo (${eligibility.hoursNoticeCalculated}h de antecedência).`
            : !eligibility.hasHistoricalPolicy
            ? 'Solicitação enviada para reserva sem política histórica gravada — encaminhada para análise manual.'
            : `Solicitação enviada fora do prazo padrão (${eligibility.hoursNoticeCalculated}h de antecedência; mínimo de ${eligibility.applicableHoursLimit}h).`,
        },
      ];

      const newRequest: any = {
        id: requestId,
        referenceCode,
        tenantId,
        appointmentId,
        clientId,
        status: initialStatus,
        refundStatus: initialRefundStatus,
        reason: reason || 'Solicitado pela cliente via Portal',
        isWithinPolicy: eligibility.isWithinPolicy,
        isEligibleForRefund: eligibility.isEligibleForRefund,
        hoursNoticeCalculated: eligibility.hoursNoticeCalculated,
        snapshotCancellationHours: eligibility.snapshotCancellationHours,
        snapshotPolicyText: eligibility.snapshotPolicyText,
        snapshotPolicyVersion: eligibility.snapshotPolicyVersion,
        hasHistoricalPolicy: eligibility.hasHistoricalPolicy,
        deadlineCalculatedAt: eligibility.deadlineUtc,
        paidDepositCents: eligibility.paidDepositCents,
        refundableAmountCents,
        adminDecisionBy: null,
        adminDecisionAt: null,
        adminJustification: null,
        isManualException: false,
        history,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      memoryStore.cancellationRequests.push(newRequest);

      let refundRequest: any = null;
      if (eligibility.paidDepositCents > 0) {
        const payment = await db.getPaymentByAppointmentId(tenantId, appointmentId);
        const refundId = `rreq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        refundRequest = {
          id: refundId,
          tenantId,
          cancellationRequestId: requestId,
          appointmentId,
          clientId,
          paymentId: payment?.id || null,
          provider: payment?.provider || 'MERCADO_PAGO',
          providerPaymentId: payment?.providerPaymentId || null,
          providerRefundId: null,
          idempotencyKey: `idemp-refund-${tenantId}-${appointmentId}-${requestId}`,
          amountCents: eligibility.paidDepositCents,
          status: initialRefundStatus,
          authorizedBy: eligibility.isWithinPolicy ? 'SYSTEM_POLICY' : null,
          authorizedAt: eligibility.isWithinPolicy ? nowIso : null,
          processedAt: null,
          completedAt: null,
          lastError: null,
          rawResponse: null,
          history: [
            {
              timestamp: nowIso,
              actor: `CUSTOMER:${clientId}`,
              toStatus: initialRefundStatus,
              note: eligibility.isWithinPolicy
                ? 'Reembolso integral do sinal elegível conforme política aceita. Aguardando execução financeira no provedor.'
                : 'Solicitação fora do prazo padrão — aguardando análise administrativa do estabelecimento.',
            },
          ],
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        memoryStore.refundRequests.push(refundRequest);
      }

      // Persist to MySQL if available
      const pool = getMySqlPool();
      if (pool) {
        try {
          await pool.execute(
            `INSERT INTO CancellationRequest (
               id, referenceCode, tenantId, appointmentId, clientId, status, refundStatus,
               reason, isWithinPolicy, isEligibleForRefund, hoursNoticeCalculated,
               snapshotCancellationHours, snapshotPolicyText, snapshotPolicyVersion,
               deadlineCalculatedAt, paidDepositCents, refundableAmountCents, history, createdAt, updatedAt
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newRequest.id,
              newRequest.referenceCode,
              newRequest.tenantId,
              newRequest.appointmentId,
              newRequest.clientId,
              newRequest.status,
              newRequest.refundStatus,
              newRequest.reason,
              newRequest.isWithinPolicy ? 1 : 0,
              newRequest.isEligibleForRefund ? 1 : 0,
              newRequest.hoursNoticeCalculated,
              newRequest.snapshotCancellationHours,
              newRequest.snapshotPolicyText,
              newRequest.snapshotPolicyVersion,
              new Date(newRequest.deadlineCalculatedAt),
              newRequest.paidDepositCents,
              newRequest.refundableAmountCents,
              JSON.stringify(newRequest.history),
              new Date(nowIso),
              new Date(nowIso),
            ]
          ).catch(() => {});

          if (refundRequest) {
            await pool.execute(
              `INSERT INTO RefundRequest (
                 id, tenantId, cancellationRequestId, appointmentId, clientId, paymentId,
                 provider, providerPaymentId, idempotencyKey, amountCents, status,
                 authorizedBy, authorizedAt, history, createdAt, updatedAt
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                refundRequest.id,
                refundRequest.tenantId,
                refundRequest.cancellationRequestId,
                refundRequest.appointmentId,
                refundRequest.clientId,
                refundRequest.paymentId,
                refundRequest.provider,
                refundRequest.providerPaymentId,
                refundRequest.idempotencyKey,
                refundRequest.amountCents,
                refundRequest.status,
                refundRequest.authorizedBy,
                refundRequest.authorizedAt ? new Date(refundRequest.authorizedAt) : null,
                JSON.stringify(refundRequest.history),
                new Date(nowIso),
                new Date(nowIso),
              ]
            ).catch(() => {});
          }
        } catch (e) {}
      }

      await db.recordAuditLog(tenantId, clientId, 'CANCELLATION_REQUEST_CREATED', {
        requestId: newRequest.id,
        referenceCode: newRequest.referenceCode,
        appointmentId,
        status: newRequest.status,
        refundStatus: newRequest.refundStatus,
        isWithinPolicy: newRequest.isWithinPolicy,
        paidDepositCents: newRequest.paidDepositCents,
      });

      return this.enrichCancellationRequest(newRequest);
    } finally {
      activeAppointmentCancellationLocks.delete(lockKey);
    }
  }

  /**
   * 4. List cancellation requests for customer or admin
   */
  async listCustomerCancellationRequests(tenantId: string, clientId: string) {
    const list = memoryStore.cancellationRequests.filter(
      (r: any) => r.tenantId === tenantId && r.clientId === clientId
    );
    const enriched = await Promise.all(list.map((r: any) => this.enrichCancellationRequest(r)));
    return enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listCustomerRefundRequests(tenantId: string, clientId: string) {
    const list = memoryStore.refundRequests.filter(
      (r: any) => r.tenantId === tenantId && r.clientId === clientId
    );
    return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listAdminCancellationRequests(tenantId: string, filter?: string) {
    let list = memoryStore.cancellationRequests.filter((r: any) => r.tenantId === tenantId);

    if (filter && filter !== 'ALL') {
      switch (filter) {
        case 'PENDING':
          list = list.filter((r: any) => r.status === 'PENDING');
          break;
        case 'WITHIN_POLICY':
          list = list.filter((r: any) => r.isWithinPolicy === true);
          break;
        case 'OUT_OF_POLICY':
          list = list.filter((r: any) => r.isWithinPolicy === false);
          break;
        case 'AWAITING_DECISION':
          list = list.filter((r: any) => r.status === 'PENDING' || r.refundStatus === 'PENDING_REVIEW');
          break;
        case 'AWAITING_REFUND':
          list = list.filter((r: any) => r.refundStatus === 'APPROVED' || r.refundStatus === 'FAILED');
          break;
        case 'PROCESSING_REFUND':
          list = list.filter((r: any) => r.refundStatus === 'PROCESSING');
          break;
        case 'COMPLETED':
          list = list.filter((r: any) => r.status === 'COMPLETED' || r.refundStatus === 'COMPLETED');
          break;
        case 'REJECTED':
          list = list.filter((r: any) => r.status === 'REJECTED' || r.refundStatus === 'REJECTED');
          break;
      }
    }

    const enriched = await Promise.all(list.map((r: any) => this.enrichCancellationRequest(r)));
    return enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 5. Owner / Admin Decision on a cancellation request
   */
  async processAdminDecision(params: {
    tenantId: string;
    requestId: string;
    adminUserId: string;
    decision: 'APPROVE' | 'REJECT';
    justification: string;
    authorizeExceptionRefund?: boolean;
  }) {
    const { tenantId, requestId, adminUserId, decision, justification, authorizeExceptionRefund } = params;

    if (!justification || justification.trim().length < 5) {
      const err: any = new Error('A justificativa administrativa é obrigatória (mínimo 5 caracteres).');
      err.statusCode = 400;
      throw err;
    }

    const request = memoryStore.cancellationRequests.find(
      (r: any) => r.id === requestId && r.tenantId === tenantId
    );
    if (!request) {
      const err: any = new Error('Solicitação de cancelamento não encontrada para esta empresa.');
      err.statusCode = 404;
      throw err;
    }

    const refundReq = memoryStore.refundRequests.find(
      (rr: any) => rr.cancellationRequestId === request.id && rr.tenantId === tenantId
    );

    const nowIso = new Date().toISOString();

    if (decision === 'APPROVE') {
      const nextStatus: CancellationRequestStatus = request.paidDepositCents === 0 ? 'COMPLETED' : 'APPROVED';
      assertValidCancellationTransition(request.status, nextStatus);

      request.status = nextStatus;
      request.adminDecisionBy = adminUserId;
      request.adminDecisionAt = nowIso;
      request.adminJustification = justification.trim();
      request.updatedAt = nowIso;

      // Cancel the appointment to release the slot
      await db.updateAppointmentStatus(tenantId, request.appointmentId, 'CANCELLED');

      if (request.paidDepositCents > 0 && refundReq) {
        const shouldApproveRefund = request.isWithinPolicy || Boolean(authorizeExceptionRefund);
        if (shouldApproveRefund) {
          assertValidRefundTransition(refundReq.status, 'APPROVED');
          refundReq.status = 'APPROVED';
          refundReq.authorizedBy = adminUserId;
          refundReq.authorizedAt = nowIso;
          refundReq.updatedAt = nowIso;
          refundReq.history.push({
            timestamp: nowIso,
            actor: `ADMIN:${adminUserId}`,
            fromStatus: request.refundStatus,
            toStatus: 'APPROVED',
            note: !request.isWithinPolicy
              ? `Exceção manual autorizada pelo proprietário: ${justification.trim()}`
              : `Aprovado pelo proprietário: ${justification.trim()}`,
          });

          request.refundStatus = 'APPROVED';
          request.refundableAmountCents = request.paidDepositCents;
          request.isManualException = !request.isWithinPolicy;
        } else {
          assertValidRefundTransition(refundReq.status, 'REJECTED');
          refundReq.status = 'REJECTED';
          refundReq.updatedAt = nowIso;
          refundReq.history.push({
            timestamp: nowIso,
            actor: `ADMIN:${adminUserId}`,
            fromStatus: request.refundStatus,
            toStatus: 'REJECTED',
            note: `Cancelamento aprovado sem reembolso (fora do prazo): ${justification.trim()}`,
          });

          request.refundStatus = 'REJECTED';
          request.refundableAmountCents = 0;
          request.status = 'COMPLETED';
        }
      }

      request.history.push({
        timestamp: nowIso,
        actor: `ADMIN:${adminUserId}`,
        fromStatus: 'PENDING',
        toStatus: request.status,
        refundStatus: request.refundStatus,
        note: `Decisão administrativa (APROVADO): ${justification.trim()}`,
      });
    } else {
      assertValidCancellationTransition(request.status, 'REJECTED');
      request.status = 'REJECTED';
      request.adminDecisionBy = adminUserId;
      request.adminDecisionAt = nowIso;
      request.adminJustification = justification.trim();
      request.updatedAt = nowIso;

      if (refundReq && refundReq.status !== 'COMPLETED') {
        assertValidRefundTransition(refundReq.status, 'REJECTED');
        refundReq.status = 'REJECTED';
        refundReq.updatedAt = nowIso;
        refundReq.history.push({
          timestamp: nowIso,
          actor: `ADMIN:${adminUserId}`,
          fromStatus: request.refundStatus,
          toStatus: 'REJECTED',
          note: `Solicitação rejeitada: ${justification.trim()}`,
        });
        request.refundStatus = 'REJECTED';
      }

      request.history.push({
        timestamp: nowIso,
        actor: `ADMIN:${adminUserId}`,
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        refundStatus: request.refundStatus,
        note: `Decisão administrativa (REJEITADO): ${justification.trim()}`,
      });
    }

    await db.recordAuditLog(tenantId, adminUserId, 'CANCELLATION_ADMIN_DECISION', {
      requestId: request.id,
      decision,
      justification: justification.trim(),
      authorizeExceptionRefund,
      resultingStatus: request.status,
      resultingRefundStatus: request.refundStatus,
    });

    return this.enrichCancellationRequest(request);
  }

  /**
   * 6. Execute financial refund via PaymentProvider with idempotency, cap validation, and timeout handling
   */
  async executeRefund(params: {
    tenantId: string;
    requestId: string;
    adminUserId: string;
    notes?: string;
    customProvider?: PaymentProvider;
    rawBody?: any;
  }) {
    const { tenantId, requestId, adminUserId, notes } = params;

    // Security check: prevent frontend from overriding refund amount
    if (params.rawBody && (params.rawBody.amountCents !== undefined || params.rawBody.refundableAmountCents !== undefined)) {
      const err: any = new Error('Violação de segurança: o valor do reembolso é calculado exclusivamente pelo servidor.');
      err.statusCode = 400;
      throw err;
    }

    const request = memoryStore.cancellationRequests.find(
      (r: any) => r.id === requestId && r.tenantId === tenantId
    );
    if (!request) {
      const err: any = new Error('Solicitação de cancelamento não encontrada para esta empresa.');
      err.statusCode = 404;
      throw err;
    }

    const refundReq = memoryStore.refundRequests.find(
      (rr: any) => rr.cancellationRequestId === request.id && rr.tenantId === tenantId
    );
    if (!refundReq) {
      const err: any = new Error('Não existe solicitação financeira de reembolso vinculada a este cancelamento.');
      err.statusCode = 400;
      throw err;
    }

    const lockKey = `${tenantId}:${refundReq.id}`;
    if (activeRefundExecutionLocks.has(lockKey)) {
      const err: any = new Error('Reembolso já está em execução concorrente para esta solicitação.');
      err.statusCode = 409;
      throw err;
    }

    activeRefundExecutionLocks.add(lockKey);
    try {
      if (refundReq.status === 'COMPLETED') {
        const err: any = new Error('Operação bloqueada: este reembolso já foi concluído anteriormente.');
        err.statusCode = 409;
        throw err;
      }

      if (refundReq.status === 'PROCESSING') {
        const err: any = new Error(
          'Reembolso em processamento ou com resultado pendente de confirmação no provedor. Consulte o provedor antes de repetir a operação.'
        );
        err.statusCode = 409;
        throw err;
      }

      if (refundReq.status !== 'APPROVED' && refundReq.status !== 'FAILED') {
        const err: any = new Error(`O reembolso precisa estar APROVADO para ser executado (estado atual: ${refundReq.status}).`);
        err.statusCode = 400;
        throw err;
      }

      const payment = await db.getPaymentByAppointmentId(tenantId, request.appointmentId);
      if (!payment || (payment.status !== 'APPROVED' && payment.status !== 'REFUND_PENDING')) {
        const err: any = new Error('Não há pagamento confirmado elegível para reembolso.');
        err.statusCode = 400;
        throw err;
      }

      const grossPaid = Number(payment.amountCents || 0);
      const alreadyRefunded = Number(payment.refundedAmountCents || 0);
      const maxAvailableToRefund = Math.max(0, grossPaid - alreadyRefunded);

      if (maxAvailableToRefund <= 0 || refundReq.amountCents > maxAvailableToRefund) {
        const err: any = new Error(
          `Valor de reembolso solicitado (${refundReq.amountCents}) excede o saldo efetivamente recebido disponível para estorno (${maxAvailableToRefund}).`
        );
        err.statusCode = 400;
        throw err;
      }

      const amountToRefundCents = refundReq.amountCents;
      const nowIso = new Date().toISOString();

      // Transition to PROCESSING before calling external provider
      assertValidRefundTransition(refundReq.status, 'PROCESSING');
      const previousStatus = refundReq.status;
      refundReq.status = 'PROCESSING';
      refundReq.processedAt = nowIso;
      refundReq.updatedAt = nowIso;
      request.refundStatus = 'PROCESSING';
      request.updatedAt = nowIso;

      await db.updatePayment(payment.id, { status: 'REFUND_PENDING' });

      const provider = this.getProvider(params.customProvider);
      if (!payment.providerPaymentId) {
        refundReq.status = 'FAILED';
        request.refundStatus = 'FAILED';
        refundReq.lastError = 'Pagamento sem providerPaymentId para execução no provedor.';
        const err: any = new Error(refundReq.lastError);
        err.statusCode = 400;
        throw err;
      }

      try {
        const providerResult = await provider.refundPayment(
          payment.providerPaymentId,
          amountToRefundCents,
          refundReq.idempotencyKey
        );

        const normStatus = (providerResult.status || '').toLowerCase();
        if (normStatus === 'approved' || normStatus === 'completed' || normStatus === 'refunded') {
          assertValidRefundTransition(refundReq.status, 'COMPLETED');
          refundReq.status = 'COMPLETED';
          refundReq.providerRefundId = providerResult.refundId;
          refundReq.completedAt = new Date().toISOString();
          refundReq.lastError = null;
          refundReq.rawResponse = providerResult.rawResponse;
          refundReq.updatedAt = new Date().toISOString();
          refundReq.history.push({
            timestamp: new Date().toISOString(),
            actor: `PROVIDER:${provider.name}`,
            fromStatus: 'PROCESSING',
            toStatus: 'COMPLETED',
            note: `Reembolso confirmado pelo provedor (ID: ${providerResult.refundId}). ${notes || ''}`.trim(),
          });

          request.refundStatus = 'COMPLETED';
          assertValidCancellationTransition(request.status, 'COMPLETED');
          request.status = 'COMPLETED';
          request.updatedAt = new Date().toISOString();
          request.history.push({
            timestamp: new Date().toISOString(),
            actor: `PROVIDER:${provider.name}`,
            fromStatus: 'APPROVED',
            toStatus: 'COMPLETED',
            refundStatus: 'COMPLETED',
            note: `Reembolso de R$ ${(amountToRefundCents / 100).toFixed(2)} concluído com sucesso.`,
          });

          // Update payment record preserving financial history
          const memPay = memoryStore.payments.find((p: any) => p.id === payment.id);
          if (memPay) {
            memPay.status = 'REFUNDED';
            memPay.refundedAmountCents = alreadyRefunded + amountToRefundCents;
            memPay.updatedAt = new Date().toISOString();
          }
          await db.updatePayment(payment.id, { status: 'REFUNDED' });
        } else {
          // Remains in PROCESSING until webhook / reconciliation confirms completion
          refundReq.providerRefundId = providerResult.refundId;
          refundReq.rawResponse = providerResult.rawResponse;
          refundReq.history.push({
            timestamp: new Date().toISOString(),
            actor: `PROVIDER:${provider.name}`,
            fromStatus: previousStatus,
            toStatus: 'PROCESSING',
            note: `Solicitação enviada ao provedor (ID: ${providerResult.refundId}, status: ${providerResult.status}). Aguardando confirmação final.`,
          });
        }

        await db.recordAuditLog(tenantId, adminUserId, 'REFUND_EXECUTED', {
          requestId: request.id,
          refundRequestId: refundReq.id,
          providerRefundId: providerResult.refundId,
          amountCents: amountToRefundCents,
          status: refundReq.status,
        });

        return this.enrichCancellationRequest(request);
      } catch (providerErr: any) {
        const errMsg = String(providerErr?.message || providerErr);
        const isTimeout =
          errMsg.includes('TIMEOUT') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('AbortError') ||
          errMsg.includes('timed out') ||
          (providerErr as any)?.code === 'ETIMEDOUT';

        if (isTimeout) {
          // CRITICAL: Do NOT mark as FAILED or repeat blindly on timeout! Keep in PROCESSING for reconciliation.
          refundReq.status = 'PROCESSING';
          request.refundStatus = 'PROCESSING';
          refundReq.lastError = `TIMEOUT_UNKNOWN_RESULT: ${errMsg}. Necessária reconciliação/consulta ao provedor antes de nova tentativa.`;
          refundReq.updatedAt = new Date().toISOString();
          refundReq.history.push({
            timestamp: new Date().toISOString(),
            actor: `ADMIN:${adminUserId}`,
            fromStatus: previousStatus,
            toStatus: 'PROCESSING',
            note: `Timeout na comunicação com o provedor. Operação mantida em PROCESSING para evitar duplicidade até reconciliação.`,
          });

          await db.recordAuditLog(tenantId, adminUserId, 'REFUND_TIMEOUT_UNKNOWN', {
            requestId: request.id,
            refundRequestId: refundReq.id,
            error: errMsg,
          });

          const timeoutErr: any = new Error(refundReq.lastError);
          timeoutErr.statusCode = 504;
          timeoutErr.refundStatus = 'PROCESSING';
          throw timeoutErr;
        }

        // Definite failure from provider -> transition to FAILED so it can be reconciled or retried safely
        assertValidRefundTransition(refundReq.status, 'FAILED');
        refundReq.status = 'FAILED';
        request.refundStatus = 'FAILED';
        refundReq.lastError = errMsg;
        refundReq.updatedAt = new Date().toISOString();
        refundReq.history.push({
          timestamp: new Date().toISOString(),
          actor: `ADMIN:${adminUserId}`,
          fromStatus: 'PROCESSING',
          toStatus: 'FAILED',
          note: `Falha reportada pelo provedor: ${errMsg}`,
        });

        await db.recordAuditLog(tenantId, adminUserId, 'REFUND_FAILED', {
          requestId: request.id,
          refundRequestId: refundReq.id,
          error: errMsg,
        });

        const failErr: any = new Error(`Falha ao processar reembolso no provedor: ${errMsg}`);
        failErr.statusCode = 400;
        throw failErr;
      }
    } finally {
      activeRefundExecutionLocks.delete(lockKey);
    }
  }

  /**
   * 7. Confirm refund via legitimate provider notification (Webhook or Reconciliation)
   */
  async confirmRefundFromProviderNotification(params: {
    tenantId: string;
    appointmentId: string;
    providerPaymentId: string;
    providerRefundId?: string;
    refundedAmountCents?: number;
    rawResponse?: any;
    actor?: string;
  }) {
    const { tenantId, appointmentId, providerPaymentId, providerRefundId, rawResponse, actor } = params;
    const nowIso = new Date().toISOString();

    const payment = await db.getPaymentByAppointmentId(tenantId, appointmentId);
    if (payment) {
      const memPay = memoryStore.payments.find((p: any) => p.id === payment.id);
      if (memPay) {
        memPay.status = 'REFUNDED';
        memPay.refundedAmountCents = params.refundedAmountCents ?? memPay.amountCents;
        memPay.updatedAt = nowIso;
      }
      await db.updatePayment(payment.id, { status: 'REFUNDED', rawResponse });
    }

    const request = memoryStore.cancellationRequests.find(
      (r: any) => r.appointmentId === appointmentId && r.tenantId === tenantId
    );
    const refundReq = memoryStore.refundRequests.find(
      (rr: any) => rr.appointmentId === appointmentId && rr.tenantId === tenantId
    );

    if (refundReq && refundReq.status !== 'COMPLETED') {
      refundReq.status = 'COMPLETED';
      refundReq.providerRefundId = providerRefundId || refundReq.providerRefundId || `mp-ref-${providerPaymentId}`;
      refundReq.completedAt = nowIso;
      refundReq.lastError = null;
      refundReq.rawResponse = rawResponse || refundReq.rawResponse;
      refundReq.updatedAt = nowIso;
      refundReq.history.push({
        timestamp: nowIso,
        actor: actor || 'WEBHOOK_MERCADOPAGO',
        toStatus: 'COMPLETED',
        note: 'Reembolso confirmado via notificação autenticada do provedor.',
      });
    }

    if (request) {
      request.refundStatus = 'COMPLETED';
      request.status = 'COMPLETED';
      request.updatedAt = nowIso;
      request.history.push({
        timestamp: nowIso,
        actor: actor || 'WEBHOOK_MERCADOPAGO',
        toStatus: 'COMPLETED',
        refundStatus: 'COMPLETED',
        note: 'Reembolso confirmado pelo provedor de pagamento.',
      });
    }

    await db.recordAuditLog(tenantId, null, 'REFUND_CONFIRMED_WEBHOOK', {
      appointmentId,
      providerPaymentId,
      providerRefundId,
      actor: actor || 'WEBHOOK_MERCADOPAGO',
    });

    return {
      status: 'REFUNDED',
      appointmentId,
      tenantId,
      cancellationRequestId: request?.id || null,
      refundRequestId: refundReq?.id || null,
    };
  }

  /**
   * 8. Customer Rescheduling with availability validation and financial preservation
   */
  async rescheduleAppointment(params: {
    tenantId: string;
    appointmentId: string;
    clientId: string;
    newDateTime: string;
    reason?: string;
    now?: Date;
    rawBody?: any;
  }) {
    const { tenantId, appointmentId, clientId, newDateTime, reason } = params;
    const evaluationTime = params.now || new Date();

    // Prevent frontend from altering prices or deposits during rescheduling
    if (
      params.rawBody &&
      (params.rawBody.priceCents !== undefined ||
        params.rawBody.totalAmountCents !== undefined ||
        params.rawBody.depositAmountCents !== undefined ||
        params.rawBody.serviceId !== undefined)
    ) {
      const err: any = new Error(
        'Não é permitido alterar valores financeiros ou trocar de serviço diretamente no reagendamento. Caso deseje outro serviço com valor diferente, solicite atendimento ao salão.'
      );
      err.statusCode = 400;
      throw err;
    }

    const business = await db.getBusiness(tenantId);
    if (business?.allowCustomerReschedule === false) {
      const err: any = new Error('O reagendamento online está desativado para este estabelecimento. Entre em contato com o salão.');
      err.statusCode = 400;
      throw err;
    }

    const eligibility = await this.calculateCancellationEligibility({
      tenantId,
      appointmentId,
      clientId,
      now: evaluationTime,
    });

    if (!eligibility.canRequestCancellation) {
      const err: any = new Error(eligibility.eligibilityMessage || 'Este agendamento não pode ser reagendado.');
      err.statusCode = 400;
      throw err;
    }

    if (!eligibility.isWithinTimeLimit) {
      const err: any = new Error(
        `Prazo para reagendamento automático encerrado (mínimo de ${eligibility.applicableHoursLimit}h de antecedência). Entre em contato com o estabelecimento.`
      );
      err.statusCode = 400;
      throw err;
    }

    const appointment = await db.getAppointmentById(tenantId, appointmentId);
    const service = appointment.service || memoryStore.services.find((s: any) => s.id === appointment.serviceId);
    const durationMin = Number(appointment.snapshotDurationMin || service?.durationMin || 60);
    const bufferMin = Number(service?.bufferAfterMin || 0) + Number(service?.bufferBeforeMin || 0);
    const prepMin = Number(service?.preparationMin || 0);

    const parsedNewStart = new Date(new Date(newDateTime).getTime() + prepMin * 60000);
    if (isNaN(parsedNewStart.getTime()) || parsedNewStart.getTime() <= evaluationTime.getTime()) {
      const err: any = new Error('A nova data e horário devem estar no futuro.');
      err.statusCode = 400;
      throw err;
    }

    const parsedNewEnd = new Date(parsedNewStart.getTime() + (durationMin + bufferMin) * 60000);

    // Check slot conflict excluding the current appointment itself
    const allApps = await db.getAppointments(tenantId);
    const conflict = allApps.find((app: any) => {
      if (app.id === appointmentId) return false;
      if (app.professionalId !== appointment.professionalId) return false;
      if (!['PENDING_PAYMENT', 'CONFIRMED', 'PENDING'].includes(app.status)) return false;
      if (app.status === 'PENDING_PAYMENT' && app.expiresAt && new Date(app.expiresAt) < evaluationTime) return false;
      const start = new Date(app.dateTime).getTime();
      const end = new Date(app.endDateTime).getTime();
      return parsedNewStart.getTime() < end && parsedNewEnd.getTime() > start;
    });

    if (conflict) {
      const err: any = new Error('Horário indisponível para reagendamento: conflito com agendamento existente.');
      err.statusCode = 409;
      throw err;
    }

    const nowIso = evaluationTime.toISOString();
    const memApp = memoryStore.appointments.find((a: any) => a.id === appointmentId && a.tenantId === tenantId);
    const previousDateTime = appointment.dateTime;

    const historyEntry = {
      rescheduledAt: nowIso,
      fromDateTime: previousDateTime,
      toDateTime: parsedNewStart.toISOString(),
      reason: reason || 'Reagendado pela cliente no portal',
      actor: `CUSTOMER:${clientId}`,
    };

    if (memApp) {
      memApp.rescheduledFromDateTime = memApp.rescheduledFromDateTime || previousDateTime;
      memApp.rescheduledAt = nowIso;
      memApp.rescheduleCount = Number(memApp.rescheduleCount || 0) + 1;
      memApp.rescheduleHistory = [...(memApp.rescheduleHistory || []), historyEntry];
      memApp.dateTime = parsedNewStart.toISOString();
      memApp.endDateTime = parsedNewEnd.toISOString();
      memApp.updatedAt = nowIso;
    }

    const pool = getMySqlPool();
    if (pool) {
      try {
        await pool.execute(
          `UPDATE Appointment SET dateTime = ?, endDateTime = ?, updatedAt = NOW() WHERE id = ? AND tenantId = ?`,
          [parsedNewStart, parsedNewEnd, appointmentId, tenantId]
        ).catch(() => {});
      } catch (e) {}
    }

    await db.recordAuditLog(tenantId, clientId, 'APPOINTMENT_RESCHEDULED', {
      appointmentId,
      fromDateTime: previousDateTime,
      toDateTime: parsedNewStart.toISOString(),
      rescheduleCount: memApp?.rescheduleCount || 1,
    });

    return await db.getAppointmentById(tenantId, appointmentId);
  }

  private async enrichCancellationRequest(req: any) {
    const appointment = await db.getAppointmentById(req.tenantId, req.appointmentId);
    const client = memoryStore.clients.find((c: any) => c.id === req.clientId && c.tenantId === req.tenantId) || appointment?.client || null;
    const refundRequest = memoryStore.refundRequests.find(
      (rr: any) => rr.cancellationRequestId === req.id && rr.tenantId === req.tenantId
    ) || null;
    const payment = await db.getPaymentByAppointmentId(req.tenantId, req.appointmentId);

    const paidDepositCents = Number(req.paidDepositCents || 0);
    const refundableAmountCents = Number(req.refundableAmountCents || refundRequest?.amountCents || 0);

    return {
      ...req,
      requestedAt: req.createdAt,
      clientName: client?.name || 'Cliente',
      clientPhone: client?.phone || '',
      serviceName: appointment?.service?.name || 'Serviço',
      professionalName: appointment?.professional?.name || 'Profissional',
      appointmentDateTime: appointment?.dateTime || null,
      hoursBeforeAppointment: req.hoursNoticeCalculated,
      policyHoursLimit: req.snapshotCancellationHours ?? 6,
      formattedPaidDeposit: (paidDepositCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      formattedRefundAmount: (refundableAmountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      paymentStatus: payment?.status || 'UNPAID',
      decidedBy: req.adminDecisionBy || null,
      decidedAt: req.adminDecisionAt || null,
      decisionNotes: req.adminJustification || null,
      appointment,
      client,
      refundRequest: refundRequest
        ? {
            ...refundRequest,
            providerName: refundRequest.provider || 'MERCADO_PAGO',
            failureReason: refundRequest.lastError || null,
          }
        : null,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amountCents: payment.amountCents,
            refundedAmountCents: payment.refundedAmountCents || 0,
            providerPaymentId: payment.providerPaymentId,
          }
        : null,
    };
  }
}

export const cancellationService = new CancellationService();
