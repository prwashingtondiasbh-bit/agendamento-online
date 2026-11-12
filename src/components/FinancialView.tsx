import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  FileText,
  Download,
  Plus,
  Filter,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Info,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../App';
import { Professional, Service } from '../types';

interface FinancialViewProps {
  professionals: Professional[];
  services: Service[];
  userRole: string;
  requireDeposit?: boolean;
}

export type FinancialSubTab =
  | 'overview'
  | 'receipts'
  | 'receivables'
  | 'expenses'
  | 'payables'
  | 'ledger'
  | 'commissions'
  | 'refunds'
  | 'reports'
  | 'exports';

export const formatCurrencyBrl = (cents: number | null | undefined) => {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Math.round(Number(cents)) / 100
  );
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  ALUGUEL: 'Aluguel',
  AGUA_ENERGIA: 'Água e Energia',
  INTERNET_TELEFONE: 'Internet e Telefone',
  MATERIAIS_PRODUTOS: 'Materiais e Produtos',
  EQUIPAMENTOS: 'Equipamentos',
  MANUTENCAO: 'Manutenção',
  MARKETING: 'Marketing',
  TAXAS_PLATAFORMA: 'Taxas de Plataforma ou Pagamento',
  IMPOSTOS: 'Impostos e Encargos',
  OUTRAS: 'Outras Despesas Operacionais',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de Crédito',
  DEBIT_CARD: 'Cartão de Débito',
  CASH: 'Dinheiro',
  TRANSFER: 'Transferência',
  BOLETO: 'Boleto',
  OUTRO: 'Outro',
};

