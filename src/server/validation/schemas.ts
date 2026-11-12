import { z } from 'zod';

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(150, 'Nome muito longo'),
  phone: z.string().trim().min(8, 'Telefone deve ter pelo menos 8 dígitos').max(30, 'Telefone inválido'),
  email: z.string().trim().email('E-mail inválido').optional().nullable().or(z.literal('')),
  notes: z.string().max(2000, 'Observação muito longa (máximo 2000 caracteres)').optional().nullable(),
  preferences: z.string().max(2000, 'Preferências muito longas (máximo 2000 caracteres)').optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  communicationConsent: z.object({
    whatsapp: z.boolean().default(true),
    sms: z.boolean().default(false),
    email: z.boolean().default(true),
  }).optional(),
  active: z.boolean().optional(),
  allowExistingReturn: z.boolean().optional(),
});

export const clientNoteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(2, 'A anotação interna deve conter pelo menos 2 caracteres')
    .max(1500, 'A anotação interna não pode ultrapassar 1500 caracteres'),
});

export const clientTagsSchema = z.object({
  tags: z
    .array(z.string().trim().min(1, 'Etiqueta vazia não permitida').max(40, 'Etiqueta deve ter no máximo 40 caracteres'))
    .max(20, 'Máximo de 20 etiquetas por cliente'),
});

export const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  specialty: z.string().trim().min(2, 'Especialidade obrigatória'),
  avatarUrl: z.string().optional().nullable(),
  active: z.boolean().optional(),
  confirmFutureConflicts: z.boolean().optional(),
  workingHours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inicial deve estar no formato HH:MM'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário final deve estar no formato HH:MM'),
    breakStart: z.string().optional().nullable(),
    breakEnd: z.string().optional().nullable(),
  })).optional(),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Nome do serviço obrigatório'),
  description: z.string().optional().nullable(),
  category: z.string().trim().min(2, 'Categoria obrigatória'),
  priceCents: z.number().int().positive('Preço em centavos deve ser maior que zero'),
  durationMin: z.number().int().positive('Duração deve ser em minutos positivos'),
  bufferBeforeMin: z.number().int().nonnegative().optional().nullable().default(0),
  bufferAfterMin: z.number().int().nonnegative().optional().nullable().default(0),
  preparationMin: z.number().int().nonnegative().optional().nullable().default(0),
  depositPercent: z.number().int().min(0, 'Percentual mínimo de sinal é 0%').max(100, 'Percentual máximo de sinal é 100%'),
  active: z.boolean().optional(),
  professionalIds: z.array(z.string()).optional(),
});

export const timeBlockSchema = z.object({
  professionalId: z.string().optional().nullable(),
  type: z.enum(['DAY_OFF', 'VACATION', 'BREAK', 'INTERVAL', 'LUNCH', 'PERSONAL', 'EXCEPTION']),
  startDate: z.string().min(1, 'Data/hora inicial obrigatória'),
  endDate: z.string().min(1, 'Data/hora final obrigatória'),
  reason: z.string().max(500, 'Motivo muito longo').optional().nullable(),
  confirmOverlap: z.boolean().optional().default(false),
});

export const appointmentSchema = z.object({
  clientId: z.string().min(1, 'Cliente obrigatório'),
  professionalId: z.string().min(1, 'Profissional obrigatório'),
  serviceId: z.string().min(1, 'Serviço obrigatório'),
  dateTime: z.string().min(1, 'Data e horário obrigatórios'),
  status: z.enum(['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW']).optional(),
  origin: z.enum(['ONLINE', 'PRESENCIAL', 'TELEFONE', 'WHATSAPP', 'INSTAGRAM', 'OUTRO']).optional().default('ONLINE'),
  notes: z.string().max(2000, 'Observações muito longas').optional().nullable(),
  allowOutsideHours: z.boolean().optional().default(false),
});

export const updateAppointmentAdminSchema = z.object({
  dateTime: z.string().optional(),
  professionalId: z.string().optional(),
  serviceId: z.string().optional(),
  notes: z.string().max(2000).optional().nullable(),
  reason: z.string().max(500).optional(),
  confirmedByStaff: z.boolean().optional(),
});

