import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Calendar,
  User,
  Bell,
  LogOut,
  CalendarPlus,
  Shield,
  Home,
  Building2,
  ChevronDown,
  Check,
  AlertCircle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { CustomerHome } from './CustomerHome';
import { CustomerAppointments } from './CustomerAppointments';
import { CustomerPayments } from './CustomerPayments';
import { CustomerProfile } from './CustomerProfile';
import { CustomerNotifications } from './CustomerNotifications';
import { CustomerBookingModal } from './CustomerBookingModal';
import { CustomerAdvancedHub } from './CustomerAdvancedHub';
import { PixCheckoutModal } from '../PixCheckoutModal';
import { Service, Professional } from '../../types';

export type CustomerPortalTab = 'home' | 'appointments' | 'payments' | 'benefits' | 'profile' | 'notifications';

interface CustomerPortalProps {
  currentUser: any;
  business: any;
  services: Service[];
  professionals: Professional[];
  activeSlug?: string | null;
  activeSubRoute?: CustomerPortalTab;
  selectedAppointmentIdFromUrl?: string | null;
  isGenericRouteWithoutSlug?: boolean;
  onNavigateCustomerRoute?: (slug: string, subPath: string) => void;
  onLogout: () => void;
  onSwitchToAdmin?: () => void;
  onOpenPublicBookingSlug?: (slug: string) => void;
}

