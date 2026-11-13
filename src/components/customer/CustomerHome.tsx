import React from 'react';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Sparkles,
  CreditCard,
  QrCode,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  CalendarPlus,
  Building2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface CustomerHomeProps {
  customer: any;
  business: any;
  nextAppointment: any;
  appointments?: { upcoming: any[]; past: any[]; all: any[]; pendingDeposits?: any[] };
  payments?: any[];
  pendingDeposits?: any[];
  onNavigateTab: (tab: string) => void;
  onOpenBooking: () => void;
  onOpenPix: (appointment: any) => void;
  onSelectAppointment: (appointment: any) => void;
  onContinuePayment?: (appointment: any) => void;
  onCancelPending?: (appointment: any) => void;
}

export const CustomerHome: React.FC<CustomerHomeProps> = ({
  customer,
  business,
  nextAppointment,
  appointments,
  payments = [],
  pendingDeposits = [],
  onNavigateTab,
  onOpenBooking,
  onOpenPix,
  onSelectAppointment,
  onContinuePayment,
  onCancelPending,
}) => {
  const firstName = customer?.name ? customer.name.split(' ')[0] : 'Cliente';
  const allApps = appointments?.all || [];

  const effectivePendingDeposits =
    pendingDeposits.length > 0
      ? pendingDeposits
      : allApps.filter(
          (a: any) =>
            a.status === 'PENDING_PAYMENT' &&
            Number(a.depositAmountCents || 0) > 0 &&
            a.canContinuePayment !== false
        );

  const confirmedCount = allApps.filter((a: any) => a.status === 'CONFIRMED').length;
  const completedCount = allApps.filter((a: any) => a.status === 'COMPLETED').length;
  const cancelledOrExpiredCount = allApps.filter((a: any) =>
    ['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(a.status)
  ).length;
  const approvedPaymentsCount = payments.filter((p: any) => p.status === 'APPROVED').length;

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const dayName = d.toLocaleDateString('pt-BR', { weekday: 'long' });
      const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const dayNum = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${capitalizedDay}, ${dayNum} às ${time}`;
    } catch {
      return dateStr;
    }
  };

  const formatShortDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const dayMonth = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dayMonth} às ${time}`;
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Confirmado
          </span>
        );
      case 'PENDING_PAYMENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            Aguardando pagamento
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-100 text-stone-800 border border-stone-200">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-600"></span>
            Aguardando Confirmação
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-100 text-stone-600 border border-stone-300">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
            Expirado
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-50 text-rose-800 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-100 text-stone-700 border border-stone-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome & Active Store Identification Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-stone-900 text-white p-6 md:p-8 shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-stone-800/90 text-stone-300 text-xs font-medium mb-3 border border-stone-700">
            <Building2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Estabelecimento Ativo: <strong className="text-white">{business?.name || 'Estabelecimento'}</strong></span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-serif">
            Olá, {firstName}!
          </h1>
          <p className="mt-2 text-stone-300 text-sm leading-relaxed">
            Você está no painel exclusivo de <strong className="text-white">{business?.name || 'sua loja'}</strong>. Acompanhe seus horários, sinais Pix e histórico neste estabelecimento.
          </p>

          {(business?.address || business?.phone) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-300">
              {business?.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{business.address}</span>
                </span>
              )}
              {business?.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{business.phone}</span>
                </span>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3">
            <button
              onClick={onOpenBooking}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Agendar em {business?.name || 'Loja'}</span>
            </button>
            <button
              onClick={() => onNavigateTab('appointments')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-all"
            >
              <Calendar className="w-4 h-4 text-stone-400" />
              <span>Meus Agendamentos</span>
            </button>
          </div>
        </div>

        {/* Decorative subtle backdrop elements */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* MANDATORY PENDING DEPOSIT ALERT BANNER (Section 8) */}
      {effectivePendingDeposits.length > 0 && (
        <div className="space-y-3" data-testid="pending-deposit-alert-section">
          {effectivePendingDeposits.map((pendingApp: any) => (
            <div
              key={pendingApp.id}
              className="rounded-2xl border-2 border-amber-300 bg-amber-50/95 p-5 sm:p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-200/80 text-amber-950 text-[11px] font-bold uppercase tracking-wider">
                      Pagamento pendente
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-stone-900 mt-1">
                      Confirme sua reserva com o pagamento do sinal Pix
                    </h2>
                    <p className="text-xs text-stone-700 mt-0.5">
                      Seu horário está pré-reservado e aguarda a confirmação do sinal antecipado.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-white text-amber-900 border border-amber-300 self-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                  Status: Aguardando pagamento
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white rounded-xl p-4 border border-amber-200 text-xs">
                <div>
                  <span className="text-stone-500 block">Loja</span>
                  <strong className="text-stone-900 font-semibold">
                    {business?.name || pendingApp.establishment?.name || 'Estabelecimento'}
                  </strong>
                </div>
                <div>
                  <span className="text-stone-500 block">Serviço</span>
                  <strong className="text-stone-900 font-semibold">
                    {pendingApp.service?.name || 'Serviço'}
                  </strong>
                </div>
                <div>
                  <span className="text-stone-500 block">Data</span>
                  <strong className="text-stone-900 font-semibold">
                    {formatShortDateTime(pendingApp.dateTime)}
                  </strong>
                </div>
                <div>
                  <span className="text-stone-500 block">Valor do sinal</span>
                  <strong className="text-rose-600 font-bold text-sm">
                    {pendingApp.formattedDeposit || 'R$ 0,00'}
                  </strong>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
                {onCancelPending && (
                  <button
                    onClick={() => onCancelPending(pendingApp)}
                    className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors"
                  >
                    Desistir / Liberar horário
                  </button>
                )}
                <button
                  onClick={() => onSelectAppointment(pendingApp)}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-stone-100 text-stone-800 border border-amber-300 text-xs font-semibold transition-colors"
                >
                  Ver detalhes do agendamento
                </button>
                <button
                  onClick={() => {
                    if (onContinuePayment) {
                      onContinuePayment(pendingApp);
                    } else {
                      onSelectAppointment(pendingApp);
                      onOpenPix(pendingApp);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Continuar pagamento</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Store-Scoped Summary Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => onNavigateTab('appointments')}
          className="bg-white rounded-xl border border-stone-200 p-3.5 cursor-pointer hover:border-emerald-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Confirmados</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-stone-900 mt-1 tabular-nums">{confirmedCount}</p>
        </div>

        <div
          onClick={() => onNavigateTab('appointments')}
          className="bg-white rounded-xl border border-stone-200 p-3.5 cursor-pointer hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Sinais Pendentes</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-stone-900 mt-1 tabular-nums">{effectivePendingDeposits.length}</p>
        </div>

        <div
          onClick={() => onNavigateTab('payments')}
          className="bg-white rounded-xl border border-stone-200 p-3.5 cursor-pointer hover:border-rose-300 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Pagamentos Realizados</span>
            <CreditCard className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-xl font-bold text-stone-900 mt-1 tabular-nums">{approvedPaymentsCount}</p>
        </div>

        <div
          onClick={() => onNavigateTab('appointments')}
          className="bg-white rounded-xl border border-stone-200 p-3.5 cursor-pointer hover:border-stone-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Histórico / Cancelados</span>
            <XCircle className="w-4 h-4 text-stone-500" />
          </div>
          <p className="text-xl font-bold text-stone-900 mt-1 tabular-nums">
            {completedCount + cancelledOrExpiredCount}
          </p>
        </div>
      </div>

      {/* Next Appointment Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-rose-600" />
            <span>Próximo Atendimento em {business?.name || 'Loja'}</span>
          </h2>
          {nextAppointment && (
            <button
              onClick={() => onSelectAppointment(nextAppointment)}
              className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline inline-flex items-center gap-1"
            >
              Ver detalhes completos
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {nextAppointment ? (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
            {/* Header: Service + Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-stone-100">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-stone-600 tracking-wide">
                    {nextAppointment.service?.category || 'Atendimento'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold border border-rose-200">
                    {business?.name || nextAppointment.establishment?.name}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-stone-900 mt-0.5">
                  {nextAppointment.service?.name || 'Serviço Selecionado'}
                </h3>
                <p className="text-xs text-stone-600 mt-1 flex items-center gap-2">
                  <span>Duração estimada: {nextAppointment.service?.durationMin || nextAppointment.snapshotDurationMin || 60} min</span>
                </p>
              </div>
              <div className="self-start sm:self-auto">
                {getStatusBadge(nextAppointment.status)}
              </div>
            </div>

            {/* Date, Time, Professional & Salon Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-stone-700">
              <div className="space-y-3 bg-stone-50/70 p-4 rounded-xl border border-stone-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-stone-600 block">Data e Horário</span>
                    <strong className="text-stone-900 text-sm font-semibold">
                      {formatDateTime(nextAppointment.dateTime)}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-200 text-stone-700 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-stone-600 block">Profissional Responsável</span>
                    <strong className="text-stone-900 font-semibold">
                      {nextAppointment.professional?.name || 'Profissional do Salão'}
                    </strong>
                    {nextAppointment.professional?.specialty && (
                      <span className="text-stone-600 block">
                        {nextAppointment.professional.specialty}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 bg-stone-50/70 p-4 rounded-xl border border-stone-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-stone-600 block">Local de Atendimento</span>
                    <strong className="text-stone-900 font-semibold">
                      {business?.name || 'Nuvem Agenda Studio'}
                    </strong>
                    <span className="text-stone-600 block">
                      {business?.address || 'Endereço informado pelo estabelecimento'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-stone-600 block">Contato do Salão</span>
                    <strong className="text-stone-900 font-semibold">
                      {business?.phone || '(11) 98765-4321'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
              <div className="text-xs font-semibold text-stone-900 mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-stone-600" />
                <span>Resumo Financeiro da Reserva</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center py-1 tabular-nums">
                <div className="bg-white p-2.5 rounded-lg border border-stone-100 flex sm:block items-center justify-between">
                  <span className="text-stone-600 text-[11px] block">Valor Total</span>
                  <span className="text-stone-900 font-bold text-sm">
                    {nextAppointment.formattedTotal || 'R$ 0,00'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-stone-100 flex sm:block items-center justify-between">
                  <span className="text-stone-600 text-[11px] block">Sinal da Reserva</span>
                  <span className="text-rose-600 font-bold text-sm">
                    {nextAppointment.formattedDeposit || 'R$ 0,00'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-stone-100 flex sm:block items-center justify-between">
                  <span className="text-stone-600 text-[11px] block">Saldo no Salão</span>
                  <span className="text-stone-700 font-bold text-sm">
                    {nextAppointment.formattedBalance || 'R$ 0,00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions for next appointment */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-xs text-stone-600 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Reserva protegida pelo Nuvem Agenda</span>
              </div>

              <div className="flex items-center gap-2">
                {nextAppointment.status === 'PENDING_PAYMENT' && nextAppointment.canContinuePayment !== false && (
                  <button
                    onClick={() => {
                      if (onContinuePayment) {
                        onContinuePayment(nextAppointment);
                      } else {
                        onOpenPix(nextAppointment);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Continuar pagamento</span>
                  </button>
                )}
                <button
                  onClick={() => onSelectAppointment(nextAppointment)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition-all"
                >
                  <span>Detalhes da Reserva</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <CalendarPlus className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-base font-semibold text-stone-900">
                Você não possui nenhum agendamento próximo em {business?.name || 'sua loja'}
              </h3>
              <p className="text-stone-600 text-xs mt-1 leading-relaxed">
                Escolha seu serviço preferido, selecione o melhor horário e garanta sua reserva em poucos segundos.
              </p>
            </div>
            <button
              onClick={onOpenBooking}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Agendar Atendimento Agora</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigateTab('appointments')}
          className="bg-white p-5 rounded-2xl border border-stone-200 hover:border-rose-300 hover:shadow-sm cursor-pointer transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-stone-100 group-hover:bg-rose-50 text-stone-700 group-hover:text-rose-600 flex items-center justify-center transition-colors">
            <Calendar className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-stone-900 mt-3 group-hover:text-rose-600 transition-colors">
            Meus Agendamentos
          </h4>
          <p className="text-xs text-stone-600 mt-1">
            Consulte horários confirmados, pendentes, cancelados e o histórico em {business?.name || 'sua loja'}.
          </p>
          <div className="mt-4 flex items-center text-xs font-medium text-rose-600 gap-1">
            <span>Acessar</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('payments')}
          className="bg-white p-5 rounded-2xl border border-stone-200 hover:border-emerald-300 hover:shadow-sm cursor-pointer transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-stone-100 group-hover:bg-emerald-50 text-stone-700 group-hover:text-emerald-600 flex items-center justify-center transition-colors">
            <CreditCard className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-stone-900 mt-3 group-hover:text-emerald-600 transition-colors">
            Meus Pagamentos
          </h4>
          <p className="text-xs text-stone-600 mt-1">
            Veja os comprovantes dos sinais pagos via Pix exclusivamente em {business?.name || 'sua loja'}.
          </p>
          <div className="mt-4 flex items-center text-xs font-medium text-emerald-600 gap-1">
            <span>Acessar</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('profile')}
          className="bg-white p-5 rounded-2xl border border-stone-200 hover:border-stone-400 hover:shadow-sm cursor-pointer transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-stone-100 group-hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors">
            <User className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-stone-900 mt-3">
            Meus Dados
          </h4>
          <p className="text-xs text-stone-600 mt-1">
            Atualize seu telefone / WhatsApp, e-mail e preferências de confirmação.
          </p>
          <div className="mt-4 flex items-center text-xs font-medium text-stone-700 gap-1">
            <span>Acessar</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
