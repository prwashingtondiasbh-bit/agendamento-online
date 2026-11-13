import React, { useState, useEffect } from 'react';
import { Client, Professional, Service } from '../types';
import { X, Plus, Trash2, UserPlus, Check, Clock, AlertTriangle } from 'lucide-react';
import { ensureSlotInList, generateThirtyMinuteSlots } from '../utils/timeSlots';

const ADMIN_THIRTY_MIN_SLOTS = generateThirtyMinuteSlots('07:00', '22:00', true);

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  professionals: Professional[];
  services: Service[];
  requireDeposit?: boolean;
  onSubmit: (data: any) => Promise<{ success: boolean; error?: string; suggestedSlots?: string[] }>;
  onQuickCreateClient?: (data: any) => Promise<{ success: boolean; data?: Client; existingClient?: Client; error?: string }>;
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  isOpen,
  onClose,
  clients,
  professionals,
  services,
  requireDeposit = true,
  onSubmit,
  onQuickCreateClient,
}) => {
  const activeServices = React.useMemo(() => services.filter((s) => s.active !== false), [services]);
  const activeProfessionals = React.useMemo(() => professionals.filter((p) => p.active !== false), [professionals]);

  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('14:00');
  const [origin, setOrigin] = useState<'PRESENCIAL' | 'TELEFONE' | 'WHATSAPP' | 'INSTAGRAM' | 'OUTRO'>('WHATSAPP');
  const [initialStatus, setInitialStatus] = useState<'CONFIRMED' | 'PENDING' | 'PENDING_PAYMENT'>('CONFIRMED');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Quick inline client creation state (Section 5)
  const [isQuickClientMode, setIsQuickClientMode] = useState(false);
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientPhone, setQuickClientPhone] = useState('');
  const [quickClientEmail, setQuickClientEmail] = useState('');
  const [duplicateClientFound, setDuplicateClientFound] = useState<Client | null>(null);
  const [creatingQuickClient, setCreatingQuickClient] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClientId((prev) => prev || clients[0]?.id || '');
      setProfessionalId((prev) => prev || activeProfessionals[0]?.id || '');
      setServiceId((prev) => prev || activeServices[0]?.id || '');
      setError(null);
      setSuggestedSlots([]);
      setDuplicateClientFound(null);
    }
  }, [isOpen, clients, activeProfessionals, activeServices]);

  if (!isOpen) return null;

  const filteredClients = clients.filter((c) => {
    if (!clientSearch.trim()) return true;
    const q = clientSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
  });

  const handleQuickClientSubmit = async () => {
    if (!onQuickCreateClient) return;
    if (!quickClientName.trim() || !quickClientPhone.trim()) {
      setError('Informe nome e telefone para cadastrar a cliente rapidamente.');
      return;
    }
    setCreatingQuickClient(true);
    setError(null);
    setDuplicateClientFound(null);
    try {
      const res = await onQuickCreateClient({
        name: quickClientName.trim(),
        phone: quickClientPhone.trim(),
        email: quickClientEmail.trim(),
      });
      if (res.success && res.data) {
        setClientId(res.data.id);
        setIsQuickClientMode(false);
        setQuickClientName('');
        setQuickClientPhone('');
        setQuickClientEmail('');
      } else if (res.existingClient) {
        setDuplicateClientFound(res.existingClient);
        setError(res.error || 'Já existe uma cliente cadastrada com este telefone.');
      } else {
        setError(res.error || 'Erro ao cadastrar cliente');
      }
    } finally {
      setCreatingQuickClient(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !professionalId || !serviceId || !date || !time) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    setError(null);
    setSuggestedSlots([]);
    setSubmitting(true);
    try {
      const dateTime = new Date(`${date}T${time}:00`).toISOString();
      const res = await onSubmit({
        clientId,
        professionalId,
        serviceId,
        dateTime,
        origin,
        status: initialStatus,
        notes,
      });
      if (res.success) {
        onClose();
      } else {
        setError(res.error || 'Erro ao criar agendamento');
        if (Array.isArray(res.suggestedSlots)) {
          setSuggestedSlots(res.suggestedSlots);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedService = activeServices.find((s) => s.id === serviceId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-5 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="min-w-0 pr-2">
            <h3 className="font-bold text-base sm:text-lg text-stone-900">Novo Agendamento Manual</h3>
            <p className="text-xs text-stone-500">
              Registre atendimentos recebidos por WhatsApp, telefone ou presencialmente
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="min-w-[40px] min-h-[40px] -mr-2 flex items-center justify-center text-stone-400 hover:text-stone-600 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl space-y-2">
            <p className="font-semibold">{error}</p>

            {/* Duplicate phone quick selection (Section 5) */}
            {duplicateClientFound && (
              <div className="p-2.5 bg-white rounded-lg border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-stone-900">{duplicateClientFound.name}</p>
                  <p className="text-[11px] text-stone-500">{duplicateClientFound.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClientId(duplicateClientFound.id);
                    setIsQuickClientMode(false);
                    setDuplicateClientFound(null);
                    setError(null);
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700"
                >
                  Selecionar cliente existente
                </button>
              </div>
            )}

            {/* Suggested available slots when occupied (Section 5 & 13) */}
            {suggestedSlots.length > 0 && (
              <div className="pt-1">
                <p className="font-bold text-[11px] text-rose-900 flex items-center gap-1 mb-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Horários disponíveis próximos para esta profissional:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedSlots.map((iso) => {
                    const dt = new Date(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          setDate(dt.toISOString().split('T')[0]);
                          setTime(dt.toTimeString().slice(0, 5));
                          setError(null);
                          setSuggestedSlots([]);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-700 font-semibold text-xs hover:bg-rose-100"
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client Selection or Quick Creation */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold uppercase text-stone-500">Cliente</label>
              {onQuickCreateClient && (
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickClientMode(!isQuickClientMode);
                    setError(null);
                    setDuplicateClientFound(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>{isQuickClientMode ? 'Buscar cliente existente' : '+ Cadastrar nova cliente rápida'}</span>
                </button>
              )}
            </div>

            {isQuickClientMode ? (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Nome completo *"
                    value={quickClientName}
                    onChange={(e) => setQuickClientName(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    placeholder="WhatsApp / Telefone *"
                    value={quickClientPhone}
                    onChange={(e) => setQuickClientPhone(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="email"
                    placeholder="E-mail (opcional)"
                    value={quickClientEmail}
                    onChange={(e) => setQuickClientEmail(e.target.value)}
                    className="flex-1 min-h-[42px] px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs"
                  />
                  <button
                    type="button"
                    disabled={creatingQuickClient}
                    onClick={handleQuickClientSubmit}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{creatingQuickClient ? 'Salvando...' : 'Vincular'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Filtrar cliente por nome ou telefone..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs"
                />
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-200 rounded-xl text-sm"
                  required
                >
                  {filteredClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Serviço (Ativos)</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              >
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — R$ {(Number(s.priceCents || 0) / 100).toFixed(2)} ({s.durationMin}m)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Profissional (Ativas)</label>
              <select
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              >
                {activeProfessionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.specialty}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Horário</label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              >
                {ensureSlotInList(ADMIN_THIRTY_MIN_SLOTS, time).map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Origin & Initial Status (Section 5) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Origem do Agendamento</label>
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value as any)}
                className="w-full min-h-[42px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium"
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="PRESENCIAL">Presencial (Recepção)</option>
                <option value="TELEFONE">Telefone</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="OUTRO">Outro canal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Status Inicial Permitido</label>
              <select
                value={!requireDeposit && initialStatus === 'PENDING_PAYMENT' ? 'CONFIRMED' : initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as any)}
                className="w-full min-h-[42px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium"
              >
                <option value="CONFIRMED">Confirmado na agenda</option>
                {requireDeposit && (
                  <option value="PENDING_PAYMENT">Aguardando pagamento de sinal Pix</option>
                )}
                <option value="PENDING">Pendente de confirmação</option>
              </select>
            </div>
          </div>

          {selectedService && (
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/70 flex flex-col xs:flex-row xs:items-center justify-between gap-1 text-xs text-stone-600">
              <span>
                Duração prevista: <strong>{selectedService.durationMin} min</strong>
              </span>
              <span>
                Valor: <strong>R$ {(Number(selectedService.priceCents || 0) / 100).toFixed(2)}</strong>{' '}
                {requireDeposit ? `(Sinal ${selectedService.depositPercent}%)` : '(Sem sinal)'}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Observações do Atendimento</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Cliente solicitou remoção de gel anterior..."
              className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm h-16"
            />
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 border border-stone-200 sm:border-transparent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/20 disabled:opacity-50"
            >
              {submitting ? 'Registrando...' : 'Confirmar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<{ success: boolean; error?: string }>;
}

export const NewClientModal: React.FC<NewClientModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferences, setPreferences] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await onSubmit({
        name,
        phone,
        email,
        notes: preferences,
        preferences,
        tags,
      });
      if (res.success) {
        setName('');
        setPhone('');
        setEmail('');
        setPreferences('');
        setTagsInput('');
        onClose();
      } else {
        setError(res.error || 'Erro ao cadastrar cliente');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-5 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <h3 className="font-bold text-base sm:text-lg text-stone-900">Cadastrar Nova Cliente</h3>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="min-w-[40px] min-h-[40px] -mr-2 flex items-center justify-center text-stone-400 hover:text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1.5">Nome Completo *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Mariana Costa"
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1.5">Telefone / WhatsApp *</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 98888-7777"
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1.5">E-mail (Opcional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1.5">
              Etiquetas Iniciais (Separadas por vírgula)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Ex: VIP, Alongamento, Indicada"
              className="w-full min-h-[42px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1.5">
              Preferências de Atendimento / Alergias
            </label>
            <textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="Formato favorito, cores preferidas, observações..."
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm h-20"
            />
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 border border-stone-200 sm:border-transparent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold bg-stone-900 hover:bg-stone-800 text-white shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service?: Service | null;
  professionals: Professional[];
  requireDeposit?: boolean;
  onSubmit: (data: any) => Promise<{ success: boolean; error?: string }>;
}

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  service,
  professionals,
  requireDeposit = true,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Alongamento');
  const [description, setDescription] = useState('');
  const [priceReais, setPriceReais] = useState('150.00');
  const [durationMin, setDurationMin] = useState(60);
  const [bufferAfterMin, setBufferAfterMin] = useState(10);
  const [depositPercent, setDepositPercent] = useState(30);
  const [active, setActive] = useState(true);
  const [selectedProfIds, setSelectedProfIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (service) {
      setName(service.name);
      setCategory(service.category);
      setDescription(service.description || '');
      setPriceReais((Number(service.priceCents || 0) / 100).toFixed(2));
      setDurationMin(service.durationMin || 60);
      setBufferAfterMin(service.bufferAfterMin || 0);
      setDepositPercent(service.depositPercent || 30);
      setActive(service.active !== false);
      setSelectedProfIds(service.professionals?.map((p: any) => p.professionalId) || []);
    } else {
      setName('');
      setCategory('Alongamento');
      setDescription('');
      setPriceReais('120.00');
      setDurationMin(60);
      setBufferAfterMin(10);
      setDepositPercent(30);
      setActive(true);
      setSelectedProfIds(professionals.map((p) => p.id));
    }
    setError(null);
  }, [service, professionals, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const priceCents = Math.round(parseFloat(priceReais.replace(',', '.')) * 100);
      const res = await onSubmit({
        name,
        category,
        description,
        priceCents,
        durationMin: Number(durationMin),
        bufferBeforeMin: 0,
        bufferAfterMin: Number(bufferAfterMin),
        preparationMin: 0,
        depositPercent: Number(depositPercent),
        active,
        professionalIds: selectedProfIds,
      });
      if (res.success) {
        onClose();
      } else {
        setError(res.error || 'Erro ao salvar serviço');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleProf = (id: string) => {
    setSelectedProfIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h3 className="font-bold text-base sm:text-lg text-stone-900">
            {service ? 'Editar Serviço' : 'Novo Serviço de Manicure'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="min-w-[40px] min-h-[40px] -mr-2 flex items-center justify-center text-stone-400 hover:text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Nome do Procedimento</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Banho de Gel"
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Categoria</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Alongamento, Pedicure..."
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              />
            </div>
          </div>

          <div className={`grid grid-cols-1 ${requireDeposit ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                value={priceReais}
                onChange={(e) => setPriceReais(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Duração (min)</label>
              <input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              />
            </div>
            {requireDeposit && (
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Sinal (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">
                Intervalo Limpeza após (min)
              </label>
              <input
                type="number"
                min={0}
                value={bufferAfterMin}
                onChange={(e) => setBufferAfterMin(Number(e.target.value))}
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
              />
            </div>

            <div className="pt-1 sm:pt-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded text-rose-600 w-4 h-4 shrink-0"
                />
                <span>Serviço ativo para novos agendamentos</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm h-16"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-500 mb-1.5">
              Profissionais Habilitadas
            </label>
            <div className="flex flex-wrap gap-2">
              {professionals.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggleProf(p.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    selectedProfIds.includes(p.id)
                      ? 'bg-rose-50 border-rose-500 text-rose-700'
                      : 'bg-stone-50 border-stone-200 text-stone-500'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 border border-stone-200 sm:border-transparent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar Serviço'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ProfessionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  professional?: Professional | null;
  onSubmit: (data: any) => Promise<{ success: boolean; error?: string; conflicts?: any[] }>;
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const ProfessionalModal: React.FC<ProfessionalModalProps> = ({
  isOpen,
  onClose,
  professional,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('Nail Designer');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);
  const [workingHours, setWorkingHours] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (professional) {
      setName(professional.name);
      setSpecialty(professional.specialty);
      setEmail(professional.email || '');
      setPhone(professional.phone || '');
      setActive(professional.active !== false);
      setWorkingHours(
        professional.workingHours && professional.workingHours.length > 0
          ? professional.workingHours
          : [1, 2, 3, 4, 5, 6].map((d) => ({
              dayOfWeek: d,
              startTime: '09:00',
              endTime: '19:00',
              breakStart: '12:00',
              breakEnd: '13:00',
            }))
      );
    } else {
      setName('');
      setSpecialty('Alongamento em Gel');
      setEmail('');
      setPhone('');
      setActive(true);
      setWorkingHours(
        [1, 2, 3, 4, 5, 6].map((d) => ({
          dayOfWeek: d,
          startTime: '09:00',
          endTime: '19:00',
          breakStart: '12:00',
          breakEnd: '13:00',
        }))
      );
    }
    setError(null);
    setConflicts([]);
  }, [professional, isOpen]);

  if (!isOpen) return null;

  const submitForm = async (confirmFutureConflicts = false) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await onSubmit({
        name,
        specialty,
        email,
        phone,
        active,
        workingHours,
        confirmFutureConflicts,
      });
      if (res.success) {
        setConflicts([]);
        onClose();
      } else {
        setError(res.error || 'Erro ao salvar profissional');
        if (Array.isArray(res.conflicts)) {
          setConflicts(res.conflicts);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(false);
  };

  const addDay = () => {
    setWorkingHours([
      ...workingHours,
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    ]);
  };

  const removeDay = (idx: number) => {
    setWorkingHours(workingHours.filter((_, i) => i !== idx));
  };

  const updateDay = (idx: number, field: string, value: any) => {
    const next = [...workingHours];
    next[idx] = { ...next[idx], [field]: value };
    setWorkingHours(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h3 className="font-bold text-base sm:text-lg text-stone-900">
            {professional ? 'Editar Profissional & Escala' : 'Cadastrar Profissional'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="min-w-[40px] min-h-[40px] -mr-2 flex items-center justify-center text-stone-400 hover:text-stone-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl space-y-2">
            <div className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {conflicts.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
                <p className="font-bold text-[11px]">Agendamentos futuros afetados:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {conflicts.map((c: any) => (
                    <li key={c.id}>
                      {c.client?.name || 'Cliente'} em {new Date(c.dateTime).toLocaleString('pt-BR')}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => submitForm(true)}
                  className="w-full min-h-[42px] mt-2 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-xs"
                >
                  Confirmar alteração mantendo os agendamentos futuros para reagendamento manual
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Nome Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Especialidade</label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">WhatsApp</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded text-rose-600 w-4 h-4 shrink-0"
            />
            <span>Profissional ativa para receber novos agendamentos</span>
          </label>

          <div className="space-y-2 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase text-stone-500">
                Jornada de Trabalho & Intervalo
              </label>
              <button
                type="button"
                onClick={addDay}
                className="min-h-[36px] text-xs text-rose-600 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Dia
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {workingHours.map((wh, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-xs"
                >
                  <select
                    value={wh.dayOfWeek}
                    onChange={(e) => updateDay(idx, 'dayOfWeek', Number(e.target.value))}
                    className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 min-h-[36px]"
                  >
                    {DAYS.map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      value={wh.startTime}
                      onChange={(e) => updateDay(idx, 'startTime', e.target.value)}
                      className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 min-h-[36px]"
                    />
                    <span>às</span>
                    <input
                      type="time"
                      value={wh.endTime}
                      onChange={(e) => updateDay(idx, 'endTime', e.target.value)}
                      className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 min-h-[36px]"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-stone-400">Pausa:</span>
                    <input
                      type="time"
                      value={wh.breakStart || ''}
                      onChange={(e) => updateDay(idx, 'breakStart', e.target.value)}
                      className="bg-white border border-stone-200 rounded-lg px-1.5 py-1.5 min-h-[36px]"
                    />
                    <span>-</span>
                    <input
                      type="time"
                      value={wh.breakEnd || ''}
                      onChange={(e) => updateDay(idx, 'breakEnd', e.target.value)}
                      className="bg-white border border-stone-200 rounded-lg px-1.5 py-1.5 min-h-[36px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDay(idx)}
                    aria-label="Remover dia"
                    className="text-rose-500 hover:text-rose-700 ml-auto p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 border border-stone-200 sm:border-transparent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl text-sm font-semibold bg-stone-900 hover:bg-stone-800 text-white shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar Profissional'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
