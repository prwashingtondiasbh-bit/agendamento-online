# Agenda Beauty | SaaS de Agendamento para Manicures e Nail Designers

Sistema profissional de gestão e agendamento desenvolvido sob medida para manicures, nail designers e estúdios de beleza.

---

## 🚀 Tecnologias Utilizadas

- **Frontend**: React, TypeScript, Vite e Tailwind CSS.
- **Backend**: Node.js, Express e TypeScript (`/api/v1`).
- **Banco de Dados**: MySQL (compatível com Hostinger).
- **ORM**: Prisma ORM com migrations.
- **Validação**: Zod.
- **Localização**: Português brasileiro (pt-BR), Moeda Real (BRL), Fuso Horário `America/Sao_Paulo`.

---

## 📂 Estrutura do Projeto

```
├── prisma/
│   └── schema.prisma          # Esquema do banco de dados MySQL
├── src/
│   ├── components/            # Componentes React (Dashboard, Agenda, Clientes, etc.)
│   ├── server/                # API Express, rotas, validações e serviços
│   │   ├── routes/            # Endpoints da API (/api/v1/health, business, appointments, etc.)
│   │   ├── validation/        # Schemas Zod
│   │   ├── middleware/        # Tratamento de erros
│   │   └── storage.ts         # Camada de persistência (Prisma + fallback seguro)
│   ├── types/                 # Definições TypeScript
│   ├── App.tsx                # Componente principal do Frontend
│   └── main.tsx               # Ponto de entrada React
├── server.ts                  # Servidor HTTP Node.js com Express e middleware Vite
├── package.json               # Dependências e scripts
└── .env.example               # Exemplo de variáveis de ambiente
```

---

## ⚙️ Instalação e Execução Local

### 1. Pré-requisitos
- Node.js (versão 18 ou superior)
- Servidor MySQL (compatível com Hostinger ou local)

### 2. Configuração do Ambiente
Copie o arquivo `.env.example` para `.env` e preencha a URL de conexão do MySQL:
```bash
cp .env.example .env
```

Exemplo da string de conexão do MySQL:
```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/agenda_beauty"
PORT=3000
DEFAULT_TIMEZONE="America/Sao_Paulo"
```

### 3. Instalação de Dependências
```bash
npm install
```

### 4. Executar Migrations do Prisma
```bash
npx prisma migrate dev --name init
```

### 5. Executar em Modo de Desenvolvimento
```bash
npm run dev
```
O aplicativo estará disponível em `http://localhost:3000`.

### 6. Executar Testes do Backend
```bash
npm test
```

### 7. Build e Publicação em Produção (Hostinger)

#### Comandos de Build e Inicialização
```bash
# 1. Validar schema e gerar Prisma Client
npm run prisma:validate
npm run prisma:generate

# 2. Verificar status / aplicar migrations pendentes no MySQL de produção
npm run prisma:status
npm run prisma:deploy

# 3. Gerar o build completo (Frontend em dist/ + Backend em server.js)
npm run build

# 4. Iniciar o servidor de produção (Node.js servindo API + Frontend estático)
npm start
# (equivalente a: NODE_ENV=production DB_STRICT_MODE=true node server.js)
```

