import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          language?: string;
          size?: 'normal' | 'compact' | 'flexible';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: (errorCode?: string) => void;
          'timeout-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY =
  ((import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ||
  '0x4AAAAAAF-9lcvfQpiICFeY';

export interface BotGuardPayload {
  website: string;
  turnstileToken?: string;
  challengeToken: string;
  challengeAnswer: string;
  formRenderedAt: number;
}

interface AntiBotChallengeProps {
  resetKey?: number;
  theme?: 'light' | 'dark';
  onChange: (payload: BotGuardPayload) => void;
}

export const AntiBotChallenge: React.FC<AntiBotChallengeProps> = ({
  resetKey = 0,
  theme = 'light',
  onChange,
}) => {
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>('');
  const [formRenderedAt] = useState<number>(() => Date.now());
  const [status, setStatus] = useState<'loading' | 'ready' | 'verified' | 'error'>('loading');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const prevResetKeyRef = useRef<number>(resetKey);

  useEffect(() => {
    onChange({
      website: honeypot,
      turnstileToken,
      challengeToken: '',
      challengeAnswer: '',
      formRenderedAt,
    });
  }, [honeypot, turnstileToken, formRenderedAt, onChange]);

  const ensureScriptTag = useCallback(() => {
    if (typeof document === 'undefined') return;
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  const renderWidget = useCallback(() => {
    const el = containerRef.current;
    if (!el || !window.turnstile?.render) return false;

    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // ignore cleanup error
      }
      widgetIdRef.current = null;
    }

    el.innerHTML = '';
    setTurnstileToken('');
    setStatus('ready');

    const widgetId = window.turnstile.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: theme === 'dark' ? 'dark' : 'light',
      language: 'pt-BR',
      size: 'normal',
      callback: (token: string) => {
        setTurnstileToken(token);
        setStatus('verified');
      },
      'expired-callback': () => {
        setTurnstileToken('');
        setStatus('ready');
      },
      'timeout-callback': () => {
        setTurnstileToken('');
        setStatus('ready');
      },
      'error-callback': () => {
        setTurnstileToken('');
        setStatus('error');
      },
    });

    widgetIdRef.current = widgetId;
    return true;
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | undefined;

    ensureScriptTag();

    if (!renderWidget()) {
      setStatus('loading');
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds
      pollTimer = window.setInterval(() => {
        if (cancelled) return;
        attempts += 1;
        if (window.turnstile?.render) {
          if (pollTimer) window.clearInterval(pollTimer);
          renderWidget();
        } else if (attempts >= maxAttempts) {
          if (pollTimer) window.clearInterval(pollTimer);
          setStatus('error');
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [ensureScriptTag, renderWidget]);

  useEffect(() => {
    if (prevResetKeyRef.current === resetKey) return;
    prevResetKeyRef.current = resetKey;
    setTurnstileToken('');
    if (widgetIdRef.current && window.turnstile?.reset) {
      try {
        setStatus('ready');
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        renderWidget();
      }
    } else {
      renderWidget();
    }
  }, [resetKey, renderWidget]);

  const handleManualReload = () => {
    setTurnstileToken('');
    if (widgetIdRef.current && window.turnstile?.reset) {
      try {
        setStatus('ready');
        window.turnstile.reset(widgetIdRef.current);
        return;
      } catch {
        // fallback to full re-render
      }
    }
    ensureScriptTag();
    if (!renderWidget()) {
      setStatus('error');
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`relative rounded-xl border p-3 transition-colors ${
        isDark
          ? 'bg-stone-950/90 border-stone-800 text-stone-200'
          : 'bg-stone-50 border-stone-200 text-stone-800'
      }`}
    >
      {/* Hidden Honeypot Field for Automated Bots */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden opacity-0 pointer-events-none"
      >
        <label htmlFor={`website-hp-${resetKey}`}>Seu site (deixe em branco)</label>
        <input
          id={`website-hp-${resetKey}`}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5">
          <ShieldCheck
            className={`w-4 h-4 shrink-0 ${
              status === 'verified'
                ? 'text-emerald-500'
                : isDark
                  ? 'text-stone-400'
                  : 'text-emerald-600'
            }`}
          />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Verificação de Segurança
          </span>
        </div>
        <button
          type="button"
          onClick={handleManualReload}
          title="Recarregar verificação Cloudflare Turnstile"
          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg transition-colors ${
            isDark
              ? 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/70'
          }`}
        >
          <RefreshCw className={`w-3 h-3 ${status === 'loading' ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      <div className="flex flex-col items-center justify-center min-h-[66px]">
        <div ref={containerRef} className="cf-turnstile-container flex justify-center max-w-full overflow-x-auto" />
        {status === 'loading' && (
          <p className={`text-[11px] mt-1 ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
            Carregando verificação Cloudflare Turnstile...
          </p>
        )}
        {status === 'error' && (
          <div
            className={`mt-2 w-full rounded-lg px-2.5 py-1.5 text-[11px] flex items-center justify-center gap-1.5 ${
              isDark
                ? 'bg-amber-950/60 border border-amber-800/70 text-amber-300'
                : 'bg-amber-50 border border-amber-200 text-amber-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Não foi possível carregar o desafio. Clique em Atualizar.</span>
          </div>
        )}
      </div>
    </div>
  );
};
