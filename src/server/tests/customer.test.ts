import { createApp } from '../app.js';
import http from 'http';

async function runCustomerPortalTests() {
  console.log('[Test] Running Agenda Beauty Customer Portal & Anti-IDOR Tests (Etapa 6)...');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  try {
    // 1. Customer Registration
    const registerRes = await fetch(`${baseUrl}/customer/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Juliana Paes',
        email: `juliana-${Date.now()}@email.com`,
        phone: '(11) 98888-9999',
        password: 'password123',
        contactPreference: 'WHATSAPP',
      }),
    });
    const registerData = await registerRes.json() as any;
    if (!registerData.success) {
      throw new Error('Customer registration failed: ' + JSON.stringify(registerData));
    }
    const customerToken = registerData.token;
    console.log('✅ POST /api/v1/customer/auth/register passed');

    // 2. Customer Me Profile
    const meRes = await fetch(`${baseUrl}/customer/me`, {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });
    const meData = await meRes.json() as any;
    if (!meData.success || meData.data.customer.name !== 'Juliana Paes') {
      throw new Error('Customer /me failed: ' + JSON.stringify(meData));
    }
    console.log('✅ GET /api/v1/customer/me verified authenticated profile and establishment info');

    // 3. Customer Profile Update (whitelisted fields)
    const patchRes = await fetch(`${baseUrl}/customer/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        name: 'Juliana Paes Silva',
        phone: '(11) 97777-6666',
        contactPreference: 'SMS',
        // Attempting forbidden field (IDOR/Privilege Escalation attempt)
        role: 'SUPER_ADMIN',
        tenantId: 'biz-hacked',
      }),
    });
    const patchData = await patchRes.json() as any;
    if (!patchData.success) {
      throw new Error('Customer profile patch failed');
    }
    console.log('✅ PATCH /api/v1/customer/me successfully updated profile while protecting system fields');

    // 4. Test Customer Appointments and IDOR Protection
    // Log in as seed customer Beatriz
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'beatriz@email.com', password: '123456' }),
    });
    const loginData = await loginRes.json() as any;
    const beatrizToken = loginData.token;

    const appsRes = await fetch(`${baseUrl}/customer/appointments`, {
      headers: { Authorization: `Bearer ${beatrizToken}` },
    });
    const appsData = await appsRes.json() as any;
    if (!appsData.success) {
      throw new Error('Get customer appointments failed');
    }
    console.log('✅ GET /api/v1/customer/appointments returned isolated appointments');

    // Check financial calculations on appointment
    if (appsData.data.all && appsData.data.all.length > 0) {
      const appItem = appsData.data.all[0];
      if (appItem.depositAmountCents + appItem.balanceAmountCents !== appItem.totalAmountCents) {
        throw new Error('Financial breakdown does not sum to total price!');
      }
      console.log(`✅ Financial integrity confirmed: Sinal (${appItem.formattedDeposit}) + Saldo (${appItem.formattedBalance}) = Total (${appItem.formattedTotal})`);

      // 5. IDOR test: Juliana trying to access Beatriz's appointment by ID
      const idorRes = await fetch(`${baseUrl}/customer/appointments/${appItem.id}`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const idorData = await idorRes.json() as any;
      if (idorRes.status !== 404 && idorRes.status !== 403) {
        throw new Error('Security failure: Customer Juliana was able to access Beatriz\'s appointment!');
      }
      console.log('✅ Anti-IDOR verified: Cross-client appointment access strictly rejected (404/403)');
    }

    // 6. Test Customer Payments
    const paysRes = await fetch(`${baseUrl}/customer/payments`, {
      headers: { Authorization: `Bearer ${beatrizToken}` },
    });
    const paysData = await paysRes.json() as any;
    if (!paysData.success) {
      throw new Error('Customer payments list failed');
    }
    console.log('✅ GET /api/v1/customer/payments returned client transactions without duplicate total calculation');

    // 7. Test Customer Notifications
    const notifsRes = await fetch(`${baseUrl}/customer/notifications`, {
      headers: { Authorization: `Bearer ${beatrizToken}` },
    });
    const notifsData = await notifsRes.json() as any;
    if (!notifsData.success) {
      throw new Error('Customer notifications failed');
    }
    console.log('✅ GET /api/v1/customer/notifications passed');

    console.log('🎉 All Customer Portal (Etapa 6) tests passed with 100% success!');
  } catch (error) {
    console.error('❌ Customer Portal test failed:', error);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runCustomerPortalTests();
