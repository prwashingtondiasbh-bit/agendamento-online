-- =====================================================================================
-- MIGRAÇÃO D: ÍNDICES DE PERFORMANCE JUSTIFICADOS
-- STATUS: PREPARADA PARA REVISÃO — NÃO EXECUTADA NO BANCO REMOTO NESTA ETAPA
-- =====================================================================================

SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ENGINE_SUBSTITUTION');

-- 1. Índice composto para verificação de colisão de horário por profissional (SELECT ... FOR UPDATE em Appointment)
CREATE INDEX IF NOT EXISTS `idx_appointment_prof_datetime`
  ON `Appointment` (`professionalId`, `dateTime`, `endDateTime`);

-- 2. Índice composto para listagem cronológica de agendamentos por estabelecimento
CREATE INDEX IF NOT EXISTS `idx_appointment_tenant_datetime`
  ON `Appointment` (`tenantId`, `dateTime`);

-- 3. Índice para busca rápida e prevenção de duplicidade de cliente por telefone no tenant
CREATE INDEX IF NOT EXISTS `Client_tenantId_phone_idx`
  ON `Client` (`tenantId`, `phone`);

-- 4. Índice para reconciliação de mensagens WhatsApp e busca por telefone normalizado E.164
CREATE INDEX IF NOT EXISTS `Client_tenantId_normalizedPhone_idx`
  ON `Client` (`tenantId`, `normalizedPhone`);