#### Variáveis de Ambiente Obrigatórias e Recomendadas em Produção (`.env`)
Configure no painel da Hostinger (ou arquivo `.env` no servidor, nunca versionado no Git):
- `DATABASE_URL`: String de conexão MySQL (`mysql://usuario:senha@host:3306/banco`).
- `NODE_ENV`: `"production"`
- `DB_STRICT_MODE`: `"true"` (garante persistência exclusiva no MySQL e proíbe fallback para memória).
- `PORT`: Porta atribuída pela hospedagem (padrão `3000`).
- `SESSION_SECRET`: Chave secreta forte (mínimo 32 caracteres aleatórios) para assinatura de sessões/tokens.
- `APP_BASE_URL` / `API_BASE_URL`: URL pública HTTPS do domínio (ex.: `https://seudominio.com.br`).
- `CORS_ALLOWED_ORIGINS`: Domínio(s) público(s) autorizado(s) separados por vírgula.
- `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_ENVIRONMENT`: Credenciais de produção do Mercado Pago para cobrança Pix.
- `WHATSAPP_CONFIG_ENCRYPTION_KEY`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`: Chaves de segurança para integração com a Meta WhatsApp Cloud API.

---

## 🔄 Etapa 7 — Sistema de Cancelamento, Reagendamento e Reembolso

### 1. Configuração da Política pelo Proprietário
- No painel administrativo (**Configurações > Política de cancelamento e reembolso**), cada estabelecimento (`tenant_id`) define seu prazo mínimo de antecedência em horas:
  - Opções rápidas: **3h**, **6h (padrão inicial)**, **12h**, **24h**, **48h** ou **prazo personalizado** (1 a 720 horas / 30 dias).
  - Permite habilitar/desabilitar reagendamento pelo portal da cliente (`allowCustomerReschedule`) e análise manual fora do prazo (`allowManualReviewOutOfPeriod`).
  - Inclui texto explicativo da política, instruções de contato e prévia em tempo real para o agendamento.

### 2. Preservação Histórica da Política por Reserva
- Ao criar um agendamento, o sistema grava um snapshot imutável na reserva (`snapshotCancellationHours`, `snapshotPolicyText`, `snapshotPolicyVersion`, `policyAcceptedAt`).
- Alterações futuras feitas pelo proprietário incrementam `policyVersion`, mas **não** alteram retroativamente reservas já criadas.
- **Compatibilidade com reservas antigas**: caso um agendamento legado não possua `snapshotCancellationHours` gravado, o backend utiliza o prazo vigente do estabelecimento como referência operacional e encaminha solicitações com pagamento para revisão manual, sem inventar retroativamente `policyAcceptedAt`.

### 3. Cálculo de Prazo e Fuso Horário
- O cálculo é executado exclusivamente no backend: `prazoLimiteUTC = appointment.dateTime - snapshotCancellationHours`.
- A comparação utiliza o instante UTC real do servidor e formata a exibição no fuso horário configurado pelo estabelecimento (`America/Sao_Paulo`, `America/Manaus`, `America/Belem`).

### 4. Estados Separados e Controlados
- **Agendamento (`AppointmentStatus`)**: `PENDING_PAYMENT`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `EXPIRED`.
- **Solicitação de Cancelamento (`CancellationRequestStatus`)**: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`.
- **Solicitação de Reembolso (`RefundRequestStatus`)**: `NOT_REQUESTED`, `PENDING_REVIEW`, `APPROVED`, `PROCESSING`, `COMPLETED`, `FAILED`, `REJECTED`.

### 5. Execução Segura de Reembolso e Idempotência
- O valor elegível a reembolso é calculado no servidor a partir dos pagamentos `APPROVED` da reserva (`paidDepositCents - refundedAmountCents`), nunca incluindo o saldo restante nem aceitando valores enviados pelo frontend.
- Chamadas ao Mercado Pago (`/v1/payments/{id}/refunds`) utilizam chave de idempotência (`X-Idempotency-Key`) e trava de concorrência em memória/banco:
  - Resposta aprovada do provedor -> `RefundRequest = COMPLETED`, `Payment = REFUNDED`.
  - Erro explícito do provedor -> `RefundRequest = FAILED` (permite retentativa administrativa controlada).
  - Timeout / resultado desconhecido -> `RefundRequest = PROCESSING` (bloqueia reexecução cega até reconciliação ou webhook `REFUNDED`).


---

## 🏢 Etapa 8 — Painel do Proprietário, CRM e Agendamentos Manuais

### 1. Navegação Administrativa e Permissões por Perfil (RBAC)
- Menu lateral responsivo (computadores, tablets e celulares) contendo: **Visão geral**, **Agenda**, **Clientes**, **Serviços**, **Profissionais**, **Solicitações de cancelamento**, **Pagamentos Pix**, **Configurações do estabelecimento** e **Sair**.
- Controle de acesso no backend (`src/server/middleware/auth.ts`):
  - `OWNER` (Proprietário): acesso total às configurações, serviços, profissionais, cancelamentos, CRM e agenda.
  - `MANAGER` (Administrador): gestão operacional de agenda, clientes, serviços, profissionais, bloqueios e cancelamentos.
  - `RECEPTIONIST` (Recepção): agenda, agendamentos manuais, bloqueios e cadastro/gestão de clientes.
  - `PROFESSIONAL` (Profissional): acesso restrito à própria agenda, aos próprios atendimentos e aos dados essenciais da cliente (sem acesso às anotações administrativas restritas ou configurações de outras profissionais).
  - `CUSTOMER` (Cliente): bloqueada (`403 Forbidden`) em todas as rotas administrativas.

