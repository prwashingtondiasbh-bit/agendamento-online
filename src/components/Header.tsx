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
    <header className="bg-white border-b border-stone-200 px-4 sm:px-8 py-3.5 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 shrink-0">
      <div className="min-w-0">
        <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-stone-900 truncate">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 mt-0.5 line-clamp-2 sm:line-clamp-1">
          {subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <div className="hidden lg:flex items-center gap-2 text-xs text-stone-500 bg-stone-50 border border-stone-200 px-3 py-2 rounded-lg font-mono">
          <CalendarIcon className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="capitalize">{currentDateFormatted}</span>
        </div>

        <button
          onClick={onOpenNewAppointment}
          className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all hover:shadow-md whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Novo Agendamento</span>
        </button>
      </div>
    </header>
  );
};
