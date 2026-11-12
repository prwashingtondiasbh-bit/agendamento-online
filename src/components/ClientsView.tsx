import React, { useState, useEffect, useCallback } from 'react';
import { Client, ClientProfileData } from '../types';
import { apiFetch } from '../App';
import {
  UserPlus,
  Search,
  Phone,
  Mail,
  Calendar,
  FileText,
  Tag,
  X,
  Plus,
  CheckCircle2,
  XCircle,
  UserX,
  DollarSign,
  Edit3,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface ClientsViewProps {
  clients: Client[];
  userRole?: string;
  onOpenNewClient: () => void;
  onRefreshClients?: () => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients: initialClients,
  userRole = 'OWNER',
  onOpenNewClient,
  onRefreshClients,
}) => {
  const [clientsList, setClientsList] = useState<Client[]>(initialClients);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'NEW' | 'RECURRING'>('ALL');
  const [tagFilter, setTagFilter] = useState<string>('ALL');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: initialClients.length, totalPages: 1 });
  const [loadingList, setLoadingList] = useState(false);

  // Detailed Profile Modal state (Section 7)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ClientProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Profile Edit / Note / Tag states
  const [isEditingBasic, setIsEditingBasic] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPreferences, setEditPreferences] = useState('');
  const [editConsentWhatsapp, setEditConsentWhatsapp] = useState(true);
  const [newTagInput, setNewTagInput] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canManageCrm = ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST'].includes(userRole);

  const fetchFilteredClients = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (tagFilter !== 'ALL') params.set('tag', tagFilter);
      params.set('page', String(page));
      params.set('limit', '12');

      const res = await apiFetch(`/api/v1/clients?${params.toString()}`);
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setClientsList(result.data || []);
        if (result.pagination) setPagination(result.pagination);
        if (Array.isArray(result.availableTags)) setAvailableTags(result.availableTags);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  }, [searchTerm, typeFilter, tagFilter, page]);

  useEffect(() => {
    fetchFilteredClients();
  }, [fetchFilteredClients, initialClients]);

  const openClientProfile = async (clientId: string) => {
    setSelectedClientId(clientId);
    setLoadingProfile(true);
    setProfileFeedback(null);
    setIsEditingBasic(false);
    try {
      const res = await apiFetch(`/api/v1/clients/${clientId}/profile`);
      const result = await res.json().catch(() => ({}));
      if (result.success && result.data) {
        setProfileData(result.data);
        const c = result.data.client;
        setEditName(c.name || '');
        setEditPhone(c.phone || '');
        setEditEmail(c.email || '');
        setEditPreferences(c.preferences || c.notes || '');
        setEditConsentWhatsapp(c.communicationConsent?.whatsapp ?? true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveBasicData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) return;
    setProfileFeedback(null);
    try {
      const res = await apiFetch(`/api/v1/clients/${selectedClientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          phone: editPhone,
          email: editEmail,
          preferences: editPreferences,
          notes: editPreferences,
          communicationConsent: {
            whatsapp: editConsentWhatsapp,
            sms: false,
            email: true,
          },
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setProfileFeedback({ type: 'success', message: 'Dados da cliente atualizados com sucesso.' });
        setIsEditingBasic(false);
        await openClientProfile(selectedClientId);
        fetchFilteredClients();
        if (onRefreshClients) onRefreshClients();
      } else {
        setProfileFeedback({ type: 'error', message: result.error || 'Erro ao atualizar dados.' });
      }
    } catch (err: any) {
      setProfileFeedback({ type: 'error', message: err?.message || 'Erro de conexão.' });
    }
  };

  const handleAddTag = async () => {
    if (!selectedClientId || !profileData || !newTagInput.trim()) return;
    const currentTags = Array.isArray(profileData.client.tags) ? profileData.client.tags : [];
    const updatedTags = Array.from(new Set([...currentTags, newTagInput.trim()]));
    setNewTagInput('');

    const res = await apiFetch(`/api/v1/clients/${selectedClientId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: updatedTags }),
    });
    const result = await res.json().catch(() => ({}));
    if (result.success) {
      await openClientProfile(selectedClientId);
      fetchFilteredClients();
    } else {
      setProfileFeedback({ type: 'error', message: result.error || 'Erro ao adicionar etiqueta.' });
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedClientId || !profileData) return;
    const currentTags = Array.isArray(profileData.client.tags) ? profileData.client.tags : [];
    const updatedTags = currentTags.filter((t) => t !== tagToRemove);

    const res = await apiFetch(`/api/v1/clients/${selectedClientId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: updatedTags }),
    });
    const result = await res.json().catch(() => ({}));
    if (result.success) {
      await openClientProfile(selectedClientId);
      fetchFilteredClients();
    }
  };

  const handleAddInternalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !newNoteContent.trim()) return;
    setProfileFeedback(null);

    const res = await apiFetch(`/api/v1/clients/${selectedClientId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newNoteContent.trim() }),
    });
    const result = await res.json().catch(() => ({}));
    if (result.success) {
      setNewNoteContent('');
      setProfileFeedback({ type: 'success', message: 'Anotação interna registrada com sucesso.' });
      await openClientProfile(selectedClientId);
    } else {
      setProfileFeedback({ type: 'error', message: result.error || 'Erro ao registrar anotação.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top CRM Controls: Search, Filters & New Client */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          {/* Filter: Todas / Novas / Recorrentes */}
          <div className="grid grid-cols-3 sm:flex items-center bg-stone-100 p-1 rounded-xl">
            {(
              [
                { id: 'ALL', label: 'Todas' },
                { id: 'NEW', label: 'Novas' },
                { id: 'RECURRING', label: 'Recorrentes' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setTypeFilter(f.id);
                  setPage(1);
                }}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-center ${
                  typeFilter === f.id ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Filter by Tag */}
          {availableTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => {
                setTagFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[42px] px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-700"
            >
              <option value="ALL">Todas as etiquetas</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>
                  Etiqueta: {t}
                </option>
              ))}
            </select>
          )}
        </div>

        {canManageCrm && (
          <button
            onClick={onOpenNewClient}
            className="w-full lg:w-auto min-h-[44px] flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Cadastrar Cliente</span>
          </button>
        )}
      </div>

      {/* Clients Grid */}
      {loadingList ? (
        <div className="py-12 text-center text-stone-400 text-sm">Carregando base de clientes...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clientsList.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-stone-200/80 text-stone-400">
              Nenhuma cliente encontrada com os filtros selecionados.
            </div>
          ) : (
            clientsList.map((client) => (
              <div
                key={client.id}
                onClick={() => openClientProfile(client.id)}
                className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 flex flex-col justify-between hover:shadow-md hover:border-rose-200 transition-all cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-900 text-base">{client.name}</h3>
                        <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          Desde {new Date(client.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        client.isRecurring
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}
                    >
                      {client.isRecurring ? 'Recorrente' : 'Nova'}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 space-y-2 text-xs text-stone-600">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="font-medium">{client.phone}</span>
                    </div>
                    {client.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {(client.preferences || client.notes) && (
                      <div className="flex items-start gap-2 pt-1 text-stone-500 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                        <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{client.preferences || client.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {Array.isArray(client.tags) && client.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {client.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-stone-500">
                    <strong>{client.completedAppointmentsCount ?? 0}</strong> atendimento(s) concluído(s)
                  </span>
                  <span className="font-semibold text-rose-600 hover:text-rose-700">Ver ficha completa →</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-5 py-3 rounded-2xl border border-stone-200/80 text-xs text-stone-600">
          <span>
            Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ({pagination.total} clientes)
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detailed Client Profile Modal / Drawer (Section 7 & 8) */}
      {selectedClientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-stone-200 flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 sm:p-6 border-b border-stone-200 flex items-center justify-between bg-stone-50 gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-stone-900 truncate">
                  {profileData?.client.name || 'Perfil Detalhado da Cliente'}
                </h3>
                <p className="text-xs text-stone-500">
                  Ficha CRM, indicadores de relacionamento, histórico e anotações internas
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedClientId(null);
                  setProfileData(null);
                }}
                className="min-w-[40px] min-h-[40px] p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingProfile || !profileData ? (
              <div className="p-12 text-center text-stone-400 text-sm">Carregando perfil completo...</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 pb-safe">
                {profileFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium border ${
                      profileFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}
                  >
                    {profileFeedback.message}
                  </div>
                )}

                {/* Relationship & Reconciled Financial Indicators (Section 7) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/70">
                    <div className="flex items-center justify-between text-[11px] text-stone-500 font-semibold">
                      <span>Concluídos</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="text-xl font-bold text-stone-900 mt-1">{profileData.indicators.totalCompleted}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/70">
                    <div className="flex items-center justify-between text-[11px] text-stone-500 font-semibold">
                      <span>Cancelamentos</span>
                      <XCircle className="w-3.5 h-3.5 text-rose-500" />
                    </div>
                    <p className="text-xl font-bold text-stone-900 mt-1">{profileData.indicators.totalCancelled}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/70">
                    <div className="flex items-center justify-between text-[11px] text-stone-500 font-semibold">
                      <span>Faltas (No-Show)</span>
                      <UserX className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <p className="text-xl font-bold text-stone-900 mt-1">{profileData.indicators.totalNoShows}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <div className="flex items-center justify-between text-[11px] text-emerald-800 font-semibold">
                      <span>Total Pago (Real)</span>
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="text-lg font-bold text-emerald-900 mt-1">
                      R$ {(profileData.indicators.totalPaidCents / 100).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">Pagamentos aprovados líquidos</p>
                  </div>
                </div>

                {/* Last & Next Appointment Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/60 flex justify-between items-center">
                    <span className="text-stone-500">Último atendimento:</span>
                    <strong className="text-stone-800">
                      {profileData.indicators.lastAppointmentDate
                        ? new Date(profileData.indicators.lastAppointmentDate).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Nenhum registrado'}
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/60 flex justify-between items-center">
                    <span className="text-stone-500">Próximo agendamento:</span>
                    <strong className="text-rose-600">
                      {profileData.indicators.nextAppointmentDate
                        ? new Date(profileData.indicators.nextAppointmentDate).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Sem agendamento futuro'}
                    </strong>
                  </div>
                </div>

                {/* Basic Info & Preferences Section */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      Dados Cadastrais e Preferências de Atendimento
                    </h4>
                    {canManageCrm && (
                      <button
                        type="button"
                        onClick={() => setIsEditingBasic(!isEditingBasic)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isEditingBasic ? 'Cancelar edição' : 'Editar cadastro'}</span>
                      </button>
                    )}
                  </div>

                  {isEditingBasic ? (
                    <form onSubmit={handleSaveBasicData} className="space-y-3 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold uppercase text-stone-500 mb-1">Nome</label>
                          <input
                            type="text"
                            required
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold uppercase text-stone-500 mb-1">Telefone</label>
                          <input
                            type="text"
                            required
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-stone-500 mb-1">E-mail</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-stone-500 mb-1">
                          Preferências de Atendimento (Formato, esmaltação, alergias)
                        </label>
                        <textarea
                          rows={2}
                          value={editPreferences}
                          onChange={(e) => setEditPreferences(e.target.value)}
                          className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-stone-700">
                        <input
                          type="checkbox"
                          checked={editConsentWhatsapp}
                          onChange={(e) => setEditConsentWhatsapp(e.target.checked)}
                          className="rounded text-rose-600"
                        />
                        <span>Autoriza recebimento de lembretes e avisos por WhatsApp</span>
                      </label>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                        >
                          Salvar Cadastro
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-2 text-xs text-stone-700">
                      <p>
                        <strong>Telefone:</strong> {profileData.client.phone} •{' '}
                        <strong>E-mail:</strong> {profileData.client.email || 'Não informado'}
                      </p>
                      <p>
                        <strong>Preferências:</strong>{' '}
                        {profileData.client.preferences || profileData.client.notes || 'Nenhuma preferência registrada.'}
                      </p>
                      <p className="flex items-center gap-1.5 text-stone-500">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Consentimento WhatsApp:{' '}
                          {profileData.client.communicationConsent?.whatsapp !== false ? 'Autorizado' : 'Não autorizado'}
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Tags Management (Section 8) */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Etiquetas de Segmentação (Tags)
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {Array.isArray(profileData.client.tags) && profileData.client.tags.length > 0 ? (
                      profileData.client.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold"
                        >
                          <Tag className="w-3 h-3" />
                          <span>{tag}</span>
                          {canManageCrm && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag)}
                              className="text-rose-400 hover:text-rose-700"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-stone-400">Nenhuma etiqueta associada.</span>
                    )}
                  </div>

                  {canManageCrm && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Nova etiqueta (ex: VIP, Fibra, Sensível)..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Protected Internal Notes (Section 8) */}
                {canManageCrm && (
                  <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                      <MessageSquarePlus className="w-3.5 h-3.5 text-rose-500" />
                      <span>Anotações Internas do Estabelecimento (Restrito à Gestão)</span>
                    </h4>

                    <form onSubmit={handleAddInternalNote} className="space-y-2">
                      <textarea
                        rows={2}
                        placeholder="Registrar observação interna sobre atendimento, pontualidade ou cuidados..."
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={!newNoteContent.trim()}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          Registrar Anotação
                        </button>
                      </div>
                    </form>

                    <div className="space-y-2 pt-2">
                      {Array.isArray(profileData.client.internalNotes) && profileData.client.internalNotes.length > 0 ? (
                        profileData.client.internalNotes.map((note) => (
                          <div key={note.id} className="p-3 rounded-xl bg-stone-50 border border-stone-200/70 text-xs">
                            <p className="text-stone-800">{note.content}</p>
                            <p className="text-[10px] text-stone-400 mt-1">
                              Por <strong>{note.authorName}</strong> em{' '}
                              {new Date(note.createdAt).toLocaleString('pt-BR')}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-stone-400">Nenhuma anotação interna registrada.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Complete Appointment History (Section 7) */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Histórico Completo de Agendamentos ({profileData.appointments.length})
                  </h4>

                  {profileData.appointments.length === 0 ? (
                    <p className="text-xs text-stone-400 py-4 text-center">
                      Nenhum agendamento registrado para esta cliente.
                    </p>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {profileData.appointments.map((app) => (
                        <div key={app.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <p className="font-semibold text-stone-900">
                              {app.service?.name || 'Serviço'} — Prof. {app.professional?.name || 'Equipe'}
                            </p>
                            <p className="text-stone-500 mt-0.5">
                              {new Date(app.dateTime).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              • Origem: {app.origin || 'ONLINE'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-stone-900">
                              R$ {(Number(app.snapshotPriceCents ?? app.totalAmountCents ?? 0) / 100).toFixed(2)}
                            </p>
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                              {app.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
