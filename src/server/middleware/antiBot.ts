import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from '../storage.js';

const DEFAULT_FALLBACK_SECRET = crypto
  .createHash('sha256')
  .update(`agenda-beauty-antibot-${process.env.SESSION_SECRET || 'hostinger-local-dev-secret-2026'}`)
  .digest('hex');

export function getSecuritySecret(): string {
  const envSecret = String(process.env.SESSION_SECRET || '').trim();
  if (envSecret.length >= 16) return envSecret;
  return DEFAULT_FALLBACK_SECRET;
}

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'yopmail.com',
  'yopmail.fr',
  '10minutemail.com',
  '10minutemail.net',
  'guerrillamail.com',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'trashmail.com',
  'throwawaymail.com',
  'dispostable.com',
  'getnada.com',
  'fakeinbox.com',
  'maildrop.cc',
  'mintemail.com',
  'emailondeck.com',
]);

const SUSPICIOUS_BOT_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /masscan/i,
  /nmap/i,
  /scrapy/i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /go-http-client/i,
  /libwww-perl/i,
  /wget/i,
  /curl\//i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
];

const HONEYPOT_FIELD_NAMES = [
  'website',
  'companyWebsite',
  'companyUrl',
  'hp_field',
  'hpField',
  '_hp',
  'honeypot',
  'faxNumber',
];

// Single-use challenge nonces with expiration cleanup
const consumedChallengeNonces = new Map<string, number>();

// Failed login attempts tracker for progressive brute-force lockout
interface LoginAttemptRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}
const loginAttemptsByKey = new Map<string, LoginAttemptRecord>();

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MIN_HUMAN_SUBMIT_MS = 400; // Submissions faster than 400ms from challenge issue are automated

export function resetAntiBotStateForTests() {
  consumedChallengeNonces.clear();
  loginAttemptsByKey.clear();
}

function pruneExpiredState() {
  const now = Date.now();
  for (const [nonce, expiresAt] of consumedChallengeNonces.entries()) {
    if (now > expiresAt) {
      consumedChallengeNonces.delete(nonce);
    }
  }
  for (const [key, rec] of loginAttemptsByKey.entries()) {
    if (now > rec.lockedUntil && now - rec.firstFailureAt > LOGIN_ATTEMPT_WINDOW_MS) {
      loginAttemptsByKey.delete(key);
    }
  }
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).trim();
  }
  return String(req.headers['client-ip'] || req.ip || req.socket?.remoteAddress || '127.0.0.1').trim();
}

function signHmac(data: string): string {
  return crypto.createHmac('sha256', getSecuritySecret()).update(data).digest('hex');
}

export interface BotChallengeOutput {
  challengeToken: string;
  question: string;
  expiresInSeconds: number;
}

