import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Lock,
  Mail,
  User,
  Phone,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { AntiBotChallenge, BotGuardPayload } from './AntiBotChallenge';

interface CustomerLoginScreenProps {
  defaultSlug?: string;
  onLoginSuccess: (user: any, slug: string) => void;
  onOpenStoreBooking?: (slug: string) => void;
}

export const CustomerLoginScreen: React.FC<CustomerLoginScreenProps> = ({
  defaultSlug = 'agenda-beauty-sp',
  onLoginSuccess,
  onOpenStoreBooking,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [storeInfo, setStoreInfo] = useState<{ id: string; name: string; slug: string; address?: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [botResetKey, setBotResetKey] = useState(0);
  const [botGuard, setBotGuard] = useState<BotGuardPayload>({
    website: '',
    challengeToken: '',
    challengeAnswer: '',
    formRenderedAt: Date.now(),
  });

  const resolvedSlug =
    storeInfo?.slug ||
    (typeof window !== 'undefined' ? localStorage.getItem('agenda_last_store_slug') : null) ||
    defaultSlug;

  useEffect(() => {
    let cancelled = false;
    const targetSlug =
      (typeof window !== 'undefined' ? localStorage.getItem('agenda_last_store_slug') : null) || defaultSlug;

    fetch(`/api/v1/public/tenants/${encodeURIComponent(targetSlug)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const est = json?.data?.establishment || json?.data?.business;
        if (est?.id) {
          setStoreInfo({
            id: est.id,
            name: est.name || 'Agenda Beauty Studio',
            slug: est.slug || targetSlug,
            address: est.address,
          });
          if (est.slug && typeof window !== 'undefined') {
            try {
              localStorage.setItem('agenda_last_store_slug', est.slug);
            } catch {}
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [defaultSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const activeSlug = storeInfo?.slug || resolvedSlug;
      const activeTenantId = storeInfo?.id || 'biz-1';

      if (mode === 'forgot') {
        const res = await fetch('/api/v1/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            botGuard,
          }),
        });
        const data = await res.json().catch(() => ({}));
        setBotResetKey((k) => k + 1);
        if (data.success) {
          setSuccess('Instruções para redefinição de senha foram enviadas para o seu e-mail!');
        } else {
          setError(data.error || 'E-mail não localizado.');
        }
        return;
      }

      const endpoint = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/customer/auth/register';
      const payload =
        mode === 'login'
          ? {
              email: email.trim(),
              password,
              slug: activeSlug,
              tenantId: activeTenantId,
              portalType: 'CUSTOMER',
              botGuard,
            }
          : {
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim(),
              password,
              slug: activeSlug,
              tenantId: activeTenantId,
              botGuard,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setBotResetKey((k) => k + 1);
        setError(json.error || 'Falha na autenticação. Verifique os dados informados.');
        return;
      }

      const userObj = json.data?.user || {
        id: json.data?.customer?.userId || 'user-cust',
        name: name.trim() || json.data?.customer?.name || 'Cliente',
        email: email.trim(),
        role: json.data?.role || 'CUSTOMER',
      };

      if (userObj.role && userObj.role !== 'CUSTOMER') {
        localStorage.removeItem('agenda_token');
        await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        setError('Esta área é exclusiva para clientes. Para acessar o painel do estabelecimento, utilize o acesso de lojista.');
        return;
      }

      const token = json.token || json.data?.token;
      if (token) {
        localStorage.setItem('agenda_token', token);
      }
      if (activeSlug) {
        localStorage.setItem('agenda_last_store_slug', activeSlug);
      }

      onLoginSuccess(
        {
          ...userObj,
          role: 'CUSTOMER',
          linkedEstablishments: json.data?.linkedEstablishments || [],
        },
        activeSlug
      );
    } catch {
      setError('Erro de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-stone-900 px-6 sm:px-8 pt-7 pb-6 text-white text-center border-b border-stone-800">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-600 to-rose-400 flex items-center justify-center mx-auto mb-3.5 shadow-lg shadow-rose-950/40">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider mb-2">
            <span>Área Exclusiva do Cliente</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-serif tracking-tight text-white">
            {storeInfo?.name || 'Agenda Beauty Studio'}
          </h1>
          <p className="text-stone-400 text-xs mt-1">
            Entre na sua conta para agendar horários e acompanhar seus atendimentos
          </p>
        </div>

        {/* Mode Tabs */}
        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 gap-1 p-1.5 mx-6 sm:mx-8 mt-6 bg-stone-100 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setSuccess('');
                setBotResetKey((k) => k + 1);
              }}
              className={`py-2.5 text-xs font-bold rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Já sou Cliente
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
                setSuccess('');
                setBotResetKey((k) => k + 1);
              }}
              className={`py-2.5 text-xs font-bold rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Criar Minha Conta
            </button>
          </div>
        )}

        {/* Form Content */}
        <div className="p-6 sm:p-8 pt-5 space-y-5">
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                    Seu Nome Completo
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Maria Silva"
                      className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                    WhatsApp / Celular
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                Seu E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Sua Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setSuccess('');
                        setMode('forgot');
                      }}
                      className="text-xs text-rose-600 hover:underline font-medium"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 6 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>
            )}

            <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

            {mode === 'forgot' ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccess('');
                    setMode('login');
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
                  {loading ? 'Enviando...' : 'Recuperar Senha'}
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{mode === 'login' ? 'Entrando...' : 'Criando sua conta...'}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'login' ? 'Entrar na Minha Conta' : 'Cadastrar e Continuar'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </form>

          {onOpenStoreBooking && (
            <div className="pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => onOpenStoreBooking(resolvedSlug)}
                className="w-full py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4 text-rose-600" />
                <span>Ver Catálogo de Serviços e Agendar Horário</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
