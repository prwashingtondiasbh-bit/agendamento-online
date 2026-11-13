import React, { useState, useEffect } from 'react';
import { generateThirtyMinuteSlots } from '../../utils/timeSlots';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  CreditCard,
  QrCode,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  X,
  Phone,
  CalendarPlus,
  MessageCircle,
  RotateCcw,
  RefreshCw,
  Loader2,
} from 'lucide-react';

interface CustomerAppointmentsProps {
  appointments: {
    upcoming: any[];
    past: any[];
    all: any[];
  };
  business: any;
  selectedAppointment: any;
  onSelectAppointment: (appointment: any) => void;
  onCloseDetail: () => void;
  onOpenBooking: () => void;
  onOpenPix: (appointment: any) => void;
  onRefresh?: () => Promise<void> | void;
}

const DEFAULT_THIRTY_MIN_HOURS = generateThirtyMinuteSlots('08:00', '20:00');

export const CustomerAppointments: React.FC<CustomerAppointmentsProps> = ({
  appointments,
  business,
  selectedAppointment,
  onSelectAppointment,
  onCloseDetail,
  onOpenBooking,
  onOpenPix,
  onRefresh,
}) => {
  const [filterTab, setFilterTab] = useState<'upcoming' | 'past'>('upcoming');

  // Cancellation modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [eligibilityData, setEligibilityData] = useState<any | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmCancelAware, setConfirmCancelAware] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<{ type: 'success' | 'error'; message: string; refCode?: string } | null>(null);

  // Reschedule modal state
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [rescheduleTime, setRescheduleTime] = useState('15:00');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>(DEFAULT_THIRTY_MIN_HOURS);
  const [rescheduleOccupied, setRescheduleOccupied] = useState<string[]>([]);
  const [rescheduleDayBlocked, setRescheduleDayBlocked] = useState<boolean>(false);

  useEffect(() => {
    if (!rescheduleModalOpen || !selectedAppointment || !rescheduleDate) return;
    let cancelled = false;
    const tenantId = selectedAppointment.tenantId || business?.id || 'biz-1';
    const serviceId = selectedAppointment.serviceId || selectedAppointment.service?.id || '';
    const professionalId = selectedAppointment.professionalId || selectedAppointment.professional?.id || '';
    if (!serviceId || !professionalId) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-session-token', token);
    }

    fetch(
      `/api/v1/customer/available-slots?tenantId=${encodeURIComponent(tenantId)}&serviceId=${encodeURIComponent(serviceId)}&professionalId=${encodeURIComponent(professionalId)}&date=${encodeURIComponent(rescheduleDate)}`,
      { headers, credentials: 'include' }
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success) return;
        const occ: string[] = Array.isArray(json.data?.occupiedSlots)
          ? json.data.occupiedSlots.map((o: any) => o.time)
          : [];
        const allTimes: string[] = Array.isArray(json.data?.slots)
          ? json.data.slots.map((s: any) => s.time)
          : DEFAULT_THIRTY_MIN_HOURS;
        setRescheduleDayBlocked(json.data?.professionalWorksOnDate === false);
        setRescheduleSlots(allTimes);
        setRescheduleOccupied(occ);
        setRescheduleTime((prev) => {
          if (occ.includes(prev) || !allTimes.includes(prev)) {
            return allTimes.find((h) => !occ.includes(h)) || prev;
          }
          return prev;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [rescheduleModalOpen, selectedAppointment, rescheduleDate, business?.id]);

  const list = filterTab === 'upcoming' ? appointments.upcoming : appointments.past;

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-session-token', token);
    }
    return headers;
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' });
      const dayNum = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dayName}, ${dayNum} às ${time}`;
    } catch {
      return dateStr;
    }
  };

  const formatFullDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const dayName = d.toLocaleDateString('pt-BR', { weekday: 'long' });
      const dayFull = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const dateFormatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dayFull}, ${dateFormatted} às ${time}`;
    } catch {
      return dateStr;
    }
  };

  const renderStatus = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Confirmado
          </span>
        );
      case 'PENDING_PAYMENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Aguardando Sinal
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-100 text-stone-700 border border-stone-200">
            <CheckCircle className="w-3.5 h-3.5 text-stone-500" />
            Concluído
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Cancelado
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-100 text-stone-600 border border-stone-200">
            <AlertCircle className="w-3.5 h-3.5 text-stone-500" />
            Expirado
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

  const renderCancellationStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Solicitação em Análise';
      case 'APPROVED':
        return 'Cancelamento Aprovado';
      case 'COMPLETED':
        return 'Cancelamento Concluído';
      case 'REJECTED':
        return 'Solicitação Rejeitada';
      default:
        return status;
    }
  };

  const renderRefundStatusLabel = (status: string) => {
    switch (status) {
      case 'NOT_REQUESTED':
        return 'Sem reembolso aplicável';
      case 'PENDING_REVIEW':
        return 'Reembolso em Análise';
      case 'APPROVED':
        return 'Reembolso Aprovado (Aguardando Execução)';
      case 'PROCESSING':
        return 'Reembolso em Processamento no Provedor';
      case 'COMPLETED':
        return 'Reembolso Concluído';
      case 'FAILED':
        return 'Falha no Provedor (Em Retentativa pelo Salão)';
      case 'REJECTED':
        return 'Reembolso Não Aprovado';
      default:
        return status;
    }
  };

  const openCancelFlow = async (app: any) => {
    setCancelModalOpen(true);
    setCancelReason('');
    setConfirmCancelAware(false);
    setCancelFeedback(null);
    setEligibilityLoading(true);
    try {
      const res = await fetch(`/api/v1/customer/appointments/${app.id}/cancellation-eligibility`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setEligibilityData(data.data);
      } else {
        setCancelFeedback({ type: 'error', message: data.error || 'Não foi possível verificar a elegibilidade de cancelamento.' });
      }
    } catch {
      setCancelFeedback({ type: 'error', message: 'Erro de conexão ao consultar regras de cancelamento.' });
    } finally {
      setEligibilityLoading(false);
    }
  };

  const handleSubmitCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;
    if (cancelReason.trim().length < 5) {
      setCancelFeedback({ type: 'error', message: 'Por favor, informe o motivo do cancelamento (mínimo de 5 caracteres).' });
      return;
    }
    if (!confirmCancelAware) {
      setCancelFeedback({ type: 'error', message: 'Confirme ciência sobre as regras de cancelamento e reembolso antes de prosseguir.' });
      return;
    }

    setCancelSubmitting(true);
    setCancelFeedback(null);
    try {
      const res = await fetch(`/api/v1/customer/appointments/${selectedAppointment.id}/cancellation-requests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          reason: cancelReason.trim(),
          confirmedByCustomer: true,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setCancelFeedback({
          type: 'success',
          message: result.message || 'Solicitação registrada com sucesso!',
          refCode: result.data?.referenceCode || result.data?.cancellationRequest?.referenceCode,
        });
        if (onRefresh) await onRefresh();
      } else {
        setCancelFeedback({ type: 'error', message: result.error || 'Erro ao solicitar cancelamento.' });
      }
    } catch {
      setCancelFeedback({ type: 'error', message: 'Erro de comunicação com o servidor.' });
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleSubmitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;
    setRescheduleError('');
    setRescheduleLoading(true);
    try {
      const newDateTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString();
      const res = await fetch(`/api/v1/customer/appointments/${selectedAppointment.id}/reschedule`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          newDateTime,
          reason: rescheduleReason.trim() || undefined,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setRescheduleModalOpen(false);
        onCloseDetail();
        if (onRefresh) await onRefresh();
      } else {
        setRescheduleError(result.error || 'Não foi possível reagendar para este horário.');
      }
    } catch {
      setRescheduleError('Erro de conexão ao reagendar.');
    } finally {
      setRescheduleLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight font-serif">
            Meus Agendamentos
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Gerencie seus horários marcados, consulte prazos de cancelamento e acompanhe reembolsos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 bg-stone-100 rounded-xl border border-stone-200">
            <button
              onClick={() => setFilterTab('upcoming')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all tabular-nums ${
                filterTab === 'upcoming'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Próximos ({appointments.upcoming.length})
            </button>
            <button
              onClick={() => setFilterTab('past')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all tabular-nums ${
                filterTab === 'past'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Histórico ({appointments.past.length})
            </button>
          </div>

          <button
            onClick={onOpenBooking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Novo</span>
          </button>
        </div>
      </div>

      {/* Appointment Cards List */}
      {list.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectAppointment(item)}
              className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs hover:border-stone-300 hover:shadow-sm transition-all cursor-pointer space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                      {item.service?.category || 'Atendimento'}
                    </span>
                    {item.establishment?.name && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                        {item.establishment.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-stone-900 mt-0.5">
                    {item.service?.name || 'Serviço Agendado'}
                  </h3>
                </div>
                {renderStatus(item.status)}
              </div>

              <div className="space-y-2 text-xs text-stone-600 border-t border-b border-stone-100 py-3">
                <div className="flex items-center gap-2 tabular-nums">
                  <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span className="text-stone-900 font-medium">{formatDateTime(item.dateTime)}</span>
                  <span className="text-stone-600">· {item.snapshotDurationMin || item.service?.durationMin || 60} min</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>Profissional: <strong className="text-stone-800">{item.professional?.name || 'Profissional'}</strong></span>
                </div>
              </div>

              {/* If there is an active or past cancellation request, show reference & separate statuses */}
              {item.cancellationRequest && (
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-[11px] space-y-1 tabular-nums">
                  <div className="flex items-center justify-between font-semibold text-stone-900">
                    <span>Protocolo: {item.cancellationRequest.referenceCode}</span>
                    <span>{renderCancellationStatusLabel(item.cancellationRequest.status)}</span>
                  </div>
                  <div className="text-stone-600">
                    Reembolso: <strong>{renderRefundStatusLabel(item.cancellationRequest.refundStatus)}</strong>
                  </div>
                </div>
              )}

              {/* Price & Deposit Summary */}
              <div className="flex items-center justify-between text-xs pt-1 tabular-nums">
                <div>
                  <span className="text-stone-600 block text-[11px]">Valor Total</span>
                  <strong className="text-stone-900 font-bold text-sm">
                    {item.formattedTotal || 'R$ 0,00'}
                  </strong>
                </div>

                <div className="text-right">
                  <span className="text-stone-600 block text-[11px]">Sinal da Reserva</span>
                  <strong className="text-rose-600 font-semibold">
                    {item.formattedDeposit || 'R$ 0,00'}
                  </strong>
                </div>

                {item.status === 'PENDING_PAYMENT' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPix(item);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Pagar Pix</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-12 text-center space-y-4">
          <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="max-w-sm mx-auto">
            <h3 className="text-base font-semibold text-stone-900">
              {filterTab === 'upcoming'
                ? 'Nenhum agendamento futuro encontrado'
                : 'Nenhum atendimento no histórico'}
            </h3>
            <p className="text-stone-600 text-xs mt-1">
              {filterTab === 'upcoming'
                ? 'Que tal agendar um momento de cuidado para suas unhas hoje mesmo?'
                : 'Seus atendimentos finalizados ou cancelados aparecerão aqui automaticamente.'}
            </p>
          </div>
          {filterTab === 'upcoming' && (
            <button
              onClick={onOpenBooking}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-all"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Agendar Novo Horário</span>
            </button>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedAppointment && !cancelModalOpen && !rescheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[92dvh] overflow-y-auto shadow-2xl border border-stone-200 pb-safe">
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-100 sticky top-0 bg-white z-10">
              <div>
                <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                  Detalhes da Reserva
                </span>
                <h3 className="text-lg font-bold text-stone-900 mt-0.5">
                  {selectedAppointment.service?.name || 'Serviço'}
                </h3>
              </div>
              <button
                onClick={onCloseDetail}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 text-xs text-stone-700">
              {/* Status Box */}
              <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-medium text-stone-700">Status atual da reserva:</span>
                {renderStatus(selectedAppointment.status)}
              </div>

              {/* Cancellation & Refund Status Card if present */}
              {selectedAppointment.cancellationRequest && (
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2 tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-stone-600">
                      Solicitação {selectedAppointment.cancellationRequest.referenceCode}
                    </span>
                    <span className="font-semibold text-stone-900">
                      {renderCancellationStatusLabel(selectedAppointment.cancellationRequest.status)}
                    </span>
                  </div>
                  <div className="text-stone-700">
                    Status do Reembolso:{' '}
                    <strong className="text-rose-700">
                      {renderRefundStatusLabel(selectedAppointment.cancellationRequest.refundStatus)}
                    </strong>
                  </div>
                  {selectedAppointment.cancellationRequest.decisionNotes && (
                    <p className="text-stone-600 bg-white p-2.5 rounded-lg border border-stone-100">
                      <strong>Parecer do estabelecimento:</strong> "{selectedAppointment.cancellationRequest.decisionNotes}"
                    </p>
                  )}
                </div>
              )}

              {/* Date & Time */}
              <div className="space-y-1">
                <span className="text-stone-600 block text-[11px] font-medium uppercase tracking-wider">
                  Data e Horário
                </span>
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 flex items-center gap-3 tabular-nums">
                  <Calendar className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="text-stone-900 font-semibold text-sm">
                    {formatFullDateTime(selectedAppointment.dateTime)}
                  </span>
                </div>
              </div>

              {/* Professional & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 space-y-1">
                  <span className="text-stone-600 text-[11px] block">Profissional</span>
                  <strong className="text-stone-900 block font-semibold">
                    {selectedAppointment.professional?.name || 'Profissional'}
                  </strong>
                  <span className="text-stone-600 block">
                    {selectedAppointment.professional?.specialty || 'Especialista'}
                  </span>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 space-y-1 tabular-nums">
                  <span className="text-stone-600 text-[11px] block">Duração Estimada</span>
                  <strong className="text-stone-900 block font-semibold text-sm">
                    {selectedAppointment.snapshotDurationMin || selectedAppointment.service?.durationMin || 60} minutos
                  </strong>
                  <span className="text-stone-600 block">
                    {selectedAppointment.service?.category || 'Atendimento'}
                  </span>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3 tabular-nums">
                <div className="text-xs font-bold text-stone-900 flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-stone-600" />
                  <span>Detalhamento dos Valores</span>
                </div>

                <div className="space-y-2 pt-1 border-t border-stone-200 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-600">Valor Total do Serviço</span>
                    <span className="text-stone-900 font-semibold">
                      {selectedAppointment.formattedTotal || 'R$ 0,00'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-stone-600">
                      Sinal da Reserva ({selectedAppointment.snapshotDepositPercent || 30}%)
                    </span>
                    <span className="text-rose-600 font-semibold">
                      {selectedAppointment.formattedDeposit || 'R$ 0,00'}
                    </span>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-dashed border-stone-200 font-medium">
                    <span className="text-stone-700">Saldo restante no salão</span>
                    <span className="text-stone-900 font-bold text-sm">
                      {selectedAppointment.formattedBalance || 'R$ 0,00'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Historical Policy Preserved on Reservation */}
              <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-950 text-[11px] space-y-1.5">
                <div className="font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Política Registrada na Reserva</span>
                  </span>
                  <span className="tabular-nums">
                    Prazo: {selectedAppointment.snapshotCancellationHours ?? business?.cancellationHoursLimit ?? 6}h antes
                  </span>
                </div>
                <p className="text-amber-900 leading-relaxed">
                  {selectedAppointment.snapshotPolicyText ||
                    business?.cancellationPolicyText ||
                    'Cancelamentos solicitados até o prazo mínimo de antecedência definido pelo estabelecimento dão direito à análise e reembolso do sinal pago.'}
                </p>
              </div>

              {/* Actions for Reschedule / Cancel if appointment is active */}
              {['CONFIRMED', 'PENDING_PAYMENT', 'PENDING'].includes(selectedAppointment.status) &&
                (!selectedAppointment.cancellationRequest ||
                  selectedAppointment.cancellationRequest.status === 'REJECTED') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {(business?.allowCustomerReschedule ?? true) && (
                      <button
                        type="button"
                        onClick={() => setRescheduleModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reagendar Horário</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openCancelFlow(selectedAppointment)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Solicitar Cancelamento</span>
                    </button>
                  </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-5 sm:p-6 bg-stone-50 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <a
                href={`https://wa.me/55${(business?.phone || '').replace(/\D/g, '')}?text=Olá,%20gostaria%20de%20falar%20sobre%20meu%20agendamento%20de%20${encodeURIComponent(selectedAppointment.service?.name || 'serviço')}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[42px] rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Contato via WhatsApp</span>
              </a>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {selectedAppointment.status === 'PENDING_PAYMENT' && (
                  <button
                    onClick={() => {
                      onCloseDetail();
                      onOpenPix(selectedAppointment);
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Pagar Sinal Pix</span>
                  </button>
                )}
                <button
                  onClick={onCloseDetail}
                  className="w-full sm:w-auto px-4 py-2.5 min-h-[42px] rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-medium transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Request Modal (Section 6) */}
      {selectedAppointment && cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[92dvh] overflow-y-auto shadow-2xl border border-stone-200 pb-safe">
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-100 sticky top-0 bg-white z-10">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">
                  Solicitar Cancelamento
                </span>
                <h3 className="text-lg font-bold text-stone-900 mt-0.5">
                  {selectedAppointment.service?.name || 'Agendamento'}
                </h3>
              </div>
              <button
                onClick={() => setCancelModalOpen(false)}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 text-xs">
              {eligibilityLoading ? (
                <div className="py-10 text-center space-y-2 text-stone-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-rose-600" />
                  <p>Verificando prazo limite e elegibilidade no servidor...</p>
                </div>
              ) : (
                <>
                  {/* Appointment & Deadline Summary */}
                  {eligibilityData && (
                    <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2.5 tabular-nums">
                      <div className="flex justify-between">
                        <span className="text-stone-500">Data do Atendimento:</span>
                        <strong className="text-stone-900">{formatFullDateTime(selectedAppointment.dateTime)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Prazo limite da política ({eligibilityData.hoursLimit}h antes):</span>
                        <strong className="text-stone-900">{eligibilityData.formattedDeadline}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Sinal pago e confirmado:</span>
                        <strong className="text-rose-600">{eligibilityData.formattedPaidDeposit}</strong>
                      </div>
                      <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
                        <span className="text-stone-600 font-medium">Situação do prazo:</span>
                        {eligibilityData.isWithinPolicy ? (
                          <span className="font-bold text-emerald-700">
                            Dentro do prazo ({eligibilityData.hoursRemaining}h de antecedência)
                          </span>
                        ) : (
                          <span className="font-bold text-amber-700">
                            Fora do prazo ({eligibilityData.hoursRemaining}h restantes)
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Eligibility Explanation Banner */}
                  {eligibilityData && (
                    <div
                      className={`p-4 rounded-2xl border space-y-2.5 ${
                        eligibilityData.isWithinPolicy
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-amber-50/80 border-amber-200 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <strong className="block font-semibold text-xs">
                          {eligibilityData.isWithinPolicy
                            ? 'Solicitação dentro do prazo da política'
                            : 'Solicitação fora do prazo limite de cancelamento'}
                        </strong>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 border border-stone-200/60 tabular-nums">
                          Prazo: {eligibilityData.applicableHoursLimit || eligibilityData.hoursLimit || 6}h antes
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed">{eligibilityData.reasonMessage}</p>

                      {eligibilityData.policyText && (
                        <div className="p-3 bg-white/80 rounded-xl border border-stone-200/60 space-y-1 text-[11px] text-stone-700">
                          <strong className="text-stone-900 block font-semibold">
                            Política de Cancelamento e Reembolso:
                          </strong>
                          <p className="leading-relaxed">{eligibilityData.policyText}</p>
                        </div>
                      )}

                      {eligibilityData.contactInstructions && (
                        <div className="p-2.5 bg-white/60 rounded-xl border border-stone-200/50 text-[11px] text-stone-800 space-y-0.5">
                          <strong className="block font-semibold">Instruções para Contato:</strong>
                          <p className="leading-relaxed">{eligibilityData.contactInstructions}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {cancelFeedback && (
                    <div
                      className={`p-4 rounded-xl border font-medium space-y-1 ${
                        cancelFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      <p>{cancelFeedback.message}</p>
                      {cancelFeedback.refCode && (
                        <p className="text-xs font-bold tabular-nums">
                          Código de referência da solicitação: {cancelFeedback.refCode}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Form if not yet submitted */}
                  {cancelFeedback?.type !== 'success' && eligibilityData?.canRequestCancellation && (
                    <form onSubmit={handleSubmitCancellation} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-stone-800 mb-1.5">
                          Informe o motivo do cancelamento:
                        </label>
                        <textarea
                          rows={3}
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Explique brevemente o motivo da solicitação de cancelamento..."
                          className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                          required
                        />
                      </div>

                      <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmCancelAware}
                          onChange={(e) => setConfirmCancelAware(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
                        />
                        <span className="text-[11px] text-stone-700 leading-relaxed">
                          Confirmo que desejo solicitar o cancelamento deste agendamento e estou ciente de que eventual reembolso do sinal depende da validação da política e da confirmação efetiva pelo provedor de pagamento (Mercado Pago).
                        </span>
                      </label>

                      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setCancelModalOpen(false)}
                          className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold"
                        >
                          Voltar
                        </button>
                        <button
                          type="submit"
                          disabled={cancelSubmitting}
                          className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold shadow-xs transition-all"
                        >
                          {cancelSubmitting ? 'Enviando solicitação...' : 'Confirmar Solicitação de Cancelamento'}
                        </button>
                      </div>
                    </form>
                  )}

                  {cancelFeedback?.type === 'success' && (
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => {
                          setCancelModalOpen(false);
                          onCloseDetail();
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold"
                      >
                        Concluir e Voltar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal (Section 7) */}
      {selectedAppointment && rescheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[92dvh] overflow-y-auto shadow-2xl border border-stone-200 pb-safe">
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-100">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  Alteração de Horário
                </span>
                <h3 className="text-lg font-bold text-stone-900 mt-0.5">
                  Reagendar Atendimento
                </h3>
              </div>
              <button
                onClick={() => setRescheduleModalOpen(false)}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReschedule} className="p-5 sm:p-6 space-y-4 text-xs">
              {rescheduleError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{rescheduleError}</span>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-stone-500 block">Horário atual:</span>
                <strong className="text-stone-900 block">{formatFullDateTime(selectedAppointment.dateTime)}</strong>
                <span className="text-[11px] text-emerald-700 font-medium block pt-1">
                  O sinal já pago é preservado automaticamente na sua reserva ao reagendar.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Nova Data</label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[42px] bg-stone-50 border border-stone-200 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Novo Horário</label>
                  <select
                    value={rescheduleDayBlocked ? '' : rescheduleTime}
                    disabled={rescheduleDayBlocked}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[42px] bg-stone-50 border border-stone-200 rounded-xl disabled:bg-stone-100 disabled:text-stone-400"
                  >
                    {rescheduleDayBlocked ? (
                      <option value="">Sem atendimento neste dia</option>
                    ) : (
                      rescheduleSlots.map((h) => {
                        const occ = rescheduleOccupied.includes(h);
                        return (
                          <option key={h} value={h} disabled={occ}>
                            {h} {occ ? '— (Indisponível)' : ''}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>
              </div>

              {rescheduleDayBlocked && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>
                    A profissional não possui horários de atendimento nesta data. Escolha outro dia da semana para reagendar.
                  </span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Observação da alteração (opcional)</label>
                <input
                  type="text"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Ex: Mudança de turno no trabalho"
                  className="w-full px-3 py-2.5 min-h-[42px] bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={rescheduleLoading || rescheduleDayBlocked || rescheduleOccupied.includes(rescheduleTime)}
                  className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
                >
                  {rescheduleLoading ? 'Validando disponibilidade...' : 'Confirmar Reagendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
