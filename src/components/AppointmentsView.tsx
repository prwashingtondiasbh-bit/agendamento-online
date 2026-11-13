import React, { useState, useEffect, useCallback } from 'react';
import { Appointment, Professional, Service, TimeBlock } from '../types';
import { apiFetch } from '../App';
import { ensureSlotInList, generateThirtyMinuteSlots } from '../utils/timeSlots';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Check,
  X,
  Search,
  QrCode,
  ChevronLeft,
  ChevronRight,
  Ban,
  Play,
  UserX,
  Edit3,
  Trash2,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface AppointmentsViewProps {
  appointments: Appointment[];
  professionals?: Professional[];
  services?: Service[];
  requireDeposit?: boolean;
  initialProfessionalFilter?: string;
  onOpenNewAppointment: () => void;
  onUpdateStatus: (id: string, status: Appointment['status']) => void;
  onPayPix?: (appointment: Appointment) => void;
  onRefreshData?: () => void;
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  INTERVAL: 'Intervalo',
  LUNCH: 'Almoço',
  BREAK: 'Intervalo / Pausa',
  DAY_OFF: 'Folga',
  VACATION: 'Férias',
  PERSONAL: 'Compromisso pessoal',
  EXCEPTION: 'Bloqueio excepcional',
};

const THIRTY_MIN_BLOCK_SLOTS = generateThirtyMinuteSlots('06:00', '23:30', true);
const THIRTY_MIN_APPOINTMENT_SLOTS = generateThirtyMinuteSlots('07:00', '22:00', true);