### 2. Dashboard Operacional (`GET /api/v1/dashboard/stats`)
- Exibe métricas operacionais reais do estabelecimento: agendamentos de hoje, próximos atendimentos, atendimentos concluídos, cancelamentos, faltas registradas (`NO_SHOW`), horários disponíveis hoje, novas clientes vs. recorrentes e alerta de solicitações de cancelamento pendentes.
- Inclui indicadores e fórmulas explícitas de **Taxa de Ocupação** (minutos agendados hoje ÷ minutos de expediente disponíveis descontando intervalos e bloqueios) e **Taxa de Cancelamento**.

### 3. Agenda Profissional, Agendamentos Manuais e Bloqueios (`TimeBlock`)
- Visualizações **Diária**, **Semanal** e **Mensal** com navegação entre datas, botão **Hoje** e filtros combinados por profissional, serviço e status.
- **Agendamentos Manuais (`POST /api/v1/appointments`)**: permite registrar reservas recebidas via `WHATSAPP`, `PRESENCIAL`, `TELEFONE`, `INSTAGRAM` ou `OUTRO`, com busca ou cadastro rápido de cliente (prevenindo duplicidade por telefone no mesmo `tenant_id`) e sugestão automática de horários livres (`suggestedSlots`) em caso de conflito.
- **Bloqueios de Agenda (`POST /api/v1/appointments/time-blocks`)**: suporta `INTERVAL`, `LUNCH`, `DAY_OFF`, `VACATION`, `PERSONAL` e `EXCEPTION`. Detecta conflitos com reservas ativas antes de salvar (`409` com lista `conflicts`) e nunca cancela agendamentos existentes automaticamente.
- **Ações sobre Agendamentos (`PATCH /api/v1/appointments/:id/status` e `PUT /api/v1/appointments/:id`)**: iniciar atendimento (`IN_PROGRESS`), concluir (`COMPLETED`), registrar falta (`NO_SHOW`), reagendar ou trocar profissional com validação de conflitos e log de auditoria, bloqueando qualquer aprovação manual de pagamento sem conciliação.

### 4. CRM de Clientes (`GET /api/v1/clients` e `GET /api/v1/clients/:id/profile`)
- Busca por nome, telefone ou e-mail, filtro por **Novas** vs. **Recorrentes**, filtro por **Etiqueta (Tag)** e paginação no backend.
- **Ficha Detalhada da Cliente**: histórico completo de agendamentos, gestão de etiquetas (`PUT /api/v1/clients/:id/tags`), anotações internas protegidas com autor e data (`POST /api/v1/clients/:id/notes`), preferências de atendimento, consentimento de comunicação e cálculo financeiro conciliado (**Total Pago Real** somando exclusivamente pagamentos `APPROVED` líquidos de reembolsos, sem duplicar sinal e saldo).

---

## Etapa 9 — Módulo Financeiro Completo, Controle de Caixa, Despesas, Comissões e Relatórios

### 1. Regras Financeiras e Fórmulas dos Indicadores
- **Armazenamento Monetário**: Todos os valores monetários são armazenados e calculados em **centavos inteiros (`Int`)** no servidor.
- **Recebimentos Confirmados**: Soma dos pagamentos com `status = 'APPROVED'` (pela data de confirmação `approvedAt`) mais ajustes manuais de entrada confirmados no período. Pagamentos pendentes, criados, recusados ou expirados nunca entram.
- **Regra Anti-Duplicidade (Sinal e Saldo)**: Quando um serviço custa R$ 100,00 (sinal R$ 30,00 + saldo R$ 70,00), o pagamento do sinal soma R$ 30,00 em Recebimentos Confirmados e mantém R$ 70,00 em **Contas a Receber**. Ao receber os R$ 70,00 de saldo, Recebimentos Confirmados passa a R$ 100,00 e Contas a Receber passa a R$ 0,00 — nunca somando o valor total do serviço sobre sinal + saldo.
- **Despesas Pagas vs. Pendentes**: Despesas cadastradas como `PENDING` entram em **Contas a Pagar** e só passam a **Despesas Pagas** (e geram saída no Livro de Caixa) após confirmação explícita (`POST /api/v1/financial/expenses/:id/pay`).
- **Reembolsos**: Somente reembolsos com `status = 'COMPLETED'` abatem a receita líquida e geram saída no caixa. Nenhum reembolso pode superar o valor líquido efetivamente recebido.
- **Resultado Financeiro Estimado (Gerencial)**:
  `Recebimentos Confirmados − Reembolsos Concluídos − Despesas Pagas − Taxas Financeiras Confirmadas`.
