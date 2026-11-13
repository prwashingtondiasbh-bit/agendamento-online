import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  UserCheck,
  Settings,
  Sparkles,
  CreditCard,
  RotateCcw,
  LogOut,
  X,
  Wallet,
  MessageSquare,
  Award,
  Menu,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  businessName: string;
  userRole?: string;
  requireDeposit?: boolean;
  enableAdvancedFeatures?: boolean;
  onSwitchToCustomerPortal?: () => void;
  onLogout?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  businessName,
  userRole = 'OWNER',
  requireDeposit = true,
  enableAdvancedFeatures = false,
  onSwitchToCustomerPortal,
  onLogout,
  isMobileOpen = false,
  onCloseMobile,
  onOpenMobile,
}) => {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'Preencha todos os campos de senha.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'A nova senha e a confirmação não conferem.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordFeedback({ type: 'error', message: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setChangingPassword(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-session-token'] = token;
      }
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao alterar senha.');
      }
      setPasswordFeedback({ type: 'success', message: 'Senha alterada com sucesso!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordFeedback({ type: 'error', message: err.message || 'Erro ao alterar senha.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const allMenuItems = [
    {
      id: 'dashboard',
      label: 'Visão geral',
      shortLabel: 'Início',
      icon: LayoutDashboard,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL'],
    },
    {
      id: 'appointments',
      label: 'Agenda',
      shortLabel: 'Agenda',
      icon: Calendar,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL'],
    },
    {
      id: 'clients',
      label: 'Clientes',
      shortLabel: 'Clientes',
      icon: Users,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL'],
    },
    {
      id: 'services',
      label: 'Serviços',
      shortLabel: 'Serviços',
      icon: Scissors,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST'],
    },
    {
      id: 'professionals',
      label: 'Profissionais',
      shortLabel: 'Equipe',
      icon: UserCheck,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'],
    },
    {
      id: 'financial',
      label: 'Financeiro',
      shortLabel: 'Financeiro',
      icon: Wallet,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'PROFESSIONAL'],
    },
    {
      id: 'cancellations',
      label: 'Solicitações de cancelamento',
      shortLabel: 'Cancelamentos',
      icon: RotateCcw,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST'],
    },
    {
      id: 'payments',
      label: 'Pagamentos Pix',
      shortLabel: 'Pix',
      icon: CreditCard,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'],
      requiresDeposit: true,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp / Comunicação',
      shortLabel: 'WhatsApp',
      icon: MessageSquare,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST'],
    },
    {
      id: 'advanced',
      label: 'Recursos Avançados',
      shortLabel: 'Avançado',
      icon: Award,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL'],
      requiresAdvancedFeatures: true,
    },
    {
      id: 'settings',
      label: 'Configurações do estabelecimento',
      shortLabel: 'Ajustes',
      icon: Settings,
      roles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'],
    },
  ];

  const authorizedMenuItems = allMenuItems.filter(
    (item) =>
      item.roles.includes(userRole) &&
      (!item.requiresDeposit || requireDeposit) &&
      (!item.requiresAdvancedFeatures || enableAdvancedFeatures)
  );

  const primaryBottomTabs = authorizedMenuItems.slice(0, 4);

  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseMobile) {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const handleSelectTab = (id: string) => {
    setCurrentTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (
    <aside className="w-[85vw] max-w-64 lg:w-64 bg-stone-900 text-stone-100 flex flex-col shrink-0 border-r border-stone-800 h-full">
      {/* Brand Header */}
      <div className="p-4 sm:p-6 border-b border-stone-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg tracking-tight text-white truncate">Nuvem Agenda</h1>
            <p className="text-xs text-stone-400 truncate">{businessName}</p>
          </div>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 sm:px-4 py-4 sm:py-6 space-y-1.5 overflow-y-auto">
        {authorizedMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                  : 'text-stone-300 hover:bg-stone-800/70 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="truncate text-left">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Client Portal Shortcut */}
      {onSwitchToCustomerPortal && (
        <div className="px-4 pb-3">
          <button
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onSwitchToCustomerPortal();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30 transition-all"
          >
            <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Ver Portal da Cliente</span>
          </button>
        </div>
      )}

      {/* Change Password Button */}
      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={() => {
            setPasswordFeedback(null);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            if (onCloseMobile) onCloseMobile();
            setIsPasswordModalOpen(true);
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-stone-300 hover:bg-stone-800/80 hover:text-white transition-all"
        >
          <Lock className="w-4 h-4 shrink-0" />
          <span>Alterar Minha Senha</span>
        </button>
      </div>

      {/* Logout Button */}
      {onLogout && (
        <div className="px-4 pb-4">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-stone-300 hover:bg-rose-500/15 hover:text-rose-300 transition-all"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-4 border-t border-stone-800 text-xs text-stone-400 text-center">
        <p className="font-medium text-stone-300">Hostinger MySQL Ready</p>
        <p className="mt-0.5">Fuso: América/São Paulo</p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">{sidebarContent}</div>

      {/* Mobile / Tablet Drawer */}
      {isMobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação principal"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Navegação rápida mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200 px-1.5 pt-1 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.05)]"
      >
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {primaryBottomTabs.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id && !isMobileOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-colors ${
                  isActive
                    ? 'text-rose-600 font-semibold bg-rose-50/80'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-rose-600' : 'text-stone-500'}`} />
                <span className="text-[10px] leading-tight mt-1 truncate max-w-full">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => (isMobileOpen ? onCloseMobile?.() : onOpenMobile?.())}
            aria-expanded={isMobileOpen}
            aria-label="Abrir menu completo"
            className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-colors ${
              isMobileOpen || !primaryBottomTabs.some((i) => i.id === currentTab)
                ? 'text-rose-600 font-semibold bg-rose-50/80'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Menu className="w-4 h-4" />
            <span className="text-[10px] leading-tight mt-1 truncate max-w-full">Menu</span>
          </button>
        </div>
      </nav>

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 text-stone-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900 font-serif">Alterar Minha Senha</h3>
                  <p className="text-xs text-stone-500">Atualize sua senha de acesso ao painel.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordFeedback && (
              <div
                className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                  passwordFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                {passwordFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{passwordFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                  Senha Atual
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repita a nova senha"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Alterando...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Salvar Nova Senha</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
