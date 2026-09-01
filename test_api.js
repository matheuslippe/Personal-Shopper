/**
 * Automated Verification Script for Personal Shopper & Finance System
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Iniciando Bateria de Testes Automatizados...\n');
  let passed = 0;
  let failed = 0;

  async function assert(desc, fn) {
    try {
      await fn();
      console.log(` ✅ PASSOU: ${desc}`);
      passed++;
    } catch (err) {
      console.error(` ❌ FALHOU: ${desc} -> ${err.message}`);
      failed++;
    }
  }

  let authToken = '';

  // 1. Static HTML serving
  await assert('Servidor de arquivos estáticos (index.html)', async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    if (!text.includes('Assessoria Express')) throw new Error('Conteúdo HTML inválido');
  });

  // 2. Authentication Login
  await assert('Login de usuário padrão (admin / admin123)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const data = await res.json();
    if (res.status !== 200 || !data.token) throw new Error(data.error || 'Token não retornado');
    authToken = data.token;
  });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  });

  // 3. Auth Me
  await assert('Verificação de sessão (/api/auth/me)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, { headers: authHeaders() });
    const data = await res.json();
    if (res.status !== 200 || data.user.username !== 'admin') throw new Error('Dados de usuário inválidos');
  });

  // 4. Default Categories
  await assert('Listagem de categorias iniciais (Alimentação, Investimento, Banheiro)', async () => {
    const res = await fetch(`${BASE_URL}/api/categories`, { headers: authHeaders() });
    const cats = await res.json();
    if (!Array.isArray(cats) || cats.length === 0) throw new Error('Categorias não retornadas');
    const names = cats.map(c => c.name);
    if (!names.includes('Alimentação') || !names.includes('Banheiro')) {
      throw new Error('Categorias padrão ausentes');
    }
  });

  // 5. Create Custom Category
  let newCatId = null;
  const dynamicCatName = `Hospedagem Viagem ${Date.now()}`;
  await assert('Criação de categoria personalizada', async () => {
    const res = await fetch(`${BASE_URL}/api/categories`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: dynamicCatName, color: '#ec4899' })
    });
    const data = await res.json();
    if (res.status !== 201 || !data.id) throw new Error(data.error || 'Falha ao criar categoria');
    newCatId = data.id;
  });

  // 6. Create Order with dynamic commission
  let orderId = null;
  await assert('Cadastro de novo pedido com cálculo de comissão', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        client_name: 'Guilherme Santos',
        supplier: 'Atacado Calçados Franca',
        item_type: 'tenis',
        items_desc: 'Tênis Esportivo Casual (tam 42)',
        quantity: 3,
        commission_unit: 10.0,
        order_date: new Date().toISOString().split('T')[0],
        status: 'pendente',
        notes: 'Pedido teste de verificação'
      })
    });
    const data = await res.json();
    if (res.status !== 201 || data.commission_total !== 30) {
      throw new Error(`Comissão calculada incorretamente: ${data.commission_total}`);
    }
    orderId = data.id;
  });

  // 6.1 Create Order with MULTIPLE Items
  let multiOrderId = null;
  await assert('Cadastro de pedido com MÚLTIPLOS itens distintos por vez', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        client_name: 'Renata Albuquerque',
        supplier: 'Distribuidora São Paulo',
        items: [
          { item_type: 'tenis', items_desc: 'Nike Dunk Low Panda (tam 38)', quantity: 2, commission_unit: 10.0 },
          { item_type: 'blusa', items_desc: 'Moletom Canguru Preto G', quantity: 3, commission_unit: 10.0 },
          { item_type: 'roupa', items_desc: 'Camisetas Algodão Básicas', quantity: 4, commission_unit: 9.0 }
        ],
        order_date: new Date().toISOString().split('T')[0],
        status: 'pendente',
        notes: 'Pedido com 3 itens diferentes totalizando 9 peças'
      })
    });
    const data = await res.json();
    if (res.status !== 201 || data.quantity !== 9 || data.commission_total !== 86 || !Array.isArray(data.items) || data.items.length !== 3) {
      throw new Error(`Falha no pedido multi-item: total peças ${data.quantity}, comissão total ${data.commission_total}, itens count ${data.items ? data.items.length : 0}`);
    }
    multiOrderId = data.id;
  });

  // 7. Quick Status Update
  await assert('Alteração rápida de status do pedido para "pago"', async () => {
    const res = await fetch(`${BASE_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'pago' })
    });
    const data = await res.json();
    if (res.status !== 200 || data.status !== 'pago' || !data.payment_date) {
      throw new Error('Status não atualizado corretamente');
    }
  });

  // 8. Create Expense
  let expenseId = null;
  await assert('Lançamento de despesa pessoal', async () => {
    const res = await fetch(`${BASE_URL}/api/expenses`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        category_id: newCatId,
        description: 'Pernoite Hotel Viagem Compras',
        amount: 150.00,
        expense_date: new Date().toISOString().split('T')[0]
      })
    });
    const data = await res.json();
    if (res.status !== 201 || data.amount !== 150.00) {
      throw new Error('Despesa não criada');
    }
    expenseId = data.id;
  });

  // 9. Consolidated Dashboard Overview
  await assert('Dashboard Consolidado (Comissões, Despesas, Saldo Líquido)', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/overview`, { headers: authHeaders() });
    const data = await res.json();
    if (res.status !== 200) throw new Error('Dashboard retornou erro');
    if (typeof data.paidCommission !== 'number' || typeof data.totalExpenses !== 'number' || typeof data.netBalance !== 'number') {
      throw new Error('Métricas numéricas ausentes no dashboard');
    }
    console.log(`    📊 Métricas verificadas: Comissões Pagas: R$ ${data.paidCommission.toFixed(2)} | Gastos: R$ ${data.totalExpenses.toFixed(2)} | Saldo Líquido: R$ ${data.netBalance.toFixed(2)}`);
  });

  // 10. Sales Dashboard Analytics
  await assert('Dashboard de Vendas (Ranking de clientes e divisão por tipo)', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/sales`, { headers: authHeaders() });
    const data = await res.json();
    if (res.status !== 200 || !Array.isArray(data.topClients) || !Array.isArray(data.itemsByType)) {
      throw new Error('Analytics de vendas inválidos');
    }
  });

  // 11. CSV and Backup Export
  await assert('Exportação de relatórios CSV e Backup JSON', async () => {
    const resBackup = await fetch(`${BASE_URL}/api/export/backup`, { headers: authHeaders() });
    if (resBackup.status !== 200) throw new Error('Erro no backup');
    const resCsv = await fetch(`${BASE_URL}/api/export/orders.csv`, { headers: authHeaders() });
    if (resCsv.status !== 200) throw new Error('Erro no CSV de pedidos');
  });

  console.log(`\n========================================`);
  console.log(`🎯 RESULTADO DOS TESTES: ${passed} PASSOU | ${failed} FALHOU`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
