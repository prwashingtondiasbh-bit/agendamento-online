import { createApp } from '../app.js';
import http from 'http';

async function runMonetaryTests() {
  console.log('[Test] Running Agenda Beauty Monetary & Deposit Calculation Tests...');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  try {
    // 1. Login to get session cookie
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'camila@agendabeauty.com.br', password: '123456' }),
    });
    const loginData = await loginRes.json() as any;
    if (!loginData.success) throw new Error('Login failed in monetary test');
    const cookieHeader = loginRes.headers.get('set-cookie');
    const sessionCookie = cookieHeader ? cookieHeader.split(';')[0] : '';

    // 2. Test Service creation with priceCents and depositPercent (e.g. R$ 150.00 = 15000 cents, deposit 30%)
    const createServiceRes = await fetch(`${baseUrl}/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: 'Nail Art Premium',
        description: 'Decoração exclusiva',
        category: 'Nail Art',
        priceCents: 15000, // R$ 150,00 in cents
        durationMin: 90,
        bufferBeforeMin: 5,
        bufferAfterMin: 15,
        preparationMin: 10,
        depositPercent: 30, // 30%
      }),
    });
    const serviceData = await createServiceRes.json() as any;
    if (!serviceData.success) {
      throw new Error('Service creation failed: ' + JSON.stringify(serviceData));
    }
    const service = serviceData.data;
    if (service.priceCents !== 15000 || service.depositPercent !== 30) {
      throw new Error('Service price or deposit mismatch');
    }
    console.log('✅ Service creation with cents & deposit percent passed');

    // 3. Test Appointment creation calculates deposit on backend in cents and stores snapshot
    const clientsRes = await fetch(`${baseUrl}/clients`, { headers: { Cookie: sessionCookie } });
    const clientsData = await clientsRes.json() as any;
    const client = clientsData.data[0];

    const profRes = await fetch(`${baseUrl}/professionals`, { headers: { Cookie: sessionCookie } });
    const profData = await profRes.json() as any;
    const professional = profData.data[0];

    const createAppRes = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        clientId: client.id,
        professionalId: professional.id,
        serviceId: service.id,
        dateTime: new Date(Date.now() + 86400000 * 100 + Math.floor(Math.random() * 50) * 86400000).toISOString(),
        notes: 'Teste financeiro',
      }),
    });
    const createAppJson = await createAppRes.json() as any;
    if (!createAppJson.success) {
      throw new Error('Appointment creation failed: ' + JSON.stringify(createAppJson));
    }

    const appt = createAppJson.data;
    // R$ 150.00 (15000 cents), 30% deposit = 4500 cents (R$ 45.00), balance = 10500 cents (R$ 105.00)
    if (appt.totalAmountCents !== 15000 || appt.depositAmountCents !== 4500 || appt.balanceAmountCents !== 10500) {
      throw new Error(`Monetary calculation incorrect: total=${appt.totalAmountCents}, deposit=${appt.depositAmountCents}, balance=${appt.balanceAmountCents}`);
    }
    if (appt.snapshotPriceCents !== 15000 || appt.snapshotDepositPercent !== 30 || appt.snapshotDepositCents !== 4500) {
      throw new Error('Snapshot values incorrect');
    }
    console.log('✅ Backend monetary calculation (cents & deposit) and snapshot integrity passed');

    console.log('🎉 All monetary and financial calculation tests passed successfully!');
  } catch (error) {
    console.error('❌ Monetary test failed:', error);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runMonetaryTests();
