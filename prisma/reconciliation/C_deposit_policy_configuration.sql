-- =====================================================================================
-- MIGRAÇÃO C: CONFIGURAÇÃO DA POLÍTICA DE SINAL POR ESTABELECIMENTO (Tenant.requireDeposit)
-- STATUS: PREPARADA PARA REVISÃO — NÃO EXECUTADA NO BANCO REMOTO NESTA ETAPA
-- =====================================================================================

SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES', 'ERROR_FOR_DIVISION_BY_ZERO', 'NO_ENGINE_SUBSTITUTION');

-- 1. Adicionar configuração por Tenant para exigir ou dispensar sinal na confirmação
--    Valor padrão: TRUE (mantém compatibilidade com estabelecimentos que já operam com sinal Pix)
ALTER TABLE `Tenant`
  ADD COLUMN IF NOT EXISTS `requireDeposit` BOOLEAN NOT NULL DEFAULT TRUE AFTER `closeTime`;
