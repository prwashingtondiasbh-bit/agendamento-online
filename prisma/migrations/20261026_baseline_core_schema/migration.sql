-- =====================================================================================
-- Migration: 20261026_baseline_core_schema
-- Description: Baseline das 14 tabelas fundacionais do Agenda Beauty + Expansão segura de ENUMs
-- =====================================================================================

SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ENGINE_SUBSTITUTION');

CREATE TABLE IF NOT EXISTS `Tenant` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(150) NULL,
  `address` VARCHAR(255) NULL,
  `timezone` VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
  `currency` VARCHAR(10) NOT NULL DEFAULT 'BRL',
  `openTime` VARCHAR(10) NOT NULL DEFAULT '09:00',
  `closeTime` VARCHAR(10) NOT NULL DEFAULT '19:00',
  `defaultDeposit` INT NOT NULL DEFAULT 30,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `slug` (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `User` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `resetToken` VARCHAR(255) NULL,
  `resetExpires` DATETIME NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `email` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TenantMember` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `role` ENUM('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL', 'CUSTOMER') NOT NULL DEFAULT 'PROFESSIONAL',
  `permissions` JSON NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `unique_tenant_user` (`tenantId`, `userId`),
  INDEX `userId` (`userId`),
  CONSTRAINT `TenantMember_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `TenantMember_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Subscription` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `plan` ENUM('FREE', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'FREE',
  `status` ENUM('ACTIVE', 'PAST_DUE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `expiresAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tenantId` (`tenantId`),
  CONSTRAINT `Subscription_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AuditLog` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NULL,
  `userId` VARCHAR(36) NULL,
  `action` VARCHAR(150) NOT NULL,
  `details` JSON NULL,
  `ipAddress` VARCHAR(50) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tenantId` (`tenantId`),
  INDEX `userId` (`userId`),
  CONSTRAINT `AuditLog_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `AuditLog_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Professional` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NULL,
  `phone` VARCHAR(30) NULL,
  `avatarUrl` VARCHAR(500) NULL,
  `specialty` VARCHAR(150) NULL DEFAULT 'Nail Designer Geral',
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tenantId` (`tenantId`),
  CONSTRAINT `Professional_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Service` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `durationMin` INT NOT NULL DEFAULT 60,
  `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `category` VARCHAR(100) NULL DEFAULT 'Unhas',
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `priceCents` INT NOT NULL DEFAULT 0,
  `bufferBeforeMin` INT NOT NULL DEFAULT 0,
  `bufferAfterMin` INT NOT NULL DEFAULT 0,
  `preparationMin` INT NOT NULL DEFAULT 0,
  `depositPercent` INT NOT NULL DEFAULT 30,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tenantId` (`tenantId`),
  CONSTRAINT `Service_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ServiceProfessional` (
  `id` VARCHAR(36) NOT NULL,
  `serviceId` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `unique_service_prof` (`serviceId`, `professionalId`),
  INDEX `professionalId` (`professionalId`),
  CONSTRAINT `ServiceProfessional_ibfk_1` FOREIGN KEY (`serviceId`) REFERENCES `Service` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `ServiceProfessional_ibfk_2` FOREIGN KEY (`professionalId`) REFERENCES `Professional` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WorkingHour` (
  `id` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NOT NULL,
  `dayOfWeek` INT NOT NULL,
  `startTime` VARCHAR(10) NOT NULL DEFAULT '09:00',
  `endTime` VARCHAR(10) NOT NULL DEFAULT '19:00',
  `breakStart` VARCHAR(10) NULL,
  `breakEnd` VARCHAR(10) NULL,
  PRIMARY KEY (`id`),
  INDEX `professionalId` (`professionalId`),
  CONSTRAINT `WorkingHour_ibfk_1` FOREIGN KEY (`professionalId`) REFERENCES `Professional` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TimeBlock` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NULL,
  `type` ENUM('DAY_OFF', 'VACATION', 'BREAK', 'INTERVAL', 'LUNCH', 'PERSONAL', 'EXCEPTION') NOT NULL DEFAULT 'DAY_OFF',
  `startDate` DATETIME NOT NULL,
  `endDate` DATETIME NOT NULL,
  `reason` VARCHAR(255) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tenantId` (`tenantId`),
  INDEX `professionalId` (`professionalId`),
  CONSTRAINT `TimeBlock_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `TimeBlock_ibfk_2` FOREIGN KEY (`professionalId`) REFERENCES `Professional` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Client` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tenantId` (`tenantId`),
  CONSTRAINT `Client_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Appointment` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `professionalId` VARCHAR(36) NOT NULL,
  `serviceId` VARCHAR(36) NOT NULL,
  `dateTime` DATETIME NOT NULL,
  `endDateTime` DATETIME NULL,
  `status` ENUM('PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `expiresAt` DATETIME NULL,
  `totalAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `totalAmountCents` INT NOT NULL DEFAULT 0,
  `depositAmountCents` INT NOT NULL DEFAULT 0,
  `balanceAmountCents` INT NOT NULL DEFAULT 0,
  `snapshotPriceCents` INT NOT NULL DEFAULT 0,
  `snapshotDurationMin` INT NOT NULL DEFAULT 60,
  `snapshotDepositPercent` INT NOT NULL DEFAULT 30,
  `snapshotDepositCents` INT NOT NULL DEFAULT 0,
  `snapshotBalanceCents` INT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `tenantId` (`tenantId`),
  INDEX `clientId` (`clientId`),
  INDEX `professionalId` (`professionalId`),
  INDEX `serviceId` (`serviceId`),
  CONSTRAINT `Appointment_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `Appointment_ibfk_2` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `Appointment_ibfk_3` FOREIGN KEY (`professionalId`) REFERENCES `Professional` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `Appointment_ibfk_4` FOREIGN KEY (`serviceId`) REFERENCES `Service` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Payment` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `appointmentId` VARCHAR(36) NOT NULL,
  `provider` VARCHAR(50) NOT NULL DEFAULT 'MERCADO_PAGO',
  `providerPaymentId` VARCHAR(100) NULL,
  `externalReference` VARCHAR(150) NOT NULL,
  `idempotencyKey` VARCHAR(150) NOT NULL,
  `amountCents` INT NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'BRL',
  `status` ENUM('CREATED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED') NOT NULL DEFAULT 'CREATED',
  `paymentMethod` VARCHAR(50) NOT NULL DEFAULT 'PIX',
  `qrCode` TEXT NULL,
  `qrCodeBase64` LONGTEXT NULL,
  `ticketUrl` VARCHAR(500) NULL,
  `expiresAt` DATETIME NULL,
  `approvedAt` DATETIME NULL,
  `rawResponse` LONGTEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `externalReference` (`externalReference`),
  UNIQUE INDEX `idempotencyKey` (`idempotencyKey`),
  INDEX `idx_payment_appointment` (`appointmentId`),
  INDEX `idx_payment_provider_id` (`providerPaymentId`),
  INDEX `idx_payment_tenant_status` (`tenantId`, `status`),
  CONSTRAINT `Payment_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `Payment_ibfk_2` FOREIGN KEY (`appointmentId`) REFERENCES `Appointment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WebhookEvent` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NULL,
  `provider` VARCHAR(50) NOT NULL DEFAULT 'MERCADO_PAGO',
  `providerEventId` VARCHAR(150) NULL,
  `resourceId` VARCHAR(150) NULL,
  `eventType` VARCHAR(100) NOT NULL,
  `payload` LONGTEXT NULL,
  `processingStatus` ENUM('PENDING', 'PROCESSED', 'FAILED', 'IGNORED') NOT NULL DEFAULT 'PENDING',
  `attempts` INT NOT NULL DEFAULT 1,
  `receivedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processedAt` DATETIME NULL,
  `lastError` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `unique_provider_event` (`provider`, `providerEventId`),
  INDEX `tenantId` (`tenantId`),
  CONSTRAINT `WebhookEvent_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Expand ENUMs on existing tables safely
ALTER TABLE `TenantMember`
  MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL', 'CUSTOMER') NOT NULL DEFAULT 'PROFESSIONAL';

ALTER TABLE `Appointment`
  MODIFY COLUMN `status` ENUM('PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING_PAYMENT',
  MODIFY COLUMN `totalAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE `TimeBlock`
  MODIFY COLUMN `type` ENUM('DAY_OFF', 'VACATION', 'BREAK', 'INTERVAL', 'LUNCH', 'PERSONAL', 'EXCEPTION') NOT NULL DEFAULT 'DAY_OFF';

ALTER TABLE `Service`
  MODIFY COLUMN `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE `Payment`
  ADD COLUMN IF NOT EXISTS `paymentType` VARCHAR(50) NOT NULL DEFAULT 'DEPOSIT',
  ADD COLUMN IF NOT EXISTS `feeCents` INT NULL,
  ADD COLUMN IF NOT EXISTS `netAmountCents` INT NULL,
  ADD COLUMN IF NOT EXISTS `refundedAmountCents` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `reconciliationStatus` VARCHAR(60) NOT NULL DEFAULT 'RECONCILED';
