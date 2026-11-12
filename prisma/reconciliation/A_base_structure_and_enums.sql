-- =====================================================================================
-- MIGRAÇÃO A: CORREÇÃO ESTRUTURAL DA BASE EXISTENTE E EXPANSÃO SEGURA DE ENUMs
-- STATUS: PREPARADA PARA REVISÃO — NÃO EXECUTADA NO BANCO REMOTO NESTA ETAPA
-- =====================================================================================

-- 1. Ativar modo SQL estrito na sessão da migração para impedir truncamento ou coerção de ENUM para ''
SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ENGINE_SUBSTITUTION');

-- 2. Expandir ENUM TenantMember.role mantendo todos os valores existentes + 'CUSTOMER'
ALTER TABLE `TenantMember`
  MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL', 'CUSTOMER') NOT NULL DEFAULT 'PROFESSIONAL';

-- 3. Expandir ENUM Appointment.status mantendo valores existentes + 'IN_PROGRESS', 'EXPIRED', 'NO_SHOW'
ALTER TABLE `Appointment`
  MODIFY COLUMN `status` ENUM('PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING_PAYMENT';

-- 4. Expandir ENUM TimeBlock.type mantendo valores existentes + 'INTERVAL', 'LUNCH', 'PERSONAL', 'EXCEPTION'
ALTER TABLE `TimeBlock`
  MODIFY COLUMN `type` ENUM('DAY_OFF', 'VACATION', 'BREAK', 'INTERVAL', 'LUNCH', 'PERSONAL', 'EXCEPTION') NOT NULL DEFAULT 'DAY_OFF';

-- 5. Garantir DEFAULT seguro nas colunas legadas para compatibilidade entre SQL direto e Prisma
ALTER TABLE `Service`
  MODIFY COLUMN `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE `Appointment`
  MODIFY COLUMN `totalAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- 6. Garantir existência das tabelas Payment e WebhookEvent (idempotente para banco novo ou existente)
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

-- 7. Adicionar colunas financeiras da Etapa 9 em Payment (aditivas e idempotentes no MariaDB 11.8)
ALTER TABLE `Payment`
  ADD COLUMN IF NOT EXISTS `paymentType` VARCHAR(50) NOT NULL DEFAULT 'DEPOSIT',
  ADD COLUMN IF NOT EXISTS `feeCents` INT NULL,
  ADD COLUMN IF NOT EXISTS `netAmountCents` INT NULL,
  ADD COLUMN IF NOT EXISTS `refundedAmountCents` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `reconciliationStatus` VARCHAR(60) NOT NULL DEFAULT 'RECONCILED';
