import crypto from 'crypto';
import { db, memoryStore } from './storage.js';
import { enqueueWhatsAppMessage } from './whatsapp/whatsappService.js';

// In-memory concurrency locks for atomic operations
const activeLocks = new Set<string>();

async function withAtomicLock<T>(lockKey: string, fn: () => Promise<T> | T): Promise<T> {
  while (activeLocks.has(lockKey)) {
    await new Promise((r) => setTimeout(r, 5));
  }
  activeLocks.add(lockKey);
  try {
    return await fn();
  } finally {
    activeLocks.delete(lockKey);
  }
}

// ==========================================
// 1. MULTIUNIDADE (BUSINESS LOCATIONS)
// ==========================================

export function ensureDefaultLocation(tenantId: string): any {
  const existing = memoryStore.businessLocations.filter((l: any) => l.tenantId === tenantId);
  if (existing.length === 0) {
    const tenant = memoryStore.tenants.find((t: any) => t.id === tenantId);
    const profIds = memoryStore.professionals
      .filter((p: any) => p.tenantId === tenantId)
      .map((p: any) => p.id);
    const servIds = memoryStore.services
      .filter((s: any) => s.tenantId === tenantId)
      .map((s: any) => s.id);
    const now = new Date().toISOString();
    const mainLoc = {
      id: `loc-main-${tenantId}`,
      tenantId,
      name: tenant?.name ? `${tenant.name} — Matriz` : 'Unidade Matriz',
      address: tenant?.address || '',
      phone: tenant?.phone || '',
      timezone: tenant?.timezone || 'America/Sao_Paulo',
      openTime: tenant?.openTime || '08:00',
      closeTime: tenant?.closeTime || '20:00',
      professionalIds: profIds,
      serviceIds: servIds,
      isMain: true,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.businessLocations.push(mainLoc);
    return mainLoc;
  }
  return existing[0];
}

export function listLocations(tenantId: string) {
  ensureDefaultLocation(tenantId);
  return memoryStore.businessLocations.filter((l: any) => l.tenantId === tenantId);
}

export function saveLocation(
  tenantId: string,
  input: {
    id?: string;
    name: string;
    address?: string;
    phone?: string;
    timezone?: string;
    openTime?: string;
    closeTime?: string;
    professionalIds?: string[];
    serviceIds?: string[];
    active?: boolean;
  },
  actorId: string
) {
  ensureDefaultLocation(tenantId);
  const now = new Date().toISOString();

  // Validate that all referenced professionals and services belong to this tenant
  const validProfIds = (input.professionalIds || []).filter((pid) =>
    memoryStore.professionals.some((p: any) => p.id === pid && p.tenantId === tenantId)
  );
  const validServIds = (input.serviceIds || []).filter((sid) =>
    memoryStore.services.some((s: any) => s.id === sid && s.tenantId === tenantId)
  );

  if (input.id) {
    const loc = memoryStore.businessLocations.find(
      (l: any) => l.id === input.id && l.tenantId === tenantId
    );
    if (!loc) throw new Error('Unidade não encontrada neste estabelecimento.');
    if (input.name !== undefined) loc.name = input.name.trim();
    if (input.address !== undefined) loc.address = input.address.trim();
    if (input.phone !== undefined) loc.phone = input.phone.trim();
    if (input.timezone !== undefined) loc.timezone = input.timezone;
    if (input.openTime !== undefined) loc.openTime = input.openTime;
    if (input.closeTime !== undefined) loc.closeTime = input.closeTime;
    if (input.professionalIds !== undefined) loc.professionalIds = validProfIds;
    if (input.serviceIds !== undefined) loc.serviceIds = validServIds;
    if (input.active !== undefined) loc.active = Boolean(input.active);
    loc.updatedAt = now;
    return loc;
  }

  const newLoc = {
    id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    name: input.name.trim(),
    address: input.address?.trim() || '',
    phone: input.phone?.trim() || '',
    timezone: input.timezone || 'America/Sao_Paulo',
    openTime: input.openTime || '08:00',
    closeTime: input.closeTime || '20:00',
    professionalIds: validProfIds,
    serviceIds: validServIds,
    isMain: false,
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  memoryStore.businessLocations.push(newLoc);
  memoryStore.auditLogs.push({
    id: `audit-loc-${Date.now()}`,
    tenantId,
    userId: actorId,
    action: 'LOCATION_CREATED',
    details: { locationId: newLoc.id, name: newLoc.name },
    createdAt: now,
  });
  return newLoc;
}

export function validateLocationBookingEligibility(
  tenantId: string,
  locationId: string | undefined | null,
  serviceId: string,
  professionalId: string
): { valid: boolean; error?: string; location?: any } {
  if (!locationId) {
    return { valid: true };
  }
  const loc = memoryStore.businessLocations.find(
    (l: any) => l.id === locationId && l.tenantId === tenantId
  );
  if (!loc) {
    return { valid: false, error: 'Unidade selecionada não pertence a este estabelecimento.' };
  }
  if (!loc.active) {
    return { valid: false, error: 'Unidade selecionada está inativa para agendamentos.' };
  }
  if (Array.isArray(loc.serviceIds) && !loc.serviceIds.includes(serviceId)) {
    return {
      valid: false,
      error: 'O serviço selecionado não está disponível na unidade escolhida.',
    };
  }
  if (Array.isArray(loc.professionalIds) && !loc.professionalIds.includes(professionalId)) {
    return {
      valid: false,
      error: 'A profissional selecionada não atende na unidade escolhida.',
    };
  }
  return { valid: true, location: loc };
}

// ==========================================
// 2. LISTA DE ESPERA INTELIGENTE
// ==========================================

export function createWaitlistEntry(
  tenantId: string,
  input: {
    clientId: string;
    serviceId: string;
    professionalId?: string | null;
    locationId?: string | null;
    desiredDate: string;
    preferredPeriod?: string;
    preferredStartTime?: string;
    preferredEndTime?: string;
    alternativeDays?: string[];
    priority?: number;
    notes?: string;
  }
) {
  const client = memoryStore.clients.find(
    (c: any) => c.id === input.clientId && c.tenantId === tenantId
  );
  if (!client) throw new Error('Cliente não encontrada neste estabelecimento.');

  const service = memoryStore.services.find(
    (s: any) => s.id === input.serviceId && s.tenantId === tenantId && s.active !== false
  );
  if (!service) throw new Error('Serviço inválido ou inativo.');

  if (input.professionalId) {
    const prof = memoryStore.professionals.find(
      (p: any) => p.id === input.professionalId && p.tenantId === tenantId && p.active !== false
    );
    if (!prof) throw new Error('Profissional selecionada inválida ou inativa.');
  }

  if (input.locationId && input.professionalId) {
    const locCheck = validateLocationBookingEligibility(
      tenantId,
      input.locationId,
      input.serviceId,
      input.professionalId
    );
    if (!locCheck.valid) throw new Error(locCheck.error);
  }

  const now = new Date().toISOString();
  const entry = {
    id: `wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    clientId: input.clientId,
    serviceId: input.serviceId,
    professionalId: input.professionalId || null,
    locationId: input.locationId || null,
    desiredDate: input.desiredDate,
    preferredPeriod: input.preferredPeriod || 'ANY',
    preferredStartTime: input.preferredStartTime || null,
    preferredEndTime: input.preferredEndTime || null,
    alternativeDays: Array.isArray(input.alternativeDays) ? input.alternativeDays : [],
    priority: Number(input.priority || 1),
    status: 'WAITING',
    notes: input.notes || '',
    createdAt: now,
    updatedAt: now,
  };
  memoryStore.waitlistEntries.push(entry);
  return formatWaitlistEntry(entry);
}

export function cancelWaitlistEntry(tenantId: string, entryId: string, actorClientId?: string) {
  const entry = memoryStore.waitlistEntries.find(
    (e: any) => e.id === entryId && e.tenantId === tenantId
  );
  if (!entry) throw new Error('Solicitação de lista de espera não encontrada.');
  if (actorClientId && entry.clientId !== actorClientId) {
    throw new Error('Acesso negado: você só pode cancelar suas próprias solicitações.');
  }

  const now = new Date().toISOString();
  entry.status = 'CANCELLED';
  entry.updatedAt = now;

  // Cancel any pending offers for this entry so it can never be accepted or offered again
  for (const off of memoryStore.waitlistOffers) {
    if (off.waitlistEntryId === entry.id && off.status === 'PENDING') {
      off.status = 'CANCELLED';
      off.updatedAt = now;
    }
  }

  return formatWaitlistEntry(entry);
}

export function listWaitlistEntries(
  tenantId: string,
  filters?: {
    clientId?: string;
    serviceId?: string;
    professionalId?: string;
    desiredDate?: string;
    status?: string;
  }
) {
  return memoryStore.waitlistEntries
    .filter((e: any) => {
      if (e.tenantId !== tenantId) return false;
      if (filters?.clientId && e.clientId !== filters.clientId) return false;
      if (filters?.serviceId && e.serviceId !== filters.serviceId) return false;
      if (filters?.professionalId && e.professionalId !== filters.professionalId) return false;
      if (filters?.desiredDate && e.desiredDate !== filters.desiredDate) return false;
      if (filters?.status && e.status !== filters.status) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map(formatWaitlistEntry);
}

function formatWaitlistEntry(e: any) {
  const client = memoryStore.clients.find((c: any) => c.id === e.clientId && c.tenantId === e.tenantId);
  const service = memoryStore.services.find((s: any) => s.id === e.serviceId && s.tenantId === e.tenantId);
  const prof = e.professionalId
    ? memoryStore.professionals.find((p: any) => p.id === e.professionalId && p.tenantId === e.tenantId)
    : null;
  const offers = memoryStore.waitlistOffers.filter(
    (o: any) => o.waitlistEntryId === e.id && o.tenantId === e.tenantId
  );

  // Calculate queue position among WAITING entries for the same service & date
  const waitingPeers = memoryStore.waitlistEntries
    .filter(
      (w: any) =>
        w.tenantId === e.tenantId &&
        w.serviceId === e.serviceId &&
        w.desiredDate === e.desiredDate &&
        w.status === 'WAITING'
    )
    .sort((a: any, b: any) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  const position = e.status === 'WAITING' ? waitingPeers.findIndex((w: any) => w.id === e.id) + 1 : null;

  return {
    ...e,
    clientName: client?.name || 'Cliente',
    clientPhone: client?.phone || '',
    serviceName: service?.name || 'Serviço',
    professionalName: prof?.name || 'Qualquer profissional habilitada',
    position,
    offers,
  };
}

/**
 * Finds eligible WAITING entries compatible with an opened slot.
 */
export function findCompatibleWaitlistEntriesForSlot(
  tenantId: string,
  slot: {
    serviceId: string;
    professionalId: string;
    slotDateTime: string;
  }
) {
  const slotDate = slot.slotDateTime.slice(0, 10);
  return memoryStore.waitlistEntries
    .filter((e: any) => {
      if (e.tenantId !== tenantId) return false;
      if (e.status !== 'WAITING') return false;
      if (e.serviceId !== slot.serviceId) return false;
      if (e.professionalId && e.professionalId !== slot.professionalId) return false;
      const matchesDate =
        e.desiredDate === slotDate ||
        (Array.isArray(e.alternativeDays) && e.alternativeDays.includes(slotDate));
      return matchesDate;
    })
    .sort((a: any, b: any) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map(formatWaitlistEntry);
}

/**
 * Creates a time-limited offer for a waitlist entry.
 * Prevents offering to cancelled entries and prevents simultaneous active offers for the exact same slot.
 */
export async function createWaitlistOffer(
  tenantId: string,
  input: {
    waitlistEntryId: string;
    professionalId: string;
    slotDateTime: string;
    expiresInMinutes?: number;
    actorId?: string;
  }
) {
  const slotLockKey = `wloffer:${tenantId}:${input.professionalId}:${input.slotDateTime}`;
  return withAtomicLock(slotLockKey, async () => {
    const entry = memoryStore.waitlistEntries.find(
      (e: any) => e.id === input.waitlistEntryId && e.tenantId === tenantId
    );
    if (!entry) throw new Error('Solicitação de lista de espera não encontrada.');
    if (entry.status === 'CANCELLED') {
      throw new Error('Não é possível enviar oferta para uma solicitação de lista de espera cancelada.');
    }
    if (entry.status === 'ACCEPTED') {
      throw new Error('Esta solicitação de lista de espera já foi atendida e convertida em agendamento.');
    }

    const service = memoryStore.services.find(
      (s: any) => s.id === entry.serviceId && s.tenantId === tenantId
    );
    if (!service) throw new Error('Serviço não encontrado.');

    const startMs = new Date(input.slotDateTime).getTime();
    const totalDurationMin =
      Number(service.durationMin || 60) +
      Number(service.bufferBeforeMin || 0) +
      Number(service.bufferAfterMin || 0) +
      Number(service.preparationMin || 0);
    const endMs = startMs + totalDurationMin * 60 * 1000;
    const nowMs = Date.now();

    // Check if there is already an active non-expired PENDING offer for this exact slot
    const conflictingActiveOffer = memoryStore.waitlistOffers.find((o: any) => {
      if (o.tenantId !== tenantId || o.professionalId !== input.professionalId) return false;
      if (o.status !== 'PENDING') return false;
      if (new Date(o.expiresAt).getTime() <= nowMs) {
        o.status = 'EXPIRED';
        return false;
      }
      const oStart = new Date(o.slotDateTime).getTime();
      const oEnd = new Date(o.slotEndDateTime).getTime();
      return startMs < oEnd && endMs > oStart;
    });

    if (conflictingActiveOffer) {
      throw new Error(
        'Já existe uma oferta ativa aguardando resposta para este mesmo horário. Aguarde a expiração ou recusa antes de ofertar para outra cliente.'
      );
    }

    // Also verify no active appointment occupies the slot
    const conflictingAppt = memoryStore.appointments.find((a: any) => {
      if (a.tenantId !== tenantId || a.professionalId !== input.professionalId) return false;
      if (a.status === 'CANCELLED' || a.status === 'EXPIRED' || a.status === 'NO_SHOW') return false;
      const aStart = new Date(a.dateTime).getTime();
      const aEnd = new Date(a.endDateTime).getTime();
      return startMs < aEnd && endMs > aStart;
    });
    if (conflictingAppt) {
      throw new Error('Horário indisponível: já existe um agendamento ativo neste intervalo.');
    }

    const expiresMinutes = Math.max(1, Number(input.expiresInMinutes ?? 30));
    const expiresAt = new Date(nowMs + expiresMinutes * 60 * 1000).toISOString();
    const nowIso = new Date(nowMs).toISOString();

    const offer = {
      id: `wloff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      waitlistEntryId: entry.id,
      clientId: entry.clientId,
      serviceId: entry.serviceId,
      professionalId: input.professionalId,
      slotDateTime: new Date(startMs).toISOString(),
      slotEndDateTime: new Date(endMs).toISOString(),
      status: 'PENDING',
      expiresAt,
      appointmentId: null,
      sentViaChannel: 'PORTAL_AND_WHATSAPP',
      createdBy: input.actorId || 'system',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    memoryStore.waitlistOffers.push(offer);
    entry.status = 'OFFERED';
    entry.updatedAt = nowIso;

    // Create portal notification for the customer
    memoryStore.notifications.push({
      id: `notif-wl-${Date.now()}`,
      clientId: entry.clientId,
      tenantId,
      title: 'Horário disponível na Lista de Espera!',
      message: `Surgiu uma vaga para ${service.name} em ${new Date(startMs).toLocaleString(
        'pt-BR'
      )}. Responda até ${new Date(expiresAt).toLocaleTimeString('pt-BR')} para garantir a reserva.`,
      type: 'WAITLIST_OFFER',
      read: false,
      createdAt: nowIso,
    });

    // Non-blocking WhatsApp operational alert if configured
    const client = memoryStore.clients.find((c: any) => c.id === entry.clientId);
    const tenant = memoryStore.tenants.find((t: any) => t.id === tenantId);
    enqueueWhatsAppMessage({
      tenantId,
      clientId: entry.clientId,
      referenceId: offer.id,
      eventType: 'MANUAL_OPERATIONAL',
      variables: [
        client?.name || 'Cliente',
        tenant?.name || 'Agenda Beauty',
        `Surgiu uma vaga na lista de espera para ${service.name} em ${new Date(
          startMs
        ).toLocaleString('pt-BR')}. Acesse o portal para confirmar!`,
      ],
    }).catch(() => {});

    return offer;
  });
}

/**
 * Customer or staff accepts a waitlist offer.
 * Enforces atomic concurrency lock, checks offer expiration, revalidates calendar availability,
 * and creates the reservation through the standard db.createAppointment mechanism!
 */
export async function acceptWaitlistOffer(
  tenantId: string,
  offerId: string,
  actorClientId?: string
) {
  const offer = memoryStore.waitlistOffers.find(
    (o: any) => o.id === offerId && o.tenantId === tenantId
  );
  if (!offer) throw new Error('Oferta da lista de espera não encontrada.');
  if (actorClientId && offer.clientId !== actorClientId) {
    throw new Error('Acesso negado: esta oferta pertence a outra cliente.');
  }

  const slotLockKey = `wlaccept:${tenantId}:${offer.professionalId}:${offer.slotDateTime}`;
  return withAtomicLock(slotLockKey, async () => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (offer.status === 'ACCEPTED') {
      throw new Error('Esta oferta já foi aceita anteriormente.');
    }
    if (offer.status !== 'PENDING') {
      throw new Error(`Oferta não está mais disponível (status: ${offer.status}).`);
    }

    if (new Date(offer.expiresAt).getTime() <= nowMs) {
      offer.status = 'EXPIRED';
      offer.updatedAt = nowIso;
      const entry = memoryStore.waitlistEntries.find((e: any) => e.id === offer.waitlistEntryId);
      if (entry && entry.status === 'OFFERED') {
        entry.status = 'WAITING';
        entry.updatedAt = nowIso;
      }
      throw new Error('Esta oferta da lista de espera expirou e não pode mais gerar reserva.');
    }

    const entry = memoryStore.waitlistEntries.find(
      (e: any) => e.id === offer.waitlistEntryId && e.tenantId === tenantId
    );
    if (!entry || entry.status === 'CANCELLED') {
      offer.status = 'CANCELLED';
      offer.updatedAt = nowIso;
      throw new Error('A solicitação da lista de espera foi cancelada.');
    }

    const service = memoryStore.services.find(
      (s: any) => s.id === offer.serviceId && s.tenantId === tenantId
    );
    if (!service) throw new Error('Serviço não encontrado.');

    // Create reservation using the standard appointment creation service (validates conflicts & working hours)
    const createdAppointment = await db.createAppointment(tenantId, {
      clientId: offer.clientId,
      professionalId: offer.professionalId,
      serviceId: offer.serviceId,
      dateTime: offer.slotDateTime,
      status: Number(service.depositPercent || 0) > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED',
      origin: 'LISTA_ESPERA',
      createdBy: actorClientId || 'customer',
      totalAmount: Number(service.priceCents || 0) / 100,
      notes: `Reserva originada da Lista de Espera (${offer.id})`,
      allowOutsideHours: true,
    });

    offer.status = 'ACCEPTED';
    offer.appointmentId = createdAppointment.id;
    offer.updatedAt = nowIso;

    entry.status = 'ACCEPTED';
    entry.updatedAt = nowIso;

    return {
      offer,
      appointment: createdAppointment,
    };
  });
}

