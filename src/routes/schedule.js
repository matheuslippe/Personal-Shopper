const { queryAll, queryGet, queryRun, formatOrderRow } = require('../db/client');
const { sendJson, sendError, parseJsonBody } = require('../utils/http');

/**
 * Busca a proxima data disponivel na agenda do assessor considerando limite diario e dias de atendimento.
 */
async function findNextAvailableScheduleDate(assessorId) {
  const rows = await queryAll("SELECT key, value FROM settings WHERE user_id = ?", [assessorId]);
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });

  const dailyLimit = Math.max(1, parseInt(settings.schedule_daily_limit, 10) || 4);
  const workDaysStr = settings.schedule_work_days || '1,2,3,4,5'; // 1=Seg, ..., 5=Sex
  const workDays = workDaysStr.split(',').map(d => parseInt(d.trim(), 10));

  const now = new Date();
  for (let i = 1; i <= 30; i++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + i);
    const dayOfWeek = candidate.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab

    if (!workDays.includes(dayOfWeek)) continue;

    const dateStr = candidate.toISOString().split('T')[0];
    const countRow = await queryGet("SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND scheduled_date = ? AND acceptance_status = 'agendado'", [assessorId, dateStr]);

    const scheduledCount = countRow ? Number(countRow.count) : 0;
    if (scheduledCount < dailyLimit) {
      return dateStr;
    }
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  return fallback.toISOString().split('T')[0];
}

async function handleScheduleRoutes(pathname, req, res, session, searchParams) {
  const userId = session.user_id;

  // 1. Get Schedule Summary & Calendar: GET /api/schedule/summary
  if (pathname === '/api/schedule/summary' && req.method === 'GET') {
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7); // YYYY-MM

    const settingsRows = await queryAll("SELECT key, value FROM settings WHERE user_id = ?", [userId]);
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    const dailyLimit = Math.max(1, parseInt(settings.schedule_daily_limit, 10) || 4);
    const scheduleMode = settings.schedule_mode || 'manual';
    const workDays = settings.schedule_work_days || '1,2,3,4,5';
    const periodName = settings.schedule_period_name || 'Manhã (06h às 14h)';

    const pendingRows = await queryAll("SELECT * FROM orders WHERE user_id = ? AND acceptance_status = 'aguardando_aceite' ORDER BY created_at ASC", [userId]);
    const scheduledRows = await queryAll("SELECT * FROM orders WHERE user_id = ? AND acceptance_status = 'agendado' AND scheduled_date LIKE ? ORDER BY scheduled_date ASC, id ASC", [userId, `${month}%`]);

    const scheduledByDate = {};
    for (const ord of scheduledRows) {
      const d = ord.scheduled_date;
      if (!scheduledByDate[d]) {
        scheduledByDate[d] = {
          date: d,
          limit: dailyLimit,
          orders: []
        };
      }
      scheduledByDate[d].orders.push(formatOrderRow(ord));
    }

    return sendJson(res, 200, {
      month,
      settings: {
        schedule_mode: scheduleMode,
        schedule_daily_limit: dailyLimit,
        schedule_work_days: workDays,
        schedule_period_name: periodName
      },
      pending_acceptance: pendingRows.map(formatOrderRow),
      scheduled_by_date: scheduledByDate
    });
  }

  // 2. Accept & Schedule Order: PATCH /api/orders/:id/accept-schedule
  const acceptMatch = pathname.match(/^\/api\/orders\/(\d+)\/accept-schedule$/);
  if (acceptMatch && req.method === 'PATCH') {
    const orderId = parseInt(acceptMatch[1], 10);
    const body = await parseJsonBody(req);
    const { scheduled_date, scheduled_period } = body;

    if (!scheduled_date) {
      return sendError(res, 400, 'Informe a data para a realização da assessoria.');
    }

    const order = await queryGet("SELECT * FROM orders WHERE id = ? AND user_id = ?", [orderId, userId]);
    if (!order) {
      return sendError(res, 404, 'Pedido não encontrado.');
    }

    const now = new Date().toISOString();
    const period = scheduled_period || 'Manhã (06h às 14h)';

    await queryRun("UPDATE orders SET scheduled_date = ?, scheduled_period = ?, acceptance_status = 'agendado', updated_at = ? WHERE id = ? AND user_id = ?", [scheduled_date, period, now, orderId, userId]);

    const updated = await queryGet("SELECT * FROM orders WHERE id = ?", [orderId]);
    return sendJson(res, 200, {
      order: formatOrderRow(updated),
      message: 'Atendimento aceito e agendado com sucesso!'
    });
  }

  // 3. Save Schedule Settings: POST /api/schedule/settings
  if (pathname === '/api/schedule/settings' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const now = new Date().toISOString();

    const allowedKeys = ['schedule_mode', 'schedule_daily_limit', 'schedule_work_days', 'schedule_period_name'];
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        const val = String(body[key]);
        const existing = await queryGet("SELECT id FROM settings WHERE user_id = ? AND key = ?", [userId, key]);
        if (existing) {
          await queryRun("UPDATE settings SET value = ?, updated_at = ? WHERE id = ?", [val, now, existing.id]);
        } else {
          await queryRun("INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)", [userId, key, val, now]);
        }
      }
    }

    const settingsRows = await queryAll("SELECT key, value FROM settings WHERE user_id = ?", [userId]);
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    return sendJson(res, 200, {
      settings,
      message: 'Configurações de agenda atualizadas com sucesso!'
    });
  }

  return false;
}

module.exports = {
  handleScheduleRoutes,
  findNextAvailableScheduleDate
};