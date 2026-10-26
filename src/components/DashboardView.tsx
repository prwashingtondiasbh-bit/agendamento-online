import React from 'react';
import { DashboardStats, Appointment, Service } from '../types';
import { DollarSign, Calendar, Users, Scissors, TrendingUp, CheckCircle, Clock } from 'lucide-react';

interface DashboardViewProps {
  stats: DashboardStats | null;
  appointments: Appointment[];
  services: Service[];
  onOpenNewAppointment: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  appointments,
  services,
  onOpenNewAppointment,
}) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const recentAppointments = appointments.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Faturamento Estimado</p>
            <h3 className="text-2xl font-bold text-stone-900 mt-2 tabular-nums">
              {stats ? formatCurrency(stats.totalRevenue) : 'R$ 0,00'}
            </h3>
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Receita de agendamentos</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Total Agendamentos</p>
            <h3 className="text-2xl font-bold text-stone-900 mt-2 tabular-nums">
              {stats ? stats.totalAppointments : 0}
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              {stats?.confirmedAppointments || 0} confirmados
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Clientes Cadastrados</p>
            <h3 className="text-2xl font-bold text-stone-900 mt-2 tabular-nums">
              {stats ? stats.totalClients : 0}
            </h3>
            <p className="text-xs text-stone-500 mt-1">Base ativa na base</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Serviços Ativos</p>
            <h3 className="text-2xl font-bold text-stone-900 mt-2 tabular-nums">
              {stats ? stats.totalServices : 0}
            </h3>
            <p className="text-xs text-stone-500 mt-1">Catálogo de nail design</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Scissors className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Recent Appointments & Services Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Appointments List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-stone-900">Próximos Agendamentos</h3>
              <p className="text-xs text-stone-500">Agenda de horários e status em tempo real</p>
            </div>
            <button
              onClick={onOpenNewAppointment}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              + Novo Horário
            </button>
          </div>

          {recentAppointments.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum agendamento registrado ainda.</p>
              <button
                onClick={onOpenNewAppointment}
                className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition-colors"
              >
                Criar Primeiro Agendamento
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-stone-400 uppercase tracking-wider">
                    <th className="py-3 font-semibold">Cliente</th>
                    <th className="py-3 font-semibold">Serviço</th>
                    <th className="py-3 font-semibold">Profissional</th>
                    <th className="py-3 font-semibold">Data / Hora</th>
                    <th className="py-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {recentAppointments.map((app) => {
                    const dateFormatted = new Date(app.dateTime).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    });
                    return (
                      <tr key={app.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="py-3.5 font-medium text-stone-900">
                          {app.client?.name || 'Cliente'}
                        </td>
                        <td className="py-3.5 text-stone-600">{app.service?.name || 'Serviço'}</td>
                        <td className="py-3.5 text-stone-600">{app.professional?.name || 'Profissional'}</td>
                        <td className="py-3.5 text-stone-500 font-mono text-xs tabular-nums">{dateFormatted}</td>
                        <td className="py-3.5 text-right">
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
                            {app.status === 'CONFIRMED' ? 'Confirmado' : app.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Popular Services & Quick Info */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-stone-900 mb-1">Serviços em Destaque</h3>
            <p className="text-xs text-stone-500 mb-6">Principais procedimentos do estúdio</p>

            <div className="space-y-4">
              {services.slice(0, 4).map((serv) => (
                <div key={serv.id} className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <div>
                    <h4 className="font-semibold text-sm text-stone-900">{serv.name}</h4>
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{serv.durationMin} min</span>
                    </p>
                  </div>
                  <span className="font-bold text-sm text-rose-600 tabular-nums">
                    {formatCurrency(Number(serv.price))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-stone-100 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
            <h4 className="font-semibold text-xs text-rose-900 uppercase tracking-wide">Dica de Gestão</h4>
            <p className="text-xs text-rose-700 mt-1">
              Mantenha o cadastro de suas clientes sempre atualizado para enviar lembretes de manutenção de alongamento em gel (15 a 21 dias).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