export const businessSchema = z.object({
  name: z.string().min(2, 'Nome do salão obrigatório').optional(),
  slug: z.string().trim().min(2, 'Slug deve ter pelo menos 2 caracteres').max(100, 'Slug muito longo').optional().nullable(),
  description: z.string().max(2000, 'Descrição muito longa').optional().nullable(),
  logoUrl: z.string().max(500, 'URL da logo muito longa').optional().nullable().or(z.literal('')),
  isPublished: z.boolean().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('E-mail inválido').optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  openTime: z.string().optional().nullable(),
  closeTime: z.string().optional().nullable(),
  requireDeposit: z.boolean().optional().nullable(),
  defaultDeposit: z.coerce.number().int().min(0).max(100).optional().nullable(),
  cancellationHoursLimit: z.coerce
    .number({ message: 'O prazo de cancelamento deve ser um número em horas' })
    .int('O prazo de cancelamento deve ser um número inteiro de horas')
    .min(1, 'O prazo mínimo de cancelamento deve ser de pelo menos 1 hora')
    .max(720, 'O prazo máximo de cancelamento permitido é de 720 horas (30 dias)')
    .optional()
    .nullable(),
  allowCustomerReschedule: z.boolean().optional().nullable(),
  allowManualReviewOutOfPeriod: z.boolean().optional().nullable(),
  cancellationPolicyText: z.string().max(2000, 'Texto da política muito longo').optional().nullable(),
  cancellationContactInstructions: z.string().max(1000, 'Instruções de contato muito longas').optional().nullable(),
  mpPublicKey: z.string().trim().max(500, 'Public Key muito longa').optional().nullable().or(z.literal('')),
  mpAccessToken: z.string().trim().max(500, 'Access Token muito longo').optional().nullable().or(z.literal('')),
  mpWebhookSecret: z.string().trim().max(500, 'Webhook Secret muito longo').optional().nullable().or(z.literal('')),
  mpEnvironment: z.enum(['sandbox', 'production']).optional().nullable(),
});

export const cancellationPolicySchema = z.object({
  cancellationHoursLimit: z
    .number({ message: 'O prazo de cancelamento deve ser um número em horas' })
    .int('O prazo de cancelamento deve ser um número inteiro de horas')
    .min(1, 'O prazo mínimo de cancelamento deve ser de pelo menos 1 hora')
    .max(720, 'O prazo máximo de cancelamento permitido é de 720 horas (30 dias)'),
  allowCustomerReschedule: z.boolean().optional().default(true),
  allowManualReviewOutOfPeriod: z.boolean().optional().default(true),
  cancellationPolicyText: z.string().max(2000, 'Texto da política muito longo').optional(),
  cancellationContactInstructions: z.string().max(1000, 'Instruções de contato muito longas').optional(),
});

export const createCancellationRequestSchema = z.object({
  reason: z.string().trim().min(3, 'Por favor, informe o motivo do cancelamento (mínimo 3 caracteres)').max(1000).optional(),
  confirmedByCustomer: z.boolean().refine((val) => val === true, {
    message: 'É necessária a confirmação explícita dos termos antes de enviar a solicitação.',
  }),
});

export const adminCancellationDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  justification: z.string().trim().min(5, 'A justificativa da decisão administrativa é obrigatória (mínimo 5 caracteres)').max(1000),
  authorizeExceptionRefund: z.boolean().optional().default(false),
});

export const adminRefundExecutionSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const rescheduleAppointmentSchema = z.object({
  newDateTime: z.string().min(1, 'Nova data e horário são obrigatórios'),
  reason: z.string().trim().max(500).optional(),
});

export const EXPENSE_CATEGORIES = [
  'ALUGUEL',
  'AGUA_ENERGIA',
  'INTERNET_TELEFONE',
  'MATERIAIS_PRODUTOS',
  'EQUIPAMENTOS',
  'MANUTENCAO',
  'MARKETING',
  'TAXAS_PLATAFORMA',
  'IMPOSTOS',
  'OUTRAS',
] as const;

