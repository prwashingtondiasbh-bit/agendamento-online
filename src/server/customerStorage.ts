import {
  getMySqlPool,
  getConnectionWithRetry,
  queryWithRetry,
  executeWithRetry,
  handleDbFallbackError,
  validateEnumValueStrict,
  VALID_TENANT_MEMBER_ROLES,
} from './db/mysql.js';
import { db, memoryStore } from './storage.js';
import { saasService } from './saasService.js';

export const customerStorage = {
  // Resolve or link client record for authenticated customer user within a specific tenant without leaking internal salon data
  async getClientForCustomerUser(tenantId: string, userId: string, userEmail: string, userName?: string, userPhone?: string) {
    saasService.ensureSaaSSeedData();
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await queryWithRetry(
          `SELECT * FROM Client WHERE tenantId = ? AND (email = ? OR notes LIKE ?) LIMIT 1`,
          [tenantId, userEmail, `%userId:${userId}%`]
        );
        if (rows && rows.length > 0) {
          const c = rows[0];
          // Ensure memoryStore also tracks the link
          const memMatch = (memoryStore.clients as any[]).find((mc) => mc.id === c.id && mc.tenantId === tenantId);
          if (memMatch && !memMatch.userId) {
            memMatch.userId = userId;
          }
          return {
            id: c.id,
            tenantId: c.tenantId,
            userId,
            name: c.name,
            phone: c.phone || userPhone || '',
            email: c.email || userEmail,
            notes: c.notes || '',
            contactPreference: c.notes?.includes('pref:SMS') ? 'SMS' : c.notes?.includes('pref:EMAIL') ? 'EMAIL' : 'WHATSAPP',
            createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
          };
        }

        // Auto-link client record for this customer in this tenant
        const clientId = `cli-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const now = new Date();
        await executeWithRetry(
          `INSERT INTO Client (id, tenantId, name, phone, email, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clientId,
            tenantId,
            userName || 'Cliente',
            userPhone || '',
            userEmail,
            `userId:${userId} pref:WHATSAPP`,
            now,
            now,
          ]
        );
        const createdObj = {
          id: clientId,
          tenantId,
          userId,
          name: userName || 'Cliente',
          phone: userPhone || '',
          email: userEmail,
          notes: `userId:${userId}`,
          contactPreference: 'WHATSAPP',
          createdAt: now.toISOString(),
        };
        if (!(memoryStore.clients as any[]).some((mc) => mc.id === clientId)) {
          (memoryStore.clients as any[]).push({ ...createdObj, internalNotes: [], tags: [] });
        }
        return createdObj;
      } catch (e) {
        handleDbFallbackError('getClientForCustomerUser', e);
      }
    }

    // Memory store resolution scoped strictly to tenantId
    const normalizedPhone = userPhone ? db.normalizePhone(userPhone) : '';
    let client = (memoryStore.clients as any[]).find(
      (c) =>
        c.tenantId === tenantId &&
        (c.userId === userId ||
          (userEmail && String(c.email || '').toLowerCase() === String(userEmail).toLowerCase()) ||
          String(c.notes || '').includes(`userId:${userId}`) ||
          (normalizedPhone.length >= 8 && db.normalizePhone(c.phone) === normalizedPhone))
    );
    if (client) {
      if (!client.userId) client.userId = userId;
      if (!client.email && userEmail) client.email = userEmail;
      if (!client.phone && userPhone) client.phone = userPhone;
    } else {
      client = {
        id: `cli-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        userId,
        name: userName || 'Cliente',
        phone: userPhone || '',
        email: userEmail,
        contactPreference: 'WHATSAPP',
        notes: `userId:${userId}`,
        internalNotes: [],
        tags: [],
        createdAt: new Date().toISOString(),
      };
      (memoryStore.clients as any[]).push(client);
    }
    // Never return internalNotes or private salon tags to the customer object
    return {
      id: client.id,
      tenantId: client.tenantId,
      userId: client.userId || userId,
      name: client.name,
      phone: client.phone || userPhone || '',
      email: client.email || userEmail,
      contactPreference: client.contactPreference || 'WHATSAPP',
      createdAt: client.createdAt || new Date().toISOString(),
    };
  },

  async hasClientLinkInTenant(tenantId: string, userId: string, userEmail: string) {
    saasService.ensureSaaSSeedData();
    if (!tenantId || !userId) return null;
    const emailLower = String(userEmail || '').toLowerCase();

    // 1. Check in-memory clients for this specific tenant
    const existingMem = (memoryStore.clients as any[]).find(
      (c) =>
        c.tenantId === tenantId &&
        (c.userId === userId ||
          (emailLower && String(c.email || '').toLowerCase() === emailLower) ||
          String(c.notes || '').includes(`userId:${userId}`))
    );
    if (existingMem) {
      if (!existingMem.userId) existingMem.userId = userId;
      return {
        id: existingMem.id,
        tenantId: existingMem.tenantId,
        userId: existingMem.userId || userId,
        name: existingMem.name,
        phone: existingMem.phone || '',
        email: existingMem.email || userEmail,
        contactPreference: existingMem.contactPreference || 'WHATSAPP',
        createdAt: existingMem.createdAt || new Date().toISOString(),
      };
    }

    // 2. Check MySQL if pool is active (read-only, never auto-inserts)
    const pool = getMySqlPool();
    if (pool) {
      try {
        const [rows]: any = await queryWithRetry(
          `SELECT * FROM Client WHERE tenantId = ? AND (email = ? OR notes LIKE ?) LIMIT 1`,
          [tenantId, userEmail, `%userId:${userId}%`]
        );
        if (rows && rows.length > 0) {
          const c = rows[0];
          const hydrated = {
            id: c.id,
            tenantId: c.tenantId,
            userId,
            name: c.name,
            phone: c.phone || '',
            email: c.email || userEmail,
            contactPreference: c.notes?.includes('pref:SMS') ? 'SMS' : c.notes?.includes('pref:EMAIL') ? 'EMAIL' : 'WHATSAPP',
            notes: c.notes || `userId:${userId}`,
            createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
          };
          if (!(memoryStore.clients as any[]).some((mc) => mc.id === c.id)) {
            (memoryStore.clients as any[]).push({ ...hydrated, internalNotes: [], tags: [] });
          }
          return hydrated;
        }
      } catch (e) {
        handleDbFallbackError('hasClientLinkInTenant', e);
      }
    }

    return null;
  },

  async getLinkedClientsForUser(userId: string, userEmail: string, filterTenantId?: string) {
    saasService.ensureSaaSSeedData();
    const emailLower = String(userEmail || '').toLowerCase();

    // Hydrate from MySQL Client table if pool is active so permanent links are never lost after server restarts
    const pool = getMySqlPool();
    if (pool) {
      try {
        const sql = filterTenantId
          ? `SELECT * FROM Client WHERE tenantId = ? AND (email = ? OR notes LIKE ?)`
          : `SELECT * FROM Client WHERE email = ? OR notes LIKE ?`;
        const params = filterTenantId
          ? [filterTenantId, userEmail, `%userId:${userId}%`]
          : [userEmail, `%userId:${userId}%`];
        const [rows]: any = await queryWithRetry(sql, params);
        if (Array.isArray(rows)) {
          for (const c of rows) {
            const existingMem = (memoryStore.clients as any[]).find(
              (mc) => mc.id === c.id && mc.tenantId === c.tenantId
            );
            const hydrated = {
              id: c.id,
              tenantId: c.tenantId,
              userId,
              name: c.name,
              phone: c.phone || '',
              email: c.email || userEmail,
              contactPreference: c.notes?.includes('pref:SMS')
                ? 'SMS'
                : c.notes?.includes('pref:EMAIL')
                ? 'EMAIL'
                : 'WHATSAPP',
              notes: c.notes || `userId:${userId}`,
              createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
            };
            if (existingMem) {
              Object.assign(existingMem, hydrated);
            } else {
              (memoryStore.clients as any[]).push({ ...hydrated, internalNotes: [], tags: [] });
            }
          }
        }
      } catch (e) {
        handleDbFallbackError('getLinkedClientsForUser', e);
      }
    }

    const matched = (memoryStore.clients as any[]).filter((c) => {
      if (filterTenantId && c.tenantId !== filterTenantId) return false;
      return (
        c.userId === userId ||
        (emailLower && String(c.email || '').toLowerCase() === emailLower) ||
        String(c.notes || '').includes(`userId:${userId}`)
      );
    });
    return matched;
  },

  async getLinkedEstablishmentsForCustomer(userId: string, userEmail: string) {
    await saasService.syncTenantsFromMySql();
    const linkedClients = await this.getLinkedClientsForUser(userId, userEmail);
    const seenTenants = new Set<string>();
    const establishments: any[] = [];

    for (const client of linkedClients) {
      if (!client.tenantId || seenTenants.has(client.tenantId)) continue;
      const existsInTenants = (memoryStore.tenants as any[]).some(
        (t) => t.id === client.tenantId
      );
      if (!existsInTenants) continue;

      const tenant = await db.getBusiness(client.tenantId);
      if (!tenant || tenant.id !== client.tenantId || seenTenants.has(tenant.id)) continue;
      seenTenants.add(client.tenantId);
      seenTenants.add(tenant.id);

      const effectiveRequireDeposit =
        tenant.requireDeposit !== undefined ? Boolean(tenant.requireDeposit) : true;
      const effectiveDefaultDeposit = effectiveRequireDeposit
        ? Number(tenant.defaultDeposit ?? 30)
        : 0;

      establishments.push({
        id: tenant.id,
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug || tenant.id,
        logoUrl: tenant.logoUrl || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        address: tenant.address || '',
        description: tenant.description || '',
        openTime: tenant.openTime || '08:00',
        closeTime: tenant.closeTime || '20:00',
        status: tenant.status || 'ACTIVE',
        requireDeposit: effectiveRequireDeposit,
        defaultDeposit: effectiveDefaultDeposit,
        clientId: client.id,
        linkedAt: client.createdAt || new Date().toISOString(),
      });
    }

    return establishments;
  },

  async reconcileCustomerLinkByMasterAdmin(params: {
    userId: string;
    targetTenantId: string;
    sourceClientId?: string;
    action?: 'REPAIR_LINK' | 'MERGE_DUPLICATE' | 'RELINK';
    reason: string;
    actorId: string;
  }) {
    saasService.ensureSaaSSeedData();
    const { userId, targetTenantId, sourceClientId, action = 'REPAIR_LINK', reason, actorId } = params;

    if (!reason || String(reason).trim().length < 5) {
      const err: any = new Error('Justificativa administrativa obrigatória (mínimo de 5 caracteres).');
      err.statusCode = 400;
      throw err;
    }

    const user = (memoryStore.users as any[]).find((u) => u.id === userId);
    if (!user) {
      const err: any = new Error('Usuário global da cliente não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const tenant = (memoryStore.tenants as any[]).find(
      (t) => t.id === targetTenantId || t.slug === targetTenantId
    );
    if (!tenant) {
      const err: any = new Error('Estabelecimento de destino não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const resolvedTenantId = tenant.id;
    let primaryClient = await this.getClientForCustomerUser(
      resolvedTenantId,
      user.id,
      user.email,
      user.name,
      user.phone
    );

    let reassignedAppointments = 0;
    if (sourceClientId && sourceClientId !== primaryClient.id) {
      const sourceClient = (memoryStore.clients as any[]).find(
        (c) => c.id === sourceClientId && c.tenantId === resolvedTenantId
      );
      if (sourceClient) {
        // Reassign any appointments from duplicate client record to primaryClient without deleting history or financial records
        for (const app of memoryStore.appointments as any[]) {
          if (app.tenantId === resolvedTenantId && app.clientId === sourceClientId) {
            app.clientId = primaryClient.id;
            reassignedAppointments++;
          }
        }
        sourceClient.userId = user.id;
        sourceClient.notes = `${sourceClient.notes || ''} mergedInto:${primaryClient.id} userId:${user.id}`.trim();
      }
    }

    await db.recordAuditLog(resolvedTenantId, actorId, 'MASTER_ADMIN_CUSTOMER_LINK_RECONCILED', {
      userId: user.id,
      userEmail: user.email,
      targetTenantId: resolvedTenantId,
      targetSlug: tenant.slug,
      clientId: primaryClient.id,
      sourceClientId: sourceClientId || null,
      action,
      reassignedAppointments,
      reason: String(reason).trim(),
    });

    const latestAudit = (memoryStore.auditLogs as any[])
      .slice()
      .reverse()
      .find(
        (l) =>
          l.tenantId === resolvedTenantId &&
          l.action === 'MASTER_ADMIN_CUSTOMER_LINK_RECONCILED'
      );

    const linkedEstablishments = await this.getLinkedEstablishmentsForCustomer(user.id, user.email);

    return {
      user: { id: user.id, name: user.name, email: user.email },
      reconciledClient: primaryClient,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      action,
      reassignedAppointments,
      preservedHistory: true,
      auditLog: latestAudit || {
        id: `audit-${Date.now()}`,
        action: 'MASTER_ADMIN_CUSTOMER_LINK_RECONCILED',
        tenantId: resolvedTenantId,
        actorId,
      },
      reason: String(reason).trim(),
      linkedEstablishments,
    };
  },

  async resolveCustomerAppointmentOwnership(userId: string, userEmail: string, appointmentId: string) {
    saasService.ensureSaaSSeedData();
    const memApp = (memoryStore.appointments as any[]).find((a) => a.id === appointmentId);
    const candidateTenantIds = memApp
      ? [memApp.tenantId]
      : (memoryStore.tenants as any[]).map((t) => t.id);

    const emailLower = String(userEmail || '').toLowerCase();

    for (const tId of candidateTenantIds) {
      const app = await db.getAppointmentById(tId, appointmentId);
      if (!app) continue;
      // Verify if app.clientId belongs to this authenticated user in tenant tId
      const clientRecord = (memoryStore.clients as any[]).find(
        (c) => c.id === app.clientId && c.tenantId === tId
      );
      const isOwnedByCustomer =
        clientRecord &&
        (clientRecord.userId === userId ||
          (emailLower && String(clientRecord.email || '').toLowerCase() === emailLower) ||
          String(clientRecord.notes || '').includes(`userId:${userId}`));

      if (isOwnedByCustomer) {
        return {
          tenantId: tId,
          clientId: clientRecord.id,
          appointment: app,
        };
      }
      // Also check via hasClientLinkInTenant if pool is active (without creating an unauthorized link)
      if (getMySqlPool()) {
        const resolvedClient = await this.hasClientLinkInTenant(tId, userId, userEmail);
        if (resolvedClient && resolvedClient.id === app.clientId) {
          return {
            tenantId: tId,
            clientId: resolvedClient.id,
            appointment: app,
          };
        }
      }
      return null; // Found appointment, but belongs to someone else!
    }
    return null;
  },

  async updateCustomerProfile(tenantId: string, clientId: string, userId: string, data: { name?: string; phone?: string; email?: string; contactPreference?: string }) {
    // Whitelist only allowed fields to prevent privilege escalation / IDOR
    const { name, phone, email, contactPreference } = data;
    const pool = getMySqlPool();

    if (pool) {
      try {
        if (name || phone || email || contactPreference) {
          const prefNote = contactPreference ? `pref:${contactPreference}` : 'pref:WHATSAPP';
          await executeWithRetry(
            `UPDATE Client SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
                               notes = CONCAT('userId:${userId} ', ?), updatedAt = NOW()
             WHERE id = ? AND tenantId = ?`,
            [name || null, phone || null, email || null, prefNote, clientId, tenantId]
          );

          if (userId && (name || email)) {
            await executeWithRetry(
              `UPDATE User SET name = COALESCE(?, name), email = COALESCE(?, email), updatedAt = NOW() WHERE id = ?`,
              [name || null, email || null, userId]
            );
          }
        }
      } catch (e) {
        handleDbFallbackError('updateCustomerProfile', e);
      }
    }

    // Update all linked Client records for this user so their name/phone/contactPreference stays consistent
    const userClients = (memoryStore.clients as any[]).filter(
      (c) => (c.id === clientId && c.tenantId === tenantId) || c.userId === userId
    );
    for (const c of userClients) {
      if (name) c.name = name;
      if (phone) c.phone = phone;
      if (email) c.email = email;
      if (contactPreference) c.contactPreference = contactPreference;
    }

    const user = (memoryStore.users as any[]).find(u => u.id === userId);
    if (user) {
      if (name) user.name = name;
      if (email) user.email = email;
      if (phone) user.phone = phone;
    }

    await db.recordAuditLog(tenantId, userId, 'CUSTOMER_PROFILE_UPDATED', {
      clientId,
      updatedFields: Object.keys(data),
    });

    const primaryClient = (memoryStore.clients as any[]).find(c => c.id === clientId && c.tenantId === tenantId);
    return primaryClient
      ? {
          id: primaryClient.id,
          tenantId: primaryClient.tenantId,
          name: primaryClient.name,
          phone: primaryClient.phone,
          email: primaryClient.email,
          contactPreference: primaryClient.contactPreference,
        }
      : { id: clientId, tenantId, name, phone, email, contactPreference };
  },

  async getCustomerAppointments(tenantId: string, clientId: string) {
    const all = await db.getAppointments(tenantId);
    const business = await db.getBusiness(tenantId);
    const clientRecord =
      (memoryStore.clients as any[]).find((c) => c.id === clientId && c.tenantId === tenantId) ||
      (memoryStore.clients as any[]).find((c) => c.id === clientId);
    const clientEmail = String(clientRecord?.email || '').toLowerCase();
    const clientUserId = clientRecord?.userId || '';

    // Robust customer isolation: matches by clientId, linked userId, or client email
    const clientApps = all.filter((a: any) => {
      if (a.clientId === clientId) return true;
      if (clientUserId && (a.clientId === clientUserId || a.createdBy === clientUserId)) return true;
      if (clientEmail && a.client?.email && String(a.client.email).toLowerCase() === clientEmail) return true;
      return false;
    });
    const tenantPayments = await db.listPayments(tenantId).catch(() => []);
    const paymentByAppointmentId = new Map<string, any>();
    for (const p of tenantPayments as any[]) {
      if (p?.appointmentId && !paymentByAppointmentId.has(p.appointmentId)) {
        paymentByAppointmentId.set(p.appointmentId, p);
      }
    }
    const now = new Date();

    const formattedApps = clientApps.map((a: any) => {
      // Auto-expire PENDING_PAYMENT if expiresAt has passed
      let effectiveStatus = a.status;
      if (effectiveStatus === 'PENDING_PAYMENT' && a.expiresAt && new Date(a.expiresAt) < now) {
        effectiveStatus = 'EXPIRED';
        const memApp = (memoryStore.appointments as any[]).find((ma) => ma.id === a.id && ma.tenantId === tenantId);
        if (memApp) {
          memApp.status = 'EXPIRED';
          memApp.paymentStatus = 'EXPIRED';
        }
      }

      const totalCents = Number(a.totalAmountCents || (a.totalAmount ? Math.round(a.totalAmount * 100) : 0));
      const depositCents =
        a.depositAmountCents !== undefined && a.depositAmountCents !== null
          ? Number(a.depositAmountCents)
          : a.snapshotDepositCents !== undefined && a.snapshotDepositCents !== null
          ? Number(a.snapshotDepositCents)
          : Math.round(totalCents * 0.3);
      const balanceCents =
        a.balanceAmountCents !== undefined && a.balanceAmountCents !== null
          ? Number(a.balanceAmountCents)
          : a.snapshotBalanceCents !== undefined && a.snapshotBalanceCents !== null
          ? Number(a.snapshotBalanceCents)
          : Math.max(0, totalCents - depositCents);

      const isUpcoming = ['PENDING_PAYMENT', 'CONFIRMED', 'PENDING'].includes(effectiveStatus) && new Date(a.dateTime) >= now;
      const canContinuePayment =
        effectiveStatus === 'PENDING_PAYMENT' &&
        depositCents > 0 &&
        new Date(a.dateTime) >= now &&
        (!a.expiresAt || new Date(a.expiresAt) >= now);

      const hoursLimit = Number(a.snapshotCancellationHours ?? business?.cancellationHoursLimit ?? 6);
      const deadlineMs = new Date(a.dateTime).getTime() - hoursLimit * 3600 * 1000;
      const cancellationRequest = memoryStore.cancellationRequests.find(
        (r: any) => r.appointmentId === a.id && r.tenantId === tenantId
      ) || null;
      const refundRequest = cancellationRequest
        ? memoryStore.refundRequests.find(
            (rr: any) => rr.cancellationRequestId === cancellationRequest.id && rr.tenantId === tenantId
          ) || null
        : null;

      const matchedPayment = paymentByAppointmentId.get(a.id);
      const effectivePaymentStatus = matchedPayment?.status || a.paymentStatus || (effectiveStatus === 'CONFIRMED' && depositCents > 0 ? 'APPROVED' : undefined);
      const isDepositPaid = Boolean(
        a.depositPaid ||
          effectivePaymentStatus === 'APPROVED' ||
          matchedPayment?.status === 'APPROVED'
      );

      return {
        ...a,
        status: effectiveStatus,
        paymentStatus: effectivePaymentStatus,
        depositPaid: isDepositPaid,
        tenantId,
        establishment: {
          id: tenantId,
          name: business?.name || 'Estabelecimento',
          slug: business?.slug || tenantId,
          logoUrl: business?.logoUrl || '',
          phone: business?.phone || '',
          address: business?.address || '',
          requireDeposit: Boolean(business?.requireDeposit),
        },
        totalAmountCents: totalCents,
        depositAmountCents: depositCents,
        balanceAmountCents: balanceCents,
        formattedTotal: (totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        formattedDeposit: (depositCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        formattedBalance: (balanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        isUpcoming,
        canContinuePayment,
        canCancel: isUpcoming && now.getTime() <= deadlineMs,
        cancellationDeadlineUtc: new Date(deadlineMs).toISOString(),
        applicableCancellationHours: hoursLimit,
        cancellationRequest,
        refundRequest,
      };
    });

    const upcoming = formattedApps.filter((a: any) => a.isUpcoming).sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    const past = formattedApps.filter((a: any) => !a.isUpcoming).sort((a: any, b: any) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    const pendingDeposits = formattedApps
      .filter((a: any) => a.canContinuePayment)
      .sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    return {
      upcoming,
      past,
      all: formattedApps,
      appointments: formattedApps,
      pendingDeposits,
      totalCount: formattedApps.length,
      nextAppointment: upcoming[0] || null,
    };
  },

  async getCustomerAppointmentsAcrossTenants(
    primaryTenantId: string,
    userId: string,
    userEmail: string,
    userName?: string,
    userPhone?: string,
    filterTenantId?: string
  ) {
    // Ensure primary tenant client link exists
    const primaryClient = await this.getClientForCustomerUser(primaryTenantId, userId, userEmail, userName, userPhone);
    const linkedClients = await this.getLinkedClientsForUser(userId, userEmail, filterTenantId);

    // Ensure primaryClient is in the list if not filtered out
    if (!filterTenantId || filterTenantId === primaryTenantId) {
      if (!linkedClients.some((c) => c.id === primaryClient.id && c.tenantId === primaryTenantId)) {
        linkedClients.push(primaryClient);
      }
    }

    const allFormatted: any[] = [];
    const seenAppIds = new Set<string>();

    for (const c of linkedClients) {
      const res = await this.getCustomerAppointments(c.tenantId, c.id);
      for (const app of res.all) {
        if (!seenAppIds.has(app.id)) {
          seenAppIds.add(app.id);
          allFormatted.push(app);
        }
      }
    }

    const upcoming = allFormatted
      .filter((a: any) => a.isUpcoming)
      .sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
    const past = allFormatted
      .filter((a: any) => !a.isUpcoming)
      .sort((a: any, b: any) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    const pendingDeposits = allFormatted
      .filter((a: any) => a.canContinuePayment)
      .sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    return {
      upcoming,
      past,
      all: allFormatted,
      appointments: allFormatted,
      pendingDeposits,
      totalCount: allFormatted.length,
      nextAppointment: upcoming[0] || null,
    };
  },

  async getCustomerAppointmentById(tenantId: string, clientId: string, appointmentId: string) {
    const appointment = await db.getAppointmentById(tenantId, appointmentId);
    if (!appointment) return null;

    // Strict IDOR validation: reject if appointment does not belong to this customer
    if (appointment.clientId !== clientId) {
      return null;
    }

    const now = new Date();
    let effectiveStatus = appointment.status;
    if (effectiveStatus === 'PENDING_PAYMENT' && appointment.expiresAt && new Date(appointment.expiresAt) < now) {
      effectiveStatus = 'EXPIRED';
      const memApp = (memoryStore.appointments as any[]).find((ma) => ma.id === appointment.id && ma.tenantId === tenantId);
      if (memApp) {
        memApp.status = 'EXPIRED';
        memApp.paymentStatus = 'EXPIRED';
      }
    }

    const totalCents = Number(appointment.totalAmountCents || 0);
    const depositCents =
      appointment.depositAmountCents !== undefined && appointment.depositAmountCents !== null
        ? Number(appointment.depositAmountCents)
        : appointment.snapshotDepositCents !== undefined && appointment.snapshotDepositCents !== null
        ? Number(appointment.snapshotDepositCents)
        : Math.round(totalCents * 0.3);
    const balanceCents =
      appointment.balanceAmountCents !== undefined && appointment.balanceAmountCents !== null
        ? Number(appointment.balanceAmountCents)
        : appointment.snapshotBalanceCents !== undefined && appointment.snapshotBalanceCents !== null
        ? Number(appointment.snapshotBalanceCents)
        : Math.max(0, totalCents - depositCents);

    const canContinuePayment =
      effectiveStatus === 'PENDING_PAYMENT' &&
      depositCents > 0 &&
      new Date(appointment.dateTime) >= now &&
      (!appointment.expiresAt || new Date(appointment.expiresAt) >= now);

    // Get payment details if any
    const payment = await db.getPaymentByAppointmentId(tenantId, appointmentId);
    const business = await db.getBusiness(tenantId);
    const hoursLimit = Number(appointment.snapshotCancellationHours ?? business?.cancellationHoursLimit ?? 6);
    const policyText = appointment.snapshotPolicyText || business?.cancellationPolicyText || '';
    const deadlineMs = new Date(appointment.dateTime).getTime() - hoursLimit * 3600 * 1000;

    const cancellationRequest = memoryStore.cancellationRequests.find(
      (r: any) => r.appointmentId === appointment.id && r.tenantId === tenantId
    ) || null;
    const refundRequest = cancellationRequest
      ? memoryStore.refundRequests.find(
          (rr: any) => rr.cancellationRequestId === cancellationRequest.id && rr.tenantId === tenantId
        ) || null
      : null;

    return {
      ...appointment,
      status: effectiveStatus,
      depositPaid: Boolean(
        (appointment as any).depositPaid ||
          appointment.paymentStatus === 'APPROVED' ||
          payment?.status === 'APPROVED'
      ),
      canContinuePayment,
      tenantId,
      totalAmountCents: totalCents,
      depositAmountCents: depositCents,
      balanceAmountCents: balanceCents,
      formattedTotal: (totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      formattedDeposit: (depositCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      formattedBalance: (balanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      payment,
      cancellationRequest,
      refundRequest,
      establishment: {
        id: tenantId,
        name: business?.name || 'Agenda Beauty Studio',
        slug: business?.slug || tenantId,
        logoUrl: business?.logoUrl || '',
        phone: business?.phone || '(11) 98765-4321',
        address: business?.address || 'Alameda dos Anjos, 1000 - São Paulo, SP',
        requireDeposit: Boolean(business?.requireDeposit),
      },
      policies: {
        minNoticeHours: hoursLimit,
        cancellationDeadlineUtc: new Date(deadlineMs).toISOString(),
        reschedulingPolicy: policyText,
        depositPolicy:
          depositCents > 0
            ? 'O sinal de reserva garante a exclusividade do seu horário e é deduzido do valor total no dia do atendimento.'
            : 'Este agendamento foi confirmado sem exigência de sinal antecipado. O valor integral é pago conforme a política do estabelecimento.',
      },
    };
  },

  async getCustomerPayments(tenantId: string, clientId: string) {
    const customerApps = await this.getCustomerAppointments(tenantId, clientId);
    const appointmentIds = new Set(customerApps.all.map((a: any) => a.id));
    const business = await db.getBusiness(tenantId);

    const allPayments = await db.listPayments(tenantId);
    const clientPayments = allPayments.filter((p: any) => appointmentIds.has(p.appointmentId));

    return clientPayments.map((p: any) => {
      const amountCents = Number(p.amountCents || 0);
      const app = customerApps.all.find((a: any) => a.id === p.appointmentId);
      return {
        id: p.id,
        tenantId,
        appointmentId: p.appointmentId,
        provider: p.provider || 'MERCADO_PAGO',
        providerPaymentId: p.providerPaymentId,
        externalReference: p.externalReference,
        amountCents,
        formattedAmount: (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        status: p.status,
        paymentMethod: p.paymentMethod || 'PIX',
        qrCode: p.qrCode,
        ticketUrl: p.ticketUrl,
        approvedAt: p.approvedAt,
        createdAt: p.createdAt,
        type: 'SINAL_RESERVA', // Explicit type to prevent conflating deposit with total
        establishment: {
          id: tenantId,
          name: business?.name || 'Estabelecimento',
          slug: business?.slug || tenantId,
        },
        appointmentSummary: app ? {
          serviceName: app.service?.name || 'Serviço',
          profName: app.professional?.name || 'Profissional',
          dateTime: app.dateTime,
          status: app.status,
          establishmentName: business?.name || 'Estabelecimento',
        } : null,
      };
    });
  },

  async getCustomerPaymentsAcrossTenants(primaryTenantId: string, userId: string, userEmail: string, filterTenantId?: string) {
    await this.getClientForCustomerUser(primaryTenantId, userId, userEmail);
    const linkedClients = await this.getLinkedClientsForUser(userId, userEmail, filterTenantId);
    const allPayments: any[] = [];
    const seenIds = new Set<string>();
    for (const c of linkedClients) {
      const list = await this.getCustomerPayments(c.tenantId, c.id);
      for (const p of list) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          allPayments.push(p);
        }
      }
    }
    return allPayments.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  },

  async getCustomerNotifications(tenantId: string, clientId: string) {
    const notifs = (memoryStore as any).notifications || [];
    const clientNotifs = notifs.filter(
      (n: any) => (n.clientId === clientId || n.clientId === '*') && (n.tenantId === tenantId || !n.tenantId)
    );
    return clientNotifs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async markCustomerNotificationRead(clientId: string, notificationId: string) {
    const notifs = (memoryStore as any).notifications || [];
    const notif = notifs.find((n: any) => n.id === notificationId && (n.clientId === clientId || n.clientId === '*'));
    if (notif) {
      notif.read = true;
      return true;
    }
    return false;
  },

  async markAllCustomerNotificationsRead(clientId: string) {
    const notifs = (memoryStore as any).notifications || [];
    notifs
      .filter((n: any) => n.clientId === clientId || n.clientId === '*')
      .forEach((n: any) => { n.read = true; });
    return true;
  },

  async registerCustomerWithUser(data: { name: string; email: string; phone: string; passwordHash: string; tenantId?: string; contactPreference?: string }) {
    const tenantId = data.tenantId || 'biz-1';
    const userId = `user-cust-${Date.now()}`;
    const clientId = `cli-${Date.now()}`;
    const now = new Date();

    const pool = getMySqlPool();
    if (pool) {
      let conn: any = null;
      try {
        conn = await getConnectionWithRetry();
        await conn.beginTransaction();

        await conn.execute(
          `INSERT INTO User (id, name, email, passwordHash, active, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [userId, data.name, data.email, data.passwordHash, now, now]
        );

        const customerRole = validateEnumValueStrict('TenantMember.role', 'CUSTOMER', VALID_TENANT_MEMBER_ROLES);
        await conn.execute(
          `INSERT INTO TenantMember (id, tenantId, userId, role, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [`mem-${Date.now()}`, tenantId, userId, customerRole, now, now]
        );

        await conn.execute(
          `INSERT INTO Client (id, tenantId, name, phone, email, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [clientId, tenantId, data.name, data.phone, data.email, `userId:${userId} pref:${data.contactPreference || 'WHATSAPP'}`, now, now]
        );

        await conn.commit();
      } catch (e) {
        if (conn) await conn.rollback();
        handleDbFallbackError('registerCustomerWithUser', e);
      } finally {
        if (conn) conn.release();
      }
    }

    const newUser = {
      id: userId,
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      tenantId,
      role: 'CUSTOMER',
      resetToken: null,
      resetExpires: null,
      active: true,
    };
    const newClient = {
      id: clientId,
      tenantId,
      userId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      contactPreference: data.contactPreference || 'WHATSAPP',
      notes: `userId:${userId}`,
      createdAt: now.toISOString(),
    };

    (memoryStore.users as any[]).push(newUser);
    (memoryStore.clients as any[]).push(newClient);

    // Welcome notification
    if (!(memoryStore as any).notifications) {
      (memoryStore as any).notifications = [];
    }
    (memoryStore as any).notifications.push({
      id: `notif-${Date.now()}`,
      clientId,
      tenantId,
      title: 'Boas-vindas ao Agenda Beauty',
      message: `Olá, ${data.name}! Seu cadastro foi concluído com sucesso. Agora você pode acompanhar seus agendamentos e pagamentos com praticidade.`,
      type: 'WELCOME',
      read: false,
      createdAt: now.toISOString(),
    });

    return { user: newUser, client: newClient };
  },
};
