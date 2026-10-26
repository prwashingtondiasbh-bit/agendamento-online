import React, { useState } from 'react';
import { Appointment } from '../types';
import { Calendar, Search, CheckCircle, XCircle, Clock, Check } from 'lucide-react';

interface AppointmentsViewProps {
  appointments: Appointment[];
  onOpenNewAppointment: () => void;
  onUpdateStatus: (id: string, status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED') => void;
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  appointments,
  onOpenNewAppointment,
  onUpdateStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = appointments.filter(app => {
    const matchesSearch =
      app.client?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.service?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.professional?.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Filters & Actions Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, serviço ou profissional..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['ALL', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((st) => {
            const label =
              st === 'ALL'
                ? 'Todos'
                : st === 'CONFIRMED'
                ? 'Confirmados'
                : st === 'COMPLETED'
                ? 'Concluídos'
                : 'Cancelados';
            const isActive = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Appointments Table */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">Nenhum agendamento encontrado para este filtro.</p>
            <button
              onClick={onOpenNewAppointment}
              className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-medium hover:bg-rose-700 transition-colors"
            >
              Novo Agendamento
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6 font-semibold">Cliente & Contato</th>
                  <th className="py-3.5 px-6 font-semibold">Serviço</th>
                  <th className="py-3.5 px-6 font-semibold">Profissional</th>
                  <th className="py-3.5 px-6 font-semibold">Data e Horário</th>
                  <th className="py-3.5 px-6 font-semibold">Valor</th>
                  <th className="py-3.5 px-6 font-semibold">Status</th>
                  <th className="py-3.5 px-6 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((app) => {
                  const dateFormatted = new Date(app.dateTime).toLocaleString('pt-BR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });
                  return (
                    <tr key={app.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-semibold text-stone-900">{app.client?.name || 'Cliente'}</p>
                        <p className="text-xs text-stone-500">{app.client?.phone || '-'}</p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-medium text-stone-800">{app.service?.name || 'Serviço'}</p>
                        <p className="text-xs text-stone-500">{app.service?.durationMin || 60} min</p>
                      </td>
                      <td className="py-4 px-6 text-stone-600 font-medium">
                        {app.professional?.name || '-'}
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-stone-600 tabular-nums">
                        {dateFormatted}
                      </td>
                      <td className="py-4 px-6 font-bold text-stone-900 tabular-nums">
                        {formatCurrency(Number(app.totalAmount))}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            app.status === 'CONFIRMED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : app.status === 'COMPLETED'
                              ? 'bg-blue-50 text-blue-700'
                              : app.status === 'CANCELLED'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {app.status === 'CONFIRMED' && <CheckCircle className="w-3 h-3" />}
                          {app.status === 'CONFIRMED'
                            ? 'Confirmado'
                            : app.status === 'COMPLETED'
                            ? 'Concluído'
                            : app.status === 'CANCELLED'
                            ? 'Cancelado'
                            : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        {app.status !== 'COMPLETED' && (
                          <button
                            onClick={() => onUpdateStatus(app.id, 'COMPLETED')}
                            title="Marcar como Concluído"
                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {app.status !== 'CANCELLED' && (
                          <button
                            onClick={() => onUpdateStatus(app.id, 'CANCELLED')}
                            title="Cancelar Agendamento"
                            className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
