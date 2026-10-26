import { z } from 'zod';

export const clientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().min(8, 'Telefone inválido'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  notes: z.string().optional(),
});

export const professionalSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  specialty: z.string().min(2, 'Especialidade obrigatória'),
  avatarUrl: z.string().optional(),
  active: z.boolean().optional(),
});

export const serviceSchema = z.object({
  name: z.string().min(2, 'Nome do serviço obrigatório'),
  description: z.string().optional(),
  durationMin: z.number().int().positive('Duração deve ser em minutos positivos'),
  price: z.number().positive('Preço deve ser maior que zero'),
  category: z.string().min(2, 'Categoria obrigatória'),
  active: z.boolean().optional(),
});

export const appointmentSchema = z.object({
  clientId: z.string().min(1, 'Cliente obrigatório'),
  professionalId: z.string().min(1, 'Profissional obrigatório'),
  serviceId: z.string().min(1, 'Serviço obrigatório'),
  dateTime: z.string().min(1, 'Data e horário obrigatórios'),
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
});

export const businessSchema = z.object({
  name: z.string().min(2, 'Nome do salão obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  timezone: z.string().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
});
