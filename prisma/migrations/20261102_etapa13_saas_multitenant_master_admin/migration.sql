-- =====================================================================================
-- Migration: 20261102_etapa13_saas_multitenant_master_admin
-- Description: Etapa 13 - Arquitetura Multiempresa SaaS, Área do Cliente Unificada,
--              Planos Comerciais (SIMPLE/COMPLETE), Controle de Assinatura, Inadimplência
--              e Painel Master Admin
-- =====================================================================================

SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ENGINE_SUBSTITUTION');

-- 1. Campos de perfil público e status operacional em Tenant
ALTER TABLE `Tenant`
  ADD COLUMN IF NOT EXISTS `description` TEXT NULL AFTER `slug`,
  ADD COLUMN IF NOT EXISTS `logoUrl` VARCHAR(500) NULL AFTER `description`,
  ADD COLUMN IF NOT EXISTS `status` ENUM('ACTIVE', 'BLOCKED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE' AFTER `closeTime`,
  ADD COLUMN IF NOT EXISTS `isPublished` BOOLEAN NOT NULL DEFAULT TRUE AFTER `status`,
  ADD COLUMN IF NOT EXISTS `blockedReason` TEXT NULL AFTER `isPublished`,
  ADD COLUMN IF NOT EXISTS `blockedAt` DATETIME(3) NULL AFTER `blockedReason`,
  ADD COLUMN IF NOT EXISTS `blockedBy` VARCHAR(36) NULL AFTER `blockedAt`,
  ADD COLUMN IF NOT EXISTS `cancelledAt` DATETIME(3) NULL AFTER `blockedBy`,
  ADD COLUMN IF NOT EXISTS `cancelledReason` TEXT NULL AFTER `cancelledAt`;

CREATE INDEX IF NOT EXISTS `Tenant_status_isPublished_idx`
  ON `Tenant` (`status`, `isPublished`);

-- 2. Campos globais de conta em User
ALTER TABLE `User`
  ADD COLUMN IF NOT EXISTS `phone` VARCHAR(30) NULL AFTER `email`,
  ADD COLUMN IF NOT EXISTS `isMasterAdmin` BOOLEAN NOT NULL DEFAULT FALSE AFTER `resetExpires`;

-- 3. Vínculo global User <-> Client por estabelecimento (sem fundir registros privados entre empresas)
ALTER TABLE `Client`
  ADD COLUMN IF NOT EXISTS `userId` VARCHAR(36) NULL AFTER `tenantId`;

CREATE INDEX IF NOT EXISTS `Client_userId_idx`
  ON `Client` (`userId`);

CREATE INDEX IF NOT EXISTS `Client_tenantId_userId_idx`
  ON `Client` (`tenantId`, `userId`);

-- 4. Expansão segura dos ENUMs e colunas de Subscription para Planos Comerciais e Inadimplência
ALTER TABLE `Subscription`
  MODIFY COLUMN `plan` ENUM('SIMPLE', 'COMPLETE', 'FREE', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'COMPLETE',
  MODIFY COLUMN `status` ENUM('ACTIVE', 'PENDING_PAYMENT', 'PAST_DUE', 'SUSPENDED', 'BLOCKED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS `contractedPriceCents` INT NOT NULL DEFAULT 9990 AFTER `status`,
  ADD COLUMN IF NOT EXISTS `billingCycle` VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' AFTER `contractedPriceCents`,
  ADD COLUMN IF NOT EXISTS `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `billingCycle`,
  ADD COLUMN IF NOT EXISTS `nextBillingAt` DATETIME(3) NULL AFTER `expiresAt`,
  ADD COLUMN IF NOT EXISTS `cancelledAt` DATETIME(3) NULL AFTER `nextBillingAt`,
  ADD COLUMN IF NOT EXISTS `statusReason` TEXT NULL AFTER `cancelledAt`,
  ADD COLUMN IF NOT EXISTS `updatedBy` VARCHAR(36) NULL AFTER `statusReason`,
  ADD COLUMN IF NOT EXISTS `externalProviderRef` VARCHAR(191) NULL AFTER `updatedBy`,
  ADD COLUMN IF NOT EXISTS `history` JSON NULL AFTER `externalProviderRef`;

CREATE INDEX IF NOT EXISTS `Subscription_status_nextBillingAt_idx`
  ON `Subscription` (`status`, `nextBillingAt`);

-- 5. Catálogo de Planos Comerciais Configuráveis (SaaSPlanCatalog)
CREATE TABLE IF NOT EXISTS `SaaSPlanCatalog` (
  `id` VARCHAR(36) NOT NULL,
  `code` ENUM('SIMPLE', 'COMPLETE', 'FREE', 'PRO', 'ENTERPRISE') NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `defaultPriceCents` INT NOT NULL,
  `allowDeposit` BOOLEAN NOT NULL DEFAULT FALSE,
  `features` JSON NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `updatedBy` VARCHAR(36) NULL,
  `priceHistory` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SaaSPlanCatalog_code_key` (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. Cobranças de Assinatura SaaS das Empresas (Separadas dos Sinais Pix de Agendamentos)
CREATE TABLE IF NOT EXISTS `SaaSInvoice` (
  `id` VARCHAR(36) NOT NULL,
  `tenantId` VARCHAR(36) NOT NULL,
  `subscriptionId` VARCHAR(36) NOT NULL,
  `plan` ENUM('SIMPLE', 'COMPLETE', 'FREE', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'COMPLETE',
  `amountCents` INT NOT NULL,
  `dueDate` DATETIME(3) NOT NULL,
  `paidAt` DATETIME(3) NULL,
  `status` ENUM('PENDING', 'PAID', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `paymentMethod` VARCHAR(50) NULL,
  `externalReference` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `createdBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `SaaSInvoice_tenantId_status_dueDate_idx` (`tenantId`, `status`, `dueDate`),
  INDEX `SaaSInvoice_subscriptionId_idx` (`subscriptionId`),
  CONSTRAINT `SaaSInvoice_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `SaaSInvoice_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
