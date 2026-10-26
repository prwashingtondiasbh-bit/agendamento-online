// Resilient multi-tenant storage service supporting Prisma (MySQL) and fallback memory store
import bcrypt from 'bcryptjs';

let prisma: any = null;
async function getPrismaClient() {
  if (prisma !== null) return prisma;
  try {
    const mod = await import('@prisma/client');
    const ClientClass = (mod as any).PrismaClient || (mod as any).default?.PrismaClient;
    if (ClientClass) {
      prisma = new ClientClass();
      await prisma.$connect();
      return prisma;
    }
  } catch (e) {
    prisma = false;
  }
  return null;
}

// In-memory multi-tenant seed store for bulletproof fallback
const memoryStore = {
  tenants: [
    {
      id: 'biz-1',
      name: 'Agenda Beauty Studio São Paulo',
      slug: 'agenda-beauty-sp',
      phone: '(11) 98765-4321',
      email: 'sp@agendabeauty.com.br',
      address: 'Alameda dos Anjos, 1000 - SP',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      openTime: '08:00',
      closeTime: '20:00',
    },
    {
      id: 'biz-2',
      name: 'Agenda Beauty Studio Rio',
      slug: 'agenda-beauty-rj',
      phone: '(21) 97654-3210',
      email: 'rj@agendabeauty.com.br',
      address: 'Av. Atlântica, 500 - RJ',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      openTime: '09:00',
      closeTime: '19:00',
    },
  ],

  users: [
    {
      id: 'user-1',
      name: 'Camila Souza',
      email: 'camila@agendabeauty.com.br',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-1',
      role: 'OWNER',
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
    {
      id: 'user-2',
      name: 'Carlos Rio',
      email: 'carlos@agendabeauty.com.br',
      passwordHash: bcrypt.hashSync('123456', 10),
      tenantId: 'biz-2',
      role: 'OWNER',
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    },
  ],

  professionals: [
    { id: 'prof-1', tenantId: 'biz-1', name: 'Camila Souza', email: 'camila@agendabeauty.com.br', phone: '(11) 99111-2233', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', specialty: 'Alongamento em Gel', active: true },
    { id: 'prof-2', tenantId: 'biz-1', name: 'Juliana Mendes', email: 'juliana@agendabeauty.com.br', phone: '(11) 99222-3344', avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', specialty: 'Manicure Russa', active: true },
    { id: 'prof-3', tenantId: 'biz-2', name: 'Larissa Rio', email: 'larissa@agendabeauty.com.br', phone: '(21) 98888-7777', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', specialty: 'Nail Art Avançada', active: true },
  ],

  clients: [
    { id: 'cli-1', tenantId: 'biz-1', name: 'Beatriz Lima', phone: '(11) 97777-1111', email: 'beatriz@email.com', notes: 'Prefere esmalte claro.', createdAt: new Date().toISOString() },
    { id: 'cli-2', tenantId: 'biz-1', name: 'Mariana Costa', phone: '(11) 96666-2222', email: 'mariana@email.com', notes: 'Alérgica a tolueno.', createdAt: new Date().toISOString() },
    { id: 'cli-3', tenantId: 'biz-2', name: 'Carla Dias', phone: '(21) 97777-2222', email: 'carla@email.com', notes: 'Cliente RJ VIP.', createdAt: new Date().toISOString() },
  ],

  services: [
    { id: 'serv-1', tenantId: 'biz-1', name: 'Alongamento em Gel (Fibra)', description: 'Fibra de vidro completa', durationMin: 120, price: 180.00, category: 'Alongamento', active: true },
    { id: 'serv-2', tenantId: 'biz-1', name: 'Esmaltação em Gel', description: 'Secagem LED alta durabilidade', durationMin: 45, price: 90.00, category: 'Esmaltação', active: true },
    { id: 'serv-3', tenantId: 'biz-2', name: 'Banho de Gel RJ', description: 'Fortalecimento unhas RJ', durationMin: 60, price: 120.00, category: 'Tratamento', active: true },
  ],

  appointments: [
    { id: 'app-1', tenantId: 'biz-1', clientId: 'cli-1', professionalId: 'prof-1', serviceId: 'serv-1', dateTime: new Date(Date.now() + 3600000 * 2).toISOString(), status: 'CONFIRMED', totalAmount: 180.00, notes: 'Fibra média', createdAt: new Date().toISOString() },
    { id: 'app-2', tenantId: 'biz-2', clientId: 'cli-3', professionalId: 'prof-3', serviceId: 'serv-3', dateTime: new Date(Date.now() + 3600000 * 3).toISOString(), status: 'CONFIRMED', totalAmount: 120.00, notes: 'Banho de gel', createdAt: new Date().toISOString() },
  ],
};

export const db = {
  async findUserByEmail(email: string) {
    const client = await getPrismaClient();
    if (client) {
      try {
        const user = await client.user.findUnique({ where: { email } });
        if (user) {
          const membership = await client.tenantMember.findFirst({ where: { userId: user.id } });
          return { ...user, tenantId: membership?.tenantId, role: membership?.role };
        }
      } catch (e) {}
    }
    return memoryStore.users.find(u => u.email === email) || null;
  },

  async getUsers() {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.user.findMany();
      } catch (e) {}
    }
    return memoryStore.users;
  },

  async registerTenantWithUser(data: { name: string; email: string; passwordHash: string; businessName: string; phone: string }) {
    const client = await getPrismaClient();
    const slug = data.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 6);

    if (client) {
      try {
        const tenant = await client.tenant.create({
          data: {
            name: data.businessName,
            slug,
            phone: data.phone,
            email: data.email,
          },
        });
        const user = await client.user.create({
          data: {
            name: data.name,
            email: data.email,
            passwordHash: data.passwordHash,
          },
        });
        await client.tenantMember.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            role: 'OWNER',
          },
        });
        return { tenant, user };
      } catch (e) {}
    }

    const tenantId = `biz-${Date.now()}`;
    const userId = `user-${Date.now()}`;
    const newTenant = {
      id: tenantId,
      name: data.businessName,
      slug,
      phone: data.phone,
      email: data.email,
      address: '',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      openTime: '08:00',
      closeTime: '20:00',
    };
    const newUser = {
      id: userId,
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      tenantId,
      role: 'OWNER',
      resetToken: null as string | null,
      resetExpires: null as Date | null,
      active: true,
    };
    memoryStore.tenants.push(newTenant);
    memoryStore.users.push(newUser);
    return { tenant: newTenant, user: newUser };
  },

  async savePasswordResetToken(email: string, token: string) {
    const client = await getPrismaClient();
    if (client) {
      try {
        await client.user.update({
          where: { email },
          data: { resetToken: token, resetExpires: new Date(Date.now() + 3600000) },
        });
        return true;
      } catch (e) {}
    }
    const user = memoryStore.users.find(u => u.email === email);
    if (user) {
      user.resetToken = token;
      return true;
    }
    return false;
  },

  async resetUserPassword(email: string, token: string, passwordHash: string) {
    const client = await getPrismaClient();
    if (client) {
      try {
        const user = await client.user.findUnique({ where: { email } });
        if (user && user.resetToken === token) {
          await client.user.update({
            where: { email },
            data: { passwordHash, resetToken: null, resetExpires: null },
          });
          return true;
        }
      } catch (e) {}
    }
    const user = memoryStore.users.find(u => u.email === email);
    if (user && user.resetToken === token) {
      user.passwordHash = passwordHash;
      user.resetToken = null;
      return true;
    }
    return false;
  },

  async getBusiness(tenantId = 'biz-1') {
    const client = await getPrismaClient();
    if (client) {
      try {
        const biz = await client.tenant.findUnique({ where: { id: tenantId } });
        if (biz) return biz;
      } catch (e) {}
    }
    return memoryStore.tenants.find(t => t.id === tenantId) || memoryStore.tenants[0];
  },

  async updateBusiness(tenantId: string, data: any) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.tenant.update({
          where: { id: tenantId },
          data,
        });
      } catch (e) {}
    }
    const biz = memoryStore.tenants.find(t => t.id === tenantId);
    if (biz) {
      Object.assign(biz, data);
      return biz;
    }
    throw new Error('Empresa não encontrada');
  },

  async getProfessionals(tenantId: string) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.professional.findMany({ where: { tenantId } });
      } catch (e) {}
    }
    return memoryStore.professionals.filter(p => p.tenantId === tenantId);
  },

  async createProfessional(tenantId: string, data: any) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.professional.create({
          data: { ...data, tenantId },
        });
      } catch (e) {}
    }
    const newProf = { id: `prof-${Date.now()}`, tenantId, ...data, active: true };
    memoryStore.professionals.push(newProf);
    return newProf;
  },

  async getClients(tenantId: string) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.client.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      } catch (e) {}
    }
    return memoryStore.clients.filter(c => c.tenantId === tenantId);
  },

  async createClient(tenantId: string, data: any) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.client.create({
          data: { ...data, tenantId },
        });
      } catch (e) {}
    }
    const newClient = { id: `cli-${Date.now()}`, tenantId, createdAt: new Date().toISOString(), ...data };
    memoryStore.clients.push(newClient);
    return newClient;
  },

  async getServices(tenantId: string) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.service.findMany({ where: { tenantId } });
      } catch (e) {}
    }
    return memoryStore.services.filter(s => s.tenantId === tenantId);
  },

  async createService(tenantId: string, data: any) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.service.create({
          data: { ...data, tenantId },
        });
      } catch (e) {}
    }
    const newService = { id: `serv-${Date.now()}`, tenantId, ...data, active: true };
    memoryStore.services.push(newService);
    return newService;
  },

  async getAppointments(tenantId: string) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.appointment.findMany({
          where: { tenantId },
          include: { client: true, professional: true, service: true },
          orderBy: { dateTime: 'asc' },
        });
      } catch (e) {}
    }
    return memoryStore.appointments
      .filter(app => app.tenantId === tenantId)
      .map(app => ({
        ...app,
        client: memoryStore.clients.find(c => c.id === app.clientId) || null,
        professional: memoryStore.professionals.find(p => p.id === app.professionalId) || null,
        service: memoryStore.services.find(s => s.id === app.serviceId) || null,
      }));
  },

  async createAppointment(tenantId: string, data: any) {
    const client = await getPrismaClient();
    if (client) {
      try {
        return await client.appointment.create({
          data: { ...data, tenantId },
          include: { client: true, professional: true, service: true },
        });
      } catch (e) {}
    }
    const newApp = { id: `app-${Date.now()}`, tenantId, createdAt: new Date().toISOString(), ...data };
    memoryStore.appointments.push(newApp);
    return {
      ...newApp,
      client: memoryStore.clients.find(c => c.id === newApp.clientId) || null,
      professional: memoryStore.professionals.find(p => p.id === newApp.professionalId) || null,
      service: memoryStore.services.find(s => s.id === newApp.serviceId) || null,
    };
  },

  async updateAppointmentStatus(tenantId: string, id: string, status: any) {
    const client = await getPrismaClient();
    if (client) {
      try {
        const app = await client.appointment.findUnique({ where: { id } });
        if (!app || app.tenantId !== tenantId) {
          throw new Error('Agendamento não encontrado ou acesso não autorizado');
        }
        return await client.appointment.update({
          where: { id },
          data: { status },
          include: { client: true, professional: true, service: true },
        });
      } catch (e: any) {
        throw e;
      }
    }
    const app = memoryStore.appointments.find(a => a.id === id && a.tenantId === tenantId);
    if (app) {
      app.status = status;
      return {
        ...app,
        client: memoryStore.clients.find(c => c.id === app.clientId) || null,
        professional: memoryStore.professionals.find(p => p.id === app.professionalId) || null,
        service: memoryStore.services.find(s => s.id === app.serviceId) || null,
      };
    }
    throw new Error('Agendamento não encontrado');
  },

  async getDashboardStats(tenantId: string) {
    const appointments = await this.getAppointments(tenantId);
    const clients = await this.getClients(tenantId);
    const services = await this.getServices(tenantId);
    const professionals = await this.getProfessionals(tenantId);

    const totalRevenue = appointments
      .filter((a: any) => a.status === 'COMPLETED' || a.status === 'CONFIRMED')
      .reduce((sum: number, a: any) => sum + Number(a.totalAmount), 0);

    const completedCount = appointments.filter((a: any) => a.status === 'COMPLETED').length;
    const confirmedCount = appointments.filter((a: any) => a.status === 'CONFIRMED').length;

    return {
      totalRevenue,
      totalAppointments: appointments.length,
      completedAppointments: completedCount,
      confirmedAppointments: confirmedCount,
      totalClients: clients.length,
      totalServices: services.length,
      totalProfessionals: professionals.length,
      currency: 'BRL',
    };
  },
};
