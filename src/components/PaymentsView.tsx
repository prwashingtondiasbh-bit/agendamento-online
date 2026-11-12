import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Filter,
  DollarSign,
  TrendingUp,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import { Payment } from '../types';
import { apiFetch } from '../App';

export const PaymentsView: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = statusFilter === 'ALL' ? '/api/v1/payments' : `/api/v1/payments?status=${statusFilter}`;
      const res = await apiFetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar lista de pagamentos');
      }
      setPayments(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar pagamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [statusFilter]);

  const handleReconcile = async (paymentId: string) => {
    try {
      setReconcilingId(paymentId);
      const res = await apiFetch(`/api/v1/payments/${paymentId}/reconcile`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro na reconciliação');
      }

      setToastMessage({
        text: data.message || 'Reconciliação concluída com sucesso!',
        type: 'success',
      });
      await fetchPayments();
    } catch (err: any) {
      setToastMessage({
        text: err.message || 'Falha na reconciliação com o Mercado Pago',
        type: 'error',
      });
    } finally {
      setReconcilingId(null);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Metrics
  const approvedPayments = payments.filter((p) => p.status === 'APPROVED');
  const totalApprovedCents = approvedPayments.reduce((sum, p) => sum + p.amountCents, 0);
  const pendingCount = payments.filter((p) => p.status === 'PENDING').length;
  const conversionRate = payments.length > 0 ? Math.round((approvedPayments.length / payments.length) * 100) : 0;

  const formatMoney = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Aprovado
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
            Pendente
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            <Clock className="w-3.5 h-3.5 mr-1 text-gray-500" />
            Expirado
          </span>
        );
      case 'CANCELLED':
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-50 p-4 rounded-xl shadow-lg border flex items-center space-x-3 transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight flex items-center space-x-2">
            <CreditCard className="w-6 h-6 sm:w-7 sm:h-7 text-rose-500 shrink-0" />
            <span>Gestão de Pagamentos Pix (Mercado Pago)</span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Controle financeiro de sinais de reservas, webhooks e reconciliação automática.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Total Sinais Recebidos</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatMoney(totalApprovedCents)}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">100% comprovado via Pix</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Transações Aprovadas</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{approvedPayments.length}</p>
            <p className="text-xs text-gray-500 mt-1">Reservas confirmadas</p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Sinais Pendentes</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{pendingCount}</p>
            <p className="text-xs text-amber-600 font-medium mt-1">Aguardando cliente</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Conversão de Reservas</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{conversionRate}%</p>
            <p className="text-xs text-teal-600 font-medium mt-1">Taxa de confirmação</p>
          </div>
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-sm font-semibold text-gray-700">
          <Filter className="w-4 h-4 text-gray-400" />
          <span>Filtrar por Status:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {['ALL', 'APPROVED', 'PENDING', 'EXPIRED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === st
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st === 'ALL'
                ? 'Todos'
                : st === 'APPROVED'
                ? 'Aprovados'
                : st === 'PENDING'
                ? 'Pendentes'
                : st === 'EXPIRED'
                ? 'Expirados'
                : 'Cancelados'}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
            <p className="text-sm font-medium">Carregando transações...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <Receipt className="w-12 h-12 mx-auto text-gray-300" />
            <p className="font-semibold text-gray-700">Nenhum pagamento encontrado</p>
            <p className="text-xs text-gray-400">
              Quando novos agendamentos forem realizados via Pix, as cobranças aparecerão aqui.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-100">
              {payments.map((payment) => (
                <div key={payment.id} className="p-4 space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">
                        {payment.appointment?.client?.name || 'Cliente'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {payment.appointment?.service?.name || 'Serviço Agendado'}
                      </div>
                    </div>
                    {getStatusBadge(payment.status)}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                      <div className="font-mono text-xs font-semibold text-gray-800">
                        {payment.providerPaymentId ? `MP #${payment.providerPaymentId}` : payment.id.substring(0, 12)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {new Date(payment.createdAt).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(payment.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-semibold text-gray-400 block">Sinal Pix</span>
                      <span className="font-bold text-sm text-gray-900 tabular-nums">
                        {formatMoney(payment.amountCents)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleReconcile(payment.id)}
                    disabled={reconcilingId === payment.id}
                    className="w-full min-h-[42px] inline-flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        reconcilingId === payment.id ? 'animate-spin' : ''
                      }`}
                    />
                    <span>{reconcilingId === payment.id ? 'Verificando no Mercado Pago...' : 'Reconciliar Pagamento'}</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-6">Identificador & Data</th>
                    <th className="py-3.5 px-6">Cliente & Serviço</th>
                    <th className="py-3.5 px-6">Valor do Sinal</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50/70 transition">
                      <td className="py-4 px-6">
                        <div className="font-mono text-xs font-semibold text-gray-900">
                          {payment.providerPaymentId ? `MP #${payment.providerPaymentId}` : payment.id.substring(0, 12)}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(payment.createdAt).toLocaleDateString('pt-BR')}{' '}
                          às {new Date(payment.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="font-medium text-gray-900">
                          {payment.appointment?.client?.name || 'Cliente'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {payment.appointment?.service?.name || 'Serviço Agendado'}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className="font-bold text-gray-900">
                          {formatMoney(payment.amountCents)}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        {getStatusBadge(payment.status)}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleReconcile(payment.id)}
                          disabled={reconcilingId === payment.id}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition disabled:opacity-50 cursor-pointer"
                          title="Consultar status no Mercado Pago"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              reconcilingId === payment.id ? 'animate-spin' : ''
                            }`}
                          />
                          <span>{reconcilingId === payment.id ? 'Verificando...' : 'Reconciliar'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
