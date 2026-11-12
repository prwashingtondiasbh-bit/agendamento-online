import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Copy,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  ShieldCheck,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Appointment } from '../types';

interface PixCheckoutModalProps {
  appointment: Appointment;
  onClose: () => void;
  onPaymentConfirmed?: () => void;
}

interface PaymentData {
  paymentId: string;
  appointmentId: string;
  amountCents: number;
  status: string;
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt: string;
}

export const PixCheckoutModal: React.FC<PixCheckoutModalProps> = ({
  appointment,
  onClose,
  onPaymentConfirmed,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(600); // default 10m
  const [isConfirmed, setIsConfirmed] = useState(appointment.status === 'CONFIRMED');
  const [isExpired, setIsExpired] = useState(false);

  // Generate or load payment
  useEffect(() => {
    let isMounted = true;
    async function loadPixPayment() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/v1/appointments/${appointment.id}/payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Não foi possível gerar a cobrança Pix');
        }

        if (isMounted) {
          setPaymentData(data.data);
          if (data.data.expiresAt) {
            const exp = new Date(data.data.expiresAt).getTime();
            const now = Date.now();
            const rawDiffSec = Math.max(0, Math.floor((exp - now) / 1000));
            const diffSec = Math.min(600, rawDiffSec);
            setTimeLeftSeconds(diffSec);
            if (rawDiffSec <= 0) setIsExpired(true);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Erro ao carregar Pix');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (appointment.status !== 'CONFIRMED') {
      loadPixPayment();
    } else {
      setIsConfirmed(true);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [appointment.id, appointment.status]);

  // Countdown timer
  useEffect(() => {
    if (isConfirmed || isExpired) return;

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isConfirmed, isExpired]);

  // Polling for confirmation
  useEffect(() => {
    if (isConfirmed || isExpired) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/appointments/${appointment.id}/payment-status`);
        const data = await res.json();
        if (data.success && data.data) {
          if (data.data.appointmentStatus === 'CONFIRMED' || data.data.paymentStatus === 'APPROVED') {
            setIsConfirmed(true);
            clearInterval(interval);
            if (onPaymentConfirmed) onPaymentConfirmed();
          } else if (data.data.appointmentStatus === 'EXPIRED') {
            setIsExpired(true);
            clearInterval(interval);
          }
        }
      } catch (e) {
        // Silently retry on next tick
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [appointment.id, isConfirmed, isExpired, onPaymentConfirmed]);

  const handleCopyPix = () => {
    if (paymentData?.qrCode) {
      navigator.clipboard.writeText(paymentData.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const amountFormatted = (
    (paymentData?.amountCents || appointment.depositAmountCents || 0) / 100
  ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden border border-gray-100 transition-all">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-500 to-pink-600 px-5 sm:px-6 py-4 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <QrCode className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
            <h3 className="font-semibold text-base sm:text-lg tracking-wide truncate">
              {isConfirmed ? 'Reserva Garantida!' : 'Pagamento do Sinal via Pix'}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="min-w-[40px] min-h-[40px] -mr-2 flex items-center justify-center text-white/80 hover:text-white rounded-xl transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="w-10 h-10 text-rose-500 animate-spin" />
              <p className="text-gray-600 font-medium text-sm text-center">
                Gerando cobrança Pix dinâmica com Mercado Pago...
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <p className="text-gray-900 font-semibold text-sm">{error}</p>
              <button
                onClick={onClose}
                className="min-h-[44px] mt-4 px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition"
              >
                Fechar
              </button>
            </div>
          )}

          {isConfirmed && !loading && (
            <div className="py-4 sm:py-6 text-center space-y-5 animate-scale-up">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12" />
              </div>
              <div>
                <h4 className="text-xl sm:text-2xl font-bold text-gray-900">Pagamento Confirmado!</h4>
                <p className="text-emerald-700 font-medium text-xs sm:text-sm mt-1">
                  Sinal recebido e validado com sucesso pelo Mercado Pago.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-left border border-gray-100 text-xs sm:text-sm space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Serviço:</span>
                  <span className="font-semibold text-gray-800 text-right">
                    {appointment.service?.name || 'Procedimento Beauty'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Profissional:</span>
                  <span className="font-semibold text-gray-800 text-right">
                    {appointment.professional?.name || 'Profissional'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Data e Horário:</span>
                  <span className="font-semibold text-gray-800 text-right">
                    {new Date(appointment.dateTime).toLocaleDateString('pt-BR')}{' '}
                    às {new Date(appointment.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-600">Sinal Pago:</span>
                  <span className="font-bold text-emerald-600">{amountFormatted}</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full min-h-[48px] py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition cursor-pointer"
              >
                Concluir e Ver Agenda
              </button>
            </div>
          )}

          {!isConfirmed && !loading && !error && (
            <div className="space-y-4 sm:space-y-5">
              {/* Price Banner */}
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] sm:text-xs uppercase font-bold tracking-wider text-rose-600">
                    Sinal de Reserva (30%)
                  </span>
                  <p className="text-xl sm:text-2xl font-black text-rose-950 mt-0.5">{amountFormatted}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end text-xs font-semibold text-gray-600 space-x-1">
                    <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Tempo restante:</span>
                  </div>
                  <span
                    className={`font-mono text-base sm:text-lg font-bold ${
                      timeLeftSeconds < 120 ? 'text-red-600 animate-pulse' : 'text-gray-800'
                    }`}
                  >
                    {formatTime(timeLeftSeconds)}
                  </span>
                </div>
              </div>

              {isExpired ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                  <p className="font-bold">Tempo para pagamento expirado!</p>
                  <p className="text-sm">
                    O bloqueio temporário deste horário foi liberado. Por favor, crie uma nova reserva.
                  </p>
                  <button
                    onClick={onClose}
                    className="min-h-[44px] mt-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700"
                  >
                    Voltar para Seleção
                  </button>
                </div>
              ) : (
                <>
                  {/* QR Code display */}
                  <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    {paymentData?.qrCodeBase64 ? (
                      <img
                        src={`data:image/png;base64,${paymentData.qrCodeBase64}`}
                        alt="QR Code Pix"
                        className="w-44 h-44 sm:w-48 sm:h-48 rounded-lg shadow-sm bg-white p-2"
                      />
                    ) : (
                      <div className="w-44 h-44 sm:w-48 sm:h-48 bg-white rounded-lg shadow flex items-center justify-center p-2 text-center text-xs text-gray-400">
                        Aponte a câmera do aplicativo do seu banco para o Pix
                      </div>
                    )}
                    <div className="flex items-center space-x-1 mt-2 text-xs text-gray-500 font-medium text-center">
                      <Sparkles className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>Confirmação automática em tempo real</span>
                    </div>
                  </div>

                  {/* Pix Copia e Cola */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                      Pix Copia e Cola
                    </label>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-rose-500">
                      <input
                        type="text"
                        readOnly
                        value={paymentData?.qrCode || ''}
                        className="flex-1 min-w-0 px-3 py-2.5 text-xs text-gray-700 font-mono bg-gray-50 outline-none truncate"
                      />
                      <button
                        onClick={handleCopyPix}
                        className={`min-h-[44px] px-4 py-2.5 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shrink-0 ${
                          copied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-rose-500 text-white hover:bg-rose-600'
                        }`}
                      >
                        {copied ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Security footer */}
                  <div className="flex items-center space-x-2 text-xs text-gray-500 justify-center pt-1 text-center">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Transação segura processada pelo Mercado Pago</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
