import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export interface BotGuardPayload {
  website: string;
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
  const [question, setQuestion] = useState<string>('Carregando verificação...');
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [challengeAnswer, setChallengeAnswer] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>('');
  const [formRenderedAt, setFormRenderedAt] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState<boolean>(false);

  const fetchChallenge = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/bot-challenge', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (json?.success && json?.data?.challengeToken) {
        setChallengeToken(json.data.challengeToken);
        setQuestion(json.data.question || 'Resolva a soma abaixo');
        setChallengeAnswer('');
        setFormRenderedAt(Date.now());
      } else {
        setQuestion('Erro ao carregar desafio');
      }
    } catch {
      setQuestion('Verificação indisponível');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge, resetKey]);

  useEffect(() => {
    onChange({
      website: honeypot,
      challengeToken,
      challengeAnswer: challengeAnswer.trim(),
      formRenderedAt,
    });
  }, [honeypot, challengeToken, challengeAnswer, formRenderedAt, onChange]);

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

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Verificação Anti-Bot
          </span>
        </div>
        <button
          type="button"
          onClick={fetchChallenge}
          disabled={loading}
          title="Gerar novo desafio"
          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg transition-colors ${
            isDark
              ? 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/70'
          }`}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Trocar</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold tabular-nums border ${
            isDark
              ? 'bg-stone-900 border-stone-800 text-stone-100'
              : 'bg-white border-stone-200 text-stone-900'
          }`}
        >
          {question}
        </div>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          aria-label="Resposta da verificação anti-bot"
          value={challengeAnswer}
          onChange={(e) => setChallengeAnswer(e.target.value.replace(/[^0-9-]/g, ''))}
          placeholder="Resp."
          className={`w-24 px-3 py-2 rounded-lg text-xs sm:text-sm font-bold text-center tabular-nums border focus:outline-none focus:ring-2 ${
            isDark
              ? 'bg-stone-900 border-stone-700 text-stone-100 placeholder-stone-500 focus:border-rose-500 focus:ring-rose-500/20'
              : 'bg-white border-stone-300 text-stone-900 placeholder-stone-400 focus:border-rose-500 focus:ring-rose-500/20'
          }`}
        />
      </div>
    </div>
  );
};
