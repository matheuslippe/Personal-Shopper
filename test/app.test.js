const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const server = require('../server');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

describe('Assessoria Express — Suíte de Testes Automatizados', () => {
  let userTokenA = '';
  let userTokenB = '';
  const stamp = Date.now();
  const usernameA = `tester_a_${stamp}`;
  const usernameB = `tester_b_${stamp}`;

  test('1. Static HTML serving', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Assessoria Express'));
  });

  test('2. Rate Limiting e Cadastro com senha >= 8 caracteres', async () => {
    // Should fail with < 8 chars
    const resFail = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameA, password: '123', confirmPassword: '123' })
    });
    assert.equal(resFail.status, 400);

    // Should succeed with 8+ chars
    const resA = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameA, password: 'password123', confirmPassword: 'password123' })
    });
    assert.equal(resA.status, 201);
    const dataA = await resA.json();
    assert.ok(dataA.token);
    userTokenA = dataA.token;

    // Register User B
    const resB = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameB, password: 'password123', confirmPassword: 'password123' })
    });
    assert.equal(resB.status, 201);
    const dataB = await resB.json();
    assert.ok(dataB.token);
    userTokenB = dataB.token;
  });

  test('3. Login e Verificação de Sessão (Auth Me)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userTokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.username, usernameA);
  });

  test('4. Cadastro de Pedido com Múltiplos Itens e Cálculo Consolidado', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userTokenA}` },
      body: JSON.stringify({
        client_name: 'Marcos Vinicius',
        items: [
          { item_type: 'tenis', items_desc: 'Nike Air Max', quantity: 2, commission_unit: 10 },
          { item_type: 'blusa', items_desc: 'Moletom Canguru', quantity: 3, commission_unit: 10 }
        ],
        order_date: '2026-09-01',
        status: 'pendente'
      })
    });
    assert.equal(res.status, 201);
    const order = await res.json();
    assert.equal(order.quantity, 5);
    assert.equal(order.commission_total, 50);
    assert.equal(order.items.length, 2);
  });

  test('5. Isolamento Multi-Tenant (User B não deve ver pedidos do User A)', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      headers: { 'Authorization': `Bearer ${userTokenB}` }
    });
    assert.equal(res.status, 200);
    const orders = await res.json();
    assert.equal(orders.length, 0, 'User B deve ter 0 pedidos inicialmente');
  });

  test('6. Lançamento de Despesa e Dashboard Consolidado', async () => {
    const catsRes = await fetch(`${BASE_URL}/api/categories`, {
      headers: { 'Authorization': `Bearer ${userTokenA}` }
    });
    const cats = await catsRes.json();
    assert.ok(cats.length > 0);

    const expRes = await fetch(`${BASE_URL}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userTokenA}` },
      body: JSON.stringify({
        category_id: cats[0].id,
        description: 'Combustível Viagem Brás',
        amount: 80.00,
        expense_date: '2026-09-01'
      })
    });
    assert.equal(expRes.status, 201);

    const dashRes = await fetch(`${BASE_URL}/api/dashboard/overview?month=2026-09`, {
      headers: { 'Authorization': `Bearer ${userTokenA}` }
    });
    assert.equal(dashRes.status, 200);
    const dash = await dashRes.json();
    assert.equal(typeof dash.netBalance, 'number');
  });

  test('7. Security Headers HTTP presentes', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'));
  });

  test('8. Portal do Cliente e Solicitação de Assessoria', async () => {
    // 1. Assessor configures Pix
    await fetch(`${BASE_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userTokenA}` },
      body: JSON.stringify({ pix_key: '11999998888', pix_name: 'Shopper Pro', pix_type: 'Telefone/Celular' })
    });

    const meResA = await fetch(`${BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${userTokenA}` } });
    const meDataA = await meResA.json();
    const assessorAId = meDataA.user.id;

    // 2. Register Client linked to Assessor A
    const clientUsername = `cliente_${stamp}`;
    const resReg = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: clientUsername,
        password: 'password123',
        confirmPassword: 'password123',
        role: 'cliente',
        assessor_id: assessorAId
      })
    });
    assert.equal(resReg.status, 201);
    const clientData = await resReg.json();
    assert.equal(clientData.user.role, 'cliente');
    const clientToken = clientData.token;

    // 3. Client submits purchase request
    const reqRes = await fetch(`${BASE_URL}/api/client/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: JSON.stringify({
        supplier: 'Galeria Pagé',
        notes: 'Comprar cor preta',
        assessor_id: assessorAId,
        items: [
          { item_type: 'tenis', items_desc: 'Puma Suede', quantity: 2 },
          { item_type: 'roupa', items_desc: 'Calça Cargo', quantity: 1 }
        ]
      })
    });
    assert.equal(reqRes.status, 201);
    const reqData = await reqRes.json();
    assert.ok(reqData.order.tracking_code);
    const trackingCode = reqData.order.tracking_code;

    // 4. Client lists their orders
    const listRes = await fetch(`${BASE_URL}/api/client/orders`, {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert.equal(listRes.status, 200);
    const clientOrders = await listRes.json();
    assert.equal(clientOrders.length, 1);
    assert.equal(clientOrders[0].tracking_code, trackingCode);

    // 5. Public Tracking by Code without login
    const pubRes = await fetch(`${BASE_URL}/api/tracking/${trackingCode}`);
    assert.equal(pubRes.status, 200);
    const pubData = await pubRes.json();
    assert.equal(pubData.order.tracking_code, trackingCode);
    assert.equal(pubData.assessor.pix_key, '11999998888');
  });

  test('9. Proteção contra Path Traversal no servidor estático', async () => {
    const res = await fetch(`${BASE_URL}/../../package.json`);
    // Should safely reject escape attempts or serve SPA index.html
    assert.ok(res.status === 403 || res.status === 200);
    if (res.status === 200) {
      const text = await res.text();
      assert.ok(text.includes('Assessoria Express'), 'Deve servir index.html e não vazar arquivos do sistema');
    }
  });

  test('10. Login Case-Insensitive', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: usernameA.toUpperCase(),
        password: 'password123'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
  });

  test('11. Módulo de Agenda — Configurações e Resumo do Assessor', async () => {
    // 1. Save schedule settings
    const saveRes = await fetch(`${BASE_URL}/api/schedule/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userTokenA}` },
      body: JSON.stringify({
        schedule_mode: 'manual',
        schedule_daily_limit: 3,
        schedule_period_name: 'Manhã (06h às 13h)'
      })
    });
    assert.equal(saveRes.status, 200);

    // 2. Get summary
    const sumRes = await fetch(`${BASE_URL}/api/schedule/summary?month=2026-09`, {
      headers: { 'Authorization': `Bearer ${userTokenA}` }
    });
    assert.equal(sumRes.status, 200);
    const sumData = await sumRes.json();
    assert.equal(sumData.settings.schedule_mode, 'manual');
    assert.equal(sumData.settings.schedule_daily_limit, 3);
  });

  test('12. Fluxo de Agendamento Manual e Aceite pelo Assessor', async () => {
    // Register Client C
    const clientUserC = `client_c_${stamp}`;
    const meResA = await fetch(`${BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${userTokenA}` } });
    const meDataA = await meResA.json();
    const assessorAId = meDataA.user.id;

    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: clientUserC,
        password: 'password123',
        role: 'cliente',
        assessor_id: assessorAId
      })
    });
    const regData = await regRes.json();
    const tokenC = regData.token;

    // Client C submits purchase request (in manual mode)
    const reqRes = await fetch(`${BASE_URL}/api/client/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenC}` },
      body: JSON.stringify({
        supplier: 'Bras 25',
        assessor_id: assessorAId,
        items: [{ item_type: 'blusa', items_desc: 'Blazer Alfaiataria', quantity: 1 }]
      })
    });
    assert.equal(reqRes.status, 201);
    const reqData = await reqRes.json();
    assert.equal(reqData.order.acceptance_status, 'aguardando_aceite');
    const orderId = reqData.order.id;

    // Assessor accepts and schedules date
    const acceptRes = await fetch(`${BASE_URL}/api/orders/${orderId}/accept-schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userTokenA}` },
      body: JSON.stringify({
        scheduled_date: '2026-09-10',
        scheduled_period: 'Manhã (06h às 13h)'
      })
    });
    assert.equal(acceptRes.status, 200);
    const acceptData = await acceptRes.json();
    assert.equal(acceptData.order.acceptance_status, 'agendado');
    assert.equal(acceptData.order.scheduled_date, '2026-09-10');
  });

  test('13. Fluxo de Agendamento Automático de Data', async () => {
    // Set schedule_mode to automatico
    await fetch(`${BASE_URL}/api/schedule/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userTokenA}` },
      body: JSON.stringify({
        schedule_mode: 'automatico',
        schedule_daily_limit: 5
      })
    });

    // Register Client D
    const clientUserD = `client_d_${stamp}`;
    const meResA = await fetch(`${BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${userTokenA}` } });
    const assessorAId = (await meResA.json()).user.id;

    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: clientUserD,
        password: 'password123',
        role: 'cliente',
        assessor_id: assessorAId
      })
    });
    const tokenD = (await regRes.json()).token;

    // Client D submits purchase request
    const reqRes = await fetch(`${BASE_URL}/api/client/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenD}` },
      body: JSON.stringify({
        supplier: 'Bom Retiro',
        assessor_id: assessorAId,
        items: [{ item_type: 'tenis', items_desc: 'Air Jordan', quantity: 1 }]
      })
    });
    assert.equal(reqRes.status, 201);
    const reqData = await reqRes.json();
    assert.equal(reqData.order.acceptance_status, 'agendado');
    assert.ok(reqData.order.scheduled_date, 'Deve ter scheduled_date gerada automaticamente');
  });
});
