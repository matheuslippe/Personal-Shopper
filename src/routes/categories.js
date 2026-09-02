const { queryAll, queryGet, queryRun } = require('../db/client');
const { seedUserDefaults } = require('../db/migrations');
const { sendJson, sendError, parseJsonBody } = require('../utils/http');

async function handleCategoryRoutes(pathname, req, res, session) {
  const userId = session.user_id;

  // List / Create Categories
  if (pathname === '/api/categories') {
    if (req.method === 'GET') {
      await seedUserDefaults(userId);
      const categories = await queryAll("SELECT * FROM categories WHERE user_id = ? ORDER BY is_default DESC, name ASC", [userId]);
      return sendJson(res, 200, categories);
    }
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { name, color } = body;

      if (!name || !color) {
        return sendError(res, 400, 'Nome e cor da categoria são obrigatórios.');
      }

      const existing = await queryGet("SELECT * FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)", [userId, name.trim()]);
      if (existing) {
        return sendError(res, 400, 'Já existe uma categoria com esse nome.');
      }

      const now = new Date().toISOString();
      const result = await queryRun(
        "INSERT INTO categories (user_id, name, color, is_default, created_at) VALUES (?, ?, ?, 0, ?)",
        [userId, name.trim(), color.trim(), now]
      );

      const newCat = await queryGet("SELECT * FROM categories WHERE id = ? AND user_id = ?", [result.lastInsertRowid, userId]);
      return sendJson(res, 201, newCat);
    }
  }

  // Single Category (Edit / Delete)
  const catIdMatch = pathname.match(/^\/api\/categories\/(\d+)$/);
  if (catIdMatch) {
    const id = parseInt(catIdMatch[1], 10);

    if (req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const { name, color } = body;
      if (!name || !color) return sendError(res, 400, 'Nome e cor são obrigatórios.');

      await queryRun("UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?", [name.trim(), color.trim(), id, userId]);
      const updated = await queryGet("SELECT * FROM categories WHERE id = ? AND user_id = ?", [id, userId]);
      return sendJson(res, 200, updated);
    }

    if (req.method === 'DELETE') {
      const used = await queryGet("SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND user_id = ?", [id, userId]);
      if (used && Number(used.count) > 0) {
        return sendError(res, 400, `Não é possível excluir esta categoria pois ela possui ${used.count} despesa(s) vinculada(s).`);
      }
      await queryRun("DELETE FROM categories WHERE id = ? AND user_id = ?", [id, userId]);
      return sendJson(res, 200, { message: 'Categoria excluída com sucesso!' });
    }
  }

  return false;
}

module.exports = { handleCategoryRoutes };
