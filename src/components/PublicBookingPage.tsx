import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  MapPin,
  Phone,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  User,
  Lock,
  Mail,
  QrCode,
  ShieldCheck,
  Building2,
  Loader2,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { PixCheckoutModal } from './PixCheckoutModal';
import { updateDocumentSeo } from '../utils/seo';
import { AntiBotChallenge, BotGuardPayload } from './auth/AntiBotChallenge';

interface PublicBookingPageProps {
  slug: string;
  currentUser?: { id: string; name: string; email: string; role?: string } | null;
  onAuthenticated?: (userData: any, token?: string) => void;
  onGoToCustomerPortal?: (subPath?: string) => void;
  onLogout?: () => void;
  onBack?: () => void;
}

export const PublicBookingPage: React.FC<PublicBookingPageProps> = ({
  slug,
  currentUser,
  onAuthenticated,
  onGoToCustomerPortal,
  onLogout,
}) => {
  const cacheKey = `agenda_store_cache_${slug}`;
  const [establishmentData, setEstablishmentData] = useState<any>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(() => !establishmentData);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  const storageKey = `agenda_public_draft_${slug}`;
  const [serviceId, setServiceId] = useState<string>(() => establishmentData?.services?.[0]?.id || '');
  const [professionalId, setProfessionalId] = useState<string>(() => establishmentData?.professionals?.[0]?.id || '');
  const [date, setDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [time, setTime] = useState<string>('14:00');
  const [notes, setNotes] = useState<string>('');
  const [acceptedPolicy, setAcceptedPolicy] = useState<boolean>(true);

  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string>('');
  const [createdAppointment, setCreatedAppointment] = useState<any>(null);
  const [pixModalOpen, setPixModalOpen] = useState(false);

  // Inline Auth Modal state when visitor is not logged in
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [botResetKey, setBotResetKey] = useState(0);
  const [botGuard, setBotGuard] = useState<BotGuardPayload>({
    website: '',
    challengeToken: '',
    challengeAnswer: '',
    formRenderedAt: Date.now(),
  });

  const availableHours = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

  // Load establishment by slug
  useEffect(() => {
    let cancelled = false;
    if (!establishmentData) {
      setLoading(true);
    }
    setNotFoundError(null);

    fetch(`/api/v1/public/tenants/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          if (!establishmentData) {
            setNotFoundError(json.error || 'Estabelecimento não encontrado.');
          }
          setLoading(false);
          return;
        }
        setEstablishmentData(json.data);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(json.data));
        } catch {}
        const est = json.data?.establishment || json.data?.business;
        const resolvedSlug = est?.slug || slug;
        if (est?.name) {
          updateDocumentSeo({
            title: `${est.name} – Agendar Horário Online | Agenda Beauty`,
            description:
              est.description ||
              `Agende seu horário online em ${est.name} com rapidez, escolha de profissional e confirmação imediata.`,
            canonicalPath: `/agendar/${resolvedSlug}`,
            storeName: est.name,
            phone: est.phone,
            address: est.address,
            openTime: est.openTime,
            closeTime: est.closeTime,
            logoUrl: est.logoUrl,
          });
        }
        if (typeof window !== 'undefined' && resolvedSlug) {
          try {
            localStorage.setItem('agenda_last_store_slug', resolvedSlug);
            if (resolvedSlug.toLowerCase() !== slug.toLowerCase() && window.history?.replaceState) {
              window.history.replaceState({}, '', `/agendar/${resolvedSlug}`);
            }
          } catch {}
        }

        // Restore draft if saved before login/register
        let savedDraft: any = null;
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (raw) savedDraft = JSON.parse(raw);
        } catch {}

        const services = json.data?.services || [];
        const profs = json.data?.professionals || [];

        if (savedDraft?.serviceId && services.some((s: any) => s.id === savedDraft.serviceId)) {
          setServiceId(savedDraft.serviceId);
        } else if (services.length > 0) {
          setServiceId(services[0].id);
        }

        if (savedDraft?.professionalId && profs.some((p: any) => p.id === savedDraft.professionalId)) {
          setProfessionalId(savedDraft.professionalId);
        } else if (profs.length > 0) {
          setProfessionalId(profs[0].id);
        }

        if (savedDraft?.date) setDate(savedDraft.date);
        if (savedDraft?.time) setTime(savedDraft.time);
        if (savedDraft?.notes) setNotes(savedDraft.notes);

        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setNotFoundError('Não foi possível carregar os dados deste estabelecimento.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Persist draft selection in sessionStorage
  useEffect(() => {
    if (!serviceId && !professionalId) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ serviceId, professionalId, date, time, notes })
      );
    } catch {}
  }, [serviceId, professionalId, date, time, notes, storageKey]);

  // Load available slots when service/professional/date changes
  useEffect(() => {
    if (!establishmentData?.bookingAvailable || !serviceId || !professionalId || !date) return;
    let cancelled = false;
    fetch(
      `/api/v1/public/tenants/${encodeURIComponent(slug)}/available-slots?serviceId=${encodeURIComponent(serviceId)}&professionalId=${encodeURIComponent(professionalId)}&date=${encodeURIComponent(date)}`
    )
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success && Array.isArray(json.data?.occupiedSlots)) {
          const occ = json.data.occupiedSlots.map((o: any) => o.time);
          setOccupiedSlots(occ);
          if (occ.includes(time)) {
            const firstFree = availableHours.find((h) => !occ.includes(h));
            if (firstFree) setTime(firstFree);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, establishmentData?.bookingAvailable, serviceId, professionalId, date]);

  const executeBooking = async (overrideToken?: string) => {
    setBookingError('');
    setSubmitting(true);
    try {
      const token = overrideToken || (typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-session-token'] = token;
      }

      const dateTime = new Date(`${date}T${time}:00-03:00`).toISOString();
      const res = await fetch(`/api/v1/public/tenants/${encodeURIComponent(slug)}/appointments`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          serviceId,
          professionalId,
          dateTime,
          notes: notes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setBookingError(json.error || 'Não foi possível concluir o agendamento.');
        return;
      }

      try {
        sessionStorage.removeItem(storageKey);
      } catch {}

      setCreatedAppointment(json.data);
      if (json.data?.status === 'PENDING_PAYMENT' && Number(json.data?.depositAmountCents || 0) > 0) {
        setPixModalOpen(true);
      }
    } catch {
      setBookingError('Erro de conexão ao confirmar seu agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmClick = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');

    if (!serviceId || !professionalId || !date || !time) {
      setBookingError('Selecione serviço, profissional, data e horário.');
      return;
    }
    if (occupiedSlots.includes(time)) {
      setBookingError('Este horário já está ocupado. Escolha outro horário disponível.');
      return;
    }

    const est = establishmentData?.establishment;
    if (est?.requireDeposit && !acceptedPolicy) {
      setBookingError('Confirme que está de acordo com a política de cancelamento do estabelecimento.');
      return;
    }

    const hasToken = Boolean(currentUser || (typeof window !== 'undefined' && localStorage.getItem('agenda_token')));
    if (!hasToken) {
      setAuthModalOpen(true);
      return;
    }

    await executeBooking();
  };

  const handleInlineAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const activeSlug = establishmentData?.establishment?.slug || slug;
      const activeTenantId = establishmentData?.establishment?.id || 'biz-1';
      const endpoint = authMode === 'login' ? '/api/v1/auth/login' : '/api/v1/customer/auth/register';
      const payload =
        authMode === 'login'
          ? {
              email: authEmail.trim(),
              password: authPassword,
              slug: activeSlug,
              tenantId: activeTenantId,
              portalType: 'CUSTOMER',
              botGuard,
            }
          : {
              name: authName.trim(),
              email: authEmail.trim(),
              phone: authPhone.trim(),
              password: authPassword,
              slug: activeSlug,
              tenantId: activeTenantId,
              botGuard,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setBotResetKey((k) => k + 1);
        setAuthError(json.error || 'Falha na autenticação. Verifique os dados informados.');
        return;
      }

      if (json.token) {
        localStorage.setItem('agenda_token', json.token);
      }
      const userObj = json.data?.user || {
        id: json.data?.customer?.userId || 'user-cust',
        name: authName || json.data?.customer?.name || 'Cliente',
        email: authEmail,
        role: json.data?.role || 'CUSTOMER',
      };
      if (onAuthenticated) {
        onAuthenticated(
          {
            ...userObj,
            role: userObj.role || 'CUSTOMER',
            linkedEstablishments: json.data?.linkedEstablishments || [],
          },
          json.token
        );
      }
      setAuthModalOpen(false);
    } catch {
      setAuthError('Erro de conexão com o servidor.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoToCustomerPortal = async (subPath: string) => {
    if (!onGoToCustomerPortal) return;
    if (currentUser && slug) {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
          headers.set('x-session-token', token);
        }
        const linkRes = await fetch(`/api/v1/public/tenants/${encodeURIComponent(slug)}/link`, {
          method: 'POST',
          headers,
          credentials: 'include',
        });
        const linkJson = await linkRes.json().catch(() => ({}));
        if (linkJson?.data?.token && typeof window !== 'undefined') {
          localStorage.setItem('agenda_token', linkJson.data.token);
        }
      } catch {
        // Proceed to portal navigation even if link check fails
      }
    }
    onGoToCustomerPortal(subPath);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
          <p className="text-sm font-medium text-stone-600">Carregando página do estabelecimento...</p>
        </div>
      </div>
    );
  }

  if (notFoundError || !establishmentData) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-stone-900 font-serif">Estabelecimento não encontrado</h1>
          <p className="text-xs text-stone-600 leading-relaxed">
            {notFoundError || 'O link público acessado não corresponde a nenhum estabelecimento ativo.'}
          </p>
        </div>
      </div>
    );
  }

  const { establishment, services = [], professionals = [], bookingAvailable, unavailableReason } = establishmentData;
  const selectedService = services.find((s: any) => s.id === serviceId) || services[0];
  const priceCents = Number(selectedService?.priceCents || 0);
  const requireDeposit = Boolean(establishment?.requireDeposit);
  const rawDepPercent =
    selectedService?.depositPercent !== undefined && selectedService?.depositPercent !== null
      ? Number(selectedService.depositPercent)
      : Number(establishment?.defaultDeposit ?? 30);
  const depositPercent = requireDeposit ? Math.max(0, Math.min(100, rawDepPercent)) : 0;
  const depositCents = requireDeposit && depositPercent > 0 ? Math.round((priceCents * depositPercent) / 100) : 0;
  const balanceCents = Math.max(0, priceCents - depositCents);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-16">
      {/* Top Bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-serif font-bold text-sm shrink-0">
              {establishment.name?.charAt(0) || 'A'}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-stone-900 truncate">{establishment.name}</h1>
              <p className="text-[11px] text-stone-500 truncate">Agendamento Online Oficial · Agenda Beauty</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <span className="hidden md:inline text-xs text-stone-600">
                  Olá, <strong className="text-stone-900">{currentUser.name.split(' ')[0]}</strong>
                </span>
                {onGoToCustomerPortal && (
                  <>
                    <button
                      onClick={() => handleGoToCustomerPortal('minha-conta')}
                      className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors"
                    >
                      Minha Conta
                    </button>
                    <button
                      onClick={() => handleGoToCustomerPortal('meus-agendamentos')}
                      className="px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors"
                    >
                      Meus Agendamentos
                    </button>
                  </>
                )}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                    title="Sair da conta"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthMode('login');
                  setAuthModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors"
              >
                Entrar / Criar Conta
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Establishment Hero Card */}
        <section className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                <span>{requireDeposit ? 'Reserva com Sinal Pix' : 'Confirmação Imediata sem Sinal'}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 font-serif">{establishment.name}</h2>
              {establishment.description && (
                <p className="text-xs sm:text-sm text-stone-600 max-w-2xl leading-relaxed">
                  {establishment.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-stone-600">
                {establishment.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{establishment.address}</span>
                  </span>
                )}
                {establishment.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{establishment.phone}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>
                    Atendimento: {establishment.openTime || '08:00'} às {establishment.closeTime || '20:00'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* If establishment is blocked/unavailable */}
        {!bookingAvailable ? (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 sm:p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-amber-950 font-serif">
              Agendamento Online Temporariamente Indisponível
            </h3>
            <p className="text-xs sm:text-sm text-amber-900 max-w-lg mx-auto leading-relaxed">
              {unavailableReason ||
                'Este estabelecimento não está recebendo novos agendamentos online neste momento. Entre em contato diretamente pelo telefone do local.'}
            </p>
          </div>
        ) : createdAppointment ? (
          /* Booking Confirmation State */
          <section className="bg-white rounded-3xl border border-emerald-200 p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  {createdAppointment.status === 'CONFIRMED' ? 'Horário Confirmado' : 'Aguardando Pagamento do Sinal'}
                </span>
                <h3 className="text-xl font-bold text-stone-900 font-serif">
                  {createdAppointment.status === 'CONFIRMED'
                    ? 'Seu agendamento foi confirmado com sucesso!'
                    : 'Reserva pré-agendada! Conclua o pagamento do sinal Pix.'}
                </h3>
                <p className="text-xs text-stone-600">
                  Estabelecimento: <strong>{establishment.name}</strong>
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-stone-500 block">Serviço</span>
                <strong className="text-stone-900">{selectedService?.name}</strong>
              </div>
              <div>
                <span className="text-stone-500 block">Data e Horário</span>
                <strong className="text-stone-900">
                  {new Date(createdAppointment.dateTime).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </strong>
              </div>
              <div>
                <span className="text-stone-500 block">Valor Total</span>
                <strong className="text-stone-900">
                  {(Number(createdAppointment.totalAmountCents || priceCents) / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </strong>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
              {createdAppointment.status === 'PENDING_PAYMENT' && Number(createdAppointment.depositAmountCents || 0) > 0 && (
                <button
                  onClick={() => setPixModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Pagar Sinal via Pix</span>
                </button>
              )}
              {onGoToCustomerPortal && (
                <button
                  onClick={() => handleGoToCustomerPortal('meus-agendamentos')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Meus Agendamentos em {establishment.name}</span>
                </button>
              )}
              <button
                onClick={() => setCreatedAppointment(null)}
                className="px-4 py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-all"
              >
                Fazer Outro Agendamento
              </button>
            </div>
          </section>
        ) : (
          /* Booking Form */
          <form onSubmit={handleConfirmClick} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {bookingError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              {/* Step 1: Services */}
              <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 space-y-4">
                <h3 className="text-base font-bold text-stone-900 font-serif">1. Escolha o Serviço</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services.map((serv: any) => {
                    const isSelected = serv.id === serviceId;
                    const formattedPrice = (Number(serv.priceCents || 0) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    });
                    return (
                      <div
                        key={serv.id}
                        onClick={() => setServiceId(serv.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                          isSelected
                            ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/15'
                            : 'border-stone-200 hover:border-stone-300 bg-white'
                        }`}
                      >
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                            {serv.category}
                          </span>
                          <h4 className="text-sm font-bold text-stone-900 mt-0.5">{serv.name}</h4>
                          {serv.description && (
                            <p className="text-[11px] text-stone-500 mt-1 line-clamp-2">{serv.description}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                          <span className="text-stone-500">{serv.durationMin} min</span>
                          <strong className="text-stone-900 font-bold tabular-nums">{formattedPrice}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Professional & Date/Time */}
              <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 space-y-4">
                <h3 className="text-base font-bold text-stone-900 font-serif">
                  2. Profissional, Data e Horário
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Profissional
                    </label>
                    <select
                      value={professionalId}
                      onChange={(e) => setProfessionalId(e.target.value)}
                      className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-rose-500"
                    >
                      {professionals.map((prof: any) => (
                        <option key={prof.id} value={prof.id}>
                          {prof.name} {prof.specialty ? `— ${prof.specialty}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Data do Atendimento
                    </label>
                    <input
                      type="date"
                      value={date}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-2">
                    Horários Disponíveis ({date})
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {availableHours.map((h) => {
                      const isOccupied = occupiedSlots.includes(h);
                      const isSelected = time === h && !isOccupied;
                      return (
                        <button
                          key={h}
                          type="button"
                          disabled={isOccupied}
                          onClick={() => setTime(h)}
                          className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all tabular-nums ${
                            isOccupied
                              ? 'bg-stone-100 border-stone-200 text-stone-400 line-through cursor-not-allowed'
                              : isSelected
                              ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                              : 'bg-white border-stone-200 text-stone-800 hover:border-rose-300'
                          }`}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Observações para o estabelecimento (opcional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Preferência de cor, formato, observação..."
                    className="w-full px-3.5 py-2.5 min-h-[42px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Summary & Submit */}
            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 space-y-4 sticky top-22">
                <h3 className="text-base font-bold text-stone-900 font-serif">Resumo da Reserva</h3>
                <div className="space-y-2.5 text-xs border-b border-stone-100 pb-4">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Estabelecimento:</span>
                    <strong className="text-stone-900 text-right">{establishment.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Serviço:</span>
                    <strong className="text-stone-900 text-right">{selectedService?.name || '-'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Data e Hora:</span>
                    <strong className="text-stone-900 tabular-nums">
                      {date} às {time}
                    </strong>
                  </div>
                </div>

                <div className="space-y-2 text-xs tabular-nums">
                  <div className="flex justify-between text-stone-700">
                    <span>Valor Total do Serviço:</span>
                    <strong className="text-stone-900 text-sm">
                      {(priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                  </div>
                  {requireDeposit && depositCents > 0 ? (
                    <>
                      <div className="flex justify-between text-rose-700 font-medium">
                        <span>Sinal Pix agora ({depositPercent}%):</span>
                        <strong>
                          {(depositCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </strong>
                      </div>
                      <div className="flex justify-between text-stone-600">
                        <span>Restante no local:</span>
                        <strong>
                          {(balanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                      <strong>Sem exigência de sinal antecipado:</strong> a confirmação é imediata e o pagamento é feito diretamente no estabelecimento.
                    </div>
                  )}
                </div>

                {/* Política de Cancelamento & Instruções de Contato */}
                <div className="pt-2 border-t border-stone-100 space-y-2.5">
                  <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2.5 text-[11px]">
                    <div className="flex items-center justify-between font-semibold text-stone-800">
                      <span className="flex items-center gap-1.5 text-stone-900 font-bold">
                        <ShieldCheck className="w-4 h-4 text-rose-600" />
                        <span>Política de Cancelamento e Reembolso</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 tabular-nums">
                        Prazo: {establishment.cancellationHoursLimit || 6}h antes
                      </span>
                    </div>

                    <p className="text-stone-600 leading-relaxed">
                      {establishment.cancellationPolicyText ||
                        'Cancelamentos ou reagendamentos solicitados com no mínimo o prazo de antecedência configurado pelo estabelecimento garantem a remarcação sem custos ou a solicitação de estorno integral do valor pago a título de sinal via Pix, processado em até 1 dia útil. Solicitações efetuadas após o prazo limite de antecedência acarretam a retenção do valor do sinal para cobertura da reserva exclusiva de horário e custos operacionais da profissional.'}
                    </p>

                    {establishment.cancellationContactInstructions && (
                      <div className="pt-2 border-t border-stone-200/60 flex items-start gap-1.5 text-stone-600">
                        <Phone className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <div className="leading-relaxed">
                          <strong className="text-stone-800 font-semibold">Contato do Estabelecimento: </strong>
                          <span>{establishment.cancellationContactInstructions}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {requireDeposit && (
                    <label className="flex items-start gap-2.5 pt-1 cursor-pointer text-[11px] text-stone-700 select-none">
                      <input
                        type="checkbox"
                        checked={acceptedPolicy}
                        onChange={(e) => setAcceptedPolicy(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-rose-600 rounded shrink-0 cursor-pointer"
                        required
                      />
                      <span className="leading-tight">
                        Li e concordo com a <strong>política de cancelamento e reembolso</strong> (antecedência mínima de{' '}
                        {establishment.cancellationHoursLimit || 6}h).
                      </span>
                    </label>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Confirmando...</span>
                    </>
                  ) : requireDeposit && depositCents > 0 ? (
                    <>
                      <QrCode className="w-4 h-4" />
                      <span>Confirmar e Gerar Sinal Pix</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar Agendamento</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </main>

      {/* Inline Login/Register Modal to preserve booking flow */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                  Identificação Rápida
                </span>
                <h3 className="text-lg font-bold text-stone-900 font-serif">
                  {authMode === 'login' ? 'Entre na sua conta' : 'Crie sua conta de cliente'}
                </h3>
              </div>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="text-xs text-stone-500 hover:text-stone-800 font-medium"
              >
                Fechar
              </button>
            </div>

            <div className="flex bg-stone-100 p-1 rounded-2xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setBotResetKey((k) => k + 1);
                }}
                className={`flex-1 py-2 rounded-xl transition-all ${
                  authMode === 'login'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Já tenho conta
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                  setBotResetKey((k) => k + 1);
                }}
                className={`flex-1 py-2 rounded-xl transition-all ${
                  authMode === 'register'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Criar conta de cliente
              </button>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {authError}
              </div>
            )}

            <form onSubmit={handleInlineAuth} className="space-y-3.5">
              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Seu Nome</label>
                    <input
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full px-3.5 py-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Seu WhatsApp / Telefone</label>
                    <input
                      type="text"
                      required
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3.5 py-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3.5 py-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Senha</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <AntiBotChallenge resetKey={botResetKey} theme="light" onChange={setBotGuard} />

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all"
              >
                {authLoading
                  ? 'Autenticando e confirmando...'
                  : authMode === 'login'
                  ? 'Entrar e Confirmar Agendamento'
                  : 'Cadastrar e Confirmar Agendamento'}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setAuthError('');
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                }}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                {authMode === 'login'
                  ? 'Ainda não tem conta? Cadastre-se rapidamente'
                  : 'Já possui uma conta? Faça login'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pix Checkout Modal if appointment requires deposit */}
      {createdAppointment && pixModalOpen && (
        <PixCheckoutModal
          appointment={createdAppointment}
          onClose={() => setPixModalOpen(false)}
          onPaymentConfirmed={() => {
            setCreatedAppointment((prev: any) => (prev ? { ...prev, status: 'CONFIRMED' } : prev));
          }}
        />
      )}
    </div>
  );
};
