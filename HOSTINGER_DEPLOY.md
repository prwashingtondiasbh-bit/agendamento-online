# Guia de Publicação — Hostinger (Plano Business Web Hosting)

O **Agenda Beauty** já está compilado, otimizado (Gzip, Cache Imutável de Assets, Code-Splitting, Headers de Segurança OWASP e SEO Dinâmico com Sitemap/JSON-LD) e pronto para subir no plano **Business Web Hosting** da Hostinger.

---

## 1. Banco de Dados MySQL na Hostinger

1. No **hPanel da Hostinger**, acesse **Bancos de Dados > Gerenciamento**.
2. Utilize o banco de dados MySQL já configurado (ou crie um novo banco e usuário MySQL).
3. Anote a string de conexão no formato:
   ```env
   DATABASE_URL="mysql://USUARIO:SENHA@localhost:3306/NOME_DO_BANCO"
   ```
   *(Dica: Quando o aplicativo roda dentro da própria hospedagem da Hostinger, o host do banco pode ser `localhost` ou o host remoto `srv1661.hstgr.io`).*

---

## 2. Configurando o Node.js no hPanel (Business Web Hosting)

1. Acesse o **hPanel > Websites > Gerenciar** (no seu domínio).
2. No menu lateral, clique em **Avançado > Node.js** (ou **Implantações / Node.js Web App**).
3. Configure os parâmetros da aplicação:
   - **Versão do Node.js**: `20.x` ou `22.x` (recomendado `20.x` ou superior)
   - **Modo da Aplicação**: `Production` (`production`)
   - **Raiz da Aplicação (Application Root)**: pasta onde você enviou os arquivos (ex.: `public_html` ou subpasta do app)
   - **Arquivo de Inicialização (Application Startup File)**: `server.js` (ou `app.js` — ambos já estão prontos na raiz do projeto)

---

## 3. Variáveis de Ambiente (`.env` na Hostinger)

Crie um arquivo `.env` na raiz do projeto no Gerenciador de Arquivos da Hostinger (ou adicione nas variáveis de ambiente do painel Node.js):

```env
NODE_ENV=production
PORT=3000
DB_STRICT_MODE=true
DATABASE_URL="mysql://u117523286_Skayiuoep:SUA_SENHA@localhost:3306/u117523286_agendOnline"

# URL pública oficial do seu domínio com HTTPS
APP_BASE_URL="https://seudominio.com.br"
API_BASE_URL="https://seudominio.com.br/api/v1"
CORS_ALLOWED_ORIGINS="https://seudominio.com.br,https://www.seudominio.com.br"

# Segredo de sessão
SESSION_SECRET="agenda-beauty-prod-secret-key-2026-segura"

# Credenciais do Mercado Pago (também configuráveis direto pelo Painel do Estabelecimento)
MP_ENVIRONMENT="production"
```

---

## 4. Comandos de Instalação e Build (via SSH ou Deploy Git)

Se estiver conectado via **SSH** no plano Business Web Hosting (ou pelo terminal de deploy):

```bash
# 1. Instalar dependências
npm install

# 2. Gerar build otimizado (Frontend em dist/ + Servidor em server.js)
npm run build

# 3. Iniciar ou reiniciar a aplicação
npm start
```

> **Envio direto via Gerenciador de Arquivos (ZIP)**:
> Como o comando `npm run build` já gera a pasta `dist/` e o arquivo `server.js` empacotado, você também pode subir o projeto já compilado, rodar `npm install --omit=dev` no painel Node.js da Hostinger e clicar em **Restart**.

---

## 5. URLs Principais do Sistema em Produção

- **Página Pública da Loja (Link das Clientes)**:
  `https://seudominio.com.br/agendar/agenda-beauty-sp`
- **Acesso do Estabelecimento (Lojista / Equipe)**:
  `https://seudominio.com.br/acesso-lojista`
- **Painel Secreto do Super Admin (Master Admin)**:
  `https://seudominio.com.br/super-admin-secreto`
- **Webhook Oficial do Mercado Pago**:
  `https://seudominio.com.br/api/v1/webhooks/mercadopago`
- **SEO & Indexação Automática**:
  - `https://seudominio.com.br/sitemap.xml`
  - `https://seudominio.com.br/robots.txt`
- **Monitoramento de Saúde do Servidor e MySQL**:
  - `https://seudominio.com.br/api/v1/health`
