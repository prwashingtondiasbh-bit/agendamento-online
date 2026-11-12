import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { AppointmentsView } from './components/AppointmentsView';
import { ClientsView } from './components/ClientsView';
import { ServicesView } from './components/ServicesView';
import { ProfessionalsView } from './components/ProfessionalsView';
import { SettingsView } from './components/SettingsView';
import { NewAppointmentModal, NewClientModal, ServiceModal, ProfessionalModal } from './components/Modals';
import { PaymentsView } from './components/PaymentsView';
import { CancellationsView } from './components/CancellationsView';
import { FinancialView } from './components/FinancialView';
import { WhatsAppView } from './components/WhatsAppView';
import { AdvancedView } from './components/AdvancedView';
import { PixCheckoutModal } from './components/PixCheckoutModal';
import { SuperAdminLoginScreen } from './components/auth/SuperAdminLoginScreen';
import { OwnerLoginScreen } from './components/auth/OwnerLoginScreen';
import { CustomerLoginScreen } from './components/auth/CustomerLoginScreen';
import { CustomerPortal } from './components/customer/CustomerPortal';
import { PublicBookingPage } from './components/PublicBookingPage';
import { MasterAdminPortal } from './components/MasterAdminPortal';
import { Business, Professional, Client, Service, Appointment, DashboardStats } from './types';
import { LogOut, UserCheck, Sparkles, Menu, ShieldAlert, Crown, ExternalLink, Building2 } from 'lucide-react';

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-session-token', token);
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
};

type CustomerPortalTab = 'home' | 'appointments' | 'payments' | 'benefits' | 'notifications' | 'profile';

interface RouteState {
  slug: string | null;
  isSuperAdminRoute: boolean;
  isOwnerRoute: boolean;
  isCustomerPortalSubRoute: boolean;
  isGenericCustomerRoute: boolean;
  customerSubRoute: CustomerPortalTab;
  appointmentId: string | null;
}

function mapPathSegmentToCustomerTab(segment: string): CustomerPortalTab | null {
  switch (segment) {
    case 'minha-conta':
    case 'painel':
      return 'home';
    case 'meus-agendamentos':
    case 'agendamentos':
    case 'historico':
      return 'appointments';
    case 'pagamentos':
    case 'sinais':
      return 'payments';
    case 'fidelidade':
    case 'beneficios':
      return 'benefits';
    case 'notificacoes':
      return 'notifications';
    case 'perfil':
      return 'profile';
    default:
      return null;
  }
}