// ==========================================
// 3. PROGRAMA DE FIDELIDADE (LOYALTY)
// ==========================================

export function ensureLoyaltyProgram(tenantId: string): any {
  let prog = memoryStore.loyaltyPrograms.find((p: any) => p.tenantId === tenantId);
  if (!prog) {
    const now = new Date().toISOString();
    prog = {
      id: `lprog-${tenantId}`,
      tenantId,
      name: 'Clube de Fidelidade Agenda Beauty',
      active: true,
      pointsPerReal: 1,
      pointsExpirationDays: 365,
      minRedemptionPoints: 50,
      eligibleServiceIds: null,
      eligibleCategories: null,
      reversalRuleOnRefund: 'PROPORTIONAL',
      rulesDescription:
        'Acumule pontos a cada pagamento efetivamente confirmado. Pontos de pagamentos reembolsados são estornados automaticamente.',
      updatedBy: 'system',
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.loyaltyPrograms.push(prog);
  }
  return prog;
}

export function getClientLoyaltyBalance(tenantId: string, clientId: string, nowOverride?: Date): number {
  const nowMs = (nowOverride || new Date()).getTime();
  const entries = memoryStore.loyaltyLedgers.filter(
    (l: any) => l.tenantId === tenantId && l.clientId === clientId
  );

  let balance = 0;
  for (const item of entries) {
    if (item.pointsDelta > 0 && item.expiresAt && new Date(item.expiresAt).getTime() <= nowMs) {
      continue;
    }
    balance += Number(item.pointsDelta || 0);
  }
  return Math.max(0, balance);
}

export function getClientLoyaltySummary(tenantId: string, clientId: string) {
  const program = ensureLoyaltyProgram(tenantId);
  const balance = getClientLoyaltyBalance(tenantId, clientId);
  const ledger = memoryStore.loyaltyLedgers
    .filter((l: any) => l.tenantId === tenantId && l.clientId === clientId)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const rewards = memoryStore.loyaltyRewards.filter(
    (r: any) => r.tenantId === tenantId && r.active !== false
  );

  const earnedTotal = ledger
    .filter((l: any) => l.pointsDelta > 0)
    .reduce((acc: number, l: any) => acc + l.pointsDelta, 0);
  const redeemedTotal = ledger
    .filter((l: any) => l.type === 'REDEEM')
    .reduce((acc: number, l: any) => acc + Math.abs(l.pointsDelta), 0);
  const reversedTotal = ledger
    .filter((l: any) => l.type === 'REVERSAL')
    .reduce((acc: number, l: any) => acc + Math.abs(l.pointsDelta), 0);

  return {
    program,
    balance,
    earnedTotal,
    redeemedTotal,
    reversedTotal,
    ledger,
    rewards,
  };
}

/**
 * Awards loyalty points strictly for confirmed (APPROVED) payments.
 * Never awards points merely because an appointment was created.
 * Uses idempotency key per paymentId so repeating the event never duplicates points,
 * and deposit + balance payments only award points proportional to each confirmed payment amount!
 */
export async function awardLoyaltyPointsForPayment(
  tenantId: string,
  paymentId: string,
  actorId = 'system'
) {
  return withAtomicLock(`loyalty:pay:${paymentId}`, () => {
    const program = ensureLoyaltyProgram(tenantId);
    if (!program.active) {
      return { awarded: false, reason: 'Programa de fidelidade inativo.' };
    }

    const payment = memoryStore.payments.find(
      (p: any) => p.id === paymentId && p.tenantId === tenantId
    );
    if (!payment) {
      throw new Error('Pagamento não encontrado para este estabelecimento.');
    }
    if (payment.status !== 'APPROVED') {
      return {
        awarded: false,
        reason: 'Apenas pagamentos efetivamente confirmados (APPROVED) geram pontos de fidelidade.',
      };
    }

    const idempotencyKey = `${tenantId}:LOYALTY_EARN:PAYMENT:${payment.id}`;
    const existingEntry = memoryStore.loyaltyLedgers.find(
      (l: any) => l.idempotencyKey === idempotencyKey
    );
    if (existingEntry) {
      return {
        awarded: false,
        duplicateIgnored: true,
        entry: existingEntry,
      };
    }

    const appt = memoryStore.appointments.find(
      (a: any) => a.id === payment.appointmentId && a.tenantId === tenantId
    );
    if (!appt) {
      return { awarded: false, reason: 'Agendamento vinculado não encontrado.' };
    }

    // Check service eligibility if restricted
    if (
      Array.isArray(program.eligibleServiceIds) &&
      program.eligibleServiceIds.length > 0 &&
      !program.eligibleServiceIds.includes(appt.serviceId)
    ) {
      return { awarded: false, reason: 'Serviço não elegível para pontuação.' };
    }

    // Ensure total points granted across deposit + balance for this appointment never exceed the contracted service price
    const alreadyEarnedForAppt = memoryStore.loyaltyLedgers
      .filter(
        (l: any) =>
          l.tenantId === tenantId &&
          l.clientId === appt.clientId &&
          l.type === 'EARN' &&
          l.details?.appointmentId === appt.id
      )
      .reduce((sum: number, l: any) => sum + Number(l.pointsDelta || 0), 0);

    const maxPointsForAppt = Math.floor(
      (Number(appt.totalAmountCents || payment.amountCents) / 100) * Number(program.pointsPerReal || 1)
    );
    const rawPoints = Math.floor(
      (Number(payment.amountCents || 0) / 100) * Number(program.pointsPerReal || 1)
    );
    const pointsToAward = Math.max(0, Math.min(rawPoints, maxPointsForAppt - alreadyEarnedForAppt));

    if (pointsToAward <= 0) {
      return { awarded: false, reason: 'Pontuação máxima da compra já contabilizada.' };
    }

    const currentBalance = getClientLoyaltyBalance(tenantId, appt.clientId);
    const newBalance = currentBalance + pointsToAward;
    const now = new Date();
    const expiresAt = program.pointsExpirationDays
      ? new Date(now.getTime() + Number(program.pointsExpirationDays) * 24 * 3600 * 1000).toISOString()
      : null;

    const ledgerEntry = {
      id: `lled-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      clientId: appt.clientId,
      type: 'EARN',
      pointsDelta: pointsToAward,
      balanceAfter: newBalance,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      idempotencyKey,
      description: `Pontos acumulados pelo pagamento confirmado (${payment.paymentType || 'PIX'})`,
      justification: null,
      actorId,
      expiresAt,
      details: { appointmentId: appt.id, amountCents: payment.amountCents },
      createdAt: now.toISOString(),
    };

    memoryStore.loyaltyLedgers.push(ledgerEntry);
    return {
      awarded: true,
      pointsAwarded: pointsToAward,
      balanceAfter: newBalance,
      entry: ledgerEntry,
    };
  });
}

/**
 * Applies the loyalty reversal rule when a payment is refunded.
 */
export async function reverseLoyaltyPointsOnRefund(
  tenantId: string,
  input: {
    refundReferenceId: string;
    paymentId: string;
    refundedAmountCents: number;
    actorId?: string;
  }
) {
  return withAtomicLock(`loyalty:refund:${input.refundReferenceId}`, () => {
    const program = ensureLoyaltyProgram(tenantId);
    const idempotencyKey = `${tenantId}:LOYALTY_REVERSAL:${input.refundReferenceId}`;
    const existing = memoryStore.loyaltyLedgers.find(
      (l: any) => l.idempotencyKey === idempotencyKey
    );
    if (existing) {
      return { reversed: false, duplicateIgnored: true, entry: existing };
    }

    const earnEntry = memoryStore.loyaltyLedgers.find(
      (l: any) =>
        l.tenantId === tenantId &&
        l.type === 'EARN' &&
        l.referenceType === 'PAYMENT' &&
        l.referenceId === input.paymentId
    );
    if (!earnEntry) {
      return { reversed: false, reason: 'Nenhum ponto havia sido concedido para este pagamento.' };
    }

    const pointsToReverse =
      program.reversalRuleOnRefund === 'FULL'
        ? earnEntry.pointsDelta
        : Math.max(
            1,
            Math.floor((Number(input.refundedAmountCents || 0) / 100) * Number(program.pointsPerReal || 1))
          );

    const currentBalance = getClientLoyaltyBalance(tenantId, earnEntry.clientId);
    const actualDeduct = Math.min(currentBalance, pointsToReverse);
    const newBalance = Math.max(0, currentBalance - actualDeduct);

    const revEntry = {
      id: `lled-rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      clientId: earnEntry.clientId,
      type: 'REVERSAL',
      pointsDelta: -actualDeduct,
      balanceAfter: newBalance,
      referenceType: 'REFUND',
      referenceId: input.refundReferenceId,
      idempotencyKey,
      description: `Estorno automático de pontos por reembolso (${program.reversalRuleOnRefund})`,
      justification: 'Reembolso confirmado',
      actorId: input.actorId || 'system',
      expiresAt: null,
      createdAt: new Date().toISOString(),
    };

    memoryStore.loyaltyLedgers.push(revEntry);
    return {
      reversed: true,
      pointsReversed: actualDeduct,
      balanceAfter: newBalance,
      entry: revEntry,
    };
  });
}

export async function redeemLoyaltyReward(
  tenantId: string,
  clientId: string,
  rewardId: string,
  idempotencyKey?: string,
  actorId = 'customer'
) {
  return withAtomicLock(`loyalty:client:${tenantId}:${clientId}`, () => {
    const program = ensureLoyaltyProgram(tenantId);
    if (!program.active) throw new Error('O programa de fidelidade está temporariamente inativo.');

    const reward = memoryStore.loyaltyRewards.find(
      (r: any) => r.id === rewardId && r.tenantId === tenantId && r.active !== false
    );
    if (!reward) throw new Error('Recompensa não encontrada ou indisponível.');

    const key =
      idempotencyKey || `${tenantId}:LOYALTY_REDEEM:${clientId}:${rewardId}:${Date.now()}`;
    const existing = memoryStore.loyaltyLedgers.find((l: any) => l.idempotencyKey === key);
    if (existing) return existing;

    const currentBalance = getClientLoyaltyBalance(tenantId, clientId);
    if (currentBalance < program.minRedemptionPoints) {
      throw new Error(
        `Saldo mínimo para resgate no programa é de ${program.minRedemptionPoints} pontos.`
      );
    }
    if (currentBalance < reward.pointsRequired) {
      throw new Error(
        `Saldo insuficiente (${currentBalance} pts). Esta recompensa exige ${reward.pointsRequired} pontos.`
      );
    }

    const newBalance = currentBalance - reward.pointsRequired;
    const entry = {
      id: `lled-red-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      clientId,
      type: 'REDEEM',
      pointsDelta: -reward.pointsRequired,
      balanceAfter: newBalance,
      referenceType: 'REWARD',
      referenceId: reward.id,
      idempotencyKey: key,
      description: `Resgate de recompensa: ${reward.name}`,
      justification: null,
      actorId,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    };

    memoryStore.loyaltyLedgers.push(entry);
    return entry;
  });
}

export async function manualAdjustLoyaltyPoints(
  tenantId: string,
  input: {
    clientId: string;
    pointsDelta: number;
    justification: string;
    actorRole: string;
    actorId: string;
  }
) {
  if (input.actorRole === 'CUSTOMER') {
    throw new Error('Acesso negado: a cliente não pode alterar seu próprio saldo de pontos.');
  }
  if (!input.justification || input.justification.trim().length < 5) {
    throw new Error('Justificativa obrigatória (mínimo de 5 caracteres) para ajuste manual de pontos.');
  }

  return withAtomicLock(`loyalty:client:${tenantId}:${input.clientId}`, () => {
    const currentBalance = getClientLoyaltyBalance(tenantId, input.clientId);
    const delta = Math.trunc(Number(input.pointsDelta));
    if (delta === 0) throw new Error('Informe uma quantidade de pontos diferente de zero.');
    if (currentBalance + delta < 0) {
      throw new Error('Operação bloqueada: o ajuste deixaria o saldo da cliente negativo.');
    }

    const newBalance = currentBalance + delta;
    const nowIso = new Date().toISOString();
    const entry = {
      id: `lled-adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      clientId: input.clientId,
      type: 'MANUAL_ADJUST',
      pointsDelta: delta,
      balanceAfter: newBalance,
      referenceType: 'ADMIN_ADJUST',
      referenceId: `adj-${Date.now()}`,
      idempotencyKey: `${tenantId}:MANUAL_ADJ:${input.clientId}:${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 5)}`,
      description: `Ajuste manual administrativo (${delta > 0 ? '+' : ''}${delta} pts)`,
      justification: input.justification.trim(),
      actorId: input.actorId,
      expiresAt: null,
      createdAt: nowIso,
    };

    memoryStore.loyaltyLedgers.push(entry);
    memoryStore.auditLogs.push({
      id: `audit-loyalty-${Date.now()}`,
      tenantId,
      userId: input.actorId,
      action: 'LOYALTY_MANUAL_ADJUST',
      details: { clientId: input.clientId, pointsDelta: delta, justification: input.justification },
      createdAt: nowIso,
    });
    return entry;
  });
}

// ==========================================
// 4. CUPONS E PROMOÇÕES (COUPONS)
// ==========================================

export function saveCoupon(tenantId: string, input: any, actorId: string) {
  const code = String(input.code || '')
    .trim()
    .toUpperCase();
  if (!code || code.length < 3) {
    throw new Error('Código do cupom inválido (mínimo de 3 caracteres).');
  }

  const discountType = input.discountType === 'FIXED_CENTS' ? 'FIXED_CENTS' : 'PERCENTAGE';
  const discountValue = Math.trunc(Number(input.discountValue || 0));
  if (discountValue <= 0 || (discountType === 'PERCENTAGE' && discountValue > 100)) {
    throw new Error('Valor de desconto inválido.');
  }

  const existing = memoryStore.coupons.find(
    (c: any) => c.tenantId === tenantId && c.code === code && c.id !== input.id
  );
  if (existing) {
    throw new Error(`Já existe um cupom com o código ${code} neste estabelecimento.`);
  }

  const now = new Date().toISOString();
  const cpn = {
    id: input.id || `cpn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    code,
    name: String(input.name || code).trim(),
    description: input.description || '',
    discountType,
    discountValue,
    maxDiscountCents: input.maxDiscountCents ? Number(input.maxDiscountCents) : null,
    minPurchaseCents: Number(input.minPurchaseCents || 0),
    startsAt: input.startsAt || null,
    endsAt: input.endsAt || null,
    maxTotalUses: input.maxTotalUses ? Number(input.maxTotalUses) : null,
    maxUsesPerClient: Number(input.maxUsesPerClient || 1),
    firstPurchaseOnly: Boolean(input.firstPurchaseOnly),
    eligibleServiceIds: Array.isArray(input.eligibleServiceIds) ? input.eligibleServiceIds : null,
    eligibleProfessionalIds: Array.isArray(input.eligibleProfessionalIds)
      ? input.eligibleProfessionalIds
      : null,
    allowedClientIds: Array.isArray(input.allowedClientIds) ? input.allowedClientIds : null,
    allowStacking: Boolean(input.allowStacking),
    campaignId: input.campaignId || null,
    active: input.active !== false,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };

  const idx = memoryStore.coupons.findIndex((c: any) => c.id === cpn.id && c.tenantId === tenantId);
  if (idx >= 0) {
    memoryStore.coupons[idx] = cpn;
  } else {
    memoryStore.coupons.push(cpn);
  }
  return cpn;
}

export function validateCouponServerSide(
  tenantId: string,
  params: {
    code: string;
    clientId: string;
    serviceId: string;
    professionalId?: string;
    orderAmountCents: number;
    hasOtherPromotionApplied?: boolean;
    nowOverride?: Date;
  }
): {
  valid: boolean;
  error?: string;
  coupon?: any;
  discountCents: number;
  finalAmountCents: number;
} {
  const cleanCode = String(params.code || '')
    .trim()
    .toUpperCase();
  const coupon = memoryStore.coupons.find(
    (c: any) => c.tenantId === tenantId && c.code === cleanCode
  );

  if (!coupon) {
    return {
      valid: false,
      error: 'Cupom não encontrado ou pertence a outro estabelecimento.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  if (!coupon.active) {
    return {
      valid: false,
      error: 'Este cupom está inativo.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  const nowMs = (params.nowOverride || new Date()).getTime();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > nowMs) {
    return {
      valid: false,
      error: 'Este cupom ainda não iniciou seu período de vigência.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < nowMs) {
    return {
      valid: false,
      error: 'Este cupom está expirado.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  if (params.hasOtherPromotionApplied && !coupon.allowStacking) {
    return {
      valid: false,
      error: 'Este cupom não é cumulativo com outras promoções.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  if (params.orderAmountCents < Number(coupon.minPurchaseCents || 0)) {
    return {
      valid: false,
      error: `Valor mínimo de compra para este cupom é R$ ${(
        Number(coupon.minPurchaseCents) / 100
      ).toFixed(2)}.`,
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  if (
    Array.isArray(coupon.eligibleServiceIds) &&
    coupon.eligibleServiceIds.length > 0 &&
    !coupon.eligibleServiceIds.includes(params.serviceId)
  ) {
    return {
      valid: false,
      error: 'Este cupom não é válido para o serviço selecionado.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  if (
    params.professionalId &&
    Array.isArray(coupon.eligibleProfessionalIds) &&
    coupon.eligibleProfessionalIds.length > 0 &&
    !coupon.eligibleProfessionalIds.includes(params.professionalId)
  ) {
    return {
      valid: false,
      error: 'Este cupom não é válido para a profissional selecionada.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  if (
    Array.isArray(coupon.allowedClientIds) &&
    coupon.allowedClientIds.length > 0 &&
    !coupon.allowedClientIds.includes(params.clientId)
  ) {
    return {
      valid: false,
      error: 'Este cupom é exclusivo para clientes selecionadas.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  if (coupon.firstPurchaseOnly) {
    const priorAppointments = memoryStore.appointments.filter(
      (a: any) =>
        a.tenantId === tenantId &&
        a.clientId === params.clientId &&
        a.status !== 'CANCELLED' &&
        a.status !== 'EXPIRED'
    );
    if (priorAppointments.length > 0) {
      return {
        valid: false,
        error: 'Este cupom é exclusivo para a primeira compra no estabelecimento.',
        discountCents: 0,
        finalAmountCents: params.orderAmountCents,
      };
    }
  }

  // Check active redemptions (RESERVED or CONSUMED)
  const activeRedemptions = memoryStore.couponRedemptions.filter(
    (r: any) =>
      r.tenantId === tenantId &&
      r.couponId === coupon.id &&
      (r.status === 'RESERVED' || r.status === 'CONSUMED')
  );

  if (coupon.maxTotalUses && activeRedemptions.length >= Number(coupon.maxTotalUses)) {
    return {
      valid: false,
      error: 'O limite total de utilizações deste cupom foi atingido.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  const clientRedemptions = activeRedemptions.filter((r: any) => r.clientId === params.clientId);
  if (coupon.maxUsesPerClient && clientRedemptions.length >= Number(coupon.maxUsesPerClient)) {
    return {
      valid: false,
      error: 'Você já atingiu o limite de utilizações permitido para este cupom.',
      discountCents: 0,
      finalAmountCents: params.orderAmountCents,
    };
  }

  let discountCents = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    discountCents = Math.round((params.orderAmountCents * Number(coupon.discountValue)) / 100);
    if (coupon.maxDiscountCents && discountCents > Number(coupon.maxDiscountCents)) {
      discountCents = Number(coupon.maxDiscountCents);
    }
  } else {
    discountCents = Number(coupon.discountValue);
  }

  discountCents = Math.min(params.orderAmountCents, Math.max(0, discountCents));
  const finalAmountCents = Math.max(0, params.orderAmountCents - discountCents);

  return {
    valid: true,
    coupon,
    discountCents,
    finalAmountCents,
  };
}

/**
 * Atomically reserves a coupon usage so concurrent checkouts never exceed maxTotalUses or maxUsesPerClient.
 */
export async function reserveCouponUsage(
  tenantId: string,
  params: {
    code: string;
    clientId: string;
    serviceId: string;
    professionalId?: string;
    orderAmountCents: number;
    appointmentId?: string;
    idempotencyKey?: string;
  }
) {
  const cleanCode = String(params.code || '')
    .trim()
    .toUpperCase();
  return withAtomicLock(`coupon:${tenantId}:${cleanCode}`, () => {
    const idemp =
      params.idempotencyKey ||
      `${tenantId}:CPN:${cleanCode}:${params.clientId}:${params.appointmentId || Date.now()}`;
    const existing = memoryStore.couponRedemptions.find((r: any) => r.idempotencyKey === idemp);
    if (existing) return existing;

    const validation = validateCouponServerSide(tenantId, params);
    if (!validation.valid || !validation.coupon) {
      throw new Error(validation.error || 'Cupom inválido.');
    }

    const now = new Date().toISOString();
    const redemption = {
      id: `cpnred-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      couponId: validation.coupon.id,
      couponCode: validation.coupon.code,
      clientId: params.clientId,
      appointmentId: params.appointmentId || null,
      status: 'RESERVED',
      orderAmountCents: params.orderAmountCents,
      discountCents: validation.discountCents,
      finalAmountCents: validation.finalAmountCents,
      idempotencyKey: idemp,
      createdAt: now,
      updatedAt: now,
    };

    memoryStore.couponRedemptions.push(redemption);
    return redemption;
  });
}