const ORIGIN_LABELS: Record<string, string> = {
  ONLINE: 'Portal Online',
  PRESENCIAL: 'Presencial',
  TELEFONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  OUTRO: 'Outro',
};

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  appointments,
  professionals = [],
  services = [],
  requireDeposit = true,
  initialProfessionalFilter = 'ALL',
  onOpenNewAppointment,
  onUpdateStatus,
  onPayPix,
  onRefreshData,
}) => {
  const [viewMode, setViewMode] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterProfessionalId, setFilterProfessionalId] = useState<string>(initialProfessionalFilter || 'ALL');
  const [filterServiceId, setFilterServiceId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // TimeBlocks state
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({
    professionalId: '',
    type: 'INTERVAL',
    date: new Date().toISOString().split('T')[0],
    startTime: '12:00',
    endTime: '13:00',
    reason: '',
  });
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockConflicts, setBlockConflicts] = useState<Appointment[]>([]);
  const [savingBlock, setSavingBlock] = useState(false);

  // Selected Appointment Details / Edit Modal (Section 12)
  const [selectedApp, setSelectedApp] = useState<Appointment | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editProfessionalId, setEditProfessionalId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuggestedSlots, setEditSuggestedSlots] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (initialProfessionalFilter) {
      setFilterProfessionalId(initialProfessionalFilter);
    }
  }, [initialProfessionalFilter]);

  const fetchTimeBlocks = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/appointments/time-blocks');
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setTimeBlocks(data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchTimeBlocks();
  }, [fetchTimeBlocks]);

  const navigateDate = (direction: number) => {
    const current = new Date(`${selectedDate}T12:00:00`);
    if (viewMode === 'DAILY') {
      current.setDate(current.getDate() + direction);
    } else if (viewMode === 'WEEKLY') {
      current.setDate(current.getDate() + direction * 7);
    } else {
      current.setMonth(current.getMonth() + direction);
    }
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const isDateInSelectedPeriod = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const dStr = d.toISOString().split('T')[0];
      if (viewMode === 'DAILY') {
        return dStr === selectedDate;
      }
      const ref = new Date(`${selectedDate}T12:00:00`);
      if (viewMode === 'WEEKLY') {
        const day = ref.getDay();
        const startOfWeek = new Date(ref);
        startOfWeek.setDate(ref.getDate() - day);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        return d >= startOfWeek && d <= endOfWeek;
      }
      if (viewMode === 'MONTHLY') {
        return d.getUTCFullYear() === ref.getFullYear() && d.getUTCMonth() === ref.getMonth();
      }
      return true;
    } catch {
      return false;
    }
  };

  const filteredAppointments = appointments
    .filter((app) => {
      if (!isDateInSelectedPeriod(app.dateTime)) return false;
      if (filterStatus !== 'ALL' && app.status !== filterStatus) return false;
      if (filterProfessionalId !== 'ALL' && app.professionalId !== filterProfessionalId) return false;
      if (filterServiceId !== 'ALL' && app.serviceId !== filterServiceId) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesClient = app.client?.name?.toLowerCase().includes(q) || false;
        const matchesService = app.service?.name?.toLowerCase().includes(q) || false;
        const matchesProf = app.professional?.name?.toLowerCase().includes(q) || false;
        if (!matchesClient && !matchesService && !matchesProf) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  const filteredBlocks = timeBlocks.filter((tb) => {
    if (filterProfessionalId !== 'ALL' && tb.professionalId && tb.professionalId !== filterProfessionalId) {
      return false;
    }
    return isDateInSelectedPeriod(tb.startDate);
  });

  const openAppointmentModal = (app: Appointment) => {
    const dt = new Date(app.dateTime);
    setSelectedApp(app);
    setEditDate(dt.toISOString().split('T')[0]);
    setEditTime(dt.toTimeString().slice(0, 5));
    setEditProfessionalId(app.professionalId);
    setEditNotes(app.notes || '');
    setEditReason('');
    setEditError(null);
    setEditSuggestedSlots([]);
  };

  const handleSaveAppointmentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    setSavingEdit(true);
    setEditError(null);
    setEditSuggestedSlots([]);

    try {
      const combinedDateTime = new Date(`${editDate}T${editTime}:00`).toISOString();
      const res = await apiFetch(`/api/v1/appointments/${selectedApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateTime: combinedDateTime,
          professionalId: editProfessionalId,
          notes: editNotes,
          reason: editReason || 'Alteração realizada pela agenda administrativa',
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setSelectedApp(null);
        if (onRefreshData) onRefreshData();
      } else {
        setEditError(result.error || 'Erro ao atualizar agendamento');
        if (Array.isArray(result.suggestedSlots)) {
          setEditSuggestedSlots(result.suggestedSlots);
        }
      }
    } catch (err: any) {
      setEditError(err?.message || 'Erro de conexão');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateTimeBlock = async (confirmOverlap = false) => {
    setSavingBlock(true);
    setBlockError(null);
    try {
      const startDate = new Date(`${blockForm.date}T${blockForm.startTime}:00`).toISOString();
      const endDate = new Date(`${blockForm.date}T${blockForm.endTime}:00`).toISOString();
      const res = await apiFetch('/api/v1/appointments/time-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalId: blockForm.professionalId || null,
          type: blockForm.type,
          startDate,
          endDate,
          reason: blockForm.reason,
          confirmOverlap,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setIsBlockModalOpen(false);
        setBlockConflicts([]);
        setBlockForm({
          professionalId: '',
          type: 'INTERVAL',
          date: selectedDate,
          startTime: '12:00',
          endTime: '13:00',
          reason: '',
        });
        await fetchTimeBlocks();
        if (onRefreshData) onRefreshData();
      } else {
        setBlockError(result.error || 'Erro ao criar bloqueio de agenda');
        if (Array.isArray(result.conflicts)) {
          setBlockConflicts(result.conflicts);
        }
      }
    } catch (err: any) {
      setBlockError(err?.message || 'Erro de conexão');
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteTimeBlock = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/appointments/time-blocks/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        fetchTimeBlocks();
        if (onRefreshData) onRefreshData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Confirmado
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse" />
            Em Atendimento
          </span>
        );
      case 'PENDING':
      case 'PENDING_PAYMENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {requireDeposit || status === 'PENDING_PAYMENT' ? 'Aguardando Sinal' : 'Pendente'}
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
            Concluído
          </span>
        );
      case 'NO_SHOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            Falta Registrada (No-Show)
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-500">
            {status}
          </span>
        );
    }
  };

  const formatPeriodTitle = () => {
    const ref = new Date(`${selectedDate}T12:00:00`);
    if (viewMode === 'DAILY') {
      return ref.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
    if (viewMode === 'WEEKLY') {
      const day = ref.getDay();
      const start = new Date(ref);
      start.setDate(ref.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `Semana de ${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Top Calendar Controls: View Mode, Date Navigation, and Quick Actions */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5 sm:gap-4">
        {/* View Switcher (Diária / Semanal / Mensal) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="grid grid-cols-3 sm:flex items-center bg-stone-100 p-1 rounded-xl">
            {(
              [
                { id: 'DAILY', label: 'Diária' },
                { id: 'WEEKLY', label: 'Semanal' },
                { id: 'MONTHLY', label: 'Mensal' },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === v.id ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Date Navigation + Botão Hoje */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => navigateDate(-1)}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 shrink-0"
              title="Período anterior"
              aria-label="Período anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="flex-1 sm:flex-initial min-w-0 min-h-[42px] px-2.5 sm:px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-800"
            />
            <button
              onClick={() => navigateDate(1)}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 shrink-0"
              title="Próximo período"
              aria-label="Próximo período"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={goToToday}
              className="min-h-[42px] px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors shrink-0"
            >
              Hoje
            </button>
          </div>
        </div>

        {/* Actions: Bloquear Horário & Novo Agendamento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-2.5">
          <button
            onClick={() => {
              setBlockForm((prev) => ({ ...prev, date: selectedDate }));
              setBlockError(null);
              setBlockConflicts([]);
              setIsBlockModalOpen(true);
            }}
            className="min-h-[44px] flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-all"
          >
            <Ban className="w-4 h-4 text-stone-600 shrink-0" />
            <span>Bloquear Horário</span>
          </button>

          <button
            onClick={onOpenNewAppointment}
            className="min-h-[44px] flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-semibold text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Novo Agendamento</span>
          </button>
        </div>
      </div>

      {/* Filters Row: Search, Professional, Service, Status */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar cliente, serviço ou profissional..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex items-center gap-2">
          <select
            value={filterProfessionalId}
            onChange={(e) => setFilterProfessionalId(e.target.value)}
            className="w-full lg:w-auto min-h-[42px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-700"
          >
            <option value="ALL">Todas as Profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={filterServiceId}
            onChange={(e) => setFilterServiceId(e.target.value)}
            className="w-full lg:w-auto min-h-[42px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-700"
          >
            <option value="ALL">Todos os Serviços</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full lg:w-auto min-h-[42px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-700"
          >
            <option value="ALL">Todos os Status</option>
            <option value="CONFIRMED">Confirmados</option>
            {requireDeposit && <option value="PENDING_PAYMENT">Aguardando Sinal</option>}
            <option value="IN_PROGRESS">Em Atendimento</option>
            <option value="COMPLETED">Concluídos</option>
            <option value="NO_SHOW">Faltas (No-Show)</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
        </div>
      </div>

      {/* Period Header Banner */}
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 px-1">
        <h3 className="text-sm font-bold text-stone-800 capitalize">{formatPeriodTitle()}</h3>
        <span className="text-xs text-stone-500">
          {filteredAppointments.length} reserva(s) • {filteredBlocks.length} bloqueio(s) no período
        </span>
      </div>

      {/* Active TimeBlocks in Selected Period */}
      {filteredBlocks.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Bloqueios de Agenda Ativos no Período</span>
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredBlocks.map((tb) => {
              const s = new Date(tb.startDate);
              const e = new Date(tb.endDate);
              return (
                <div
                  key={tb.id}
                  className="bg-white rounded-xl border border-amber-200 p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] uppercase">
                        {BLOCK_TYPE_LABELS[tb.type] || tb.type}
                      </span>
                      <span className="font-semibold text-stone-800 truncate">
                        {tb.professional?.name || 'Todo o Estabelecimento'}
                      </span>
                    </div>
                    <p className="text-stone-600 mt-1">
                      {s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} •{' '}
                      {s.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} às{' '}
                      {e.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {tb.reason && <p className="text-stone-500 text-[11px] mt-0.5 break-words">Motivo: {tb.reason}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteTimeBlock(tb.id)}
                    title="Remover bloqueio"
                    aria-label="Remover bloqueio"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appointments List (Mobile Cards + Desktop Table) */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
        {/* Mobile Card View (< md) */}
        <div className="md:hidden divide-y divide-stone-100">
          {filteredAppointments.length === 0 ? (
            <div className="p-8 text-center text-stone-400 text-xs">
              Nenhum agendamento encontrado para os filtros e período selecionados.
            </div>
          ) : (
            filteredAppointments.map((app) => {
              const startObj = new Date(app.dateTime);
              const durationMin = Number(app.snapshotDurationMin || app.service?.durationMin || 60);
              const endObj = app.endDateTime
                ? new Date(app.endDateTime)
                : new Date(startObj.getTime() + durationMin * 60000);
              const priceReais = Number(app.snapshotPriceCents ?? app.totalAmountCents ?? 0) / 100;
              const originKey = app.origin || 'ONLINE';

              return (
                <div key={app.id} className="p-4 space-y-3 hover:bg-stone-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                        <CalendarIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-stone-900 text-sm">
                          {startObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} às{' '}
                          {endObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-stone-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{startObj.toLocaleDateString('pt-BR')} ({durationMin}m)</span>
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">{getStatusBadge(app.status)}</div>
                  </div>

                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/70 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-stone-900 text-sm truncate">
                        {app.client?.name || 'Cliente'}
                      </span>
                      {app.client?.phone && (
                        <span className="text-stone-500 font-mono shrink-0">{app.client.phone}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-stone-700">
                      <span className="font-medium truncate">{app.service?.name || 'Serviço'}</span>
                      <span className="font-bold text-stone-900 shrink-0">R$ {priceReais.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-200/60 text-stone-500">
                      <span className="truncate">Prof.: <strong className="text-stone-700">{app.professional?.name || 'Equipe'}</strong></span>
                      <span className="px-2 py-0.5 rounded bg-stone-200/70 text-stone-700 text-[10px] font-semibold uppercase shrink-0">
                        {ORIGIN_LABELS[originKey] || originKey}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {requireDeposit && (app.status === 'PENDING_PAYMENT' || app.status === 'PENDING') && onPayPix && (
                      <button
                        onClick={() => onPayPix(app)}
                        className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors text-xs font-semibold shadow-xs"
                      >
                        <QrCode className="w-3.5 h-3.5 shrink-0" />
                        <span>Cobrar Sinal</span>
                      </button>
                    )}

                    {app.status === 'CONFIRMED' && (
                      <button
                        onClick={() => onUpdateStatus(app.id, 'IN_PROGRESS')}
                        className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors text-xs font-semibold"
                      >
                        <Play className="w-3.5 h-3.5 shrink-0" />
                        <span>Iniciar</span>
                      </button>
                    )}

                    {(app.status === 'CONFIRMED' || app.status === 'IN_PROGRESS') && (
                      <button
                        onClick={() => {
                          if (confirm(`Confirmar conclusão do atendimento de ${app.client?.name || 'cliente'}?`)) {
                            onUpdateStatus(app.id, 'COMPLETED');
                          }
                        }}
                        className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors text-xs font-semibold"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Concluir</span>
                      </button>
                    )}

                    {app.status === 'CONFIRMED' && (
                      <button
                        onClick={() => {
                          if (confirm(`Registrar falta (No-Show) para ${app.client?.name || 'cliente'}?`)) {
                            onUpdateStatus(app.id, 'NO_SHOW');
                          }
                        }}
                        title="Registrar falta da cliente"
                        className="min-w-[42px] min-h-[42px] inline-flex items-center justify-center gap-1 px-2.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-semibold transition-colors"
                      >
                        <UserX className="w-4 h-4 shrink-0" />
                        <span className="xs:inline">Falta</span>
                      </button>
                    )}

                    <button
                      onClick={() => openAppointmentModal(app)}
                      title="Detalhes, reagendar ou trocar profissional"
                      className="min-w-[42px] min-h-[42px] inline-flex items-center justify-center gap-1 px-3 rounded-xl bg-stone-100 text-stone-700 hover:bg-stone-200 text-xs font-semibold transition-colors"
                    >
                      <Edit3 className="w-4 h-4 shrink-0" />
                      <span>Editar</span>
                    </button>

                    {!['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(app.status) && (
                      <button
                        onClick={() => {
                          if (confirm(`Deseja realmente cancelar o agendamento de ${app.client?.name || 'cliente'}?`)) {
                            onUpdateStatus(app.id, 'CANCELLED');
                          }
                        }}
                        title="Cancelar Agendamento"
                        aria-label="Cancelar Agendamento"
                        className="min-w-[42px] min-h-[42px] inline-flex items-center justify-center px-2.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-100 text-[11px] font-bold uppercase tracking-wider text-stone-400 bg-stone-50/50">
                <th className="py-3.5 px-5">Horário (Início - Fim)</th>
                <th className="py-3.5 px-5">Cliente</th>
                <th className="py-3.5 px-5">Serviço</th>
                <th className="py-3.5 px-5">Profissional</th>
                <th className="py-3.5 px-5">Origem</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right">Ações Operacionais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-sm">
              {filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    Nenhum agendamento encontrado para os filtros e período selecionados.
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((app) => {
                  const startObj = new Date(app.dateTime);
                  const durationMin = Number(app.snapshotDurationMin || app.service?.durationMin || 60);
                  const endObj = app.endDateTime
                    ? new Date(app.endDateTime)
                    : new Date(startObj.getTime() + durationMin * 60000);
                  const priceReais = Number(app.snapshotPriceCents ?? app.totalAmountCents ?? 0) / 100;
                  const originKey = app.origin || 'ONLINE';

                  return (
                    <tr key={app.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <CalendarIcon className="w-4 h-4 text-rose-500 shrink-0" />
                          <div>
                            <p className="font-semibold text-stone-900">
                              {startObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} às{' '}
                              {endObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-xs text-stone-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {startObj.toLocaleDateString('pt-BR')} ({durationMin}m)
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-5">
                        <p className="font-semibold text-stone-900">{app.client?.name || 'Cliente'}</p>
                        <p className="text-xs text-stone-400">{app.client?.phone || ''}</p>
                      </td>

                      <td className="py-4 px-5">
                        <span className="font-medium text-stone-800">{app.service?.name || 'Serviço'}</span>
                        <p className="text-xs text-stone-500 font-semibold">R$ {priceReais.toFixed(2)}</p>
                      </td>

                      <td className="py-4 px-5">
                        <span className="text-stone-700 font-medium">{app.professional?.name || 'Equipe'}</span>
                      </td>

                      <td className="py-4 px-5">
                        <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold">
                          {ORIGIN_LABELS[originKey] || originKey}
                        </span>
                      </td>

                      <td className="py-4 px-5 whitespace-nowrap">{getStatusBadge(app.status)}</td>

                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {requireDeposit && (app.status === 'PENDING_PAYMENT' || app.status === 'PENDING') && onPayPix && (
                            <button
                              onClick={() => onPayPix(app)}
                              title="Gerar QR Code Pix do Sinal"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors text-xs font-semibold shadow-xs"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Cobrar Sinal</span>
                            </button>
                          )}

                          {app.status === 'CONFIRMED' && (
                            <button
                              onClick={() => onUpdateStatus(app.id, 'IN_PROGRESS')}
                              title="Iniciar atendimento"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors text-xs font-semibold"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Iniciar</span>
                            </button>
                          )}

                          {(app.status === 'CONFIRMED' || app.status === 'IN_PROGRESS') && (
                            <button
                              onClick={() => {
                                if (confirm(`Confirmar conclusão do atendimento de ${app.client?.name || 'cliente'}?`)) {
                                  onUpdateStatus(app.id, 'COMPLETED');
                                }
                              }}
                              title="Marcar atendimento como concluído"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors text-xs font-semibold"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Concluir</span>
                            </button>
                          )}

                          {app.status === 'CONFIRMED' && (
                            <button
                              onClick={() => {
                                if (confirm(`Registrar falta (No-Show) para ${app.client?.name || 'cliente'}?`)) {
                                  onUpdateStatus(app.id, 'NO_SHOW');
                                }
                              }}
                              title="Registrar falta da cliente"
                              className="p-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => openAppointmentModal(app)}
                            title="Detalhes, reagendar ou trocar profissional"
                            className="p-1.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {!['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(app.status) && (
                            <button
                              onClick={() => {
                                if (confirm(`Deseja realmente cancelar o agendamento de ${app.client?.name || 'cliente'}?`)) {
                                  onUpdateStatus(app.id, 'CANCELLED');
                                }
                              }}
                              title="Cancelar Agendamento"
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Bloqueio de Agenda (Section 11) */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-bold text-base sm:text-lg text-stone-900">Registrar Bloqueio de Agenda</h3>
              <button
                onClick={() => setIsBlockModalOpen(false)}
                aria-label="Fechar modal"
                className="min-w-[40px] min-h-[40px] -mr-2 flex items-center justify-center text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {blockError && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl space-y-2">
                <div className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{blockError}</span>
                </div>
                {blockConflicts.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
                    <p className="font-bold text-[11px]">Agendamentos ativos no período:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      {blockConflicts.map((c) => (
                        <li key={c.id}>
                          {c.client?.name || 'Cliente'} — {new Date(c.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ({c.service?.name || 'Serviço'})
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-amber-800">
                      Os agendamentos existentes <strong>não serão cancelados automaticamente</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCreateTimeBlock(true)}
                      className="w-full min-h-[42px] mt-2 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-xs"
                    >
                      Confirmar bloqueio mesmo com agendamentos no período
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Profissional</label>
                <select
                  value={blockForm.professionalId}
                  onChange={(e) => setBlockForm({ ...blockForm, professionalId: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                >
                  <option value="">Todo o estabelecimento (Todas as profissionais)</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Categoria do Bloqueio</label>
                <select
                  value={blockForm.type}
                  onChange={(e) => setBlockForm({ ...blockForm, type: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                >
                  <option value="INTERVAL">Intervalo</option>
                  <option value="LUNCH">Almoço</option>
                  <option value="DAY_OFF">Folga</option>
                  <option value="VACATION">Férias</option>
                  <option value="PERSONAL">Compromisso pessoal</option>
                  <option value="EXCEPTION">Bloqueio excepcional</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Data</label>
                  <input
                    type="date"
                    value={blockForm.date}
                    onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
                    className="w-full min-h-[42px] px-2.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 sm:contents gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Início</label>
                    <select
                      value={blockForm.startTime}
                      onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })}
                      className="w-full min-h-[42px] px-2.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                    >
                      {ensureSlotInList(THIRTY_MIN_BLOCK_SLOTS, blockForm.startTime).map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Fim</label>
                    <select
                      value={blockForm.endTime}
                      onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })}
                      className="w-full min-h-[42px] px-2.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                    >
                      {ensureSlotInList(THIRTY_MIN_BLOCK_SLOTS, blockForm.endTime).map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Motivo / Observação</label>
                <input
                  type="text"
                  placeholder="Ex: Horário de almoço, consulta médica..."
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                />
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBlockModalOpen(false)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 border border-stone-200 sm:border-transparent"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingBlock}
                  onClick={() => handleCreateTimeBlock(false)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white disabled:opacity-50"
                >
                  {savingBlock ? 'Salvando...' : 'Salvar Bloqueio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalhes e Edição de Agendamento Existente (Section 12) */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="min-w-0 pr-2">
                <h3 className="font-bold text-base sm:text-lg text-stone-900 truncate">Detalhes e Gestão do Agendamento</h3>
                <p className="text-xs text-stone-500 truncate">
                  Cliente: <strong>{selectedApp.client?.name}</strong> • Origem: {ORIGIN_LABELS[selectedApp.origin || 'ONLINE'] || selectedApp.origin}
                </p>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                aria-label="Fechar modal"
                className="min-w-[40px] min-h-[40px] -mr-2 flex items-center justify-center text-stone-400 hover:text-stone-600 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl space-y-2">
                <p className="font-medium">{editError}</p>
                {editSuggestedSlots.length > 0 && (
                  <div className="pt-1">
                    <p className="font-bold text-[11px] mb-1">Horários livres sugeridos:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {editSuggestedSlots.map((slotIso) => {
                        const dt = new Date(slotIso);
                        return (
                          <button
                            key={slotIso}
                            type="button"
                            onClick={() => {
                              setEditDate(dt.toISOString().split('T')[0]);
                              setEditTime(dt.toTimeString().slice(0, 5));
                              setEditError(null);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-700 font-semibold text-[11px] hover:bg-rose-100"
                          >
                            {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às{' '}
                            {dt.toTimeString().slice(0, 5)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/70 text-xs space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-stone-500">Serviço Contratado:</span>
                <strong className="text-stone-900 text-right">{selectedApp.service?.name}</strong>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-stone-500">Valor Snapshot Preservado:</span>
                <strong className="text-stone-900">
                  R$ {(Number(selectedApp.snapshotPriceCents ?? selectedApp.totalAmountCents ?? 0) / 100).toFixed(2)}
                </strong>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-stone-500">Status Atual:</span>
                <span>{getStatusBadge(selectedApp.status)}</span>
              </div>
              <div className="pt-1 text-[11px] text-stone-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>Status financeiros são geridos exclusivamente via conciliação de pagamentos.</span>
              </div>
            </div>

            <form onSubmit={handleSaveAppointmentEdit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Nova Data</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Novo Horário</label>
                  <select
                    required
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                  >
                    {ensureSlotInList(THIRTY_MIN_APPOINTMENT_SLOTS, editTime).map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Profissional Responsável</label>
                <select
                  value={editProfessionalId}
                  onChange={(e) => setEditProfessionalId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                >
                  {professionals
                    .filter((p) => p.active !== false || p.id === selectedApp.professionalId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.specialty}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Observações do Atendimento</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Motivo da Alteração (Auditoria)</label>
                <input
                  type="text"
                  placeholder="Ex: Solicitação da cliente via WhatsApp"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                />
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 border border-stone-200 sm:border-transparent"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || ['CANCELLED', 'COMPLETED'].includes(selectedApp.status)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
                >
                  {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
