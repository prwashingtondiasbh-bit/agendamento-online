import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { AppointmentsView } from './components/AppointmentsView';
import { ClientsView } from './components/ClientsView';
import { ServicesView } from './components/ServicesView';
import { ProfessionalsView } from './components/ProfessionalsView';
import { SettingsView } from './components/SettingsView';
import { NewAppointmentModal, NewClientModal, NewServiceModal } from './components/Modals';
import { AuthScreen } from './components/AuthScreen';
import { Business, Professional, Client, Service, Appointment, DashboardStats } from './types';
import { LogOut, UserCheck } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
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
  const [isNewServiceOpen, setIsNewServiceOpen] = useState(false);

  const checkAuthAndFetchData = async () => {
    try {
      const authRes = await fetch('/api/v1/auth/me', { credentials: 'include' });
      const authData = await authRes.json();

      if (authData.success && authData.data.user) {
        setCurrentUser(authData.data.user);
        await fetchData();
      } else {
        setCurrentUser(null);
      }
    } catch (e) {
      console.error(e);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [bizRes, statsRes, appRes, cliRes, servRes, profRes] = await Promise.all([
        fetch('/api/v1/business', { credentials: 'include' }),
        fetch('/api/v1/dashboard/stats', { credentials: 'include' }),
        fetch('/api/v1/appointments', { credentials: 'include' }),
        fetch('/api/v1/clients', { credentials: 'include' }),
        fetch('/api/v1/services', { credentials: 'include' }),
        fetch('/api/v1/professionals', { credentials: 'include' }),
      ]);

      const [bizData, statsData, appData, cliData, servData, profData] = await Promise.all([
        bizRes.json(),
        statsRes.json(),
        appRes.json(),
        cliRes.json(),
        servRes.json(),
        profRes.json(),
      ]);

      if (bizData.success) setBusiness(bizData.data);
      if (statsData.success) setStats(statsData.data);
      if (appData.success) setAppointments(appData.data);
      if (cliData.success) setClients(cliData.data);
      if (servData.success) setServices(servData.data);
      if (profData.success) setProfessionals(profData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
      setCurrentUser(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAppointment = async (data: any) => {
    try {
      const res = await fetch('/api/v1/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
      } else {
        alert(result.error || 'Erro ao criar agendamento');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id: string, status: any) => {
    try {
      const res = await fetch(`/api/v1/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateClient = async (data: any) => {
    try {
      const res = await fetch('/api/v1/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
      } else {
        alert(result.error || 'Erro ao cadastrar cliente');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateService = async (data: any) => {
    try {
      const res = await fetch('/api/v1/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
      } else {
        alert(result.error || 'Erro ao cadastrar serviço');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateBusiness = async (updated: Partial<Business>) => {
    try {
      const res = await fetch('/api/v1/business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updated),
      });
      const result = await res.json();
      if (result.success) {
        setBusiness(result.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getTitleAndSubtitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return { title: 'Visão Geral', subtitle: 'Acompanhe os principais indicadores e agenda do dia' };
      case 'appointments':
        return { title: 'Agendamentos', subtitle: 'Gerencie horários, status e atendimento do salão' };
      case 'clients':
        return { title: 'Clientes', subtitle: 'Base de clientes cadastradas e histórico' };
      case 'services':
        return { title: 'Serviços & Preços', subtitle: 'Catálogo de procedimentos de nail design' };
      case 'professionals':
        return { title: 'Profissionais', subtitle: 'Equipe de manicures e designers do estúdio' };
      case 'settings':
        return { title: 'Configurações', subtitle: 'Parâmetros do negócio, fuso horário e horários' };
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

  if (!currentUser) {
    return <AuthScreen onLoginSuccess={() => checkAuthAndFetchData()} />;
  }

  const headerInfo = getTitleAndSubtitle();

  return (
    <div className="min-h-screen flex bg-stone-100 text-stone-900">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        businessName={business?.name || 'Agenda Beauty'}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between bg-white border-b border-stone-200 px-8 py-2 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-rose-500" />
            <span>Logado como: <strong>{currentUser.name}</strong> ({currentUser.email})</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair do Sistema</span>
          </button>
        </div>

        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
          currency={business?.currency || 'BRL'}
        />

        <main className="flex-1 overflow-y-auto p-8">
          {currentTab === 'dashboard' && (
            <DashboardView
              stats={stats}
              appointments={appointments}
              services={services}
              onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
            />
          )}

          {currentTab === 'appointments' && (
            <AppointmentsView
              appointments={appointments}
              onOpenNewAppointment={() => setIsNewAppointmentOpen(true)}
              onUpdateStatus={handleUpdateStatus}
            />
          )}

          {currentTab === 'clients' && (
            <ClientsView
              clients={clients}
              onOpenNewClient={() => setIsNewClientOpen(true)}
            />
          )}

          {currentTab === 'services' && (
            <ServicesView
              services={services}
              onOpenNewService={() => setIsNewServiceOpen(true)}
            />
          )}

          {currentTab === 'professionals' && (
            <ProfessionalsView
              professionals={professionals}
              onOpenNewProfessional={() => {}}
            />
          )}

          {currentTab === 'settings' && business && (
            <SettingsView
              business={business}
              onUpdateBusiness={handleUpdateBusiness}
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
      />

      <NewClientModal
        isOpen={isNewClientOpen}
        onClose={() => setIsNewClientOpen(false)}
        onSubmit={handleCreateClient}
      />

      <NewServiceModal
        isOpen={isNewServiceOpen}
        onClose={() => setIsNewServiceOpen(false)}
        onSubmit={handleCreateService}
      />
    </div>
  );
}
