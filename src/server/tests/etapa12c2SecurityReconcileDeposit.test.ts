import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import {
  sanitizeDatabaseUrl,
  parseAndValidateDatabaseUrl,
  isProductionDatabaseUrl,
  assertNotProductionDatabaseInTests,
  ProductionDatabaseWriteBlockedError,
  PersistenceUnavailableError,
  getMySqlPool,
  handleDbFallbackError,
  buildSessionStrictSqlModeQuery,
  validateEnumValueStrict,
  VALID_TENANT_MEMBER_ROLES,
  VALID_APPOINTMENT_STATUSES,
  resetMySqlPoolForTests,
} from '../db/mysql.js';
import {
  EXPECTED_EMPTY_ROLE_MEMBER_IDS,
  TenantMemberAuditRow,
  validateAuditRowsAgainstExpected,
} from '../../../scripts/reconcile-tenant-members-role.js';
import { db, memoryStore } from '../storage.js';
import { customerStorage } from '../customerStorage.js';
import { cancellationService } from '../cancellationService.js';
import { PaymentService } from '../payments/PaymentService.js';
import {
  PaymentProvider,
  CreatePixPaymentInput,
  CreatePixPaymentOutput,
  PaymentDetails,
  RefundDetails,
  ValidateWebhookParams,
} from '../payments/types.js';

class ControlledMockPaymentProvider implements PaymentProvider {
  name = 'MERCADO_PAGO';
  public mockPayments = new Map<string, { amountCents: number; status: 'PENDING' | 'APPROVED'; externalReference: string }>();

  async createPixPayment(input: CreatePixPaymentInput): Promise<CreatePixPaymentOutput> {
    const providerPaymentId = `mp-etapa12c2-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.mockPayments.set(providerPaymentId, {
      amountCents: input.amountCents,
      status: 'PENDING',
      externalReference: input.externalReference || '',
    });
    return {
      providerPaymentId,
      status: 'PENDING',
      qrCode: `000201PIX${providerPaymentId}`,
      qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      ticketUrl: `https://mercadopago.test/${providerPaymentId}`,
      expiresAt: input.expiresAt,
      rawResponse: { id: providerPaymentId },
    };
  }

  async getPayment(providerPaymentId: string): Promise<PaymentDetails> {
    const rec = this.mockPayments.get(providerPaymentId);
    if (!rec) throw new Error('Payment not found');
    return {
      providerPaymentId,
      status: rec.status,
      amountCents: rec.amountCents,
      currency: 'BRL',
      externalReference: rec.externalReference,
      approvedAt: rec.status === 'APPROVED' ? new Date() : undefined,
      rawResponse: rec,
    };
  }

  async cancelPayment(providerPaymentId: string): Promise<PaymentDetails> {
    const rec = this.mockPayments.get(providerPaymentId);
    return {
      providerPaymentId,
      status: 'CANCELLED',
      amountCents: rec?.amountCents || 0,
      currency: 'BRL',
      externalReference: rec?.externalReference || '',
      rawResponse: {},
    };
  }

  async refundPayment(_providerPaymentId: string, amountCents?: number): Promise<RefundDetails> {
    return {
      refundId: `ref-${Date.now()}`,
      amountCents: amountCents || 0,
      status: 'approved',
      rawResponse: {},
    };
  }

  validateWebhookSignature(_params: ValidateWebhookParams): boolean {
    return true;
  }

  normalizePaymentStatus(rawStatus: string) {
    if (rawStatus === 'approved' || rawStatus === 'APPROVED') return 'APPROVED' as any;
    if (rawStatus === 'cancelled' || rawStatus === 'CANCELLED') return 'CANCELLED' as any;
    if (rawStatus === 'rejected' || rawStatus === 'REJECTED') return 'REJECTED' as any;
    return 'PENDING' as any;
  }
}

