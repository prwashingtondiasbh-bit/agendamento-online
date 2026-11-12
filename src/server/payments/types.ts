export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type WebhookProcessingStatus = 'PENDING' | 'PROCESSED' | 'FAILED' | 'IGNORED';

export interface CreatePixPaymentInput {
  tenantId?: string;
  appointmentId?: string;
  externalReference?: string;
  amountCents: number;
  description: string;
  idempotencyKey: string;
  payer: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  expiresAt: Date;
  metadata?: any;
}

export interface CreatePixPaymentOutput {
  providerPaymentId: string;
  status: PaymentStatus;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  expiresAt: Date;
  rawResponse: any;
}

export interface PaymentDetails {
  providerPaymentId: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  externalReference: string;
  approvedAt?: Date;
  rawResponse: any;
}

export interface RefundDetails {
  refundId: string;
  status: string;
  amountCents: number;
  rawResponse: any;
}

export interface ValidateWebhookParams {
  xSignature?: string;
  signatureHeader?: string;
  xRequestId?: string;
  requestIdHeader?: string;
  dataId?: string;
  rawBody?: string;
}

export interface PaymentProvider {
  name: string;
  createPixPayment(input: CreatePixPaymentInput): Promise<CreatePixPaymentOutput>;
  getPayment(providerPaymentId: string): Promise<PaymentDetails>;
  cancelPayment(providerPaymentId: string): Promise<PaymentDetails>;
  refundPayment(providerPaymentId: string, amountCents?: number, idempotencyKey?: string): Promise<RefundDetails>;
  validateWebhookSignature(params: ValidateWebhookParams): boolean;
  normalizePaymentStatus(rawStatus: string): PaymentStatus;
}

