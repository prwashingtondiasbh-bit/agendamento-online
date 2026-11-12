import React, { useState } from 'react';
import {
  Sparkles,
  Lock,
  Mail,
  User,
  Building,
  ArrowRight,
  CheckCircle,
  KeyRound,
  AlertCircle,
  Loader2,
  Phone,
  MessageSquare,
  Heart,
} from 'lucide-react';
import { AntiBotChallenge, BotGuardPayload } from './auth/AntiBotChallenge';

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
  onOpenPublicBooking?: (slug: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess, onOpenPublicBooking }) => {
  const [mode, setMode] = useState<'login' | 'customer_register' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'SIMPLE' | 'COMPLETE'>('COMPLETE');
  const [contactPreference, setContactPreference] = useState<'WHATSAPP' | 'SMS' | 'EMAIL'>('WHATSAPP');

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, botGuard }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.token || data.data?.token) {
          localStorage.setItem('agenda_token', data.token || data.data?.token);
        }
        onLoginSuccess(data.data.user);
      } else {
        setBotResetKey((k) => k + 1);
        setError(data.error || 'E-mail ou senha inválidos');
      }
    } catch {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/customer/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, phone, password, contactPreference, botGuard }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) {
          localStorage.setItem('agenda_token', data.token);
        }
        onLoginSuccess(data.data.user);
      } else {
        setBotResetKey((k) => k + 1);
        setError(data.error || 'Erro ao criar conta de cliente');
      }
    } catch {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password, businessName, phone, plan: selectedPlan, botGuard }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.token || data.data?.token) {
          localStorage.setItem('agenda_token', data.token || data.data?.token);
        }
        onLoginSuccess(data.data.user);
      } else {
        setBotResetKey((k) => k + 1);
        setError(data.error || 'Erro ao cadastrar empresa');
      }
    } catch {
      setError('Erro ao processar cadastro no servidor');
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
        body: JSON.stringify({ email, botGuard }),
      });
      const data = await res.json();
      setBotResetKey((k) => k + 1);
      if (data.success) {
        setSuccess('Instruções para redefinir a senha enviadas com sucesso!');
      } else {
        setError(data.error || 'E-mail não encontrado');
      }
    } catch {
      setError('Erro de comunicação');
    } finally {
      setLoading(false);
    }
  };

  const quickLoginAs = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('123456');
  };

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-3 sm:p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="bg-stone-900 px-5 sm:px-8 pt-6 sm:pt-8 pb-5 sm:pb-6 text-white text-center border-b border-stone-800">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-tr from-rose-600 to-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg shadow-rose-900/40">
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Agenda Beauty</h1>
          <p className="text-stone-400 text-xs mt-1">Plataforma SaaS Multiempresa para Salões & Clientes</p>

          <div className="flex bg-stone-800/80 p-1 rounded-xl mt-5 sm:mt-6 text-xs">
            <button
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className={`flex-1 min-h-[38px] py-1.5 px-2 font-semibold rounded-lg transition-all ${
                mode === 'login' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setMode('customer_register'); setError(''); setSuccess(''); }}
              className={`flex-1 min-h-[38px] py-1.5 px-2 font-semibold rounded-lg transition-all ${
                mode === 'customer_register' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-400 hover:text-white'
              }`}
            >
              Sou Cliente
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
              className={`flex-1 min-h-[38px] py-1.5 px-2 font-semibold rounded-lg transition-all ${
                mode === 'register' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-400 hover:text-white'
              }`}
            >
              Sou Salão
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-8">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                  E-mail de Acesso
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: beatriz@email.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase text-stone-600">Senha</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                    className="text-xs text-rose-600 hover:underline font-medium"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{loading ? 'Entrando...' : 'Entrar no Sistema'}</span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>

              {/* Quick access for testing roles */}
              <div className="mt-4 pt-4 border-t border-stone-100 space-y-2">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block text-center">
                  Acessos Rápidos de Demonstração
                </span>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => quickLoginAs('camila@agendabeauty.com.br')}
                    className="p-2.5 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-xl text-left transition-all"
                  >
                    <span className="text-[10px] text-stone-600 font-semibold uppercase block">Estabelecimento</span>
                    <strong className="text-xs text-stone-900 block truncate">Agenda Beauty SP</strong>
                  </button>
                </div>

                {onOpenPublicBooking && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenPublicBooking('agenda-beauty-sp')}
                      className="w-full py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                      <span>Testar Link Público Direto (/agendar/agenda-beauty-sp)</span>
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}

          {/* Customer Register Form */}
          {mode === 'customer_register' && (
            <form onSubmit={handleCustomerRegister} className="space-y-3.5">
              <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Crie sua conta única para agendar em qualquer estabelecimento parceiro do Agenda Beauty.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Seu Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Beatriz Lima"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">WhatsApp / Telefone</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Seu E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="beatriz@email.com"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Crie sua Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Receber Lembretes via:</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {['WHATSAPP', 'SMS', 'EMAIL'].map((pref) => (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => setContactPreference(pref as any)}
                      className={`py-1.5 px-2 rounded-lg border text-center transition-all ${
                        contactPreference === pref
                          ? 'border-rose-500 bg-rose-50 text-rose-700 font-bold'
                          : 'border-stone-200 text-stone-600'
                      }`}
                    >
                      {pref === 'WHATSAPP' ? 'WhatsApp' : pref === 'SMS' ? 'SMS' : 'E-mail'}
                    </button>
                  ))}
                </div>
              </div>

              <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{loading ? 'Cadastrando...' : 'Criar Minha Conta de Cliente'}</span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {/* Register / Salon Onboarding Form */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Plano Comercial Desejado</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedPlan('SIMPLE')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      selectedPlan === 'SIMPLE'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-200 bg-stone-50 text-stone-700'
                    }`}
                  >
                    <strong className="block font-bold">Plano Simples</strong>
                    <span className="text-[10px] opacity-80 block">Agenda sem sinal Pix</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPlan('COMPLETE')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      selectedPlan === 'COMPLETE'
                        ? 'border-rose-600 bg-rose-50 text-rose-900'
                        : 'border-stone-200 bg-stone-50 text-stone-700'
                    }`}
                  >
                    <strong className="block font-bold text-rose-700">Plano Completo</strong>
                    <span className="text-[10px] opacity-80 block">Agenda + Sinal Pix</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Seu Nome (Proprietário)</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Camila Souza"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Nome do Salão / Estúdio</label>
                <div className="relative">
                  <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Studio Nail Camila"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Telefone / WhatsApp</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">E-mail Profissional</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@studionail.com.br"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">Senha de Acesso</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{loading ? 'Cadastrando...' : 'Criar Minha Empresa'}</span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {/* Forgot Password */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-xs text-stone-600">
                Digite o e-mail cadastrado para receber um link de redefinição de senha.
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-stone-900"
                    required
                  />
                </div>
              </div>

              <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{loading ? 'Enviando...' : 'Recuperar Senha'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-900 pt-2 block"
              >
                Voltar para o login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
