const { queryAll, formatOrderRow } = require('../db/client');
const { sendJson } = require('../utils/http');

async function handleExportRoutes(pathname, req, res, session) {
  const userId = session.user_id;

  // 1. JSON Backup Export: GET /api/export/backup
  if (pathname === '/api/export/backup' && req.method === 'GET') {
    const orders = await queryAll("SELECT * FROM orders WHERE user_id = ?", [userId]);
    const expenses = await queryAll("SELECT * FROM expenses WHERE user_id = ?", [userId]);
    const categories = await queryAll("SELECT * FROM categories WHERE user_id = ?", [userId]);
    const settings = await queryAll("SELECT * FROM settings WHERE user_id = ?", [userId]);

    return sendJson(res, 200, {
      exported_at: new Date().toISOString(),
      orders: orders.map(formatOrderRow),
      expenses,
      categories,
      settings
    });
  }

  // 2. Orders CSV Export: GET /api/export/orders.csv
  if (pathname === '/api/export/orders.csv' && req.method === 'GET') {
    const orders = await queryAll("SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC", [userId]);
    let csv = 'ID;Cliente;Fornecedor;Descrição Peça;Tipo;Quantidade;Comissão Unit (R$);Comissão Total (R$);Data Pedido;Data Pagamento;Status;Observações\n';
    for (const o of orders) {
      const row = [
        o.id,
        `"${(o.client_name || '').replace(/"/g, '""')}"`,
        `"${(o.supplier || '').replace(/"/g, '""')}"`,
        `"${(o.items_desc || '').replace(/"/g, '""')}"`,
        o.item_type,
        o.quantity,
        Number(o.commission_unit).toFixed(2),
        Number(o.commission_total).toFixed(2),
        o.order_date,
        o.payment_date || '',
        o.status,
        `"${(o.notes || '').replace(/"/g, '""')}"`
      ].join(';');
      csv += row + '\n';
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="assessorias_pedidos.csv"'
    });
    return res.end('\uFEFF' + csv);
  }

  // 3. Expenses CSV Export: GET /api/export/expenses.csv
  if (pathname === '/api/export/expenses.csv' && req.method === 'GET') {
    const expenses = await queryAll(`
      SELECT e.*, c.name as category_name 
      FROM expenses e 
      JOIN categories c ON e.category_id = c.id 
      WHERE e.user_id = ?
      ORDER BY e.expense_date DESC
    `, [userId]);

    let csv = 'ID;Data;Categoria;Descrição;Valor (R$)\n';
    for (const e of expenses) {
      const row = [
        e.id,
        e.expense_date,
        `"${(e.category_name || '').replace(/"/g, '""')}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        Number(e.amount).toFixed(2)
      ].join(';');
      csv += row + '\n';
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="despesas_pessoais.csv"'
    });
    return res.end('\uFEFF' + csv);
  }

  return false;
}

module.exports = { handleExportRoutes };
