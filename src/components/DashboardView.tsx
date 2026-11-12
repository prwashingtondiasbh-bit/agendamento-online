import React from 'react';
import { DashboardStats, Appointment, Service } from '../types';
import {
  CalendarCheck,
  Clock,
  Users,
  Scissors,
  Plus,
  AlertTriangle,
  UserX,
  XCircle,
  CheckCircle2,
  Percent,
  Info,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface DashboardViewProps {
  stats: DashboardStats | null;
  appointments: Appointment[];
  services: Service[];
  requireDeposit?: boolean;
  onOpenNewAppointment: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  appointments,
  services,
  requireDeposit = true,
  onOpenNewAppointment,
  onNavigateTab,
}) => {
  const now = new Date();
  const todayStr = stats?.todayDate || now.toISOString().split('T')[0];

  const todayAppointments = appointments
    .filter((a) => {
      try {
        return new Date(a.dateTime).toISOString().split('T')[0] === todayStr;
      } catch {
        return false;
      }
    })
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  const upcomingAppointments = appointments
    .filter(
      (a) =>
        ['CONFIRMED', 'PENDING', 'PENDING_PAYMENT', 'IN_PROGRESS'].includes(a.status) &&
        new Date(a.dateTime).getTime() >= now.getTime()
    )
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    .slice(0, 6);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Confirmado
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            Em atendimento
          </span>
        );
      case 'PENDING':
      case 'PENDING_PAYMENT':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            {requireDeposit || status === 'PENDING_PAYMENT' ? 'Aguardando Sinal' : 'Pendente'}
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">
            Concluído
          </span>
        );
      case 'NO_SHOW':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            Não compareceu
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Cancelado
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-500">
            {status}
          </span>
        );
    }
  };

  const hasAnyData = appointments.length > 0 || (stats?.totalClients || 0) > 0;

  return (
    <div className="space-y-8">
      {/* Pending Cancellation Alert Banner */}
      {(stats?.pendingCancellationRequestsCount || 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                Atenção: {stats?.pendingCancellationRequestsCount} solicitação(ões) de cancelamento pendente(s)
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                {requireDeposit
                  ? 'Existem pedidos aguardando análise ou execução de reembolso no painel.'
                  : 'Existem pedidos de cancelamento aguardando análise no painel.'}
              </p>
            </div>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('cancellations')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors shrink-0"
            >
              <span>Analisar solicitações</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Onboarding Empty State when establishment has no movement */}
      {!hasAnyData && (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-8 shadow-sm text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-stone-900">Bem-vinda ao painel operacional do seu estúdio!</h3>
          <p className="text-sm text-stone-600 leading-relaxed">
            Seu estabelecimento ainda não possui movimentação registrada. Para começar a operar:
            cadastre seus serviços, configure a escala das profissionais e registre o primeiro agendamento manual ou compartilhe o portal da cliente.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={onOpenNewAppointment}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Primeiro Agendamento</span>
            </button>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('services')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-all"
              >
                <Scissors className="w-4 h-4" />
                <span>Ver Catálogo de Serviços</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Primary Operational Cards for Today */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500">
            Resumo Operacional de Hoje ({new Date(`${todayStr}T12:00:00`).toLocaleDateString('pt-BR')})
          </h3>
          <span className="text-xs text-stone-400">Dados em tempo real do estabelecimento</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Agendamentos de Hoje</p>
              <h3 className="text-2xl font-bold text-stone-900 mt-1.5">{stats?.todayAppointmentsCount ?? todayAppointments.length}</h3>
              <p className="text-xs text-stone-500 mt-1">
                {stats?.completedTodayCount ?? 0} concluído(s) hoje
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <CalendarCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Próximos Atendimentos</p>
              <h3 className="text-2xl font-bold text-stone-900 mt-1.5">{stats?.upcomingAppointmentsCount ?? upcomingAppointments.length}</h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">
                {stats?.availableSlotsToday ?? 0} horário(s) livre(s) hoje
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Concluídos / Faltas</p>
              <h3 className="text-2xl font-bold text-stone-900 mt-1.5">
                {stats?.completedAppointments ?? 0}{' '}
                <span className="text-sm font-normal text-stone-400">/ {stats?.noShowCount ?? 0} faltas</span>
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                {stats?.cancelledCount ?? 0} cancelamento(s) no período
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Clientes Cadastradas</p>
              <h3 className="text-2xl font-bold text-stone-900 mt-1.5">{stats?.totalClients ?? 0}</h3>
              <p className="text-xs text-stone-500 mt-1">
                {stats?.newClientsCount ?? 0} nova(s) · {stats?.recurringClientsCount ?? 0} recorrente(s)
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Performance Indicators (Section 3) */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
          <div>
            <h3 className="font-bold text-stone-900 text-base">Indicadores de Desempenho Operacional</h3>
            <p className="text-xs text-stone-500">
              {stats?.periodLabel || 'Cálculo baseado nos horários de expediente disponíveis, descontando intervalos e bloqueios'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 bg-stone-100 px-3 py-1 rounded-lg">
            <Info className="w-3.5 h-3.5 text-stone-400" />
            <span>Métricas reais sem dados fictícios</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60">
            <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
              <span>Taxa de Ocupação (Hoje)</span>
              <Percent className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">{stats?.occupancyRatePercent ?? 0}%</p>
            <div className="w-full bg-stone-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-rose-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, stats?.occupancyRatePercent ?? 0)}%` }}
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              {stats?.bookedMinutesToday ?? 0} min ocupados de {stats?.availableMinutesToday ?? 0} min disponíveis
            </p>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60">
            <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
              <span>Taxa de Cancelamento</span>
              <XCircle className="w-4 h-4 text-stone-400" />
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">{stats?.cancellationRatePercent ?? 0}%</p>
            <p className="text-[11px] text-stone-500 mt-2">
              {stats?.cancelledCount ?? 0} cancelado(s) sobre {stats?.totalAppointments ?? 0} agendamento(s)
            </p>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60">
            <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
              <span>Faltas Registradas (No-Show)</span>
              <UserX className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">{stats?.noShowCount ?? 0}</p>
            <p className="text-[11px] text-stone-500 mt-2">
              Clientes que não compareceram ao atendimento
            </p>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60">
            <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
              <span>Novas vs. Recorrentes</span>
              <Users className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">
              {stats?.newClientsCount ?? 0} <span className="text-sm font-normal text-stone-400">/ {stats?.recurringClientsCount ?? 0}</span>
            </p>
            <p className="text-[11px] text-stone-500 mt-2">
              {stats?.newClientsCount ?? 0} em 1º atendimento · {stats?.recurringClientsCount ?? 0} fidelizadas
            </p>
          </div>
        </div>

        {stats?.formulas && (
          <div className="text-[11px] text-stone-500 bg-stone-50/80 border border-stone-200/60 rounded-xl p-3 space-y-1">
            <p><strong>Critério de Ocupação:</strong> {stats.formulas.occupancy}</p>
            <p><strong>Critério de Cancelamento:</strong> {stats.formulas.cancellation}</p>
            <p><strong>Classificação de Clientes:</strong> {stats.formulas.clientsClassification}</p>
          </div>
        )}
      </div>

      {/* Main Content Grid: Today's Schedule & Upcoming Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Upcoming / Today's Schedule */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-stone-100 flex flex-col xs:flex-row xs:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-stone-900 text-base sm:text-lg">Próximos Atendimentos na Agenda</h3>
              <p className="text-xs text-stone-500">
                {requireDeposit
                  ? 'Horários confirmados, em andamento ou aguardando sinal'
                  : 'Horários confirmados ou em andamento'}
              </p>
            </div>
            <button
              onClick={onOpenNewAppointment}
              className="min-h-[40px] text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center justify-center gap-1 bg-rose-50 px-3 py-2 rounded-xl transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Novo Agendamento</span>
            </button>
          </div>

          <div className="divide-y divide-stone-100">
            {upcomingAppointments.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-stone-400 space-y-2">
                <p className="text-sm font-medium text-stone-600">Nenhum atendimento futuro agendado no momento.</p>
                <p className="text-xs text-stone-400">
                  Clique em "Novo Agendamento" para registrar um horário manualmente.
                </p>
              </div>
            ) : (
              upcomingAppointments.map((app) => {
                const dateObj = new Date(app.dateTime);
                const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

                return (
                  <div
                    key={app.id}
                    className="p-4 sm:p-5 hover:bg-stone-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
                      <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-xl bg-stone-100 flex flex-col items-center justify-center text-stone-700 shrink-0 border border-stone-200/60">
                        <span className="text-[11px] font-bold uppercase text-rose-600">{dateStr}</span>
                        <span className="text-sm font-extrabold">{timeStr}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-stone-900 text-sm sm:text-base truncate">
                          {app.client?.name || 'Cliente'}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 mt-0.5">
                          <span className="font-medium text-stone-700">{app.service?.name || 'Serviço'}</span>
                          <span>•</span>
                          <span>Prof: {app.professional?.name || 'Equipe'}</span>
                          {app.origin && (
                            <span className="uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                              {app.origin}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pl-16 sm:pl-0">
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-bold text-stone-900">
                          R$ {(Number(app.snapshotPriceCents ?? app.totalAmountCents ?? 0) / 100).toFixed(2)}
                        </p>
                        <p className="text-xs text-stone-400">
                          {app.snapshotDurationMin || app.service?.durationMin || 60} min
                        </p>
                      </div>
                      {getStatusBadge(app.status)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Active Services Summary */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 sm:p-6 border-b border-stone-100">
            <h3 className="font-bold text-stone-900 text-base sm:text-lg">Serviços Ativos</h3>
            <p className="text-xs text-stone-500">Procedimentos disponíveis para reserva</p>
          </div>

          <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
            <div className="space-y-3 sm:space-y-4">
              {services.filter((s) => s.active !== false).length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-6">Nenhum serviço ativo cadastrado.</p>
              ) : (
                services
                  .filter((s) => s.active !== false)
                  .slice(0, 5)
                  .map((service) => (
                    <div key={service.id} className="flex items-center justify-between gap-2 p-3.5 rounded-xl bg-stone-50 border border-stone-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-rose-100/80 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0">
                          <Scissors className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-stone-900 truncate">{service.name}</h4>
                          <p className="text-xs text-stone-400 truncate">
                            {service.durationMin} minutos • {service.category}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-stone-900 shrink-0">
                        R$ {(Number(service.priceCents || 0) / 100).toFixed(2)}
                      </span>
                    </div>
                  ))
              )}
            </div>

            <div className="p-4 rounded-xl bg-stone-900 text-white mt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone-400 uppercase font-semibold">Capacidade Hoje</p>
                  <p className="text-lg font-bold text-rose-400 mt-0.5">
                    {stats?.availableSlotsToday ?? 0} horários livres
                  </p>
                </div>
                <Clock className="w-8 h-8 text-stone-700" />
              </div>
              <p className="text-[11px] text-stone-400 mt-2">
                Calculado com base na escala das profissionais ativas e bloqueios do dia.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
