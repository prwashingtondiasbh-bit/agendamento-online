import React from 'react';
import { LayoutDashboard, Calendar, Users, Scissors, UserCheck, Settings, Sparkles } from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  businessName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, businessName }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'appointments', label: 'Agendamentos', icon: Calendar },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'services', label: 'Serviços & Preços', icon: Scissors },
    { id: 'professionals', label: 'Profissionais', icon: UserCheck },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-stone-900 text-stone-100 flex flex-col shrink-0 border-r border-stone-800">
      {/* Brand Header */}
      <div className="p-6 border-b border-stone-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-white">Agenda Beauty</h1>
          <p className="text-xs text-stone-400 truncate max-w-[140px]">{businessName}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                  : 'text-stone-300 hover:bg-stone-800/70 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-stone-800 text-xs text-stone-400 text-center">
        <p className="font-medium text-stone-300">Hostinger MySQL Ready</p>
        <p className="mt-0.5">Fuso: América/São Paulo</p>
      </div>
    </aside>
  );
};
