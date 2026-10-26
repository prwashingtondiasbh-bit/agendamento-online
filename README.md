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

### 7. Build para Produção (Hospedagem Hostinger / VPS)
```bash
npm run build
npm start
```