function parseCurrentRoute(): RouteState {
  if (typeof window === 'undefined') {
    return {
      slug: null,
      isSuperAdminRoute: false,
      isOwnerRoute: false,
      isCustomerPortalSubRoute: false,
      isGenericCustomerRoute: false,
      customerSubRoute: 'home',
      appointmentId: null,
    };
  }
  const rawPath = window.location.pathname || '';
  const path = rawPath.toLowerCase();
  const search = (window.location.search || '').toLowerCase();

  const isSuperAdminRoute =
    path.startsWith('/super-admin-secreto') ||
    path.startsWith('/master-admin-secret') ||
    path.startsWith('/admin-master-secreto') ||
    path.startsWith('/gestor-master') ||
    search.includes('secret=super-admin') ||
    search.includes('master=1');

  const isOwnerRoute =
    path.startsWith('/acesso-lojista') ||
    path.startsWith('/portal-lojista') ||
    path.startsWith('/admin-login') ||
    path.startsWith('/login-lojista') ||
    search.includes('lojista=1');

  // Match /agendar/:slug or /agendar/:slug/:subroute or /agendar/:slug/agendamentos/:id
  const storeMatch = rawPath.match(/^\/(?:agendar|loja)\/([^/?#]+)(?:\/([^/?#]+))?(?:\/([^/?#]+))?/i);
  if (storeMatch && storeMatch[1]) {
    const slug = decodeURIComponent(storeMatch[1]).toLowerCase();
    const subSegment = storeMatch[2] ? decodeURIComponent(storeMatch[2]).toLowerCase() : '';
    const thirdSegment = storeMatch[3] ? decodeURIComponent(storeMatch[3]) : null;

    if (subSegment) {
      const mappedTab = mapPathSegmentToCustomerTab(subSegment);
      if (mappedTab) {
        return {
          slug,
          isSuperAdminRoute,
          isOwnerRoute,
          isCustomerPortalSubRoute: true,
          isGenericCustomerRoute: false,
          customerSubRoute: mappedTab,
          appointmentId: subSegment === 'agendamentos' && thirdSegment ? thirdSegment : null,
        };
      }
    }

    return {
      slug,
      isSuperAdminRoute,
      isOwnerRoute,
      isCustomerPortalSubRoute: false,
      isGenericCustomerRoute: false,
      customerSubRoute: 'home',
      appointmentId: null,
    };
  }

  // Generic customer portal paths without slug (e.g. /meus-agendamentos, /minha-conta)
  const genericMatch = path.match(/^\/(minha-conta|meus-agendamentos|agendamentos|pagamentos|fidelidade|notificacoes|perfil)(?:\/([^/?#]+))?/i);
  if (genericMatch && genericMatch[1]) {
    const mappedTab = mapPathSegmentToCustomerTab(genericMatch[1].toLowerCase()) || 'home';
    return {
      slug: null,
      isSuperAdminRoute,
      isOwnerRoute,
      isCustomerPortalSubRoute: false,
      isGenericCustomerRoute: true,
      customerSubRoute: mappedTab,
      appointmentId: genericMatch[2] || null,
    };
  }

  return {
    slug: null,
    isSuperAdminRoute,
    isOwnerRoute,
    isCustomerPortalSubRoute: false,
    isGenericCustomerRoute: false,
    customerSubRoute: 'home',
    appointmentId: null,
  };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'admin' | 'customer' | 'master_admin'>('admin');
  const [routeState, setRouteState] = useState<RouteState>(() => parseCurrentRoute());
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedAgendaProfessionalId, setSelectedAgendaProfessionalId] = useState<string>('ALL');

  const [business, setBusiness] = useState<Business | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [selectedPixAppointment, setSelectedPixAppointment] = useState<Appointment | null>(null);

  // Service modal state
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // Professional modal state
  const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setRouteState(parseCurrentRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((path: string) => {
    if (typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({}, '', path);
    }
    setRouteState(parseCurrentRoute());
  }, []);

  const openPublicBooking = useCallback((slug: string) => {
    navigateTo(`/agendar/${slug}`);
  }, [navigateTo]);

  const closePublicBooking = useCallback(() => {
    navigateTo('/');
  }, [navigateTo]);

  const openOwnerLogin = () => {
    navigateTo('/acesso-lojista');
  };

  const openSuperAdminLogin = () => {
    navigateTo('/super-admin-secreto');
  };

  const handleNavigateCustomerRoute = useCallback((targetSlug: string, subPath: string) => {
    navigateTo(`/agendar/${targetSlug}/${subPath}`);
  }, [navigateTo]);

  const fetchData = useCallback(async (roleOverride?: string) => {
    try {
      const effectiveRole = roleOverride || currentUser?.role;
      if (effectiveRole === 'CUSTOMER') {
        const [bizRes, servRes, profRes] = await Promise.all([
          apiFetch('/api/v1/business'),
          apiFetch('/api/v1/services?onlyActive=true'),
          apiFetch('/api/v1/professionals?onlyActive=true'),
        ]);
        const [bizData, servData, profData] = await Promise.all([
          bizRes.json().catch(() => ({})),
          servRes.json().catch(() => ({})),
          profRes.json().catch(() => ({})),
        ]);
        if (bizData.success) setBusiness(bizData.data);
        if (servData.success) setServices(servData.data || []);
        if (profData.success) setProfessionals(profData.data || []);
        return;
      }

      const [bizRes, statsRes, appRes, cliRes, servRes, profRes] = await Promise.all([
        apiFetch('/api/v1/business'),
        apiFetch('/api/v1/dashboard/stats'),
        apiFetch('/api/v1/appointments'),
        apiFetch('/api/v1/clients'),
        apiFetch('/api/v1/services'),
        apiFetch('/api/v1/professionals'),
      ]);

      const [bizData, statsData, appData, cliData, servData, profData] = await Promise.all([
        bizRes.json().catch(() => ({})),
        statsRes.json().catch(() => ({})),
        appRes.json().catch(() => ({})),
        cliRes.json().catch(() => ({})),
        servRes.json().catch(() => ({})),
        profRes.json().catch(() => ({})),
      ]);

      if (bizData.success) setBusiness(bizData.data);
      if (statsData.success) setStats(statsData.data);
      if (appData.success) setAppointments(appData.data || []);
      if (cliData.success) setClients(cliData.data || []);
      if (servData.success) setServices(servData.data || []);
      if (profData.success) setProfessionals(profData.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  }, [currentUser?.role]);

  const checkAuthAndFetchData = useCallback(async () => {
    try {
      const authRes = await apiFetch('/api/v1/auth/me');
      const authData = await authRes.json().catch(() => ({}));

      if (authData.success && authData.data?.user) {
        const u = authData.data.user;
        setCurrentUser(u);
        if (u.role === 'SUPER_ADMIN' || u.isMasterAdmin) {
          setViewMode('master_admin');
        } else if (u.role === 'CUSTOMER') {
          setViewMode('customer');
        }
        await fetchData(u.role);
      } else {
        if (authRes.status === 401) {
          localStorage.removeItem('agenda_token');
        }
        setCurrentUser(null);
      }
    } catch (e) {
      console.error('Auth verification failed:', e);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    checkAuthAndFetchData();
  }, [checkAuthAndFetchData]);

  const handleLogout = async () => {
    const loggingOutRole = currentUser?.role;
    const isSuper = loggingOutRole === 'SUPER_ADMIN' || currentUser?.isMasterAdmin || viewMode === 'master_admin' || routeState.isSuperAdminRoute;
    const isCustomer = loggingOutRole === 'CUSTOMER' || viewMode === 'customer' || Boolean(routeState.slug);
    const savedSlug = typeof window !== 'undefined' ? localStorage.getItem('agenda_last_store_slug') : null;
    const targetSlug = routeState.slug || business?.slug || savedSlug || 'agenda-beauty-sp';

    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('agenda_token');
    setCurrentUser(null);

    if (isSuper) {
      setViewMode('master_admin');
      navigateTo('/master-admin-secret');
    } else if (isCustomer) {
      setViewMode('customer');
      navigateTo(`/agendar/${targetSlug}`);
    } else {
      setViewMode('admin');
      navigateTo('/acesso-lojista');
    }
  };

  const handleSwitchTenant = async (targetTenantId: string) => {
    try {
      const res = await apiFetch('/api/v1/auth/switch-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: targetTenantId }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        if (json.token || json.data?.token) {
          localStorage.setItem('agenda_token', json.token || json.data?.token);
        }
        if (json.data?.user) {
          setCurrentUser((prev: any) => ({ ...prev, ...json.data.user }));
        }
        await fetchData();
      }
    } catch (e) {
      console.error('Failed to switch tenant:', e);
    }
  };

  const handleCreateAppointment = async (
    data: any
  ): Promise<{ success: boolean; error?: string; suggestedSlots?: string[] }> => {
    try {
      const res = await apiFetch('/api/v1/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        await fetchData();
        if (result.data && result.data.status === 'PENDING_PAYMENT') {
          setSelectedPixAppointment(result.data);
        }
        return { success: true };
      } else {
        return {
          success: false,
          error: result.error || 'Erro ao criar agendamento',
          suggestedSlots: result.suggestedSlots,
        };
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erro de conexão com o servidor' };
    }
  };

  const handleUpdateStatus = async (id: string, status: any) => {
    try {
      const res = await apiFetch(`/api/v1/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateClient = async (
    data: any
  ): Promise<{ success: boolean; data?: Client; existingClient?: Client; error?: string }> => {
    try {
      const res = await apiFetch('/api/v1/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        await fetchData();
        return { success: true, data: result.data };
      } else {
        return {
          success: false,
          error: result.error || 'Erro ao cadastrar cliente',
          existingClient: result.existingClient,
        };
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erro de conexão com o servidor' };
    }
  };

  // Service CRUD handlers
  const handleSaveService = async (data: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const url = editingService ? `/api/v1/services/${editingService.id}` : '/api/v1/services';
      const method = editingService ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        await fetchData();
        setEditingService(null);
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Erro ao salvar serviço' };
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erro de conexão com o servidor' };
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/services/${id}`, {
        method: 'DELETE',
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleActiveService = async (service: Service) => {
    try {
      const res = await apiFetch(`/api/v1/services/${service.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: service.active === false }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Professional CRUD handlers
  const handleSaveProfessional = async (
    data: any
  ): Promise<{ success: boolean; error?: string; conflicts?: any[] }> => {
    try {
      const url = editingProfessional ? `/api/v1/professionals/${editingProfessional.id}` : '/api/v1/professionals';
      const method = editingProfessional ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        await fetchData();
        setEditingProfessional(null);
        return { success: true };
      } else {
        return {
          success: false,
          error: result.error || 'Erro ao salvar profissional',
          conflicts: result.conflicts,
        };
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erro de conexão com o servidor' };
    }
  };

  const handleDeleteProfessional = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/professionals/${id}?confirmFutureConflicts=true`, {
        method: 'DELETE',
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleActiveProfessional = async (prof: Professional) => {
    try {
      const res = await apiFetch(`/api/v1/professionals/${prof.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: prof.active === false, confirmFutureConflicts: true }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateBusiness = async (updated: Partial<Business>) => {
    try {
      const res = await apiFetch('/api/v1/business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        setBusiness(result.data);
        try {
          await fetchData();
        } catch (fetchErr) {
          console.warn('Silent refresh after updateBusiness:', fetchErr);
        }
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error || 'Erro ao salvar empresa.' };
    } catch (e: any) {
      console.error(e);
      return { success: false, error: e?.message || 'Erro de conexão ao salvar.' };
    }
  };

  const requireDeposit = business?.requireDeposit !== false;

  const getTitleAndSubtitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return { title: 'Visão geral', subtitle: 'Acompanhe os indicadores operacionais e a agenda do dia' };
      case 'appointments':
        return { title: 'Agenda', subtitle: 'Visualização diária, semanal e mensal, bloqueios e gestão de reservas' };
      case 'cancellations':
        return {
          title: 'Solicitações de cancelamento',
          subtitle: requireDeposit
            ? 'Analise pedidos de cancelamento, prazos de antecedência e reembolsos de sinal'
            : 'Analise e gerencie pedidos de cancelamento de agendamentos'
        };
      case 'financial':
        return { title: 'Financeiro', subtitle: 'Gestão financeira completa, receitas, contas a receber, despesas, caixa, comissões e relatórios' };
      case 'payments':
        return { title: 'Pagamentos Pix', subtitle: 'Acompanhe o sinal de 30% e cobranças dinâmicas Mercado Pago' };
      case 'clients':
        return { title: 'Clientes (CRM)', subtitle: 'Gestão de clientes, etiquetas, anotações internas e histórico conciliado' };
      case 'services':
        return {
          title: 'Serviços',
          subtitle: requireDeposit
            ? 'Catálogo de procedimentos com cálculo de sinal, duração e status'
            : 'Catálogo de procedimentos com valor, duração e status'
        };
      case 'professionals':
        return { title: 'Profissionais', subtitle: 'Equipe, jornada de trabalho, intervalos e agenda individual' };
      case 'whatsapp':
        return { title: 'WhatsApp / Comunicação Oficial', subtitle: 'Integração Meta Cloud API, templates aprovados, lembretes automáticos, consentimento e fila de envio' };
      case 'advanced':
        return { title: 'Recursos Avançados (Etapa 11)', subtitle: 'Lista de Espera, Fidelidade, Cupons, Pacotes, Cartões-Presente, Avaliações, Campanhas, Estoque e Multiunidade' };
      case 'settings':
        return {
          title: 'Configurações do estabelecimento',
          subtitle: requireDeposit
            ? 'Parâmetros do negócio, link público, plano comercial e política de cancelamento'
            : 'Parâmetros do negócio, link público, plano comercial e regras de agendamento'
        };
      default:
        return { title: 'Agenda Beauty', subtitle: 'Painel de Gestão' };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium tracking-wide">Carregando Agenda Beauty...</p>
        </div>
      </div>
    );
  }

  // 1. Store's public booking page (/agendar/:slug or /loja/:slug) when not on a customer portal sub-route (or if unauthenticated)
  if (routeState.slug && (!routeState.isCustomerPortalSubRoute || !currentUser)) {
    return (
      <PublicBookingPage
        slug={routeState.slug}
        currentUser={currentUser}
        onAuthenticated={(user: any) => {
          setCurrentUser(user);
          fetchData(user?.role);
        }}
        onGoToCustomerPortal={(subPath?: string) => {
          setViewMode('customer');
          navigateTo(`/agendar/${routeState.slug}/${subPath || 'meus-agendamentos'}`);
        }}
        onLogout={handleLogout}
      />
    );
  }

  // 2. Unauthenticated screens:
  // - /super-admin-secreto -> SuperAdminLoginScreen
  // - /acesso-lojista -> OwnerLoginScreen
  // - / (main root URL) -> CustomerLoginScreen
  if (!currentUser) {
    // Secret Super Admin login URL
    if (routeState.isSuperAdminRoute) {
      return (
        <SuperAdminLoginScreen
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setViewMode('master_admin');
            fetchData(user?.role);
          }}
        />
      );
    }

    // Salon Owner / Staff Login (/acesso-lojista)
    if (routeState.isOwnerRoute) {
      return (
        <OwnerLoginScreen
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setViewMode('admin');
            fetchData(user?.role);
          }}
        />
      );
    }

    // Main root URL (/) -> Customer Login Screen
    const savedSlug = typeof window !== 'undefined' ? localStorage.getItem('agenda_last_store_slug') : null;
    const defaultSlug = savedSlug || business?.slug || 'agenda-beauty-sp';
    return (
      <CustomerLoginScreen
        defaultSlug={defaultSlug}
        onLoginSuccess={(user, resolvedSlug) => {
          setCurrentUser(user);
          setViewMode('customer');
          fetchData(user?.role);
          navigateTo(`/agendar/${resolvedSlug || defaultSlug}/minha-conta`);
        }}
        onOpenStoreBooking={(targetSlug) => {
          openPublicBooking(targetSlug || defaultSlug);
        }}
      />
    );
  }

  // 3. Super Admin SaaS Portal
  if (
    (viewMode === 'master_admin' || routeState.isSuperAdminRoute) &&
    (currentUser.role === 'SUPER_ADMIN' || currentUser.isMasterAdmin) &&
    !routeState.isCustomerPortalSubRoute
  ) {
    return (
      <MasterAdminPortal
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  // 4. Customer Portal mode (/agendar/:slug/..., generic customer route, or logged in as CUSTOMER)
  if (
    routeState.isCustomerPortalSubRoute ||
    routeState.isGenericCustomerRoute ||
    viewMode === 'customer' ||
    currentUser.role === 'CUSTOMER'
  ) {
    return (
      <CustomerPortal
        currentUser={currentUser}
        business={business}
        services={services}
        professionals={professionals}
        onLogout={handleLogout}
        onSwitchToAdmin={
          currentUser.role !== 'CUSTOMER'
            ? () => {
                fetchData(currentUser.role);
                setViewMode('admin');
                navigateTo('/');
              }
            : undefined
        }
        onOpenPublicBookingSlug={openPublicBooking}
        activeSlug={routeState.slug}
        activeSubRoute={routeState.customerSubRoute}
        selectedAppointmentIdFromUrl={routeState.appointmentId}
        isGenericRouteWithoutSlug={!routeState.slug}
        onNavigateCustomerRoute={handleNavigateCustomerRoute}
      />
    );
  }

  const headerInfo = getTitleAndSubtitle();
  const isTenantBlocked = business?.status === 'BLOCKED' || business?.status === 'CANCELLED';

  return (
    <div className="min-h-screen flex bg-stone-100 text-stone-900 overflow-x-hidden">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        businessName={business?.name || 'Agenda Beauty'}
        userRole={currentUser.role || 'OWNER'}
        onSwitchToCustomerPortal={() => {
          fetchData(currentUser.role);
          setViewMode('customer');
        }}
        onLogout={handleLogout}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenMobile={() => setIsMobileSidebarOpen(true)}
        requireDeposit={requireDeposit}
        enableAdvancedFeatures={Boolean(business?.enableAdvancedFeatures)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <div className="flex items-center justify-between gap-2 bg-white border-b border-stone-200 px-3 sm:px-8 py-2 text-xs text-stone-500">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden min-w-[44px] min-h-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 shrink-0"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <UserCheck className="w-4 h-4 text-rose-500 hidden sm:inline shrink-0" />
            <span className="truncate">
              <span className="hidden xs:inline">Logado como: </span>
              <strong>{currentUser.name}</strong>{' '}
              <span className="text-[11px]">({currentUser.role || 'OWNER'})</span>
            </span>

            {currentUser.memberships && currentUser.memberships.length > 1 && (
              <div className="hidden md:flex items-center gap-1.5 ml-2 pl-2 border-l border-stone-200">
                <Building2 className="w-3.5 h-3.5 text-stone-400" />
                <select
                  value={business?.id || currentUser.tenantId}
                  onChange={(e) => handleSwitchTenant(e.target.value)}
                  className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs font-semibold text-stone-800"
                >
                  {currentUser.memberships.map((m: any) => (
                    <option key={m.tenantId} value={m.tenantId}>
                      {m.tenantName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {(currentUser.role === 'SUPER_ADMIN' || currentUser.isMasterAdmin) && (
              <button
                onClick={() => {
                  navigateTo('/super-admin-secreto');
                  setViewMode('master_admin');
                }}
                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold transition-all"
              >
                <Crown className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-[11px] sm:text-xs">Master Admin</span>
              </button>
            )}
            {business?.slug && (
              <button
                onClick={() => openPublicBooking(business.slug!)}
                className="hidden sm:inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold transition-all"
                title="Abrir Link Público de Agendamento"
              >
                <ExternalLink className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                <span className="text-[11px] sm:text-xs">Página Pública</span>
              </button>
            )}
            <button
              onClick={() => setViewMode('customer')}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold transition-all"
              title="Ver Portal da Cliente"
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="text-[11px] sm:text-xs">Portal Cliente</span>
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 py-1.5 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Banner de Acesso Administrativo Suspenso / Bloqueado */}
        {isTenantBlocked && (
          <div className="bg-rose-600 text-white px-4 sm:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
            <div className="flex items-start sm:items-center gap-2.5 text-xs">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <strong className="font-bold block sm:inline">
                  Acesso Operacional Suspenso ({business?.status === 'BLOCKED' ? 'Assinatura Bloqueada por Inadimplência' : 'Assinatura Cancelada'}):{' '}
                </strong>
                <span>
                  {business?.blockedReason || 'Novos agendamentos online e edições administrativas estão temporariamente suspensos até a regularização da assinatura SaaS.'}
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-rose-800/80 px-2.5 py-1 rounded-lg self-start sm:self-auto shrink-0">
              Modo Somente Leitura
            </span>
          </div>
        )}

        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
          currency={business?.currency || 'BRL'}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-8 pb-24 lg:pb-8">
          {currentTab === 'dashboard' && (
            <DashboardView
              stats={stats}
              appointments={appointments}
              services={services}
              onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
              onNavigateTab={(tab) => setCurrentTab(tab)}
              requireDeposit={requireDeposit}
            />
          )}

          {currentTab === 'appointments' && (
            <AppointmentsView
              appointments={appointments}
              professionals={professionals}
              services={services}
              initialProfessionalFilter={selectedAgendaProfessionalId}
              onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
              onUpdateStatus={handleUpdateStatus}
              onPayPix={(app) => setSelectedPixAppointment(app)}
              onRefreshData={fetchData}
              requireDeposit={requireDeposit}
            />
          )}

          {currentTab === 'cancellations' && (
            <CancellationsView
              onRefreshAppointments={fetchData}
              requireDeposit={requireDeposit}
            />
          )}

          {currentTab === 'financial' && (
            <FinancialView
              professionals={professionals}
              services={services}
              userRole={currentUser.role || 'OWNER'}
              requireDeposit={requireDeposit}
            />
          )}

          {currentTab === 'payments' && requireDeposit && (
            <PaymentsView />
          )}

          {currentTab === 'clients' && (
            <ClientsView
              clients={clients}
              userRole={currentUser.role || 'OWNER'}
              onOpenNewClient={() => setIsNewClientOpen(true)}
              onRefreshClients={fetchData}
            />
          )}

          {currentTab === 'services' && (
            <ServicesView
              services={services}
              professionals={professionals}
              onOpenNewService={() => { setEditingService(null); setIsServiceModalOpen(true); }}
              onEditService={(s) => { setEditingService(s); setIsServiceModalOpen(true); }}
              onDeleteService={handleDeleteService}
              onToggleActiveService={handleToggleActiveService}
              requireDeposit={requireDeposit}
            />
          )}

          {currentTab === 'professionals' && (
            <ProfessionalsView
              professionals={professionals}
              onOpenNewProfessional={() => { setEditingProfessional(null); setIsProfessionalModalOpen(true); }}
              onEditProfessional={(p) => { setEditingProfessional(p); setIsProfessionalModalOpen(true); }}
              onDeleteProfessional={handleDeleteProfessional}
              onToggleActiveProfessional={handleToggleActiveProfessional}
              onViewProfessionalAgenda={(profId) => {
                setSelectedAgendaProfessionalId(profId);
                setCurrentTab('appointments');
              }}
            />
          )}

          {currentTab === 'whatsapp' && (
            <WhatsAppView
              userRole={currentUser.role || 'OWNER'}
              requireDeposit={requireDeposit}
            />
          )}

          {currentTab === 'advanced' && business?.enableAdvancedFeatures && (
            <AdvancedView
              services={services}
              professionals={professionals}
              clients={clients}
              userRole={currentUser.role || 'OWNER'}
              onRefreshCoreData={fetchData}
            />
          )}

          {currentTab === 'settings' && business && (
            <SettingsView
              business={business}
              onUpdateBusiness={handleUpdateBusiness}
              onOpenPublicPage={openPublicBooking}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <NewAppointmentModal
        isOpen={isNewAppointmentOpen}
        onClose={() => setIsNewAppointmentOpen(false)}
        clients={clients}
        professionals={professionals}
        services={services}
        onSubmit={handleCreateAppointment}
        onQuickCreateClient={handleCreateClient}
        requireDeposit={requireDeposit}
      />

      <NewClientModal
        isOpen={isNewClientOpen}
        onClose={() => setIsNewClientOpen(false)}
        onSubmit={handleCreateClient}
      />

      <ServiceModal
        isOpen={isServiceModalOpen}
        onClose={() => { setIsServiceModalOpen(false); setEditingService(null); }}
        service={editingService}
        professionals={professionals}
        onSubmit={handleSaveService}
        requireDeposit={requireDeposit}
      />

      <ProfessionalModal
        isOpen={isProfessionalModalOpen}
        onClose={() => { setIsProfessionalModalOpen(false); setEditingProfessional(null); }}
        professional={editingProfessional}
        onSubmit={handleSaveProfessional}
      />

      {selectedPixAppointment && (
        <PixCheckoutModal
          appointment={selectedPixAppointment}
          onClose={() => {
            setSelectedPixAppointment(null);
            fetchData();
          }}
          onPaymentConfirmed={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}
