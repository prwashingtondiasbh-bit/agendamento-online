import React, { useState } from 'react';
import { Building2, Lock, Mail, ArrowRight, AlertCircle, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { AntiBotChallenge, BotGuardPayload } from './AntiBotChallenge';

interface OwnerLoginScreenProps {
  onLoginSuccess: (user: any) => void;
  onBackToHome?: () => void;
}

export const OwnerLoginScreen: React.FC<OwnerLoginScreenProps> = ({
  onLoginSuccess,
  onBackToHome,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [botResetKey, setBotResetKey] = useState(0);
  const [botGuard, setBotGuard] = useState<BotGuardPayload>({
    website: '',
    challengeToken: '',
    challengeAnswer: '',
    formRenderedAt: Date.now(),
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
          portalType: 'STAFF',
          botGuard,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setBotResetKey((k) => k + 1);
        setError(data.error || 'E-mail ou senha incorretos.');
        return;
      }

      const user = data.data?.user || data.user;

      if (user?.role === 'CUSTOMER') {
        localStorage.removeItem('agenda_token');
        await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        setError(
          'Esta conta pertence ao perfil de cliente. Para gerenciar seus agendamentos, acesse a página pública do salão onde você costuma agendar.'
        );
        return;
      }

      if (data.token || data.data?.token) {
        localStorage.setItem('agenda_token', data.token || data.data?.token);
      }
      onLoginSuccess(user);
    } catch {
      setError('Erro de conexão ao autenticar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), botGuard }),
      });
      const data = await res.json().catch(() => ({}));
      setBotResetKey((k) => k + 1);

      if (data.success) {
        setSuccess('Instruções para redefinição de senha enviadas para seu e-mail!');
      } else {
        setError(data.error || 'E-mail não localizado.');
      }
    } catch {
      setError('Erro ao solicitar redefinição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-stone-900 px-6 sm:px-8 pt-7 pb-6 text-white text-center border-b border-stone-800">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-600 to-rose-400 flex items-center justify-center mx-auto mb-3.5 shadow-lg shadow-rose-950/40">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider mb-2">
            <span>Acesso Exclusivo para Lojistas</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-serif tracking-tight text-white">
            Portal do Lojista
          </h1>
          <p className="text-stone-400 text-xs mt-1">
            Gestão operacional, agenda, financeiro e clientes do seu estabelecimento
          </p>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{success}</span>
            </div>
          )}

          {!isForgot ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  E-mail do Proprietário ou Colaborador
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dono@seusalao.com.br"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Senha de Acesso
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setSuccess('');
                      setIsForgot(true);
                    }}
                    className="text-xs text-rose-600 hover:underline font-medium"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>

              <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Entrando no painel do salão...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Painel do Salão</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dono@seusalao.com.br"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm"
                  />
                </div>
              </div>

              <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgot(false);
                    setBotResetKey((k) => k + 1);
                  }}
                  className="w-1/3 py-2.5 px-3 rounded-xl border border-stone-200 text-stone-600 text-xs font-semibold hover:bg-stone-50"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Enviando...' : 'Redefinir Senha'}
                </button>
              </div>
            </form>
          )}

          {/* Registration Notice Box (Strict Super Admin Only) */}
          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Ainda não possui sua loja credenciada?</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800">
              O credenciamento de novos estabelecimentos é realizado exclusivamente pela administração central da plataforma. Se você é proprietário e deseja ingressar, solicite a liberação ao administrador.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
