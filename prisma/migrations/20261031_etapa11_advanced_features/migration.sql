-- Migration: 20261031_etapa11_advanced_features
-- Description: Etapa 11 - Recursos Avançados reconciliados com VARCHAR(36)

ALTER TABLE `Appointment`
  ADD COLUMN IF NOT EXISTS `locationId` VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS `couponCode` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `discountCents` INT NOT NULL DEFAULT 0;

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
  CONSTRAINT `BusinessLocation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `WaitlistEntry_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `WaitlistOffer_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `LoyaltyProgram_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `LoyaltyReward_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `LoyaltyLedger_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `Coupon_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `CouponRedemption_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `ServicePackage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `CustomerPackage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `PackageUsageLedger_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `GiftCard_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `GiftCardTransaction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `ServiceReview_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `MarketingCampaign_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `CampaignRecipient_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `InventoryProduct_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
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
  CONSTRAINT `InventoryMovement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