export const createExpenseSchema = z.object({
  description: z.string().trim().min(2, 'A descrição da despesa deve ter pelo menos 2 caracteres').max(255),
  category: z.enum(EXPENSE_CATEGORIES).default('OUTRAS'),
  amountCents: z.number({ message: 'O valor em centavos deve ser inteiro positivo' }).int('O valor deve ser em centavos inteiros').positive('O valor da despesa deve ser maior que zero'),
  competenceDate: z.string().min(1, 'Data de competência obrigatória'),
  dueDate: z.string().min(1, 'Data de vencimento obrigatória'),
  status: z.enum(['PENDING', 'PAID']).optional().default('PENDING'),
  paymentMethod: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'TRANSFER', 'BOLETO', 'OUTRO']).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateExpenseSchema = z.object({
  description: z.string().trim().min(2).max(255).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amountCents: z.number().int().positive('O valor deve ser maior que zero').optional(),
  competenceDate: z.string().optional(),
  dueDate: z.string().optional(),
  paymentMethod: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const payExpenseSchema = z.object({
  paymentMethod: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'TRANSFER', 'BOLETO', 'OUTRO']).default('PIX'),
  paidAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  confirmedByStaff: z.boolean().refine((v) => v === true, {
    message: 'É obrigatória a confirmação explícita de pagamento da despesa.',
  }),
});

export const reverseExpenseSchema = z.object({
  reason: z.string().trim().min(5, 'Informe uma justificativa com pelo menos 5 caracteres para estornar/cancelar a despesa').max(1000),
});

export const recordBalancePaymentSchema = z.object({
  appointmentId: z.string().min(1, 'Agendamento obrigatório'),
  amountCents: z.number().int('O valor deve ser em centavos inteiros').positive('O valor recebido deve ser maior que zero'),
  paymentType: z.enum(['BALANCE', 'FULL', 'DEPOSIT']).default('BALANCE'),
  paymentMethod: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'TRANSFER']).default('PIX'),
  feeCents: z.number().int().nonnegative().optional().nullable(),
  idempotencyKey: z.string().trim().min(3).optional(),
  notes: z.string().max(500).optional(),
});

export const reconcilePaymentDiscrepancySchema = z.object({
  providerAmountCents: z.number().int().nonnegative().optional(),
  providerStatus: z.string().optional(),
  feeCents: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().trim().min(3, 'Descreva a observação ou divergência de conciliação').max(1000),
});

export const manualCashAdjustmentSchema = z.object({
  type: z.enum(['INFLOW', 'OUTFLOW']),
  amountCents: z.number().int('O valor deve ser em centavos inteiros').positive('O valor do ajuste deve ser maior que zero'),
  category: z.string().trim().min(2).max(100).default('AJUSTE_ADMINISTRATIVO'),
  description: z.string().trim().min(3, 'Informe a descrição do lançamento').max(255),
  paymentMethod: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'TRANSFER', 'OUTRO']).default('CASH'),
  justification: z.string().trim().min(5, 'Todo ajuste manual de caixa exige justificativa obrigatória (mín. 5 caracteres)').max(1000),
  occurredAt: z.string().optional(),
});

export const reverseCashTransactionSchema = z.object({
  justification: z.string().trim().min(5, 'Todo estorno de lançamento exige justificativa obrigatória (mín. 5 caracteres)').max(1000),
});

export const commissionRuleSchema = z.object({
  scope: z.enum(['PROFESSIONAL_SERVICE', 'SERVICE', 'PROFESSIONAL']),
  professionalId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  percentage: z.number().int('Percentual deve ser inteiro entre 0 e 100').min(0, 'Percentual mínimo é 0%').max(100, 'Percentual máximo é 100%'),
  fixedCents: z.number().int().nonnegative().optional().default(0),
  basis: z.enum(['COMPLETED_SERVICE_VALUE', 'RECEIVED_AMOUNT']).default('COMPLETED_SERVICE_VALUE'),
  active: z.boolean().optional().default(true),
});

export const commissionActionSchema = z.object({
  action: z.enum(['APPROVE', 'PAY', 'CANCEL', 'ADJUST']),
  adjustedAmountCents: z.number().int().nonnegative().optional(),
  paymentMethod: z.enum(['PIX', 'TRANSFER', 'CASH', 'OUTRO']).optional().default('PIX'),
  registerAsExpense: z.boolean().optional().default(false),
  reason: z.string().trim().max(1000).optional(),
});

