import { createApp } from '../app.js';
import http from 'http';

async function runTests() {
  console.log('[Test] Running Agenda Beauty backend basic tests...');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  try {
    // Test Health Endpoint (Public)
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json() as any;
    if (!healthData.success || healthData.status !== 'ok') {
      throw new Error('Health check failed: ' + JSON.stringify(healthData));
    }
    console.log('✅ GET /api/v1/health passed');

    // Login first to get session cookie
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'camila@agendabeauty.com.br', password: '123456' }),
    });
    const loginData = await loginRes.json() as any;
    if (!loginData.success) {
      throw new Error('Login failed in test: ' + JSON.stringify(loginData));
    }
    const cookieHeader = loginRes.headers.get('set-cookie');
    const sessionCookie = cookieHeader ? cookieHeader.split(';')[0] : '';

    // Test Business Endpoint (Protected)
    const bizRes = await fetch(`${baseUrl}/business`, {
      headers: { Cookie: sessionCookie },
    });
    const bizData = await bizRes.json() as any;
    if (!bizData.success || !bizData.data.name) {
      throw new Error('Business endpoint failed: ' + JSON.stringify(bizData));
    }
    console.log('✅ GET /api/v1/business passed');

    // Test Services Endpoint (Protected)
    const servRes = await fetch(`${baseUrl}/services`, {
      headers: { Cookie: sessionCookie },
    });
    const servData = await servRes.json() as any;
    if (!servData.success || !Array.isArray(servData.data)) {
      throw new Error('Services endpoint failed');
    }
    console.log('✅ GET /api/v1/services passed');

    // Test Dashboard Stats Endpoint (Protected)
    const statsRes = await fetch(`${baseUrl}/dashboard/stats`, {
      headers: { Cookie: sessionCookie },
    });
    const statsData = await statsRes.json() as any;
    if (!statsData.success || typeof statsData.data.totalRevenue !== 'number') {
      throw new Error('Dashboard stats endpoint failed');
    }
    console.log('✅ GET /api/v1/dashboard/stats passed');

    console.log('🎉 All backend basic tests passed successfully!');
  } catch (error) {
    console.error('❌ Backend test failed:', error);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