export function tabToSubPath(tab: CustomerPortalTab): string {
  switch (tab) {
    case 'home':
      return 'minha-conta';
    case 'appointments':
      return 'meus-agendamentos';
    case 'payments':
      return 'pagamentos';
    case 'benefits':
      return 'fidelidade';
    case 'profile':
      return 'perfil';
    case 'notifications':
      return 'notificacoes';
    default:
      return 'minha-conta';
  }
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  currentUser,
  business,
  services,
  professionals,
  activeSlug,
  activeSubRoute = 'home',
  selectedAppointmentIdFromUrl = null,
  isGenericRouteWithoutSlug = false,
  onNavigateCustomerRoute,
  onLogout,
  onSwitchToAdmin,
  onOpenPublicBookingSlug,
}) => {
  const cacheKey = `agenda_cust_portal_${activeSlug || 'default'}`;
  const initialCache = typeof window !== 'undefined' ? (() => {
    try {
      const saved = sessionStorage.getItem(cacheKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })() : null;

  const [activeTab, setActiveTab] = useState<CustomerPortalTab>(activeSubRoute);
  const [loading, setLoading] = useState<boolean>(!initialCache && !business);
  const [accessDeniedError, setAccessDeniedError] = useState<{ code: string; message: string } | null>(null);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [switchingStore, setSwitchingStore] = useState(false);

  // Customer specific state from server
  const [customer, setCustomer] = useState<any>(initialCache?.customer || null);
  const [portalBusiness, setPortalBusiness] = useState<any>(initialCache?.business || business);
  const [storeServices, setStoreServices] = useState<Service[]>(initialCache?.services || services);
  const [storeProfessionals, setStoreProfessionals] = useState<Professional[]>(initialCache?.professionals || professionals);
  const [linkedEstablishments, setLinkedEstablishments] = useState<any[]>(initialCache?.linkedEstablishments || []);
  const [pendingDeposits, setPendingDeposits] = useState<any[]>(initialCache?.pendingDeposits || []);
  const [appointments, setAppointments] = useState<{ upcoming: any[]; past: any[]; all: any[]; pendingDeposits?: any[] }>({
    upcoming: initialCache?.appointments?.upcoming || [],
    past: initialCache?.appointments?.past || [],
    all: initialCache?.appointments?.all || [],
    pendingDeposits: initialCache?.appointments?.pendingDeposits || [],
  });
  const [payments, setPayments] = useState<any[]>(initialCache?.payments || []);
  const [notifications, setNotifications] = useState<any[]>(initialCache?.notifications || []);

  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [pixAppointment, setPixAppointment] = useState<any>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingTenantId, setBookingTenantId] = useState<string | undefined>(undefined);

  const isFetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const lastFetchedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveTab(activeSubRoute);
  }, [activeSubRoute]);

  const effectiveSlug = activeSlug || portalBusiness?.slug || business?.slug || 'agenda-beauty-sp';
  const activeBusiness = portalBusiness || business;
  const showAdvancedAndLoyalty = Boolean(activeBusiness?.enableAdvancedFeatures);

  useEffect(() => {
    if (activeTab === 'benefits' && !showAdvancedAndLoyalty) {
      setActiveTab('home');
    }
  }, [activeTab, showAdvancedAndLoyalty]);

  useEffect(() => {
    if (typeof window !== 'undefined' && effectiveSlug) {
      try {
        localStorage.setItem('agenda_last_store_slug', effectiveSlug);
      } catch {}
    }
  }, [effectiveSlug]);

  const navigateTabWithSlug = useCallback(
    (tab: CustomerPortalTab, appointmentForDetail?: any | null) => {
      setActiveTab(tab);
      if (appointmentForDetail !== undefined) {
        setSelectedAppointment(appointmentForDetail);
      } else if (tab !== 'appointments') {
        setSelectedAppointment(null);
      }

      if (onNavigateCustomerRoute && effectiveSlug) {
        if (tab === 'appointments' && appointmentForDetail?.id) {
          onNavigateCustomerRoute(effectiveSlug, `agendamentos/${appointmentForDetail.id}`);
        } else {
          onNavigateCustomerRoute(effectiveSlug, tabToSubPath(tab));
        }
      }
    },
    [onNavigateCustomerRoute, effectiveSlug]
  );

  const fetchCustomerData = useCallback(async () => {
    if (isFetchingRef.current) return;
    const now = Date.now();
    if (activeSlug && activeSlug === lastFetchedSlugRef.current && now - lastFetchTimeRef.current < 6000) {
      return;
    }

    isFetchingRef.current = true;
    lastFetchTimeRef.current = now;
    lastFetchedSlugRef.current = activeSlug || null;

    // Only show full-screen loader if we have NO business data at all
    if (!portalBusiness && !business) {
      setLoading(true);
    }
    setAccessDeniedError(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers = new Headers();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('x-session-token', token);
      }
      if (activeSlug) {
        headers.set('x-tenant-slug', activeSlug);
      }

      // First fetch my-stores to know all permanent links and active business fallback
      const myStoresUrl = activeSlug
        ? `/api/v1/customer/my-stores?slug=${encodeURIComponent(activeSlug)}`
        : '/api/v1/customer/my-stores';
      const storesRes = await fetch(myStoresUrl, { headers, credentials: 'include' });
      const storesJson = await storesRes.json().catch(() => ({}));
      const myStores: any[] = storesJson?.data?.stores || [];
      setLinkedEstablishments(myStores);

      if (storesJson?.data?.business) {
        setPortalBusiness((prev: any) => prev || storesJson.data.business);
      } else if (storesJson?.data?.activeStore) {
        setPortalBusiness((prev: any) => prev || storesJson.data.activeStore);
      }

      // Handle generic route without slug:
      // 1 store -> update URL to that store's slug AND continue loading its data
      // 2+ stores -> show store selector (handled in render below)
      if (isGenericRouteWithoutSlug && !activeSlug) {
        if (myStores.length === 1 && onNavigateCustomerRoute && myStores[0]?.slug) {
          onNavigateCustomerRoute(myStores[0].slug, tabToSubPath(activeSubRoute));
        } else if (myStores.length >= 2) {
          setLoading(false);
          isFetchingRef.current = false;
          return;
        }
      }

      const targetSlug =
        activeSlug ||
        myStores[0]?.slug ||
        storesJson?.data?.activeSlug ||
        business?.slug ||
        '';
      const slugQuery = targetSlug ? `?slug=${encodeURIComponent(targetSlug)}` : '';
      if (targetSlug) {
        headers.set('x-tenant-slug', targetSlug);
      }

      const [profileRes, appsRes, paysRes, notifsRes, catalogRes] = await Promise.all([
        fetch(`/api/v1/customer/me${slugQuery}`, { headers, credentials: 'include' }),
        fetch(`/api/v1/customer/appointments${slugQuery}`, { headers, credentials: 'include' }),
        fetch(`/api/v1/customer/payments${slugQuery}`, { headers, credentials: 'include' }),
        fetch(`/api/v1/customer/notifications${slugQuery}`, { headers, credentials: 'include' }),
        fetch(`/api/v1/customer/catalog${slugQuery}`, { headers, credentials: 'include' }),
      ]);

      const [profileData, appsData, paysData, notifsData, catalogData] = await Promise.all([
        profileRes.json().catch(() => ({})),
        appsRes.json().catch(() => ({})),
        paysRes.json().catch(() => ({})),
        notifsRes.json().catch(() => ({})),
        catalogRes.json().catch(() => ({})),
      ]);

      let finalBusiness = portalBusiness || business;
      let finalServices = storeServices;
      let finalProfessionals = storeProfessionals;
      let finalCustomer = customer;
      let finalAppointments = appointments;
      let finalPayments = payments;
      let finalNotifications = notifications;

      if (catalogData?.success && catalogData?.data) {
        if (catalogData.data.business) {
          finalBusiness = catalogData.data.business;
          setPortalBusiness(catalogData.data.business);
          const resolvedBizSlug = catalogData.data.business.slug;
          if (resolvedBizSlug && typeof window !== 'undefined') {
            try {
              localStorage.setItem('agenda_last_store_slug', resolvedBizSlug);
            } catch {}
          }
          if (
            resolvedBizSlug &&
            activeSlug &&
            activeSlug.toLowerCase() !== resolvedBizSlug.toLowerCase() &&
            onNavigateCustomerRoute
          ) {
            onNavigateCustomerRoute(resolvedBizSlug, tabToSubPath(activeSubRoute));
          }
        }
        if (Array.isArray(catalogData.data.services)) {
          finalServices = catalogData.data.services;
          setStoreServices(catalogData.data.services);
        }
        if (Array.isArray(catalogData.data.professionals)) {
          finalProfessionals = catalogData.data.professionals;
          setStoreProfessionals(catalogData.data.professionals);
        }
      }

      if (profileRes.status === 401) {
        setLoading(false);
        onLogout();
        return;
      }

      if (profileRes.status === 403 || profileRes.status === 404) {
        setAccessDeniedError({
          code: profileData.code || 'STORE_LINK_REQUIRED',
          message:
            profileData.error ||
            'Você não possui vínculo cadastrado com este estabelecimento.',
        });
        setLoading(false);
        return;
      }

      if (profileData.success && profileData.data?.customer) {
        finalCustomer = profileData.data.customer;
        setCustomer(profileData.data.customer);
        if (profileData.data?.business) {
          finalBusiness = profileData.data.business;
          setPortalBusiness(profileData.data.business);
        }
        if (Array.isArray(profileData.data?.linkedEstablishments)) {
          setLinkedEstablishments(profileData.data.linkedEstablishments);
        }
        if (Array.isArray(profileData.data?.pendingDeposits)) {
          setPendingDeposits(profileData.data.pendingDeposits);
        }
      } else if (!customer) {
        finalCustomer = {
          id: currentUser?.id || 'cli-me',
          name: currentUser?.name || 'Cliente',
          email: currentUser?.email || '',
          phone: currentUser?.phone || '',
          contactPreference: 'WHATSAPP',
        };
        setCustomer(finalCustomer);
      }

      if (appsData.success && appsData.data) {
        const allList = appsData.data.all || [];
        finalAppointments = {
          upcoming: appsData.data.upcoming || [],
          past: appsData.data.past || [],
          all: allList,
          pendingDeposits: appsData.data.pendingDeposits || [],
        };
        setAppointments(finalAppointments);
        if (Array.isArray(appsData.data.pendingDeposits)) {
          setPendingDeposits(appsData.data.pendingDeposits);
        }

        // Sync selectedAppointment if URL specifies an appointment ID or if one is already open
        if (selectedAppointmentIdFromUrl) {
          const found = allList.find((a: any) => a.id === selectedAppointmentIdFromUrl);
          if (found) {
            setSelectedAppointment(found);
            setActiveTab('appointments');
          }
        } else if (selectedAppointment?.id) {
          const refreshed = allList.find((a: any) => a.id === selectedAppointment.id);
          setSelectedAppointment(refreshed || null);
        }
      }

      if (paysData.success && paysData.data) {
        finalPayments = paysData.data || [];
        setPayments(finalPayments);
      }

      if (notifsData.success && notifsData.data) {
        finalNotifications = notifsData.data || [];
        setNotifications(finalNotifications);
      }

      // Save fresh data into session cache for instant future loads
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              business: finalBusiness,
              services: finalServices,
              professionals: finalProfessionals,
              customer: finalCustomer,
              appointments: finalAppointments,
              payments: finalPayments,
              notifications: finalNotifications,
              linkedEstablishments: myStores,
              timestamp: Date.now(),
            })
          );
        } catch {}
      }
    } catch (err) {
      console.error('Error fetching customer portal data:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [activeSlug, isGenericRouteWithoutSlug, currentUser?.id, business?.slug]);

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  // Also sync when selectedAppointmentIdFromUrl changes within loaded appointments
  useEffect(() => {
    if (selectedAppointmentIdFromUrl && appointments.all.length > 0) {
      const found = appointments.all.find((a: any) => a.id === selectedAppointmentIdFromUrl);
      if (found) {
        setSelectedAppointment(found);
        setActiveTab('appointments');
      }
    } else if (!selectedAppointmentIdFromUrl && activeSubRoute !== 'appointments') {
      setSelectedAppointment(null);
    }
  }, [selectedAppointmentIdFromUrl, appointments.all, activeSubRoute]);

  const handleSwitchStore = async (targetSlug: string) => {
    setStoreMenuOpen(false);
    if (!targetSlug) return;
    setSwitchingStore(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('x-session-token', token);
      }

      const res = await fetch('/api/v1/customer/switch-store', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ slug: targetSlug }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        if (json.token) {
          localStorage.setItem('agenda_token', json.token);
        }
        if (json.data?.business) {
          setPortalBusiness(json.data.business);
        }
        setSelectedAppointment(null);
        const nextSubPath = tabToSubPath(activeTab);
        if (onNavigateCustomerRoute) {
          onNavigateCustomerRoute(targetSlug, nextSubPath);
        }
      }
    } catch (e) {
      console.error('Failed to switch store:', e);
    } finally {
      setSwitchingStore(false);
    }
  };

  const handleUpdateProfile = async (data: any) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('x-session-token', token);
      }
      if (effectiveSlug) {
        headers.set('x-tenant-slug', effectiveSlug);
      }

      const slugQuery = effectiveSlug ? `?slug=${encodeURIComponent(effectiveSlug)}` : '';
      const res = await fetch(`/api/v1/customer/me${slugQuery}`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const resData = await res.json().catch(() => ({}));
      if (resData.success) {
        await fetchCustomerData();
        return { success: true };
      }
      return { success: false, error: resData.error || 'Erro ao atualizar dados' };
    } catch {
      return { success: false, error: 'Erro de comunicação com o servidor' };
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (effectiveSlug) headers.set('x-tenant-slug', effectiveSlug);

      await fetch(`/api/v1/customer/notifications/${id}/read`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (effectiveSlug) headers.set('x-tenant-slug', effectiveSlug);

      await fetch('/api/v1/customer/notifications/read-all', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAppointment = async (appointmentData: any) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('x-session-token', token);
      }
      if (effectiveSlug) {
        headers.set('x-tenant-slug', effectiveSlug);
      }

      const res = await fetch('/api/v1/customer/appointments', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          tenantId: appointmentData.tenantId || activeBusiness?.id,
          slug: effectiveSlug,
          serviceId: appointmentData.serviceId,
          professionalId: appointmentData.professionalId,
          dateTime: appointmentData.dateTime,
          notes: appointmentData.notes,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (result.success) {
        await fetchCustomerData();
        if (
          result.data &&
          result.data.status === 'PENDING_PAYMENT' &&
          Number(result.data.depositAmountCents ?? result.data.snapshotDepositCents ?? 0) > 0
        ) {
          setPixAppointment(result.data);
        }
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error || 'Erro ao agendar horário' };
    } catch {
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  };

  const handleContinuePayment = useCallback(
    (app: any) => {
      navigateTabWithSlug('appointments', app);
      setPixAppointment(app);
    },
    [navigateTabWithSlug]
  );

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const nextAppointment = appointments.upcoming[0] || null;
  const hasMultipleStores = linkedEstablishments.length >= 2;

  if ((loading && !portalBusiness && !business) || switchingStore) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto animate-pulse">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-stone-600 text-xs font-medium">
            {switchingStore ? 'Alternando ambiente da loja...' : 'Carregando painel do estabelecimento...'}
          </p>
        </div>
      </div>
    );
  }

  // Case: Generic route accessed without slug and customer has 2+ linked stores -> show "Minhas Lojas" selector
  if (isGenericRouteWithoutSlug && !activeSlug && linkedEstablishments.length >= 2) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                  Conta Única · Agenda Beauty
                </span>
                <h1 className="text-xl font-bold text-stone-900 font-serif">Minhas Lojas</h1>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
            Selecione abaixo qual estabelecimento vinculado à sua conta você deseja acessar agora:
          </p>

          <div className="space-y-3">
            {linkedEstablishments.map((store: any) => (
              <button
                key={store.tenantId || store.id}
                onClick={() => handleSwitchStore(store.slug)}
                className="w-full flex items-center justify-between gap-4 p-4 rounded-2xl border border-stone-200 hover:border-rose-400 hover:bg-rose-50/40 text-left transition-all group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {store.logoUrl ? (
                    <img
                      src={store.logoUrl}
                      alt={store.name}
                      className="w-11 h-11 rounded-xl object-cover border border-stone-200 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-stone-900 group-hover:bg-rose-600 text-white flex items-center justify-center font-serif font-bold text-base shrink-0 transition-colors">
                      {store.name?.charAt(0) || 'L'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-stone-900 group-hover:text-rose-700 truncate">
                      {store.name}
                    </h3>
                    <p className="text-xs text-stone-500 truncate">
                      {store.address || `/agendar/${store.slug}`}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Case: Customer manually accessed /agendar/:slug/minha-conta for a store where she has NO permanent link
  if (accessDeniedError) {
    const handleConfirmStoreLink = async () => {
      if (!activeSlug) return;
      setLoading(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
          headers.set('x-session-token', token);
        }
        await fetch(`/api/v1/public/tenants/${encodeURIComponent(activeSlug)}/link`, {
          method: 'POST',
          headers,
          credentials: 'include',
        });
        await fetchCustomerData();
      } catch {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 text-center shadow-sm space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-stone-900 font-serif">
              Sem vínculo com este estabelecimento
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              {accessDeniedError.message}
            </p>
          </div>

          {linkedEstablishments.length > 0 && (
            <div className="text-left space-y-2 pt-2 border-t border-stone-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                Minhas Lojas Vinculadas
              </span>
              {linkedEstablishments.map((store: any) => (
                <button
                  key={store.tenantId || store.id}
                  onClick={() => handleSwitchStore(store.slug)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-rose-50 border border-stone-200 hover:border-rose-300 text-xs font-semibold text-stone-900 transition-all"
                >
                  <span>{store.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-rose-600" />
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2.5 pt-2">
            {activeSlug && (
              <button
                onClick={handleConfirmStoreLink}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>Vincular minha conta e acessar esta loja</span>
              </button>
            )}

            {activeSlug && onOpenPublicBookingSlug && (
              <button
                onClick={() => onOpenPublicBookingSlug(activeSlug)}
                className="w-full py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ir para página de agendamento desta loja</span>
              </button>
            )}

            <button
              onClick={onLogout}
              className="w-full py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-24 md:pb-8 flex flex-col font-sans overflow-x-hidden">
      {/* Top Bar Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Active Establishment & "Minhas Lojas" Switcher */}
          <div className="flex items-center gap-2.5 min-w-0 relative">
            {activeBusiness?.logoUrl ? (
              <img
                src={activeBusiness.logoUrl}
                alt={activeBusiness.name}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover border border-stone-200 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-400 text-white flex items-center justify-center font-serif font-bold text-sm shadow-xs shrink-0">
                {activeBusiness?.name?.charAt(0) || 'A'}
              </div>
            )}

            {hasMultipleStores ? (
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setStoreMenuOpen((prev) => !prev)}
                  data-testid="minhas-lojas-menu-button"
                  className="group flex flex-col items-start text-left min-w-0"
                >
                  <span className="text-[10px] font-bold text-rose-600 tracking-wide uppercase inline-flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    <span>Minhas Lojas ({linkedEstablishments.length})</span>
                    <ChevronDown className="w-3 h-3 transition-transform group-hover:translate-y-0.5" />
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-stone-900 truncate max-w-[160px] sm:max-w-[220px]">
                    {activeBusiness?.name || 'Estabelecimento'}
                  </span>
                </button>

                {storeMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setStoreMenuOpen(false)}
                    />
                    <div
                      data-testid="minhas-lojas-dropdown"
                      className="absolute left-0 top-12 z-50 w-72 bg-white rounded-2xl border border-stone-200 shadow-xl p-2 space-y-1"
                    >
                      <div className="px-3 py-2 border-b border-stone-100">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                          Minhas Lojas Vinculadas
                        </span>
                        <p className="text-[11px] text-stone-500">
                          Alterne entre os estabelecimentos nos quais você possui cadastro
                        </p>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1 space-y-1">
                        {linkedEstablishments.map((store: any) => {
                          const isCurrent =
                            store.slug === effectiveSlug || store.tenantId === activeBusiness?.id;
                          return (
                            <button
                              key={store.tenantId || store.id}
                              type="button"
                              onClick={() => handleSwitchStore(store.slug)}
                              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-colors ${
                                isCurrent
                                  ? 'bg-rose-50 text-rose-900 font-bold border border-rose-200'
                                  : 'hover:bg-stone-100 text-stone-700 font-medium'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {store.logoUrl ? (
                                  <img
                                    src={store.logoUrl}
                                    alt={store.name}
                                    className="w-7 h-7 rounded-lg object-cover shrink-0"
                                  />
                                ) : (
                                  <div
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-serif font-bold text-xs shrink-0 ${
                                      isCurrent
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-stone-200 text-stone-700'
                                    }`}
                                  >
                                    {store.name?.charAt(0) || 'L'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="block truncate">{store.name}</span>
                                  <span className="block text-[10px] text-stone-500 truncate">
                                    /agendar/{store.slug}
                                  </span>
                                </div>
                              </div>
                              {isCurrent && <Check className="w-4 h-4 text-rose-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="min-w-0">
                <span className="text-[10px] sm:text-xs font-semibold text-rose-600 tracking-wide uppercase block truncate">
                  Área da Cliente
                </span>
                <h1 className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                  {activeBusiness?.name || 'Portal da Cliente'}
                </h1>
              </div>
            )}
          </div>

          {/* Desktop Navigation (Strictly Slug-Scoped) */}
          <nav className="hidden md:flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
            <button
              onClick={() => navigateTabWithSlug('home', null)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'home'
                  ? 'bg-white text-stone-950 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Início
            </button>
            <button
              onClick={() => navigateTabWithSlug('appointments', null)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'appointments'
                  ? 'bg-white text-stone-950 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Meus Agendamentos
            </button>
            <button
              onClick={() => navigateTabWithSlug('payments', null)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'payments'
                  ? 'bg-white text-stone-950 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Pagamentos
            </button>
            {showAdvancedAndLoyalty && (
              <button
                onClick={() => navigateTabWithSlug('benefits', null)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'benefits'
                    ? 'bg-white text-stone-950 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Fidelidade
              </button>
            )}
            <button
              onClick={() => navigateTabWithSlug('profile', null)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'profile'
                  ? 'bg-white text-stone-950 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Meus Dados
            </button>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Notifications Button */}
            <button
              onClick={() => navigateTabWithSlug('notifications', null)}
              className={`relative p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors ${
                activeTab === 'notifications'
                  ? 'bg-stone-100 text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
              title="Notificações"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-600"></span>
              )}
            </button>

            {/* Book Button */}
            <button
              onClick={() => {
                setBookingTenantId(activeBusiness?.id || 'biz-1');
                setIsBookingOpen(true);
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-all active:scale-[0.98]"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>Novo Agendamento</span>
            </button>

            {/* Switch to Admin if authorized */}
            {onSwitchToAdmin && (
              <button
                onClick={onSwitchToAdmin}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] sm:text-xs font-medium transition-all"
                title="Voltar ao Painel da Administração"
              >
                <Shield className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span className="hidden sm:inline">Painel Salão</span>
                <span className="sm:hidden">Salão</span>
              </button>
            )}

            {/* Logout */}
            <button
              onClick={onLogout}
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6">
        {activeTab === 'home' && (
          <CustomerHome
            customer={customer}
            business={activeBusiness}
            nextAppointment={nextAppointment}
            appointments={appointments}
            payments={payments}
            pendingDeposits={pendingDeposits}
            onNavigateTab={(tab: string) => navigateTabWithSlug(tab as CustomerPortalTab, null)}
            onOpenBooking={() => {
              setBookingTenantId(activeBusiness?.id || 'biz-1');
              setIsBookingOpen(true);
            }}
            onOpenPix={(app) => setPixAppointment(app)}
            onSelectAppointment={(app) => navigateTabWithSlug('appointments', app)}
            onContinuePayment={handleContinuePayment}
          />
        )}

        {activeTab === 'appointments' && (
          <CustomerAppointments
            appointments={appointments}
            business={activeBusiness}
            selectedAppointment={selectedAppointment}
            onSelectAppointment={(app) => navigateTabWithSlug('appointments', app)}
            onCloseDetail={() => navigateTabWithSlug('appointments', null)}
            onOpenBooking={() => {
              setBookingTenantId(activeBusiness?.id || 'biz-1');
              setIsBookingOpen(true);
            }}
            onOpenPix={(app) => setPixAppointment(app)}
            onRefresh={fetchCustomerData}
          />
        )}

        {activeTab === 'payments' && (
          <CustomerPayments
            payments={payments}
            onOpenPix={(app) => setPixAppointment(app)}
            onOpenBooking={() => {
              setBookingTenantId(activeBusiness?.id || 'biz-1');
              setIsBookingOpen(true);
            }}
          />
        )}

        {activeTab === 'benefits' && showAdvancedAndLoyalty && (
          <CustomerAdvancedHub
            customer={customer}
            services={storeServices}
            professionals={storeProfessionals}
            pastAppointments={appointments.past}
            onRefreshPortal={fetchCustomerData}
          />
        )}

        {activeTab === 'profile' && (
          <CustomerProfile
            customer={customer}
            business={activeBusiness}
            onUpdateProfile={handleUpdateProfile}
          />
        )}

        {activeTab === 'notifications' && (
          <CustomerNotifications
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Strictly Slug-Scoped) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-1.5 py-1 pb-safe flex items-center justify-between shadow-lg">
        <button
          onClick={() => navigateTabWithSlug('home', null)}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 min-h-[48px] rounded-lg text-[10px] font-medium transition-colors ${
            activeTab === 'home' ? 'text-rose-600 font-bold' : 'text-stone-600'
          }`}
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="mt-0.5 truncate max-w-full">Início</span>
        </button>

        <button
          onClick={() => {
            setBookingTenantId(activeBusiness?.id || 'biz-1');
            setIsBookingOpen(true);
          }}
          aria-label="Novo Agendamento"
          className="flex flex-col items-center justify-center w-11 h-11 -mt-3.5 mx-1 rounded-full bg-rose-600 text-white shadow-md active:scale-95 transition-transform shrink-0"
        >
          <CalendarPlus className="w-5 h-5" />
        </button>

        <button
          onClick={() => navigateTabWithSlug('appointments', null)}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 min-h-[48px] rounded-lg text-[10px] font-medium transition-colors ${
            activeTab === 'appointments' ? 'text-rose-600 font-bold' : 'text-stone-600'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span className="mt-0.5 truncate max-w-full">Meus Agendamentos</span>
        </button>

        <button
          onClick={() => navigateTabWithSlug('profile', null)}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 min-h-[48px] rounded-lg text-[10px] font-medium transition-colors ${
            activeTab === 'profile' ? 'text-rose-600 font-bold' : 'text-stone-600'
          }`}
        >
          <User className="w-4 h-4 shrink-0" />
          <span className="mt-0.5 truncate max-w-full">Perfil</span>
        </button>
      </nav>

      {/* Modals */}
      <CustomerBookingModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        customer={customer}
        business={activeBusiness}
        initialTenantId={bookingTenantId || activeBusiness?.id}
        services={storeServices}
        professionals={storeProfessionals}
        existingAppointments={appointments.all}
        onSubmit={handleCreateAppointment}
      />

      {pixAppointment && (
        <PixCheckoutModal
          appointment={pixAppointment}
          onClose={() => {
            setPixAppointment(null);
            fetchCustomerData();
          }}
          onPaymentConfirmed={() => {
            fetchCustomerData();
          }}
        />
      )}
    </div>
  );
};
