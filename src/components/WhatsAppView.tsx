import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  RefreshCw,
  ShieldCheck,
  Bell,
  FileText,
  Users,
  XCircle,
  Play,
  Lock,
} from 'lucide-react';
import {
  WhatsAppConfigPublic,
  WhatsAppMessageItem,
  WhatsAppScheduledReminderItem,
  WhatsAppTemplateItem,
} from '../types';
import { apiFetch } from '../App';

interface WhatsAppViewProps {
  userRole: string;
  requireDeposit?: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  APPOINTMENT_CONFIRMATION: 'Confirmação de agendamento',
  APPOINTMENT_REMINDER: 'Lembrete automático de atendimento',
  APPOINTMENT_RESCHEDULED: 'Reagendamento / alteração de horário',
  CANCELLATION_CONFIRMED: 'Cancelamento confirmado',
  CANCELLATION_REQUEST_UPDATED: 'Atualização de solicitação de cancelamento',
  PAYMENT_UPDATED: 'Confirmação de pagamento',
  REFUND_UPDATED: 'Atualização de reembolso',
  MANUAL_OPERATIONAL: 'Mensagem operacional manual',
  PROMOTIONAL_CAMPAIGN: 'Comunicação promocional (exige opt-in específico)',
};

const STATUS_BADGE: Record<
  string,
  { label: string; className: string; description: string }
