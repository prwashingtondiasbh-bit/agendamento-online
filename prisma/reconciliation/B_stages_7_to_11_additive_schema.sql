-- =====================================================================================
-- MIGRAÇÃO B: CAMPOS ADITIVOS E 29 TABELAS DAS ETAPAS 7 A 11 (COM FK VARCHAR(36))
-- STATUS: PREPARADA PARA REVISÃO — NÃO EXECUTADA NO BANCO REMOTO NESTA ETAPA
-- =====================================================================================

SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ENGINE_SUBSTITUTION');

-- -------------------------------------------------------------------------------------
-- B.1. Colunas aditivas nas tabelas existentes (Tenant, TimeBlock, Appointment, Client)
-- -------------------------------------------------------------------------------------
ALTER TABLE `Tenant`
  ADD COLUMN IF NOT EXISTS `cancellationHoursLimit` INT NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS `allowCustomerReschedule` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS `allowManualReviewOutOfPeriod` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS `cancellationPolicyText` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `cancellationContactInstructions` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `cancellationPolicyVersion` INT NOT NULL DEFAULT 1;

ALTER TABLE `TimeBlock`
  ADD COLUMN IF NOT EXISTS `createdBy` VARCHAR(36) NULL;

ALTER TABLE `Appointment`
  ADD COLUMN IF NOT EXISTS `origin` VARCHAR(50) NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS `snapshotCancellationHours` INT NULL,
  ADD COLUMN IF NOT EXISTS `snapshotPolicyText` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `snapshotPolicyVersion` INT NULL,
  ADD COLUMN IF NOT EXISTS `policyAcceptedAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `rescheduledFromDateTime` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `rescheduledAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `rescheduleCount` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `rescheduleHistory` JSON NULL,
  ADD COLUMN IF NOT EXISTS `createdBy` VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS `updatedBy` VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS `startedAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `completedAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `noShowAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `locationId` VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS `couponCode` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `discountCents` INT NOT NULL DEFAULT 0;

ALTER TABLE `Client`
  ADD COLUMN IF NOT EXISTS `preferences` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `internalNotes` JSON NULL,
  ADD COLUMN IF NOT EXISTS `tags` JSON NULL,
  ADD COLUMN IF NOT EXISTS `communicationConsent` JSON NULL,
  ADD COLUMN IF NOT EXISTS `normalizedPhone` VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS `whatsappOptIn` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS `promotionalConsent` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS `promotionalConsentAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `promotionalConsentSource` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `promotionalConsentRevokedAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `active` BOOLEAN NOT NULL DEFAULT TRUE;

-- -------------------------------------------------------------------------------------
-- B.2. Etapa 7 — Cancelamento e Reembolso (2 tabelas: CancellationRequest, RefundRequest)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `CancellationRequest` (
  `id` VARCHAR(36) NOT NULL,
  `referenceCode` VARCHAR(100) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  `refundStatus` ENUM('NOT_REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED') NOT NULL DEFAULT 'NOT_REQUESTED',
  `reason` TEXT NULL,
  `isWithinPolicy` BOOLEAN NOT NULL DEFAULT FALSE,
  `isEligibleForRefund` BOOLEAN NOT NULL DEFAULT FALSE,
  `hoursNoticeCalculated` DOUBLE NOT NULL,
  `snapshotCancellationHours` INT NULL,
  `snapshotPolicyText` TEXT NULL,
  `snapshotPolicyVersion` INT NULL,
  `deadlineCalculatedAt` DATETIME(3) NOT NULL,
  `paidDepositCents` INT NOT NULL DEFAULT 0,
  `refundableAmountCents` INT NOT NULL DEFAULT 0,
  `adminDecisionBy` VARCHAR(36) NULL,
  `adminDecisionAt` DATETIME(3) NULL,
  `adminJustification` TEXT NULL,
  `isManualException` BOOLEAN NOT NULL DEFAULT FALSE,
  `history` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CancellationRequest_referenceCode_key` (`referenceCode`),
  INDEX `CancellationRequest_tenantId_status_idx` (`tenantId`, `status`),
  INDEX `CancellationRequest_appointmentId_idx` (`appointmentId`),
  INDEX `CancellationRequest_clientId_idx` (`clientId`),
  CONSTRAINT `CancellationRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `CancellationRequest_appointmentId_fkey` FOREIGN KEY (`appointmentId`) REFERENCES `Appointment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `CancellationRequest_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RefundRequest` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `cancellationRequestId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `paymentId` VARCHAR(36) NULL,
  `provider` VARCHAR(50) NOT NULL DEFAULT 'MERCADO_PAGO',
  `providerPaymentId` VARCHAR(100) NULL,
  `providerRefundId` VARCHAR(100) NULL,
  `idempotencyKey` VARCHAR(150) NOT NULL,
  `amountCents` INT NOT NULL,
  `status` ENUM('NOT_REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `authorizedBy` VARCHAR(36) NULL,
  `authorizedAt` DATETIME(3) NULL,
  `processedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `rawResponse` JSON NULL,
  `history` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RefundRequest_idempotencyKey_key` (`idempotencyKey`),
  INDEX `RefundRequest_tenantId_status_idx` (`tenantId`, `status`),
  INDEX `RefundRequest_cancellationRequestId_idx` (`cancellationRequestId`),
  INDEX `RefundRequest_appointmentId_idx` (`appointmentId`),
  INDEX `RefundRequest_paymentId_idx` (`paymentId`),
  CONSTRAINT `RefundRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `RefundRequest_cancellationRequestId_fkey` FOREIGN KEY (`cancellationRequestId`) REFERENCES `CancellationRequest` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `RefundRequest_appointmentId_fkey` FOREIGN KEY (`appointmentId`) REFERENCES `Appointment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `RefundRequest_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `RefundRequest_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------------------
-- B.3. Etapa 9 — Módulo Financeiro (4 tabelas: Expense, FinancialTransaction, CommissionRule, CommissionRecord)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Expense` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'OUTRAS',
  `amountCents` INT NOT NULL,
  `competenceDate` DATETIME(3) NOT NULL,
  `dueDate` DATETIME(3) NOT NULL,
  `paidAt` DATETIME(3) NULL,
  `status` ENUM('PENDING', 'PAID', 'CANCELLED', 'REVERSED') NOT NULL DEFAULT 'PENDING',
  `paymentMethod` VARCHAR(60) NULL,
  `notes` TEXT NULL,
  `createdBy` VARCHAR(36) NULL,
  `paidBy` VARCHAR(36) NULL,
  `cancelledBy` VARCHAR(36) NULL,
  `cancellationReason` TEXT NULL,
  `history` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Expense_tenantId_status_idx` (`tenantId`, `status`),
  INDEX `Expense_tenantId_dueDate_idx` (`tenantId`, `dueDate`),
  INDEX `Expense_tenantId_competenceDate_idx` (`tenantId`, `competenceDate`),
  CONSTRAINT `Expense_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `FinancialTransaction` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `uniqueRef` VARCHAR(150) NOT NULL,
  `type` ENUM('INFLOW', 'OUTFLOW', 'ADJUSTMENT', 'REVERSAL') NOT NULL,
  `origin` VARCHAR(100) NOT NULL,
  `originId` VARCHAR(36) NULL,
  `amountCents` INT NOT NULL,
  `feeCents` INT NULL,
  `netAmountCents` INT NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `paymentMethod` VARCHAR(60) NULL,
  `actorId` VARCHAR(36) NULL,
  `actorName` VARCHAR(150) NULL,
  `status` ENUM('CONFIRMED', 'REVERSED', 'FLAGGED_FOR_REVIEW') NOT NULL DEFAULT 'CONFIRMED',
  `reconciliationStatus` VARCHAR(60) NOT NULL DEFAULT 'RECONCILED',
  `reconciliationDiscrepancy` TEXT NULL,
  `justification` TEXT NULL,
  `history` JSON NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `FinancialTransaction_tenantId_uniqueRef_key` (`tenantId`, `uniqueRef`),
  INDEX `FinancialTransaction_tenantId_occurredAt_idx` (`tenantId`, `occurredAt`),
  INDEX `FinancialTransaction_tenantId_type_status_idx` (`tenantId`, `type`, `status`),
  CONSTRAINT `FinancialTransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CommissionRule` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `scope` VARCHAR(60) NOT NULL,
  `professionalId` VARCHAR(36) NULL,
  `serviceId` VARCHAR(36) NULL,
  `percentage` INT NOT NULL,
  `fixedCents` INT NOT NULL DEFAULT 0,
  `basis` VARCHAR(60) NOT NULL DEFAULT 'COMPLETED_SERVICE_VALUE',
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `CommissionRule_tenantId_active_idx` (`tenantId`, `active`),
  INDEX `CommissionRule_tenantId_professionalId_serviceId_idx` (`tenantId`, `professionalId`, `serviceId`),
  CONSTRAINT `CommissionRule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CommissionRecord` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NOT NULL,
  `serviceId` VARCHAR(36) NOT NULL,
  `ruleId` VARCHAR(36) NULL,
  `ruleScope` VARCHAR(60) NULL,
  `percentageApplied` INT NOT NULL DEFAULT 0,
  `baseAmountCents` INT NOT NULL DEFAULT 0,
  `commissionAmountCents` INT NOT NULL DEFAULT 0,
  `status` ENUM('NO_RULE_CONFIGURED', 'PENDING_CALCULATION', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'PENDING_CALCULATION',
  `approvedBy` VARCHAR(36) NULL,
  `approvedAt` DATETIME(3) NULL,
  `paidBy` VARCHAR(36) NULL,
  `paidAt` DATETIME(3) NULL,
  `cancelledBy` VARCHAR(36) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `adjustmentReason` TEXT NULL,
  `history` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CommissionRecord_tenantId_appointmentId_key` (`tenantId`, `appointmentId`),
  INDEX `CommissionRecord_tenantId_professionalId_status_idx` (`tenantId`, `professionalId`, `status`),
  CONSTRAINT `CommissionRecord_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------------------
-- B.4. Etapa 10 — WhatsApp Business (5 tabelas: WhatsAppConfig, WhatsAppTemplate, WhatsAppMessageQueue, WhatsAppScheduledReminder, WhatsAppWebhookEvent)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `WhatsAppConfig` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `provider` VARCHAR(100) NOT NULL DEFAULT 'META_CLOUD_API',
  `status` ENUM('DISCONNECTED', 'PENDING_CREDENTIALS', 'CONNECTED', 'ERROR') NOT NULL DEFAULT 'PENDING_CREDENTIALS',
  `displayName` VARCHAR(191) NULL,
  `businessPhone` VARCHAR(64) NULL,
  `phoneNumberId` VARCHAR(191) NULL,
  `wabaId` VARCHAR(191) NULL,
  `encryptedAccessToken` TEXT NULL,
  `webhookVerifyToken` VARCHAR(191) NULL,
  `encryptedAppSecret` TEXT NULL,
  `enableBookingConfirmation` BOOLEAN NOT NULL DEFAULT TRUE,
  `enableReminders` BOOLEAN NOT NULL DEFAULT TRUE,
  `enableRescheduleAlerts` BOOLEAN NOT NULL DEFAULT TRUE,
  `enableCancellationAlerts` BOOLEAN NOT NULL DEFAULT TRUE,
  `enablePaymentAlerts` BOOLEAN NOT NULL DEFAULT TRUE,
  `enableRefundAlerts` BOOLEAN NOT NULL DEFAULT TRUE,
  `reminder24hEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `reminder3hEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `customReminderHours` INT NULL,
  `customReminderEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `allowedWindowStart` VARCHAR(16) NOT NULL DEFAULT '08:00',
  `allowedWindowEnd` VARCHAR(16) NOT NULL DEFAULT '20:00',
  `lastTestedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `updatedBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `WhatsAppConfig_tenantId_key` (`tenantId`),
  INDEX `WhatsAppConfig_phoneNumberId_idx` (`phoneNumberId`),
  INDEX `WhatsAppConfig_wabaId_idx` (`wabaId`),
  CONSTRAINT `WhatsAppConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WhatsAppTemplate` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `eventType` VARCHAR(100) NOT NULL,
  `templateName` VARCHAR(191) NOT NULL,
  `language` VARCHAR(32) NOT NULL DEFAULT 'pt_BR',
  `category` VARCHAR(64) NOT NULL DEFAULT 'UTILITY',
  `status` ENUM('APPROVED', 'PENDING', 'REJECTED', 'PAUSED') NOT NULL DEFAULT 'APPROVED',
  `bodyPreview` TEXT NOT NULL,
  `variablesSchema` JSON NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `updatedBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `WhatsAppTemplate_tenantId_eventType_key` (`tenantId`, `eventType`),
  INDEX `WhatsAppTemplate_tenantId_status_idx` (`tenantId`, `status`),
  CONSTRAINT `WhatsAppTemplate_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WhatsAppMessageQueue` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NULL,
  `appointmentId` VARCHAR(36) NULL,
  `referenceId` VARCHAR(36) NULL,
  `eventType` VARCHAR(100) NOT NULL,
  `messageCategory` VARCHAR(64) NOT NULL DEFAULT 'OPERATIONAL',
  `recipientPhone` VARCHAR(64) NOT NULL,
  `templateName` VARCHAR(191) NULL,
  `templateLanguage` VARCHAR(32) NULL DEFAULT 'pt_BR',
  `templateVariables` JSON NULL,
  `renderedBody` TEXT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(100) NOT NULL DEFAULT 'META_CLOUD_API',
  `providerMessageId` VARCHAR(191) NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `attempts` INT NOT NULL DEFAULT 0,
  `maxAttempts` INT NOT NULL DEFAULT 3,
  `nextAttemptAt` DATETIME(3) NULL,
  `lockedAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `readAt` DATETIME(3) NULL,
  `failedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `isPermanentError` BOOLEAN NOT NULL DEFAULT FALSE,
  `errorCode` VARCHAR(100) NULL,
  `errorMessage` TEXT NULL,
  `requestedBy` VARCHAR(36) NULL,
  `statusHistory` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `WhatsAppMessageQueue_idempotencyKey_key` (`idempotencyKey`),
  INDEX `WhatsAppMessageQueue_tenantId_status_idx` (`tenantId`, `status`),
  INDEX `WhatsAppMessageQueue_tenantId_clientId_idx` (`tenantId`, `clientId`),
  INDEX `WhatsAppMessageQueue_tenantId_appointmentId_idx` (`tenantId`, `appointmentId`),
  INDEX `WhatsAppMessageQueue_providerMessageId_idx` (`providerMessageId`),
  CONSTRAINT `WhatsAppMessageQueue_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WhatsAppScheduledReminder` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `reminderType` VARCHAR(64) NOT NULL,
  `leadTimeHours` INT NOT NULL,
  `scheduledFor` DATETIME(3) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'SCHEDULED',
  `messageQueueId` VARCHAR(36) NULL,
  `skipReason` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `WhatsAppReminder_tenant_app_type_key` (`tenantId`, `appointmentId`, `reminderType`),
  INDEX `WhatsAppReminder_tenant_status_sched_idx` (`tenantId`, `status`, `scheduledFor`),
  CONSTRAINT `WhatsAppScheduledReminder_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WhatsAppWebhookEvent` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NULL,
  `providerEventId` VARCHAR(191) NOT NULL,
  `wabaId` VARCHAR(191) NULL,
  `phoneNumberId` VARCHAR(191) NULL,
  `wamid` VARCHAR(191) NULL,
  `eventStatus` VARCHAR(64) NULL,
  `payload` JSON NULL,
  `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `WhatsAppWebhookEvent_providerEventId_key` (`providerEventId`),
  INDEX `WhatsAppWebhookEvent_tenantId_idx` (`tenantId`),
  INDEX `WhatsAppWebhookEvent_wamid_idx` (`wamid`),
  CONSTRAINT `WhatsAppWebhookEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------------------
-- B.5. Etapa 11 — Recursos Avançados (18 tabelas)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `BusinessLocation` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `address` VARCHAR(255) NULL,
  `phone` VARCHAR(64) NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  `openTime` VARCHAR(16) NOT NULL DEFAULT '08:00',
  `closeTime` VARCHAR(16) NOT NULL DEFAULT '20:00',
  `professionalIds` JSON NULL,
  `serviceIds` JSON NULL,
  `isMain` BOOLEAN NOT NULL DEFAULT FALSE,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `BusinessLocation_tenantId_active_idx` (`tenantId`, `active`),
  CONSTRAINT `BusinessLocation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WaitlistEntry` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `serviceId` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NULL,
  `locationId` VARCHAR(36) NULL,
  `desiredDate` VARCHAR(32) NOT NULL,
  `preferredPeriod` VARCHAR(32) NOT NULL DEFAULT 'ANY',
  `preferredStartTime` VARCHAR(16) NULL,
  `preferredEndTime` VARCHAR(16) NULL,
  `alternativeDays` JSON NULL,
  `priority` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(32) NOT NULL DEFAULT 'WAITING',
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `WaitlistEntry_tenantId_status_desiredDate_idx` (`tenantId`, `status`, `desiredDate`),
  INDEX `WaitlistEntry_tenantId_clientId_idx` (`tenantId`, `clientId`),
  CONSTRAINT `WaitlistEntry_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WaitlistOffer` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `waitlistEntryId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `serviceId` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NOT NULL,
  `slotDateTime` DATETIME(3) NOT NULL,
  `slotEndDateTime` DATETIME(3) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `expiresAt` DATETIME(3) NOT NULL,
  `appointmentId` VARCHAR(36) NULL,
  `sentViaChannel` VARCHAR(32) NULL,
  `createdBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `WaitlistOffer_tenantId_status_slotDateTime_idx` (`tenantId`, `status`, `slotDateTime`),
  INDEX `WaitlistOffer_waitlistEntryId_idx` (`waitlistEntryId`),
  CONSTRAINT `WaitlistOffer_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LoyaltyProgram` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL DEFAULT 'Clube de Fidelidade Agenda Beauty',
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `pointsPerReal` INT NOT NULL DEFAULT 1,
  `pointsExpirationDays` INT NULL DEFAULT 365,
  `minRedemptionPoints` INT NOT NULL DEFAULT 50,
  `eligibleServiceIds` JSON NULL,
  `eligibleCategories` JSON NULL,
  `reversalRuleOnRefund` VARCHAR(32) NOT NULL DEFAULT 'PROPORTIONAL',
  `rulesDescription` TEXT NULL,
  `updatedBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `LoyaltyProgram_tenantId_key` (`tenantId`),
  CONSTRAINT `LoyaltyProgram_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LoyaltyReward` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `pointsRequired` INT NOT NULL,
  `rewardType` VARCHAR(64) NOT NULL DEFAULT 'DISCOUNT_CENTS',
  `discountCents` INT NOT NULL DEFAULT 0,
  `serviceId` VARCHAR(36) NULL,
  `maxRedemptionsPerClient` INT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `LoyaltyReward_tenantId_active_idx` (`tenantId`, `active`),
  CONSTRAINT `LoyaltyReward_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LoyaltyLedger` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `pointsDelta` INT NOT NULL,
  `balanceAfter` INT NOT NULL,
  `referenceType` VARCHAR(64) NOT NULL,
  `referenceId` VARCHAR(36) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `justification` TEXT NULL,
  `actorId` VARCHAR(36) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `LoyaltyLedger_idempotencyKey_key` (`idempotencyKey`),
  INDEX `LoyaltyLedger_tenantId_clientId_createdAt_idx` (`tenantId`, `clientId`, `createdAt`),
  CONSTRAINT `LoyaltyLedger_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Coupon` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `discountType` VARCHAR(32) NOT NULL DEFAULT 'PERCENTAGE',
  `discountValue` INT NOT NULL,
  `maxDiscountCents` INT NULL,
  `minPurchaseCents` INT NOT NULL DEFAULT 0,
  `startsAt` DATETIME(3) NULL,
  `endsAt` DATETIME(3) NULL,
  `maxTotalUses` INT NULL,
  `maxUsesPerClient` INT NOT NULL DEFAULT 1,
  `firstPurchaseOnly` BOOLEAN NOT NULL DEFAULT FALSE,
  `eligibleServiceIds` JSON NULL,
  `eligibleProfessionalIds` JSON NULL,
  `allowedClientIds` JSON NULL,
  `allowStacking` BOOLEAN NOT NULL DEFAULT FALSE,
  `campaignId` VARCHAR(36) NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Coupon_tenantId_code_key` (`tenantId`, `code`),
  INDEX `Coupon_tenantId_active_idx` (`tenantId`, `active`),
  CONSTRAINT `Coupon_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CouponRedemption` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `couponId` VARCHAR(36) NOT NULL,
  `couponCode` VARCHAR(100) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  `orderAmountCents` INT NOT NULL,
  `discountCents` INT NOT NULL,
  `finalAmountCents` INT NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CouponRedemption_idempotencyKey_key` (`idempotencyKey`),
  INDEX `CouponRedemption_tenantId_couponId_status_idx` (`tenantId`, `couponId`, `status`),
  INDEX `CouponRedemption_tenantId_clientId_couponId_idx` (`tenantId`, `clientId`, `couponId`),
  CONSTRAINT `CouponRedemption_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ServicePackage` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `items` JSON NOT NULL,
  `totalPriceCents` INT NOT NULL,
  `validityDays` INT NOT NULL DEFAULT 90,
  `allowedProfessionalIds` JSON NULL,
  `allowManualRenewal` BOOLEAN NOT NULL DEFAULT TRUE,
  `cancellationPolicy` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ServicePackage_tenantId_active_idx` (`tenantId`, `active`),
  CONSTRAINT `ServicePackage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CustomerPackage` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `packageId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING_PAYMENT',
  `pricePaidCents` INT NOT NULL,
  `paymentId` VARCHAR(36) NULL,
  `remainingItems` JSON NOT NULL,
  `expiresAt` DATETIME(3) NULL,
  `purchasedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `CustomerPackage_tenantId_clientId_status_idx` (`tenantId`, `clientId`, `status`),
  CONSTRAINT `CustomerPackage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PackageUsageLedger` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `customerPackageId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `serviceId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NULL,
  `action` VARCHAR(32) NOT NULL,
  `creditsDelta` INT NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(36) NULL,
  `notes` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PackageUsageLedger_idempotencyKey_key` (`idempotencyKey`),
  INDEX `PackageUsageLedger_tenantId_customerPackageId_idx` (`tenantId`, `customerPackageId`),
  CONSTRAINT `PackageUsageLedger_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GiftCard` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `initialBalanceCents` INT NOT NULL,
  `currentBalanceCents` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING_PAYMENT',
  `purchaserClientId` VARCHAR(36) NULL,
  `recipientName` VARCHAR(191) NULL,
  `recipientPhone` VARCHAR(64) NULL,
  `personalMessage` TEXT NULL,
  `allowPartialUse` BOOLEAN NOT NULL DEFAULT TRUE,
  `paymentId` VARCHAR(36) NULL,
  `expiresAt` DATETIME(3) NULL,
  `blockedReason` TEXT NULL,
  `blockedBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `GiftCard_code_key` (`code`),
  INDEX `GiftCard_tenantId_status_idx` (`tenantId`, `status`),
  INDEX `GiftCard_tenantId_code_idx` (`tenantId`, `code`),
  CONSTRAINT `GiftCard_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GiftCardTransaction` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `giftCardId` VARCHAR(36) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `amountCentsDelta` INT NOT NULL,
  `balanceAfterCents` INT NOT NULL,
  `appointmentId` VARCHAR(36) NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(36) NULL,
  `justification` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `GiftCardTransaction_idempotencyKey_key` (`idempotencyKey`),
  INDEX `GiftCardTransaction_tenantId_giftCardId_idx` (`tenantId`, `giftCardId`),
  CONSTRAINT `GiftCardTransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ServiceReview` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `serviceId` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NOT NULL,
  `rating` INT NOT NULL,
  `comment` TEXT NULL,
  `replyText` TEXT NULL,
  `repliedBy` VARCHAR(36) NULL,
  `repliedAt` DATETIME(3) NULL,
  `hidden` BOOLEAN NOT NULL DEFAULT FALSE,
  `hiddenReason` TEXT NULL,
  `hiddenBy` VARCHAR(36) NULL,
  `hiddenAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ServiceReview_appointmentId_key` (`appointmentId`),
  INDEX `ServiceReview_tenantId_serviceId_idx` (`tenantId`, `serviceId`),
  INDEX `ServiceReview_tenantId_professionalId_idx` (`tenantId`, `professionalId`),
  CONSTRAINT `ServiceReview_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MarketingCampaign` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `objective` VARCHAR(255) NOT NULL,
  `segmentType` VARCHAR(64) NOT NULL,
  `segmentFilters` JSON NULL,
  `couponCode` VARCHAR(100) NULL,
  `templateName` VARCHAR(191) NOT NULL DEFAULT 'agenda_beauty_Novidades_mkt_v1',
  `messagePreview` TEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  `estimatedRecipients` INT NOT NULL DEFAULT 0,
  `dispatchedBy` VARCHAR(36) NULL,
  `dispatchedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `MarketingCampaign_tenantId_status_idx` (`tenantId`, `status`),
  CONSTRAINT `MarketingCampaign_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CampaignRecipient` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `campaignId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `recipientPhone` VARCHAR(64) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'PENDING',
  `whatsappMsgId` VARCHAR(191) NULL,
  `errorReason` VARCHAR(255) NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CampaignRecipient_idempotencyKey_key` (`idempotencyKey`),
  UNIQUE INDEX `CampaignRecipient_campaignId_clientId_key` (`campaignId`, `clientId`),
  INDEX `CampaignRecipient_tenantId_campaignId_idx` (`tenantId`, `campaignId`),
  CONSTRAINT `CampaignRecipient_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `InventoryProduct` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `sku` VARCHAR(100) NOT NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'INSUMOS',
  `unit` VARCHAR(32) NOT NULL DEFAULT 'UN',
  `currentQuantity` INT NOT NULL DEFAULT 0,
  `minQuantity` INT NOT NULL DEFAULT 5,
  `unitCostCents` INT NOT NULL DEFAULT 0,
  `salePriceCents` INT NULL,
  `serviceConsumption` JSON NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `InventoryProduct_tenantId_sku_key` (`tenantId`, `sku`),
  INDEX `InventoryProduct_tenantId_active_idx` (`tenantId`, `active`),
  CONSTRAINT `InventoryProduct_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `InventoryMovement` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `productId` VARCHAR(36) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `quantityDelta` INT NOT NULL,
  `previousQuantity` INT NOT NULL,
  `newQuantity` INT NOT NULL,
  `unitCostCents` INT NULL,
  `reason` TEXT NOT NULL,
  `referenceId` VARCHAR(36) NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `InventoryMovement_idempotencyKey_key` (`idempotencyKey`),
  INDEX `InventoryMovement_tenantId_productId_createdAt_idx` (`tenantId`, `productId`, `createdAt`),
  CONSTRAINT `InventoryMovement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