export function createBotChallenge(): BotChallengeOutput {
  pruneExpiredState();
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const answer = String(a + b);
  const nonce = crypto.randomUUID();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + CHALLENGE_TTL_MS;

  const answerHash = crypto
    .createHmac('sha256', getSecuritySecret())
    .update(`${nonce}:${answer}`)
    .digest('hex');

  const payload = {
    nonce,
    answerHash,
    issuedAt,
    expiresAt,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signHmac(payloadB64);

  return {
    challengeToken: `${payloadB64}.${sig}`,
    question: `Quanto é ${a} + ${b}?`,
    expiresInSeconds: Math.floor(CHALLENGE_TTL_MS / 1000),
  };
}

export interface VerifyBotChallengeResult {
  valid: boolean;
  code?: string;
  error?: string;
}

export function verifyBotChallenge(
  challengeToken: string | undefined | null,
  rawAnswer: string | number | undefined | null,
  options?: { enforceTiming?: boolean; consumeNonce?: boolean }
): VerifyBotChallengeResult {
  pruneExpiredState();

  if (!challengeToken || typeof challengeToken !== 'string' || !challengeToken.includes('.')) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_REQUIRED',
      error: 'Complete a verificação anti-bot antes de enviar.',
    };
  }

  const parts = challengeToken.split('.');
  if (parts.length !== 2) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_INVALID',
      error: 'Token de verificação anti-bot inválido.',
    };
  }

  const [payloadB64, providedSig] = parts;
  const expectedSig = signHmac(payloadB64);

  const sigBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_TAMPERED',
      error: 'Falha na integridade da verificação anti-bot.',
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_INVALID',
      error: 'Desafio anti-bot malformado.',
    };
  }

  const now = Date.now();
  if (!payload?.nonce || !payload?.expiresAt || now > Number(payload.expiresAt)) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_EXPIRED',
      error: 'A verificação anti-bot expirou. Atualize o desafio e tente novamente.',
    };
  }

  if (consumedChallengeNonces.has(payload.nonce)) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_REPLAYED',
      error: 'Este desafio anti-bot já foi utilizado. Solicite um novo desafio.',
    };
  }

  if (options?.enforceTiming && payload.issuedAt && now - Number(payload.issuedAt) < MIN_HUMAN_SUBMIT_MS) {
    return {
      valid: false,
      code: 'BOT_TIMING_VIOLATION',
      error: 'Envio automatizado detectado (submissão rápida demais). Aguarde um instante e tente novamente.',
    };
  }

  const cleanAnswer = String(rawAnswer ?? '').trim();
  if (!cleanAnswer) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_ANSWER_MISSING',
      error: 'Responda à verificação matemática anti-bot.',
    };
  }

  const expectedAnswerHash = crypto
    .createHmac('sha256', getSecuritySecret())
    .update(`${payload.nonce}:${cleanAnswer}`)
    .digest('hex');

  const ansBuf = Buffer.from(expectedAnswerHash, 'utf8');
  const targetBuf = Buffer.from(String(payload.answerHash || ''), 'utf8');
  if (ansBuf.length !== targetBuf.length || !crypto.timingSafeEqual(ansBuf, targetBuf)) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_INCORRECT',
      error: 'Resposta da verificação anti-bot incorreta. Tente novamente.',
    };
  }

  if (options?.consumeNonce !== false) {
    consumedChallengeNonces.set(payload.nonce, Number(payload.expiresAt));
  }

  return { valid: true };
}

