const { queryAll, queryGet, queryRun } = require('../db/client');
const { sendJson, parseJsonBody } = require('../utils/http');

async function handleSettingsRoutes(pathname, req, res, session) {
  const userId = session.user_id;

  if (pathname === '/api/settings') {
    if (req.method === 'GET') {
      const rows = await queryAll("SELECT key, value FROM settings WHERE user_id = ?", [userId]);
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      if (!settings.default_commission) settings.default_commission = '10.00';
      return sendJson(res, 200, settings);
    }
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const now = new Date().toISOString();
      for (const [key, value] of Object.entries(body)) {
        const existing = await queryGet("SELECT id FROM settings WHERE user_id = ? AND key = ?", [userId, key]);
        if (existing) {
          await queryRun("UPDATE settings SET value = ?, updated_at = ? WHERE id = ?", [String(value), now, existing.id]);
        } else {
          await queryRun("INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)", [userId, key, String(value), now]);
        }
      }
      const rows = await queryAll("SELECT key, value FROM settings WHERE user_id = ?", [userId]);
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      return sendJson(res, 200, settings);
    }
  }

  return false;
}

module.exports = { handleSettingsRoutes };
