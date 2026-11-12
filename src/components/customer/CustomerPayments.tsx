import React from 'react';
import {
  CreditCard,
  QrCode,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Calendar,
  User,
} from 'lucide-react';

interface CustomerPaymentsProps {
  payments: any[];
  onOpenPix: (appointment: any) => void;
  onOpenBooking: () => void;
}

export const CustomerPayments: React.FC<CustomerPaymentsProps> = ({
  payments,
  onOpenPix,
  onOpenBooking,
}) => {
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Pagamento Aprovado
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Aguardando Pagamento
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-100 text-stone-600 border border-stone-200">
            <AlertCircle className="w-3.5 h-3.5 text-stone-500" />
            Chave Expirada
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Reembolsado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-100 text-stone-700 border border-stone-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-stone-900 tracking-tight font-serif">
          Meus Pagamentos & Comprovantes
        </h2>
        <p className="text-xs text-stone-600 mt-0.5">
          Consulte o histórico de sinais pagos via Pix com validação automática do Mercado Pago.
        </p>
      </div>

      {/* Security info card */}
      <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-stone-600 space-y-1">
          <p className="font-semibold text-stone-800">
            Pagamentos 100% Seguros via Pix do Banco Central
          </p>
          <p className="leading-relaxed">
            O valor pago nesta plataforma refere-se ao <strong>sinal de reserva</strong> do seu horário. O saldo remanescente do serviço é quitado presencialmente no salão.
          </p>
        </div>
      </div>

      {/* Payments List */}
      {payments.length > 0 ? (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm hover:border-stone-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-stone-900">
                    Sinal de Reserva (Pix)
                  </span>
                  <span className="text-[11px] text-stone-400">·</span>
                  <span className="text-xs text-stone-600">
                    Ref: {payment.externalReference || payment.id}
                  </span>
                  <span className="text-[11px] text-stone-400">·</span>
                  {getStatusBadge(payment.status)}
                </div>

                {payment.appointmentSummary && (
                  <div className="text-xs text-stone-600 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-800">
                      {payment.appointmentSummary.serviceName}
                    </span>
                    <span className="text-stone-400">·</span>
                    <span>Profissional: {payment.appointmentSummary.profName}</span>
                    <span className="text-stone-400">·</span>
                    <span>Data: {formatDate(payment.appointmentSummary.dateTime)}</span>
                  </div>
                )}

                <div className="text-[11px] text-stone-600">
                  Transação registrada em {formatDate(payment.createdAt)}
                  {payment.approvedAt && ` · Aprovado em ${formatDate(payment.approvedAt)}`}
                </div>
              </div>

              {/* Amount and Action */}
              <div className="flex items-center justify-between md:justify-end gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-stone-100">
                <div className="text-right">
                  <span className="text-stone-600 block text-[11px]">Valor do Sinal</span>
                  <strong className="text-stone-900 font-bold text-base">
                    {payment.formattedAmount || 'R$ 0,00'}
                  </strong>
                </div>

                {payment.status === 'PENDING' && (
                  <button
                    onClick={() => onOpenPix(payment)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Pagar Pix</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-12 text-center space-y-4">
          <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto">
            <CreditCard className="w-6 h-6" />
          </div>
          <div className="max-w-sm mx-auto">
            <h3 className="text-base font-semibold text-stone-900">
              Nenhum pagamento registrado
            </h3>
            <p className="text-stone-600 text-xs mt-1">
              Assim que você realizar seu primeiro agendamento com pagamento de sinal via Pix, os comprovantes ficarão disponíveis aqui.
            </p>
          </div>
          <button
            onClick={onOpenBooking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Calendar className="w-4 h-4" />
            <span>Fazer Meu Primeiro Agendamento</span>
          </button>
        </div>
      )}
    </div>
  );
};