- **Ticket Médio (Competência de Serviços Concluídos)**:
  `Valor total contratado (snapshotPriceCents) dos atendimentos COMPLETED no período ÷ Quantidade de atendimentos COMPLETED no período`.

### 2. Comissões de Profissionais
- **Prioridade de Regras (`CommissionRule`)**:
  1. Regra específica por **Profissional + Serviço** (`PROFESSIONAL_SERVICE`)
  2. Regra por **Serviço** (`SERVICE`)
  3. Regra por **Profissional** (`PROFESSIONAL`)
- Caso nenhuma regra esteja configurada, o sistema define `NO_RULE_CONFIGURED` (`0%`) e **nunca inventa percentual padrão**.
- Cada agendamento possui vínculo único (`@@unique([tenantId, appointmentId])`), garantindo que o pagamento separado de sinal e saldo jamais duplique a comissão.

### 3. Como Executar os Testes Automatizados
```bash
# Executar apenas a suíte de 22 testes da Etapa 9:
npx tsx src/server/tests/etapa9.test.ts

# Executar apenas a suíte de 22 testes da Etapa 10 (WhatsApp Business):
npx tsx src/server/tests/etapa10.test.ts

# Executar todas as 10 suítes completas do backend:
npx tsx src/server/tests/runAll.ts
```

---

## Etapa 10 — Integração Oficial com WhatsApp Business (Meta Cloud API)

### 1. Provedor Oficial e Arquitetura (`WhatsAppProvider` & `MetaWhatsAppCloudProvider`)
- **API Oficial**: Integração com a **Meta WhatsApp Business Cloud API** (`https://graph.facebook.com/v20.0/{phone_number_id}/messages`).
- **Sem Simulação**: Quando as credenciais externas (`phoneNumberId` e `accessToken`) não estão configuradas ou validadas, o sistema mantém o status em `PENDING_CREDENTIALS` e **não simula** o envio real.
- **Segurança de Credenciais**: O `accessToken` e o `appSecret` são criptografados com **AES-256-GCM** no backend (`WHATSAPP_CONFIG_ENCRYPTION_KEY`) e **nunca** são retornados nas respostas de API ou expostos no navegador.

### 2. Consentimento de Comunicação e Padronização E.164
- **Padronização E.164**: Números de telefone são validados e convertidos para o padrão internacional (`+5511999999999`).
- **Separação Estrita de Consentimento**:
  - **Mensagens Operacionais** (`APPOINTMENT_CONFIRMATION`, `APPOINTMENT_REMINDER`, `APPOINTMENT_RESCHEDULED`, `CANCELLATION_CONFIRMED`, `CANCELLATION_REQUEST_UPDATED`, `PAYMENT_UPDATED`, `REFUND_UPDATED`, `MANUAL_OPERATIONAL`): permitidas conforme a preferência operacional da cliente (`whatsappOptIn`).
  - **Mensagens Promocionais** (`PROMOTIONAL_CAMPAIGN`): exigem consentimento promocional explícito (`promotionalConsent = true`), com registro de data (`promotionalConsentAt`), origem (`promotionalConsentSource`) e revogação imediata (`promotionalConsentRevokedAt`). O simples fornecimento do telefone **nunca** concede opt-in promocional automático.

### 3. Fila Persistente, Lembretes Automáticos e Webhooks Oficiais
- **Diferenciação de Status**:
  - `PENDING` / `PROCESSING`: na fila do Agenda Beauty.
  - `SENT`: aceita pela Graph API da Meta (`wamid` gerado).
  - `DELIVERED`: entrega confirmada no aparelho da cliente via webhook oficial.
  - `READ`: leitura confirmada via webhook oficial.
  - `FAILED`: falha temporária (com backoff progressivo em `nextAttemptAt`) ou falha permanente (`isPermanentError = true`, sem repetição infinita).
  - `CANCELLED`: cancelada antes do envio (ex.: agendamento desmarcado).
