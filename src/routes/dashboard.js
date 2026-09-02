const { queryAll, queryGet, formatOrderRow } = require('../db/client');
const { sendJson } = require('../utils/http');

async function handleDashboardRoutes(pathname, req, res, session, searchParams) {
  const userId = session.user_id;

  // 1. Overview Dashboard: GET /api/dashboard/overview
  if (pathname === '/api/dashboard/overview' && req.method === 'GET') {
    const currentMonth = searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const paidCommissionRow = await queryGet(`
      SELECT COALESCE(SUM(commission_total), 0) as total, COALESCE(SUM(quantity), 0) as pieces
      FROM orders 
      WHERE user_id = ? AND status = 'pago' AND order_date LIKE ?
    `, [userId, `${currentMonth}%`]);

    const pendingCommissionRow = await queryGet(`
      SELECT COALESCE(SUM(commission_total), 0) as total, COUNT(*) as count 
      FROM orders 
      WHERE user_id = ? AND status = 'pendente' AND order_date LIKE ?
    `, [userId, `${currentMonth}%`]);

    const overdueCommissionRow = await queryGet(`
      SELECT COALESCE(SUM(commission_total), 0) as total, COUNT(*) as count 
      FROM orders 
      WHERE user_id = ? AND status = 'atrasado' AND order_date LIKE ?
    `, [userId, `${currentMonth}%`]);

    const attentionOrders = await queryAll(`
      SELECT * FROM orders 
      WHERE user_id = ? AND status IN ('pendente', 'atrasado') 
      ORDER BY status DESC, order_date ASC 
      LIMIT 10
    `, [userId]);

    const expensesRow = await queryGet(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count 
      FROM expenses 
      WHERE user_id = ? AND expense_date LIKE ?
    `, [userId, `${currentMonth}%`]);

    const totalPaidCommission = paidCommissionRow ? Number(paidCommissionRow.total) : 0;
    const totalExpenses = expensesRow ? Number(expensesRow.total) : 0;
    const netBalance = totalPaidCommission - totalExpenses;

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mKey = d.toISOString().slice(0, 7);
      const mName = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      const commRow = await queryGet(`
        SELECT COALESCE(SUM(commission_total), 0) as total 
        FROM orders 
        WHERE user_id = ? AND status = 'pago' AND order_date LIKE ?
      `, [userId, `${mKey}%`]);

      const expRow = await queryGet(`
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM expenses 
        WHERE user_id = ? AND expense_date LIKE ?
      `, [userId, `${mKey}%`]);

      const cTotal = commRow ? Number(commRow.total) : 0;
      const eTotal = expRow ? Number(expRow.total) : 0;

      monthlyTrend.push({
        monthKey: mKey,
        monthLabel: mName,
        commission: cTotal,
        expense: eTotal,
        net: cTotal - eTotal
      });
    }

    return sendJson(res, 200, {
      currentMonth,
      paidCommission: totalPaidCommission,
      piecesSold: paidCommissionRow ? Number(paidCommissionRow.pieces) : 0,
      pendingCommission: pendingCommissionRow ? Number(pendingCommissionRow.total) : 0,
      pendingCount: pendingCommissionRow ? Number(pendingCommissionRow.count) : 0,
      overdueCommission: overdueCommissionRow ? Number(overdueCommissionRow.total) : 0,
      overdueCount: overdueCommissionRow ? Number(overdueCommissionRow.count) : 0,
      totalExpenses: totalExpenses,
      expensesCount: expensesRow ? Number(expensesRow.count) : 0,
      netBalance: netBalance,
      attentionOrders: attentionOrders.map(formatOrderRow),
      monthlyTrend
    });
  }

  // 2. Sales Dashboard: GET /api/dashboard/sales
  if (pathname === '/api/dashboard/sales' && req.method === 'GET') {
    const currentMonth = searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const topClients = await queryAll(`
      SELECT 
        client_name, 
        COUNT(*) as total_orders, 
        SUM(quantity) as total_pieces, 
        SUM(CASE WHEN status = 'pago' THEN commission_total ELSE 0 END) as paid_commission,
        SUM(commission_total) as total_commission
      FROM orders 
      WHERE user_id = ? AND order_date LIKE ?
      GROUP BY client_name 
      ORDER BY total_pieces DESC, total_commission DESC 
      LIMIT 10
    `, [userId, `${currentMonth}%`]);

    // Breakdown by item type accounting for multi-item arrays
    const allOrders = await queryAll("SELECT items_json, item_type, quantity, commission_total FROM orders WHERE user_id = ? AND order_date LIKE ?", [userId, `${currentMonth}%`]);
    const typeMap = {};
    for (const ord of allOrders) {
      const formatted = formatOrderRow(ord);
      for (const it of formatted.items) {
        const t = it.item_type || 'outro';
        if (!typeMap[t]) {
          typeMap[t] = { item_type: t, orders_count: 0, pieces_count: 0, total_commission: 0 };
        }
        typeMap[t].pieces_count += it.quantity;
        typeMap[t].total_commission += it.commission_total;
      }
    }
    const itemsByType = Object.values(typeMap);

    const statusBreakdown = await queryAll(`
      SELECT 
        status, 
        COUNT(*) as count, 
        SUM(quantity) as pieces, 
        SUM(commission_total) as total 
      FROM orders 
      WHERE user_id = ? AND order_date LIKE ?
      GROUP BY status
    `, [userId, `${currentMonth}%`]);

    return sendJson(res, 200, {
      topClients,
      itemsByType,
      statusBreakdown
    });
  }

  // 3. Expenses Dashboard: GET /api/dashboard/expenses
  if (pathname === '/api/dashboard/expenses' && req.method === 'GET') {
    const currentMonth = searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const byCategory = await queryAll(`
      SELECT 
        c.id, 
        c.name, 
        c.color, 
        COALESCE(SUM(e.amount), 0) as total, 
        COUNT(e.id) as count 
      FROM categories c 
      LEFT JOIN expenses e ON e.category_id = c.id AND e.user_id = ? AND e.expense_date LIKE ?
      WHERE c.user_id = ?
      GROUP BY c.id, c.name, c.color 
      HAVING total > 0
      ORDER BY total DESC
    `, [userId, `${currentMonth}%`, userId]);

    return sendJson(res, 200, {
      byCategory
    });
  }

  return false;
}

module.exports = { handleDashboardRoutes };
