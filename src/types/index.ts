export type TenantOperationalStatus = 'ACTIVE' | 'BLOCKED' | 'CANCELLED';
export type CommercialPlanCode = 'SIMPLE' | 'COMPLETE' | 'FREE' | 'PRO' | 'ENTERPRISE';
export type SaaSSubscriptionStatus =
  | 'ACTIVE'
  | 'PENDING_PAYMENT'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'BLOCKED'
  | 'CANCELLED';

export interface SaaSSubscriptionInfo {
  id: string;
  tenantId: string;
  plan: 'SIMPLE' | 'COMPLETE';
  rawPlan?: CommercialPlanCode;
  planName: string;
  status: SaaSSubscriptionStatus;
  contractedPriceCents: number;
  billingCycle: string;
  startedAt: string;
  expiresAt?: string | null;
  nextBillingAt?: string | null;
  cancelledAt?: string | null;
  statusReason?: string | null;
  allowDeposit: boolean;
  updatedBy?: string | null;
  history?: Array<{
    timestamp: string;
    actor: string;
    action: string;
    reason?: string;
    previousPlan?: string;
    newPlan?: string;
    previousPriceCents?: number;
    newPriceCents?: number;
    previousStatus?: string;
    newStatus?: string;
  }>;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  currency: string;
  openTime: string;
  closeTime: string;
  status?: TenantOperationalStatus;
  isPublished?: boolean;
  blockedReason?: string | null;
  blockedAt?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  requireDeposit?: boolean;
  defaultDeposit?: number;
  cancellationHoursLimit?: number;
  allowCustomerReschedule?: boolean;
  allowManualReviewOutOfPeriod?: boolean;
  cancellationPolicyText?: string;
  cancellationContactInstructions?: string;
  cancellationPolicyVersion?: number;
  mpPublicKey?: string | null;
  mpAccessToken?: string | null;
  mpWebhookSecret?: string | null;
  mpEnvironment?: 'sandbox' | 'production' | null;
  enableAdvancedFeatures?: boolean;
  subscription?: SaaSSubscriptionInfo;
  planCapabilities?: {
    plan: 'SIMPLE' | 'COMPLETE';
    planName: string;
    allowDeposit: boolean;
    enableAdvancedFeatures?: boolean;
    operationalStatus: TenantOperationalStatus;
    subscriptionStatus: SaaSSubscriptionStatus;
    canWriteAdmin: boolean;
    canAcceptOnlineBookings: boolean;
  };
}

export interface WorkingHour {
  id?: string;
  professionalId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
}

export type BlockType = 'DAY_OFF' | 'VACATION' | 'BREAK' | 'INTERVAL' | 'LUNCH' | 'PERSONAL' | 'EXCEPTION';

export interface TimeBlock {
  id: string;
  tenantId: string;
  professionalId?: string | null;
  type: BlockType;
  startDate: string;
  endDate: string;
  reason?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  professional?: { id: string; name: string } | null;
}

export interface Professional {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  specialty: string;
  active: boolean;
  workingHours?: WorkingHour[];
  timeBlocks?: TimeBlock[];
}

export interface ClientInternalNote {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface ClientCommunicationConsent {
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
  updatedAt?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  preferences?: string;
  internalNotes?: ClientInternalNote[];
  tags?: string[];
  communicationConsent?: ClientCommunicationConsent;
  active?: boolean;
  createdAt: string;
  appointmentsCount?: number;
  completedAppointmentsCount?: number;
  isRecurring?: boolean;
}

export interface ClientProfileIndicators {
  totalCompleted: number;
  totalCancelled: number;
  totalNoShows: number;
  totalAppointments: number;
  lastAppointmentDate: string | null;
  nextAppointmentDate: string | null;
  totalPaidCents: number;
  totalPaidReais: number;
  totalScheduledCents: number;
  isRecurring: boolean;
}

export interface ClientProfileData {
  client: Client;
  appointments: Appointment[];
  indicators: ClientProfileIndicators;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  preparationMin: number;
  depositPercent: number;
  active: boolean;
  professionals?: any[];
}

export type AppointmentStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW';

export type BookingOrigin = 'ONLINE' | 'PRESENCIAL' | 'TELEFONE' | 'WHATSAPP' | 'INSTAGRAM' | 'OUTRO';

export interface Appointment {
  id: string;
  tenantId?: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  dateTime: string;
  endDateTime?: string;
  status: AppointmentStatus;
  origin?: BookingOrigin | string;
  expiresAt?: string;
  totalAmountCents?: number;
  depositAmountCents?: number;
  balanceAmountCents?: number;
  snapshotPriceCents?: number;
  snapshotDurationMin?: number;
  snapshotDepositPercent?: number;
  snapshotDepositCents?: number;
  snapshotBalanceCents?: number;
  snapshotCancellationHours?: number | null;
  snapshotPolicyText?: string | null;
  snapshotPolicyVersion?: number | null;
  policyAcceptedAt?: string | null;
  rescheduledFromDateTime?: string | null;
  rescheduledAt?: string | null;
  rescheduleCount?: number;
  rescheduleHistory?: any[];
  createdBy?: string | null;
  updatedBy?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  noShowAt?: string | null;
  totalAmount?: number;
  notes: string;
  client?: Client;
  professional?: Professional;
  service?: Service;
  establishment?: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    phone?: string;
    address?: string;
    requireDeposit?: boolean;
  };
}