/**
 * Releases a reserved coupon if the payment/appointment fails, expires, or is cancelled.
 */
export function releaseReservedCoupon(tenantId: string, redemptionIdOrAppointmentId: string) {
  const red = memoryStore.couponRedemptions.find(
    (r: any) =>
      r.tenantId === tenantId &&
      (r.id === redemptionIdOrAppointmentId || r.appointmentId === redemptionIdOrAppointmentId) &&
      r.status === 'RESERVED'
  );
  if (!red) return null;
  red.status = 'RELEASED';
  red.updatedAt = new Date().toISOString();
  return red;
}

export function confirmCouponConsumption(tenantId: string, redemptionIdOrAppointmentId: string) {
  const red = memoryStore.couponRedemptions.find(
    (r: any) =>
      r.tenantId === tenantId &&
      (r.id === redemptionIdOrAppointmentId || r.appointmentId === redemptionIdOrAppointmentId) &&
      r.status === 'RESERVED'
  );
  if (!red) return null;
  red.status = 'CONSUMED';
  red.updatedAt = new Date().toISOString();
  return red;
}

// ==========================================
// 5. PACOTES DE SERVIÇOS (SERVICE PACKAGES)
// ==========================================

export function saveServicePackage(tenantId: string, input: any, _actorId: string) {
  if (!input.name || !Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Informe o nome do pacote e ao menos um serviço incluído.');
  }
  const totalPriceCents = Math.trunc(Number(input.totalPriceCents || 0));
  if (totalPriceCents <= 0) {
    throw new Error('O preço total do pacote deve ser maior que zero.');
  }

  const now = new Date().toISOString();
  const pkg = {
    id: input.id || `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    name: String(input.name).trim(),
    description: input.description || '',
    items: input.items.map((it: any) => ({
      serviceId: String(it.serviceId),
      quantity: Math.max(1, Math.trunc(Number(it.quantity || 1))),
    })),
    totalPriceCents,
    validityDays: Math.max(1, Math.trunc(Number(input.validityDays || 90))),
    allowedProfessionalIds: Array.isArray(input.allowedProfessionalIds)
      ? input.allowedProfessionalIds
      : null,
    allowManualRenewal: input.allowManualRenewal !== false,
    cancellationPolicy:
      input.cancellationPolicy ||
      'Cancelamentos dentro do prazo preservam a sessão no pacote.',
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };

  const idx = memoryStore.servicePackages.findIndex(
    (p: any) => p.id === pkg.id && p.tenantId === tenantId
  );
  if (idx >= 0) memoryStore.servicePackages[idx] = pkg;
  else memoryStore.servicePackages.push(pkg);
  return pkg;
}

/**
 * Registers a customer package purchase.
 * Rule: Never consider a package ACTIVE/paid simply because it was requested—starts as PENDING_PAYMENT unless paymentConfirmed is true!
 */
export function purchaseCustomerPackage(
  tenantId: string,
  input: {
    packageId: string;
    clientId: string;
    paymentConfirmed: boolean;
    paymentMethod?: string;
    actorId: string;
  }
) {
  const pkg = memoryStore.servicePackages.find(
    (p: any) => p.id === input.packageId && p.tenantId === tenantId && p.active !== false
  );
  if (!pkg) throw new Error('Pacote de serviços não encontrado ou inativo.');

  const client = memoryStore.clients.find(
    (c: any) => c.id === input.clientId && c.tenantId === tenantId
  );
  if (!client) throw new Error('Cliente não encontrada neste estabelecimento.');

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + Number(pkg.validityDays || 90) * 24 * 3600 * 1000
  ).toISOString();

  const remainingItems = (pkg.items || []).map((it: any) => ({
    serviceId: it.serviceId,
    totalCredits: Number(it.quantity),
    usedCredits: 0,
    remainingCredits: Number(it.quantity),
  }));

  const custPkg = {
    id: `cpkg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    packageId: pkg.id,
    packageName: pkg.name,
    clientId: client.id,
    clientName: client.name,
    status: input.paymentConfirmed ? 'ACTIVE' : 'PENDING_PAYMENT',
    pricePaidCents: pkg.totalPriceCents,
    paymentId: input.paymentConfirmed ? `pay-pkg-${Date.now()}` : null,
    remainingItems,
    expiresAt,
    purchasedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  memoryStore.customerPackages.push(custPkg);

  if (input.paymentConfirmed) {
    memoryStore.financialTransactions.push({
      id: `ftx-pkg-${Date.now()}`,
      tenantId,
      uniqueRef: `PACKAGE_SALE:${custPkg.id}`,
      type: 'INFLOW',
      origin: 'PACKAGE_SALE',
      originId: custPkg.id,
      amountCents: pkg.totalPriceCents,
      feeCents: 0,
      netAmountCents: pkg.totalPriceCents,
      category: 'VENDA_PACOTE',
      description: `Venda de pacote: ${pkg.name} (${client.name})`,
      paymentMethod: input.paymentMethod || 'PIX',
      actorId: input.actorId,
      status: 'CONFIRMED',
      reconciliationStatus: 'RECONCILED',
      occurredAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return custPkg;
}

/**
 * Atomically consumes 1 session credit from an ACTIVE customer package.
 * Protects against concurrent double-spend of the last credit and duplicate event execution.
 */
export async function consumeCustomerPackageCredit(
  tenantId: string,
  input: {
    customerPackageId: string;
    serviceId: string;
    appointmentId?: string;
    idempotencyKey?: string;
    actorId: string;
  }
) {
  return withAtomicLock(`cpkg:${tenantId}:${input.customerPackageId}`, () => {
    const idemp =
      input.idempotencyKey ||
      `${tenantId}:PKG_USE:${input.customerPackageId}:${input.serviceId}:${
        input.appointmentId || Date.now()
      }`;

    const existingLedger = memoryStore.packageUsageLedgers.find(
      (l: any) => l.idempotencyKey === idemp
    );
    if (existingLedger) {
      return {
        consumed: false,
        duplicateIgnored: true,
        ledgerEntry: existingLedger,
      };
    }

    const custPkg = memoryStore.customerPackages.find(
      (cp: any) => cp.id === input.customerPackageId && cp.tenantId === tenantId
    );
    if (!custPkg) throw new Error('Pacote da cliente não encontrado neste estabelecimento.');

    if (custPkg.status !== 'ACTIVE') {
      throw new Error(
        `Não é possível consumir créditos de um pacote com status ${custPkg.status}. O pagamento precisa estar confirmado.`
      );
    }

    if (custPkg.expiresAt && new Date(custPkg.expiresAt).getTime() <= Date.now()) {
      custPkg.status = 'EXPIRED';
      throw new Error('Este pacote de serviços está expirado.');
    }

    const itemSlot = (custPkg.remainingItems || []).find(
      (it: any) => it.serviceId === input.serviceId
    );
    if (!itemSlot) {
      throw new Error('Este pacote não inclui o serviço selecionado.');
    }

    if (Number(itemSlot.remainingCredits || 0) <= 0) {
      throw new Error('Não há saldo de utilizações disponível para este serviço no pacote.');
    }

    itemSlot.usedCredits += 1;
    itemSlot.remainingCredits -= 1;

    const totalRemainingAll = (custPkg.remainingItems || []).reduce(
      (sum: number, it: any) => sum + Number(it.remainingCredits || 0),
      0
    );
    if (totalRemainingAll === 0) {
      custPkg.status = 'EXHAUSTED';
    }
    custPkg.updatedAt = new Date().toISOString();

    const ledgerEntry = {
      id: `pkgl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      customerPackageId: custPkg.id,
      clientId: custPkg.clientId,
      serviceId: input.serviceId,
      appointmentId: input.appointmentId || null,
      action: 'CONSUME',
      creditsDelta: -1,
      idempotencyKey: idemp,
      actorId: input.actorId,
      notes: 'Consumo de sessão de pacote (sem gerar nova venda duplicada no caixa)',
      createdAt: new Date().toISOString(),
    };

    memoryStore.packageUsageLedgers.push(ledgerEntry);
    return {
      consumed: true,
      customerPackage: custPkg,
      ledgerEntry,
    };
  });
}

// ==========================================
// 6. CARTÕES-PRESENTE (GIFT CARDS)
// ==========================================

function generateSecureGiftCardCode(): string {
  const p1 = crypto.randomBytes(3).toString('hex').toUpperCase();
  const p2 = crypto.randomBytes(3).toString('hex').toUpperCase();
  const p3 = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GC-${p1}-${p2}-${p3}`;
}

export function createGiftCard(
  tenantId: string,
  input: {
    initialBalanceCents: number;
    purchaserClientId?: string;
    recipientName?: string;
    recipientPhone?: string;
    personalMessage?: string;
    allowPartialUse?: boolean;
    expiresAt?: string;
    paymentConfirmed?: boolean;
  },
  actorId: string
) {
  const balanceCents = Math.trunc(Number(input.initialBalanceCents || 0));
  if (balanceCents <= 0) {
    throw new Error('O valor do cartão-presente deve ser maior que zero.');
  }

  let code = generateSecureGiftCardCode();
  while (memoryStore.giftCards.some((g: any) => g.code === code)) {
    code = generateSecureGiftCardCode();
  }

  const now = new Date().toISOString();
  const card = {
    id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    code,
    initialBalanceCents: balanceCents,
    currentBalanceCents: balanceCents,
    status: input.paymentConfirmed ? 'ACTIVE' : 'PENDING_PAYMENT',
    purchaserClientId: input.purchaserClientId || null,
    recipientName: input.recipientName || '',
    recipientPhone: input.recipientPhone || '',
    personalMessage: input.personalMessage || '',
    allowPartialUse: input.allowPartialUse !== false,
    paymentId: input.paymentConfirmed ? `pay-gc-${Date.now()}` : null,
    expiresAt:
      input.expiresAt || new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString(),
    blockedReason: null,
    blockedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.giftCards.push(card);
  return card;
}

/**
 * Public/Recipient view of a gift card: never exposes purchaserClientId or buyer personal info!
 */
export function lookupGiftCardForRecipient(tenantId: string, code: string) {
  const card = memoryStore.giftCards.find(
    (g: any) => g.tenantId === tenantId && g.code === String(code || '').trim().toUpperCase()
  );
  if (!card) throw new Error('Cartão-presente não encontrado.');
  return {
    id: card.id,
    code: card.code,
    initialBalanceCents: card.initialBalanceCents,
    currentBalanceCents: card.currentBalanceCents,
    status: card.status,
    recipientName: card.recipientName,
    personalMessage: card.personalMessage,
    allowPartialUse: card.allowPartialUse,
    expiresAt: card.expiresAt,
  };
}

export function blockGiftCard(
  tenantId: string,
  giftCardId: string,
  justification: string,
  actorId: string
) {
  if (!justification || justification.trim().length < 5) {
    throw new Error('Justificativa obrigatória para bloquear ou cancelar um cartão-presente.');
  }
  const card = memoryStore.giftCards.find(
    (g: any) => g.id === giftCardId && g.tenantId === tenantId
  );
  if (!card) throw new Error('Cartão-presente não encontrado neste estabelecimento.');

  const now = new Date().toISOString();
  card.status = 'BLOCKED';
  card.blockedReason = justification.trim();
  card.blockedBy = actorId;
  card.updatedAt = now;

  memoryStore.giftCardTransactions.push({
    id: `gctx-${Date.now()}`,
    tenantId,
    giftCardId: card.id,
    type: 'BLOCK',
    amountCentsDelta: 0,
    balanceAfterCents: card.currentBalanceCents,
    appointmentId: null,
    idempotencyKey: `${tenantId}:GC_BLOCK:${card.id}:${Date.now()}`,
    actorId,
    justification: justification.trim(),
    createdAt: now,
  });

  return card;
}

export async function redeemGiftCard(
  tenantId: string,
  input: {
    code: string;
    amountCents: number;
    appointmentId?: string;
    idempotencyKey?: string;
    actorId: string;
  }
) {
  const cleanCode = String(input.code || '')
    .trim()
    .toUpperCase();
  return withAtomicLock(`giftcard:${tenantId}:${cleanCode}`, () => {
    const card = memoryStore.giftCards.find(
      (g: any) => g.tenantId === tenantId && g.code === cleanCode
    );
    if (!card) throw new Error('Cartão-presente não encontrado neste estabelecimento.');

    const idemp =
      input.idempotencyKey ||
      `${tenantId}:GC_REDEEM:${card.id}:${input.appointmentId || Date.now()}`;
    const existingTx = memoryStore.giftCardTransactions.find(
      (t: any) => t.idempotencyKey === idemp
    );
    if (existingTx) {
      return {
        redeemed: false,
        duplicateIgnored: true,
        transaction: existingTx,
        card,
      };
    }

    if (card.status === 'BLOCKED' || card.status === 'CANCELLED') {
      throw new Error('Este cartão-presente está bloqueado ou cancelado e não pode ser utilizado.');
    }
    if (card.status === 'PENDING_PAYMENT') {
      throw new Error('Este cartão-presente aguarda confirmação de pagamento para ser ativado.');
    }
    if (card.expiresAt && new Date(card.expiresAt).getTime() <= Date.now()) {
      card.status = 'EXPIRED';
      throw new Error('Este cartão-presente está expirado.');
    }

    const amount = Math.trunc(Number(input.amountCents || 0));
    if (amount <= 0) throw new Error('O valor de utilização deve ser maior que zero.');
    if (amount > card.currentBalanceCents) {
      throw new Error(
        `Saldo insuficiente no cartão-presente (disponível: R$ ${(
          card.currentBalanceCents / 100
        ).toFixed(2)}).`
      );
    }
    if (!card.allowPartialUse && amount < card.currentBalanceCents) {
      throw new Error('Este cartão-presente exige utilização integral em uma única compra.');
    }

    card.currentBalanceCents -= amount;
    if (card.currentBalanceCents === 0) {
      card.status = 'EXHAUSTED';
    }
    const now = new Date().toISOString();
    card.updatedAt = now;

    const tx = {
      id: `gctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      giftCardId: card.id,
      type: 'REDEEM',
      amountCentsDelta: -amount,
      balanceAfterCents: card.currentBalanceCents,
      appointmentId: input.appointmentId || null,
      idempotencyKey: idemp,
      actorId: input.actorId,
      justification: 'Utilização em atendimento',
      createdAt: now,
    };
    memoryStore.giftCardTransactions.push(tx);

    return {
      redeemed: true,
      transaction: tx,
      card,
    };
  });
}

// ==========================================
// 7. AVALIAÇÕES E FEEDBACK (REVIEWS)
// ==========================================

export function createServiceReview(
  tenantId: string,
  input: {
    appointmentId: string;
    clientId: string;
    rating: number;
    comment?: string;
  }
) {
  const appt = memoryStore.appointments.find(
    (a: any) => a.id === input.appointmentId && a.tenantId === tenantId
  );
  if (!appt) {
    throw new Error('Agendamento não encontrado neste estabelecimento.');
  }
  if (appt.clientId !== input.clientId) {
    throw new Error('Acesso negado: você só pode avaliar seus próprios atendimentos.');
  }
  if (appt.status !== 'COMPLETED') {
    throw new Error(
      `Apenas atendimentos efetivamente concluídos (COMPLETED) podem ser avaliados. Status atual: ${appt.status}.`
    );
  }

  const existing = memoryStore.serviceReviews.find(
    (r: any) => r.appointmentId === input.appointmentId
  );
  if (existing) {
    throw new Error('Este atendimento já foi avaliado anteriormente (duplicidade bloqueada).');
  }

  const rating = Math.trunc(Number(input.rating));
  if (rating < 1 || rating > 5) {
    throw new Error('A nota da avaliação deve ser um número inteiro entre 1 e 5.');
  }

  const now = new Date().toISOString();
  const review = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    appointmentId: appt.id,
    clientId: appt.clientId,
    serviceId: appt.serviceId,
    professionalId: appt.professionalId,
    rating,
    comment: input.comment ? String(input.comment).trim() : '',
    replyText: null,
    repliedBy: null,
    repliedAt: null,
    hidden: false,
    hiddenReason: null,
    hiddenBy: null,
    hiddenAt: null,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.serviceReviews.push(review);
  return review;
}

export function replyToServiceReview(
  tenantId: string,
  reviewId: string,
  replyText: string,
  actorId: string
) {
  const rev = memoryStore.serviceReviews.find(
    (r: any) => r.id === reviewId && r.tenantId === tenantId
  );
  if (!rev) throw new Error('Avaliação não encontrada.');
  if (!replyText || !replyText.trim()) throw new Error('Informe o texto da resposta.');

  // Owner can reply, NEVER alter original rating or comment
  rev.replyText = replyText.trim();
  rev.repliedBy = actorId;
  rev.repliedAt = new Date().toISOString();
  rev.updatedAt = rev.repliedAt;
  return rev;
}

export function moderateServiceReviewVisibility(
  tenantId: string,
  reviewId: string,
  hidden: boolean,
  reason: string,
  actorId: string
) {
  const rev = memoryStore.serviceReviews.find(
    (r: any) => r.id === reviewId && r.tenantId === tenantId
  );
  if (!rev) throw new Error('Avaliação não encontrada.');
  if (hidden && (!reason || reason.trim().length < 5)) {
    throw new Error('Justificativa obrigatória para ocultar uma avaliação.');
  }

  const now = new Date().toISOString();
  rev.hidden = Boolean(hidden);
  rev.hiddenReason = hidden ? reason.trim() : null;
  rev.hiddenBy = hidden ? actorId : null;
  rev.hiddenAt = hidden ? now : null;
  rev.updatedAt = now;

  memoryStore.auditLogs.push({
    id: `audit-rev-${Date.now()}`,
    tenantId,
    userId: actorId,
    action: hidden ? 'REVIEW_HIDDEN' : 'REVIEW_UNHIDDEN',
    details: { reviewId, reason: rev.hiddenReason },
    createdAt: now,
  });

  return rev;
}

export function getReviewsSummary(
  tenantId: string,
  filters?: { serviceId?: string; professionalId?: string; includeHidden?: boolean }
) {
  const all = memoryStore.serviceReviews.filter((r: any) => {
    if (r.tenantId !== tenantId) return false;
    if (!filters?.includeHidden && r.hidden) return false;
    if (filters?.serviceId && r.serviceId !== filters.serviceId) return false;
    if (filters?.professionalId && r.professionalId !== filters.professionalId) return false;
    return true;
  });

  const count = all.length;
  const avg =
    count > 0
      ? Number((all.reduce((s: number, r: any) => s + Number(r.rating), 0) / count).toFixed(2))
      : 0;

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of all) {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
  }

  const enriched = all
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((r: any) => {
      const client = memoryStore.clients.find((c: any) => c.id === r.clientId);
      const service = memoryStore.services.find((s: any) => s.id === r.serviceId);
      const prof = memoryStore.professionals.find((p: any) => p.id === r.professionalId);
      return {
        ...r,
        clientName: client?.name || 'Cliente',
        serviceName: service?.name || 'Serviço',
        professionalName: prof?.name || 'Profissional',
      };
    });

  return {
    averageRating: avg,
    totalReviews: count,
    distribution,
    reviews: enriched,
  };
}

// ==========================================
// 8. CAMPANHAS E COMUNICAÇÃO (MARKETING CAMPAIGNS)
// ==========================================

export function previewCampaignSegment(
  tenantId: string,
  segmentType: string,
  segmentFilters?: any
) {
  const allClients = memoryStore.clients.filter(
    (c: any) => c.tenantId === tenantId && c.active !== false
  );

  const matchedSegment = allClients.filter((c: any) => {
    if (segmentType === 'USED_SERVICE' && segmentFilters?.serviceId) {
      return memoryStore.appointments.some(
        (a: any) =>
          a.tenantId === tenantId &&
          a.clientId === c.id &&
          a.serviceId === segmentFilters.serviceId &&
          a.status === 'COMPLETED'
      );
    }
    if (segmentType === 'INACTIVE_DAYS') {
      const days = Number(segmentFilters?.days || 30);
      const cutoff = Date.now() - days * 24 * 3600 * 1000;
      const hasRecent = memoryStore.appointments.some(
        (a: any) =>
          a.tenantId === tenantId &&
          a.clientId === c.id &&
          new Date(a.dateTime).getTime() >= cutoff
      );
      return !hasRecent;
    }
    if (segmentType === 'PACKAGE_NEAR_END') {
      return memoryStore.customerPackages.some((cp: any) => {
        if (cp.tenantId !== tenantId || cp.clientId !== c.id || cp.status !== 'ACTIVE') return false;
        const totalRem = (cp.remainingItems || []).reduce(
          (s: number, it: any) => s + Number(it.remainingCredits || 0),
          0
        );
        return totalRem === 1;
      });
    }
    return true;
  });

  const eligibleWithConsent = matchedSegment.filter(
    (c: any) => Boolean(c.promotionalConsent) && !c.promotionalConsentRevokedAt
  );
  const blockedWithoutConsent = matchedSegment.filter(
    (c: any) => !c.promotionalConsent || Boolean(c.promotionalConsentRevokedAt)
  );

  return {
    totalInSegment: matchedSegment.length,
    eligibleWithMarketingConsentCount: eligibleWithConsent.length,
    blockedWithoutConsentCount: blockedWithoutConsent.length,
    eligibleClients: eligibleWithConsent,
    allSegmentClients: matchedSegment,
  };
}

export function createMarketingCampaign(tenantId: string, input: any, _actorId: string) {
  if (!input.name || !input.messagePreview) {
    throw new Error('Informe o nome da campanha e a mensagem promocional.');
  }
  const preview = previewCampaignSegment(
    tenantId,
    input.segmentType || 'PROMOTIONAL_OPT_IN',
    input.segmentFilters
  );

  const now = new Date().toISOString();
  const camp = {
    id: `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    name: String(input.name).trim(),
    objective: String(input.objective || 'Fidelização e retorno de clientes').trim(),
    segmentType: input.segmentType || 'PROMOTIONAL_OPT_IN',
    segmentFilters: input.segmentFilters || {},
    couponCode: input.couponCode || null,
    templateName: input.templateName || 'agenda_beauty_Novidades_mkt_v1',
    messagePreview: String(input.messagePreview).trim(),
    status: 'DRAFT',
    estimatedRecipients: preview.eligibleWithMarketingConsentCount,
    dispatchedBy: null,
    dispatchedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.marketingCampaigns.push(camp);
  return camp;
}

/**
 * Dispatches a marketing campaign using the official Etapa 10 WhatsApp service.
 * Strictly respects promotionalConsent and prevents duplicate sends per (campaignId, clientId).
 */
export async function dispatchMarketingCampaign(
  tenantId: string,
  campaignId: string,
  confirmDispatch: boolean,
  actorId: string
) {
  if (!confirmDispatch) {
    throw new Error('Confirmação explícita obrigatória antes de disparar campanha promocional.');
  }

  return withAtomicLock(`campaign:${tenantId}:${campaignId}`, async () => {
    const camp = memoryStore.marketingCampaigns.find(
      (c: any) => c.id === campaignId && c.tenantId === tenantId
    );
    if (!camp) throw new Error('Campanha não encontrada neste estabelecimento.');

    const tenant = memoryStore.tenants.find((t: any) => t.id === tenantId);
    const preview = previewCampaignSegment(tenantId, camp.segmentType, camp.segmentFilters);

    let sentOrQueued = 0;
    let skippedNoConsent = 0;
    let duplicatesBlocked = 0;
    let failedCount = 0;

    for (const client of preview.allSegmentClients) {
      const idempKey = `${tenantId}:CAMPAIGN:${camp.id}:CLIENT:${client.id}`;
      const existingRec = memoryStore.campaignRecipients.find(
        (r: any) => r.idempotencyKey === idempKey
      );
      if (existingRec) {
        duplicatesBlocked++;
        continue;
      }

      const hasConsent =
        Boolean(client.promotionalConsent) && !client.promotionalConsentRevokedAt;
      if (!hasConsent) {
        memoryStore.campaignRecipients.push({
          id: `cmprec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tenantId,
          campaignId: camp.id,
          clientId: client.id,
          recipientPhone: client.normalizedPhone || client.phone || '',
          status: 'SKIPPED_NO_CONSENT',
          whatsappMsgId: null,
          errorReason: 'Cliente sem opt-in promocional ativo',
          idempotencyKey: idempKey,
          createdAt: new Date().toISOString(),
        });
        skippedNoConsent++;
        continue;
      }

      const offerText = camp.couponCode
        ? `${camp.messagePreview} Use o cupom: ${camp.couponCode}`
        : camp.messagePreview;

      const waRes = await enqueueWhatsAppMessage({
        tenantId,
        clientId: client.id,
        referenceId: `campaign:${camp.id}`,
        eventType: 'PROMOTIONAL_CAMPAIGN',
        messageCategory: 'PROMOTIONAL',
        variables: [client.name, tenant?.name || 'Agenda Beauty', offerText],
        idempotencyKeyOverride: idempKey,
        requestedBy: actorId,
      });

      const recStatus = waRes.message?.status || (waRes.enqueued ? 'PENDING' : 'FAILED');
      if (recStatus === 'SENT' || recStatus === 'PENDING') sentOrQueued++;
      else failedCount++;

      memoryStore.campaignRecipients.push({
        id: `cmprec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        campaignId: camp.id,
        clientId: client.id,
        recipientPhone: client.normalizedPhone || client.phone || '',
        status: recStatus,
        whatsappMsgId: waRes.message?.id || null,
        errorReason: waRes.errorMessage || waRes.message?.errorMessage || null,
        idempotencyKey: idempKey,
        createdAt: new Date().toISOString(),
      });
    }

    const nowIso = new Date().toISOString();
    camp.status = 'DISPATCHED';
    camp.dispatchedBy = actorId;
    camp.dispatchedAt = nowIso;
    camp.updatedAt = nowIso;

    memoryStore.auditLogs.push({
      id: `audit-cmp-${Date.now()}`,
      tenantId,
      userId: actorId,
      action: 'MARKETING_CAMPAIGN_DISPATCHED',
      details: {
        campaignId: camp.id,
        sentOrQueued,
        skippedNoConsent,
        duplicatesBlocked,
        failedCount,
      },
      createdAt: nowIso,
    });

    return {
      campaign: camp,
      summary: {
        sentOrQueued,
        skippedNoConsent,
        duplicatesBlocked,
        failedCount,
      },
    };
  });
}

// ==========================================
// 9. ESTOQUE BÁSICO DE PRODUTOS (INVENTORY)
// ==========================================

export function saveInventoryProduct(tenantId: string, input: any, _actorId: string) {
  const sku = String(input.sku || '')
    .trim()
    .toUpperCase();
  if (!input.name || !sku) {
    throw new Error('Informe o nome e o código/SKU do produto.');
  }

  const duplicateSku = memoryStore.inventoryProducts.find(
    (p: any) => p.tenantId === tenantId && p.sku === sku && p.id !== input.id
  );
  if (duplicateSku) {
    throw new Error(`Já existe um produto com o SKU ${sku} neste estabelecimento.`);
  }

  const now = new Date().toISOString();
  const prod = {
    id: input.id || `prd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    name: String(input.name).trim(),
    sku,
    category: String(input.category || 'INSUMOS').trim(),
    unit: String(input.unit || 'UN').trim(),
    currentQuantity: Math.max(0, Math.trunc(Number(input.currentQuantity ?? 0))),
    minQuantity: Math.max(0, Math.trunc(Number(input.minQuantity ?? 5))),
    unitCostCents: Math.max(0, Math.trunc(Number(input.unitCostCents ?? 0))),
    salePriceCents: input.salePriceCents ? Math.trunc(Number(input.salePriceCents)) : null,
    serviceConsumption: Array.isArray(input.serviceConsumption) ? input.serviceConsumption : [],
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };

  const idx = memoryStore.inventoryProducts.findIndex(
    (p: any) => p.id === prod.id && p.tenantId === tenantId
  );
  if (idx >= 0) memoryStore.inventoryProducts[idx] = prod;
  else memoryStore.inventoryProducts.push(prod);
  return prod;
}

export async function recordInventoryMovement(
  tenantId: string,
  input: {
    productId: string;
    type: 'IN' | 'MANUAL_OUT' | 'ADJUSTMENT' | 'LOSS' | 'SALE' | 'SERVICE_CONSUMPTION';
    quantityDelta: number;
    reason: string;
    referenceId?: string;
    idempotencyKey?: string;
    actorId: string;
  }
) {
  if (!input.actorId) {
    throw new Error('Responsável pela movimentação de estoque é obrigatório.');
  }
  if (!input.reason || input.reason.trim().length < 3) {
    throw new Error('Justificativa/motivo obrigatório para movimentação ou ajuste de estoque.');
  }

  return withAtomicLock(`inv:${tenantId}:${input.productId}`, () => {
    const prod = memoryStore.inventoryProducts.find(
      (p: any) => p.id === input.productId && p.tenantId === tenantId
    );
    if (!prod) throw new Error('Produto não encontrado no estoque deste estabelecimento.');

    const idemp =
      input.idempotencyKey ||
      `${tenantId}:INV_MOV:${prod.id}:${input.type}:${input.referenceId || Date.now()}`;
    const existingMov = memoryStore.inventoryMovements.find(
      (m: any) => m.idempotencyKey === idemp
    );
    if (existingMov) {
      return {
        recorded: false,
        duplicateIgnored: true,
        movement: existingMov,
        product: prod,
      };
    }

    const delta = Math.trunc(Number(input.quantityDelta));
    if (delta === 0) throw new Error('A quantidade movimentada deve ser diferente de zero.');

    const prevQty = Number(prod.currentQuantity || 0);
    const newQty = prevQty + delta;
    if (newQty < 0) {
      throw new Error(
        `Saldo de estoque insuficiente para ${prod.name} (atual: ${prevQty}, solicitado: ${delta}).`
      );
    }

    const now = new Date().toISOString();
    prod.currentQuantity = newQty;
    prod.updatedAt = now;

    const mov = {
      id: `imov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      productId: prod.id,
      productName: prod.name,
      type: input.type,
      quantityDelta: delta,
      previousQuantity: prevQty,
      newQuantity: newQty,
      unitCostCents: prod.unitCostCents,
      reason: input.reason.trim(),
      referenceId: input.referenceId || null,
      idempotencyKey: idemp,
      actorId: input.actorId,
      createdAt: now,
    };

    memoryStore.inventoryMovements.push(mov);
    return {
      recorded: true,
      movement: mov,
      product: prod,
    };
  });
}

/**
 * Deducts configured product consumption when an appointment is marked COMPLETED.
 * Uses idempotency per (appointmentId, productId) so duplicate completion events NEVER reduce stock twice!
 */
export async function consumeInventoryOnCompletedAppointment(
  tenantId: string,
  appointmentId: string,
  actorId = 'system'
) {
  const appt = memoryStore.appointments.find(
    (a: any) => a.id === appointmentId && a.tenantId === tenantId
  );
  if (!appt || appt.status !== 'COMPLETED') return [];

  const products = memoryStore.inventoryProducts.filter(
    (p: any) => p.tenantId === tenantId && p.active !== false
  );

  const results = [];
  for (const prod of products) {
    const rule = (prod.serviceConsumption || []).find(
      (r: any) => r.serviceId === appt.serviceId && Number(r.quantityPerAppointment) > 0
    );
    if (!rule) continue;

    const qty = Math.trunc(Number(rule.quantityPerAppointment));
    if (prod.currentQuantity < qty) continue;

    const res = await recordInventoryMovement(tenantId, {
      productId: prod.id,
      type: 'SERVICE_CONSUMPTION',
      quantityDelta: -qty,
      reason: `Consumo automático configurado para atendimento concluído (${appt.id})`,
      referenceId: appt.id,
      idempotencyKey: `${tenantId}:INV_APPT_CONSUME:${appt.id}:${prod.id}`,
      actorId,
    });
    results.push(res);
  }
  return results;
}