export function isDisposableEmail(email: string): boolean {
  const parts = String(email || '').trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export function hasBotLikeNameOrContent(name: string): boolean {
  const val = String(name || '').trim();
  if (!val) return false;
  if (/https?:\/\/|www\./i.test(val)) return true;
  if (/<[^>]+>|script|javascript:/i.test(val)) return true;
  return false;
}

export function checkLoginLockout(req: Request, email: string): { locked: boolean; retryAfterSec: number } {
  pruneExpiredState();
  const ip = extractClientIp(req);
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${ip}:${cleanEmail}`;
  const rec = loginAttemptsByKey.get(key);
  const now = Date.now();
  if (rec && rec.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((rec.lockedUntil - now) / 1000)),
    };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function recordFailedLoginAttempt(req: Request, email: string): {
  lockedNow: boolean;
  remainingAttempts: number;
  retryAfterSec: number;
} {
  pruneExpiredState();
  const ip = extractClientIp(req);
  const cleanEmail = String(email || '').trim().toLowerCase();
  const key = `${ip}:${cleanEmail}`;
  const now = Date.now();

  let rec = loginAttemptsByKey.get(key);
  if (!rec || now - rec.firstFailureAt > LOGIN_ATTEMPT_WINDOW_MS) {
    rec = { failures: 0, firstFailureAt: now, lockedUntil: 0 };
  }

  rec.failures += 1;
  if (rec.failures >= MAX_FAILED_LOGIN_ATTEMPTS) {
    rec.lockedUntil = now + LOGIN_LOCKOUT_DURATION_MS;
    loginAttemptsByKey.set(key, rec);
    db.recordAuditLog(
      null,
      null,
      'SECURITY_LOGIN_LOCKOUT',
      {
        email: cleanEmail,
        failures: rec.failures,
        lockoutSeconds: Math.floor(LOGIN_LOCKOUT_DURATION_MS / 1000),
      },
      ip
    ).catch(() => {});
    return {
      lockedNow: true,
      remainingAttempts: 0,
      retryAfterSec: Math.floor(LOGIN_LOCKOUT_DURATION_MS / 1000),
    };
  }

  loginAttemptsByKey.set(key, rec);
  return {
    lockedNow: false,
    remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS - rec.failures,
    retryAfterSec: 0,
  };
}

export function clearFailedLoginAttempts(req: Request, email: string) {
  const ip = extractClientIp(req);
  const cleanEmail = String(email || '').trim().toLowerCase();
  loginAttemptsByKey.delete(`${ip}:${cleanEmail}`);
}

export interface VerifyTurnstileResult {
  valid: boolean;
  code?: string;
  error?: string;
  errorCodes?: string[];
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<VerifyTurnstileResult> {
  pruneExpiredState();

  const cleanToken = String(token ?? '').trim();
  if (!cleanToken) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_REQUIRED',
      error: 'Complete a verificação de segurança (Cloudflare Turnstile) antes de enviar.',
    };
  }

  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
  const replayKey = `ts:${tokenHash}`;
  if (consumedChallengeNonces.has(replayKey)) {
    return {
      valid: false,
      code: 'BOT_CHALLENGE_REPLAYED',
      error: 'Esta verificação de segurança já foi utilizada. Aguarde a renovação e tente novamente.',
    };
  }

  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) {
    console.error('[AntiBot] TURNSTILE_SECRET_KEY não configurada no servidor.');
    return {
      valid: false,
      code: 'TURNSTILE_NOT_CONFIGURED',
      error: 'Verificação anti-bot não configurada no servidor.',
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', cleanToken);
    if (remoteIp && remoteIp !== '127.0.0.1' && remoteIp !== '::1') {
      formData.append('remoteip', remoteIp);
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!verifyRes.ok) {
      return {
        valid: false,
        code: 'TURNSTILE_UNAVAILABLE',
        error: 'Não foi possível validar o Cloudflare Turnstile no momento. Tente novamente.',
      };
    }

    const data = (await verifyRes.json().catch(() => null)) as {
      success?: boolean;
      'error-codes'?: string[];
    } | null;

    if (!data?.success) {
      return {
        valid: false,
        code: 'TURNSTILE_FAILED',
        error: 'Falha na verificação de segurança (Cloudflare Turnstile). Atualize e tente novamente.',
        errorCodes: Array.isArray(data?.['error-codes']) ? data['error-codes'] : undefined,
      };
    }

    consumedChallengeNonces.set(replayKey, Date.now() + 5 * 60 * 1000);
    return { valid: true };
  } catch (err) {
    console.error('[AntiBot] Erro ao consultar siteverify do Cloudflare Turnstile:', err);
    return {
      valid: false,
      code: 'TURNSTILE_UNAVAILABLE',
      error: 'Erro de comunicação ao validar o Cloudflare Turnstile. Tente novamente.',
    };
  }
}

export interface AntiBotMiddlewareOptions {
  mode: 'register' | 'login' | 'forgot_password';
}

export function antiBotGuard(options: AntiBotMiddlewareOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body || {};
    const botGuard = typeof body.botGuard === 'object' && body.botGuard !== null ? body.botGuard : {};
    const ip = extractClientIp(req);
    const ua = String(req.headers['user-agent'] || '');

    const turnstileToken =
      botGuard.turnstileToken ?? body.turnstileToken ?? body['cf-turnstile-response'];
    const challengeToken = botGuard.challengeToken ?? body.challengeToken;
    const challengeAnswer = botGuard.challengeAnswer ?? body.challengeAnswer;

    const isTestMode = process.env.NODE_ENV === 'test' || process.env.AGENDA_TEST_MODE === '1';
    const enforceTurnstile =
      !isTestMode || req.headers['x-enforce-turnstile'] === 'true' || Boolean(turnstileToken);
    const enforceLegacyMath =
      isTestMode &&
      !enforceTurnstile &&
      (req.headers['x-enforce-antibot'] === 'true' || Boolean(challengeToken));
    const enforceStrictChallenge = enforceTurnstile || enforceLegacyMath;

    // 1. Check honeypot trap fields (always enforced, even in test mode)
    for (const field of HONEYPOT_FIELD_NAMES) {
      const val = body[field] ?? botGuard[field];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        await db.recordAuditLog(
          null,
          null,
          'SECURITY_BOT_HONEYPOT_TRIGGERED',
          { path: req.originalUrl, field, ua: ua.slice(0, 120) },
          ip
        ).catch(() => {});
        return res.status(403).json({
          success: false,
          code: 'BOT_DETECTED',
          error: 'Solicitação bloqueada pela proteção anti-bot.',
        });
      }
    }

    // 2. Check malicious/automated scanner User-Agent when strict mode active or outside default test fetch
    if (!isTestMode || req.headers['x-enforce-antibot'] === 'true' || req.headers['x-enforce-turnstile'] === 'true') {
      if (!ua || SUSPICIOUS_BOT_UA_PATTERNS.some((re) => re.test(ua))) {
        await db.recordAuditLog(
          null,
          null,
          'SECURITY_BOT_USER_AGENT_BLOCKED',
          { path: req.originalUrl, ua: ua.slice(0, 160) },
          ip
        ).catch(() => {});
        return res.status(403).json({
          success: false,
          code: 'BOT_USER_AGENT_BLOCKED',
          error: 'Acesso automatizado não autorizado por este endpoint.',
        });
      }
    }

    // 3. Registration specific heuristics (always enforced)
    if (options.mode === 'register') {
      const email = String(body.email || '').trim();
      const name = String(body.name || '').trim();

      if (email && isDisposableEmail(email)) {
        await db.recordAuditLog(
          null,
          null,
          'SECURITY_BOT_DISPOSABLE_EMAIL_BLOCKED',
          { email },
          ip
        ).catch(() => {});
        return res.status(400).json({
          success: false,
          code: 'DISPOSABLE_EMAIL_BLOCKED',
          error: 'E-mails temporários ou descartáveis não são permitidos para cadastro.',
        });
      }

      if (name && hasBotLikeNameOrContent(name)) {
        await db.recordAuditLog(
          null,
          null,
          'SECURITY_BOT_SPAM_PAYLOAD_BLOCKED',
          { name: name.slice(0, 80) },
          ip
        ).catch(() => {});
        return res.status(400).json({
          success: false,
          code: 'INVALID_BOT_PAYLOAD',
          error: 'O nome informado contém caracteres ou links não permitidos.',
        });
      }
    }

    // 4. Form render timing guard if provided
    const formRenderedAt = Number(botGuard.formRenderedAt || body.formRenderedAt || 0);
    if (enforceStrictChallenge && formRenderedAt > 0) {
      const elapsed = Date.now() - formRenderedAt;
      if (elapsed < MIN_HUMAN_SUBMIT_MS) {
        return res.status(403).json({
          success: false,
          code: 'BOT_TIMING_VIOLATION',
          error: 'Envio rápido demais detectado. Aguarde um segundo e tente novamente.',
        });
      }
    }

    // 5. Verify Cloudflare Turnstile (or legacy signed challenge in test mode)
    if (enforceTurnstile) {
      const check = await verifyTurnstileToken(turnstileToken, ip);
      if (!check.valid) {
        await db.recordAuditLog(
          null,
          null,
          'SECURITY_TURNSTILE_FAILED',
          { path: req.originalUrl, code: check.code, errorCodes: check.errorCodes },
          ip
        ).catch(() => {});
        return res.status(403).json({
          success: false,
          code: check.code || 'TURNSTILE_FAILED',
          error: check.error || 'Falha na verificação de segurança (Cloudflare Turnstile).',
        });
      }
    } else if (enforceLegacyMath) {
      const check = verifyBotChallenge(challengeToken, challengeAnswer, {
        enforceTiming: true,
        consumeNonce: true,
      });
      if (!check.valid) {
        await db.recordAuditLog(
          null,
          null,
          'SECURITY_BOT_CHALLENGE_FAILED',
          { path: req.originalUrl, code: check.code },
          ip
        ).catch(() => {});
        return res.status(403).json({
          success: false,
          code: check.code || 'BOT_CHALLENGE_FAILED',
          error: check.error || 'Falha na verificação humana anti-bot.',
        });
      }
    }

    return next();
  };
}

