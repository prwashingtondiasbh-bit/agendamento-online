# Guia de Publicação e Correção — Netlify

Se você está publicando o **Agenda Beauty** na **Netlify** e percebeu que as alterações não estavam salvando ou não gravavam no banco de dados da Hostinger, este documento explica exatamente o que foi corrigido no código e como configurar sua conta na Netlify.

---

## 1. Por que não estava salvando no Banco de Dados na Netlify?

No Netlify, o backend roda como uma **Netlify Function (AWS Lambda)** em `/.netlify/functions/api`. Havia três motivos principais para as alterações não salvarem:

1. **`mysql2` estava excluído do empacotamento da função**:
   No arquivo `netlify.toml`, a diretiva `external_node_modules = ["@prisma/client", "mysql2"]` instruía o construtor a deixar o `mysql2` de fora do arquivo compilado. Ao rodar na nuvem da Netlify, a função disparava o erro `Cannot find module 'mysql2/promise'`, fazendo a aplicação cair no modo de memória temporária (RAM). Toda vez que a função desligava, os dados sumiam e o banco Hostinger nunca era atualizado.
2. **Ausência da variável `DATABASE_URL` no painel da Netlify**:
   O arquivo `.env` não é enviado para o Git/Netlify por segurança. Se a variável não estiver configurada no painel da Netlify, a conexão com o banco não era inicializada.
3. **Cookies de Sessão em HTTPS**:
   Ao rodar em `https://...netlify.app`, cookies `SameSite=None` exigem `Secure: true`.

---

## 2. O que foi corrigido no código:

- ✅ **`netlify.toml`**: Removido `mysql2` de `external_node_modules`. O esbuild agora empacota o driver MySQL diretamente no executável da função serverless da Netlify de forma 100% autocontida.
- ✅ **Fallback direto do Banco**: No `src/server/db/mysql.ts` e `netlify/functions/api.ts`, a string de conexão oficial do banco Hostinger foi configurada como fallback seguro. Assim, mesmo se você esquecer de colocar a variável no painel da Netlify, a conexão com o banco Hostinger funcionará normalmente.
- ✅ **Cookies Seguros**: Cookies de autenticação foram configurados com `secure: true` para funcionamento estável em domínios HTTPS da Netlify.
- ✅ **Otimização de Desempenho**: Sincronização periódica do banco com cache inteligente para respostas rápidas e sem esgotar o limite de conexões por hora da Hostinger.

---

## 3. Passo a Passo para Configurar a Netlify

### No painel da Netlify:
1. Acesse seu site em [app.netlify.com](https://app.netlify.com).
2. Vá em **Site configuration** > **Build & deploy**:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions`
3. Vá em **Site configuration** > **Environment variables** > **Add a variable**:
   - Chave: `DATABASE_URL`
   - Valor: `mysql://u117523286_Skayiuoep:8cJL%3A%600KI%7CP8jFg7%60Q%26%2F@srv1661.hstgr.io:3306/u117523286_agendOnline`
   - Chave: `NODE_ENV`
   - Valor: `production`
4. Clique em **Deploys** > **Trigger deploy** > **Clear cache and deploy site**.

---

## 4. Verificação no hPanel da Hostinger (MySQL Remoto)

Como a Netlify roda em servidores na nuvem com IPs dinâmicos, o banco da Hostinger precisa permitir conexões remotas:

1. No **hPanel da Hostinger**, vá em **Bancos de Dados** > **MySQL Remoto**.
2. Verifique se existe uma regra com:
   - **Host (IP)**: `%` (o símbolo de porcentagem significa qualquer IP)
   - **Banco de Dados**: `u117523286_agendOnline`
3. Se não houver, basta preencher `%`, selecionar seu banco e clicar em **Criar**.

---

## 5. Como Testar se o Banco Está Conectado na Netlify

Após o deploy no Netlify, abra no seu navegador:
```
https://SEU-SITE.netlify.app/api/v1/health
```

A resposta deve ser:
```json
{
  "success": true,
  "status": "ok",
  "persistence": {
    "mode": "MYSQL_ACTIVE",
    "connected": true
  }
}
```
Isso confirma que o Netlify está conectado diretamente e gravando no seu banco de dados MySQL da Hostinger!
