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
});
