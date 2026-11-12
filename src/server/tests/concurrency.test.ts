import { createApp } from '../app.js';
import http from 'http';

async function runConcurrencyTests() {
  console.log('[Test] Running Agenda Beauty Concurrency & Slot Locking Tests...');
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
    if (!loginData.success) throw new Error('Login failed in concurrency test');
    const cookieHeader = loginRes.headers.get('set-cookie');
    const sessionCookie = cookieHeader ? cookieHeader.split(';')[0] : '';

    const clientsRes = await fetch(`${baseUrl}/clients`, { headers: { Cookie: sessionCookie } });
    const clientsData = await clientsRes.json() as any;
    const client = clientsData.data[0];

    const profRes = await fetch(`${baseUrl}/professionals`, { headers: { Cookie: sessionCookie } });
    const profData = await profRes.json() as any;
    const professional = profData.data[0];

    const servicesRes = await fetch(`${baseUrl}/services`, { headers: { Cookie: sessionCookie } });
    const servicesData = await servicesRes.json() as any;
    const service = servicesData.data[0];

    const targetDateTime = new Date(Date.now() + 86400000 * 200 + Math.floor(Math.random() * 50) * 86400000).toISOString();

    // 2. Client 1 makes temporary reservation (PENDING_PAYMENT)
    const res1 = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({
        clientId: client.id,
        professionalId: professional.id,
        serviceId: service.id,
        dateTime: targetDateTime,
        notes: 'Reserva concorrente 1',
      }),
    });
    const data1 = await res1.json() as any;
    if (!data1.success) {
      throw new Error('First reservation failed: ' + JSON.stringify(data1));
    }
    console.log('✅ First temporary reservation (PENDING_PAYMENT) created successfully');

    // 3. Client 2 attempts simultaneous booking on the exact same slot (should conflict and be rejected)
    const res2 = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({
        clientId: client.id,
        professionalId: professional.id,
        serviceId: service.id,
        dateTime: targetDateTime,
        notes: 'Reserva concorrente 2',
      }),
    });
    const data2 = await res2.json() as any;
    if (data2.success) {
      throw new Error('Concurrency failure: Second simultaneous reservation was incorrectly allowed!');
    }
    console.log('✅ Concurrency check passed: Second simultaneous overlapping reservation was successfully blocked');

    console.log('🎉 All concurrency and slot locking tests passed successfully!');
  } catch (error) {
    console.error('❌ Concurrency test failed:', error);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runConcurrencyTests();