> = {
  PENDING: {
    label: 'Na fila (Pendente)',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Aguardando processamento ou nova tentativa agendada',
  },
  PROCESSING: {
    label: 'Processando',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Em comunicação com a API da Meta',
  },
  SENT: {
    label: 'Enviada (Aceita pela Meta)',
    className: 'bg-sky-100 text-sky-800 border-sky-200',
    description: 'Aceita pela Cloud API (wamid gerado), aguardando confirmação de entrega via webhook',
  },
  DELIVERED: {
    label: 'Entregue no aparelho',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Entrega confirmada pelo webhook oficial da Meta',
  },
  READ: {
    label: 'Lida pela cliente',
    className: 'bg-teal-100 text-teal-900 border-teal-300',
    description: 'Leitura confirmada pelo webhook oficial da Meta',
  },
  FAILED: {
    label: 'Falha no envio',
    className: 'bg-rose-100 text-rose-800 border-rose-200',
    description: 'Erro reportado pela Meta ou credenciais ausentes',
  },
  CANCELLED: {
    label: 'Cancelada',
    className: 'bg-stone-200 text-stone-700 border-stone-300',
    description: 'Cancelada antes do envio (ex.: agendamento desmarcado)',
  },
};

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({ userRole, requireDeposit = true }) => {
  const canManage = userRole === 'SUPER_ADMIN' || userRole === 'OWNER' || userRole === 'MANAGER';

  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'config' | 'templates' | 'consent' | 'manual'
  >('overview');

  const [config, setConfig] = useState<WhatsAppConfigPublic | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplateItem[]>([]);
  const visibleTemplates = templates.filter(
    (tpl) => requireDeposit || (tpl.eventType !== 'PAYMENT_UPDATED' && tpl.eventType !== 'REFUND_UPDATED')
  );
  const [messages, setMessages] = useState<WhatsAppMessageItem[]>([]);
  const [reminders, setReminders] = useState<WhatsAppScheduledReminderItem[]>([]);
  const [clientsConsent, setClientsConsent] = useState<any[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Config form state (secrets are write-only, never prefilled from backend)
  const [formState, setFormState] = useState({
    displayName: '',
    businessPhone: '',
    phoneNumberId: '',
    wabaId: '',
    accessToken: '',
    webhookVerifyToken: '',
    appSecret: '',
    enableBookingConfirmation: true,
    enableReminders: true,
    enableRescheduleAlerts: true,
    enableCancellationAlerts: true,
    enablePaymentAlerts: true,
    enableRefundAlerts: true,
    reminder24hEnabled: true,
    reminder3hEnabled: true,
    customReminderEnabled: false,
    customReminderHours: 12,
    allowedWindowStart: '08:00',
    allowedWindowEnd: '20:00',
  });

  // Manual send form state
  const [manualClientId, setManualClientId] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualUseFreeText, setManualUseFreeText] = useState(false);
  const [sendingManual, setSendingManual] = useState(false);

  // Filters for message queue
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, msgRes, cliRes] = await Promise.all([
        apiFetch('/api/v1/whatsapp/config'),
        apiFetch(
          `/api/v1/whatsapp/messages?status=${encodeURIComponent(
            statusFilter
          )}&eventType=${encodeURIComponent(eventFilter)}`
        ),
        apiFetch('/api/v1/whatsapp/clients-consent'),
      ]);

      const [cfgJson, msgJson, cliJson] = await Promise.all([
        cfgRes.json().catch(() => ({})),
        msgRes.json().catch(() => ({})),
        cliRes.json().catch(() => ({})),
      ]);

      if (cfgJson.success && cfgJson.data) {
        const c: WhatsAppConfigPublic = cfgJson.data.config;
        setConfig(c);
        setTemplates(cfgJson.data.templates || []);
        setWebhookUrl(cfgJson.data.webhookCallbackUrl || '');
        setFormState((prev) => ({
          ...prev,
          displayName: c.displayName || '',
          businessPhone: c.businessPhone || '',
          phoneNumberId: c.phoneNumberId || '',
          wabaId: c.wabaId || '',
          accessToken: '',
          webhookVerifyToken: '',
          appSecret: '',
          enableBookingConfirmation: c.enableBookingConfirmation,
          enableReminders: c.enableReminders,
          enableRescheduleAlerts: c.enableRescheduleAlerts,
          enableCancellationAlerts: c.enableCancellationAlerts,
          enablePaymentAlerts: c.enablePaymentAlerts,
          enableRefundAlerts: c.enableRefundAlerts,
          reminder24hEnabled: c.reminder24hEnabled,
          reminder3hEnabled: c.reminder3hEnabled,
          customReminderEnabled: c.customReminderEnabled,
          customReminderHours: c.customReminderHours || 12,
          allowedWindowStart: c.allowedWindowStart || '08:00',
          allowedWindowEnd: c.allowedWindowEnd || '20:00',
        }));
      }

      if (msgJson.success && msgJson.data) {
        setMessages(msgJson.data.messages || []);
        setReminders(msgJson.data.reminders || []);
      }

      if (cliJson.success && Array.isArray(cliJson.data)) {
        setClientsConsent(cliJson.data);
        if (!manualClientId && cliJson.data.length > 0) {
          setManualClientId(cliJson.data[0].id);
        }
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Erro ao carregar dados do WhatsApp.' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, eventFilter, manualClientId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch('/api/v1/whatsapp/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setFeedback({
          type: 'success',
          text: 'Configurações do WhatsApp Business salvas com segurança. Valide a conexão para ativar o status CONECTADO.',
        });
        await loadAll();
      } else {
        setFeedback({ type: 'error', text: json.error || 'Erro ao salvar configuração.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro de comunicação.' });
    }
  };

  const handleTestConnection = async () => {
    setFeedback(null);
    try {
      const res = await apiFetch('/api/v1/whatsapp/config/test', {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setFeedback({
          type: 'success',
          text: 'Conexão validada com sucesso junto à Meta WhatsApp Cloud API!',
        });
      } else {
        setFeedback({
          type: 'error',
          text:
            json.error ||
            'Não foi possível validar a conexão na Meta Cloud API. Verifique o Phone Number ID e o Access Token.',
        });
      }
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao testar conexão.' });
    }
  };

  const handleTemplateStatusChange = async (
    eventType: string,
    status: string,
    templateName: string
  ) => {
    setFeedback(null);
    const res = await apiFetch(`/api/v1/whatsapp/templates/${eventType}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, templateName }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: `Template ${templateName} atualizado.` });
      await loadAll();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao atualizar template.' });
    }
  };

  const handleUpdateClientConsent = async (clientId: string, patch: any) => {
    setFeedback(null);
    const res = await apiFetch(`/api/v1/whatsapp/clients/${clientId}/consent`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: 'Preferências e consentimento da cliente atualizados com sucesso.',
      });
      await loadAll();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao atualizar consentimento.' });
    }
  };

  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingManual(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/v1/whatsapp/send-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: manualClientId,
          customOperationalNote: manualNote,
          useFreeText: manualUseFreeText,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        const msgStatus = json.data?.status;
        setFeedback({
          type: msgStatus === 'FAILED' ? 'error' : 'success',
          text:
            msgStatus === 'SENT'
              ? `Mensagem aceita pela API da Meta (wamid: ${json.data?.providerMessageId}). Aguardando webhook de entrega.`
              : msgStatus === 'FAILED'
              ? `Mensagem registrada na fila com status FALHA (${json.data?.errorCode}): ${json.data?.errorMessage}`
              : 'Mensagem operacional registrada na fila de processamento.',
        });
        setManualNote('');
        await loadAll();
        setActiveSubTab('overview');
      } else {
        setFeedback({
          type: 'error',
          text: json.error || 'Não foi possível enviar a mensagem manual.',
        });
      }
    } finally {
      setSendingManual(false);
    }
  };

  const handleRunWorker = async () => {
    setFeedback(null);
    const res = await apiFetch('/api/v1/whatsapp/worker/run', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: `Fila processada: ${json.data.reminders.triggered} lembrete(s) disparado(s), ${json.data.queue.sent} enviada(s), ${json.data.queue.failed} falha(s).`,
      });
      await loadAll();
    }
  };

  const handleRetryMessage = async (messageId: string) => {
    setFeedback(null);
    const res = await apiFetch(`/api/v1/whatsapp/messages/${messageId}/retry`, {
      method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: json.data?.status === 'FAILED' ? 'error' : 'success',
        text:
          json.data?.status === 'SENT'
            ? 'Mensagem reenviada e aceita pela Meta!'
            : `Tentativa concluída com status: ${json.data?.status} (${json.data?.errorMessage || ''})`,
      });
      await loadAll();
    }
  };

  const renderConnectionBanner = () => {
    if (!config) return null;
    const statusMap = {
      CONNECTED: {
        bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        badge: 'bg-emerald-600 text-white',
        label: 'Conectado à Meta Cloud API',
        desc: 'As credenciais oficiais foram validadas e o estabelecimento está apto a enviar mensagens.',
      },
      PENDING_CREDENTIALS: {
        bg: 'bg-amber-50 border-amber-200 text-amber-900',
        badge: 'bg-amber-600 text-white',
        label: 'Credenciais Pendentes de Validação',
        desc: 'Configure o Phone Number ID e o Access Token da Meta WhatsApp Cloud API. O sistema não simula envios sem credenciais válidas.',
      },
      ERROR: {
        bg: 'bg-rose-50 border-rose-200 text-rose-900',
        badge: 'bg-rose-600 text-white',
        label: 'Erro de Conexão / Credenciais Inválidas',
        desc:
          config.lastError ||
          'A última verificação com a Graph API da Meta retornou erro. Revise as credenciais.',
      },
      DISCONNECTED: {
        bg: 'bg-stone-100 border-stone-300 text-stone-800',
        badge: 'bg-stone-600 text-white',
        label: 'Desconectado',
        desc: 'A integração com o WhatsApp Business está desativada para este estabelecimento.',
      },
    };
    const st = statusMap[config.status] || statusMap.PENDING_CREDENTIALS;

    return (
      <div className={`p-5 rounded-2xl border ${st.bg} flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${st.badge}`}>
              {st.label}
            </span>
            <span className="text-xs font-medium opacity-80">
              Provedor Oficial: Meta WhatsApp Cloud API
            </span>
            {config.businessPhone && (
              <span className="text-xs font-semibold">• Número: {config.businessPhone}</span>
            )}
          </div>
          <p className="text-sm">{st.desc}</p>
        </div>
        {canManage && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
            <button
              onClick={handleTestConnection}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Validar Conexão na Meta</span>
            </button>
            <button
              onClick={handleRunWorker}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Processar Fila e Lembretes</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderConnectionBanner()}

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold underline ml-4"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeSubTab === 'overview'
              ? 'bg-rose-500 text-white shadow-xs'
              : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Fila de Mensagens & Lembretes</span>
        </button>

        <button
          onClick={() => setActiveSubTab('manual')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeSubTab === 'manual'
              ? 'bg-rose-500 text-white shadow-xs'
              : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Envio Operacional Manual</span>
        </button>

        <button
          onClick={() => setActiveSubTab('consent')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeSubTab === 'consent'
              ? 'bg-rose-500 text-white shadow-xs'
              : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Consentimento & Telefones (E.164)</span>
        </button>

        {canManage && (
          <>
            <button
              onClick={() => setActiveSubTab('templates')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeSubTab === 'templates'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Templates Aprovados ({visibleTemplates.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('config')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeSubTab === 'config'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Credenciais & Regras de Lembrete</span>
            </button>
          </>
        )}
      </div>

      {/* TAB 1: MESSAGE QUEUE & SCHEDULED REMINDERS */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Na Fila (Pendentes)</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {messages.filter((m) => m.status === 'PENDING' || m.status === 'PROCESSING').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Aceitas pela Meta (SENT)</p>
              <p className="text-2xl font-bold text-sky-600 mt-1">
                {messages.filter((m) => m.status === 'SENT').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Entregues (DELIVERED)</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {messages.filter((m) => m.status === 'DELIVERED').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Lidas (READ)</p>
              <p className="text-2xl font-bold text-teal-700 mt-1">
                {messages.filter((m) => m.status === 'READ').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Falhas Registradas</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">
                {messages.filter((m) => m.status === 'FAILED').length}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-stone-200 text-xs bg-stone-50"
              >
                <option value="">Todos os status</option>
                <option value="PENDING">PENDING (Na fila)</option>
                <option value="SENT">SENT (Aceita pela Meta)</option>
                <option value="DELIVERED">DELIVERED (Entregue via Webhook)</option>
                <option value="READ">READ (Lida via Webhook)</option>
                <option value="FAILED">FAILED (Falha)</option>
                <option value="CANCELLED">CANCELLED (Cancelada)</option>
              </select>

              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-stone-200 text-xs bg-stone-50"
              >
                <option value="">Todos os tipos de evento</option>
                {Object.entries(EVENT_LABELS)
                  .filter(([k]) => requireDeposit || (k !== 'PAYMENT_UPDATED' && k !== 'REFUND_UPDATED'))
                  .map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={loadAll}
              className="px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-xs font-medium flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Atualizar Lista</span>
            </button>
          </div>

          {/* Messages Table */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <h3 className="font-bold text-sm text-stone-900">
                Histórico Auditável de Mensagens WhatsApp ({messages.length})
              </h3>
              <span className="text-xs text-stone-500">
                Diferenciação estrita entre envio aceito (SENT), entregue (DELIVERED) e lido (READ)
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="p-8 text-center text-sm text-stone-500">
                Nenhuma mensagem registrada para os filtros selecionados.
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-stone-100">
                  {messages.map((m) => {
                    const badge = STATUS_BADGE[m.status] || {
                      label: m.status,
                      className: 'bg-stone-100 text-stone-700',
                      description: '',
                    };
                    return (
                      <div key={m.id} className="p-4 space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-stone-900 text-sm">{m.clientName}</div>
                            <div className="text-stone-500 font-mono">{m.recipientPhone}</div>
                          </div>
                          <span
                            title={badge.description}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-stone-50 border border-stone-100 space-y-1">
                          <div className="font-semibold text-stone-800">
                            {EVENT_LABELS[m.eventType] || m.eventType}
                          </div>
                          <div className="text-stone-500 font-mono text-[11px]">
                            {m.templateName || 'Texto livre (Janela 24h)'} • {new Date(m.createdAt).toLocaleString('pt-BR')}
                          </div>
                          <p className="text-stone-700 pt-1 border-t border-stone-200/70">{m.renderedBody}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-stone-600">
                            Tentativas: {m.attempts}/{m.maxAttempts}
                            {m.errorMessage && (
                              <span className="text-rose-600 font-medium block">
                                {m.errorCode ? `[${m.errorCode}] ` : ''}
                                {m.errorMessage}
                              </span>
                            )}
                          </div>
                          {m.status === 'FAILED' && (
                            <button
                              onClick={() => handleRetryMessage(m.id)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shrink-0"
                            >
                              Reenviar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 text-stone-600 border-b border-stone-200">
                      <th className="py-3 px-4">Data/Hora</th>
                      <th className="py-3 px-4">Cliente & Destino</th>
                      <th className="py-3 px-4">Evento / Template</th>
                      <th className="py-3 px-4">Conteúdo Renderizado</th>
                      <th className="py-3 px-4">Status Real</th>
                      <th className="py-3 px-4">Tentativas / Diagnóstico</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {messages.map((m) => {
                      const badge = STATUS_BADGE[m.status] || {
                        label: m.status,
                        className: 'bg-stone-100 text-stone-700',
                        description: '',
                      };
                      return (
                        <tr key={m.id} className="hover:bg-stone-50/70">
                          <td className="py-3 px-4 whitespace-nowrap text-stone-600">
                            {new Date(m.createdAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-stone-900">{m.clientName}</div>
                            <div className="text-stone-500 font-mono">{m.recipientPhone}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-stone-800">
                              {EVENT_LABELS[m.eventType] || m.eventType}
                            </div>
                            <div className="text-stone-500 font-mono text-[11px]">
                              {m.templateName || 'Texto livre (Janela 24h)'}
                            </div>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <p className="text-stone-700 line-clamp-2">{m.renderedBody}</p>
                            {m.providerMessageId && (
                              <span className="inline-block mt-1 text-[10px] font-mono text-stone-400">
                                wamid: {m.providerMessageId}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              title={badge.description}
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-stone-700">
                              Tentativas: {m.attempts}/{m.maxAttempts}
                            </div>
                            {m.errorMessage && (
                              <div className="text-rose-600 font-medium mt-0.5 max-w-xs">
                                {m.errorCode ? `[${m.errorCode}] ` : ''}
                                {m.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {m.status === 'FAILED' && (
                              <button
                                onClick={() => handleRetryMessage(m.id)}
                                className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-semibold"
                              >
                                Reenviar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          {/* Scheduled Reminders */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-500 shrink-0" />
                <h3 className="font-bold text-sm text-stone-900">
                  Lembretes Automáticos Programados ({reminders.length})
                </h3>
              </div>
              <span className="text-xs text-stone-500">
                Respeita o fuso horário e a janela permitida ({config?.allowedWindowStart} às{' '}
                {config?.allowedWindowEnd})
              </span>
            </div>

            {reminders.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                Nenhum lembrete agendado no momento. Novos agendamentos confirmados geram lembretes automaticamente.
              </div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-stone-100">
                  {reminders.map((r) => (
                    <div key={r.id} className="p-4 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-stone-900 text-sm">{r.clientName}</div>
                          <div className="text-stone-500">{r.serviceName}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 font-semibold shrink-0">
                          {r.status}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-stone-500">Lembrete:</span>
                          <span className="font-medium text-stone-800">
                            {r.reminderType === 'REMINDER_24H'
                              ? '24 horas antes'
                              : r.reminderType === 'REMINDER_3H'
                              ? '3 horas antes'
                              : `${r.leadTimeHours}h antes`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">Disparo para:</span>
                          <strong className="text-stone-900">{new Date(r.scheduledFor).toLocaleString('pt-BR')}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-50 text-stone-600 border-b border-stone-200">
                        <th className="py-3 px-4">Cliente / Serviço</th>
                        <th className="py-3 px-4">Tipo de Lembrete</th>
                        <th className="py-3 px-4">Horário do Atendimento</th>
                        <th className="py-3 px-4">Disparo Programado Para</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {reminders.map((r) => (
                        <tr key={r.id}>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-stone-900">{r.clientName}</div>
                            <div className="text-stone-500">{r.serviceName}</div>
                          </td>
                          <td className="py-3 px-4 font-medium">
                            {r.reminderType === 'REMINDER_24H'
                              ? '24 horas antes'
                              : r.reminderType === 'REMINDER_3H'
                              ? '3 horas antes'
                              : `${r.leadTimeHours}h antes (Personalizado)`}
                          </td>
                          <td className="py-3 px-4">
                            {r.appointmentDateTime
                              ? new Date(r.appointmentDateTime).toLocaleString('pt-BR')
                              : '-'}
                          </td>
                          <td className="py-3 px-4 font-semibold text-stone-800">
                            {new Date(r.scheduledFor).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 font-semibold">
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-stone-500">{r.skipReason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL OPERATIONAL SEND */}
      {activeSubTab === 'manual' && (
        <div className="bg-white p-6 rounded-2xl border border-stone-200 max-w-2xl space-y-5">
          <div>
            <h3 className="font-bold text-base text-stone-900">
              Envio Manual de Mensagem Operacional
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Envie avisos operacionais (ex.: orientação de preparo, confirmação de endereço ou ajuste de horário) para clientes do estabelecimento. Protegido contra envios repetitivos.
            </p>
          </div>

          <form onSubmit={handleSendManual} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Selecione a Cliente
              </label>
              <select
                value={manualClientId}
                onChange={(e) => setManualClientId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm"
              >
                {clientsConsent.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.normalizedPhone || c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Comunicado Operacional
              </label>
              <textarea
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                required
                rows={3}
                placeholder="Ex.: Olá! Lembramos que nosso estacionamento conveniado fica no nº 1020."
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-stone-700">
              <input
                type="checkbox"
                checked={manualUseFreeText}
                onChange={(e) => setManualUseFreeText(e.target.checked)}
                className="rounded border-stone-300 text-rose-500"
              />
              <span>
                Enviar como texto livre sem template (permitido pela Meta somente se a cliente enviou mensagem nas últimas 24h)
              </span>
            </label>

            <button
              type="submit"
              disabled={sendingManual}
              className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{sendingManual ? 'Enviando...' : 'Disparar Mensagem Operacional'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: CLIENT CONSENT & E.164 PHONE MANAGEMENT */}
      {activeSubTab === 'consent' && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-200">
            <h3 className="font-bold text-sm text-stone-900">
              Consentimento de Comunicação e Padronização E.164
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              O fornecimento do telefone permite avisos operacionais do agendamento, mas NUNCA concede consentimento promocional automático.
            </p>
          </div>

          {/* Mobile Card View for Consent */}
          <div className="md:hidden divide-y divide-stone-100">
            {clientsConsent.map((c) => (
              <div key={c.id} className="p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-stone-900 text-sm">{c.name}</div>
                    <div className="text-stone-500 font-mono">{c.normalizedPhone || c.phone}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                      c.whatsappOptIn
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {c.whatsappOptIn ? 'Operacional Ativo' : 'Opt-out'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100">
                  <span className="text-stone-500">Promocional:</span>
                  {c.promotionalConsent ? (
                    <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-semibold">
                      Autorizado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px] font-semibold">
                      Bloqueado
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() =>
                      handleUpdateClientConsent(c.id, {
                        whatsappOptIn: !c.whatsappOptIn,
                      })
                    }
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-xs font-medium"
                  >
                    {c.whatsappOptIn ? 'Pausar Operacional' : 'Ativar Operacional'}
                  </button>
                  {c.promotionalConsent ? (
                    <button
                      onClick={() =>
                        handleUpdateClientConsent(c.id, {
                          revokePromotionalConsent: true,
                        })
                      }
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold"
                    >
                      Revogar Promocional
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        handleUpdateClientConsent(c.id, {
                          promotionalConsent: true,
                          promotionalConsentSource: 'PAINEL_ADMIN',
                        })
                      }
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold"
                    >
                      Opt-in Promocional
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View for Consent */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 text-stone-600 border-b border-stone-200">
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Telefone Original</th>
                  <th className="py-3 px-4">Padronizado (E.164)</th>
                  <th className="py-3 px-4">Avisos Operacionais</th>
                  <th className="py-3 px-4">Consentimento Promocional</th>
                  <th className="py-3 px-4 text-right">Ações de Consentimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {clientsConsent.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 px-4 font-semibold text-stone-900">{c.name}</td>
                    <td className="py-3 px-4 text-stone-600">{c.phone}</td>
                    <td className="py-3 px-4 font-mono text-stone-800">
                      {c.normalizedPhone || 'Não normalizado'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          c.whatsappOptIn
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-stone-200 text-stone-700'
                        }`}
                      >
                        {c.whatsappOptIn ? 'Ativo (Opt-in)' : 'Desativado (Opt-out)'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {c.promotionalConsent ? (
                        <div>
                          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-semibold">
                            Autorizado
                          </span>
                          {c.promotionalConsentAt && (
                            <div className="text-[10px] text-stone-500 mt-0.5">
                              Em {new Date(c.promotionalConsentAt).toLocaleDateString('pt-BR')} (
                              {c.promotionalConsentSource})
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px] font-semibold">
                            Não autorizado (Bloqueado)
                          </span>
                          {c.promotionalConsentRevokedAt && (
                            <div className="text-[10px] text-rose-600 mt-0.5">
                              Revogado em{' '}
                              {new Date(c.promotionalConsentRevokedAt).toLocaleDateString('pt-BR')}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() =>
                          handleUpdateClientConsent(c.id, {
                            whatsappOptIn: !c.whatsappOptIn,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg border border-stone-300 hover:bg-stone-50 text-[11px] font-medium"
                      >
                        {c.whatsappOptIn ? 'Pausar Operacional' : 'Ativar Operacional'}
                      </button>
                      {c.promotionalConsent ? (
                        <button
                          onClick={() =>
                            handleUpdateClientConsent(c.id, {
                              revokePromotionalConsent: true,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold"
                        >
                          Revogar Promocional
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handleUpdateClientConsent(c.id, {
                              promotionalConsent: true,
                              promotionalConsentSource: 'PAINEL_ADMIN',
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold"
                        >
                          Registrar Opt-in Promocional
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TEMPLATES */}
      {activeSubTab === 'templates' && canManage && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-200">
            <h3 className="font-bold text-sm text-stone-900">
              Templates Aprovados na Meta por Tipo de Evento
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Apenas templates com status APPROVED são utilizados para disparo fora da janela de 24h.
            </p>
          </div>

          <div className="divide-y divide-stone-200">
            {visibleTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-stone-900">
                      {EVENT_LABELS[tpl.eventType] || tpl.eventType}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-stone-100 font-mono text-xs text-stone-700">
                      {tpl.templateName} ({tpl.language})
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        tpl.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {tpl.status}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                    {tpl.bodyPreview}
                  </p>
                  <div className="text-[11px] text-stone-500">
                    Variáveis:{' '}
                    {(tpl.variablesSchema || []).map((v, i) => `{{${i + 1}}} = ${v}`).join(' | ')}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={tpl.status}
                    onChange={(e) =>
                      handleTemplateStatusChange(tpl.eventType, e.target.value, tpl.templateName)
                    }
                    className="px-3 py-1.5 rounded-xl border border-stone-300 text-xs font-semibold"
                  >
                    <option value="APPROVED">APPROVED (Aprovado)</option>
                    <option value="PENDING">PENDING (Em análise)</option>
                    <option value="PAUSED">PAUSED (Pausado)</option>
                    <option value="REJECTED">REJECTED (Rejeitado)</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: CONFIGURATION & REMINDER RULES */}
      {activeSubTab === 'config' && canManage && config && (
        <form
          onSubmit={handleSaveConfig}
          className="bg-white p-6 rounded-2xl border border-stone-200 space-y-6 max-w-4xl"
        >
          <div>
            <h3 className="font-bold text-base text-stone-900">
              Configuração da Conta Meta WhatsApp Business Cloud API
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Os tokens e segredos são criptografados no servidor (AES-256-GCM) e jamais são expostos ao navegador.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Nome de Exibição do Estabelecimento
              </label>
              <input
                type="text"
                value={formState.displayName}
                onChange={(e) => setFormState({ ...formState, displayName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Número Conectado (Exibição)
              </label>
              <input
                type="text"
                value={formState.businessPhone}
                onChange={(e) => setFormState({ ...formState, businessPhone: e.target.value })}
                placeholder="+55 11 98765-4321"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Meta Phone Number ID
              </label>
              <input
                type="text"
                value={formState.phoneNumberId}
                onChange={(e) => setFormState({ ...formState, phoneNumberId: e.target.value })}
                placeholder="Ex.: 109283746512345"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                WhatsApp Business Account ID (WABA ID)
              </label>
              <input
                type="text"
                value={formState.wabaId}
                onChange={(e) => setFormState({ ...formState, wabaId: e.target.value })}
                placeholder="Ex.: 987654321098765"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm font-mono"
              />
            </div>
          </div>

          {/* Secure Credentials */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
              <Lock className="w-4 h-4 text-rose-500" />
              <span>Credenciais Secretas (Apenas Escrita — Nunca Retornadas pela API)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Access Token Permanente{' '}
                  {config.hasAccessTokenConfigured && (
                    <span className="text-emerald-600">(Já configurado)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={formState.accessToken}
                  onChange={(e) => setFormState({ ...formState, accessToken: e.target.value })}
                  placeholder={
                    config.hasAccessTokenConfigured
                      ? '•••••••• (Preencha para substituir)'
                      : 'EAAG...'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Webhook Verify Token{' '}
                  {config.hasWebhookVerifyTokenConfigured && (
                    <span className="text-emerald-600">(Configurado)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={formState.webhookVerifyToken}
                  onChange={(e) =>
                    setFormState({ ...formState, webhookVerifyToken: e.target.value })
                  }
                  placeholder={
                    config.hasWebhookVerifyTokenConfigured
                      ? '•••••••• (Preencha para substituir)'
                      : 'Token de verificação'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Meta App Secret (HMAC-SHA256){' '}
                  {config.hasAppSecretConfigured && (
                    <span className="text-emerald-600">(Configurado)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={formState.appSecret}
                  onChange={(e) => setFormState({ ...formState, appSecret: e.target.value })}
                  placeholder={
                    config.hasAppSecretConfigured
                      ? '•••••••• (Preencha para substituir)'
                      : 'App Secret para X-Hub-Signature-256'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
            </div>

            <div className="text-[11px] text-stone-500 break-all">
              URL de Callback do Webhook Oficial:{' '}
              <code className="px-1.5 py-0.5 rounded bg-stone-200 text-stone-800 break-all">
                {webhookUrl}
              </code>
            </div>
          </div>

          {/* Reminder Rules & Time Window */}
          <div className="space-y-3 pt-2 border-t border-stone-200">
            <h4 className="font-bold text-sm text-stone-900">
              Antecedência de Lembretes e Janela de Horário Permitida
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-stone-800">
                <input
                  type="checkbox"
                  checked={formState.reminder24hEnabled}
                  onChange={(e) =>
                    setFormState({ ...formState, reminder24hEnabled: e.target.checked })
                  }
                />
                <span>Lembrete 24 horas antes</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-stone-800">
                <input
                  type="checkbox"
                  checked={formState.reminder3hEnabled}
                  onChange={(e) =>
                    setFormState({ ...formState, reminder3hEnabled: e.target.checked })
                  }
                />
                <span>Lembrete 3 horas antes</span>
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formState.customReminderEnabled}
                  onChange={(e) =>
                    setFormState({ ...formState, customReminderEnabled: e.target.checked })
                  }
                />
                <span className="text-xs font-medium text-stone-800">Personalizado (horas):</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={formState.customReminderHours}
                  onChange={(e) =>
                    setFormState({ ...formState, customReminderHours: Number(e.target.value) })
                  }
                  className="w-20 px-2 py-1 rounded-lg border border-stone-300 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Início da Janela Permitida de Lembretes
                </label>
                <input
                  type="time"
                  value={formState.allowedWindowStart}
                  onChange={(e) =>
                    setFormState({ ...formState, allowedWindowStart: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Fim da Janela Permitida de Lembretes
                </label>
                <input
                  type="time"
                  value={formState.allowedWindowEnd}
                  onChange={(e) => setFormState({ ...formState, allowedWindowEnd: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
            >
              Salvar Configuração do WhatsApp
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
