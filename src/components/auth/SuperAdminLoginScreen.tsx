import React, { useState } from 'react';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import { AntiBotChallenge, BotGuardPayload } from './AntiBotChallenge';

interface SuperAdminLoginScreenProps {
  onLoginSuccess: (user: any) => void;
  onBackToHome?: () => void;
}

export const SuperAdminLoginScreen: React.FC<SuperAdminLoginScreenProps> = ({
  onLoginSuccess,
  onBackToHome,
}) => {
  const [email, setEmail] = useState('prwashingtondiasbh@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [botResetKey, setBotResetKey] = useState(0);
  const [botGuard, setBotGuard] = useState<BotGuardPayload>({
    website: '',
    challengeToken: '',
    challengeAnswer: '',
    formRenderedAt: Date.now(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
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
          portalType: 'SUPER_ADMIN',
          botGuard,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setBotResetKey((k) => k + 1);
        setError(data.error || 'Credenciais inválidas para o acesso Super Admin.');
        return;
      }

      const user = data.data?.user || data.user;
      const isSuper = user?.role === 'SUPER_ADMIN' || user?.isMasterAdmin === true;

      if (!isSuper) {
        // Clear session if not authorized
        localStorage.removeItem('agenda_token');
        await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        setError('Acesso negado: este login é exclusivo para a administração central da plataforma (Super Admin).');
        return;
      }

      if (data.token || data.data?.token) {
        localStorage.setItem('agenda_token', data.token || data.data?.token);
      }
      onLoginSuccess(user);
    } catch {
      setError('Erro de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Top Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/50">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider mb-1.5">
              <KeyRound className="w-3 h-3" />
              <span>Acesso Restrito · URL Secreta</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-serif tracking-tight text-white">
              Painel Super Admin SaaS
            </h1>
            <p className="text-xs text-stone-400 mt-1">
              Governança central, credenciamento exclusivo de novas lojas e faturamento
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
              E-mail do Administrador
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prwashingtondiasbh@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-950 border border-stone-800 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
              Senha de Acesso Master
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-950 border border-stone-800 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
          </div>

          <AntiBotChallenge resetKey={botResetKey} theme="dark" onChange={setBotGuard} />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-rose-900/30 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando Super Admin...</span>
              </>
            ) : (
              <>
                <span>Acessar Painel Master</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-2 border-t border-stone-800/80 text-center space-y-2">
          <p className="text-[11px] text-stone-500">
            Apenas operadores credenciados têm autorização para cadastrar novas lojas e gerenciar assinaturas.
          </p>
        </div>
      </div>
    </div>
  );
};
