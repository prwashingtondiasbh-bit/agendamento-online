import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  Clock,
  Tag,
  Package,
  Gift,
  Star,
  CheckCircle2,
  AlertCircle,
  Send,
  XCircle,
} from 'lucide-react';
import { Service, Professional } from '../../types';

interface CustomerAdvancedHubProps {
  customer: any;
  services: Service[];
  professionals: Professional[];
  pastAppointments: any[];
  onRefreshPortal: () => void;
}

const formatBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);

export const CustomerAdvancedHub: React.FC<CustomerAdvancedHubProps> = ({
  customer,
  services,
  professionals,
  pastAppointments,
  onRefreshPortal,
}) => {
  const [section, setSection] = useState<'loyalty' | 'waitlist' | 'packages' | 'reviews'>('loyalty');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Loyalty state
  const [loyaltyProgram, setLoyaltyProgram] = useState<any>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number>(0);
  const [loyaltyStatement, setLoyaltyStatement] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);

  // Waitlist state
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);
  const [wlServiceId, setWlServiceId] = useState(services[0]?.id || 'serv-1');
  const [wlProfessionalId, setWlProfessionalId] = useState('');
  const [wlDate, setWlDate] = useState(new Date().toISOString().slice(0, 10));
  const [wlPeriod, setWlPeriod] = useState<'MORNING' | 'AFTERNOON' | 'NIGHT' | 'ANY'>('ANY');
  const [wlNotes, setWlNotes] = useState('');

  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.id === wlServiceId)) {
      setWlServiceId(services[0].id);
    }
  }, [services, wlServiceId]);

  // Packages & Gift cards state
  const [myPackages, setMyPackages] = useState<any[]>([]);
  const [giftCodeInput, setGiftCodeInput] = useState('');
  const [giftCardLookupResult, setGiftCardLookupResult] = useState<any>(null);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [couponResult, setCouponResult] = useState<any>(null);

  // Reviews state
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const getHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-session-token', token);
    }
    return headers;
  };

  const fetchHubData = useCallback(async () => {
    if (!customer?.id) return;
    try {
      const headers = getHeaders();
      const [progRes, stmtRes, wlRes, pkgRes, revRes] = await Promise.all([
        fetch('/api/v1/advanced/loyalty/program', { headers, credentials: 'include' }),
        fetch(`/api/v1/advanced/loyalty/clients/${customer.id}`, { headers, credentials: 'include' }),
        fetch('/api/v1/advanced/waitlist', { headers, credentials: 'include' }),
        fetch(`/api/v1/advanced/packages/customer?clientId=${customer.id}`, { headers, credentials: 'include' }),
        fetch('/api/v1/advanced/reviews', { headers, credentials: 'include' }),
      ]);

      const [progJson, stmtJson, wlJson, pkgJson, revJson] = await Promise.all([
        progRes.json().catch(() => ({})),
        stmtRes.json().catch(() => ({})),
        wlRes.json().catch(() => ({})),
        pkgRes.json().catch(() => ({})),
        revRes.json().catch(() => ({})),
      ]);

      if (progJson.success) {
        setLoyaltyProgram(progJson.data.program);
        setRewards(progJson.data.rewards || []);
      }
      if (stmtJson.success) {
        setLoyaltyBalance(stmtJson.data.balance || 0);
        setLoyaltyStatement(stmtJson.data.ledger || []);
      }
      if (wlJson.success) {
        setWaitlistEntries(wlJson.data || []);
      }
      if (pkgJson.success) {
        setMyPackages(pkgJson.data || []);
      }
      if (revJson.success) {
        setReviews(revJson.data.reviews || []);
      }
    } catch (e) {
      console.error('Error loading CustomerAdvancedHub:', e);
    }
  }, [customer?.id]);

  useEffect(() => {
    fetchHubData();
  }, [fetchHubData]);

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch('/api/v1/advanced/waitlist', {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        clientId: customer.id,
        serviceId: wlServiceId,
        professionalId: wlProfessionalId || null,
        desiredDate: wlDate,
        preferredPeriod: wlPeriod,
        notes: wlNotes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Você entrou na lista de espera para a data desejada!' });
      setWlNotes('');
      fetchHubData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao entrar na lista de espera' });
    }
  };

  const handleAcceptWaitlistOffer = async (offerId: string) => {
    setFeedback(null);
    const res = await fetch(`/api/v1/advanced/waitlist/offers/${offerId}/accept`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Vaga confirmada! Seu agendamento foi criado com sucesso.' });
      fetchHubData();
      onRefreshPortal();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Não foi possível confirmar a vaga.' });
    }
  };

  const handleCancelWaitlist = async (entryId: string) => {
    setFeedback(null);
    const res = await fetch(`/api/v1/advanced/waitlist/${entryId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Solicitação de espera cancelada.' });
      fetchHubData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao cancelar.' });
    }
  };

  const handleRedeemReward = async (rewardId: string) => {
    setFeedback(null);
    const res = await fetch('/api/v1/advanced/loyalty/redeem', {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        clientId: customer.id,
        rewardId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Recompensa resgatada com sucesso!' });
      fetchHubData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao resgatar recompensa' });
    }
  };

  const handleLookupGiftCard = async () => {
    if (!giftCodeInput.trim()) return;
    setFeedback(null);
    const res = await fetch(`/api/v1/advanced/gift-cards/lookup/${encodeURIComponent(giftCodeInput.trim())}`, {
      headers: getHeaders(),
      credentials: 'include',
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setGiftCardLookupResult(json.data);
    } else {
      setGiftCardLookupResult(null);
      setFeedback({ type: 'error', text: json.error || 'Cartão-presente não encontrado' });
    }
  };

  const handleValidateCoupon = async () => {
    if (!couponCodeInput.trim()) return;
    setFeedback(null);
    const firstService = services[0] as any;
    const res = await fetch('/api/v1/advanced/coupons/validate', {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        code: couponCodeInput.trim(),
        clientId: customer.id,
        serviceId: firstService?.id || 'serv-1',
        orderAmountCents: firstService?.priceCents || 10000,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setCouponResult(json.data);
    } else {
      setCouponResult(null);
      setFeedback({ type: 'error', text: json.error || 'Cupom inválido' });
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointmentId) return;
    setFeedback(null);
    const res = await fetch('/api/v1/advanced/reviews', {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        appointmentId: selectedAppointmentId,
        rating,
        comment: reviewComment,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Avaliação enviada! Obrigado pelo seu feedback.' });
      setReviewComment('');
      setSelectedAppointmentId('');
      fetchHubData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao registrar avaliação' });
    }
  };

  const completedUnreviewedAppointments = pastAppointments.filter(
    (app) => app.status === 'COMPLETED' && !reviews.some((r) => r.appointmentId === app.id)
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Sub-navigation */}
      <div className="bg-white rounded-2xl border border-stone-200 p-2 flex flex-wrap gap-2 shadow-xs">
        <button
          onClick={() => setSection('loyalty')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            section === 'loyalty' ? 'bg-rose-600 text-white' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Meus Pontos & Fidelidade</span>
        </button>
        <button
          onClick={() => setSection('waitlist')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            section === 'waitlist' ? 'bg-rose-600 text-white' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Lista de Espera</span>
        </button>
        <button
          onClick={() => setSection('packages')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            section === 'packages' ? 'bg-rose-600 text-white' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Pacotes, Cupons & Gift Card</span>
        </button>
        <button
          onClick={() => setSection('reviews')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            section === 'reviews' ? 'bg-rose-600 text-white' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Star className="w-4 h-4" />
          <span>Avaliar Atendimentos</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-stone-400 hover:text-stone-700">
            ✕
          </button>
        </div>
      )}

      {/* 1. LOYALTY */}
      {section === 'loyalty' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-rose-600 to-pink-600 text-white rounded-2xl p-6 shadow-md">
            <span className="text-xs uppercase tracking-wider text-rose-100 font-semibold">
              {loyaltyProgram?.name || 'Programa de Fidelidade'}
            </span>
            <p className="text-4xl font-bold mt-2">{loyaltyBalance} pts</p>
            <p className="text-xs text-rose-100 mt-2">
              Pontos creditados automaticamente após confirmação oficial dos seus pagamentos.
            </p>

            <div className="mt-6 pt-4 border-t border-white/20 space-y-2">
              <p className="text-xs font-semibold text-white">Recompensas Disponíveis:</p>
              {rewards.map((rw) => {
                const cost = rw.pointsRequired ?? rw.pointsCost ?? 0;
                return (
                  <div
                    key={rw.id}
                    className="bg-white/10 rounded-xl p-3 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{rw.name}</p>
                      <p className="text-[11px] text-rose-100">{cost} pontos</p>
                    </div>
                    <button
                      disabled={loyaltyBalance < cost}
                      onClick={() => handleRedeemReward(rw.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        loyaltyBalance >= cost
                          ? 'bg-white text-rose-600 hover:bg-rose-50'
                          : 'bg-white/20 text-white/60 cursor-not-allowed'
                      }`}
                    >
                      Resgatar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl border border-stone-200 p-6">
            <h3 className="text-sm font-bold text-stone-900 mb-4">Extrato de Fidelidade</h3>
            {loyaltyStatement.length === 0 ? (
              <p className="text-xs text-stone-500">Nenhuma movimentação de pontos até o momento.</p>
            ) : (
              <div className="space-y-2.5">
                {loyaltyStatement.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-stone-800 block">
                        {item.description || item.reason}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {new Date(item.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <span
                      className={`font-bold text-sm ${
                        item.pointsDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {item.pointsDelta >= 0 ? `+${item.pointsDelta}` : item.pointsDelta} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. WAITLIST */}
      {section === 'waitlist' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <form
            onSubmit={handleJoinWaitlist}
            className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-stone-900">Entrar na Lista de Espera</h3>
            <p className="text-xs text-stone-500">
              Não encontrou horário livre? Avise sua preferência e notificaremos caso surja uma vaga.
            </p>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Serviço Desejado</label>
              <select
                value={wlServiceId}
                onChange={(e) => setWlServiceId(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Profissional (Opcional)</label>
              <select
                value={wlProfessionalId}
                onChange={(e) => setWlProfessionalId(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
              >
                <option value="">Qualquer profissional</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Data Desejada</label>
              <input
                type="date"
                value={wlDate}
                onChange={(e) => setWlDate(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Período</label>
              <select
                value={wlPeriod}
                onChange={(e) => setWlPeriod(e.target.value as any)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
              >
                <option value="ANY">Qualquer horário</option>
                <option value="MORNING">Manhã</option>
                <option value="AFTERNOON">Tarde</option>
                <option value="NIGHT">Noite</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Observações</label>
              <input
                type="text"
                value={wlNotes}
                onChange={(e) => setWlNotes(e.target.value)}
                placeholder="Ex: Posso chegar em 20 min"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
            >
              Entrar na Fila de Espera
            </button>
          </form>

          <div className="md:col-span-2 bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900">Minhas Solicitações na Lista de Espera</h3>
            {waitlistEntries.length === 0 ? (
              <p className="text-xs text-stone-500">Você não possui solicitações ativas na lista de espera.</p>
            ) : (
              <div className="space-y-3">
                {waitlistEntries.map((entry) => {
                  const srv = services.find((s) => s.id === entry.serviceId);
                  const pendingOffer = (entry.offers || []).find((o: any) => o.status === 'PENDING');
                  return (
                    <div
                      key={entry.id}
                      className="p-4 rounded-xl border border-stone-200 bg-stone-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-900">
                            {srv?.name || entry.serviceId}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-200 text-stone-700">
                            {entry.status}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1">
                          Data desejada: <strong>{entry.desiredDate}</strong> • Período: {entry.preferredPeriod}
                        </p>
                        {pendingOffer && (
                          <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                            <p className="font-bold">🎉 Vaga disponível para você!</p>
                            <p>
                              Horário: {new Date(pendingOffer.slotDateTime).toLocaleString('pt-BR')} (Expira às{' '}
                              {new Date(pendingOffer.expiresAt).toLocaleTimeString('pt-BR')})
                            </p>
                            <button
                              onClick={() => handleAcceptWaitlistOffer(pendingOffer.id)}
                              className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                            >
                              Aceitar Vaga e Confirmar Reserva
                            </button>
                          </div>
                        )}
                      </div>
                      {(entry.status === 'WAITING' || entry.status === 'OFFERED') && (
                        <button
                          onClick={() => handleCancelWaitlist(entry.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 self-start sm:self-center"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Sair da fila</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. PACKAGES, COUPONS & GIFT CARDS */}
      {section === 'packages' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-rose-500" />
              Meus Pacotes de Sessões
            </h3>
            {myPackages.length === 0 ? (
              <p className="text-xs text-stone-500">Você ainda não possui pacotes contratados.</p>
            ) : (
              <div className="space-y-3">
                {myPackages.map((cp) => (
                  <div key={cp.id} className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900">
                        {cp.package?.name || cp.packageId}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          cp.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cp.status}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 mt-1">
                      Sessões utilizadas: <strong>{cp.usedSessions}</strong> de{' '}
                      <strong>{cp.totalSessions}</strong> (Restam{' '}
                      <strong>{cp.totalSessions - cp.usedSessions}</strong>)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {/* Gift Card Balance Check */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Gift className="w-4 h-4 text-rose-500" />
                Consultar Saldo de Cartão-Presente
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={giftCodeInput}
                  onChange={(e) => setGiftCodeInput(e.target.value.toUpperCase())}
                  placeholder="GC-XXXX-XXXX-XXXX"
                  className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono uppercase"
                />
                <button
                  onClick={handleLookupGiftCard}
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold"
                >
                  Consultar
                </button>
              </div>
              {giftCardLookupResult && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <p className="font-bold">Código: {giftCardLookupResult.code}</p>
                  <p>
                    Saldo disponível: <strong>{formatBRL(giftCardLookupResult.remainingBalanceCents)}</strong> (Status:{' '}
                    {giftCardLookupResult.status})
                  </p>
                </div>
              )}
            </div>

            {/* Coupon Simulation */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-rose-500" />
                Simular Cupom Promocional
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponCodeInput}
                  onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ex: BEMVINDA15"
                  className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono uppercase"
                />
                <button
                  onClick={handleValidateCoupon}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                >
                  Validar
                </button>
              </div>
              {couponResult && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <p className="font-bold">Cupom {couponResult.code} válido!</p>
                  <p>
                    Desconto estimado: <strong>{formatBRL(couponResult.discountCents)}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. REVIEWS */}
      {section === 'reviews' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <form
            onSubmit={handleSubmitReview}
            className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-stone-900">Avaliar Atendimento Concluído</h3>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Selecione o Atendimento Concluído
              </label>
              <select
                value={selectedAppointmentId}
                onChange={(e) => setSelectedAppointmentId(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                required
              >
                <option value="">Selecione...</option>
                {completedUnreviewedAppointments.map((app) => (
                  <option key={app.id} value={app.id}>
                    {new Date(app.dateTime).toLocaleDateString('pt-BR')} -{' '}
                    {app.service?.name || app.serviceId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Nota (1 a 5 estrelas)</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`p-2 rounded-lg border ${
                      rating >= star
                        ? 'bg-amber-50 border-amber-300 text-amber-500'
                        : 'bg-stone-50 border-stone-200 text-stone-300'
                    }`}
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Comentário</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                placeholder="Conte como foi sua experiência..."
                className="w-full rounded-xl border border-stone-300 p-3 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={!selectedAppointmentId}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar Avaliação</span>
            </button>
          </form>

          <div className="md:col-span-2 bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900">Minhas Avaliações Enviadas</h3>
            {reviews.filter((r) => r.clientId === customer?.id).length === 0 ? (
              <p className="text-xs text-stone-500">Você ainda não enviou avaliações.</p>
            ) : (
              <div className="space-y-3">
                {reviews
                  .filter((r) => r.clientId === customer?.id)
                  .map((rev) => (
                    <div key={rev.id} className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-500 font-bold text-xs">
                          {'★'.repeat(rev.rating)}
                          {'☆'.repeat(5 - rev.rating)}
                        </span>
                        <span className="text-[11px] text-stone-400">
                          {new Date(rev.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      {rev.comment && <p className="text-xs text-stone-700 mt-1.5">{rev.comment}</p>}
                      {rev.ownerReply && (
                        <div className="mt-2 p-2.5 rounded-lg bg-white border border-stone-200 text-xs text-stone-600">
                          <strong>Resposta do Salão:</strong> {rev.ownerReply}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
