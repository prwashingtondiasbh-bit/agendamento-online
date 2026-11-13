import React, { useState, useEffect, useCallback } from 'react';
import { Business } from '../types';
import { Settings, ShieldAlert, Clock, Check, AlertCircle, Eye, EyeOff, RotateCcw, Users, Plus, Trash2, Link2, Copy, ExternalLink, Crown, Lock, Save, Loader2, FileText, MessageSquare, Sparkles, CreditCard, CheckCircle2, XCircle, Key, Globe, HelpCircle } from 'lucide-react';
import { apiFetch } from '../App';

export const DEFAULT_CANCELLATION_POLICY_TEXT =
  'Cancelamentos ou reagendamentos solicitados com no mínimo o prazo de antecedência configurado pelo estabelecimento garantem a remarcação sem custos ou a solicitação de estorno integral do valor pago a título de sinal via Pix, processado em até 1 dia útil. Solicitações efetuadas após o prazo limite de antecedência acarretam a retenção do valor do sinal para cobertura da reserva exclusiva de horário e custos operacionais da profissional. Casos fortuitos ou de força maior devidamente justificados poderão ser submetidos à análise individual da administração do salão, respeitadas as normas do Código de Defesa do Consumidor.';

export const DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS =
  'Em caso de imprevistos de última hora, necessidade de reagendamento emergencial ou dúvidas sobre o estorno do sinal, entre em contato diretamente pelo WhatsApp ou telefone oficial do estabelecimento informando seu nome completo e o código do agendamento para atendimento prioritário.';

export const CANCELLATION_POLICY_PRESETS = [
  {
    id: 'recommended',
    label: 'Padrão Recomendado (CDC + Pix)',
    description: 'Equilíbrio ideal entre segurança da profissional e direitos da cliente.',
    text: DEFAULT_CANCELLATION_POLICY_TEXT,
  },
  {
    id: 'flexible',
    label: 'Modelo Flexível (Remarcação Amigável)',
    description: 'Prioriza a remarcação da cliente e converte cancelamentos em créditos para a próxima visita.',
    text: 'Cancelamentos ou reagendamentos realizados até o horário limite garantem o reembolso integral do sinal via Pix ou a conversão em crédito para a próxima visita. Solicitações após o prazo serão avaliadas individualmente pela nossa equipe com atenção para buscar a melhor alternativa.',
  },
  {
    id: 'strict',
    label: 'Modelo Rigoroso (Reserva Exclusiva)',
    description: 'Garante retenção estrita fora do prazo para cobrir o custo de hora parada da profissional.',
    text: 'O valor do sinal é destinado à reserva exclusiva do horário da profissional e preparo dos produtos. Cancelamentos antes da antecedência limite geram estorno integral. Cancelamentos fora do prazo implicam na retenção integral do sinal pago para cobertura da agenda bloqueada.',
  },
];

export const CANCELLATION_CONTACT_PRESETS = [
  {
    id: 'whatsapp_code',
    label: 'WhatsApp Oficial + Código da Reserva',
    text: DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
  },
  {
    id: 'reception',
    label: 'Recepção Comercial Direta',
    text: 'Para dúvidas urgentes ou necessidade de remarcação emergencial, envie uma mensagem para a nossa recepção no WhatsApp oficial informando seu nome e o serviço agendado.',
  },
];

interface SettingsViewProps {
  business: Business;
  onUpdateBusiness: (updated: Partial<Business>) => Promise<{ success?: boolean; error?: string; data?: any } | void> | void;
  onOpenPublicPage?: (slug: string) => void;
}

const PRESET_HOURS = [3, 6, 12, 24, 48];

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietária (Acesso Total)',
  MANAGER: 'Gerente (Operação + Financeiro)',
  RECEPTIONIST: 'Recepcionista (Agenda + CRM)',
  PROFESSIONAL: 'Profissional (Agenda + Suas Comissões)',
};

