import React, { useState } from 'react';
import { Sparkles, Link2, ArrowRight, Building2, Shield, CalendarCheck, Lock, QrCode } from 'lucide-react';

interface PublicLandingPageProps {
  onOpenStore: (slug: string) => void;
  onOpenOwnerLogin: () => void;
  onOpenSuperAdminLogin: () => void;
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({
  onOpenStore,
  onOpenOwnerLogin,
  onOpenSuperAdminLogin,
}) => {
  const [storeQuery, setStoreQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = storeQuery
      .trim()
      .toLowerCase()
      .replace(/^.*\/agendar\//, '')
      .replace(/^\/+|\/+$/g, '');
    if (clean) {
      onOpenStore(clean);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-200/80 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-400 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-stone-900 text-sm sm:text-base font-serif">Nuvem Agenda</span>
              <span className="hidden sm:inline-block ml-2 text-[11px] text-stone-500 font-medium">
                · Plataforma Oficial de Agendamento
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenOwnerLogin}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-stone-600" />
              <span>Área do Lojista</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-10">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            <span>Acesso Exclusivo pelo Link do Estabelecimento</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold font-serif text-stone-900 tracking-tight leading-tight">
            Acesse o salão ou clínica pelo link oficial da loja
          </h1>
          <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
            Cada estabelecimento parceiro possui um endereço exclusivo. Cole abaixo o link enviado pelo seu salão (ex: <code className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">/agendar/nome-da-loja</code>) para realizar seu agendamento ou acessar sua conta na loja.
          </p>
        </div>

        {/* Direct Link Input */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-stone-200/90 shadow-lg shadow-stone-200/50 max-w-2xl mx-auto">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
                placeholder="Informe o identificador da loja (ex: agenda-beauty-sp)..."
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs sm:text-sm text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
            <button
              type="submit"
              className="py-3 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <span>Abrir Link da Loja</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Platform Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-2">
          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-stone-900">Conta Única por Cliente</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Use o mesmo login em diferentes estabelecimentos, mantendo seu painel e histórico separados por loja.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-stone-900">Sinal Pix Transparente</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Confirmação automática de sinal via Pix e acompanhamento em tempo real no painel da loja.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-stone-900">Vínculo Permanente</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Seus agendamentos, comprovantes e benefícios permanecem vinculados com segurança a cada loja.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <div>
            <span>© {new Date().getFullYear()} Nuvem Agenda SaaS · Todos os direitos reservados.</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onOpenOwnerLogin}
              className="hover:text-stone-900 underline transition-colors"
            >
              Acesso do Lojista
            </button>
            <span>·</span>
            <button
              onClick={onOpenSuperAdminLogin}
              className="hover:text-stone-900 text-stone-400 hover:text-stone-600 text-[11px] transition-colors flex items-center gap-1"
              title="Acesso restrito da administração central"
            >
              <Shield className="w-3 h-3" />
              <span>Painel Master</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
