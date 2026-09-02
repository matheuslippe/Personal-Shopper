const { queryAll, queryGet, queryRun } = require('../db/client');
const { sendJson, sendError, parseJsonBody } = require('../utils/http');

async function handleExpenseRoutes(pathname, req, res, session, searchParams) {
  const userId = session.user_id;

  // List Expenses: GET /api/expenses
  if (pathname === '/api/expenses' && req.method === 'GET') {
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const month = searchParams.get('month');

    let query = `
      SELECT e.*, c.name as category_name, c.color as category_color 
      FROM expenses e 
      JOIN categories c ON e.category_id = c.id 
      WHERE e.user_id = ?
    `;
    const params = [userId];

    if (categoryId && categoryId !== 'todas') {
      query += " AND e.category_id = ?";
      params.push(parseInt(categoryId, 10));
    }
    if (search) {
      query += " AND e.description LIKE ?";
      params.push(`%${search}%`);
    }
    if (startDate) {
      query += " AND e.expense_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND e.expense_date <= ?";
      params.push(endDate);
    }
    if (month) {
      query += " AND e.expense_date LIKE ?";
      params.push(`${month}%`);
    }

    query += " ORDER BY e.expense_date DESC, e.id DESC";
    const expenses = await queryAll(query, params);
    return sendJson(res, 200, expenses);
  }

  // Single Expense
  const expenseIdMatch = pathname.match(/^\/api\/expenses\/(\d+)$/);
  if (expenseIdMatch) {
    const id = parseInt(expenseIdMatch[1], 10);

    if (req.method === 'GET') {
      const expense = await queryGet(`
        SELECT e.*, c.name as category_name, c.color as category_color 
        FROM expenses e 
        JOIN categories c ON e.category_id = c.id 
        WHERE e.id = ? AND e.user_id = ?
      `, [id, userId]);
      if (!expense) return sendError(res, 404, 'Despesa não encontrada.');
      return sendJson(res, 200, expense);
    }

    if (req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const { category_id, description, amount, expense_date } = body;

      if (!category_id || !description || amount === undefined || !expense_date) {
        return sendError(res, 400, 'Preencha todos os campos da despesa.');
      }

      const now = new Date().toISOString();
      await queryRun(`
        UPDATE expenses 
        SET category_id = ?, description = ?, amount = ?, expense_date = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `, [
        parseInt(category_id, 10),
        description.trim(),
        parseFloat(amount),
        expense_date,
        now,
        id,
        userId
      ]);

      const updated = await queryGet(`
        SELECT e.*, c.name as category_name, c.color as category_color 
        FROM expenses e 
        JOIN categories c ON e.category_id = c.id 
        WHERE e.id = ? AND e.user_id = ?
      `, [id, userId]);
      return sendJson(res, 200, updated);
    }

    if (req.method === 'DELETE') {
      await queryRun("DELETE FROM expenses WHERE id = ? AND user_id = ?", [id, userId]);
      return sendJson(res, 200, { message: 'Despesa excluída com sucesso!' });
    }
  }

  // Create Expense: POST /api/expenses
  if (pathname === '/api/expenses' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const { category_id, description, amount, expense_date } = body;

    if (!category_id || !description || amount === undefined || !expense_date) {
      return sendError(res, 400, 'Preencha todos os campos da despesa.');
    }

    const now = new Date().toISOString();
    const result = await queryRun(`
      INSERT INTO expenses (user_id, category_id, description, amount, expense_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      parseInt(category_id, 10),
      description.trim(),
      parseFloat(amount),
      expense_date,
      now,
      now
    ]);

    const newExp = await queryGet(`
      SELECT e.*, c.name as category_name, c.color as category_color 
      FROM expenses e 
      JOIN categories c ON e.category_id = c.id 
      WHERE e.id = ? AND e.user_id = ?
    `, [result.lastInsertRowid, userId]);
    return sendJson(res, 201, newExp);
  }

  return false;
}

module.exports = { handleExpenseRoutes };