export const SettingsView: React.FC<SettingsViewProps> = ({ business, onUpdateBusiness, onOpenPublicPage }) => {
  const initialHours = business.cancellationHoursLimit ?? 6;
  const isInitialCustom = !PRESET_HOURS.includes(initialHours);
  const planAllowsDeposit =
    business.planCapabilities?.allowDeposit !== undefined
      ? Boolean(business.planCapabilities.allowDeposit)
      : business.subscription?.plan
      ? business.subscription.plan !== 'SIMPLE'
      : true;

  const [formData, setFormData] = useState({
    name: business.name || '',
    slug: business.slug || '',
    description: business.description || '',
    logoUrl: business.logoUrl || '',
    isPublished: business.isPublished ?? true,
    phone: business.phone || '',
    email: business.email || '',
    address: business.address || '',
    timezone: business.timezone || 'America/Sao_Paulo',
    currency: business.currency || 'BRL',
    openTime: business.openTime || '08:00',
    closeTime: business.closeTime || '20:00',
    requireDeposit: planAllowsDeposit ? (business.requireDeposit !== false) : false,
    defaultDeposit: business.defaultDeposit && business.defaultDeposit > 0 ? business.defaultDeposit : 30,
    cancellationHoursLimit: initialHours,
    allowCustomerReschedule: business.allowCustomerReschedule ?? true,
    allowManualReviewOutOfPeriod: business.allowManualReviewOutOfPeriod ?? true,
    cancellationPolicyText:
      (business.cancellationPolicyText && business.cancellationPolicyText.trim()) ||
      DEFAULT_CANCELLATION_POLICY_TEXT,
    cancellationContactInstructions:
      (business.cancellationContactInstructions && business.cancellationContactInstructions.trim()) ||
      DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
    mpPublicKey: business.mpPublicKey || '',
    mpAccessToken: business.mpAccessToken || '',
    mpWebhookSecret: business.mpWebhookSecret || '',
    mpEnvironment: (business.mpEnvironment as 'sandbox' | 'production') || 'sandbox',
  });

  const [isCustomHours, setCompleteCustomHours] = useState(isInitialCustom);
  const [customHoursValue, setCustomHoursValue] = useState(String(initialHours));
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDepositSection, setIsSavingDepositSection] = useState(false);
  const [isSavingMpSection, setIsSavingMpSection] = useState(false);
  const [isSavingCancelSection, setIsSavingCancelSection] = useState(false);
  const [showMpToken, setShowMpToken] = useState(false);
  const [showMpSecret, setShowMpSecret] = useState(false);
  const [isTestingMp, setIsTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{ ok: boolean; message: string; user?: any } | null>(null);

  // Team Members Management State
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showNewMemberModal, setShowNewMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'RECEPTIONIST',
    specialty: 'Nail Designer',
    phone: '',
  });

  // Change password state for lojista
  const [lojistaCurrentPassword, setLojistaCurrentPassword] = useState('');
  const [lojistaNewPassword, setLojistaNewPassword] = useState('');
  const [lojistaConfirmPassword, setLojistaConfirmPassword] = useState('');
  const [lojistaPasswordFeedback, setLojistaPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lojistaChangingPassword, setLojistaChangingPassword] = useState(false);

  const handleLojistaChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLojistaPasswordFeedback(null);
    if (!lojistaCurrentPassword || !lojistaNewPassword || !lojistaConfirmPassword) {
      setLojistaPasswordFeedback({ type: 'error', message: 'Preencha todos os campos de senha.' });
      return;
    }
    if (lojistaNewPassword !== lojistaConfirmPassword) {
      setLojistaPasswordFeedback({ type: 'error', message: 'A nova senha e a confirmação não conferem.' });
      return;
    }
    if (lojistaNewPassword.length < 6) {
      setLojistaPasswordFeedback({ type: 'error', message: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setLojistaChangingPassword(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-session-token'] = token;
      }
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ currentPassword: lojistaCurrentPassword, newPassword: lojistaNewPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao alterar senha.');
      }
      setLojistaPasswordFeedback({ type: 'success', message: 'Senha alterada com sucesso!' });
      setLojistaCurrentPassword('');
      setLojistaNewPassword('');
      setLojistaConfirmPassword('');
    } catch (err: any) {
      setLojistaPasswordFeedback({ type: 'error', message: err.message || 'Erro ao alterar senha.' });
    } finally {
      setLojistaChangingPassword(false);
    }
  };

  const fetchTeamMembers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/business/team-members');
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setTeamMembers(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  useEffect(() => {
    const hrs = business.cancellationHoursLimit ?? 6;
    const allowsDep =
      business.planCapabilities?.allowDeposit !== undefined
        ? Boolean(business.planCapabilities.allowDeposit)
        : business.subscription?.plan
        ? business.subscription.plan !== 'SIMPLE'
        : true;

    setFormData({
      name: business.name || '',
      slug: business.slug || '',
      description: business.description || '',
      logoUrl: business.logoUrl || '',
      isPublished: business.isPublished ?? true,
      phone: business.phone || '',
      email: business.email || '',
      address: business.address || '',
      timezone: business.timezone || 'America/Sao_Paulo',
      currency: business.currency || 'BRL',
      openTime: business.openTime || '08:00',
      closeTime: business.closeTime || '20:00',
      requireDeposit: allowsDep ? (business.requireDeposit !== false) : false,
      defaultDeposit: business.defaultDeposit && business.defaultDeposit > 0 ? business.defaultDeposit : 30,
      cancellationHoursLimit: hrs,
      allowCustomerReschedule: business.allowCustomerReschedule ?? true,
      allowManualReviewOutOfPeriod: business.allowManualReviewOutOfPeriod ?? true,
      cancellationPolicyText:
        (business.cancellationPolicyText && business.cancellationPolicyText.trim()) ||
        DEFAULT_CANCELLATION_POLICY_TEXT,
      cancellationContactInstructions:
        (business.cancellationContactInstructions && business.cancellationContactInstructions.trim()) ||
        DEFAULT_CANCELLATION_CONTACT_INSTRUCTIONS,
      mpPublicKey: business.mpPublicKey || '',
      mpAccessToken: business.mpAccessToken || '',
      mpWebhookSecret: business.mpWebhookSecret || '',
      mpEnvironment: (business.mpEnvironment as 'sandbox' | 'production') || 'sandbox',
    });
    setCompleteCustomHours(!PRESET_HOURS.includes(hrs));
    setCustomHoursValue(String(hrs));
  }, [business]);

  const handleSelectPreset = (hours: number) => {
    setCompleteCustomHours(false);
    setCustomHoursValue(String(hours));
    setFormData((prev) => ({ ...prev, cancellationHoursLimit: hours }));
  };

  const handleCustomHoursChange = (val: string) => {
    setCustomHoursValue(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      setFormData((prev) => ({ ...prev, cancellationHoursLimit: parsed }));
    }
  };

  const handleCopyPublicLink = () => {
    const slugVal = (formData.slug || business.slug || 'agenda-beauty').trim();
    const url = `${window.location.origin}/agendar/${slugVal}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSaveDepositPolicyOnly = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsSavingDepositSection(true);

    const effectiveRequireDeposit = planAllowsDeposit ? Boolean(formData.requireDeposit) : false;

    let depositVal = Number(formData.defaultDeposit);
    if (!depositVal || depositVal < 1) {
      depositVal = 30;
    }
    depositVal = Math.round(Math.max(1, Math.min(100, depositVal)));

    const hours = isCustomHours ? parseInt(customHoursValue, 10) : formData.cancellationHoursLimit;
    const finalHours = Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : 6;

    try {
      const payload: Partial<Business> = {
        requireDeposit: effectiveRequireDeposit,
        defaultDeposit: effectiveRequireDeposit ? depositVal : (depositVal >= 0 ? depositVal : 0),
        cancellationHoursLimit: finalHours,
      };

      const result = await onUpdateBusiness(payload);
      if (result && (result as any).success === false) {
        setErrorMsg((result as any).error || 'Erro ao salvar política de sinal.');
        return;
      }
      setSuccessMsg(
        effectiveRequireDeposit
          ? `Política de sinal ativada com sucesso (${depositVal}% via Pix)! Novos agendamentos online exigirão o pagamento antecipado.`
          : 'Política de sinal salva com sucesso! Agendamentos online confirmados imediatamente sem sinal.'
      );
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar política de sinal.');
    } finally {
      setIsSavingDepositSection(false);
    }
  };

  const handleSaveCancellationPolicyOnly = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsSavingCancelSection(true);

    const hours = isCustomHours ? parseInt(customHoursValue, 10) : formData.cancellationHoursLimit;
    const finalHours = Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : 6;

    try {
      const payload: Partial<Business> = {
        cancellationHoursLimit: finalHours,
        allowCustomerReschedule: Boolean(formData.allowCustomerReschedule),
        allowManualReviewOutOfPeriod: Boolean(formData.allowManualReviewOutOfPeriod),
        cancellationPolicyText: formData.cancellationPolicyText || '',
        cancellationContactInstructions: formData.cancellationContactInstructions || '',
      };

      const result = await onUpdateBusiness(payload);
      if (result && (result as any).success === false) {
        setErrorMsg((result as any).error || 'Erro ao salvar política de cancelamento.');
        return;
      }
      setSuccessMsg('Política de cancelamento e reembolso salva com sucesso!');
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar política de cancelamento.');
    } finally {
      setIsSavingCancelSection(false);
    }
  };

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/webhooks/mercadopago`;

  const handleCopyWebhook = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 3000);
    }
  };

  const handleTestMercadoPago = async () => {
    setIsTestingMp(true);
    setMpTestResult(null);
    try {
      const res = await apiFetch('/api/v1/business/test-mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: formData.mpAccessToken,
          publicKey: formData.mpPublicKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.data) {
        setMpTestResult({
          ok: true,
          message: `Conectado com sucesso! Conta: ${data.data.nickname} (ID: ${data.data.id})`,
          user: data.data,
        });
      } else {
        setMpTestResult({
          ok: false,
          message: data.error || 'Credenciais inválidas ou rejeitadas pelo Mercado Pago.',
        });
      }
    } catch (e: any) {
      setMpTestResult({
        ok: false,
        message: `Falha na requisição: ${e.message || e}`,
      });
    } finally {
      setIsTestingMp(false);
    }
  };

  const handleSaveMercadoPagoOnly = async () => {
    setIsSavingMpSection(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await onUpdateBusiness({
        mpPublicKey: formData.mpPublicKey ? formData.mpPublicKey.trim() : null,
        mpAccessToken: formData.mpAccessToken ? formData.mpAccessToken.trim() : null,
        mpWebhookSecret: formData.mpWebhookSecret ? formData.mpWebhookSecret.trim() : null,
        mpEnvironment: formData.mpEnvironment,
      });
      if (res && (res as any).success === false) {
        setErrorMsg((res as any).error || 'Erro ao salvar integração do Mercado Pago.');
      } else {
        setSuccessMsg('Configurações de integração do Mercado Pago salvas com sucesso!');
        setTimeout(() => setSuccessMsg(''), 4500);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao salvar integração do Mercado Pago.');
    } finally {
      setIsSavingMpSection(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSaving(true);

    const effectiveRequireDeposit = planAllowsDeposit ? Boolean(formData.requireDeposit) : false;

    const hours = isCustomHours ? parseInt(customHoursValue, 10) : formData.cancellationHoursLimit;
    const finalHours = Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : 6;
    if (effectiveRequireDeposit && (isNaN(hours) || hours < 1 || hours > 720)) {
      setErrorMsg('O prazo limite de cancelamento deve ser um número inteiro positivo entre 1 e 720 horas (30 dias).');
      setIsSaving(false);
      return;
    }

    let depositVal = Number(formData.defaultDeposit);
    if (!depositVal || depositVal < 1) {
      depositVal = 30;
    }
    depositVal = Math.round(Math.max(1, Math.min(100, depositVal)));

    try {
      const payload: Partial<Business> = {
        name: (formData.name || business.name || 'Estabelecimento').trim(),
        slug: (formData.slug || business.slug || '').trim(),
        description: formData.description || '',
        logoUrl: formData.logoUrl || '',
        isPublished: Boolean(formData.isPublished),
        phone: formData.phone || '',
        email: formData.email || '',
        address: formData.address || '',
        timezone: formData.timezone || 'America/Sao_Paulo',
        currency: formData.currency || 'BRL',
        openTime: formData.openTime || '08:00',
        closeTime: formData.closeTime || '20:00',
        requireDeposit: effectiveRequireDeposit,
        defaultDeposit: effectiveRequireDeposit ? depositVal : (depositVal >= 0 ? depositVal : 0),
        cancellationHoursLimit: finalHours,
        allowCustomerReschedule: Boolean(formData.allowCustomerReschedule),
        allowManualReviewOutOfPeriod: Boolean(formData.allowManualReviewOutOfPeriod),
        cancellationPolicyText: formData.cancellationPolicyText || '',
        cancellationContactInstructions: formData.cancellationContactInstructions || '',
        mpPublicKey: formData.mpPublicKey ? formData.mpPublicKey.trim() : null,
        mpAccessToken: formData.mpAccessToken ? formData.mpAccessToken.trim() : null,
        mpWebhookSecret: formData.mpWebhookSecret ? formData.mpWebhookSecret.trim() : null,
        mpEnvironment: formData.mpEnvironment || 'sandbox',
      };

      const result = await onUpdateBusiness(payload);
      if (result && (result as any).success === false) {
        setErrorMsg((result as any).error || 'Erro ao salvar configurações.');
        return;
      }
      setSuccessMsg(
        effectiveRequireDeposit
          ? 'Configurações, link público, política de sinal e política de cancelamento salvas com sucesso!'
          : 'Configurações e link público salvos com sucesso (agendamento sem exigência de sinal)!'
      );
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiFetch('/api/v1/business/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberForm),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setSuccessMsg(`Acesso criado com sucesso para ${memberForm.name} (${memberForm.email})!`);
        setShowNewMemberModal(false);
        setMemberForm({
          name: '',
          email: '',
          password: '',
          role: 'RECEPTIONIST',
          specialty: 'Nail Designer',
          phone: '',
        });
        fetchTeamMembers();
      } else {
        setErrorMsg(json.error || 'Erro ao cadastrar membro da equipe.');
      }
    } catch (err: any) {
      setErrorMsg('Erro de conexão ao cadastrar membro da equipe.');
    }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/business/team-members/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setSuccessMsg('Membro removido com sucesso.');
        fetchTeamMembers();
      } else {
        setErrorMsg(json.error || 'Não foi possível remover este usuário.');
      }
    } catch (e) {
      setErrorMsg('Erro ao remover membro.');
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Equipe e Permissões de Acesso (Gerentes, Recepcionistas e Profissionais) */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 sm:pb-6 border-b border-stone-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-bold text-stone-900">
                Equipe e Acessos do Painel
              </h3>
              <p className="text-xs text-stone-500">
                Cadastre logins e senhas para Gerentes, Recepcionistas e Profissionais acessarem o sistema de acordo com suas permissões
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNewMemberModal(true)}
            className="w-full sm:w-auto min-h-[42px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Membro da Equipe</span>
          </button>
        </div>

        {/* Mobile Card View for Team Members */}
        <div className="md:hidden divide-y divide-stone-100">
          {teamMembers.map((m: any) => (
            <div key={m.id} className="py-3 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <strong className="font-bold text-stone-900 block text-sm">{m.name}</strong>
                  <span className="text-stone-500 break-all">{m.email}</span>
                </div>
                {m.role !== 'OWNER' && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(m.id)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:text-rose-800 font-semibold inline-flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover</span>
                  </button>
                )}
              </div>
              <div>
                <span className="inline-block px-2.5 py-1 rounded-md bg-stone-100 text-stone-800 font-semibold">
                  {ROLE_LABELS[m.role] || m.role}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View for Team Members */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 uppercase">
                <th className="py-2.5 px-3">Nome</th>
                <th className="py-2.5 px-3">E-mail de Login</th>
                <th className="py-2.5 px-3">Cargo / Perfil</th>
                <th className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {teamMembers.map((m: any) => (
                <tr key={m.id} className="hover:bg-stone-50">
                  <td className="py-3 px-3 font-semibold text-stone-900">{m.name}</td>
                  <td className="py-3 px-3 text-stone-600">{m.email}</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-1 rounded-md bg-stone-100 text-stone-800 font-semibold">
                      {ROLE_LABELS[m.role] || m.role}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {m.role !== 'OWNER' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
        {/* Plano Comercial & Link Público Exclusivo (/agendar/:slug) */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-stone-100">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-xl font-bold text-stone-900">
                  Link Público Exclusivo & Plano Comercial
                </h3>
                <p className="text-xs text-stone-500">
                  Compartilhe o link da sua empresa no Instagram e WhatsApp para receber agendamentos diretos
                </p>
              </div>
            </div>

            {business.subscription && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-semibold shrink-0">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>{business.subscription.planName}</span>
                <span className="text-stone-400">·</span>
                <span className="text-amber-300 tabular-nums">
                  {((business.subscription.contractedPriceCents || 0) / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                  /mês
                </span>
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                  Seu Link Público Exclusivo de Agendamento
                </span>
                <p className="text-xs sm:text-sm font-mono font-bold text-rose-600 truncate mt-0.5">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/agendar/{formData.slug || business.slug || 'seu-salao'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyPublicLink}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-all"
                >
                  <Copy className="w-3.5 h-3.5 text-rose-600" />
                  <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                </button>
                {onOpenPublicPage && (
                  <button
                    type="button"
                    onClick={() => onOpenPublicPage(business.slug || business.id || formData.slug || 'agenda-beauty-sp')}
                    className="min-h-[38px] px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ver Página Pública</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">
                Identificador do Link (Slug Único)
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 bg-stone-100 border border-r-0 border-stone-200 rounded-l-xl text-xs text-stone-500 font-mono">
                  /agendar/
                </span>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, '-')
                        .replace(/^-+|-+$/g, ''),
                    })
                  }
                  placeholder="meu-salao-sp"
                  className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-r-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">
                Visibilidade no Diretório de Empresas Parceiras
              </label>
              <label className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(formData.isPublished)}
                  onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                  className="w-4 h-4 accent-rose-600 rounded"
                />
                <span className="text-xs font-medium text-stone-800">
                  Exibir estabelecimento na vitrine pública de Empresas Parceiras
                </span>
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">
                Descrição Pública do Estabelecimento
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Apresente seu estúdio, especialidades e diferenciais para suas clientes..."
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* General Establishment Settings */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-8">
          <div className="flex items-start sm:items-center gap-3 mb-6 pb-5 sm:pb-6 border-b border-stone-100">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-bold text-stone-900">Configurações do Estabelecimento</h3>
              <p className="text-xs text-stone-500">Definições gerais, fuso horário e horário de funcionamento</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Nome do Salão / Estúdio</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Telefone / WhatsApp</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">E-mail Comercial</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Endereço Completo</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Fuso Horário (Timezone)</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              >
                <option value="America/Sao_Paulo">America/Sao_Paulo (Horário de Brasília)</option>
                <option value="America/Manaus">America/Manaus</option>
                <option value="America/Belem">America/Belem</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Moeda Padrão</label>
              <input
                type="text"
                value={formData.currency}
                disabled
                className="w-full px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm text-stone-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Abertura do Expediente</label>
              <input
                type="time"
                value={formData.openTime}
                onChange={(e) => setFormData({ ...formData, openTime: e.target.value })}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Fechamento do Expediente</label>
              <input
                type="time"
                value={formData.closeTime}
                onChange={(e) => setFormData({ ...formData, closeTime: e.target.value })}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Política de Sinal e Confirmação de Agendamento */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 pb-5 sm:pb-6 border-b border-stone-100">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-xl font-bold text-stone-900">
                  Política de Sinal e Confirmação de Agendamento
                </h3>
                <p className="text-xs text-stone-500">
                  Defina se o estabelecimento exige pagamento de sinal via Pix para confirmar reservas online ou se confirma agendamentos sem sinal antecipado
                </p>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                formData.requireDeposit && planAllowsDeposit
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {formData.requireDeposit && planAllowsDeposit ? 'Com Sinal Obrigatório' : 'Sem Sinal (Confirmação Imediata)'}
            </span>
          </div>

          {!planAllowsDeposit && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="font-bold block">
                  Recurso exclusivo do Plano Completo — Agendamento com Sinal
                </strong>
                <p className="text-amber-800 leading-relaxed">
                  Seu estabelecimento está no <strong>Plano Simples — Agendamento</strong>. Neste plano, todas as reservas são confirmadas diretamente sem cobrança antecipada via Pix. Para habilitar sinal antecipado e cobrança automatizada Pix, solicite o upgrade para o Plano Completo junto à administração da plataforma.
                </p>
              </div>
            </div>
          )}

          <label
            className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
              planAllowsDeposit
                ? 'bg-stone-50 border-stone-200 cursor-pointer hover:border-stone-300'
                : 'bg-stone-100 border-stone-200 opacity-60 cursor-not-allowed'
            }`}
          >
            <input
              type="checkbox"
              disabled={!planAllowsDeposit}
              checked={Boolean(formData.requireDeposit && planAllowsDeposit)}
              onChange={(e) => {
                const isChecked = e.target.checked;
                setFormData((prev) => ({
                  ...prev,
                  requireDeposit: isChecked,
                  defaultDeposit: isChecked && (!prev.defaultDeposit || prev.defaultDeposit < 1) ? 30 : prev.defaultDeposit,
                }));
              }}
              className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
            />
            <div className="text-xs">
              <span className="font-semibold text-stone-900 block">
                Exigir sinal para confirmar agendamentos
              </span>
              <span className="text-stone-600 mt-0.5 block leading-relaxed">
                Quando ativado, reservas feitas no Portal da Cliente iniciam como pendentes de pagamento (PENDING_PAYMENT) e exigem o pagamento do sinal via Pix antes da confirmação definitiva. Quando desativado, os agendamentos são confirmados imediatamente sem cobrança antecipada.
              </span>
            </div>
          </label>

          {formData.requireDeposit ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase text-stone-700">
                  Percentual padrão de sinal (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.defaultDeposit}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value || '30', 10);
                      setFormData((prev) => ({
                        ...prev,
                        defaultDeposit: isNaN(parsed) ? 30 : Math.max(1, Math.min(100, parsed)),
                      }));
                    }}
                    className="w-28 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    required
                  />
                  <span className="text-xs text-stone-500">% do valor do serviço</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[20, 30, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, defaultDeposit: pct }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                        Number(formData.defaultDeposit) === pct
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                      }`}
                    >
                      {pct}% {pct === 30 ? '(Padrão)' : ''}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Nota: serviços que possuam um percentual específico configurado no catálogo usarão o percentual próprio do serviço; os demais usarão este percentual padrão.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2 text-xs tabular-nums">
                <span className="font-semibold text-stone-800 block">
                  Simulação de cálculo (Exemplo: Serviço de R$ 180,00)
                </span>
                <div className="flex justify-between text-stone-600">
                  <span>Valor total do serviço:</span>
                  <strong className="text-stone-900">R$ 180,00</strong>
                </div>
                <div className="flex justify-between text-rose-700 font-medium">
                  <span>Sinal na reserva via Pix ({formData.defaultDeposit}%):</span>
                  <strong>
                    {((180 * Number(formData.defaultDeposit || 30)) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </div>
                <div className="flex justify-between text-stone-700 pt-1 border-t border-dashed border-stone-200">
                  <span>Saldo restante no atendimento ({100 - Number(formData.defaultDeposit || 30)}%):</span>
                  <strong className="text-stone-900">
                    {(180 - (180 * Number(formData.defaultDeposit || 30)) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 space-y-1.5 leading-relaxed">
                <strong className="block font-semibold">
                  Confirmação imediata sem cobrança antecipada
                </strong>
                <p>
                  Os agendamentos realizados pelas clientes serão confirmados automaticamente no ato da reserva (status <strong>CONFIRMED</strong>), sem exigir pagamento via Pix ou credenciais do Mercado Pago.
                </p>
                <p className="text-[11px] text-emerald-800">
                  Agendamentos anteriores que já tiveram sinal pago mantêm seu histórico financeiro intacto.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2 text-xs tabular-nums">
                <span className="font-semibold text-stone-800 block">
                  Simulação de cálculo (Exemplo: Serviço de R$ 180,00)
                </span>
                <div className="flex justify-between text-stone-600">
                  <span>Valor total do serviço:</span>
                  <strong className="text-stone-900">R$ 180,00</strong>
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Sinal exigido na reserva:</span>
                  <strong>R$ 0,00 (Dispensado)</strong>
                </div>
                <div className="flex justify-between text-stone-700 pt-1 border-t border-dashed border-stone-200">
                  <span>Valor a pagar no estabelecimento (100%):</span>
                  <strong className="text-stone-900">R$ 180,00</strong>
                </div>
              </div>
            </div>
          )}

          {/* Action Bar for Section 2 */}
          <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-stone-500">
              {formData.requireDeposit && planAllowsDeposit
                ? `Exigência de sinal ativa: ${formData.defaultDeposit}% do serviço cobrado via Pix.`
                : 'Exigência de sinal inativa: agendamentos confirmados sem cobrança antecipada.'}
            </span>
            <button
              type="button"
              onClick={handleSaveDepositPolicyOnly}
              disabled={isSavingDepositSection || isSaving}
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
            >
              {isSavingDepositSection ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Salvar Política de Sinal</span>
            </button>
          </div>
        </div>

        {/* Section: Integração Mercado Pago (Pix) */}
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 pb-5 sm:pb-6 border-b border-stone-100">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-xl font-bold text-stone-900">
                  Integração Mercado Pago (Pix Automatizado)
                </h3>
                <p className="text-xs text-stone-500">
                  Conecte sua conta do Mercado Pago para gerar QR Codes Pix dinâmicos e receber confirmações automáticas de sinal
                </p>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                formData.mpAccessToken && formData.mpAccessToken.trim().length > 10
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {formData.mpAccessToken && formData.mpAccessToken.trim().length > 10 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Credenciais Ativas</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Aguardando Configuração</span>
                </>
              )}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 text-xs text-sky-950 space-y-1.5 leading-relaxed">
            <strong className="block font-semibold text-sky-900 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-sky-600" />
              Como funciona a integração com o Mercado Pago
            </strong>
            <p>
              Ao configurar seu <strong>Access Token</strong>, as reservas com sinal gerarão cobranças Pix oficiais vinculadas diretamente à sua conta do Mercado Pago. Quando a cliente efetuar o pagamento, o webhook avisará o sistema instantaneamente e o agendamento passará para status <strong>CONFIRMED</strong> de forma 100% automatizada.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Ambiente */}
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-700 mb-2">
                Ambiente de Execução (Modo de Operação)
              </label>
              <select
                value={formData.mpEnvironment}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mpEnvironment: e.target.value as 'sandbox' | 'production',
                  })
                }
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-medium"
              >
                <option value="sandbox">Ambiente de Testes (Sandbox / Credenciais TEST-...)</option>
                <option value="production">Ambiente de Produção (Conta Real / Credenciais APP_USR-...)</option>
              </select>
              <p className="text-[11px] text-stone-500 mt-1.5">
                Escolha &quot;Produção&quot; para pagamentos reais de clientes via aplicativo de banco.
              </p>
            </div>

            {/* Public Key */}
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-700 mb-2">
                Public Key do Mercado Pago
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.mpPublicKey}
                  onChange={(e) => setFormData({ ...formData, mpPublicKey: e.target.value })}
                  placeholder="APP_USR-00000000-0000-0000-0000-000000000000"
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 pr-10"
                />
                <Key className="w-4 h-4 text-stone-400 absolute right-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">
                Chave pública (formato UUID <code className="font-mono">APP_USR-xxxx-xxxx...</code>) da sua aplicação no Mercado Pago.
              </p>
            </div>

            {/* Access Token */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase text-stone-700">
                  Access Token do Mercado Pago
                </label>
                <button
                  type="button"
                  onClick={() => setShowMpToken(!showMpToken)}
                  className="text-[11px] text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1"
                >
                  {showMpToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showMpToken ? 'Ocultar' : 'Exibir Token'}</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showMpToken ? 'text' : 'password'}
                  value={formData.mpAccessToken}
                  onChange={(e) => setFormData({ ...formData, mpAccessToken: e.target.value })}
                  placeholder="APP_USR-0000000000000000-000000-..."
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 pr-10"
                />
                <Key className="w-4 h-4 text-stone-400 absolute right-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">
                Token privado de servidor (<code className="font-mono">APP_USR-86300354...</code>). Obtenha em <strong>Mercado Pago Developers</strong> &gt; Suas integrações &gt; Credenciais.
              </p>
            </div>

            {/* Webhook Secret */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase text-stone-700">
                  Chave Secreta do Webhook (Assinatura HMAC)
                </label>
                <button
                  type="button"
                  onClick={() => setShowMpSecret(!showMpSecret)}
                  className="text-[11px] text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1"
                >
                  {showMpSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showMpSecret ? 'Ocultar' : 'Exibir Chave'}</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showMpSecret ? 'text' : 'password'}
                  value={formData.mpWebhookSecret}
                  onChange={(e) => setFormData({ ...formData, mpWebhookSecret: e.target.value })}
                  placeholder="Chave secreta de validação (opcional)"
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 pr-10"
                />
                <Lock className="w-4 h-4 text-stone-400 absolute right-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">
                Chave secreta configurada no painel de Notificações Webhook do Mercado Pago.
              </p>
            </div>

            {/* URL do Webhook Oficial */}
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-700 mb-2">
                URL do Webhook para Notificações Automáticas
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="w-full px-3 py-2.5 bg-stone-100 border border-r-0 border-stone-200 rounded-l-xl text-xs font-mono text-stone-700 select-all focus:outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="px-3.5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-r-xl text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedWebhook ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">
                No painel do Mercado Pago Developers (Notificações &gt; Webhooks), cole esta URL e selecione o evento <strong>Pagamentos</strong>.
              </p>
            </div>
          </div>

          {/* Test connection feedback */}
          {mpTestResult && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
                mpTestResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              {mpTestResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <strong className="block font-semibold">
                  {mpTestResult.ok ? 'Conexão com Mercado Pago Validada' : 'Falha na Validação do Token'}
                </strong>
                <p className="leading-relaxed">{mpTestResult.message}</p>
              </div>
            </div>
          )}

          {/* Action Bar for Mercado Pago Section */}
          <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleTestMercadoPago}
              disabled={isTestingMp || !formData.mpAccessToken || formData.mpAccessToken.trim().length < 5}
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-xs rounded-xl border border-stone-200 transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              {isTestingMp ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              )}
              <span>{isTestingMp ? 'Testando Conexão...' : 'Testar Conexão com Mercado Pago'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveMercadoPagoOnly}
              disabled={isSavingMpSection || isSaving}
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
            >
              {isSavingMpSection ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Salvar Integração Mercado Pago</span>
            </button>
          </div>
        </div>

        {/* Section 3: Política de Cancelamento e Reembolso (apenas quando exige sinal) */}
        {formData.requireDeposit && (
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-5 sm:pb-6 border-b border-stone-100">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-bold text-stone-900">Política de cancelamento e reembolso</h3>
                  <p className="text-xs text-stone-500">
                    Defina o prazo limite de antecedência, regras de reagendamento e termos preservados em cada reserva
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-stone-500 tabular-nums">
                Versão atual: v{business.cancellationPolicyVersion || 1}
              </span>
            </div>

            {/* Prazo Limite de Antecedência */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase text-stone-700">
                Prazo limite para cancelamento dentro da política (Padrão: 6 horas)
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_HOURS.map((hrs) => {
                  const active = !isCustomHours && formData.cancellationHoursLimit === hrs;
                  return (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => handleSelectPreset(hrs)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all tabular-nums ${
                        active
                          ? 'bg-stone-900 text-white shadow-xs'
                          : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                      }`}
                    >
                      {hrs} horas {hrs === 6 ? '(Padrão)' : ''}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setCompleteCustomHours(true)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isCustomHours
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                  }`}
                >
                  Prazo personalizado
                </button>
              </div>

              {isCustomHours && (
                <div className="pt-2 max-w-xs">
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Informe o prazo em horas (1 a 720 horas):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={customHoursValue}
                      onChange={(e) => handleCustomHoursChange(e.target.value)}
                      className="w-32 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                      required
                    />
                    <span className="text-xs text-stone-500">horas antes do início do atendimento</span>
                  </div>
                </div>
              )}
            </div>

            {/* Toggles: Reagendamento e Análise Manual Fora do Prazo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <label className="flex items-start gap-3 p-4 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer hover:border-stone-300 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.allowCustomerReschedule}
                  onChange={(e) => setFormData({ ...formData, allowCustomerReschedule: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
                />
                <div className="text-xs">
                  <span className="font-semibold text-stone-900 block">
                    Permitir reagendamento pelo Portal da Cliente
                  </span>
                  <span className="text-stone-600 mt-0.5 block leading-relaxed">
                    Quando ativo, a cliente pode alterar data e horário dentro do prazo limite sem perder o sinal já pago.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer hover:border-stone-300 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.allowManualReviewOutOfPeriod}
                  onChange={(e) => setFormData({ ...formData, allowManualReviewOutOfPeriod: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
                />
                <div className="text-xs">
                  <span className="font-semibold text-stone-900 block">
                    Permitir análise manual fora do prazo
                  </span>
                  <span className="text-stone-600 mt-0.5 block leading-relaxed">
                    Quando ativo, solicitações feitas após o prazo limite entram como fora da política para decisão manual do proprietário.
                  </span>
                </div>
              </label>
            </div>

            {/* Texto Explicativo & Instruções de Contato */}
            <div className="space-y-6 pt-2">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-rose-600" />
                    <span>Texto explicativo da política de cancelamento e reembolso</span>
                  </label>
                  <span className="text-[11px] text-stone-600 font-mono">
                    {formData.cancellationPolicyText.length} caracteres
                  </span>
                </div>

                {/* Preset Chips */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-stone-600 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Inserir modelo pré-formatado com 1 clique:</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {CANCELLATION_POLICY_PRESETS.map((preset) => {
                      const isActive = formData.cancellationPolicyText.trim() === preset.text.trim();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, cancellationPolicyText: preset.text }))}
                          title={preset.description}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                            isActive
                              ? 'bg-rose-50 border-rose-400 text-rose-800 shadow-xs'
                              : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={formData.cancellationPolicyText}
                  onChange={(e) => setFormData({ ...formData, cancellationPolicyText: e.target.value })}
                  placeholder="Escreva claramente os direitos e deveres da cliente em relação ao cancelamento e devolução do sinal..."
                  className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-xs leading-relaxed text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  required
                />
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Este texto é exibido para a cliente no momento de confirmação da reserva e no modal de cancelamento/reembolso, assegurando transparência jurídica e respeito ao Código de Defesa do Consumidor (CDC).
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Instruções adicionais para contato com o estabelecimento</span>
                  </label>
                  <span className="text-[11px] text-stone-600 font-mono">
                    {formData.cancellationContactInstructions.length} caracteres
                  </span>
                </div>

                {/* Contact Preset Chips */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-stone-600 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Inserir modelo pré-formatado:</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {CANCELLATION_CONTACT_PRESETS.map((preset) => {
                      const isActive = formData.cancellationContactInstructions.trim() === preset.text.trim();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, cancellationContactInstructions: preset.text }))}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                            isActive
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
                              : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={formData.cancellationContactInstructions}
                  onChange={(e) => setFormData({ ...formData, cancellationContactInstructions: e.target.value })}
                  placeholder="Instruções de WhatsApp, telefone ou atendimento emergencial..."
                  className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-xs leading-relaxed text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Orienta a cliente sobre qual canal acionar caso ocorram imprevistos de saúde, trânsito ou necessidade de análise manual de devolução.
                </p>
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="p-5 rounded-2xl bg-linear-to-b from-stone-50 to-stone-100/50 border border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-rose-600" />
                  <span>Prévia em tempo real (Como a cliente visualiza no agendamento e cancelamento)</span>
                </span>
                <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200 tabular-nums">
                  Prazo mínimo: {formData.cancellationHoursLimit}h
                </span>
              </div>

              <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-2.5">
                  <div>
                    <h4 className="font-bold text-stone-900 font-serif">
                      Política de Cancelamento e Reembolso — {formData.name || 'Estabelecimento'}
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      Garantia de atendimento e regras transparentes de reembolso
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-700 px-2 py-1 rounded-md">
                    Até {formData.cancellationHoursLimit}h antes
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Termos Gerais:</span>
                  <p className="text-stone-700 leading-relaxed bg-stone-50/70 p-3 rounded-lg border border-stone-100">
                    {formData.cancellationPolicyText || DEFAULT_CANCELLATION_POLICY_TEXT}
                  </p>
                </div>

                {formData.cancellationContactInstructions && (
                  <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-100 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-emerald-600" />
                      <span>Instruções de Contato:</span>
                    </span>
                    <p className="text-emerald-900 text-[11px] leading-relaxed">
                      {formData.cancellationContactInstructions}
                    </p>
                  </div>
                )}

                <div className="text-[11px] text-stone-600 pt-2 border-t border-stone-100 flex flex-wrap gap-y-1.5 gap-x-4">
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Reagendamento online: <strong>{formData.allowCustomerReschedule ? 'Habilitado dentro do prazo' : 'Apenas direto com o salão'}</strong>
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>
                      Solicitações fora do prazo: <strong>{formData.allowManualReviewOutOfPeriod ? 'Sujeitas à análise administrativa' : 'Sem estorno automático'}</strong>
                    </span>
                  </span>
                </div>
              </div>

              {/* Action Bar for Section 3 */}
              <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-stone-500">
                  Prazo limite de cancelamento: {formData.cancellationHoursLimit}h antes do horário.
                </span>
                <button
                  type="button"
                  onClick={handleSaveCancellationPolicyOnly}
                  disabled={isSavingCancelSection || isSaving}
                  className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
                >
                  {isSavingCancelSection ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar Política de Cancelamento</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-stone-500">
            {formData.requireDeposit
              ? 'As alterações nas configurações gerais, política de sinal e política de cancelamento serão aplicadas aos novos agendamentos.'
              : 'Com a exigência de sinal desativada, as opções de cobrança antecipada via Pix e política de retenção/reembolso de sinal ficam desabilitadas.'}
          </p>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto min-h-[44px] px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-75"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{formData.requireDeposit ? 'Salvar Todas as Configurações e Políticas' : 'Salvar Todas as Configurações'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Modal: Cadastrar Novo Membro da Equipe */}
      {showNewMemberModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-stone-900">
              Cadastrar Acesso de Membro da Equipe
            </h3>
            <form onSubmit={handleCreateMember} className="space-y-3">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Cargo / Perfil de Permissão
                </label>
                <select
                  value={memberForm.role}
                  onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                >
                  <option value="MANAGER">Gerente (Operação + Financeiro Completo)</option>
                  <option value="RECEPTIONIST">Recepcionista (Agenda + CRM + Serviços)</option>
                  <option value="PROFESSIONAL">Profissional (Agenda + Suas Comissões)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  placeholder="Ex.: Juliana Martins"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">E-mail de Login</label>
                <input
                  type="email"
                  required
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  placeholder="juliana@agendabeauty.com.br"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Senha de Acesso</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={memberForm.password}
                  onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              {memberForm.role === 'PROFESSIONAL' && (
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Especialidade na Agenda
                  </label>
                  <input
                    type="text"
                    value={memberForm.specialty}
                    onChange={(e) => setMemberForm({ ...memberForm, specialty: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                    placeholder="Ex.: Alongamento em Fibra de Vidro"
                  />
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewMemberModal(false)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 text-stone-700 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
                >
                  Criar Acesso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Change Password Card for Lojista */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6 mt-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 font-serif">Segurança & Senha do Painel Lojista</h2>
            <p className="text-xs text-stone-500">Altere sua senha de acesso administrativo ao estabelecimento.</p>
          </div>
        </div>

        {lojistaPasswordFeedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
              lojistaPasswordFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {lojistaPasswordFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{lojistaPasswordFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleLojistaChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
              Senha Atual
            </label>
            <input
              type="password"
              value={lojistaCurrentPassword}
              onChange={(e) => setLojistaCurrentPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                Nova Senha
              </label>
              <input
                type="password"
                value={lojistaNewPassword}
                onChange={(e) => setLojistaNewPassword(e.target.value)}
                required
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                value={lojistaConfirmPassword}
                onChange={(e) => setLojistaConfirmPassword(e.target.value)}
                required
                placeholder="Repita a nova senha"
                className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 flex justify-end">
            <button
              type="submit"
              disabled={lojistaChangingPassword}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              {lojistaChangingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Alterando...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Alterar Senha do Lojista</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