export const FinancialView: React.FC<FinancialViewProps> = ({
  professionals,
  services,
  userRole,
  requireDeposit = true,
}) => {
  const isProfessionalOnly = userRole === 'PROFESSIONAL';
  const [subTab, setSubTab] = useState<FinancialSubTab>(
    isProfessionalOnly ? 'commissions' : 'overview'
  );

  // Period Filter State
  const [periodPreset, setPeriodPreset] = useState<string>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );

  // Data States
  const [dashboard, setDashboard] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any>({ items: [], summary: {} });
  const [commissionRules, setCommissionRules] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any>({ items: [], summary: {} });
  const [refunds, setRefunds] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Sub-filters
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<string>('ALL');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('ALL');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>('ALL');
  const [commissionProfFilter, setCommissionProfFilter] = useState<string>('ALL');
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<string>('ALL');
  const [reportProfFilter, setReportProfFilter] = useState<string>('ALL');
  const [reportServiceFilter, setReportServiceFilter] = useState<string>('ALL');

  // Modals State
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    category: 'MATERIAIS_PRODUTOS',
    amountReais: '',
    competenceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    status: 'PENDING',
    paymentMethod: 'PIX',
    notes: '',
  });

  const [payingExpense, setPayingExpense] = useState<any | null>(null);
  const [payExpenseMethod, setPayExpenseMethod] = useState<string>('PIX');
  const [payExpenseConfirmed, setPayExpenseConfirmed] = useState<boolean>(false);

  const [reversingExpense, setReversingExpense] = useState<any | null>(null);
  const [reverseExpenseReason, setReverseExpenseReason] = useState<string>('');

  const [receivingBalanceItem, setReceivingBalanceItem] = useState<any | null>(null);
  const [receiveBalanceMethod, setReceiveBalanceMethod] = useState<string>('PIX');
  const [receiveBalanceAmountReais, setReceiveBalanceAmountReais] = useState<string>('');
  const [receiveBalanceFeeReais, setReceiveBalanceFeeReais] = useState<string>('0');

  const [showAdjustmentModal, setShowAdjustmentModal] = useState<boolean>(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: 'INFLOW',
    amountReais: '',
    category: 'AJUSTE_ADMINISTRATIVO',
    description: '',
    paymentMethod: 'CASH',
    justification: '',
  });

  const [reversingLedgerTx, setReversingLedgerTx] = useState<any | null>(null);
  const [reverseLedgerJustification, setReverseLedgerJustification] = useState<string>('');

  const [showRuleModal, setShowRuleModal] = useState<boolean>(false);
  const [ruleForm, setRuleForm] = useState({
    scope: 'PROFESSIONAL',
    professionalId: professionals[0]?.id || '',
    serviceId: services[0]?.id || '',
    percentage: '40',
    basis: 'COMPLETED_SERVICE_VALUE',
  });

  const buildPeriodQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('preset', periodPreset);
    if (periodPreset === 'CUSTOM') {
      params.set('startDate', customStartDate);
      params.set('endDate', customEndDate);
    }
    return params.toString();
  }, [periodPreset, customStartDate, customEndDate]);

  const loadFinancialData = useCallback(async () => {
    setLoading(true);
    try {
      const pQuery = buildPeriodQuery();

      if (isProfessionalOnly) {
        const comRes = await apiFetch(`/api/v1/financial/commissions?${pQuery}`);
        const comJson = await comRes.json().catch(() => ({}));
        if (comJson.success) {
          setCommissions({ items: comJson.data || [], summary: comJson.summary || {} });
        }
        setLoading(false);
        return;
      }

      const [
        dashRes,
        recRes,
        arRes,
        expRes,
        ledRes,
        rulesRes,
        comRes,
        refRes,
        repRes,
      ] = await Promise.all([
        apiFetch(`/api/v1/financial/dashboard?${pQuery}`),
        apiFetch(`/api/v1/financial/receipts?status=${receiptStatusFilter}`),
        apiFetch(`/api/v1/financial/accounts-receivable`),
        apiFetch(
          `/api/v1/financial/expenses?category=${expenseCategoryFilter}&status=${expenseStatusFilter}`
        ),
        apiFetch(`/api/v1/financial/ledger`),
        apiFetch(`/api/v1/financial/commission-rules`),
        apiFetch(
          `/api/v1/financial/commissions?professionalId=${commissionProfFilter}&status=${commissionStatusFilter}`
        ),
        apiFetch(`/api/v1/financial/refunds`),
        apiFetch(
          `/api/v1/financial/reports?${pQuery}&professionalId=${reportProfFilter}&serviceId=${reportServiceFilter}`
        ),
      ]);

      const [
        dashJson,
        recJson,
        arJson,
        expJson,
        ledJson,
        rulesJson,
        comJson,
        refJson,
        repJson,
      ] = await Promise.all([
        dashRes.json().catch(() => ({})),
        recRes.json().catch(() => ({})),
        arRes.json().catch(() => ({})),
        expRes.json().catch(() => ({})),
        ledRes.json().catch(() => ({})),
        rulesRes.json().catch(() => ({})),
        comRes.json().catch(() => ({})),
        refRes.json().catch(() => ({})),
        repRes.json().catch(() => ({})),
      ]);

      if (dashJson.success) setDashboard(dashJson.data);
      if (recJson.success) setReceipts(recJson.data || []);
      if (arJson.success) setReceivables(arJson.data || []);
      if (expJson.success) setExpenses(expJson.data || []);
      if (ledJson.success) setLedger({ items: ledJson.data || [], summary: ledJson.summary || {} });
      if (rulesJson.success) setCommissionRules(rulesJson.data || []);
      if (comJson.success) setCommissions({ items: comJson.data || [], summary: comJson.summary || {} });
      if (refJson.success) setRefunds(refJson.data || []);
      if (repJson.success) setReports(repJson.data);
    } catch (e) {
      console.error('Failed to load financial data:', e);
    } finally {
      setLoading(false);
    }
  }, [
    buildPeriodQuery,
    isProfessionalOnly,
    receiptStatusFilter,
    expenseCategoryFilter,
    expenseStatusFilter,
    commissionProfFilter,
    commissionStatusFilter,
    reportProfFilter,
    reportServiceFilter,
  ]);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Handlers
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round(Number(expenseForm.amountReais.replace(',', '.')) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      showToast('error', 'Informe um valor válido maior que zero.');
      return;
    }
    const res = await apiFetch('/api/v1/financial/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: expenseForm.description,
        category: expenseForm.category,
        amountCents,
        competenceDate: expenseForm.competenceDate,
        dueDate: expenseForm.dueDate,
        status: expenseForm.status,
        paymentMethod: expenseForm.paymentMethod,
        notes: expenseForm.notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast('success', 'Despesa registrada com sucesso!');
      setShowExpenseModal(false);
      setExpenseForm({
        description: '',
        category: 'MATERIAIS_PRODUTOS',
        amountReais: '',
        competenceDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        status: 'PENDING',
        paymentMethod: 'PIX',
        notes: '',
      });
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao registrar despesa');
    }
  };

  const handlePayExpenseConfirm = async () => {
    if (!payingExpense) return;
    if (!payExpenseConfirmed) {
      showToast('error', 'Confirme explicitamente que a despesa foi paga antes de prosseguir.');
      return;
    }
    const res = await apiFetch(`/api/v1/financial/expenses/${payingExpense.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethod: payExpenseMethod,
        confirmedByStaff: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast('success', 'Pagamento da despesa confirmado e registrado no caixa!');
      setPayingExpense(null);
      setPayExpenseConfirmed(false);
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao confirmar pagamento da despesa');
    }
  };

  const handleReverseExpenseConfirm = async () => {
    if (!reversingExpense) return;
    const res = await apiFetch(`/api/v1/financial/expenses/${reversingExpense.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reverseExpenseReason }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast('success', 'Despesa estornada/cancelada com histórico preservado!');
      setReversingExpense(null);
      setReverseExpenseReason('');
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao estornar despesa');
    }
  };

  const handleRecordBalancePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingBalanceItem) return;
    const amountCents = Math.round(Number(receiveBalanceAmountReais.replace(',', '.')) * 100);
    const feeCents = Math.round(Number((receiveBalanceFeeReais || '0').replace(',', '.')) * 100);
    const res = await apiFetch('/api/v1/financial/receipts/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: receivingBalanceItem.appointmentId,
        amountCents,
        paymentType: 'BALANCE',
        paymentMethod: receiveBalanceMethod,
        feeCents: feeCents > 0 ? feeCents : 0,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast('success', 'Recebimento de saldo confirmado e lançado no caixa!');
      setReceivingBalanceItem(null);
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao registrar recebimento de saldo');
    }
  };

  const handleCreateManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round(Number(adjustmentForm.amountReais.replace(',', '.')) * 100);
    const res = await apiFetch('/api/v1/financial/ledger/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: adjustmentForm.type,
        amountCents,
        category: adjustmentForm.category,
        description: adjustmentForm.description,
        paymentMethod: adjustmentForm.paymentMethod,
        justification: adjustmentForm.justification,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast('success', 'Ajuste administrativo de caixa registrado com auditoria!');
      setShowAdjustmentModal(false);
      setAdjustmentForm({
        type: 'INFLOW',
        amountReais: '',
        category: 'AJUSTE_ADMINISTRATIVO',
        description: '',
        paymentMethod: 'CASH',
        justification: '',
      });
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao registrar ajuste');
    }
  };

  const handleReverseLedgerConfirm = async () => {
    if (!reversingLedgerTx) return;
    const res = await apiFetch(`/api/v1/financial/ledger/${reversingLedgerTx.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ justification: reverseLedgerJustification }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast('success', 'Lançamento estornado com registro compensatório no livro de caixa!');
      setReversingLedgerTx(null);
      setReverseLedgerJustification('');
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao estornar lançamento');
    }
  };

  const handleSaveCommissionRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/v1/financial/commission-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: ruleForm.scope,
        professionalId:
          ruleForm.scope === 'PROFESSIONAL' || ruleForm.scope === 'PROFESSIONAL_SERVICE'
            ? ruleForm.professionalId
            : null,
        serviceId:
          ruleForm.scope === 'SERVICE' || ruleForm.scope === 'PROFESSIONAL_SERVICE'
            ? ruleForm.serviceId
            : null,
        percentage: Number(ruleForm.percentage),
        basis: ruleForm.basis,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast('success', 'Regra de comissão salva e aplicada!');
      setShowRuleModal(false);
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao salvar regra de comissão');
    }
  };

  const handleCommissionAction = async (
    commissionId: string,
    action: 'APPROVE' | 'PAY' | 'CANCEL'
  ) => {
    const res = await apiFetch(`/api/v1/financial/commissions/${commissionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        paymentMethod: 'PIX',
        reason:
          action === 'CANCEL'
            ? 'Cancelada manualmente pelo administrador financeiro'
            : 'Confirmada pelo painel financeiro',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      showToast(
        'success',
        action === 'APPROVE'
          ? 'Comissão aprovada!'
          : action === 'PAY'
          ? 'Comissão marcada como paga e lançada no caixa!'
          : 'Comissão cancelada!'
      );
      loadFinancialData();
    } else {
      showToast('error', json.error || 'Erro ao atualizar comissão');
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const pQuery = buildPeriodQuery();
      const res = await apiFetch(`/api/v1/financial/export/csv?${pQuery}`);
      if (!res.ok) {
        showToast('error', 'Não foi possível exportar o arquivo CSV.');
        return;
      }
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('success', 'Arquivo CSV exportado com sucesso!');
    } catch (e) {
      showToast('error', 'Falha na exportação CSV.');
    }
  };

  const [printableHtmlPreview, setPrintableHtmlPreview] = useState<string | null>(null);

  const handleGeneratePrintableReport = async () => {
    try {
      const pQuery = buildPeriodQuery();
      const res = await apiFetch(`/api/v1/financial/export/pdf?${pQuery}`);
      if (!res.ok) {
        showToast('error', 'Não foi possível gerar o relatório imprimível.');
        return;
      }
      const html = await res.text();
      setPrintableHtmlPreview(html);
      showToast('success', 'Relatório gerado para impressão/PDF!');
    } catch (e) {
      showToast('error', 'Erro ao gerar relatório PDF.');
    }
  };

  const navTabs: Array<{ id: FinancialSubTab; label: string; icon: any; ownerOnly?: boolean; depositOnly?: boolean }> = [
    { id: 'overview', label: '1. Visão financeira geral', icon: Wallet, ownerOnly: true },
    { id: 'receipts', label: '2. Receitas e recebimentos', icon: TrendingUp, ownerOnly: true },
    { id: 'receivables', label: '3. Contas a receber', icon: Clock, ownerOnly: true },
    { id: 'expenses', label: '4. Despesas', icon: TrendingDown, ownerOnly: true },
    { id: 'payables', label: '5. Contas a pagar', icon: AlertCircle, ownerOnly: true },
    { id: 'ledger', label: '6. Caixa e movimentações', icon: Scale, ownerOnly: true },
    { id: 'commissions', label: '7. Comissões', icon: Award, ownerOnly: false },
    { id: 'refunds', label: '8. Reembolsos', icon: RotateCcw, ownerOnly: true, depositOnly: true },
    { id: 'reports', label: '9. Relatórios', icon: FileText, ownerOnly: true },
    { id: 'exports', label: '10. Exportação de dados', icon: Download, ownerOnly: true },
  ];

  const visibleTabs = navTabs.filter(
    (t) => (!isProfessionalOnly || !t.ownerOnly) && (!t.depositOnly || requireDeposit)
  );
  const ind = dashboard?.indicators || {};
  const formulas = dashboard?.formulas || {};
  const payableExpenses = expenses.filter((e: any) => e.status === 'PENDING');

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline ml-4">
            Fechar
          </button>
        </div>
      )}

      {/* Top Filter Bar & Period Selector */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-rose-500" />
            <span>Módulo Financeiro & Controle de Caixa</span>
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Valores armazenados e calculados em centavos inteiros no servidor, separando vendas, recebimentos confirmados, saldos pendentes, despesas pagas e reembolsos concluídos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'TODAY', label: 'Hoje' },
            { id: 'LAST_7_DAYS', label: 'Últimos 7 dias' },
            { id: 'THIS_MONTH', label: 'Este mês' },
            { id: 'LAST_MONTH', label: 'Mês anterior' },
            { id: 'CUSTOM', label: 'Personalizado' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodPreset === p.id
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {p.label}
            </button>
          ))}

          {periodPreset === 'CUSTOM' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-stone-300 text-xs"
              />
              <span className="text-xs text-stone-400">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-stone-300 text-xs"
              />
            </div>
          )}

          <button
            onClick={loadFinancialData}
            className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
            title="Atualizar dados financeiros"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 10 Financial Sections Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                active
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: VISÃO FINANCEIRA GERAL */}
      {subTab === 'overview' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 uppercase">
                <span>Recebimentos Confirmados</span>
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-stone-900 mt-2">
                {formatCurrencyBrl(ind.confirmedReceiptsCents)}
              </p>
              <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
                {formulas.confirmedReceipts}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-700 uppercase">
                <span>Valores Pendentes (A Receber)</span>
                <Clock className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-stone-900 mt-2">
                {formatCurrencyBrl(ind.pendingReceivablesCents)}
              </p>
              <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
                {formulas.pendingReceivables}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-rose-700 uppercase">
                <span>Despesas Pagas no Período</span>
                <ArrowDownRight className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-stone-900 mt-2">
                {formatCurrencyBrl(ind.paidExpensesCents)}
              </p>
              <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
                {formulas.paidExpenses}
              </p>
            </div>

            <div className="bg-stone-900 text-white rounded-2xl p-5 border border-stone-800 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-rose-300 uppercase">
                <span>Resultado Financeiro Estimado</span>
                <Scale className="w-4 h-4" />
              </div>
              <p
                className={`text-2xl font-bold mt-2 ${
                  ind.estimatedFinancialResultCents >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatCurrencyBrl(ind.estimatedFinancialResultCents)}
              </p>
              <p className="text-[11px] text-stone-300 mt-2 leading-relaxed">
                {formulas.estimatedFinancialResult}
              </p>
            </div>
          </div>

          {/* Secondary Row of Mandatory Indicators */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${requireDeposit ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
            <div className="bg-white rounded-xl p-4 border border-stone-200">
              <span className="text-xs font-medium text-stone-500">
                Despesas Pendentes (Contas a Pagar)
              </span>
              <p className="text-lg font-bold text-stone-900 mt-1">
                {formatCurrencyBrl(ind.pendingExpensesCents)}
              </p>
              {ind.overdueExpensesCents > 0 && (
                <span className="inline-block mt-1 text-[11px] font-semibold text-rose-600">
                  Vencidas: {formatCurrencyBrl(ind.overdueExpensesCents)}
                </span>
              )}
            </div>

            {requireDeposit && (
              <div className="bg-white rounded-xl p-4 border border-stone-200">
                <span className="text-xs font-medium text-stone-500">
                  Reembolsos Concluídos no Período
                </span>
                <p className="text-lg font-bold text-stone-900 mt-1">
                  {formatCurrencyBrl(ind.completedRefundsCents)}
                </p>
                <span className="block mt-1 text-[11px] text-stone-500">
                  Em análise/processamento: {formatCurrencyBrl(ind.pendingRefundsCents)}
                </span>
              </div>
            )}

            <div className="bg-white rounded-xl p-4 border border-stone-200">
              <span className="text-xs font-medium text-stone-500">
                Comissões Calculadas vs. Pagas
              </span>
              <p className="text-lg font-bold text-stone-900 mt-1">
                Calc.: {formatCurrencyBrl(ind.calculatedCommissionsCents)}
              </p>
              <span className="block mt-1 text-[11px] text-emerald-700 font-medium">
                Pagas: {formatCurrencyBrl(ind.paidCommissionsCents)}
              </span>
            </div>

            <div className="bg-white rounded-xl p-4 border border-stone-200">
              <span className="text-xs font-medium text-stone-500">
                Ticket Médio & Atendimentos Concluídos
              </span>
              <p className="text-lg font-bold text-stone-900 mt-1">
                {formatCurrencyBrl(ind.averageTicketCents)}{' '}
                <span className="text-xs font-normal text-stone-500">
                  ({ind.completedAppointmentsCount} concluídos)
                </span>
              </p>
              <span className="block mt-1 text-[11px] text-stone-500">
                Vendas concluídas (competência): {formatCurrencyBrl(ind.completedServicesSalesCents)}
              </span>
            </div>
          </div>

          {requireDeposit && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs text-stone-600 flex items-start gap-3">
              <Info className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
              <div>
                <strong>Regra Anti-Duplicidade (Sinal e Saldo):</strong> Quando um serviço custa R$ 100,00 com sinal de R$ 30,00 confirmado e saldo de R$ 70,00 pendente, o sistema contabiliza exatamente R$ 30,00 em Recebimentos Confirmados e R$ 70,00 em Contas a Receber, jamais somando o total do serviço (R$ 100,00) junto com os pagamentos parciais.
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: RECEITAS E RECEBIMENTOS */}
      {subTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-stone-900">Receitas e Recebimentos</h3>
              <p className="text-xs text-stone-500">
                Apenas transações com status APROVADO entram como receita efetivamente recebida. Pagamentos Pix do provedor pendentes não podem ser aprovados manualmente sem confirmação do provedor.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={receiptStatusFilter}
                onChange={(e) => setReceiptStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 min-h-[40px] rounded-xl border border-stone-300 text-xs bg-white"
              >
                <option value="ALL">Todos os status</option>
                <option value="APPROVED">Confirmados (APPROVED)</option>
                <option value="PENDING">Pendentes (PENDING)</option>
                <option value="REJECTED">Recusados (REJECTED)</option>
                <option value="EXPIRED">Expirados (EXPIRED)</option>
                <option value="REFUNDED">Reembolsados (REFUNDED)</option>
              </select>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-stone-100 -mx-4 px-4">
            {receipts.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                Nenhum recebimento encontrado para os filtros selecionados.
              </div>
            ) : (
              receipts.map((r: any) => (
                <div key={r.id} className="py-3.5 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 truncate">{r.clientName}</p>
                      <p className="text-stone-600 truncate">{r.serviceName}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {new Date(r.approvedAt || r.createdAt).toLocaleString('pt-BR')} • {r.professionalName}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${
                        r.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : r.status === 'PENDING'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-100 tabular-nums">
                    <div>
                      <span className="text-[10px] text-stone-500 block">Bruto</span>
                      <strong className="text-stone-900">{formatCurrencyBrl(r.amountCents)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block">Taxa</span>
                      <span className="text-stone-600">
                        {r.feeAvailable ? formatCurrencyBrl(r.feeCents) : '—'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-stone-500 block">Líquido</span>
                      <strong className="text-emerald-700">
                        {r.netAmountCents !== null
                          ? formatCurrencyBrl(r.netAmountCents)
                          : formatCurrencyBrl(r.amountCents)}
                      </strong>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-stone-500">
                    <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-medium">
                      {r.paymentType === 'DEPOSIT'
                        ? 'Sinal'
                        : r.paymentType === 'BALANCE'
                        ? 'Saldo Restante'
                        : 'Integral'}
                    </span>
                    <span className="truncate max-w-[180px]">
                      {PAYMENT_METHOD_LABELS[r.paymentMethod] || r.paymentMethod}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase">
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Cliente / Serviço</th>
                  <th className="py-3 px-3">Profissional</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Método / Ref.</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Valor Bruto</th>
                  <th className="py-3 px-3 text-right">Taxa</th>
                  <th className="py-3 px-3 text-right">Valor Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-stone-400">
                      Nenhum recebimento encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  receipts.map((r: any) => (
                    <tr key={r.id} className="hover:bg-stone-50">
                      <td className="py-3 px-3 whitespace-nowrap">
                        {new Date(r.approvedAt || r.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-stone-900">{r.clientName}</div>
                        <div className="text-stone-500">{r.serviceName}</div>
                      </td>
                      <td className="py-3 px-3">{r.professionalName}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-medium">
                          {r.paymentType === 'DEPOSIT'
                            ? 'Sinal'
                            : r.paymentType === 'BALANCE'
                            ? 'Saldo Restante'
                            : 'Integral'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div>{PAYMENT_METHOD_LABELS[r.paymentMethod] || r.paymentMethod}</div>
                        <div className="text-[10px] text-stone-400">{r.externalReference}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            r.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold">
                        {formatCurrencyBrl(r.amountCents)}
                      </td>
                      <td className="py-3 px-3 text-right text-stone-500">
                        {r.feeAvailable ? formatCurrencyBrl(r.feeCents) : 'Indisponível'}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-stone-900">
                        {r.netAmountCents !== null
                          ? formatCurrencyBrl(r.netAmountCents)
                          : formatCurrencyBrl(r.amountCents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: CONTAS A RECEBER */}
      {subTab === 'receivables' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 space-y-4">
          <div>
            <h3 className="font-bold text-stone-900">Contas a Receber (Saldos Pendentes de Clientes)</h3>
            <p className="text-xs text-stone-500">
              {requireDeposit
                ? 'Lista agendamentos ativos ou concluídos que possuem sinal pago ou reserva confirmada e ainda têm saldo restante a ser recebido. Agendamentos cancelados ou expirados não entram nesta lista.'
                : 'Lista agendamentos confirmados ou concluídos que ainda possuem valor pendente de recebimento. Agendamentos cancelados não entram nesta lista.'}
            </p>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-stone-100 -mx-4 px-4">
            {receivables.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                Não há saldos pendentes de clientes no momento.
              </div>
            ) : (
              receivables.map((item: any) => (
                <div key={item.appointmentId} className="py-3.5 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 truncate">{item.clientName}</p>
                      <p className="text-stone-600 truncate">
                        {item.serviceName} • {item.professionalName}
                      </p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {new Date(item.appointmentDateTime).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px] font-medium shrink-0">
                      {item.appointmentStatus}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-100 tabular-nums">
                    <div>
                      <span className="text-[10px] text-stone-500 block">Contratado</span>
                      <strong className="text-stone-900">
                        {formatCurrencyBrl(item.contractedTotalCents)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block">Recebido</span>
                      <span className="text-emerald-700 font-semibold">
                        {formatCurrencyBrl(item.netConfirmedPaidCents)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-stone-500 block">Pendente</span>
                      <strong className="text-amber-700">
                        {formatCurrencyBrl(item.pendingBalanceCents)}
                      </strong>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setReceivingBalanceItem(item);
                      setReceiveBalanceAmountReais((item.pendingBalanceCents / 100).toFixed(2));
                      setReceiveBalanceFeeReais('0');
                    }}
                    className="w-full py-2.5 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
                  >
                    Receber Saldo
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase">
                  <th className="py-3 px-3">Data Atendimento</th>
                  <th className="py-3 px-3">Cliente</th>
                  <th className="py-3 px-3">Serviço / Profissional</th>
                  <th className="py-3 px-3">Status Agenda</th>
                  <th className="py-3 px-3 text-right">Total Contratado</th>
                  <th className="py-3 px-3 text-right">Já Recebido</th>
                  <th className="py-3 px-3 text-right">Saldo Pendente</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {receivables.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-stone-400">
                      Não há saldos pendentes de clientes no momento.
                    </td>
                  </tr>
                ) : (
                  receivables.map((item: any) => (
                    <tr key={item.appointmentId} className="hover:bg-stone-50">
                      <td className="py-3 px-3 whitespace-nowrap">
                        {new Date(item.appointmentDateTime).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-3 font-semibold text-stone-900">
                        {item.clientName}
                      </td>
                      <td className="py-3 px-3">
                        <div>{item.serviceName}</div>
                        <div className="text-stone-400">{item.professionalName}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-medium">
                          {item.appointmentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {formatCurrencyBrl(item.contractedTotalCents)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-700 font-medium">
                        {formatCurrencyBrl(item.netConfirmedPaidCents)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-amber-700">
                        {formatCurrencyBrl(item.pendingBalanceCents)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            setReceivingBalanceItem(item);
                            setReceiveBalanceAmountReais(
                              (item.pendingBalanceCents / 100).toFixed(2)
                            );
                            setReceiveBalanceFeeReais('0');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                        >
                          Receber Saldo
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4 & 5: DESPESAS & CONTAS A PAGAR */}
      {(subTab === 'expenses' || subTab === 'payables') && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-stone-900">
                {subTab === 'payables'
                  ? 'Contas a Pagar (Despesas Pendentes e Vencidas)'
                  : 'Gestão de Despesas Operacionais'}
              </h3>
              <p className="text-xs text-stone-500">
                Despesas registradas como PENDENTES não reduzem o caixa até que sejam explicitamente confirmadas como PAGAS. Despesas pagas nunca são apagadas silenciosamente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {subTab === 'expenses' && (
                <>
                  <select
                    value={expenseCategoryFilter}
                    onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                    className="flex-1 sm:flex-initial px-3 py-2 min-h-[40px] rounded-xl border border-stone-300 text-xs bg-white"
                  >
                    <option value="ALL">Todas as categorias</option>
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    value={expenseStatusFilter}
                    onChange={(e) => setExpenseStatusFilter(e.target.value)}
                    className="flex-1 sm:flex-initial px-3 py-2 min-h-[40px] rounded-xl border border-stone-300 text-xs bg-white"
                  >
                    <option value="ALL">Todos os status</option>
                    <option value="PENDING">Pendentes</option>
                    <option value="PAID">Pagas</option>
                    <option value="REVERSED">Estornadas</option>
                    <option value="CANCELLED">Canceladas</option>
                  </select>
                </>
              )}
              <button
                onClick={() => setShowExpenseModal(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Despesa</span>
              </button>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-stone-100 -mx-4 px-4">
            {(subTab === 'payables' ? payableExpenses : expenses).length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                Nenhuma despesa encontrada para esta visão.
              </div>
            ) : (
              (subTab === 'payables' ? payableExpenses : expenses).map((exp: any) => (
                <div key={exp.id} className="py-3.5 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900">{exp.description}</p>
                      <p className="text-stone-500">
                        {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
                      </p>
                      {exp.cancellationReason && (
                        <p className="text-[11px] text-rose-600 mt-0.5">
                          Motivo: {exp.cancellationReason}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-sm text-stone-900 block tabular-nums">
                        {formatCurrencyBrl(exp.amountCents)}
                      </span>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          exp.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700'
                            : exp.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {exp.status === 'PAID'
                          ? 'PAGA'
                          : exp.status === 'PENDING'
                          ? 'PENDENTE'
                          : exp.status === 'REVERSED'
                          ? 'ESTORNADA'
                          : 'CANCELADA'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                    <span>
                      Vencimento:{' '}
                      <strong className={exp.isOverdue ? 'text-rose-600' : 'text-stone-800'}>
                        {new Date(exp.dueDate).toLocaleDateString('pt-BR')}
                      </strong>
                      {exp.isOverdue && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                          VENCIDA
                        </span>
                      )}
                    </span>
                    <span>
                      Comp.: {new Date(exp.competenceDate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  {(exp.status === 'PENDING' || exp.status === 'PAID') && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {exp.status === 'PENDING' && (
                        <button
                          onClick={() => {
                            setPayingExpense(exp);
                            setPayExpenseMethod(exp.paymentMethod || 'PIX');
                            setPayExpenseConfirmed(false);
                          }}
                          className="flex-1 py-2 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                        >
                          Confirmar Pagamento
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setReversingExpense(exp);
                          setReverseExpenseReason('');
                        }}
                        className="flex-1 py-2 min-h-[40px] rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold text-xs"
                      >
                        {exp.status === 'PAID' ? 'Estornar' : 'Cancelar'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase">
                  <th className="py-3 px-3">Descrição / Categoria</th>
                  <th className="py-3 px-3">Competência</th>
                  <th className="py-3 px-3">Vencimento</th>
                  <th className="py-3 px-3">Pagamento</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Valor</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(subTab === 'payables' ? payableExpenses : expenses).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-stone-400">
                      Nenhuma despesa encontrada para esta visão.
                    </td>
                  </tr>
                ) : (
                  (subTab === 'payables' ? payableExpenses : expenses).map((exp: any) => (
                    <tr key={exp.id} className="hover:bg-stone-50">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-stone-900">{exp.description}</div>
                        <div className="text-stone-500">
                          {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
                        </div>
                        {exp.cancellationReason && (
                          <div className="text-[11px] text-rose-600 mt-0.5">
                            Motivo estorno/cancel.: {exp.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {new Date(exp.competenceDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={exp.isOverdue ? 'text-rose-600 font-bold' : ''}>
                          {new Date(exp.dueDate).toLocaleDateString('pt-BR')}
                        </span>
                        {exp.isOverdue && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                            VENCIDA
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {exp.paidAt
                          ? `${new Date(exp.paidAt).toLocaleDateString('pt-BR')} (${
                              PAYMENT_METHOD_LABELS[exp.paymentMethod] || exp.paymentMethod || '—'
                            })`
                          : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            exp.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700'
                              : exp.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {exp.status === 'PAID'
                            ? 'PAGA'
                            : exp.status === 'PENDING'
                            ? 'PENDENTE'
                            : exp.status === 'REVERSED'
                            ? 'ESTORNADA'
                            : 'CANCELADA'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-stone-900">
                        {formatCurrencyBrl(exp.amountCents)}
                      </td>
                      <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                        {exp.status === 'PENDING' && (
                          <button
                            onClick={() => {
                              setPayingExpense(exp);
                              setPayExpenseMethod(exp.paymentMethod || 'PIX');
                              setPayExpenseConfirmed(false);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                          >
                            Confirmar Pagamento
                          </button>
                        )}
                        {(exp.status === 'PENDING' || exp.status === 'PAID') && (
                          <button
                            onClick={() => {
                              setReversingExpense(exp);
                              setReverseExpenseReason('');
                            }}
                            className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold"
                          >
                            {exp.status === 'PAID' ? 'Estornar' : 'Cancelar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 6: CAIXA E MOVIMENTAÇÕES (LEDGER) */}
      {subTab === 'ledger' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-stone-900">Livro de Caixa e Movimentações</h3>
              <p className="text-xs text-stone-500">
                Lançamentos financeiros confirmados são imutáveis e auditáveis. Correções exigem Estorno ou Ajuste Administrativo com justificativa obrigatória.
              </p>
            </div>
            <button
              onClick={() => setShowAdjustmentModal(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Ajuste Administrativo de Caixa</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-800 uppercase">
                Total Entradas Confirmadas
              </span>
              <p className="text-lg font-bold text-emerald-900 mt-0.5">
                {formatCurrencyBrl(ledger.summary?.totalInflowCents)}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
              <span className="text-[11px] font-semibold text-rose-800 uppercase">
                Total Saídas Confirmadas
              </span>
              <p className="text-lg font-bold text-rose-900 mt-0.5">
                {formatCurrencyBrl(ledger.summary?.totalOutflowCents)}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-200">
              <span className="text-[11px] font-semibold text-stone-600 uppercase">
                Taxas de Transação
              </span>
              <p className="text-lg font-bold text-stone-800 mt-0.5">
                {formatCurrencyBrl(ledger.summary?.totalFeesCents)}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-stone-900 text-white">
              <span className="text-[11px] font-semibold text-stone-300 uppercase">
                Saldo Líquido de Caixa
              </span>
              <p className="text-lg font-bold text-white mt-0.5">
                {formatCurrencyBrl(ledger.summary?.netCashBalanceCents)}
              </p>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-stone-100 -mx-4 px-4">
            {ledger.items.map((tx: any) => (
              <div key={tx.id} className="py-3.5 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          tx.type === 'INFLOW'
                            ? 'bg-emerald-50 text-emerald-700'
                            : tx.type === 'OUTFLOW'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {tx.type === 'INFLOW'
                          ? 'ENTRADA'
                          : tx.type === 'OUTFLOW'
                          ? 'SAÍDA'
                          : tx.type === 'REVERSAL'
                          ? 'ESTORNO'
                          : 'AJUSTE'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          tx.status === 'CONFIRMED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : tx.status === 'REVERSED'
                            ? 'bg-stone-200 text-stone-600 line-through'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                    <p className="font-bold text-stone-900">{tx.description}</p>
                    <p className="text-[11px] text-stone-500">
                      {tx.category} • {new Date(tx.occurredAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <span className="font-bold text-sm text-stone-900 block">
                      {formatCurrencyBrl(tx.netAmountCents)}
                    </span>
                    <span className="text-[10px] text-stone-400 block">
                      Bruto: {formatCurrencyBrl(tx.amountCents)}
                    </span>
                  </div>
                </div>
                {tx.justification && (
                  <p className="text-[11px] text-stone-500 bg-stone-50 p-2 rounded-lg">
                    Justificativa: {tx.justification}
                  </p>
                )}
                {tx.status === 'CONFIRMED' && tx.type !== 'REVERSAL' && (
                  <button
                    onClick={() => {
                      setReversingLedgerTx(tx);
                      setReverseLedgerJustification('');
                    }}
                    className="w-full py-2 min-h-[38px] rounded-xl border border-stone-300 hover:bg-stone-100 text-stone-700 font-semibold text-xs"
                  >
                    Estornar Lançamento
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase">
                  <th className="py-3 px-3">Data/Hora</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Origem / Categoria</th>
                  <th className="py-3 px-3">Descrição / Justificativa</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Valor Bruto</th>
                  <th className="py-3 px-3 text-right">Valor Líquido</th>
                  <th className="py-3 px-3 text-right">Auditoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {ledger.items.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-stone-50">
                    <td className="py-3 px-3 whitespace-nowrap">
                      {new Date(tx.occurredAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold ${
                          tx.type === 'INFLOW'
                            ? 'bg-emerald-50 text-emerald-700'
                            : tx.type === 'OUTFLOW'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {tx.type === 'INFLOW'
                          ? 'ENTRADA'
                          : tx.type === 'OUTFLOW'
                          ? 'SAÍDA'
                          : tx.type === 'REVERSAL'
                          ? 'ESTORNO'
                          : 'AJUSTE'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold">{tx.category}</div>
                      <div className="text-[10px] text-stone-400">{tx.origin}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-stone-900 font-medium">{tx.description}</div>
                      {tx.justification && (
                        <div className="text-[11px] text-stone-500">
                          Justificativa: {tx.justification}
                        </div>
                      )}
                      {tx.reconciliationDiscrepancy && (
                        <div className="text-[11px] text-amber-700 font-semibold">
                          Divergência Conciliação: {tx.reconciliationDiscrepancy}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md font-semibold ${
                          tx.status === 'CONFIRMED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : tx.status === 'REVERSED'
                            ? 'bg-stone-200 text-stone-600 line-through'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-semibold">
                      {formatCurrencyBrl(tx.amountCents)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold">
                      {formatCurrencyBrl(tx.netAmountCents)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {tx.status === 'CONFIRMED' && tx.type !== 'REVERSAL' && (
                        <button
                          onClick={() => {
                            setReversingLedgerTx(tx);
                            setReverseLedgerJustification('');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-stone-300 hover:bg-stone-100 text-stone-700 font-medium"
                        >
                          Estornar
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

      {/* SECTION 7: COMISSÕES DE PROFISSIONAIS */}
      {subTab === 'commissions' && (
        <div className="space-y-6">
          {!isProfessionalOnly && (
            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-stone-900">
                    Regras de Comissão Configuradas
                  </h3>
                  <p className="text-xs text-stone-500">
                    Ordem de prioridade explícita: <strong>1º Profissional + Serviço</strong> &gt;{' '}
                    <strong>2º Serviço</strong> &gt; <strong>3º Profissional</strong>. O sistema nunca inventa percentual caso não exista regra configurada.
                  </p>
                </div>
                <button
                  onClick={() => setShowRuleModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>Configurar Regra de Comissão</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {commissionRules.map((rule: any) => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                        {rule.scope === 'PROFESSIONAL_SERVICE'
                          ? '1º Prioridade: Profissional + Serviço'
                          : rule.scope === 'SERVICE'
                          ? '2º Prioridade: Por Serviço'
                          : '3º Prioridade: Por Profissional'}
                      </span>
                      <p className="font-bold text-stone-900 text-xs mt-1.5">
                        {rule.professionalName} • {rule.serviceName}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Base:{' '}
                        {rule.basis === 'RECEIVED_AMOUNT'
                          ? 'Valor Líquido Recebido'
                          : 'Valor do Serviço Concluído'}
                      </p>
                    </div>
                    <div className="text-xl font-black text-rose-600">{rule.percentage}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-stone-900">Apuração e Pagamento de Comissões</h3>
                <p className="text-xs text-stone-500">
                  Vinculada de forma única a cada atendimento (nunca duplica quando sinal e saldo são pagos em datas diferentes).
                </p>
              </div>
              {!isProfessionalOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={commissionProfFilter}
                    onChange={(e) => setCommissionProfFilter(e.target.value)}
                    className="flex-1 sm:flex-initial px-3 py-2 min-h-[40px] rounded-xl border border-stone-300 text-xs bg-white"
                  >
                    <option value="ALL">Todas as profissionais</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={commissionStatusFilter}
                    onChange={(e) => setCommissionStatusFilter(e.target.value)}
                    className="flex-1 sm:flex-initial px-3 py-2 min-h-[40px] rounded-xl border border-stone-300 text-xs bg-white"
                  >
                    <option value="ALL">Todos os status</option>
                    <option value="PENDING_CALCULATION">A calcular</option>
                    <option value="CALCULATED">Calculadas</option>
                    <option value="APPROVED">Aprovadas</option>
                    <option value="PAID">Pagas</option>
                    <option value="CANCELLED">Canceladas</option>
                    <option value="NO_RULE_CONFIGURED">Sem regra configurada</option>
                  </select>
                </div>
              )}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-stone-100 -mx-4 px-4">
              {commissions.items.map((c: any) => (
                <div key={c.id} className="py-3.5 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900">{c.professionalName}</p>
                      <p className="text-stone-600">{c.serviceName}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {new Date(c.appointmentDateTime).toLocaleDateString('pt-BR')} • Cliente: {c.clientName}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
                        c.status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700'
                          : c.status === 'APPROVED'
                          ? 'bg-blue-50 text-blue-700'
                          : c.status === 'CALCULATED'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-100 tabular-nums">
                    <div>
                      <span className="text-[10px] text-stone-500 block">Regra</span>
                      <span className="text-stone-800 font-medium">
                        {c.status === 'NO_RULE_CONFIGURED'
                          ? 'Sem regra'
                          : `${c.percentageApplied}%`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block">Base</span>
                      <span className="text-stone-800">{formatCurrencyBrl(c.baseAmountCents)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-stone-500 block">Comissão</span>
                      <strong className="text-stone-900">
                        {formatCurrencyBrl(c.commissionAmountCents)}
                      </strong>
                    </div>
                  </div>
                  {!isProfessionalOnly && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {c.status === 'CALCULATED' && (
                        <button
                          onClick={() => handleCommissionAction(c.id, 'APPROVE')}
                          className="flex-1 py-2 min-h-[38px] rounded-xl bg-blue-600 text-white font-semibold text-xs"
                        >
                          Aprovar
                        </button>
                      )}
                      {(c.status === 'CALCULATED' || c.status === 'APPROVED') && (
                        <button
                          onClick={() => handleCommissionAction(c.id, 'PAY')}
                          className="flex-1 py-2 min-h-[38px] rounded-xl bg-emerald-600 text-white font-semibold text-xs"
                        >
                          Marcar Paga
                        </button>
                      )}
                      {c.status !== 'PAID' && c.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCommissionAction(c.id, 'CANCEL')}
                          className="flex-1 py-2 min-h-[38px] rounded-xl border border-rose-200 text-rose-700 font-semibold text-xs"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 uppercase">
                    <th className="py-3 px-3">Atendimento</th>
                    <th className="py-3 px-3">Profissional / Serviço</th>
                    <th className="py-3 px-3">Regra Aplicada</th>
                    <th className="py-3 px-3 text-right">Valor Base</th>
                    <th className="py-3 px-3 text-right">Comissão</th>
                    <th className="py-3 px-3">Status</th>
                    {!isProfessionalOnly && <th className="py-3 px-3 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {commissions.items.map((c: any) => (
                    <tr key={c.id} className="hover:bg-stone-50">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div>{new Date(c.appointmentDateTime).toLocaleDateString('pt-BR')}</div>
                        <div className="text-[10px] text-stone-400">{c.clientName}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-stone-900">{c.professionalName}</div>
                        <div className="text-stone-500">{c.serviceName}</div>
                      </td>
                      <td className="py-3 px-3">
                        {c.status === 'NO_RULE_CONFIGURED' ? (
                          <span className="text-amber-700 font-semibold">
                            Sem regra configurada
                          </span>
                        ) : (
                          <span>
                            {c.percentageApplied}% ({c.ruleScope})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {formatCurrencyBrl(c.baseAmountCents)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-stone-900">
                        {formatCurrencyBrl(c.commissionAmountCents)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            c.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700'
                              : c.status === 'APPROVED'
                              ? 'bg-blue-50 text-blue-700'
                              : c.status === 'CALCULATED'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      {!isProfessionalOnly && (
                        <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                          {c.status === 'CALCULATED' && (
                            <button
                              onClick={() => handleCommissionAction(c.id, 'APPROVE')}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold"
                            >
                              Aprovar
                            </button>
                          )}
                          {(c.status === 'CALCULATED' || c.status === 'APPROVED') && (
                            <button
                              onClick={() => handleCommissionAction(c.id, 'PAY')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold"
                            >
                              Marcar Paga
                            </button>
                          )}
                          {c.status !== 'PAID' && c.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleCommissionAction(c.id, 'CANCEL')}
                              className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 font-semibold"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 8: REEMBOLSOS */}
      {subTab === 'refunds' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
          <div>
            <h3 className="font-bold text-stone-900">Impacto Financeiro dos Reembolsos</h3>
            <p className="text-xs text-stone-500">
              Somente reembolsos com status <strong>CONCLUÍDO (COMPLETED)</strong> reduzem a receita líquida e geram saída no livro de caixa. Nenhum reembolso pode exceder o valor efetivamente recebido.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase">
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Cliente / Agendamento</th>
                  <th className="py-3 px-3">Status Reembolso</th>
                  <th className="py-3 px-3 text-right">Valor Original Recebido</th>
                  <th className="py-3 px-3 text-right">Valor Solicitado</th>
                  <th className="py-3 px-3 text-right">Valor Reembolsado (Concluído)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {refunds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-400">
                      Nenhum registro de reembolso encontrado.
                    </td>
                  </tr>
                ) : (
                  refunds.map((ref: any) => (
                    <tr key={ref.id} className="hover:bg-stone-50">
                      <td className="py-3 px-3">
                        {new Date(ref.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-stone-900">{ref.clientName}</div>
                        <div className="text-stone-400">Agendamento: {ref.appointmentId}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            ref.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : ref.status === 'FAILED' || ref.status === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {ref.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {formatCurrencyBrl(ref.originalPaymentAmountCents)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold">
                        {formatCurrencyBrl(ref.requestedRefundCents)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-rose-700">
                        {formatCurrencyBrl(ref.completedRefundCents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 9: RELATÓRIOS GERENCIAIS */}
      {subTab === 'reports' && reports && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-stone-900">Relatórios Gerenciais e Comparativo</h3>
              <p className="text-xs text-stone-500">
                Filtre por profissional e serviço para analisar vendas concluídas, recebimentos confirmados, despesas por categoria e comparação com o período anterior.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={reportProfFilter}
                onChange={(e) => setReportProfFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs"
              >
                <option value="ALL">Todas as profissionais</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={reportServiceFilter}
                onChange={(e) => setReportServiceFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs"
              >
                <option value="ALL">Todos os serviços</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
              <h4 className="font-bold text-sm text-stone-900">Vendas e Recebimentos por Serviço</h4>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2">Serviço</th>
                    <th className="py-2 text-right">Concluídos</th>
                    <th className="py-2 text-right">Vendas (Competência)</th>
                    <th className="py-2 text-right">Recebido Confirmado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {reports.salesByService.map((s: any) => (
                    <tr key={s.serviceId}>
                      <td className="py-2 font-medium">{s.serviceName}</td>
                      <td className="py-2 text-right">{s.completedCount}</td>
                      <td className="py-2 text-right">{formatCurrencyBrl(s.salesCents)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {formatCurrencyBrl(s.receivedCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
              <h4 className="font-bold text-sm text-stone-900">Despesas por Categoria</h4>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2">Categoria</th>
                    <th className="py-2 text-right">Qtd</th>
                    <th className="py-2 text-right">Pagas</th>
                    <th className="py-2 text-right">Pendentes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {reports.expensesByCategory.map((c: any) => (
                    <tr key={c.category}>
                      <td className="py-2 font-medium">
                        {EXPENSE_CATEGORY_LABELS[c.category] || c.category}
                      </td>
                      <td className="py-2 text-right">{c.count}</td>
                      <td className="py-2 text-right text-rose-700 font-semibold">
                        {formatCurrencyBrl(c.paidCents)}
                      </td>
                      <td className="py-2 text-right text-amber-700">
                        {formatCurrencyBrl(c.pendingCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 10: EXPORTAÇÃO DE DADOS */}
      {subTab === 'exports' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-6">
          <div>
            <h3 className="font-bold text-stone-900">Exportação de Relatórios Financeiros</h3>
            <p className="text-xs text-stone-500 mt-1">
              As exportações são geradas no backend respeitando o isolamento multiempresa (tenant_id), permissões do perfil autenticado e o período selecionado ({dashboard?.period?.label}).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl border border-stone-200 bg-stone-50 flex flex-col justify-between gap-4">
              <div>
                <h4 className="font-bold text-stone-900 text-sm">Planilha CSV (Excel / Contabilidade)</h4>
                <p className="text-xs text-stone-500 mt-1">
                  Contém o cabeçalho com período filtrado, resumo de todos os indicadores em centavos e em reais formatados, além de todos os lançamentos do Livro de Caixa.
                </p>
              </div>
              <button
                onClick={handleDownloadCsv}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Arquivo CSV</span>
              </button>
            </div>

            <div className="p-5 rounded-2xl border border-stone-200 bg-stone-50 flex flex-col justify-between gap-4">
              <div>
                <h4 className="font-bold text-stone-900 text-sm">
                  Relatório Gerencial Imprimível / PDF
                </h4>
                <p className="text-xs text-stone-500 mt-1">
                  Gera o documento executivo estruturado com indicadores, desempenho por serviço, comissões por profissional e notas metodológicas para impressão ou salvamento em PDF.
                </p>
              </div>
              <button
                onClick={handleGeneratePrintableReport}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                <FileText className="w-4 h-4" />
                <span>Visualizar / Imprimir Relatório PDF</span>
              </button>
            </div>
          </div>

          {printableHtmlPreview && (
            <div className="border border-stone-300 rounded-2xl overflow-hidden bg-white">
              <div className="bg-stone-100 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700">
                  Pré-visualização do Relatório Imprimível
                </span>
                <button
                  onClick={() => setPrintableHtmlPreview(null)}
                  className="text-xs text-stone-500 hover:text-stone-800"
                >
                  Fechar pré-visualização
                </button>
              </div>
              <iframe
                title="Relatório Financeiro Imprimível"
                srcDoc={printableHtmlPreview}
                className="w-full h-96 border-0"
              />
            </div>
          )}
        </div>
      )}

      {/* MODAL: NOVA DESPESA */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <h3 className="font-bold text-base text-stone-900">Cadastrar Nova Despesa</h3>
            <form onSubmit={handleCreateExpense} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  placeholder="Ex.: Compra de esmaltes em gel e cabines UV"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Categoria</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={expenseForm.amountReais}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amountReais: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                    placeholder="150.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Competência</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.competenceDate}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, competenceDate: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Vencimento</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.dueDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, dueDate: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Status Inicial</label>
                  <select
                    value={expenseForm.status}
                    onChange={(e) => setExpenseForm({ ...expenseForm, status: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    <option value="PENDING">Pendente (Conta a pagar)</option>
                    <option value="PAID">Já Paga</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Forma de Pagto.</label>
                  <select
                    value={expenseForm.paymentMethod}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 text-stone-700 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
                >
                  Salvar Despesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR PAGAMENTO DE DESPESA */}
      {payingExpense && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-stone-900">Confirmar Pagamento de Despesa</h3>
            <p className="text-stone-600">
              Você está marcando a despesa <strong>{payingExpense.description}</strong> no valor de{' '}
              <strong>{formatCurrencyBrl(payingExpense.amountCents)}</strong> como PAGA. Isso gerará uma saída imediata no Livro de Caixa.
            </p>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Forma de Pagamento</label>
              <select
                value={payExpenseMethod}
                onChange={(e) => setPayExpenseMethod(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 font-medium text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={payExpenseConfirmed}
                onChange={(e) => setPayExpenseConfirmed(e.target.checked)}
              />
              <span>Confirmo que o pagamento desta despesa foi efetivamente realizado.</span>
            </label>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                onClick={() => setPayingExpense(null)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 font-medium"
              >
                Voltar
              </button>
              <button
                onClick={handlePayExpenseConfirm}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold"
              >
                Confirmar Baixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ESTORNAR / CANCELAR DESPESA */}
      {reversingExpense && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-stone-900">
              {reversingExpense.status === 'PAID' ? 'Estornar Despesa Paga' : 'Cancelar Despesa'}
            </h3>
            <p className="text-stone-600">
              Informe a justificativa obrigatória para preservar a trilha de auditoria financeira.
            </p>
            <textarea
              rows={3}
              value={reverseExpenseReason}
              onChange={(e) => setReverseExpenseReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300"
              placeholder="Descreva o motivo do estorno ou cancelamento (mín. 5 caracteres)..."
            />
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                onClick={() => setReversingExpense(null)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 font-medium"
              >
                Voltar
              </button>
              <button
                onClick={handleReverseExpenseConfirm}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
              >
                Confirmar {reversingExpense.status === 'PAID' ? 'Estorno' : 'Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RECEBER SALDO PENDENTE (CONTAS A RECEBER) */}
      {receivingBalanceItem && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-stone-900">
              Registrar Recebimento de Saldo Restante
            </h3>
            <p className="text-stone-600">
              Cliente: <strong>{receivingBalanceItem.clientName}</strong> — Saldo máximo pendente:{' '}
              <strong>{formatCurrencyBrl(receivingBalanceItem.pendingBalanceCents)}</strong>
            </p>
            <form onSubmit={handleRecordBalancePayment} className="space-y-3">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Valor Recebido (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={receiveBalanceAmountReais}
                  onChange={(e) => setReceiveBalanceAmountReais(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={receiveBalanceMethod}
                    onChange={(e) => setReceiveBalanceMethod(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    <option value="PIX">Pix</option>
                    <option value="CREDIT_CARD">Cartão de Crédito</option>
                    <option value="DEBIT_CARD">Cartão de Débito</option>
                    <option value="CASH">Dinheiro</option>
                    <option value="TRANSFER">Transferência</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Taxa Maquininha/Operadora (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={receiveBalanceFeeReais}
                    onChange={(e) => setReceiveBalanceFeeReais(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReceivingBalanceItem(null)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold"
                >
                  Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AJUSTE MANUAL DE CAIXA */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-stone-900">
              Novo Ajuste Administrativo de Caixa
            </h3>
            <form onSubmit={handleCreateManualAdjustment} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Tipo</label>
                  <select
                    value={adjustmentForm.type}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    <option value="INFLOW">Entrada (Suprimento/Ajuste)</option>
                    <option value="OUTFLOW">Saída (Sangria/Ajuste)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={adjustmentForm.amountReais}
                    onChange={(e) =>
                      setAdjustmentForm({ ...adjustmentForm, amountReais: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  value={adjustmentForm.description}
                  onChange={(e) =>
                    setAdjustmentForm({ ...adjustmentForm, description: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  placeholder="Ex.: Suprimento de troco para recepção"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Justificativa Obrigatória de Auditoria
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustmentForm.justification}
                  onChange={(e) =>
                    setAdjustmentForm({ ...adjustmentForm, justification: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-300"
                  placeholder="Informe o motivo detalhado (mínimo 5 caracteres)..."
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 text-white font-semibold"
                >
                  Registrar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ESTORNO DE LANÇAMENTO DO LIVRO DE CAIXA */}
      {reversingLedgerTx && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-stone-900">
              Estorno Auditado de Lançamento de Caixa
            </h3>
            <p className="text-stone-600">
              Lançamento: <strong>{reversingLedgerTx.description}</strong> (
              {formatCurrencyBrl(reversingLedgerTx.amountCents)}). O lançamento original será marcado como REVERSED e um lançamento compensatório de estorno será gravado.
            </p>
            <textarea
              rows={3}
              value={reverseLedgerJustification}
              onChange={(e) => setReverseLedgerJustification(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300"
              placeholder="Justificativa obrigatória do estorno (mínimo 5 caracteres)..."
            />
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                onClick={() => setReversingLedgerTx(null)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 font-medium"
              >
                Voltar
              </button>
              <button
                onClick={handleReverseLedgerConfirm}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURAR REGRA DE COMISSÃO */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-stone-900">Configurar Regra de Comissão</h3>
            <form onSubmit={handleSaveCommissionRule} className="space-y-3">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Escopo e Prioridade
                </label>
                <select
                  value={ruleForm.scope}
                  onChange={(e) => setRuleForm({ ...ruleForm, scope: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                >
                  <option value="PROFESSIONAL_SERVICE">
                    1º Prioridade: Regra Específica (Profissional + Serviço)
                  </option>
                  <option value="SERVICE">2º Prioridade: Regra por Serviço</option>
                  <option value="PROFESSIONAL">3º Prioridade: Regra por Profissional</option>
                </select>
              </div>
              {(ruleForm.scope === 'PROFESSIONAL' ||
                ruleForm.scope === 'PROFESSIONAL_SERVICE') && (
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Profissional</label>
                  <select
                    value={ruleForm.professionalId}
                    onChange={(e) => setRuleForm({ ...ruleForm, professionalId: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(ruleForm.scope === 'SERVICE' || ruleForm.scope === 'PROFESSIONAL_SERVICE') && (
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Serviço</label>
                  <select
                    value={ruleForm.serviceId}
                    onChange={(e) => setRuleForm({ ...ruleForm, serviceId: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Percentual (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={ruleForm.percentage}
                    onChange={(e) => setRuleForm({ ...ruleForm, percentage: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Base de Cálculo</label>
                  <select
                    value={ruleForm.basis}
                    onChange={(e) => setRuleForm({ ...ruleForm, basis: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-300"
                  >
                    <option value="COMPLETED_SERVICE_VALUE">Valor do Serviço Concluído</option>
                    <option value="RECEIVED_AMOUNT">Valor Líquido Recebido</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
                >
                  Salvar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