- **Proteção Fora de Ordem e Idempotência**: Eventos de webhook duplicados são ignorados (`providerEventId`) e mensagens já `DELIVERED` ou `READ` nunca retrocedem para `SENT`.
- **Webhooks**:
  - `GET /api/v1/webhooks/whatsapp`: verificação oficial de desafio (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`).
  - `POST /api/v1/webhooks/whatsapp`: validação criptográfica HMAC-SHA256 via cabeçalho `X-Hub-Signature-256` e isolamento multiempresa por `phoneNumberId` / `wabaId`.

---

## Etapa 11 — Recursos Avançados (Lista de Espera, Fidelidade, Cupons, Pacotes, Cartões-Presente, Avaliações, Campanhas, Estoque e Multiunidade)

### 1. Módulos Implementados e Regras de Negócio
1. **Lista de Espera Inteligente (`WaitlistEntry`, `WaitlistOffer`)**:
   - Clientes e recepção podem registrar interesse em serviço, profissional, data e período (`MORNING`, `AFTERNOON`, `NIGHT`, `ANY`).
   - Quando surge uma vaga compatível, o sistema permite ofertar o horário com prazo de expiração (`expiresAt`) e trava atômica de concorrência (`withAtomicLock`), garantindo que duas clientes nunca ocupem simultaneamente a mesma vaga e que ofertas expiradas ou inscrições canceladas sejam rejeitadas.
2. **Programa de Fidelidade (`LoyaltyProgram`, `LoyaltyReward`, `LoyaltyLedger`)**:
   - Pontos são creditados **exclusivamente** a partir de pagamentos com `status = 'APPROVED'`, com chave de idempotência por `paymentId` (evitando duplicidade em reprocessamentos ou entre sinal e saldo).
   - Reembolsos aplicam reversão proporcional ou integral configurada no programa, e clientes possuem bloqueio `403 Forbidden` contra alteração manual do próprio saldo.
3. **Cupons e Promoções (`Coupon`, `CouponRedemption`)**:
   - Suporte a percentual (`PERCENTAGE`) ou valor fixo em centavos (`FIXED_CENTS`), valor mínimo, validade, restrição de primeira compra, serviços, profissionais e clientes.
   - Cálculo executado exclusivamente no backend e controle de concorrência por reserva (`RESERVED` -> `CONSUMED` ou `RELEASED` se o agendamento/pagamento falhar ou for cancelado).
4. **Pacotes de Serviços (`ServicePackage`, `CustomerPackage`, `PackageUsageLedger`)**:
   - Pacotes só ficam `ACTIVE` após confirmação do pagamento (`PENDING_PAYMENT` caso contrário).
   - O consumo de créditos possui trava atômica e chave de idempotência para impedir que duas requisições simultâneas consumam o último crédito duas vezes e sem duplicar a receita financeira já reconhecida na venda do pacote.
5. **Cartões-Presente (`GiftCard`, `GiftCardTransaction`)**:
   - Código criptográfico único (`GC-XXXX-XXXX-XXXX`), abate parcial ou total com trava de concorrência, bloqueio administrativo com justificativa obrigatória e consulta pública segura para a presenteada sem expor dados pessoais do comprador.
6. **Avaliações e Feedback (`ServiceReview`)**:
   - Restritas a atendimentos `COMPLETED` da própria cliente (1 avaliação única por `appointmentId`, nota de 1 a 5). O proprietário pode responder e moderar a visibilidade com justificativa sem jamais alterar a nota ou o comentário original da cliente.
7. **Campanhas Promocionais (`MarketingCampaign`, `CampaignRecipient`)**:
   - Segmentação por opt-in promocional, inatividade, serviço utilizado ou pacote próximo do fim.
   - Separa estritamente clientes com consentimento promocional ativo (`promotionalConsent = true`) das clientes bloqueadas sem consentimento, exige confirmação explícita antes do disparo via fila oficial do WhatsApp (Etapa 10) e impede envios duplicados por `(campaignId, clientId)`.
8. **Estoque Básico de Produtos (`InventoryProduct`, `InventoryMovement`)**:
   - Controle de insumos/revenda com alerta de estoque mínimo e esgotado, movimentações auditadas com responsável e justificativa obrigatória e proteção idempotente contra baixa duplicada.
9. **Estrutura Multiunidade (`BusinessLocation`)**:
   - Cria automaticamente a **Unidade Matriz** para estabelecimentos com uma única sede e valida na criação do agendamento se o serviço e a profissional selecionados atendem na unidade (`locationId`) escolhida.

### 2. Como Executar os Testes da Etapa 11
```bash
# Executar apenas a suíte de 25 testes da Etapa 11:
npx tsx src/server/tests/etapa11.test.ts

# Executar todas as 11 suítes completas do backend:
npx tsx src/server/tests/runAll.ts
```