export interface Payment {
  id: string;
  tenantId: string;
  appointmentId: string;
  provider: string;
  providerPaymentId?: string;
  externalReference: string;
  amountCents: number;
  refundedAmountCents?: number;
  currency: string;
  status: 'CREATED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'REFUND_PENDING' | 'REFUNDED';
  paymentMethod: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: string;
  approvedAt?: string;
  createdAt: string;
  appointment?: Appointment;
}

export type CancellationRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED';

export type RefundRequestStatus =
  | 'NOT_REQUESTED'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export interface CancellationRequest {
  id: string;
  referenceCode: string;
  tenantId: string;
  appointmentId: string;
  clientId: string;
  status: CancellationRequestStatus;
  refundStatus: RefundRequestStatus;
  reason?: string;
  isWithinPolicy: boolean;
  isEligibleForRefund: boolean;
  hoursNoticeCalculated: number;
  snapshotCancellationHours: number | null;
  snapshotPolicyText: string | null;
  snapshotPolicyVersion: number | null;
  hasHistoricalPolicy?: boolean;
  deadlineCalculatedAt: string;
  paidDepositCents: number;
  refundableAmountCents: number;
  adminDecisionBy?: string | null;
  adminDecisionAt?: string | null;
  adminJustification?: string | null;
  isManualException?: boolean;
  history: Array<{
    timestamp: string;
    actor: string;
    fromStatus?: string;
    toStatus: string;
    refundStatus?: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  appointment?: Appointment;
  client?: Client;
  refundRequest?: RefundRequest | null;
}

export interface RefundRequest {
  id: string;
  tenantId: string;
  cancellationRequestId: string;
  appointmentId: string;
  clientId: string;
  paymentId?: string | null;
  provider: string;
  providerPaymentId?: string | null;
  providerRefundId?: string | null;
  idempotencyKey: string;
  amountCents: number;
  status: RefundRequestStatus;
  authorizedBy?: string | null;
  authorizedAt?: string | null;
  processedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  rawResponse?: any;
  history: Array<{
    timestamp: string;
    actor: string;
    fromStatus?: string;
    toStatus: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalRevenue: number;
  totalAppointments: number;
  completedAppointments: number;
  confirmedAppointments: number;
  totalClients: number;
  totalServices: number;
  totalProfessionals: number;
  currency: string;
  // Etapa 8 Operational Metrics
  periodLabel?: string;
  todayDate?: string;
  todayAppointmentsCount?: number;
  upcomingAppointmentsCount?: number;
  completedTodayCount?: number;
  cancelledCount?: number;
  noShowCount?: number;
  availableSlotsToday?: number;
  availableMinutesToday?: number;
  bookedMinutesToday?: number;
  occupancyRatePercent?: number;
  cancellationRatePercent?: number;
  newClientsCount?: number;
  recurringClientsCount?: number;
  pendingCancellationRequestsCount?: number;
  formulas?: {
    occupancy: string;
    cancellation: string;
    clientsClassification: string;
  };
}

export type ExpenseCategory =
  | 'ALUGUEL'
  | 'AGUA_ENERGIA'
  | 'INTERNET_TELEFONE'
  | 'MATERIAIS_PRODUTOS'
  | 'EQUIPAMENTOS'
  | 'MANUTENCAO'
  | 'MARKETING'
  | 'TAXAS_PLATAFORMA'
  | 'IMPOSTOS'
  | 'OUTRAS';

export type ExpenseStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REVERSED';

export interface Expense {
  id: string;
  tenantId: string;
  description: string;
  category: ExpenseCategory | string;
  amountCents: number;
  competenceDate: string;
  dueDate: string;
  paidAt?: string | null;
  status: ExpenseStatus;
  isOverdue?: boolean;
  paymentMethod?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  paidBy?: string | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  history?: Array<{
    timestamp: string;
    actor: string;
    action: string;
    fromStatus?: string;
    toStatus: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type LedgerTransactionType = 'INFLOW' | 'OUTFLOW' | 'ADJUSTMENT' | 'REVERSAL';
export type LedgerTransactionStatus = 'CONFIRMED' | 'REVERSED' | 'FLAGGED_FOR_REVIEW';

export interface FinancialTransaction {
  id: string;
  tenantId: string;
  uniqueRef: string;
  type: LedgerTransactionType;
  origin: string;
  originId?: string | null;
  amountCents: number;
  feeCents?: number | null;
  netAmountCents: number;
  category: string;
  description: string;
  paymentMethod?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  status: LedgerTransactionStatus;
  reconciliationStatus: 'RECONCILED' | 'PENDING' | 'DISCREPANCY';
  reconciliationDiscrepancy?: string | null;
  justification?: string | null;
  history?: any[];
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export type CommissionRuleScope = 'PROFESSIONAL_SERVICE' | 'SERVICE' | 'PROFESSIONAL';

export interface CommissionRule {
  id: string;
  tenantId: string;
  scope: CommissionRuleScope;
  professionalId?: string | null;
  serviceId?: string | null;
  percentage: number;
  fixedCents: number;
  basis: 'COMPLETED_SERVICE_VALUE' | 'RECEIVED_AMOUNT';
  active: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  professionalName?: string;
  serviceName?: string;
}

export type CommissionStatus =
  | 'NO_RULE_CONFIGURED'
  | 'PENDING_CALCULATION'
  | 'CALCULATED'
  | 'APPROVED'
  | 'PAID'
  | 'CANCELLED';

export interface CommissionRecord {
  id: string;
  tenantId: string;
  appointmentId: string;
  professionalId: string;
  serviceId: string;
  ruleId?: string | null;
  ruleScope?: string | null;
  percentageApplied: number;
  baseAmountCents: number;
  commissionAmountCents: number;
  status: CommissionStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  paidBy?: string | null;
  paidAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  adjustmentReason?: string | null;
  history?: any[];
  createdAt: string;
  updatedAt: string;
  professionalName?: string;
  serviceName?: string;
  clientName?: string;
  appointmentDateTime?: string;
  appointmentStatus?: string;
}

export interface AccountReceivableItem {
  appointmentId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  appointmentDateTime: string;
  appointmentStatus: string;
  contractedTotalCents: number;
  depositExpectedCents: number;
  confirmedPaidCents: number;
  refundedCents: number;
  netConfirmedPaidCents: number;
  pendingBalanceCents: number;
  dueDate: string;
}

export interface FinancialDashboardData {
  period: {
    preset: string;
    startDate: string;
    endDate: string;
    label: string;
  };
  indicators: {
    confirmedReceiptsCents: number;
    pendingReceivablesCents: number;
    completedServicesSalesCents: number;
    completedAppointmentsCount: number;
    averageTicketCents: number;
    paidExpensesCents: number;
    pendingExpensesCents: number;
    overdueExpensesCents: number;
    completedRefundsCents: number;
    pendingRefundsCents: number;
    calculatedCommissionsCents: number;
    approvedCommissionsCents: number;
    paidCommissionsCents: number;
    confirmedFeesCents: number;
    estimatedFinancialResultCents: number;
    estimatedResultAfterPaidCommissionsCents: number;
    hasEnoughData: boolean;
  };
  formulas: Record<string, string>;
}

// ==========================================
// ETAPA 10: INTEGRAÇÃO OFICIAL WHATSAPP BUSINESS
// ==========================================

export type WhatsAppIntegrationStatus =
  | 'DISCONNECTED'
  | 'PENDING_CREDENTIALS'
  | 'CONNECTED'
  | 'ERROR';

export type WhatsAppEventType =
  | 'APPOINTMENT_CONFIRMATION'
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_RESCHEDULED'
  | 'CANCELLATION_CONFIRMED'
  | 'CANCELLATION_REQUEST_UPDATED'
  | 'PAYMENT_UPDATED'
  | 'REFUND_UPDATED'
  | 'MANUAL_OPERATIONAL'
  | 'PROMOTIONAL_CAMPAIGN';

export type WhatsAppTemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';

export type WhatsAppMessageStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'CANCELLED';

export interface WhatsAppConfigPublic {
  id: string;
  tenantId: string;
  provider: string;
  status: WhatsAppIntegrationStatus;
  displayName: string;
  businessPhone: string;
  phoneNumberId: string;
  wabaId: string;
  hasAccessTokenConfigured: boolean;
  hasWebhookVerifyTokenConfigured: boolean;
  hasAppSecretConfigured: boolean;
  enableBookingConfirmation: boolean;
  enableReminders: boolean;
  enableRescheduleAlerts: boolean;
  enableCancellationAlerts: boolean;
  enablePaymentAlerts: boolean;
  enableRefundAlerts: boolean;
  reminder24hEnabled: boolean;
  reminder3hEnabled: boolean;
  customReminderHours: number | null;
  customReminderEnabled: boolean;
  allowedWindowStart: string;
  allowedWindowEnd: string;
  lastTestedAt: string | null;
  lastError: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface WhatsAppTemplateItem {
  id: string;
  tenantId: string;
  eventType: WhatsAppEventType;
  templateName: string;
  language: string;
  category: 'UTILITY' | 'MARKETING';
  status: WhatsAppTemplateStatus;
  bodyPreview: string;
  variablesSchema: string[];
  active: boolean;
  updatedBy?: string | null;
  updatedAt: string;
}

export interface WhatsAppMessageItem {
  id: string;
  tenantId: string;
  clientId?: string | null;
  clientName?: string;
  appointmentId?: string | null;
  referenceId?: string | null;
  eventType: WhatsAppEventType;
  messageCategory: 'OPERATIONAL' | 'PROMOTIONAL';
  recipientPhone: string;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateVariables?: string[];
  renderedBody?: string | null;
  idempotencyKey: string;
  provider: string;
  providerMessageId?: string | null;
  status: WhatsAppMessageStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  isPermanentError: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  requestedBy?: string | null;
  statusHistory: Array<{
    timestamp: string;
    status: WhatsAppMessageStatus;
    actor?: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppScheduledReminderItem {
  id: string;
  tenantId: string;
  appointmentId: string;
  clientId: string;
  clientName?: string;
  serviceName?: string;
  appointmentDateTime?: string;
  reminderType: 'REMINDER_24H' | 'REMINDER_3H' | 'REMINDER_CUSTOM';
  leadTimeHours: number;
  scheduledFor: string;
  status: 'SCHEDULED' | 'QUEUED' | 'SENT' | 'SKIPPED' | 'CANCELLED';
  messageQueueId?: string | null;
  skipReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// ETAPA 13: ARQUITETURA SAAS MULTIEMPRESA E MASTER ADMIN
// ==========================================

export interface SaaSPlanCatalogItem {
  id: string;
  code: 'SIMPLE' | 'COMPLETE';
  name: string;
  description: string;
  defaultPriceCents: number;
  allowDeposit: boolean;
  features: string[];
  active: boolean;
  updatedBy?: string | null;
  updatedAt: string;
  priceHistory?: Array<{
    timestamp: string;
    actor: string;
    previousPriceCents: number;
    newPriceCents: number;
    reason?: string;
  }>;
}

export interface SaaSInvoiceItem {
  id: string;
  tenantId: string;
  tenantName?: string;
  subscriptionId: string;
  plan: 'SIMPLE' | 'COMPLETE';
  amountCents: number;
  dueDate: string;
  paidAt?: string | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  paymentMethod?: string | null;
  externalReference?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerBusinessSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string;
  phone: string;
  email: string;
  address: string;
  openTime: string;
  closeTime: string;
  timezone: string;
  requireDeposit: boolean;
  defaultDeposit: number;
  plan: 'SIMPLE' | 'COMPLETE';
  servicesCount: number;
  professionalsCount: number;
  featuredServices: Array<{
    id: string;
    name: string;
    category: string;
    priceCents: number;
    durationMin: number;
  }>;
}


