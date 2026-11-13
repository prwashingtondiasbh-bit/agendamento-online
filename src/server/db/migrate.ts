import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {
  parseAndValidateDatabaseUrl,
  isTestEnvironment,
  assertNotProductionDatabaseInTests,
  isProductionDatabaseUrl,
  buildSessionStrictSqlModeQuery,
} from './mysql.js';

async function runMigration() {
  if (isTestEnvironment()) {
    assertNotProductionDatabaseInTests();
    throw new Error('BLOQUEIO DE SEGURANÇA: migrate.ts não pode ser executado durante suítes de testes.');
  }

  const parsed = parseAndValidateDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed.valid) {
    console.error(`[Migration] DATABASE_URL inválida ou ausente (${parsed.reason}).`);
    process.exit(1);
  }

  if (isProductionDatabaseUrl(parsed.sanitizedUrl) && process.env.CONFIRM_PRODUCTION_MIGRATION !== 'true') {
    console.error(
      '[Migration Blocked] Banco de produção detectado. Para executar alterações estruturais após aprovação formal, defina CONFIRM_PRODUCTION_MIGRATION=true.'
    );
    process.exit(1);
  }

  console.log('[Migration] Connecting to MySQL database...');
  const connection = await mysql.createConnection(parsed.sanitizedUrl);
  await connection.query(buildSessionStrictSqlModeQuery());

  console.log('[Migration] Connected with strict session sql_mode! Creating/updating multi-tenant tables...');

  // 1. Tenants table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS Tenant (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      timezone VARCHAR(100) DEFAULT 'America/Sao_Paulo',
      currency VARCHAR(10) DEFAULT 'BRL',
      openTime VARCHAR(10) DEFAULT '09:00',
      closeTime VARCHAR(10) DEFAULT '19:00',
      defaultDeposit INT DEFAULT 30,
      mpAccessToken VARCHAR(500),
      mpWebhookSecret VARCHAR(500),
      mpEnvironment VARCHAR(20) DEFAULT 'sandbox',
      status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      blockedReason TEXT NULL,
      blockedAt DATETIME NULL,
      blockedBy VARCHAR(100) NULL,
      cancelledAt DATETIME NULL,
      cancelledReason TEXT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // 2. Users table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS User (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      resetToken VARCHAR(255),
      resetExpires DATETIME,
      active BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // 3. TenantMember table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS TenantMember (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      userId VARCHAR(36) NOT NULL,
      role ENUM('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'PROFESSIONAL') DEFAULT 'PROFESSIONAL',
      permissions JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
      UNIQUE KEY unique_tenant_user (tenantId, userId)
    );
  `);

  // 4. Subscription table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS Subscription (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      plan VARCHAR(32) NOT NULL DEFAULT 'COMPLETE',
      status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      contractedPriceCents INT NOT NULL DEFAULT 9990,
      priceOverrideReason TEXT NULL,
      billingCycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
      startedAt DATETIME NULL,
      expiresAt DATETIME NULL,
      nextBillingAt DATETIME NULL,
      cancelledAt DATETIME NULL,
      statusReason TEXT NULL,
      updatedBy VARCHAR(100) NULL,
      history LONGTEXT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE
    );
  `);

  // 5. AuditLog table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS AuditLog (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36),
      userId VARCHAR(36),
      action VARCHAR(255) NOT NULL,
      details JSON,
      ipAddress VARCHAR(100),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE SET NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL
    );
  `);

  // 6. Professional table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS Professional (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      avatarUrl TEXT,
      specialty VARCHAR(255) DEFAULT 'Nail Designer Geral',
      active BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      INDEX idx_professional_tenant (tenantId)
    );
  `);

  // 7. Client table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS Client (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      email VARCHAR(255),
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      INDEX idx_client_tenant (tenantId)
    );
  `);

  // 8. Service table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS Service (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100) DEFAULT 'Unhas',
      priceCents INT DEFAULT 0,
      durationMin INT DEFAULT 60,
      bufferBeforeMin INT DEFAULT 0,
      bufferAfterMin INT DEFAULT 0,
      preparationMin INT DEFAULT 0,
      depositPercent INT DEFAULT 30,
      active BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      INDEX idx_service_tenant (tenantId)
    );
  `);

  // 9. ServiceProfessional table (many-to-many relation)
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ServiceProfessional (
      id VARCHAR(36) PRIMARY KEY,
      serviceId VARCHAR(36) NOT NULL,
      professionalId VARCHAR(36) NOT NULL,
      FOREIGN KEY (serviceId) REFERENCES Service(id) ON DELETE CASCADE,
      FOREIGN KEY (professionalId) REFERENCES Professional(id) ON DELETE CASCADE,
      UNIQUE KEY unique_service_professional (serviceId, professionalId)
    );
  `);

  // 10. WorkingHour table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS WorkingHour (
      id VARCHAR(36) PRIMARY KEY,
      professionalId VARCHAR(36) NOT NULL,
      dayOfWeek INT NOT NULL,
      startTime VARCHAR(10) DEFAULT '09:00',
      endTime VARCHAR(10) DEFAULT '19:00',
      breakStart VARCHAR(10),
      breakEnd VARCHAR(10),
      FOREIGN KEY (professionalId) REFERENCES Professional(id) ON DELETE CASCADE,
      INDEX idx_workinghour_prof (professionalId)
    );
  `);

  // 11. TimeBlock table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS TimeBlock (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      professionalId VARCHAR(36),
      type ENUM('DAY_OFF', 'VACATION', 'BREAK') DEFAULT 'DAY_OFF',
      startDate DATETIME NOT NULL,
      endDate DATETIME NOT NULL,
      reason TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      FOREIGN KEY (professionalId) REFERENCES Professional(id) ON DELETE SET NULL,
      INDEX idx_timeblock_tenant (tenantId)
    );
  `);

  // 12. Appointment table with snapshots & cents
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS Appointment (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      clientId VARCHAR(36) NOT NULL,
      professionalId VARCHAR(36) NOT NULL,
      serviceId VARCHAR(36) NOT NULL,
      dateTime DATETIME NOT NULL,
      endDateTime DATETIME NOT NULL,
      status ENUM('PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW') DEFAULT 'PENDING_PAYMENT',
      expiresAt DATETIME,
      totalAmountCents INT NOT NULL,
      depositAmountCents INT NOT NULL,
      balanceAmountCents INT NOT NULL,
      snapshotPriceCents INT NOT NULL,
      snapshotDurationMin INT NOT NULL,
      snapshotDepositPercent INT NOT NULL,
      snapshotDepositCents INT NOT NULL,
      snapshotBalanceCents INT NOT NULL,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      FOREIGN KEY (clientId) REFERENCES Client(id) ON DELETE CASCADE,
      FOREIGN KEY (professionalId) REFERENCES Professional(id) ON DELETE CASCADE,
      FOREIGN KEY (serviceId) REFERENCES Service(id) ON DELETE CASCADE,
      INDEX idx_appointment_tenant (tenantId)
    );
  `);

  // 13. Payment table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS Payment (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36) NOT NULL,
      appointmentId VARCHAR(36) NOT NULL,
      provider VARCHAR(50) DEFAULT 'MERCADO_PAGO',
      providerPaymentId VARCHAR(100) UNIQUE,
      externalReference VARCHAR(100) NOT NULL,
      idempotencyKey VARCHAR(100) UNIQUE NOT NULL,
      amountCents INT NOT NULL,
      currency VARCHAR(10) DEFAULT 'BRL',
      status ENUM('CREATED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED') DEFAULT 'CREATED',
      paymentMethod VARCHAR(50) DEFAULT 'PIX',
      qrCode TEXT,
      qrCodeBase64 LONGTEXT,
      ticketUrl TEXT,
      expiresAt DATETIME,
      approvedAt DATETIME,
      rawResponse JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      FOREIGN KEY (appointmentId) REFERENCES Appointment(id) ON DELETE CASCADE,
      INDEX idx_payment_tenant (tenantId),
      INDEX idx_payment_appointment (appointmentId),
      INDEX idx_payment_ext_ref (externalReference),
      INDEX idx_payment_status (status)
    );
  `);

  // 14. WebhookEvent table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS WebhookEvent (
      id VARCHAR(36) PRIMARY KEY,
      tenantId VARCHAR(36),
      provider VARCHAR(50) DEFAULT 'MERCADO_PAGO',
      providerEventId VARCHAR(100) UNIQUE,
      resourceId VARCHAR(100),
      eventType VARCHAR(100) NOT NULL,
      payload JSON,
      processingStatus ENUM('PENDING', 'PROCESSED', 'FAILED', 'IGNORED') DEFAULT 'PENDING',
      attempts INT DEFAULT 0,
      receivedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      processedAt DATETIME,
      lastError TEXT,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE SET NULL,
      INDEX idx_webhook_resource (provider, resourceId),
      INDEX idx_webhook_status (processingStatus)
    );
  `);

  console.log('[Migration] All updated multi-tenant tables created successfully!');

  // Seed default data if empty
  const [rows]: any = await connection.execute('SELECT COUNT(*) as count FROM Tenant');
  if (rows[0].count === 0) {
    console.log('[Migration] Seeding initial salon & owner account...');
    
    const tenantId = 'biz-1';
    await connection.execute(
      'INSERT INTO Tenant (id, name, slug, phone, email, address, defaultDeposit) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tenantId, 'Agenda Beauty Studio', 'agenda-beauty-studio', '(11) 98765-4321', 'contato@agendabeauty.com.br', 'Alameda dos Anjos, 1000 - São Paulo, SP', 30]
    );

    const userId = 'user-1';
    const pwdHash = await bcrypt.hash('123456', 10);
    await connection.execute(
      'INSERT INTO User (id, name, email, passwordHash) VALUES (?, ?, ?, ?)',
      [userId, 'Camila Souza', 'camila@agendabeauty.com.br', pwdHash]
    );

    await connection.execute(
      'INSERT INTO TenantMember (id, tenantId, userId, role) VALUES (?, ?, ?, ?)',
      ['mem-1', tenantId, userId, 'OWNER']
    );

    // Seed services (prices in cents: R$ 180.00 = 18000 cents, R$ 90.00 = 9000 cents)
    await connection.execute(
      'INSERT INTO Service (id, tenantId, name, description, category, priceCents, durationMin, bufferBeforeMin, bufferAfterMin, preparationMin, depositPercent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['serv-1', tenantId, 'Alongamento em Gel (Fibra)', 'Fibra de vidro completa', 'Alongamento', 18000, 120, 0, 15, 10, 30]
    );
    await connection.execute(
      'INSERT INTO Service (id, tenantId, name, description, category, priceCents, durationMin, bufferBeforeMin, bufferAfterMin, preparationMin, depositPercent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['serv-2', tenantId, 'Esmaltação em Gel', 'Secagem LED alta durabilidade', 'Esmaltação', 9000, 45, 0, 10, 5, 30]
    );

    // Seed professionals
    await connection.execute(
      'INSERT INTO Professional (id, tenantId, name, email, phone, specialty) VALUES (?, ?, ?, ?, ?, ?)',
      ['prof-1', tenantId, 'Camila Souza', 'camila@agendabeauty.com.br', '(11) 99111-2233', 'Alongamento em Gel']
    );

    // Seed service professional association
    await connection.execute(
      'INSERT INTO ServiceProfessional (id, serviceId, professionalId) VALUES (?, ?, ?)',
      ['sp-1', 'serv-1', 'prof-1']
    );
    await connection.execute(
      'INSERT INTO ServiceProfessional (id, serviceId, professionalId) VALUES (?, ?, ?)',
      ['sp-2', 'serv-2', 'prof-1']
    );

    // No test client seeded - clean database ready for real customers

    console.log('[Migration] Default seed data inserted successfully!');
  }

  await connection.end();
  console.log('[Migration] Connection closed.');
}

runMigration().catch(err => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
