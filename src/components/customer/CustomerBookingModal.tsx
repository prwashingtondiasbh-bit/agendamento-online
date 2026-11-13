import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Sparkles,
  CreditCard,
  QrCode,
  AlertCircle,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { Service, Professional } from '../../types';
import {
  DAY_NAMES_FULL,
  findNextWorkingDate,
  formatWorkingDaysSummary,
  generateThirtyMinuteSlots,
  getDayOfWeekFromDateStr,
  getWorkingHourForDate,
} from '../../utils/timeSlots';

interface CustomerBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any;
  business?: any;
  partnerBusinesses?: any[];
  initialTenantId?: string;
  services: Service[];
  professionals: Professional[];
  existingAppointments?: any[];
  onSubmit: (appointmentData: any) => Promise<{ success: boolean; data?: any; error?: string }>;
}

export const CustomerBookingModal: React.FC<CustomerBookingModalProps> = ({
  isOpen,
  onClose,
  customer,
  business,
  partnerBusinesses = [],
  initialTenantId,
  services,
  professionals,
  existingAppointments = [],
  onSubmit,
}) => {
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    initialTenantId || business?.id || 'biz-1'
  );
  const [dynamicBusiness, setDynamicBusiness] = useState<any>(business || null);
  const [dynamicServices, setDynamicServices] = useState<Service[]>(services);
  const [dynamicProfessionals, setDynamicProfessionals] = useState<Professional[]>(professionals);

  useEffect(() => {
    if (initialTenantId) {
      setSelectedTenantId(initialTenantId);
    } else if (business?.id && !selectedTenantId) {
      setSelectedTenantId(business.id);
    }
  }, [initialTenantId, business?.id, isOpen]);

  // Fetch fresh catalog when modal opens or selectedTenantId changes
  useEffect(() => {
    if (!isOpen || !selectedTenantId) return;
    if (selectedTenantId === (business?.id || 'biz-1') && services.length > 0) {
      setDynamicBusiness(business);
      setDynamicServices(services);
      setDynamicProfessionals(professionals);
      const firstServ = services.filter((s) => s.active !== false)[0];
      const firstProf = professionals.filter((p) => p.active !== false)[0];
      setServiceId((prev) => prev || firstServ?.id || '');
      setProfessionalId((prev) => prev || firstProf?.id || '');
    }

    let cancelled = false;
    fetch(`/api/v1/customer/catalog?tenantId=${encodeURIComponent(selectedTenantId)}&_t=${Date.now()}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success && json.data) {
          setDynamicBusiness(json.data.business);
          const srv = json.data.services || [];
          const prf = json.data.professionals || [];
          setDynamicServices(srv);
          setDynamicProfessionals(prf);
          const nextProfId = prf.some((p: any) => p.id === professionalId) ? professionalId : prf[0]?.id || '';
          setServiceId((prev) => (srv.some((s: any) => s.id === prev) ? prev : srv[0]?.id || ''));
          setProfessionalId(nextProfId);
          const nextProf = prf.find((p: any) => p.id === nextProfId);
          if (nextProf && Array.isArray(nextProf.workingHours) && !getWorkingHourForDate(nextProf, date)) {
            const suggested = findNextWorkingDate(nextProf, date);
            if (suggested) setDate(suggested);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedTenantId, business, services, professionals]);

  const activeBusiness = dynamicBusiness || business;
  const activeServices = React.useMemo(() => dynamicServices.filter((s) => s.active !== false), [dynamicServices]);
  const activeProfessionals = React.useMemo(() => dynamicProfessionals.filter((p) => p.active !== false), [dynamicProfessionals]);

  const [serviceId, setServiceId] = useState(activeServices[0]?.id || '');
  const [professionalId, setProfessionalId] = useState(activeProfessionals[0]?.id || '');
  const [date, setDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [time, setTime] = useState('14:00');
  const [notes, setNotes] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serverOccupiedTimes, setServerOccupiedTimes] = useState<string[]>([]);
  const [serverSlotTimes, setServerSlotTimes] = useState<string[]>([]);
  const [serverDayBlocked, setServerDayBlocked] = useState<boolean>(false);

  const selectedService = activeServices.find((s) => s.id === serviceId) || activeServices[0];
  const selectedProfessional = activeProfessionals.find((p) => p.id === professionalId) || activeProfessionals[0];

  const baseThirtyMinHours = React.useMemo(
    () =>
      generateThirtyMinuteSlots(
        activeBusiness?.openTime || '08:00',
        activeBusiness?.closeTime || '20:00'
      ),
    [activeBusiness?.openTime, activeBusiness?.closeTime]
  );

  const availableHours = serverSlotTimes.length > 0 ? serverSlotTimes : baseThirtyMinHours;

  const clientDayBlocked = Boolean(
    selectedProfessional &&
      Array.isArray(selectedProfessional.workingHours) &&
      !getWorkingHourForDate(selectedProfessional, date)
  );
  const isDayBlocked = serverDayBlocked || clientDayBlocked;
  const workingDaysSummary = selectedProfessional ? formatWorkingDaysSummary(selectedProfessional) : '';
  const selectedDayOfWeek = getDayOfWeekFromDateStr(date);
  const selectedDayName = selectedDayOfWeek !== null ? DAY_NAMES_FULL[selectedDayOfWeek] : 'este dia';
  const nextWorkingDate = selectedProfessional
    ? findNextWorkingDate(selectedProfessional, new Date().toISOString().split('T')[0])
    : null;

  useEffect(() => {
    if (!isOpen || !serviceId || !professionalId || !date || !selectedTenantId) return;
    let cancelled = false;
    const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-session-token', token);
    }
    fetch(
      `/api/v1/customer/available-slots?tenantId=${encodeURIComponent(selectedTenantId)}&serviceId=${encodeURIComponent(serviceId)}&professionalId=${encodeURIComponent(professionalId)}&date=${encodeURIComponent(date)}`,
      { headers, credentials: 'include' }
    )
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success && Array.isArray(json.data?.occupiedSlots)) {
          setServerDayBlocked(json.data?.professionalWorksOnDate === false);
          setServerOccupiedTimes(json.data.occupiedSlots.map((o: any) => o.time));
          if (Array.isArray(json.data?.slots)) {
            setServerSlotTimes(json.data.slots.map((s: any) => s.time));
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedTenantId, serviceId, professionalId, date]);

  const isSlotOccupied = (slotTime: string) => {
    if (isDayBlocked) return true;
    if (!date || !professionalId) return false;
    if (serverOccupiedTimes.includes(slotTime)) return true;
    const slotStart = new Date(`${date}T${slotTime}:00-03:00`).getTime();
    if (slotStart <= Date.now()) return true;
    const serviceDurationMin = Number(selectedService?.durationMin || 60);
    const slotEnd = slotStart + serviceDurationMin * 60000;

    return existingAppointments.some((app: any) => {
      if (app.tenantId && app.tenantId !== selectedTenantId) return false;
      if (app.professionalId !== professionalId) return false;
      if (!['PENDING_PAYMENT', 'CONFIRMED', 'PENDING'].includes(app.status)) return false;

      const appStart = new Date(app.dateTime).getTime();
      const appEnd = app.endDateTime
        ? new Date(app.endDateTime).getTime()
        : appStart + Number(app.snapshotDurationMin || 60) * 60000;

      return slotStart < appEnd && slotEnd > appStart;
    });
  };

  // Sync selected service if list changes and pick first available slot
  useEffect(() => {
    setServiceId((prev) => (prev && activeServices.some((s) => s.id === prev) ? prev : activeServices[0]?.id || ''));
    setProfessionalId((prev) => (prev && activeProfessionals.some((p) => p.id === prev) ? prev : activeProfessionals[0]?.id || ''));
  }, [activeServices, activeProfessionals]);

  // Auto-pick first non-occupied slot when date or professional changes
  useEffect(() => {
    if (isSlotOccupied(time)) {
      const freeSlot = availableHours.find((h) => !isSlotOccupied(h));
      if (freeSlot) setTime(freeSlot);
    }
  }, [date, professionalId, serviceId, serverOccupiedTimes]);

  if (!isOpen) return null;

  const priceCents = selectedService ? Number(selectedService.priceCents || 0) : 0;
  const requireDeposit = activeBusiness?.requireDeposit !== false;
  const rawDepositPercent =
    selectedService?.depositPercent !== undefined && selectedService?.depositPercent !== null
      ? Number(selectedService.depositPercent)
      : Number(activeBusiness?.defaultDeposit ?? 30);
  const depositPercent = requireDeposit ? Math.max(0, Math.min(100, rawDepositPercent)) : 0;
  const depositCents = requireDeposit && depositPercent > 0 ? Math.round((priceCents * depositPercent) / 100) : 0;
  const balanceCents = Math.max(0, priceCents - depositCents);
  const requiresUpfrontPayment = requireDeposit && depositCents > 0;

  const policyHoursLimit = Number(activeBusiness?.cancellationHoursLimit || 6);
  const policyText =
    activeBusiness?.cancellationPolicyText ||
    'Cancelamentos solicitados até o prazo mínimo de antecedência definido pelo estabelecimento dão direito à análise e reembolso do sinal pago. Solicitações após esse prazo estão sujeitas à retenção do sinal para cobrir a reserva de agenda da profissional.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!serviceId) {
      setError('Selecione o serviço desejado.');
      return;
    }
    if (!professionalId) {
      setError('Selecione a profissional.');
      return;
    }
    if (!date || !time) {
      setError('Selecione a data e o horário.');
      return;
    }
    if (isDayBlocked) {
      setError(`A profissional não realiza atendimentos em ${selectedDayName}. Selecione outro dia disponível.`);
      return;
    }
    if (isSlotOccupied(time)) {
      setError('O horário selecionado já está ocupado. Por favor, escolha outro horário.');
      return;
    }
    if (requireDeposit && !acceptedPolicy) {
      setError('Você precisa aceitar a política de cancelamento e reembolso do estabelecimento para confirmar a reserva.');
      return;
    }

    setLoading(true);
    try {
      const dateTime = new Date(`${date}T${time}:00-03:00`).toISOString();
      const res = await onSubmit({
        tenantId: selectedTenantId,
        clientId: customer.id,
        serviceId,
        professionalId,
        dateTime,
        notes: notes.trim(),
      });

      if (res.success) {
        onClose();
      } else {
        setError(res.error || 'Erro ao realizar agendamento.');
      }
    } catch {
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[92dvh] overflow-y-auto shadow-2xl border border-stone-200 pb-safe">
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-100 sticky top-0 bg-white z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold mb-1">
              <Sparkles className="w-3 h-3 text-rose-500" />
              <span>Reserva Online · {activeBusiness?.name || 'Estabelecimento'}</span>
            </div>
            <h3 className="text-xl font-bold text-stone-900 font-serif">
              Novo Agendamento
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}


          {/* Service Selection */}
          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1.5">
              Escolha o Serviço
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {activeServices.map((serv) => {
                const isSelected = serv.id === serviceId;
                const price = (Number(serv.priceCents || 0) / 100).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                });
                return (
                  <div
                    key={serv.id}
                    onClick={() => setServiceId(serv.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-rose-500 bg-rose-50/60 shadow-xs'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                  >
                    <div>
                      <span className="text-[11px] text-stone-600 block">{serv.category}</span>
                      <strong className="text-stone-900 font-semibold">{serv.name}</strong>
                      <span className="text-stone-600 block text-[11px] mt-0.5 tabular-nums">
                        {serv.durationMin} minutos ·{' '}
                        {requireDeposit && (serv.depositPercent ?? business?.defaultDeposit ?? 30) > 0
                          ? `Sinal de ${serv.depositPercent ?? business?.defaultDeposit ?? 30}%`
                          : 'Sem sinal antecipado'}
                      </span>
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="text-stone-900 font-bold block">{price}</span>
                      {isSelected && (
                        <span className="text-[11px] text-rose-600 font-medium">Selecionado</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Professional Selection */}
          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1.5">
              Profissional de Atendimento
            </label>
            <select
              value={professionalId}
              onChange={(e) => {
                const nextId = e.target.value;
                setProfessionalId(nextId);
                const nextProf = activeProfessionals.find((p) => p.id === nextId);
                if (nextProf && Array.isArray(nextProf.workingHours) && !getWorkingHourForDate(nextProf, date)) {
                  const suggested = findNextWorkingDate(nextProf, date);
                  if (suggested) setDate(suggested);
                }
              }}
              className="w-full px-3 py-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
            >
              {activeProfessionals.map((prof) => (
                <option key={prof.id} value={prof.id}>
                  {prof.name} {prof.specialty ? `— ${prof.specialty}` : ''}
                </option>
              ))}
            </select>
            {workingDaysSummary && (
              <p className="text-[11px] text-stone-600 mt-1.5">
                Dias de atendimento: <span className="font-medium text-stone-800">{workingDaysSummary}</span>
              </p>
            )}
          </div>

          {/* Date & Time */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-800 mb-1.5">
                  Data
                </label>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setDate(e.target.value)}
                  className={`w-full px-3 py-2.5 min-h-[42px] text-xs bg-stone-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900 ${
                    isDayBlocked ? 'border-rose-300 bg-rose-50/40' : 'border-stone-200'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-800 mb-1.5">
                  Horário
                </label>
                <select
                  value={isDayBlocked ? '' : time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={isDayBlocked}
                  className="w-full px-3 py-2.5 min-h-[42px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDayBlocked ? (
                    <option value="">Dia bloqueado — sem atendimento</option>
                  ) : (
                    availableHours.map((h) => {
                      const occupied = isSlotOccupied(h);
                      return (
                        <option key={h} value={h} disabled={occupied}>
                          {h} {occupied ? '— (Indisponível)' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>
            </div>
            {isDayBlocked && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-rose-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>
                    <strong>Agenda bloqueada em {selectedDayName}.</strong> A profissional não atende neste dia.
                  </span>
                </div>
                {nextWorkingDate && nextWorkingDate !== date && (
                  <button
                    type="button"
                    onClick={() => setDate(nextWorkingDate)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition-colors"
                  >
                    Ir para {new Date(`${nextWorkingDate}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1.5">
              Observações / Preferências (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Formato amendoado, esmalte nude, manutenção..."
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
            />
          </div>

          {/* Financial Breakdown Preview */}
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2 tabular-nums">
            <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider block">
              Resumo da Cobrança
            </span>
            <div className="flex justify-between text-xs text-stone-700">
              <span>Valor Total:</span>
              <strong className="text-stone-900">
                {(priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
            </div>
            {requiresUpfrontPayment ? (
              <>
                <div className="flex justify-between text-xs text-rose-700 font-medium">
                  <span>Sinal Obrigatório ({depositPercent}%):</span>
                  <strong className="text-rose-600">
                    {(depositCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
                <div className="flex justify-between text-xs text-stone-600 pt-1 border-t border-dashed border-stone-200">
                  <span>Saldo a pagar no salão:</span>
                  <strong className="text-stone-800">
                    {(balanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
                <p className="text-[11px] text-stone-600 pt-1">
                  Ao confirmar, um QR Code Pix do Mercado Pago será gerado para pagamento imediato do sinal.
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs text-emerald-700 font-medium">
                  <span>Sinal para confirmar:</span>
                  <strong className="text-emerald-700">R$ 0,00 (Dispensado)</strong>
                </div>
                <div className="flex justify-between text-xs text-stone-600 pt-1 border-t border-dashed border-stone-200">
                  <span>Valor a pagar no estabelecimento (100%):</span>
                  <strong className="text-stone-800">
                    {(balanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
                <p className="text-[11px] text-stone-600 pt-1">
                  Este estabelecimento não exige pagamento de sinal antecipado. Seu horário será confirmado imediatamente e o pagamento será realizado conforme a política do local.
                </p>
              </>
            )}
          </div>

          {/* Applicable Cancellation Policy Display & Acceptance */}
          {requireDeposit && (
            <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between font-semibold text-amber-950">
                <span>Política de Cancelamento e Reembolso Aplicável</span>
                <span className="tabular-nums text-amber-800">Antecedência: {policyHoursLimit}h</span>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                {policyText}
              </p>
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedPolicy}
                  onChange={(e) => setAcceptedPolicy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
                />
                <span className="text-[11px] font-medium text-amber-950 leading-snug">
                  Estou ciente e concordo com a política de cancelamento ({policyHoursLimit} horas de antecedência mínima) preservada para esta reserva.
                </span>
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || isDayBlocked || isSlotOccupied(time)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reservando horário...</span>
                </>
              ) : requiresUpfrontPayment ? (
                <>
                  <QrCode className="w-4 h-4" />
                  <span>Confirmar & Gerar Pix</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirmar Agendamento</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

