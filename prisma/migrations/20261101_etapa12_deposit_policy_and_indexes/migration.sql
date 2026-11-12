-- =====================================================================================
-- Migration: 20261101_etapa12_deposit_policy_and_indexes
-- Description: Etapa 12 - Configuração de Política de Sinal (Tenant.requireDeposit) e Índices de Performance
-- =====================================================================================

SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ENGINE_SUBSTITUTION');

ALTER TABLE `Tenant`
  ADD COLUMN IF NOT EXISTS `requireDeposit` BOOLEAN NOT NULL DEFAULT TRUE AFTER `closeTime`;

CREATE INDEX IF NOT EXISTS `idx_appointment_prof_datetime`
  ON `Appointment` (`professionalId`, `dateTime`, `endDateTime`);

CREATE INDEX IF NOT EXISTS `idx_appointment_tenant_datetime`
  ON `Appointment` (`tenantId`, `dateTime`);

CREATE INDEX IF NOT EXISTS `Client_tenantId_phone_idx`
  ON `Client` (`tenantId`, `phone`);

CREATE INDEX IF NOT EXISTS `Client_tenantId_normalizedPhone_idx`
  ON `Client` (`tenantId`, `normalizedPhone`);
