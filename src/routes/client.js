const { queryAll, queryGet, queryRun, formatOrderRow } = require('../db/client');
const { sendJson, sendError, parseJsonBody } = require('../utils/http');
const { findNextAvailableScheduleDate } = require('./schedule');

function generateTrackingCode() {
  return 'TRK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function handleClientRoutes(pathname, req, res, session, searchParams) {
  // 1. PUBLIC: Order Tracking by Code (GET /api/tracking/:code)
  const trackMatch = pathname.match(/^\/api\/tracking\/([A-Za-z0-9\-]+)$/);
  if (trackMatch && req.method === 'GET') {
    const code = trackMatch[1].toUpperCase();
    const order = await queryGet("SELECT * FROM orders WHERE UPPER(tracking_code) = ?", [code]);
    if (!order) {
      return sendError(res, 404, 'Pedido não encontrado com este código de rastreio.');
    }

    // Fetch Assessor Pix Settings
    const assessorId = order.user_id || 1;
    const assessorUser = await queryGet("SELECT username FROM users WHERE id = ?", [assessorId]);
    const pixRows = await queryAll("SELECT key, value FROM settings WHERE user_id = ? AND key IN ('pix_key', 'pix_name', 'pix_type')", [assessorId]);
    const pixSettings = {};
    pixRows.forEach(r => { pixSettings[r.key] = r.value; });

    const formattedOrder = formatOrderRow(order);

    return sendJson(res, 200, {
      order: {
        id: formattedOrder.id,
        tracking_code: formattedOrder.tracking_code,
        client_name: formattedOrder.client_name,
        supplier: formattedOrder.supplier,
        items: formattedOrder.items,
        quantity: formattedOrder.quantity,
        commission_total: formattedOrder.commission_total,
        order_date: formattedOrder.order_date,
        payment_date: formattedOrder.payment_date,
        status: formattedOrder.status,
        scheduled_date: formattedOrder.scheduled_date,
        scheduled_period: formattedOrder.scheduled_period,
        acceptance_status: formattedOrder.acceptance_status,
        delivery_method: formattedOrder.delivery_method,
        delivery_data: formattedOrder.delivery_data,
        notes: formattedOrder.notes
      },
      assessor: {
        id: assessorId,
        name: assessorUser ? assessorUser.username : 'Assessor',
        pix_key: pixSettings.pix_key || '',
        pix_name: pixSettings.pix_name || '',
        pix_type: pixSettings.pix_type || 'Chave Pix'
      }
    });
  }

  // Protected Client Portal Routes (Requires active session)
  if (!session) return false;

  // 2. Client Orders List: GET /api/client/orders
  if (pathname === '/api/client/orders' && req.method === 'GET') {
    const rawOrders = await queryAll(`
      SELECT o.*, u.username as assessor_name 
      FROM orders o 
      LEFT JOIN users u ON o.user_id = u.id 
      WHERE o.client_user_id = ? OR LOWER(TRIM(o.client_name)) = LOWER(TRIM(?))
      ORDER BY o.order_date DESC, o.id DESC
    `, [session.user_id, session.username]);

    const assessorIds = [...new Set(rawOrders.map(o => o.user_id).filter(Boolean))];
    const pixMap = {};
    for (const aId of assessorIds) {
      const pixRows = await queryAll("SELECT key, value FROM settings WHERE user_id = ? AND key IN ('pix_key', 'pix_name', 'pix_type')", [aId]);
      pixMap[aId] = {};
      pixRows.forEach(r => { pixMap[aId][r.key] = r.value; });
    }

    const formattedOrders = rawOrders.map(o => {
      const formatted = formatOrderRow(o);
      const assPix = pixMap[o.user_id] || {};
      formatted.assessor_id = o.user_id;
      formatted.assessor_name = o.assessor_name || 'Assessor';
      formatted.pix_key = assPix.pix_key || '';
      formatted.pix_name = assPix.pix_name || '';
      formatted.pix_type = assPix.pix_type || 'Chave Pix';
      return formatted;
    });

    return sendJson(res, 200, formattedOrders);
  }

  // 3. Client Submit Purchase Request: POST /api/client/request
  if (pathname === '/api/client/request' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const { items, supplier, notes, assessor_id, delivery_method, delivery_data, save_as_default } = body;

    let parsedItems = [];
    if (Array.isArray(items) && items.length > 0) {
      parsedItems = items.map(it => ({
        item_type: it.item_type || 'tenis',
        items_desc: (it.items_desc || '').trim(),
        quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
        commission_unit: 10,
        commission_total: (Math.max(1, parseInt(it.quantity, 10) || 1)) * 10
      })).filter(it => it.items_desc.length > 0);
    }

    if (parsedItems.length === 0) {
      return sendError(res, 400, 'Adicione pelo menos uma peça com descrição para fazer o pedido.');
    }

    // Determine target assessor
    const user = await queryGet("SELECT assessor_id FROM users WHERE id = ?", [session.user_id]);
    let targetAssessorId = assessor_id ? parseInt(assessor_id, 10) : (user && user.assessor_id ? user.assessor_id : 1);

    // Verify assessor exists, fallback to first available assessor
    const targetAssessor = await queryGet("SELECT id FROM users WHERE id = ? AND role = 'assessor'", [targetAssessorId]);
    if (!targetAssessor) {
      const firstAssessor = await queryGet("SELECT id FROM users WHERE role = 'assessor' ORDER BY id ASC LIMIT 1");
      targetAssessorId = firstAssessor ? firstAssessor.id : 1;
    }

    // Get default commission rate for this assessor
    const commSetting = await queryGet("SELECT value FROM settings WHERE user_id = ? AND key = 'default_commission'", [targetAssessorId]);
    const commUnit = commSetting ? parseFloat(commSetting.value) || 10 : 10;

    // Recalculate with assessor rate
    parsedItems = parsedItems.map(it => ({
      ...it,
      commission_unit: commUnit,
      commission_total: it.quantity * commUnit
    }));

    const totalQty = parsedItems.reduce((acc, it) => acc + it.quantity, 0);
    const totalComm = parsedItems.reduce((acc, it) => acc + it.commission_total, 0);
    const summaryDesc = parsedItems.map(it => `${it.quantity}x ${it.items_desc}`).join(' + ');
    const distinctTypes = [...new Set(parsedItems.map(it => it.item_type))];
    const mainType = distinctTypes.length === 1 ? distinctTypes[0] : (distinctTypes[0] || 'outro');
    const itemsJsonStr = JSON.stringify(parsedItems);

    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    const trackingCode = generateTrackingCode();

    // Check assessor schedule mode
    const modeSetting = await queryGet("SELECT value FROM settings WHERE user_id = ? AND key = 'schedule_mode'", [targetAssessorId]);
    const periodSetting = await queryGet("SELECT value FROM settings WHERE user_id = ? AND key = 'schedule_period_name'", [targetAssessorId]);
    const scheduleMode = modeSetting ? modeSetting.value : 'manual';
    const scheduledPeriod = periodSetting ? periodSetting.value : 'Manhã (06h às 14h)';

    let scheduledDate = null;
    let acceptanceStatus = 'aguardando_aceite';

    if (scheduleMode === 'automatico') {
      scheduledDate = await findNextAvailableScheduleDate(targetAssessorId);
      acceptanceStatus = 'agendado';
    }

    const delMethod = delivery_method || 'correios';
    const delJson = JSON.stringify(delivery_data || {});

    // Save as default if requested
    if (save_as_default) {
      await queryRun("UPDATE users SET default_delivery_method = ?, default_delivery_json = ? WHERE id = ?", [delMethod, delJson, session.user_id]);
    }

    const result = await queryRun(`
      INSERT INTO orders (user_id, client_user_id, client_name, supplier, items_desc, item_type, quantity, commission_unit, commission_total, order_date, payment_date, status, notes, items_json, tracking_code, scheduled_date, scheduled_period, acceptance_status, delivery_method, delivery_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      targetAssessorId,
      session.user_id,
      session.username,
      (supplier || '').trim(),
      summaryDesc,
      mainType,
      totalQty,
      commUnit,
      totalComm,
      todayStr,
      null,
      (notes || '').trim(),
      itemsJsonStr,
      trackingCode,
      scheduledDate,
      scheduledPeriod,
      acceptanceStatus,
      delMethod,
      delJson,
      now,
      now
    ]);

    const newOrder = await queryGet("SELECT * FROM orders WHERE id = ?", [result.lastInsertRowid]);
    return sendJson(res, 201, {
      order: formatOrderRow(newOrder),
      message: acceptanceStatus === 'agendado' 
        ? `Solicitação enviada e agendada automaticamente para ${scheduledDate}!` 
        : 'Solicitação de assessoria enviada com sucesso! O assessor irá confirmar a data de compras em breve.'
    });
  }

  // 4. Client Delivery Profile: GET /api/client/delivery-profile
  if (pathname === '/api/client/delivery-profile' && req.method === 'GET') {
    const user = await queryGet("SELECT default_delivery_method, default_delivery_json FROM users WHERE id = ?", [session.user_id]);
    let delData = {};
    try {
      if (user && user.default_delivery_json) delData = JSON.parse(user.default_delivery_json);
    } catch (e) {}
    return sendJson(res, 200, {
      delivery_method: user ? (user.default_delivery_method || 'correios') : 'correios',
      delivery_data: delData
    });
  }

  // 5. Client Save Delivery Profile: POST /api/client/delivery-profile
  if (pathname === '/api/client/delivery-profile' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const { delivery_method, delivery_data } = body;
    const delMethod = delivery_method || 'correios';
    const delJson = JSON.stringify(delivery_data || {});
    await queryRun("UPDATE users SET default_delivery_method = ?, default_delivery_json = ? WHERE id = ?", [delMethod, delJson, session.user_id]);
    return sendJson(res, 200, {
      delivery_method: delMethod,
      delivery_data: delivery_data || {},
      message: 'Endereço e padrão de entrega salvos com sucesso!'
    });
  }

  // 6. Assessor Info & Pix for Client: GET /api/client/assessor-info
  if (pathname === '/api/client/assessor-info' && req.method === 'GET') {
    let targetAssessorId = searchParams ? (parseInt(searchParams.get('assessor_id'), 10) || parseInt(searchParams.get('user_id'), 10)) : null;
    
    if (!targetAssessorId) {
      const user = await queryGet("SELECT assessor_id FROM users WHERE id = ?", [session.user_id]);
      targetAssessorId = user && user.assessor_id ? user.assessor_id : 1;
    }

    const assessorUser = await queryGet("SELECT id, username FROM users WHERE id = ?", [targetAssessorId]);
    const pixRows = await queryAll("SELECT key, value FROM settings WHERE user_id = ? AND key IN ('pix_key', 'pix_name', 'pix_type')", [targetAssessorId]);
    const pixSettings = {};
    pixRows.forEach(r => { pixSettings[r.key] = r.value; });

    return sendJson(res, 200, {
      assessor: {
        id: targetAssessorId,
        username: assessorUser ? assessorUser.username : 'Assessor Principal',
        pix_key: pixSettings.pix_key || '',
        pix_name: pixSettings.pix_name || '',
        pix_type: pixSettings.pix_type || 'Chave Pix'
      }
    });
  }

  // 5. List All Available Assessors: GET /api/client/assessors
  if (pathname === '/api/client/assessors' && req.method === 'GET') {
    const assessors = await queryAll(`
      SELECT u.id, u.username, s.value as default_commission 
      FROM users u 
      LEFT JOIN settings s ON u.id = s.user_id AND s.key = 'default_commission'
      WHERE u.role = 'assessor' OR u.role IS NULL
      ORDER BY u.id ASC
    `);

    return sendJson(res, 200, assessors.map(a => ({
      id: a.id,
      username: a.username,
      default_commission: parseFloat(a.default_commission) || 10
    })));
  }

  return false;
}

module.exports = { handleClientRoutes, generateTrackingCode };
