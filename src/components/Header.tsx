import React from 'react';
import { Plus, Calendar as CalendarIcon, Clock } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle: string;
  onOpenNewAppointment: () => void;
  currency: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, onOpenNewAppointment }) => {
  const currentDateFormatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <header className="bg-white border-b border-stone-200 px-8 py-5 flex items-center justify-between gap-8 shrink-0">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h2>
        <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center gap-2 text-xs text-stone-500 bg-stone-50 border border-stone-200 px-3 py-2 rounded-lg font-mono">
          <CalendarIcon className="w-4 h-4 text-rose-500" />
          <span className="capitalize">{currentDateFormatted}</span>
        </div>

        <button
          onClick={onOpenNewAppointment}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all hover:shadow-md whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Agendamento</span>
        </button>
      </div>
    </header>
  );
};
