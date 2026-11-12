import React, { useState, useEffect } from 'react';
import {
  Shield,
  Building2,
  Users,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Search,
  RefreshCw,
  DollarSign,
  FileText,
  ExternalLink,
  LogOut,
  Sparkles,
  Lock,
  Unlock,
  XCircle,
  Plus,
  History,
  ArrowLeft,
  Copy,
  Check,
  Share2,
} from 'lucide-react';

interface MasterAdminPortalProps {
  currentUser: { id: string; name: string; email: string; role?: string };
  onInspectTenant?: (tenantId: string) => void;
  onBackToApp?: () => void;
  onLogout: () => void;
}

export const MasterAdminPortal: React.FC<MasterAdminPortalProps> = ({
  currentUser,
  onInspectTenant,
  onBackToApp,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tenants' | 'plans' | 'users' | 'audit'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Filters for tenants
  const [searchTenant, setSearchTenant] = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [subStatusFilter, setSubStatusFilter] = useState('ALL');
  const [opStatusFilter, setOpStatusFilter] = useState('ALL');

  // Filters for users
  const [searchUser, setSearchUser] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Selected Tenant Modal
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantDetails, setTenantDetails] = useState<any>(null);
  const [modalFeedback, setModalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Action forms inside tenant modal
  const [newPlan, setNewPlan] = useState<'SIMPLE' | 'COMPLETE'>('COMPLETE');
  const [applyDefaultPriceOnPlanChange, setApplyDefaultPriceOnPlanChange] = useState(false);
  const [planReason, setPlanReason] = useState('');

  const [customPriceReais, setCustomPriceReais] = useState('');
  const [priceReason, setPriceReason] = useState('');

  const [statusReason, setStatusReason] = useState('');
  const [invoiceAmountReais, setInvoiceAmountReais] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Plan default price form
  const [editingPlanCode, setEditingPlanCode] = useState<string | null>(null);
  const [planDefaultReais, setPlanDefaultReais] = useState('');
  const [planDefaultReason, setPlanDefaultReason] = useState('');
  const [globalFeedback, setGlobalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Tenant Modal state
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [createTenantError, setCreateTenantError] = useState('');
  const [createdTenantResult, setCreatedTenantResult] = useState<any>(null);
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);
  const [copiedOwnerLink, setCopiedOwnerLink] = useState(false);
  const [copiedWelcomeMessage, setCopiedWelcomeMessage] = useState(false);
  const [newTenantForm, setNewTenantForm] = useState({
    businessName: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: '123456',
    plan: 'COMPLETE' as 'SIMPLE' | 'COMPLETE',
    address: '',
    description: '',
  });

  const authHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-session-token'] = token;
    }
    return headers;
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [dashRes, tenantsRes, plansRes, usersRes, auditRes] = await Promise.all([
        fetch('/api/v1/master-admin/dashboard', { headers, credentials: 'include' }).then((r) => r.json()),
        fetch(
          `/api/v1/master-admin/tenants?search=${encodeURIComponent(searchTenant)}&plan=${planFilter}&subscriptionStatus=${subStatusFilter}&operationalStatus=${opStatusFilter}`,
          { headers, credentials: 'include' }
        ).then((r) => r.json()),
        fetch('/api/v1/master-admin/plans', { headers, credentials: 'include' }).then((r) => r.json()),
        fetch(
          `/api/v1/master-admin/users?search=${encodeURIComponent(searchUser)}&role=${roleFilter}`,
          { headers, credentials: 'include' }
        ).then((r) => r.json()),
        fetch('/api/v1/master-admin/audit-logs', { headers, credentials: 'include' }).then((r) => r.json()),
      ]);

      if (dashRes?.success) setDashboard(dashRes.data);
      if (tenantsRes?.success) setTenants(tenantsRes.data || []);
      if (plansRes?.success) setPlans(plansRes.data || []);
      if (usersRes?.success) setUsers(usersRes.data || []);
      if (auditRes?.success) setAuditLogs(auditRes.data || []);
    } catch (e) {
      console.error('Erro ao carregar Master Admin:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [searchTenant, planFilter, subStatusFilter, opStatusFilter, searchUser, roleFilter]);

  const openTenantModal = async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setModalFeedback(null);
    const res = await fetch(`/api/v1/master-admin/tenants/${tenantId}`, {
      headers: authHeaders(),
      credentials: 'include',
    }).then((r) => r.json());
    if (res?.success) {
      setTenantDetails(res.data);
      setNewPlan(res.data.subscription?.plan || 'COMPLETE');
      setCustomPriceReais(((res.data.subscription?.contractedPriceCents || 0) / 100).toFixed(2));
      setInvoiceAmountReais(((res.data.subscription?.contractedPriceCents || 0) / 100).toFixed(2));
    }
  };

  const handleChangePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    setModalFeedback(null);
    const res = await fetch(`/api/v1/master-admin/tenants/${selectedTenantId}/plan`, {
      method: 'PATCH',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        plan: newPlan,
        applyDefaultPlanPrice: applyDefaultPriceOnPlanChange,
        reason: planReason.trim() || `Alteração para ${newPlan}`,
      }),
    }).then((r) => r.json());

    if (res?.success) {
      setModalFeedback({ type: 'success', text: res.message || 'Plano atualizado com sucesso!' });
      setPlanReason('');
      await openTenantModal(selectedTenantId);
      await loadAll();
    } else {
      setModalFeedback({ type: 'error', text: res?.error || 'Erro ao alterar plano.' });
    }
  };

  const handleUpdateContractedPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    setModalFeedback(null);
    const cents = Math.round(Number(String(customPriceReais).replace(',', '.')) * 100);
    const res = await fetch(`/api/v1/master-admin/tenants/${selectedTenantId}/contracted-price`, {
      method: 'PATCH',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        contractedPriceCents: cents,
        reason: priceReason.trim(),
      }),
    }).then((r) => r.json());

    if (res?.success) {
      setModalFeedback({ type: 'success', text: res.message || 'Valor mensal contratado atualizado!' });
      setPriceReason('');
      await openTenantModal(selectedTenantId);
      await loadAll();
    } else {
      setModalFeedback({ type: 'error', text: res?.error || 'Informe um motivo válido (mínimo 3 caracteres).' });
    }
  };

  const handleUpdateStatus = async (subscriptionStatus: string, operationalStatus: string) => {
    if (!selectedTenantId) return;
    if (!statusReason || statusReason.trim().length < 3) {
      setModalFeedback({
        type: 'error',
        text: 'Informe o motivo administrativo (mínimo 3 caracteres) antes de confirmar esta ação.',
      });
      return;
    }
    setModalFeedback(null);
    const res = await fetch(`/api/v1/master-admin/tenants/${selectedTenantId}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        subscriptionStatus,
        operationalStatus,
        reason: statusReason.trim(),
      }),
    }).then((r) => r.json());

    if (res?.success) {
      setModalFeedback({ type: 'success', text: res.message || 'Status atualizado com sucesso!' });
      setStatusReason('');
      await openTenantModal(selectedTenantId);
      await loadAll();
    } else {
      setModalFeedback({ type: 'error', text: res?.error || 'Erro ao atualizar status.' });
    }
  };

  const handleToggleAdvancedFeatures = async (tenantId: string, enabled: boolean) => {
    setModalFeedback(null);
    setGlobalFeedback(null);
    const res = await fetch(`/api/v1/master-admin/tenants/${tenantId}/advanced-features`, {
      method: 'PATCH',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        enabled,
        reason: enabled
          ? 'Recursos Avançados e Fidelidade ativados pelo Super Admin'
          : 'Recursos Avançados e Fidelidade desativados pelo Super Admin',
      }),
    }).then((r) => r.json());

    if (res?.success) {
      const msg =
        res.message ||
        (enabled
          ? 'Recursos Avançados e Fidelidade ativados para o estabelecimento!'
          : 'Recursos Avançados e Fidelidade desativados (ocultos no painel do lojista e do cliente).');
      if (selectedTenantId === tenantId) {
        setModalFeedback({ type: 'success', text: msg });
        await openTenantModal(tenantId);
      } else {
        setGlobalFeedback({ type: 'success', text: msg });
      }
      await loadAll();
    } else {
      const errText = res?.error || 'Erro ao alterar Recursos Avançados.';
      if (selectedTenantId === tenantId) {
        setModalFeedback({ type: 'error', text: errText });
      } else {
        setGlobalFeedback({ type: 'error', text: errText });
      }
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    const cents = Math.round(Number(String(invoiceAmountReais).replace(',', '.')) * 100);
    const res = await fetch(`/api/v1/master-admin/tenants/${selectedTenantId}/invoices`, {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        amountCents: cents,
        dueDate: new Date(`${invoiceDueDate}T12:00:00-03:00`).toISOString(),
        status: 'PENDING',
        notes: invoiceNotes.trim() || 'Mensalidade SaaS Agenda Beauty',
      }),
    }).then((r) => r.json());

    if (res?.success) {
      setModalFeedback({ type: 'success', text: 'Cobrança SaaS registrada com sucesso!' });
      setInvoiceNotes('');
      await openTenantModal(selectedTenantId);
      await loadAll();
    } else {
      setModalFeedback({ type: 'error', text: res?.error || 'Erro ao criar cobrança.' });
    }
  };

  const handleMarkInvoice = async (invoiceId: string, status: 'PAID' | 'OVERDUE' | 'CANCELLED') => {
    const res = await fetch(`/api/v1/master-admin/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ status }),
    }).then((r) => r.json());
    if (res?.success && selectedTenantId) {
      setModalFeedback({ type: 'success', text: 'Status da fatura SaaS atualizado!' });
      await openTenantModal(selectedTenantId);
      await loadAll();
    }
  };

  const handleUpdateDefaultPlanPrice = async (code: string) => {
    setGlobalFeedback(null);
    const cents = Math.round(Number(String(planDefaultReais).replace(',', '.')) * 100);
    const res = await fetch(`/api/v1/master-admin/plans/${code}`, {
      method: 'PUT',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        defaultPriceCents: cents,
        reason: planDefaultReason.trim() || 'Ajuste comercial da tabela padrão',
      }),
    }).then((r) => r.json());

    if (res?.success) {
      setGlobalFeedback({ type: 'success', text: res.message });
      setEditingPlanCode(null);
      setPlanDefaultReason('');
      await loadAll();
    } else {
      setGlobalFeedback({ type: 'error', text: res?.error || 'Falha ao atualizar preço padrão.' });
    }
  };

  const handleAutoSlug = (name: string) => {
    const slugified = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setNewTenantForm((prev) => ({
      ...prev,
      businessName: name,
      slug: prev.slug === '' || prev.slug === slugified ? slugified : prev.slug,
    }));
  };

  const handleCreateTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateTenantError('');
    setCreatingTenant(true);
    try {
      const res = await fetch('/api/v1/master-admin/tenants', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify(newTenantForm),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setCreateTenantError(data.error || 'Erro ao cadastrar novo estabelecimento.');
        return;
      }

      setCreatedTenantResult(data.data);
      await loadAll();
    } catch {
      setCreateTenantError('Erro de conexão ao cadastrar nova loja.');
    } finally {
      setCreatingTenant(false);
    }
  };

  const formatBRL = (cents: number) =>
    (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      {/* Top Header */}
      <header className="bg-stone-900 text-white sticky top-0 z-30 border-b border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold truncate">Agenda Beauty · Master Admin SaaS</h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 rounded-md border border-rose-500/30">
                  SUPER_ADMIN
                </span>
              </div>
              <p className="text-[11px] text-stone-400 truncate">
                Gestão Global de Empresas, Planos Comerciais, Assinaturas e Inadimplência
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setCreateTenantError('');
                setCreatedTenantResult(null);
                setNewTenantForm({
                  businessName: '',
                  slug: '',
                  ownerName: '',
                  ownerEmail: '',
                  ownerPhone: '',
                  ownerPassword: '123456',
                  plan: 'COMPLETE',
                  address: '',
                  description: '',
                });
                setIsCreateTenantOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Cadastrar Loja</span>
            </button>
            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Painel do Salão</span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-stone-800/80">
          {[
            { id: 'dashboard', label: 'Visão Geral SaaS', icon: Sparkles },
            { id: 'tenants', label: 'Empresas & Assinaturas', icon: Building2 },
            { id: 'plans', label: 'Planos Comerciais', icon: CreditCard },
            { id: 'users', label: 'Usuários Globais', icon: Users },
            { id: 'audit', label: 'Auditoria Global', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'border-rose-500 text-white bg-stone-800/50'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {globalFeedback && (
          <div
            className={`p-4 rounded-2xl border text-xs font-medium flex items-center justify-between ${
              globalFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <span>{globalFeedback.text}</span>
            <button onClick={() => setGlobalFeedback(null)} className="text-[11px] underline">
              Fechar
            </button>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Empresas Cadastradas</span>
                  <Building2 className="w-4 h-4 text-stone-700" />
                </div>
                <div className="text-2xl font-bold text-stone-900 tabular-nums">
                  {dashboard.totals?.totalBusinesses ?? dashboard.totalBusinesses ?? 0}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-emerald-700 font-semibold">
                    {dashboard.totals?.activeBusinesses ?? dashboard.activeBusinesses ?? 0} ativas
                  </span>
                  <span>·</span>
                  <span className="text-rose-600 font-semibold">
                    {dashboard.totals?.blockedBusinesses ?? dashboard.blockedBusinesses ?? 0} bloqueadas
                  </span>
                  <span>·</span>
                  <span className="text-stone-500">
                    {dashboard.totals?.cancelledBusinesses ?? dashboard.cancelledBusinesses ?? 0} canceladas
                  </span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>MRR Previsto (Assinaturas Ativas)</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-stone-900 tabular-nums">
                  {dashboard.revenue?.formattedExpectedMrr ?? dashboard.formattedExpectedMrr ?? 'R$ 0,00'}
                </div>
                <p className="text-[11px] text-stone-500">
                  Soma dos valores mensais contratados (separado dos recebimentos)
                </p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Faturas SaaS Recebidas vs Pendentes</span>
                  <CreditCard className="w-4 h-4 text-rose-600" />
                </div>
                <div className="text-xl font-bold text-emerald-700 tabular-nums">
                  {dashboard.revenue?.formattedReceivedSaas ?? dashboard.formattedReceivedSaaSRevenue ?? 'R$ 0,00'} recebidos
                </div>
                <div className="text-[11px] text-amber-700 font-medium tabular-nums">
                  Pendente / Atraso: {dashboard.revenue?.formattedPendingSaas ?? dashboard.formattedPendingSaaSRevenue ?? 'R$ 0,00'}
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Distribuição por Plano & Atrasos</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-sm font-bold text-stone-900 space-y-1">
                  <div className="flex justify-between">
                    <span>Plano Simples:</span>
                    <span className="tabular-nums">{dashboard.subscriptionsByPlan?.SIMPLE ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Plano Completo (Com Sinal):</span>
                    <span className="tabular-nums">{dashboard.subscriptionsByPlan?.COMPLETE ?? 0}</span>
                  </div>
                </div>
                <div className="text-[11px] text-rose-600 font-semibold">
                  {dashboard.delinquency?.overdueSubscriptionsCount ?? dashboard.pastDueSubscriptionsCount ?? 0} assinatura(s) em atraso (PAST_DUE)
                </div>
              </div>
            </div>

            {/* Quick Table of Businesses */}
            <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-stone-900 font-serif">
                    Empresas Recentes e Status de Assinatura
                  </h2>
                  <p className="text-xs text-stone-500">
                    Clique em uma empresa para gerenciar seu plano, preço contratado ou bloqueio operacional.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('tenants')}
                  className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold"
                >
                  Ver Todas ({tenants.length})
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tenants.slice(0, 6).map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl border border-stone-200 flex flex-col justify-between gap-3 bg-stone-50/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-stone-900">{t.name}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              t.operationalStatus === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {t.operationalStatus}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500">
                          Link: <code className="text-stone-700">/agendar/{t.slug}</code> · Resp:{' '}
                          {t.owner?.name || t.email}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-stone-900 text-white text-[11px] font-semibold">
                        {t.subscription?.plan === 'SIMPLE' ? 'Plano Simples' : 'Plano Completo'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/80 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <div>
                          <span className="text-stone-500">Mensalidade: </span>
                          <strong className="text-stone-900 tabular-nums">
                            {t.subscription?.formattedContractedPrice}
                          </strong>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            t.enableAdvancedFeatures
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          Avançado & Fidelidade: {t.enableAdvancedFeatures ? 'ATIVO' : 'DESATIVADO'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleAdvancedFeatures(t.id, !t.enableAdvancedFeatures)}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
                            t.enableAdvancedFeatures
                              ? 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                              : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                          }`}
                        >
                          {t.enableAdvancedFeatures ? 'Desativar Avançado' : 'Ativar Avançado'}
                        </button>
                        <button
                          onClick={() => openTenantModal(t.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                        >
                          Gerenciar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TENANTS & SUBSCRIPTIONS */}
        {activeTab === 'tenants' && (
          <div className="space-y-4">
            {/* Header with Create Button */}
            <div className="bg-white rounded-3xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-stone-900 font-serif">
                  Empresas & Assinaturas Credenciadas
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Cadastre novos estabelecimentos e gerencie acessos, planos comerciais e assinaturas.
                </p>
              </div>
              <button
                onClick={() => {
                  setCreateTenantError('');
                  setCreatedTenantResult(null);
                  setNewTenantForm({
                    businessName: '',
                    slug: '',
                    ownerName: '',
                    ownerEmail: '',
                    ownerPhone: '',
                    ownerPassword: '123456',
                    plan: 'COMPLETE',
                    address: '',
                    description: '',
                  });
                  setIsCreateTenantOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Nova Loja / Salão</span>
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-3xl border border-stone-200 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchTenant}
                  onChange={(e) => setSearchTenant(e.target.value)}
                  placeholder="Buscar por nome, slug ou e-mail..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl"
              >
                <option value="ALL">Todos os Planos</option>
                <option value="SIMPLE">Plano Simples (Sem Sinal)</option>
                <option value="COMPLETE">Plano Completo (Com Sinal)</option>
              </select>
              <select
                value={subStatusFilter}
                onChange={(e) => setSubStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl"
              >
                <option value="ALL">Status da Assinatura (Todos)</option>
                <option value="ACTIVE">ACTIVE (Em dia)</option>
                <option value="PAST_DUE">PAST_DUE (Inadimplente)</option>
                <option value="BLOCKED">BLOCKED (Bloqueada)</option>
                <option value="CANCELLED">CANCELLED (Cancelada)</option>
              </select>
              <select
                value={opStatusFilter}
                onChange={(e) => setOpStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl"
              >
                <option value="ALL">Acesso Operacional (Todos)</option>
                <option value="ACTIVE">ACTIVE (Liberado)</option>
                <option value="BLOCKED">BLOCKED (Suspenso)</option>
                <option value="CANCELLED">CANCELLED (Encerrado)</option>
              </select>
            </div>

            {/* Tenant Cards / List */}
            <div className="space-y-3">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-stone-900">{t.name}</h3>
                      <span className="px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px] font-mono">
                        /agendar/{t.slug}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          t.subscription?.plan === 'SIMPLE'
                            ? 'bg-sky-50 text-sky-800 border border-sky-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {t.subscription?.planName}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          t.operationalStatus === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        Acesso: {t.operationalStatus}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          t.subscription?.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        Assinatura: {t.subscription?.status}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          t.enableAdvancedFeatures
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-stone-100 text-stone-600 border border-stone-200'
                        }`}
                      >
                        Recursos Avançados & Fidelidade: {t.enableAdvancedFeatures ? 'ATIVADO' : 'DESATIVADO'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600">
                      Responsável: <strong>{t.owner?.name || 'Não informado'}</strong> ({t.owner?.email || t.email}) ·
                      Telefone: {t.phone || '-'}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
                      <span>
                        Valor Contratado:{' '}
                        <strong className="text-stone-900">{t.subscription?.formattedContractedPrice}/mês</strong>
                      </span>
                      <span>Clientes: {t.metrics?.clientsCount || 0}</span>
                      <span>Serviços: {t.metrics?.servicesCount || 0}</span>
                      <span>Agendamentos: {t.metrics?.appointmentsCount || 0}</span>
                      {t.blockedReason && (
                        <span className="text-rose-600 font-semibold">Motivo Bloqueio: {t.blockedReason}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleAdvancedFeatures(t.id, !t.enableAdvancedFeatures)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        t.enableAdvancedFeatures
                          ? 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                          : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {t.enableAdvancedFeatures
                        ? 'Desativar Recursos Avançados'
                        : 'Ativar Recursos Avançados'}
                    </button>
                    {onInspectTenant && (
                      <button
                        onClick={() => onInspectTenant(t.id)}
                        className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold"
                      >
                        Inspecionar Ambiente
                      </button>
                    )}
                    <button
                      onClick={() => openTenantModal(t.id)}
                      className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                    >
                      Gerenciar Assinatura & Acesso
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: COMMERCIAL PLANS */}
        {activeTab === 'plans' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {plans.map((p) => (
              <div key={p.code} className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                      Código: {p.code}
                    </span>
                    <h3 className="text-xl font-bold text-stone-900 font-serif">{p.name}</h3>
                    <p className="text-xs text-stone-600 mt-1">{p.description}</p>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-[11px] text-stone-500 block">Preço Padrão Mensal</span>
                    <strong className="text-2xl font-bold text-stone-900">
                      {formatBRL(p.defaultPriceCents)}
                    </strong>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5 text-xs">
                  <div className="font-semibold text-stone-800">Permissões técnicas do plano:</div>
                  <div className="flex items-center gap-2 text-stone-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Agenda, clientes, profissionais, serviços e link público exclusivo</span>
                  </div>
                  <div className="flex items-center gap-2 text-stone-600">
                    {p.allowDeposit ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <strong className="text-stone-900">
                          Habilita exigência de Sinal Antecipado via Pix e conciliação financeira
                        </strong>
                      </>
                    ) : (
                      <>
                        <Ban className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Não permite exigir sinal antecipado (agendamento direto sem sinal)</span>
                      </>
                    )}
                  </div>
                </div>

                {editingPlanCode === p.code ? (
                  <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200 space-y-3">
                    <div className="text-xs font-bold text-stone-900">
                      Alterar Preço Padrão para Novas Assinaturas ({p.name})
                    </div>
                    <p className="text-[11px] text-stone-600">
                      Atenção: alterar o preço padrão vale para novas contratações e não sobrescreve silenciosamente o valor já contratado pelas empresas atuais.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                          Novo Valor Mensal (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={planDefaultReais}
                          onChange={(e) => setPlanDefaultReais(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                          Justificativa Comercial
                        </label>
                        <input
                          type="text"
                          value={planDefaultReason}
                          onChange={(e) => setPlanDefaultReason(e.target.value)}
                          placeholder="Ex: Reajuste tabela 2026"
                          className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPlanCode(null)}
                        className="px-3 py-1.5 rounded-xl bg-stone-200 text-stone-700 text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateDefaultPlanPrice(p.code)}
                        className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                      >
                        Salvar Preço Padrão
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingPlanCode(p.code);
                      setPlanDefaultReais((p.defaultPriceCents / 100).toFixed(2));
                    }}
                    className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors"
                  >
                    Configurar Preço Padrão do Plano
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: GLOBAL USERS */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-stone-200 p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  placeholder="Buscar usuário por nome ou e-mail..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl"
              >
                <option value="ALL">Todos os Perfis</option>
                <option value="SUPER_ADMIN">Master Admin (SUPER_ADMIN)</option>
                <option value="OWNER">Proprietários (OWNER)</option>
                <option value="MANAGER">Gerentes (MANAGER)</option>
                <option value="PROFESSIONAL">Profissionais (PROFESSIONAL)</option>
                <option value="CUSTOMER">Clientes Finais (CUSTOMER)</option>
              </select>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
              <div className="divide-y divide-stone-100">
                {users.map((u) => (
                  <div key={u.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-stone-900">{u.name}</strong>
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 text-[10px] font-bold uppercase">
                          {u.primaryRole}
                        </span>
                        {u.isMasterAdmin && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold uppercase">
                            Master Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500">{u.email}</p>
                    </div>
                    <div className="text-xs text-stone-600 space-y-1 sm:text-right">
                      {u.memberships?.length > 0 && (
                        <div>
                          Empresas vinculadas:{' '}
                          {u.memberships.map((m: any) => `${m.tenantName} (${m.role})`).join(', ')}
                        </div>
                      )}
                      {u.customerEstablishments?.length > 0 && (
                        <div className="text-[11px] text-stone-500">
                          Cliente em: {u.customerEstablishments.map((c: any) => c.tenantName).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: GLOBAL AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-stone-900 font-serif">
              Histórico Global de Auditoria Administrativa
            </h2>
            <div className="divide-y divide-stone-100">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-stone-900">{log.action}</span>
                    <span className="text-stone-500"> · Empresa: {log.tenantId} · Ator: {log.userId || 'sistema'}</span>
                    {log.details && (
                      <pre className="mt-1 text-[11px] text-stone-600 bg-stone-50 p-2 rounded-lg overflow-x-auto">
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                  <span className="text-[11px] text-stone-400 tabular-nums shrink-0">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL: TENANT DETAILS & MANAGEMENT */}
      {selectedTenantId && tenantDetails && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-3xl w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-7 shadow-2xl border border-stone-200 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                  Gestão SaaS da Empresa
                </span>
                <h3 className="text-xl font-bold text-stone-900 font-serif">
                  {tenantDetails.tenant?.name || tenantDetails.name}
                </h3>
                <p className="text-xs text-stone-500">
                  ID: {tenantDetails.tenant?.id || tenantDetails.id} · Link Público:{' '}
                  <code>/agendar/{tenantDetails.tenant?.slug || tenantDetails.slug}</code>
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedTenantId(null);
                  setTenantDetails(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold"
              >
                Fechar
              </button>
            </div>

            {modalFeedback && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-medium ${
                  modalFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {modalFeedback.text}
              </div>
            )}

            {/* Section 1: Change Plan */}
            <form onSubmit={handleChangePlan} className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="text-xs font-bold text-stone-900">1. Plano Comercial da Empresa</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">Plano</label>
                  <select
                    value={newPlan}
                    onChange={(e) => setNewPlan(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                  >
                    <option value="SIMPLE">Plano Simples — Agendamento (Sem Sinal)</option>
                    <option value="COMPLETE">Plano Completo — Agendamento com Sinal Pix</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">Motivo da Alteração</label>
                  <input
                    type="text"
                    required
                    value={planReason}
                    onChange={(e) => setPlanReason(e.target.value)}
                    placeholder="Ex: Upgrade solicitado pela proprietária"
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyDefaultPriceOnPlanChange}
                    onChange={(e) => setApplyDefaultPriceOnPlanChange(e.target.checked)}
                    className="accent-rose-600 rounded"
                  />
                  <span>Atualizar mensalidade para o valor padrão do novo plano</span>
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                >
                  Salvar Plano
                </button>
              </div>
            </form>

            {/* Section 2: Custom Contracted Price */}
            <form
              onSubmit={handleUpdateContractedPrice}
              className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3"
            >
              <div className="text-xs font-bold text-stone-900">
                2. Valor Mensal Contratado (Atual: {formatBRL(tenantDetails.subscription?.contractedPriceCents)})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Novo Valor Contratado (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={customPriceReais}
                    onChange={(e) => setCustomPriceReais(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Motivo / Negociação Comercial (obrigatório)
                  </label>
                  <input
                    type="text"
                    required
                    value={priceReason}
                    onChange={(e) => setPriceReason(e.target.value)}
                    placeholder="Ex: Condição comercial especial de parceria"
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                >
                  Atualizar Valor Contratado
                </button>
              </div>
            </form>

            {/* Section 3: Delinquency, Blocking & Unblocking */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="text-xs font-bold text-stone-900">
                3. Controle de Inadimplência e Bloqueio Operacional (Status Atual:{' '}
                {tenantDetails.tenant?.status || tenantDetails.operationalStatus} /{' '}
                {tenantDetails.subscription?.status})
              </div>
              <p className="text-[11px] text-stone-600">
                O bloqueio suspende operações administrativas de escrita e bloqueia novos agendamentos online em{' '}
                <code>/agendar/{tenantDetails.tenant?.slug || tenantDetails.slug}</code>, preservando todos os dados históricos.
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Justificativa Administrativa Obrigatória
                </label>
                <input
                  type="text"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Informe o motivo do bloqueio, desbloqueio, atraso ou cancelamento..."
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('ACTIVE', 'ACTIVE')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Ativar / Desbloquear Empresa</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('PAST_DUE', 'ACTIVE')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Marcar Inadimplente (PAST_DUE)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('BLOCKED', 'BLOCKED')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Bloquear Acesso da Empresa</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('CANCELLED', 'CANCELLED')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-700 hover:bg-stone-600 text-white text-xs font-semibold"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancelar Assinatura</span>
                </button>
              </div>
            </div>

            {/* Section 3B: Advanced Features & Loyalty Toggle */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-900">
                      Recursos Avançados & Programa de Fidelidade
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        tenantDetails.tenant?.enableAdvancedFeatures || tenantDetails.enableAdvancedFeatures
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-stone-200 text-stone-700'
                      }`}
                    >
                      {tenantDetails.tenant?.enableAdvancedFeatures || tenantDetails.enableAdvancedFeatures
                        ? 'ATIVADO'
                        : 'DESATIVADO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 mt-1">
                    Quando desativado, a aba <strong>Recursos Avançados</strong> fica oculta no painel do lojista e a aba <strong>Fidelidade</strong> fica oculta no painel da cliente. Você pode ativar ou desativar a qualquer momento.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleToggleAdvancedFeatures(
                      selectedTenantId,
                      !(tenantDetails.tenant?.enableAdvancedFeatures || tenantDetails.enableAdvancedFeatures)
                    )
                  }
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                    tenantDetails.tenant?.enableAdvancedFeatures || tenantDetails.enableAdvancedFeatures
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {tenantDetails.tenant?.enableAdvancedFeatures || tenantDetails.enableAdvancedFeatures
                    ? 'Desativar Recursos Avançados e Fidelidade'
                    : 'Ativar Recursos Avançados e Fidelidade'}
                </button>
              </div>
            </div>

            {/* Section 4: SaaS Invoices */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="text-xs font-bold text-stone-900">
                4. Cobranças da Assinatura SaaS (Separadas dos Pagamentos Pix de Clientes)
              </div>
              <form onSubmit={handleCreateInvoice} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={invoiceAmountReais}
                  onChange={(e) => setInvoiceAmountReais(e.target.value)}
                  placeholder="Valor (R$)"
                  className="px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                />
                <input
                  type="date"
                  required
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold"
                >
                  + Registrar Cobrança SaaS
                </button>
              </form>

              <div className="space-y-2 pt-2">
                {(tenantDetails.invoices || []).map((inv: any) => (
                  <div
                    key={inv.id}
                    className="p-3 rounded-xl bg-white border border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <strong>{formatBRL(inv.amountCents)}</strong> · Vencimento:{' '}
                      {new Date(inv.dueDate).toLocaleDateString('pt-BR')} ·{' '}
                      <span className="font-semibold">{inv.status}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {inv.status !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => handleMarkInvoice(inv.id, 'PAID')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-semibold"
                        >
                          Marcar Paga
                        </button>
                      )}
                      {inv.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => handleMarkInvoice(inv.id, 'OVERDUE')}
                          className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-semibold"
                        >
                          Marcar Vencida
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CADASTRAR NOVA LOJA (EXCLUSIVO SUPER ADMIN) */}
      {isCreateTenantOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-stone-200 my-8 space-y-6 max-h-[92vh] overflow-y-auto">
            {!createdTenantResult ? (
              <>
                <div className="flex items-start justify-between border-b border-stone-100 pb-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wider">
                      <Shield className="w-3 h-3" />
                      <span>Exclusivo Super Admin</span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900 font-serif">
                      Cadastrar Nova Loja / Estabelecimento
                    </h3>
                    <p className="text-xs text-stone-500">
                      Credencie a nova empresa na plataforma e gere os acessos do proprietário
                    </p>
                  </div>
                  <button
                    onClick={() => setIsCreateTenantOpen(false)}
                    className="text-xs text-stone-400 hover:text-stone-700 p-1.5 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                {createTenantError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{createTenantError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateTenantSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        Nome do Estabelecimento / Loja *
                      </label>
                      <input
                        type="text"
                        required
                        value={newTenantForm.businessName}
                        onChange={(e) => handleAutoSlug(e.target.value)}
                        placeholder="Ex: Studio Bella Donna Nails"
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        Link Público da Loja (Slug URL) *
                      </label>
                      <div className="flex rounded-xl shadow-xs">
                        <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-stone-200 bg-stone-100 text-stone-500 text-xs font-mono">
                          /agendar/
                        </span>
                        <input
                          type="text"
                          required
                          value={newTenantForm.slug}
                          onChange={(e) =>
                            setNewTenantForm((prev) => ({
                              ...prev,
                              slug: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, '-'),
                            }))
                          }
                          placeholder="studio-bella-donna"
                          className="w-full px-3 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 font-mono"
                        />
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1">
                        Este é o link que o dono enviará aos clientes para agendamento online e cadastro de conta.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        Nome do(a) Proprietário(a) *
                      </label>
                      <input
                        type="text"
                        required
                        value={newTenantForm.ownerName}
                        onChange={(e) => setNewTenantForm({ ...newTenantForm, ownerName: e.target.value })}
                        placeholder="Ex: Juliana Santos"
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        WhatsApp / Telefone *
                      </label>
                      <input
                        type="text"
                        required
                        value={newTenantForm.ownerPhone}
                        onChange={(e) => setNewTenantForm({ ...newTenantForm, ownerPhone: e.target.value })}
                        placeholder="(11) 98888-7777"
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        E-mail de Acesso do Dono *
                      </label>
                      <input
                        type="email"
                        required
                        value={newTenantForm.ownerEmail}
                        onChange={(e) => setNewTenantForm({ ...newTenantForm, ownerEmail: e.target.value })}
                        placeholder="juliana@belladonna.com.br"
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        Senha Inicial do Dono *
                      </label>
                      <input
                        type="text"
                        required
                        value={newTenantForm.ownerPassword}
                        onChange={(e) => setNewTenantForm({ ...newTenantForm, ownerPassword: e.target.value })}
                        placeholder="123456"
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        Plano Comercial Contratado
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            newTenantForm.plan === 'COMPLETE'
                              ? 'bg-rose-50/60 border-rose-500 shadow-xs'
                              : 'bg-stone-50 border-stone-200 hover:bg-stone-100/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name="plan"
                            checked={newTenantForm.plan === 'COMPLETE'}
                            onChange={() => setNewTenantForm({ ...newTenantForm, plan: 'COMPLETE' })}
                            className="sr-only"
                          />
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-stone-900 block">
                              Plano Completo (Recomendado)
                            </span>
                            <span className="text-[11px] text-stone-600 block">
                              Exigência de sinal via Pix, política de cancelamento CDC e recursos avançados.
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            newTenantForm.plan === 'SIMPLE'
                              ? 'bg-rose-50/60 border-rose-500 shadow-xs'
                              : 'bg-stone-50 border-stone-200 hover:bg-stone-100/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name="plan"
                            checked={newTenantForm.plan === 'SIMPLE'}
                            onChange={() => setNewTenantForm({ ...newTenantForm, plan: 'SIMPLE' })}
                            className="sr-only"
                          />
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-stone-900 block">
                              Plano Simples
                            </span>
                            <span className="text-[11px] text-stone-600 block">
                              Agendamentos confirmados imediatamente sem cobrança de sinal antecipado.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                        Endereço Completo (Opcional)
                      </label>
                      <input
                        type="text"
                        value={newTenantForm.address}
                        onChange={(e) => setNewTenantForm({ ...newTenantForm, address: e.target.value })}
                        placeholder="Rua Oscar Freire, 1000 - Jardins, São Paulo - SP"
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCreateTenantOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-semibold hover:bg-stone-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creatingTenant}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md disabled:opacity-50 flex items-center gap-2"
                    >
                      {creatingTenant ? 'Cadastrando Loja...' : 'Confirmar e Cadastrar Loja'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* Success Screen with Copy Links */
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-stone-900 font-serif">
                    Loja Credenciada com Sucesso!
                  </h3>
                  <p className="text-xs text-stone-600 max-w-md mx-auto">
                    O estabelecimento <strong>{createdTenantResult.tenant?.name}</strong> foi criado e os acessos já estão ativos.
                  </p>
                </div>

                <div className="space-y-4 bg-stone-50 p-4 sm:p-5 rounded-2xl border border-stone-200 text-xs">
                  {/* Link Público para Clientes */}
                  <div className="space-y-1.5">
                    <span className="font-bold text-stone-800 flex items-center justify-between">
                      <span>1. Link Público da Loja (Para Clientes)</span>
                      <span className="text-[10px] text-rose-600 font-mono">Envie este link para as clientes</span>
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/agendar/${createdTenantResult.tenant?.slug}`}
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-mono select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(
                            `${window.location.origin}/agendar/${createdTenantResult.tenant?.slug}`
                          );
                          setCopiedPublicLink(true);
                          setTimeout(() => setCopiedPublicLink(false), 2000);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs shrink-0 flex items-center gap-1.5"
                      >
                        {copiedPublicLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPublicLink ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Link Secreto do Lojista */}
                  <div className="space-y-1.5 pt-2 border-t border-stone-200">
                    <span className="font-bold text-stone-800 flex items-center justify-between">
                      <span>2. Link de Acesso do Lojista (Painel Administrativo)</span>
                      <span className="text-[10px] text-amber-600 font-mono">Acesso exclusivo do salão</span>
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/acesso-lojista`}
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-mono select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(`${window.location.origin}/acesso-lojista`);
                          setCopiedOwnerLink(true);
                          setTimeout(() => setCopiedOwnerLink(false), 2000);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs shrink-0 flex items-center gap-1.5"
                      >
                        {copiedOwnerLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedOwnerLink ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Credenciais do Dono */}
                  <div className="p-3 bg-white rounded-xl border border-stone-200 text-stone-700 space-y-1">
                    <div className="font-semibold text-stone-900">Credenciais cadastradas para o lojista:</div>
                    <div><strong>E-mail:</strong> {createdTenantResult.owner?.email}</div>
                    <div><strong>Senha inicial:</strong> {newTenantForm.ownerPassword}</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const msg = `Olá ${createdTenantResult.owner?.name}! Seu salão *${createdTenantResult.tenant?.name}* foi credenciado com sucesso no Agenda Beauty! 🌟\n\n📌 *Link da sua loja para suas clientes agendarem:*\n${window.location.origin}/agendar/${createdTenantResult.tenant?.slug}\n\n🔐 *Seu acesso ao painel administrativo do salão:*\n${window.location.origin}/acesso-lojista\n*E-mail:* ${createdTenantResult.owner?.email}\n*Senha inicial:* ${newTenantForm.ownerPassword}`;
                      navigator.clipboard?.writeText(msg);
                      setCopiedWelcomeMessage(true);
                      setTimeout(() => setCopiedWelcomeMessage(false), 2500);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {copiedWelcomeMessage ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                    <span>{copiedWelcomeMessage ? 'Mensagem Copiada!' : 'Copiar Mensagem Pronta para WhatsApp'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateTenantOpen(false);
                      setCreatedTenantResult(null);
                    }}
                    className="py-3 px-5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold shadow-sm"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
