import assert from 'assert';
import http from 'http';
import { createApp } from '../app.js';
import { paymentService } from '../payments/PaymentService.js';
import { resetAntiBotStateForTests } from '../middleware/antiBot.js';
import * as storage from '../storage.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function solveMathQuestion(question: string): string {
  const match = String(question || '').match(/(\d+)\s*\+\s*(\d+)/);
  if (!match) {
    throw new Error(`Formato de desafio anti-bot inesperado: ${question}`);
  }
  return String(Number(match[1]) + Number(match[2]));
}

async function runFullStoreLifecycleAndSecurityTests() {
  console.log('\n==========================================================================');
  console.log('🛡️  FLUXO COMPLETO E2E + SEGURANÇA ANTI-BOT E ISOLAMENTO ENTRE PAINÉIS');
  console.log('==========================================================================\n');

  resetAntiBotStateForTests();

  // Mock deterministic payment provider in memory (never calls real Mercado Pago HTTP in automated tests)
  const approvedProviderPaymentIds = new Set<string>();
  (paymentService as any).defaultProvider = {
    name: 'MERCADO_PAGO',
    async createPixPayment(input: any) {
      const id = `mp-e2e-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      return {
        providerPaymentId: id,
        status: 'PENDING',
        qrCode: `00020126580014BR.GOV.BCB.PIX0136${id}`,
        qrCodeBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        ticketUrl: `https://www.mercadopago.com.br/payments/${id}/ticket`,
        expiresAt: input.expiresAt,
        rawResponse: { id, status: 'pending' },
      };
    },
    async getPayment(providerPaymentId: string) {
      if (approvedProviderPaymentIds.has(providerPaymentId)) {
        return {
          providerPaymentId,
          status: 'APPROVED',
          approvedAt: new Date(),
          rawResponse: { id: providerPaymentId, status: 'approved' },
        };
      }
      return {
        providerPaymentId,
        status: 'PENDING',
        rawResponse: { id: providerPaymentId, status: 'pending' },
      };
    },
  };

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  const HUMAN_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  const jsonFetch = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', HUMAN_UA);
    }
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, headers: res.headers };
  };

  const fetchSolvedBotGuard = async (waitHumanDelay = true) => {
    const res = await jsonFetch('/auth/bot-challenge');
    assert.strictEqual(res.status, 200, 'GET /auth/bot-challenge deve retornar desafio assinado');
    assert.ok(res.body.data?.challengeToken, 'Deve retornar challengeToken');
    assert.ok(res.body.data?.question, 'Deve retornar pergunta matemática');
    if (waitHumanDelay) {
      await sleep(450); // Exceed MIN_HUMAN_SUBMIT_MS (400ms)
    }
    return {
      website: '',
      challengeToken: res.body.data.challengeToken,
      challengeAnswer: solveMathQuestion(res.body.data.question),
      formRenderedAt: Date.now() - (waitHumanDelay ? 500 : 10),
    };
  };

  try {
    const suffix = Date.now();

    // =========================================================================
    // FASE 1: TESTES DE SEGURANÇA ANTI-BOT EM TODOS OS PAINÉIS DE LOGIN/CADASTRO
    // =========================================================================
    console.log('🔒 FASE 1: Validando proteção Anti-Bot em cadastro, login e recuperação...');

    // 1.1 Honeypot trap triggered on Customer Register
    const hpRegRes = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bot Spam',
        email: `honeypot-${suffix}@gmail.com`,
        phone: '(11) 99999-0000',
        password: 'Password123!',
        website: 'https://spam-link.example',
      }),
    });
    assert.strictEqual(hpRegRes.status, 403, 'Honeypot preenchido no cadastro deve bloquear com 403');
    assert.strictEqual(hpRegRes.body.code, 'BOT_DETECTED');

    // 1.2 Honeypot trap triggered on Owner/Staff Login
    const hpLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'prwashingtondiasbh@gmail.com',
        password: '123456',
        portalType: 'SUPER_ADMIN',
        botGuard: { hpField: 'bot-filled-this' },
      }),
    });
    assert.strictEqual(hpLoginRes.status, 403, 'Honeypot preenchido no login deve bloquear com 403');
    assert.strictEqual(hpLoginRes.body.code, 'BOT_DETECTED');

    // 1.3 Fast automated submission (< 400ms) blocked when anti-bot strict enforcement is active
    const fastChallenge = await fetchSolvedBotGuard(false);
    const fastBotRes = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-enforce-antibot': 'true',
      },
      body: JSON.stringify({
        name: 'Bot Velocidade',
        email: `fastbot-${suffix}@gmail.com`,
        phone: '(11) 99999-0001',
        password: 'Password123!',
        botGuard: fastChallenge,
      }),
    });
    assert.strictEqual(fastBotRes.status, 403, 'Envio instantâneo (< 400ms) deve ser bloqueado como bot');
    assert.strictEqual(fastBotRes.body.code, 'BOT_TIMING_VIOLATION');

    // 1.4 Missing challenge, wrong challenge answer, tampered token, and replay attack blocked
    const missingChallengeRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: 'prwashingtondiasbh@gmail.com',
        password: '123456',
        portalType: 'SUPER_ADMIN',
      }),
    });
    assert.strictEqual(missingChallengeRes.status, 403);
    assert.strictEqual(missingChallengeRes.body.code, 'BOT_CHALLENGE_REQUIRED');

    const validGuardWrongAnswer = await fetchSolvedBotGuard(true);
    const wrongAnsRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: 'prwashingtondiasbh@gmail.com',
        password: '123456',
        portalType: 'SUPER_ADMIN',
        botGuard: { ...validGuardWrongAnswer, challengeAnswer: '999' },
      }),
    });
    assert.strictEqual(wrongAnsRes.status, 403);
    assert.strictEqual(wrongAnsRes.body.code, 'BOT_CHALLENGE_INCORRECT');

    const tamperedTokenRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: 'prwashingtondiasbh@gmail.com',
        password: '123456',
        portalType: 'SUPER_ADMIN',
        botGuard: {
          ...validGuardWrongAnswer,
          challengeToken: `${validGuardWrongAnswer.challengeToken.slice(0, -4)}ffff`,
        },
      }),
    });
    assert.strictEqual(tamperedTokenRes.status, 403);
    assert.strictEqual(tamperedTokenRes.body.code, 'BOT_CHALLENGE_TAMPERED');

    // 1.5 Disposable email and spam URL in name blocked
    const disposableGuard = await fetchSolvedBotGuard(true);
    const disposableRes = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        name: 'Usuario Descartavel',
        email: `bot-${suffix}@mailinator.com`,
        phone: '(11) 99999-0002',
        password: 'Password123!',
        botGuard: disposableGuard,
      }),
    });
    assert.strictEqual(disposableRes.status, 400);
    assert.strictEqual(disposableRes.body.code, 'DISPOSABLE_EMAIL_BLOCKED');

    const spamNameGuard = await fetchSolvedBotGuard(true);
    const spamNameRes = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        name: 'Promo Click https://evil-phish.com',
        email: `spamname-${suffix}@gmail.com`,
        phone: '(11) 99999-0003',
        password: 'Password123!',
        botGuard: spamNameGuard,
      }),
    });
    assert.strictEqual(spamNameRes.status, 400);
    assert.strictEqual(spamNameRes.body.code, 'INVALID_BOT_PAYLOAD');

    // 1.6 Suspicious automated User-Agent blocked
    const uaGuard = await fetchSolvedBotGuard(true);
    const botUaRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-enforce-antibot': 'true',
        'User-Agent': 'python-requests/2.31.0',
      },
      body: JSON.stringify({
        email: 'prwashingtondiasbh@gmail.com',
        password: '123456',
        portalType: 'SUPER_ADMIN',
        botGuard: uaGuard,
      }),
    });
    assert.strictEqual(botUaRes.status, 403);
    assert.strictEqual(botUaRes.body.code, 'BOT_USER_AGENT_BLOCKED');

    // 1.7 Replay of an already-consumed single-use challenge blocked
    const replayableGuard = await fetchSolvedBotGuard(true);
    const forgotFirst = await jsonFetch('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: `check-replay-${suffix}@gmail.com`,
        botGuard: replayableGuard,
      }),
    });
    assert.strictEqual(forgotFirst.status, 200);
    const forgotReplay = await jsonFetch('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: `check-replay-${suffix}@gmail.com`,
        botGuard: replayableGuard,
      }),
    });
    assert.strictEqual(forgotReplay.status, 403, 'Reutilização de desafio anti-bot consumido deve falhar');
    assert.strictEqual(forgotReplay.body.code, 'BOT_CHALLENGE_REPLAYED');

    // 1.7b Cloudflare Turnstile server-side siteverify enforcement (missing, invalid, valid, replay)
    const originalFetch = globalThis.fetch;
    const prevTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret-key';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
        const params = new URLSearchParams(String(init?.body || ''));
        const token = params.get('response');
        const secret = params.get('secret');
        const isOk = secret === 'test-turnstile-secret-key' && token === 'cf-turnstile-valid-token';
        return new Response(
          JSON.stringify(
            isOk
              ? { success: true }
              : { success: false, 'error-codes': ['invalid-input-response'] }
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const missingTurnstileRes = await jsonFetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-enforce-turnstile': 'true' },
        body: JSON.stringify({
          email: `turnstile-missing-${suffix}@gmail.com`,
          botGuard: { website: '', formRenderedAt: Date.now() - 1000 },
        }),
      });
      assert.strictEqual(missingTurnstileRes.status, 403, 'Turnstile ausente deve bloquear com 403');
      assert.strictEqual(missingTurnstileRes.body.code, 'BOT_CHALLENGE_REQUIRED');

      const invalidTurnstileRes = await jsonFetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-enforce-turnstile': 'true' },
        body: JSON.stringify({
          email: `turnstile-invalid-${suffix}@gmail.com`,
          botGuard: {
            website: '',
            turnstileToken: 'cf-turnstile-bad-token',
            formRenderedAt: Date.now() - 1000,
          },
        }),
      });
      assert.strictEqual(invalidTurnstileRes.status, 403, 'Token Turnstile inválido deve bloquear com 403');
      assert.strictEqual(invalidTurnstileRes.body.code, 'TURNSTILE_FAILED');

      const validTurnstileGuard = {
        website: '',
        turnstileToken: 'cf-turnstile-valid-token',
        formRenderedAt: Date.now() - 1000,
      };
      const validTurnstileRes = await jsonFetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-enforce-turnstile': 'true' },
        body: JSON.stringify({
          email: `turnstile-valid-${suffix}@gmail.com`,
          botGuard: validTurnstileGuard,
        }),
      });
      assert.strictEqual(validTurnstileRes.status, 200, 'Token Turnstile válido deve ser aceito');

      const replayTurnstileRes = await jsonFetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-enforce-turnstile': 'true' },
        body: JSON.stringify({
          email: `turnstile-replay-${suffix}@gmail.com`,
          botGuard: validTurnstileGuard,
        }),
      });
      assert.strictEqual(replayTurnstileRes.status, 403, 'Reutilização de token Turnstile deve bloquear com 403');
      assert.strictEqual(replayTurnstileRes.body.code, 'BOT_CHALLENGE_REPLAYED');
    } finally {
      globalThis.fetch = originalFetch;
      if (prevTurnstileSecret === undefined) {
        delete process.env.TURNSTILE_SECRET_KEY;
      } else {
        process.env.TURNSTILE_SECRET_KEY = prevTurnstileSecret;
      }
    }

    // 1.8 Forged unsigned Base64 session token rejected when signature verification is enforced
    const forgedToken = Buffer.from(
      JSON.stringify({
        userId: 'user-master-1',
        email: 'prwashingtondiasbh@gmail.com',
        tenantId: 'biz-1',
        role: 'SUPER_ADMIN',
        isMasterAdmin: true,
        iat: Date.now(),
      })
    ).toString('base64');
    const forgedAttempt = await jsonFetch('/master-admin/tenants', {
      headers: {
        Authorization: `Bearer ${forgedToken}`,
        'x-enforce-token-signature': 'true',
      },
    });
    assert.strictEqual(forgedAttempt.status, 401, 'Token Base64 forjado sem assinatura HMAC deve ser rejeitado');

    console.log('✅ Fase 1 concluída: Honeypot, timing, replay, desafio HMAC, e-mail descartável, User-Agent e tokens forjados bloqueados!');

    // =========================================================================
    // FASE 2: SUPER ADMIN LOGIN & CRIAÇÃO COMPLETA DA LOJA + ALTERAÇÕES DO LOJISTA
    // =========================================================================
    console.log('\n🏪 FASE 2: Super Admin cria loja, Lojista configura catálogo, equipe, sinal e bloqueios...');

    // 2.1 Master Admin authenticates strictly through SUPER_ADMIN portal with solved anti-bot challenge
    const masterGuard = await fetchSolvedBotGuard(true);
    const masterLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: 'prwashingtondiasbh@gmail.com',
        password: '123456',
        portalType: 'SUPER_ADMIN',
        botGuard: masterGuard,
      }),
    });
    assert.strictEqual(masterLoginRes.status, 200, 'Super Admin deve autenticar com desafio anti-bot válido');
    const masterToken = masterLoginRes.body.token;
    assert.ok(masterToken.includes('.'), 'Token de sessão emitido deve conter assinatura HMAC');

    // Master Admin trying to log in on public Customer endpoint must be blocked
    const masterOnCustomerGuard = await fetchSolvedBotGuard(true);
    const masterOnCustomerRes = await jsonFetch('/customer/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: 'prwashingtondiasbh@gmail.com',
        password: '123456',
        botGuard: masterOnCustomerGuard,
      }),
    });
    assert.strictEqual(masterOnCustomerRes.status, 403);
    assert.strictEqual(masterOnCustomerRes.body.code, 'PORTAL_ACCESS_DENIED');

    // 2.2 Master Admin creates new store
    const ownerEmail = `lojista.e2e.${suffix}@studio.com.br`;
    const ownerPassword = 'OwnerStrongPassword123!';
    const desiredSlug = `studio-e2e-${suffix}`;
    const createTenantRes = await jsonFetch('/master-admin/tenants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${masterToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        businessName: `Studio E2E Completa ${suffix}`,
        slug: desiredSlug,
        ownerName: 'Mariana Lojista E2E',
        ownerEmail,
        ownerPhone: '(11) 97777-8888',
        ownerPassword,
        plan: 'COMPLETE',
        description: 'Estúdio completo para teste de fluxo ponta a ponta.',
        address: 'Rua Augusta, 1500 - São Paulo/SP',
      }),
    });
    assert.strictEqual(createTenantRes.status, 201, 'Master Admin deve criar nova loja');
    const tenantId = createTenantRes.body.data.tenant.id;
    const storeSlug = createTenantRes.body.data.tenant.slug;
    assert.strictEqual(storeSlug, desiredSlug);

    // 2.3 Cross-panel test: Owner CANNOT log in via SUPER_ADMIN or CUSTOMER login panels
    const ownerOnSuperGuard = await fetchSolvedBotGuard(true);
    const ownerOnSuperRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPassword,
        portalType: 'SUPER_ADMIN',
        botGuard: ownerOnSuperGuard,
      }),
    });
    assert.strictEqual(ownerOnSuperRes.status, 403, 'Lojista deve ser bloqueado ao tentar entrar pelo painel Super Admin');
    assert.strictEqual(ownerOnSuperRes.body.code, 'PORTAL_ACCESS_DENIED');

    const ownerOnCustomerGuard = await fetchSolvedBotGuard(true);
    const ownerOnCustomerRes = await jsonFetch('/customer/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPassword,
        slug: storeSlug,
        botGuard: ownerOnCustomerGuard,
      }),
    });
    assert.strictEqual(ownerOnCustomerRes.status, 403, 'Lojista deve ser bloqueado no endpoint de login de cliente');
    assert.strictEqual(ownerOnCustomerRes.body.code, 'PORTAL_ACCESS_DENIED');

    // 2.4 Brute-force lockout test on Owner account (use an auxiliary/non-existent email first to test 5 wrong tries -> 429)
    const bruteEmail = `brute-target-${suffix}@studio.com.br`;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const g = await fetchSolvedBotGuard(true);
      const r = await jsonFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
        body: JSON.stringify({
          email: bruteEmail,
          password: 'WrongPassword!',
          portalType: 'STAFF',
          botGuard: g,
        }),
      });
      assert.strictEqual(r.status, 401, `Tentativa ${attempt} deve retornar 401`);
    }
    const fifthGuard = await fetchSolvedBotGuard(true);
    const fifthAttempt = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: bruteEmail,
        password: 'WrongPassword!',
        portalType: 'STAFF',
        botGuard: fifthGuard,
      }),
    });
    assert.strictEqual(fifthAttempt.status, 429, '5ª tentativa inválida consecutiva deve acionar bloqueio 429');
    assert.strictEqual(fifthAttempt.body.code, 'TOO_MANY_FAILED_ATTEMPTS');

    // 2.5 Owner authenticates via STAFF portal
    const ownerGuard = await fetchSolvedBotGuard(true);
    const ownerLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPassword,
        portalType: 'STAFF',
        botGuard: ownerGuard,
      }),
    });
    assert.strictEqual(ownerLoginRes.status, 200, 'Lojista deve autenticar pelo portal STAFF');
    const ownerToken = ownerLoginRes.body.token;
    assert.ok(ownerToken.includes('.'));

    // Owner cannot access master-admin endpoints
    const ownerMasterTry = await jsonFetch('/master-admin/tenants', {
      headers: { Authorization: `Bearer ${ownerToken}`, 'x-enforce-token-signature': 'true' },
    });
    assert.strictEqual(ownerMasterTry.status, 403, 'Lojista não pode acessar rotas Master Admin');

    // 2.6 Owner configures business settings (deposit 30%, 6h cancellation policy)
    const updateBizRes = await jsonFetch('/business', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        requireDeposit: true,
        defaultDeposit: 30,
        openTime: '08:00',
        closeTime: '20:00',
        description: 'Descrição atualizada pela lojista no fluxo E2E.',
        cancellationHoursLimit: 6,
      }),
    });
    assert.strictEqual(updateBizRes.status, 200, 'Lojista deve atualizar configurações do negócio');
    assert.strictEqual(updateBizRes.body.data.requireDeposit, true);

    // 2.7 Owner adds professional and service
    const profRes = await jsonFetch('/professionals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        name: 'Profissional Bia E2E',
        specialty: 'Design & Alongamento',
        email: `bia.prof.${suffix}@studio.com.br`,
        phone: '(11) 96666-5555',
        commission: 45,
      }),
    });
    assert.strictEqual(profRes.status, 201, 'Lojista deve cadastrar profissional');
    const profId = profRes.body.data.id;

    const servRes = await jsonFetch('/services', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        name: 'Combo VIP Alongamento + Spa',
        durationMin: 60,
        priceCents: 20000, // R$ 200,00 -> sinal 30% = R$ 60,00 (6000 centavos)
        depositPercent: 30,
        category: 'Estética & Unhas',
        professionalIds: [profId],
      }),
    });
    assert.strictEqual(servRes.status, 201, 'Lojista deve cadastrar serviço');
    const serviceId = servRes.body.data.id;

    // 2.8 Owner creates a team member, verifies login, then deletes team member
    const teamEmail = `recepcao.${suffix}@studio.com.br`;
    const teamPass = 'RecepPass123!';
    const createTeamRes = await jsonFetch('/business/team-members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        name: 'Recepcionista Clara',
        email: teamEmail,
        password: teamPass,
        role: 'RECEPTIONIST',
      }),
    });
    assert.strictEqual(createTeamRes.status, 201, 'Lojista deve cadastrar membro da equipe');
    const teamMemberId = createTeamRes.body.data.id;

    const teamGuard = await fetchSolvedBotGuard(true);
    const teamLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({ email: teamEmail, password: teamPass, portalType: 'STAFF', botGuard: teamGuard }),
    });
    assert.strictEqual(teamLoginRes.status, 200, 'Recepcionista cadastrada deve conseguir autenticar no painel STAFF');

    const delTeamRes = await jsonFetch(`/business/team-members/${teamMemberId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
    });
    assert.strictEqual(delTeamRes.status, 200, 'Lojista deve conseguir excluir membro da equipe');

    const teamListAfterDel = await jsonFetch('/business/team-members', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.ok(
      !teamListAfterDel.body.data.some((m: any) => m.id === teamMemberId),
      'Membro removido não deve mais aparecer na lista da equipe'
    );

    // 2.9 Owner registers a time block on target future date (09:00 - 10:00)
    const targetDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const blockStart = new Date(`${targetDate}T09:00:00-03:00`).toISOString();
    const blockEnd = new Date(`${targetDate}T10:00:00-03:00`).toISOString();
    const blockRes = await jsonFetch('/appointments/time-blocks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        professionalId: profId,
        type: 'BREAK',
        startDate: blockStart,
        endDate: blockEnd,
        reason: 'Reunião interna da equipe',
      }),
    });
    assert.strictEqual(blockRes.status, 201, 'Lojista deve criar bloqueio de horário na agenda');

    // 2.10 Configure lunch break (12:00 - 13:00) for professional and verify booking conflict
    const targetDayOfWeek = new Date(`${targetDate}T00:00:00-03:00`).getDay();
    const updateProfWhRes = await jsonFetch(`/professionals/${profId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        workingHours: [
          { dayOfWeek: targetDayOfWeek, startTime: '08:00', endTime: '20:00', breakStart: '12:00', breakEnd: '13:00' },
        ],
      }),
    });
    assert.strictEqual(updateProfWhRes.status, 200, 'Lojista deve configurar horário de almoço da profissional');

    console.log('✅ Fase 2 concluída: Loja criada, alterações salvas, equipe, bloqueio e horário de almoço aplicados!');

    // =========================================================================
    // FASE 3: CADASTRO DE CLIENTE, AGENDAMENTO ONLINE, SINCRONIZAÇÃO & PAGAMENTO PIX
    // =========================================================================
    console.log('\n💳 FASE 3: Cliente acessa /agendar/:slug, cadastra-se, agenda e paga Pix até confirmação...');

    // 3.1 Verify public catalog reflects owner's updates
    const publicRes = await jsonFetch(`/public/tenants/${storeSlug}`);
    assert.strictEqual(publicRes.status, 200);
    assert.strictEqual(publicRes.body.data.establishment.requireDeposit, true);
    assert.ok(publicRes.body.data.services.some((s: any) => s.id === serviceId));
    assert.ok(publicRes.body.data.professionals.some((p: any) => p.id === profId));

    // 3.2 Customer attempts privilege escalation during registration -> blocked 403
    const privEscGuard = await fetchSolvedBotGuard(true);
    const privEscRes = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        name: 'Hacker Role',
        email: `hacker-${suffix}@gmail.com`,
        phone: '(11) 95555-4444',
        password: 'Password123!',
        role: 'SUPER_ADMIN',
        slug: storeSlug,
        botGuard: privEscGuard,
      }),
    });
    assert.strictEqual(privEscRes.status, 403, 'Tentativa de registrar SUPER_ADMIN pelo cadastro público deve falhar');

    // 3.3 Legitimate customer registration with solved anti-bot challenge
    const customerEmail = `jose.padaria.${suffix}@gmail.com`;
    const customerPass = 'ClienteForte123!';
    const custRegGuard = await fetchSolvedBotGuard(true);
    const custRegRes = await jsonFetch('/customer/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        name: 'José da Padaria',
        email: customerEmail,
        phone: '(11) 94444-3333',
        password: customerPass,
        slug: storeSlug,
        botGuard: custRegGuard,
      }),
    });
    assert.strictEqual(custRegRes.status, 201, 'Cadastro legítimo do cliente com desafio anti-bot deve funcionar');
    const customerToken = custRegRes.body.token;
    const customerClientId = custRegRes.body.data.client.id;
    assert.ok(customerToken.includes('.'));

    // 3.4 Cross-panel login blocking: Customer CANNOT log into STAFF or SUPER_ADMIN panels
    const custOnStaffGuard = await fetchSolvedBotGuard(true);
    const custOnStaffRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: customerEmail,
        password: customerPass,
        portalType: 'STAFF',
        botGuard: custOnStaffGuard,
      }),
    });
    assert.strictEqual(custOnStaffRes.status, 403, 'Cliente não pode logar no painel de lojista');
    assert.strictEqual(custOnStaffRes.body.code, 'PORTAL_ACCESS_DENIED');
    assert.strictEqual(custOnStaffRes.body.token, undefined, 'Nenhum token deve ser emitido em acesso bloqueado');

    const custOnSuperGuard = await fetchSolvedBotGuard(true);
    const custOnSuperRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: customerEmail,
        password: customerPass,
        portalType: 'SUPER_ADMIN',
        botGuard: custOnSuperGuard,
      }),
    });
    assert.strictEqual(custOnSuperRes.status, 403, 'Cliente não pode logar no painel Super Admin');
    assert.strictEqual(custOnSuperRes.body.code, 'PORTAL_ACCESS_DENIED');

    // Legitimate Customer login via CUSTOMER portal works
    const custLoginGuard = await fetchSolvedBotGuard(true);
    const custLoginRes = await jsonFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-enforce-antibot': 'true' },
      body: JSON.stringify({
        email: customerEmail,
        password: customerPass,
        slug: storeSlug,
        portalType: 'CUSTOMER',
        botGuard: custLoginGuard,
      }),
    });
    assert.strictEqual(custLoginRes.status, 200, 'Cliente deve autenticar no portal CUSTOMER');

    // Verify 12:00 (lunch break) is blocked in public available slots and booking is rejected with 409
    const lunchSlotsRes = await jsonFetch(
      `/public/tenants/${storeSlug}/available-slots?serviceId=${serviceId}&professionalId=${profId}&date=${targetDate}`
    );
    assert.strictEqual(lunchSlotsRes.status, 200);
    assert.ok(
      lunchSlotsRes.body.data.occupiedSlots.some((o: any) => o.time === '12:00'),
      'Horário de almoço (12:00) deve constar como ocupado na disponibilidade pública'
    );

    const lunchBookingRes = await jsonFetch(`/public/tenants/${storeSlug}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        serviceId,
        professionalId: profId,
        date: targetDate,
        time: '12:00',
        notes: 'Tentativa no horário de almoço',
      }),
    });
    assert.strictEqual(lunchBookingRes.status, 409, 'Agendamento durante o horário de almoço deve ser rejeitado com 409');

    // 3.5 Verify price/status tampering on public booking is rejected (400)
    const tamperBookingRes = await jsonFetch(`/public/tenants/${storeSlug}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        serviceId,
        professionalId: profId,
        date: targetDate,
        time: '14:00',
        totalAmountCents: 1,
        forceApprovedPayment: true,
      }),
    });
    assert.strictEqual(tamperBookingRes.status, 400, 'Manipulação de preço/pagamento no agendamento deve retornar 400');

    // 3.6 Verify 09:00 is blocked by time block in public available slots
    const slotsBeforeRes = await jsonFetch(
      `/public/tenants/${storeSlug}/available-slots?serviceId=${serviceId}&professionalId=${profId}&date=${targetDate}`
    );
    assert.strictEqual(slotsBeforeRes.status, 200);
    assert.ok(
      slotsBeforeRes.body.data.occupiedSlots.some((o: any) => o.time === '09:00'),
      'Horário 09:00 bloqueado pela lojista deve constar como indisponível'
    );

    // 3.7 Customer creates valid online booking at 14:00
    const bookRes = await jsonFetch(`/public/tenants/${storeSlug}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        serviceId,
        professionalId: profId,
        date: targetDate,
        time: '14:00',
        notes: 'Reserva E2E completa',
      }),
    });
    assert.strictEqual(bookRes.status, 201, 'Agendamento online do cliente deve ser criado');
    const appt = bookRes.body.data.appointment;
    assert.strictEqual(appt.status, 'PENDING_PAYMENT', 'Com sinal ativo deve nascer como PENDING_PAYMENT');
    assert.strictEqual(appt.depositAmountCents, 6000, 'Sinal calculado no servidor deve ser 6000 centavos (30%)');
    assert.strictEqual(appt.totalAmountCents, 20000);

    // 3.8 Bidirectional Agenda Synchronization Check:
    // Both Public Available Slots and Staff Available Slots show 14:00 occupied, and Staff Manual Booking gets 409!
    const [pubSlotsAfter, staffSlotsAfter] = await Promise.all([
      jsonFetch(`/public/tenants/${storeSlug}/available-slots?serviceId=${serviceId}&professionalId=${profId}&date=${targetDate}`),
      jsonFetch(`/appointments/available-slots?serviceId=${serviceId}&professionalId=${profId}&date=${targetDate}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
    ]);
    assert.ok(pubSlotsAfter.body.data.occupiedSlots.some((o: any) => o.time === '14:00'));
    assert.ok(staffSlotsAfter.body.data.occupiedSlots.some((o: any) => o.time === '14:00'));

    const manualOverlapRes = await jsonFetch('/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        clientId: customerClientId,
        professionalId: profId,
        serviceId,
        dateTime: `${targetDate}T14:00:00-03:00`,
        origin: 'PRESENCIAL',
      }),
    });
    assert.strictEqual(
      manualOverlapRes.status,
      409,
      'Lojista não pode agendar manualmente em horário já reservado (pendente ou confirmado)'
    );

    // 3.9 Customer generates Pix payment
    const createPixRes = await jsonFetch(`/appointments/${appt.id}/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
        'x-enforce-token-signature': 'true',
      },
    });
    assert.strictEqual(createPixRes.status, 200, 'Deve gerar QR Code Pix para pagamento do sinal');
    assert.strictEqual(createPixRes.body.data.status, 'PENDING');
    assert.ok(createPixRes.body.data.qrCode, 'Deve retornar payload Copia e Cola Pix');

    const storedPayment = await storage.db.getPaymentByAppointmentId(tenantId, appt.id);
    assert.ok(storedPayment?.providerPaymentId, 'Pagamento Pix deve estar gravado no storage com providerPaymentId');

    // Status before approval stays PENDING
    const statusPendingRes = await jsonFetch(`/appointments/${appt.id}/payment-status`, {
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'x-enforce-token-signature': 'true',
      },
    });
    assert.strictEqual(statusPendingRes.status, 200);
    assert.strictEqual(statusPendingRes.body.data.paymentStatus, 'PENDING');
    assert.strictEqual(statusPendingRes.body.data.appointmentStatus, 'PENDING_PAYMENT');

    // 3.10 Payment gets approved in provider -> polling/reconciliation confirms payment & appointment automatically
    approvedProviderPaymentIds.add(storedPayment.providerPaymentId);
    const statusApprovedRes = await jsonFetch(`/appointments/${appt.id}/payment-status`, {
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'x-enforce-token-signature': 'true',
      },
    });
    assert.strictEqual(statusApprovedRes.status, 200);
    assert.strictEqual(statusApprovedRes.body.data.paymentStatus, 'APPROVED', 'Pagamento deve ser aprovado');
    assert.strictEqual(statusApprovedRes.body.data.appointmentStatus, 'CONFIRMED', 'Agendamento deve ser confirmado automaticamente');

    // 3.11 Verify confirmed appointment & paid deposit appear in BOTH Customer Portal AND Owner Panel
    const [custMeAfterPay, custApptsAfterPay, ownerApptsAfterPay, ownerPaymentsAfterPay] = await Promise.all([
      jsonFetch(`/customer/me?slug=${storeSlug}`, {
        headers: { Authorization: `Bearer ${customerToken}`, 'x-enforce-token-signature': 'true' },
      }),
      jsonFetch(`/customer/appointments?slug=${storeSlug}`, {
        headers: { Authorization: `Bearer ${customerToken}`, 'x-enforce-token-signature': 'true' },
      }),
      jsonFetch('/appointments', {
        headers: { Authorization: `Bearer ${ownerToken}`, 'x-enforce-token-signature': 'true' },
      }),
      jsonFetch('/payments', {
        headers: { Authorization: `Bearer ${ownerToken}`, 'x-enforce-token-signature': 'true' },
      }),
    ]);

    assert.strictEqual(custMeAfterPay.status, 200);
    assert.strictEqual(
      custMeAfterPay.body.data.summary.pendingDeposits.length,
      0,
      'Painel do cliente não deve mais mostrar pendência após pagamento'
    );
    const custAppt = custApptsAfterPay.body.data.appointments.find((a: any) => a.id === appt.id);
    assert.ok(custAppt, 'Agendamento confirmado deve aparecer no painel do cliente');
    assert.strictEqual(custAppt.status, 'CONFIRMED');
    assert.strictEqual(custAppt.depositPaid, true);

    const ownerAppt = ownerApptsAfterPay.body.data.find((a: any) => a.id === appt.id);
    assert.ok(ownerAppt, 'Agendamento pago deve aparecer imediatamente no painel do lojista');
    assert.strictEqual(ownerAppt.status, 'CONFIRMED');

    const ownerPayment = ownerPaymentsAfterPay.body.data.find((p: any) => p.appointmentId === appt.id);
    assert.ok(ownerPayment, 'Pagamento aprovado deve constar no financeiro do lojista');
    assert.strictEqual(ownerPayment.status, 'APPROVED');

    // 3.12 Owner creates manual booking on free slot (11:00) -> syncs to customer public availability!
    const manualFreeRes = await jsonFetch('/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        clientId: customerClientId,
        professionalId: profId,
        serviceId,
        dateTime: `${targetDate}T11:00:00-03:00`,
        origin: 'PRESENCIAL',
        notes: 'Encaixe manual no balcão',
      }),
    });
    assert.strictEqual(manualFreeRes.status, 201, 'Lojista deve conseguir agendar em horário livre (11:00)');

    const pubAfterManual = await jsonFetch(
      `/public/tenants/${storeSlug}/available-slots?serviceId=${serviceId}&professionalId=${profId}&date=${targetDate}`
    );
    assert.ok(
      pubAfterManual.body.data.occupiedSlots.some((o: any) => o.time === '11:00'),
      'Agendamento manual do lojista deve bloquear 11:00 na página pública do cliente'
    );

    // 3.13 Pending appointment cancellation frees the schedule
    const pendingBookRes = await jsonFetch(`/public/tenants/${storeSlug}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({
        serviceId,
        professionalId: profId,
        date: targetDate,
        time: '16:00',
      }),
    });
    assert.strictEqual(pendingBookRes.status, 201);
    const pendingApptId = pendingBookRes.body.data.appointment.id;

    const cancelPendingRes = await jsonFetch(`/customer/appointments/${pendingApptId}/cancel-pending`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}`, 'x-enforce-token-signature': 'true' },
    });
    assert.strictEqual(cancelPendingRes.status, 200, 'Cancelamento de pré-reserva pendente deve retornar 200');

    const [pubAfterCancel, staffAfterCancel] = await Promise.all([
      jsonFetch(`/public/tenants/${storeSlug}/available-slots?serviceId=${serviceId}&professionalId=${profId}&date=${targetDate}`),
      jsonFetch(`/appointments/available-slots?serviceId=${serviceId}&professionalId=${profId}&date=${targetDate}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
    ]);
    assert.ok(
      !pubAfterCancel.body.data.occupiedSlots.some((o: any) => o.time === '16:00'),
      'Horário 16:00 deve voltar a ficar livre no link público após cancelamento'
    );
    assert.ok(
      !staffAfterCancel.body.data.occupiedSlots.some((o: any) => o.time === '16:00'),
      'Horário 16:00 deve voltar a ficar livre na agenda manual do lojista após cancelamento'
    );

    console.log('✅ Fase 3 concluída: Cadastro, agendamento, Pix, confirmação nos 2 painéis e sincronia de agenda validados!');

    // =========================================================================
    // FASE 4: EXCLUSÃO DA LOJA NO SUPER ADMIN & VERIFICAÇÃO DE AUDITORIA
    // =========================================================================
    console.log('\n🗑️  FASE 4: Super Admin exclui a loja de teste e valida limpeza & AuditLog...');

    const deleteStoreRes = await jsonFetch(`/master-admin/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${masterToken}`,
        'x-enforce-token-signature': 'true',
      },
      body: JSON.stringify({ reason: 'Limpeza após validação completa E2E.' }),
    });
    assert.strictEqual(deleteStoreRes.status, 200, 'Super Admin deve excluir a loja de teste');
    assert.strictEqual(deleteStoreRes.body.data.deletedTenantId, tenantId);

    const publicAfterDelete = await jsonFetch(`/public/tenants/${storeSlug}`);
    assert.strictEqual(publicAfterDelete.status, 404, 'Página pública da loja excluída deve retornar 404');

    const securityAudits = (storage.memoryStore.auditLogs as any[]).filter((l) =>
      String(l.action || '').startsWith('SECURITY_') || l.action === 'SAAS_TENANT_DELETED'
    );
    assert.ok(
      securityAudits.some((l) => l.action === 'SECURITY_BOT_HONEYPOT_TRIGGERED'),
      'Deve registrar AuditLog de detecção de Honeypot'
    );
    assert.ok(
      securityAudits.some((l) => l.action === 'SECURITY_UNAUTHORIZED_PORTAL_LOGIN_ATTEMPT'),
      'Deve registrar AuditLog de tentativa de acesso indevido entre painéis'
    );
    assert.ok(
      securityAudits.some((l) => l.action === 'SECURITY_LOGIN_LOCKOUT'),
      'Deve registrar AuditLog de bloqueio por força bruta'
    );
    assert.ok(
      securityAudits.some((l) => l.action === 'SAAS_TENANT_DELETED'),
      'Deve registrar AuditLog de exclusão da loja'
    );

    console.log('✅ Fase 4 concluída: Exclusão limpa e trilha de auditoria de segurança verificadas!');
    console.log('\n🎉 FLUXO COMPLETO DE TESTES E PROTEÇÃO ANTI-BOT APROVADO COM 100% DE SUCESSO!\n');
  } finally {
    resetAntiBotStateForTests();
    server.close();
  }
}

runFullStoreLifecycleAndSecurityTests().catch((err) => {
  console.error('❌ Falha nos testes E2E completos e segurança:', err);
  process.exit(1);
});
