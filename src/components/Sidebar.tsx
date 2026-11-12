import React, { useEffect } from 'react';
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
            <h1 className="font-bold text-lg tracking-tight text-white truncate">Agenda Beauty</h1>
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
    </>
  );
};
