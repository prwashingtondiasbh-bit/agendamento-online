import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  CreditCard,
  FileText,
  X,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../App';

const FILTER_OPTIONS = [
  { id: 'ALL', label: 'Todos', depositOnly: false },
  { id: 'PENDING', label: 'Pendentes', depositOnly: false },
  { id: 'WITHIN_POLICY', label: 'Dentro do prazo', depositOnly: true },
  { id: 'OUT_OF_POLICY', label: 'Fora do prazo', depositOnly: true },
  { id: 'AWAITING_DECISION', label: 'Aguardando decisão', depositOnly: false },
  { id: 'AWAITING_REFUND', label: 'Aguardando reembolso', depositOnly: true },
  { id: 'PROCESSING_REFUND', label: 'Em processamento', depositOnly: true },
  { id: 'COMPLETED', label: 'Concluídos', depositOnly: false },
  { id: 'REJECTED', label: 'Rejeitados', depositOnly: false },
];

interface CancellationsViewProps {
  requireDeposit?: boolean;
  onRefreshAppointments?: () => void;
}

export const CancellationsView: React.FC<CancellationsViewProps> = ({
  requireDeposit = true,
  onRefreshAppointments,
}) => {
  const [filter, setFilter] = useState('ALL');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  // Decision modal state
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [approveExceptionRefund, setApproveExceptionRefund] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/admin/cancellation-requests?filter=${filter}`);
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setRequests(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching cancellation requests:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const renderCancellationStatus = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="text-xs font-semibold text-amber-700">Pendente de Análise</span>;
      case 'APPROVED':
        return <span className="text-xs font-semibold text-blue-700">Cancelamento Aprovado</span>;
      case 'COMPLETED':
        return <span className="text-xs font-semibold text-emerald-700">Concluído</span>;
      case 'REJECTED':
        return <span className="text-xs font-semibold text-rose-700">Rejeitado</span>;
      case 'CANCELLED':
        return <span className="text-xs font-semibold text-stone-600">Cancelado</span>;
      default:
        return <span className="text-xs font-semibold text-stone-700">{status}</span>;
    }
  };

  const renderRefundStatus = (status: string) => {
    switch (status) {
      case 'NOT_REQUESTED':
        return <span className="text-xs text-stone-500">Sem reembolso aplicável</span>;
      case 'PENDING_REVIEW':
        return <span className="text-xs font-semibold text-amber-700">Reembolso em Análise</span>;
      case 'APPROVED':
        return <span className="text-xs font-semibold text-blue-700">Aguardando Execução</span>;
      case 'PROCESSING':
        return <span className="text-xs font-semibold text-amber-800">Processando no Provedor</span>;
      case 'COMPLETED':
        return <span className="text-xs font-semibold text-emerald-700">Reembolso Concluído</span>;
      case 'FAILED':
        return <span className="text-xs font-semibold text-rose-700">Falha no Provedor</span>;
      case 'REJECTED':
        return <span className="text-xs font-semibold text-stone-600">Reembolso Negado</span>;
      default:
        return <span className="text-xs text-stone-600">{status}</span>;
    }
  };

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !decisionAction) return;
    if (decisionNotes.trim().length < 5) {
      setFeedback({ type: 'error', message: 'Informe uma justificativa com pelo menos 5 caracteres.' });
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/v1/admin/cancellation-requests/${selectedReq.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: decisionAction,
          justification: decisionNotes.trim(),
          authorizeExceptionRefund: approveExceptionRefund,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setFeedback({ type: 'success', message: result.message || 'Decisão registrada com sucesso!' });
        setDecisionAction(null);
        setDecisionNotes('');
        setApproveExceptionRefund(false);
        await fetchRequests();
        if (onRefreshAppointments) onRefreshAppointments();
        setSelectedReq(result.data || null);
      } else {
        setFeedback({ type: 'error', message: result.error || 'Erro ao processar decisão.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Erro de comunicação com o servidor.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteRefund = async (reqItem: any) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/v1/admin/cancellation-requests/${reqItem.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Execução de reembolso autorizada pelo painel administrativo.',
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setFeedback({ type: 'success', message: result.message || 'Reembolso executado com sucesso via Mercado Pago!' });
        await fetchRequests();
        if (onRefreshAppointments) onRefreshAppointments();
        if (selectedReq?.id === reqItem.id) {
          setSelectedReq(null);
        }
      } else {
        setFeedback({ type: 'error', message: result.error || 'Falha ao executar reembolso no provedor.' });
        await fetchRequests();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Erro de conexão ao executar reembolso.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar & Filters */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-stone-900">Solicitações de cancelamento</h3>
            <p className="text-xs text-stone-500">
              {requireDeposit
                ? 'Gerencie pedidos de cancelamento, verifique elegibilidade de prazo e execute estornos de sinal com segurança'
                : 'Gerencie pedidos de cancelamento e acompanhe o histórico de solicitações das clientes'}
            </p>
          </div>
          <button
            onClick={fetchRequests}
            className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar Lista</span>
          </button>
        </div>

        {/* Segmented Filter Bar */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-stone-100">
          {FILTER_OPTIONS.filter((opt) => requireDeposit || !opt.depositOnly).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === opt.id
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-stone-500 hover:text-stone-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table / List */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-stone-500">Carregando solicitações de cancelamento...</div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <RotateCcw className="w-8 h-8 text-stone-300 mx-auto" />
            <p className="text-sm font-semibold text-stone-800">Nenhuma solicitação encontrada para este filtro</p>
            <p className="text-xs text-stone-500">
              Todas as solicitações registradas pelas clientes aparecerão aqui com histórico auditável.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-stone-100">
              {requests.map((req) => {
                const canDecide = req.status === 'PENDING';
                const canExecuteRefund =
                  requireDeposit &&
                  req.paidDepositCents > 0 &&
                  (req.refundStatus === 'APPROVED' || req.refundStatus === 'FAILED') &&
                  req.refundRequest?.status !== 'COMPLETED';

                return (
                  <div key={req.id} className="p-4 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong className="text-stone-900 font-bold text-sm block">{req.clientName}</strong>
                        <span className="text-stone-600 block">
                          {req.serviceName} · {req.professionalName}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-mono font-semibold text-stone-500 block">
                          {req.referenceCode}
                        </span>
                        {renderCancellationStatus(req.status)}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-100 space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-stone-500">Atendimento:</span>
                        <strong className="text-stone-900 tabular-nums">{formatDateTime(req.appointmentDateTime)}</strong>
                      </div>
                      {requireDeposit && (
                        <>
                          <div className="flex justify-between gap-2">
                            <span className="text-stone-500">Política ({req.hoursBeforeAppointment}h antes):</span>
                            {req.isWithinPolicy ? (
                              <span className="text-emerald-700 font-semibold">Dentro do prazo</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">Fora do prazo</span>
                            )}
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-stone-500">Sinal pago:</span>
                            <strong className="text-stone-900 tabular-nums">{req.formattedPaidDeposit}</strong>
                          </div>
                          <div className="flex justify-between gap-2 items-center pt-1 border-t border-stone-200/70">
                            <span className="text-stone-500">Status Reembolso:</span>
                            {renderRefundStatus(req.refundStatus)}
                          </div>
                        </>
                      )}
                      {req.reason && (
                        <p className="text-stone-600 pt-1 border-t border-stone-200/70 italic">
                          Motivo: "{req.reason}"
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          setSelectedReq(req);
                          setDecisionAction(null);
                          setDecisionNotes('');
                        }}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold transition-all text-center"
                      >
                        Detalhes
                      </button>
                      {canDecide && (
                        <button
                          onClick={() => {
                            setSelectedReq(req);
                            setDecisionAction('APPROVE');
                            setDecisionNotes('');
                            setApproveExceptionRefund(false);
                          }}
                          className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold transition-all text-center"
                        >
                          Decidir
                        </button>
                      )}
                      {canExecuteRefund && (
                        <button
                          disabled={actionLoading}
                          onClick={() => handleExecuteRefund(req)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold transition-all text-center"
                        >
                          {req.refundStatus === 'FAILED' ? 'Tentar Reembolso' : 'Executar Reembolso'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase text-stone-500">
                  <th className="py-3.5 px-4">Código / Data</th>
                  <th className="py-3.5 px-4">Cliente & Serviço</th>
                  <th className="py-3.5 px-4">Data do Atendimento</th>
                  {requireDeposit && <th className="py-3.5 px-4">Prazo & Política</th>}
                  {requireDeposit && <th className="py-3.5 px-4">Sinal Pago</th>}
                  <th className="py-3.5 px-4">Status Cancelamento</th>
                  {requireDeposit && <th className="py-3.5 px-4">Status Reembolso</th>}
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {requests.map((req) => {
                  const canDecide = req.status === 'PENDING';
                  const canExecuteRefund =
                    requireDeposit &&
                    req.paidDepositCents > 0 &&
                    (req.refundStatus === 'APPROVED' || req.refundStatus === 'FAILED') &&
                    req.refundRequest?.status !== 'COMPLETED';

                  return (
                    <tr key={req.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-4 px-4 align-top tabular-nums">
                        <strong className="text-stone-900 font-semibold block">{req.referenceCode}</strong>
                        <span className="text-stone-500 text-[11px]">{formatDateTime(req.requestedAt)}</span>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <strong className="text-stone-900 font-semibold block">{req.clientName}</strong>
                        <span className="text-stone-600 block">
                          {req.serviceName} · {req.professionalName}
                        </span>
                        <span className="text-stone-500 text-[11px] block mt-0.5 truncate max-w-xs" title={req.reason}>
                          Motivo: "{req.reason}"
                        </span>
                      </td>
                      <td className="py-4 px-4 align-top tabular-nums">
                        <span className="text-stone-900 font-medium block">
                          {formatDateTime(req.appointmentDateTime)}
                        </span>
                        {requireDeposit && (
                          <span className="text-stone-500 text-[11px]">
                            Antecedência: {req.hoursBeforeAppointment}h ( mín. {req.policyHoursLimit}h )
                          </span>
                        )}
                      </td>
                      {requireDeposit && (
                        <td className="py-4 px-4 align-top">
                          {req.isWithinPolicy ? (
                            <span className="text-emerald-700 font-semibold block">Dentro do prazo</span>
                          ) : (
                            <span className="text-amber-700 font-semibold block">Fora do prazo</span>
                          )}
                          <span className="text-stone-500 text-[11px] block">
                            Elegível a reembolso: {req.isEligibleForRefund ? 'Sim' : 'Exceção manual'}
                          </span>
                        </td>
                      )}
                      {requireDeposit && (
                        <td className="py-4 px-4 align-top tabular-nums">
                          <strong className="text-stone-900 font-bold block">{req.formattedPaidDeposit}</strong>
                          <span className="text-stone-500 text-[11px]">
                            Pgto: {req.paymentStatus || 'UNPAID'}
                          </span>
                        </td>
                      )}
                      <td className="py-4 px-4 align-top">{renderCancellationStatus(req.status)}</td>
                      {requireDeposit && (
                        <td className="py-4 px-4 align-top">{renderRefundStatus(req.refundStatus)}</td>
                      )}
                      <td className="py-4 px-4 align-top text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedReq(req);
                            setDecisionAction(null);
                            setDecisionNotes('');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold transition-all"
                        >
                          Detalhes
                        </button>
                        {canDecide && (
                          <button
                            onClick={() => {
                              setSelectedReq(req);
                              setDecisionAction('APPROVE');
                              setDecisionNotes('');
                              setApproveExceptionRefund(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold transition-all"
                          >
                            Decidir
                          </button>
                        )}
                        {canExecuteRefund && (
                          <button
                            disabled={actionLoading}
                            onClick={() => handleExecuteRefund(req)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold transition-all"
                          >
                            {req.refundStatus === 'FAILED' ? 'Tentar Reembolso' : 'Executar Reembolso'}
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

      {/* Detail & Decision Modal */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-stone-100 sticky top-0 bg-white z-10">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 tabular-nums">
                  Solicitação {selectedReq.referenceCode}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-stone-900 mt-0.5">
                  {requireDeposit ? 'Análise de Cancelamento e Reembolso' : 'Análise de Cancelamento'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 text-xs">
              {/* Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div className="space-y-1.5">
                  <span className="text-stone-500 block">Cliente & Contato</span>
                  <strong className="text-stone-900 text-sm block">{selectedReq.clientName}</strong>
                  <span className="text-stone-600 block">{selectedReq.clientPhone || 'Sem telefone'}</span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-stone-500 block">Serviço & Profissional</span>
                  <strong className="text-stone-900 text-sm block">{selectedReq.serviceName}</strong>
                  <span className="text-stone-600 block">Profissional: {selectedReq.professionalName}</span>
                </div>
                <div className="space-y-1.5 tabular-nums">
                  <span className="text-stone-500 block">Horário do Atendimento</span>
                  <strong className="text-stone-900 block">{formatDateTime(selectedReq.appointmentDateTime)}</strong>
                  <span className="text-stone-600 block">
                    Solicitado em: {formatDateTime(selectedReq.requestedAt)}
                  </span>
                </div>
                {requireDeposit && (
                  <div className="space-y-1.5 tabular-nums">
                    <span className="text-stone-500 block">Cálculo de Prazo e Sinal</span>
                    <strong className="text-stone-900 block">
                      Antecedência calculada: {selectedReq.hoursBeforeAppointment}h (Política: {selectedReq.policyHoursLimit}h)
                    </strong>
                    <span className="text-rose-600 font-semibold block">
                      Sinal confirmado: {selectedReq.formattedPaidDeposit} ({selectedReq.paymentStatus})
                    </span>
                  </div>
                )}
              </div>

              {/* Reason & Historical Policy */}
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-stone-500 block">
                    Motivo informado pela cliente
                  </span>
                  <p className="text-stone-900 font-medium text-sm">"{selectedReq.reason}"</p>
                </div>

                {requireDeposit && (
                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-stone-500 block">
                      Política vigente e aceita no momento da reserva
                    </span>
                    <p className="text-stone-700 leading-relaxed">{selectedReq.snapshotPolicyText}</p>
                  </div>
                )}
              </div>

              {/* Refund Request Technical Details (if exists) */}
              {selectedReq.refundRequest && (
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2 tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-stone-900">Registro de Reembolso Vinculado</span>
                    {renderRefundStatus(selectedReq.refundRequest.status)}
                  </div>
                  <div className="text-stone-600 space-y-1">
                    <p>
                      Valor elegível: <strong>{selectedReq.formattedRefundAmount}</strong> · Provedor:{' '}
                      <strong>{selectedReq.refundRequest.providerName}</strong>
                    </p>
                    {selectedReq.refundRequest.providerRefundId && (
                      <p>ID Estorno Provedor: <code>{selectedReq.refundRequest.providerRefundId}</code></p>
                    )}
                    {selectedReq.refundRequest.failureReason && (
                      <p className="text-rose-700 font-medium">
                        Motivo de falha/alerta: {selectedReq.refundRequest.failureReason}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Transition History */}
              {Array.isArray(selectedReq.history) && selectedReq.history.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase text-stone-500 block">
                    Histórico de Transições e Auditoria
                  </span>
                  <div className="border border-stone-200 rounded-xl divide-y divide-stone-100">
                    {selectedReq.history.map((h: any, idx: number) => (
                      <div key={idx} className="p-3 flex items-start justify-between gap-4 text-xs">
                        <div>
                          <strong className="text-stone-900 font-semibold">{h.note}</strong>
                          <span className="text-stone-500 block text-[11px]">
                            Ator: {h.actor} · Status Cancelamento: {h.toStatus} · Status Reembolso: {h.refundStatus}
                          </span>
                        </div>
                        <span className="text-stone-500 text-[11px] tabular-nums shrink-0">
                          {formatDateTime(h.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Decision Form if PENDING */}
              {selectedReq.status === 'PENDING' && (
                <form onSubmit={handleConfirmDecision} className="p-4 sm:p-5 rounded-2xl bg-stone-100/80 border border-stone-200 space-y-4">
                  <h4 className="text-sm font-bold text-stone-900">Registrar Decisão Administrativa</h4>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisionAction('APPROVE')}
                      className={`flex-1 min-h-[42px] py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all ${
                        decisionAction === 'APPROVE'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      Aprovar Cancelamento (Liberar Horário)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisionAction('REJECT')}
                      className={`flex-1 min-h-[42px] py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all ${
                        decisionAction === 'REJECT'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      Rejeitar Solicitação (Manter Agendamento)
                    </button>
                  </div>

                  {decisionAction === 'APPROVE' && !selectedReq.isWithinPolicy && selectedReq.paidDepositCents > 0 && (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={approveExceptionRefund}
                        onChange={(e) => setApproveExceptionRefund(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
                      />
                      <span className="text-xs text-stone-700">
                        <strong>Aprovar reembolso manual por exceção:</strong> Mesmo fora do prazo de{' '}
                        {selectedReq.policyHoursLimit}h, autorizar a devolução do sinal de{' '}
                        {selectedReq.formattedPaidDeposit}.
                      </span>
                    </label>
                  )}

                  {decisionAction && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Justificativa da decisão (obrigatória, visível no histórico da cliente):
                        </label>
                        <textarea
                          rows={2}
                          value={decisionNotes}
                          onChange={(e) => setDecisionNotes(e.target.value)}
                          placeholder="Informe o motivo da aprovação ou rejeição..."
                          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                          required
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={actionLoading}
                          className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-semibold transition-all"
                        >
                          {actionLoading ? 'Salvando decisão...' : 'Confirmar Decisão'}
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>

            <div className="p-4 sm:p-6 bg-stone-50 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-stone-500">
                {selectedReq.decidedBy && (
                  <span>
                    Decidido em {formatDateTime(selectedReq.decidedAt)} — "{selectedReq.decisionNotes}"
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {selectedReq.paidDepositCents > 0 &&
                  (selectedReq.refundStatus === 'APPROVED' || selectedReq.refundStatus === 'FAILED') && (
                    <button
                      disabled={actionLoading}
                      onClick={() => handleExecuteRefund(selectedReq)}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold transition-all"
                    >
                      {actionLoading ? 'Processando...' : 'Executar Reembolso no Mercado Pago'}
                    </button>
                  )}
                <button
                  onClick={() => setSelectedReq(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