async function runTests() {
  console.log('=== Iniciando Suíte Etapa 12C.2: Segurança, Reconciliação e Política de Sinal ===');

  // Ensure test isolation is active
  process.env.NODE_ENV = 'test';
  process.env.AGENDA_TEST_MODE = '1';
  process.env.ALLOW_DB_INTEGRATION_TESTS = 'false';
  process.env.DB_STRICT_MODE = 'false';
  process.env.DATABASE_URL = '';
  resetMySqlPoolForTests();

  // =========================================================================
  // 1. SANITIZAÇÃO E VALIDAÇÃO DE DATABASE_URL
  // =========================================================================
  console.log('1. Testando sanitização e validação centralizada de DATABASE_URL...');
  {
    const rawQuoted = '  "mysql://user_test:SecretPass!123@127.0.0.1:3306/agenda_test"  ';
    const sanitized = sanitizeDatabaseUrl(rawQuoted);
    assert.equal(sanitized, 'mysql://user_test:SecretPass!123@127.0.0.1:3306/agenda_test');

    const validCheck = parseAndValidateDatabaseUrl(rawQuoted);
    assert.equal(validCheck.valid, true);
    assert.equal(validCheck.database, 'agenda_test');
    assert.equal(validCheck.host, '127.0.0.1');

    const singleQuoted = "'mysql://user_test:SecretPass!123@localhost:3306/agenda_test'";
    assert.equal(parseAndValidateDatabaseUrl(singleQuoted).valid, true);

    const mismatchedQuotes = '"mysql://user_test:SecretPass!123@localhost:3306/agenda_test\'';
    const resMismatched = parseAndValidateDatabaseUrl(mismatchedQuotes);
    assert.equal(resMismatched.valid, false);
    assert.equal(resMismatched.reason, 'INVALID_PROTOCOL_EXPECTED_MYSQL');
    assert.ok(!resMismatched.reason?.includes('SecretPass!123'), 'Não deve vazar senha no motivo de erro');

    const wrongProtocol = 'postgresql://user_test:SecretPass!123@localhost:5432/agenda_test';
    const resProto = parseAndValidateDatabaseUrl(wrongProtocol);
    assert.equal(resProto.valid, false);
    assert.equal(resProto.reason, 'INVALID_PROTOCOL_EXPECTED_MYSQL');
    assert.ok(!resProto.reason?.includes('SecretPass!123'), 'Não deve vazar senha no motivo de erro');

    const placeholderUrl = 'mysql://[USUARIO]:[SENHA]@[HOST]:3306/agenda_test';
    const resPlaceholder = parseAndValidateDatabaseUrl(placeholderUrl);
    assert.equal(resPlaceholder.valid, false);
    assert.equal(resPlaceholder.reason, 'PLACEHOLDER_DATABASE_URL');
  }

  // =========================================================================
  // 2. ISOLAMENTO DE TESTES E BLOQUEIO DE PRODUÇÃO (HOSTINGER)
  // =========================================================================
  console.log('2. Testando bloqueio de escrita no banco de produção durante testes...');
  {
    const prodUrlHostinger = 'mysql://u117523286_user:some_secret@srv1661.hstgr.io:3306/u117523286_agendOnline';
    const prodUrlByDbName = 'mysql://any_user:secret@127.0.0.1:3306/u117523286_agendOnline';
    const dedicatedTestUrl = 'mysql://test_runner:test_secret@127.0.0.1:3306/agenda_beauty_test_ci';

    assert.equal(isProductionDatabaseUrl(prodUrlHostinger), true);
    assert.equal(isProductionDatabaseUrl(prodUrlByDbName), true);
    assert.equal(isProductionDatabaseUrl(dedicatedTestUrl), false);

    // Even if ALLOW_DB_INTEGRATION_TESTS=true, production URLs MUST throw ProductionDatabaseWriteBlockedError
    process.env.ALLOW_DB_INTEGRATION_TESTS = 'true';
    assert.throws(
      () => assertNotProductionDatabaseInTests(prodUrlHostinger),
      (err: any) =>
        err instanceof ProductionDatabaseWriteBlockedError &&
        err.code === 'PRODUCTION_DB_WRITE_BLOCKED_IN_TESTS'
    );
    assert.throws(
      () => assertNotProductionDatabaseInTests(prodUrlByDbName),
      (err: any) =>
        err instanceof ProductionDatabaseWriteBlockedError &&
        err.code === 'PRODUCTION_DB_WRITE_BLOCKED_IN_TESTS'
    );

    // Dedicated test DB URL is permitted when ALLOW_DB_INTEGRATION_TESTS=true
    assert.doesNotThrow(() => assertNotProductionDatabaseInTests(dedicatedTestUrl));

    // When ALLOW_DB_INTEGRATION_TESTS=false (default in npm test), getMySqlPool() must return null
    process.env.ALLOW_DB_INTEGRATION_TESTS = 'false';
    process.env.DATABASE_URL = prodUrlHostinger;
    resetMySqlPoolForTests();
    assert.equal(
      getMySqlPool(),
      null,
      'getMySqlPool() deve retornar null em modo de teste padrão mesmo se DATABASE_URL estiver definida'
    );
    process.env.DATABASE_URL = '';
  }

  // =========================================================================
  // 3. MODO ESTRITO DE PERSISTÊNCIA (DB_STRICT_MODE=true) E /api/health
  // =========================================================================
  console.log('3. Testando DB_STRICT_MODE=true e diagnóstico honesto em /api/health...');
  {
    const app = createApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // Case A: Fallback mode allowed (DB_STRICT_MODE=false)
      process.env.DB_STRICT_MODE = 'false';
      process.env.DATABASE_URL = '';
      resetMySqlPoolForTests();

      const resFallback = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(resFallback.status, 200);
      const bodyFallback: any = await resFallback.json();
      assert.equal(bodyFallback.status, 'ok');
      assert.equal(bodyFallback.persistence.mode, 'MEMORY_FALLBACK_ALLOWED');
      assert.equal(bodyFallback.persistence.strictMode, false);

      // Case B: Strict mode enabled (DB_STRICT_MODE=true) with missing DATABASE_URL
      process.env.AGENDA_TEST_MODE = '0';
      process.env.NODE_ENV = 'production';
      process.env.DB_STRICT_MODE = 'true';
      process.env.DATABASE_URL = '';
      resetMySqlPoolForTests();

      assert.throws(
        () => getMySqlPool(),
        (err: any) =>
          err instanceof PersistenceUnavailableError &&
          err.statusCode === 503 &&
          err.code === 'PERSISTENCE_UNAVAILABLE'
      );

      assert.throws(
        () => handleDbFallbackError('createAppointment', new Error('Connection lost')),
        (err: any) =>
          err instanceof PersistenceUnavailableError &&
          err.statusCode === 503
      );

      const resStrictFail = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(resStrictFail.status, 503);
      const bodyStrictFail: any = await resStrictFail.json();
      assert.equal(bodyStrictFail.status, 'error');
      assert.equal(bodyStrictFail.persistence.mode, 'PERSISTENCE_FAILURE');
      assert.equal(bodyStrictFail.persistence.strictMode, true);
      assert.equal(bodyStrictFail.persistence.connected, false);
    } finally {
      // Restore test environment flags
      process.env.NODE_ENV = 'test';
      process.env.AGENDA_TEST_MODE = '1';
      process.env.ALLOW_DB_INTEGRATION_TESTS = 'false';
      process.env.DB_STRICT_MODE = 'false';
      process.env.DATABASE_URL = '';
      resetMySqlPoolForTests();
      server.close();
    }
  }

  // =========================================================================
  // 4. SQL_MODE ESTRITO DE SESSÃO E VALIDAÇÃO DE ENUMS (SEM COERÇÃO PARA '')
  // =========================================================================
  console.log('4. Testando SQL_MODE estrito de sessão e validação estrita de ENUMs...');
  {
    const sqlModeQuery = buildSessionStrictSqlModeQuery();
    assert.ok(sqlModeQuery.includes('SET SESSION sql_mode'));
    assert.ok(sqlModeQuery.includes('STRICT_TRANS_TABLES'));
    assert.ok(sqlModeQuery.includes('STRICT_ALL_TABLES'));
    assert.ok(sqlModeQuery.includes('NO_ENGINE_SUBSTITUTION'));

    // Valid ENUM values pass
    assert.equal(
      validateEnumValueStrict('TenantMember.role', 'CUSTOMER', VALID_TENANT_MEMBER_ROLES),
      'CUSTOMER'
    );
    assert.equal(
      validateEnumValueStrict('Appointment.status', 'CONFIRMED', VALID_APPOINTMENT_STATUSES),
      'CONFIRMED'
    );

    // Empty string '' or invalid ENUM value MUST throw explicit 400 error (never coerce to '')
    assert.throws(
      () => validateEnumValueStrict('TenantMember.role', '', VALID_TENANT_MEMBER_ROLES),
      (err: any) => err.statusCode === 400 && err.code === 'STRICT_ENUM_VALIDATION_FAILED'
    );
    assert.throws(
      () => validateEnumValueStrict('TenantMember.role', 'SUPER_HACKER', VALID_TENANT_MEMBER_ROLES),
      (err: any) => err.statusCode === 400 && err.code === 'STRICT_ENUM_VALIDATION_FAILED'
    );
    assert.throws(
      () => validateEnumValueStrict('Appointment.status', '', VALID_APPOINTMENT_STATUSES),
      (err: any) => err.statusCode === 400 && err.code === 'STRICT_ENUM_VALIDATION_FAILED'
    );
  }

  // =========================================================================
  // 5. SCRIPT DE SANEAMENTO DOS 8 TENANTMEMBERS COM ROLE='' (PRÉ-VALIDAÇÃO)
  // =========================================================================
  console.log('5. Testando pré-validação estrita do script de saneamento dos 8 TenantMembers...');
  {
    const validMockAuditRows: TenantMemberAuditRow[] = EXPECTED_EMPTY_ROLE_MEMBER_IDS.map((id, idx) => ({
      id,
      tenantId: 'biz-1',
      userId: `user-cust-179311${idx}`,
      role: '',
      userEmail: `cliente${idx}@teste.com`,
      tenantExists: 1,
      clientCount: 1,
      professionalCount: 0,
    }));

    const checkValid = validateAuditRowsAgainstExpected(validMockAuditRows);
    assert.equal(checkValid.valid, true);
    assert.equal(checkValid.errors.length, 0);

    // Divergence 1: Row count != 8
    const checkWrongCount = validateAuditRowsAgainstExpected(validMockAuditRows.slice(0, 7));
    assert.equal(checkWrongCount.valid, false);
    assert.ok(checkWrongCount.errors.some((e) => e.includes('Divergência de contagem')));

    // Divergence 2: Unexpected member ID
    const rowsWithUnexpectedId: TenantMemberAuditRow[] = [
      ...validMockAuditRows.slice(0, 7),
      { ...validMockAuditRows[7], id: 'mem-unexpected-999' },
    ];
    const checkUnexpectedId = validateAuditRowsAgainstExpected(rowsWithUnexpectedId);
    assert.equal(checkUnexpectedId.valid, false);
    assert.ok(checkUnexpectedId.errors.some((e) => e.includes('mem-unexpected-999')));

    // Divergence 3: Member linked to a Professional (cannot be auto-remediated to CUSTOMER)
    const rowsWithProf: TenantMemberAuditRow[] = validMockAuditRows.map((r, i) =>
      i === 0 ? { ...r, professionalCount: 1 } : r
    );
    const checkProfLink = validateAuditRowsAgainstExpected(rowsWithProf);
    assert.equal(checkProfLink.valid, false);
    assert.ok(checkProfLink.errors.some((e) => e.includes('Professional')));
  }

  // =========================================================================
  // 6, 7, 8 & 9. POLÍTICA DE SINAL (COM E SEM SINAL), RBAC E HISTÓRICO
  // =========================================================================
  console.log('6. Testando configuração da Política de Sinal, RBAC e isolamento multi-tenant...');
  {
    const app = createApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const makeToken = (payload: any) => Buffer.from(JSON.stringify(payload)).toString('base64');

    const ownerToken = makeToken({
      userId: 'user-1',
      userName: 'Camila Souza',
      email: 'camila@agendabeauty.com.br',
      tenantId: 'biz-1',
      role: 'OWNER',
    });

    const receptionistToken = makeToken({
      userId: 'user-recep-1',
      userName: 'Recepcionista',
      email: 'recep@agendabeauty.com.br',
      tenantId: 'biz-1',
      role: 'RECEPTIONIST',
    });

    // Register a test customer
    const custEmail = `cliente.etapa12c2.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/api/v1/customer/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Helena Cliente Teste',
        email: custEmail,
        phone: '11988887777',
        password: 'password123',
        tenantId: 'biz-1',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData: any = await regRes.json();
    const customerToken = regData.token;
    const customerClientId = regData.data.customer.id;

    try {
      // 6.1 Verify default policy is requireDeposit = true, defaultDeposit = 30
      const bizInitial = await db.getBusiness('biz-1');
      assert.equal(bizInitial.requireDeposit, true);
      assert.equal(bizInitial.defaultDeposit, 30);

      // 6.2 RBAC: Customer and Receptionist CANNOT alter deposit policy
      const rbacCustRes = await fetch(`${baseUrl}/api/v1/business`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({ requireDeposit: false }),
      });
      assert.equal(rbacCustRes.status, 403);

      const rbacRecepRes = await fetch(`${baseUrl}/api/v1/business`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${receptionistToken}`,
        },
        body: JSON.stringify({ requireDeposit: false }),
      });
      assert.equal(rbacRecepRes.status, 403);

      // 6.3 Multi-tenant isolation: create second tenant biz-2 and verify biz-1 changes don't leak
      memoryStore.tenants.push({
        id: 'biz-2',
        name: 'Studio Rio',
        slug: 'studio-rio',
        phone: '21999998888',
        email: 'rio@agendabeauty.com.br',
        address: 'Av. Atlântica, 500',
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
        openTime: '08:00',
        closeTime: '20:00',
        requireDeposit: true,
        defaultDeposit: 40,
        cancellationHoursLimit: 12,
      });

      // =========================================================================
      // 7. FLUXO COM SINAL OBRIGATÓRIO (requireDeposit = true, 30%)
      // =========================================================================
      console.log('7. Testando fluxo COM sinal obrigatório (PENDING_PAYMENT -> Pix -> CONFIRMED)...');

      // Security check: Customer trying to manipulate priceCents, depositAmountCents, or status is blocked
      const tamperRes = await fetch(`${baseUrl}/api/v1/customer/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          serviceId: 'serv-1',
          professionalId: 'prof-1',
          dateTime: '2027-06-15T14:00:00.000Z',
          depositAmountCents: 0,
          status: 'CONFIRMED',
        }),
      });
      assert.equal(tamperRes.status, 400);

      // Valid customer booking with mandatory deposit
      const bookWithDepositRes = await fetch(`${baseUrl}/api/v1/customer/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          serviceId: 'serv-1', // priceCents = 18000, depositPercent = 30
          professionalId: 'prof-1',
          dateTime: '2027-06-15T14:00:00.000Z',
          notes: 'Reserva com sinal obrigatório',
        }),
      });
      assert.equal(bookWithDepositRes.status, 201);
      const bookWithDepositBody: any = await bookWithDepositRes.json();
      const appWithDeposit = bookWithDepositBody.data;

      assert.equal(appWithDeposit.status, 'PENDING_PAYMENT');
      assert.ok(appWithDeposit.expiresAt, 'Deve possuir expiresAt para reserva temporária com sinal');
      assert.equal(appWithDeposit.totalAmountCents, 18000);
      assert.equal(appWithDeposit.depositAmountCents, 5400);
      assert.equal(appWithDeposit.balanceAmountCents, 12600);
      assert.equal(appWithDeposit.snapshotPriceCents, 18000);
      assert.equal(appWithDeposit.snapshotDepositPercent, 30);
      assert.equal(appWithDeposit.snapshotDepositCents, 5400);
      assert.equal(appWithDeposit.snapshotBalanceCents, 12600);

      // Confirm payment via ControlledMockPaymentProvider & PaymentService
      const mockMp = new ControlledMockPaymentProvider();
      const paymentService = new PaymentService(mockMp);
      const pixPayment = await paymentService.createPixPaymentForAppointment('biz-1', appWithDeposit.id);
      assert.equal(pixPayment.amountCents, 5400);
      assert.equal(pixPayment.status, 'PENDING');

      // Simulate provider approval and reconcile on backend via getPaymentStatus polling
      const storedPayment = await db.getPaymentById('biz-1', pixPayment.paymentId);
      const mockEntry = mockMp.mockPayments.get(storedPayment.providerPaymentId)!;
      mockEntry.status = 'APPROVED';

      const reconciledStatus = await paymentService.getPaymentStatus('biz-1', appWithDeposit.id, {
        customProvider: mockMp,
      });
      assert.equal(reconciledStatus.paymentStatus, 'APPROVED');
      assert.equal(reconciledStatus.appointmentStatus, 'CONFIRMED');

      const confirmedAppWithDeposit = await db.getAppointmentById('biz-1', appWithDeposit.id);
      assert.equal(confirmedAppWithDeposit.status, 'CONFIRMED');

      // =========================================================================
      // 8. FLUXO SEM SINAL (requireDeposit = false -> CONFIRMED IMEDIATO)
      // =========================================================================
      console.log('8. Testando fluxo SEM sinal (requireDeposit = false -> CONFIRMED imediato sem Pix)...');

      // Owner disables deposit requirement for biz-1
      const disableDepositRes = await fetch(`${baseUrl}/api/v1/business`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          requireDeposit: false,
        }),
      });
      assert.equal(disableDepositRes.status, 200);
      const disableDepositBody: any = await disableDepositRes.json();
      assert.equal(disableDepositBody.data.requireDeposit, false);

      // Verify biz-2 was NOT affected
      const biz2After = await db.getBusiness('biz-2');
      assert.equal(biz2After.requireDeposit, true);
      assert.equal(biz2After.defaultDeposit, 40);

      // Verify catalog returns requireDeposit = false
      const catalogRes = await fetch(`${baseUrl}/api/v1/customer/catalog?tenantId=biz-1`);
      const catalogBody: any = await catalogRes.json();
      assert.equal(catalogBody.data.business.requireDeposit, false);

      // Customer books an appointment when requireDeposit = false
      const bookNoDepositRes = await fetch(`${baseUrl}/api/v1/customer/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          serviceId: 'serv-1', // priceCents = 18000
          professionalId: 'prof-1',
          dateTime: '2027-06-16T15:00:00.000Z',
          notes: 'Reserva sem sinal antecipado',
        }),
      });
      assert.equal(bookNoDepositRes.status, 201);
      const bookNoDepositBody: any = await bookNoDepositRes.json();
      const appNoDeposit = bookNoDepositBody.data;

      assert.equal(appNoDeposit.status, 'CONFIRMED', 'Agendamento sem sinal deve nascer CONFIRMED');
      assert.equal(appNoDeposit.expiresAt, undefined, 'Agendamento sem sinal não deve expirar por falta de Pix');
      assert.equal(appNoDeposit.totalAmountCents, 18000);
      assert.equal(appNoDeposit.depositAmountCents, 0);
      assert.equal(appNoDeposit.balanceAmountCents, 18000);
      assert.equal(appNoDeposit.snapshotPriceCents, 18000);
      assert.equal(appNoDeposit.snapshotDepositPercent, 0);
      assert.equal(appNoDeposit.snapshotDepositCents, 0);
      assert.equal(appNoDeposit.snapshotBalanceCents, 18000);

      // Verify NO fake Payment record was created
      const paymentForNoDeposit = await db.getPaymentByAppointmentId('biz-1', appNoDeposit.id);
      assert.equal(paymentForNoDeposit, null, 'Não deve criar registro Payment fictício para agendamento sem sinal');

      // Verify PaymentService blocks Pix generation for no-deposit confirmed appointment
      await assert.rejects(
        () => paymentService.createPixPaymentForAppointment('biz-1', appNoDeposit.id),
        (err: any) =>
          err.message.includes('confirmado sem exigência de sinal antecipado')
      );

      // Verify Customer Portal detail view preserves depositAmountCents = 0 and balanceAmountCents = 18000
      const portalDetail = await customerStorage.getCustomerAppointmentById(
        'biz-1',
        customerClientId,
        appNoDeposit.id
      );
      assert.ok(portalDetail);
      assert.equal(portalDetail.depositAmountCents, 0);
      assert.equal(portalDetail.balanceAmountCents, 18000);

      // =========================================================================
      // 9. COMPATIBILIDADE HISTÓRICA E CANCELAMENTO DE AGENDAMENTO SEM SINAL
      // =========================================================================
      console.log('9. Testando compatibilidade histórica de snapshots e cancelamento sem sinal...');

      // Re-enable deposit on biz-1 with 50% defaultDeposit
      await db.updateBusiness('biz-1', { requireDeposit: true, defaultDeposit: 50 });

      // Verify customer catalog and public booking page immediately reflect 50% deposit on services
      const catalog50Res = await fetch(`${baseUrl}/api/v1/customer/catalog?tenantId=biz-1`);
      const catalog50Body: any = await catalog50Res.json();
      assert.equal(catalog50Body.data.business.requireDeposit, true);
      assert.equal(catalog50Body.data.business.defaultDeposit, 50);
      assert.equal(catalog50Body.data.services[0].depositPercent, 50);

      const public50Res = await fetch(`${baseUrl}/api/v1/public/tenants/agenda-beauty-sp`);
      const public50Body: any = await public50Res.json();
      assert.equal(public50Body.data.establishment.requireDeposit, true);
      assert.equal(public50Body.data.establishment.defaultDeposit, 50);
      assert.equal(public50Body.data.services[0].depositPercent, 50);

      // Verify new customer booking uses the updated 50% deposit (9000 cents on 18000 cents service)
      const book50Res = await fetch(`${baseUrl}/api/v1/customer/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          serviceId: 'serv-1',
          professionalId: 'prof-1',
          dateTime: '2027-06-17T15:00:00.000Z',
          notes: 'Reserva com sinal atualizado para 50%',
        }),
      });
      assert.equal(book50Res.status, 201);
      const app50 = ((await book50Res.json()) as any).data;
      assert.equal(app50.status, 'PENDING_PAYMENT');
      assert.equal(app50.snapshotDepositPercent, 50);
      assert.equal(app50.depositAmountCents, 9000);
      assert.equal(app50.balanceAmountCents, 9000);

      // Verify previous appointment WITH 30% deposit kept its historical snapshot intact
      const historicalWithDeposit = await db.getAppointmentById('biz-1', appWithDeposit.id);
      assert.equal(historicalWithDeposit.snapshotDepositPercent, 30);
      assert.equal(historicalWithDeposit.snapshotDepositCents, 5400);
      assert.equal(historicalWithDeposit.snapshotBalanceCents, 12600);

      // Verify previous appointment WITHOUT deposit kept its 0% deposit snapshot intact
      const historicalNoDeposit = await db.getAppointmentById('biz-1', appNoDeposit.id);
      assert.equal(historicalNoDeposit.snapshotDepositPercent, 0);
      assert.equal(historicalNoDeposit.snapshotDepositCents, 0);
      assert.equal(historicalNoDeposit.snapshotBalanceCents, 18000);
      assert.equal(historicalNoDeposit.depositAmountCents, 0);

      // Cancel the no-deposit appointment and verify slot is freed and NO RefundRequest is created
      const cancelResult = await cancellationService.createCancellationRequest({
        tenantId: 'biz-1',
        appointmentId: appNoDeposit.id,
        clientId: customerClientId,
        reason: 'Imprevisto pessoal em agendamento sem sinal',
        confirmedByCustomer: true,
      });

      const cancelledAppAfter = await db.getAppointmentById('biz-1', appNoDeposit.id);
      assert.equal(cancelledAppAfter.status, 'CANCELLED');
      assert.equal(cancelResult.paidDepositCents, 0);
      assert.equal(cancelResult.refundableAmountCents, 0);
      assert.equal(
        cancelResult.refundRequest,
        null,
        'Cancelamento de agendamento sem sinal pago não deve iniciar RefundRequest'
      );

      // 9.5 Test subsequent payment in the financial module for a no-deposit appointment
      await db.updateBusiness('biz-1', { requireDeposit: false });
      const bookNoDepForPayRes = await fetch(`${baseUrl}/api/v1/customer/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          serviceId: 'serv-1', // 18000 cents
          professionalId: 'prof-1',
          dateTime: '2027-06-18T15:00:00.000Z',
          notes: 'Reserva sem sinal para pagamento integral presencial',
        }),
      });
      assert.equal(bookNoDepForPayRes.status, 201);
      const appNoDepForPay = ((await bookNoDepForPayRes.json()) as any).data;
      assert.equal(appNoDepForPay.status, 'CONFIRMED');
      assert.equal(appNoDepForPay.depositAmountCents, 0);
      assert.equal(appNoDepForPay.balanceAmountCents, 18000);

      const recordFullPayRes = await fetch(`${baseUrl}/api/v1/financial/receipts/record-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          appointmentId: appNoDepForPay.id,
          amountCents: 18000,
          paymentType: 'FULL',
          paymentMethod: 'CREDIT_CARD',
          notes: 'Pagamento integral presencial após atendimento sem sinal',
        }),
      });
      assert.equal(recordFullPayRes.status, 201);
      const recordFullPayBody: any = await recordFullPayRes.json();
      assert.equal(recordFullPayBody.remainingBalanceCents, 0);
      assert.equal(recordFullPayBody.data.provider, 'PRESENCIAL', 'Deve refletir recebimento presencial real, não aprovação falsa do Mercado Pago');
      assert.equal(recordFullPayBody.data.paymentType, 'FULL');
      assert.equal(recordFullPayBody.data.status, 'APPROVED');
      assert.equal(recordFullPayBody.data.amountCents, 18000);

      // Restore biz-1 defaultDeposit to 30% and requireDeposit = true
      await db.updateBusiness('biz-1', { requireDeposit: true, defaultDeposit: 30 });
    } finally {
      server.close();
    }
  }

  console.log('=== Todos os testes da Etapa 12C.2 passaram com sucesso (100% isolados)! ===');
}

runTests().catch((err) => {
  console.error('Falha nos testes da Etapa 12C.2:', err);
  process.exit(1);
});
