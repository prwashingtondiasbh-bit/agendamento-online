export interface Business {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  currency: string;
  openTime: string;
  closeTime: string;
}

export interface Professional {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  specialty: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  category: string;
  active: boolean;
}

export interface Appointment {
  id: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  dateTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  totalAmount: number;
  notes: string;
  client?: Client;
  professional?: Professional;
  service?: Service;
}

export interface DashboardStats {
  totalRevenue: number;
  totalAppointments: number;
  completedAppointments: number;
  confirmedAppointments: number;
  totalClients: number;
  totalServices: number;
  totalProfessionals: number;
  currency: string;
}
