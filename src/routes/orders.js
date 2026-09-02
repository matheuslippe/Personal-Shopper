const { queryAll, queryGet, queryRun, formatOrderRow } = require('../db/client');
const { sendJson, sendError, parseJsonBody } = require('../utils/http');

async function handleOrderRoutes(pathname, req, res, session, searchParams) {
  const userId = session.user_id;

  // List Orders: GET /api/orders
  if (pathname === '/api/orders' && req.method === 'GET') {
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const supplier = searchParams.get('supplier');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const month = searchParams.get('month'); // YYYY-MM
    const page = parseInt(searchParams.get('page'), 10) || null;
    const limit = parseInt(searchParams.get('limit'), 10) || null;

    let query = "SELECT * FROM orders WHERE user_id = ?";
    const params = [userId];

    if (status && status !== 'todos') {
      query += " AND status = ?";
      params.push(status);
    }
    if (search) {
      query += " AND (client_name LIKE ? OR items_desc LIKE ? OR notes LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (supplier) {
      query += " AND supplier LIKE ?";
      params.push(`%${supplier}%`);
    }
    if (startDate) {
      query += " AND order_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND order_date <= ?";
      params.push(endDate);
    }
    if (month) {
      query += " AND order_date LIKE ?";
      params.push(`${month}%`);
    }

    query += " ORDER BY order_date DESC, id DESC";

    if (page && limit && limit > 0) {
      const offset = (page - 1) * limit;
      query += ` LIMIT ${limit} OFFSET ${offset}`;
    }

    const rawOrders = await queryAll(query, params);
    const orders = rawOrders.map(formatOrderRow);
    return sendJson(res, 200, orders);
  }

  // Single Order / Status / CRUD
  const orderIdMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (orderIdMatch) {
    const id = parseInt(orderIdMatch[1], 10);

    if (req.method === 'GET') {
      const order = await queryGet("SELECT * FROM orders WHERE id = ? AND user_id = ?", [id, userId]);
      if (!order) return sendError(res, 404, 'Pedido não encontrado.');
      return sendJson(res, 200, formatOrderRow(order));
    }

    if (req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const { client_name, supplier, order_date, payment_date, status, notes } = body;

      let parsedItems = [];
      if (Array.isArray(body.items) && body.items.length > 0) {
        parsedItems = body.items.map(it => {
          const q = Math.max(1, parseInt(it.quantity, 10) || 1);
          const u = Math.max(0, parseFloat(it.commission_unit) || 0);
          return {
            item_type: it.item_type || 'tenis',
            items_desc: (it.items_desc || '').trim(),
            quantity: q,
            commission_unit: u,
            commission_total: q * u
          };
        }).filter(it => it.items_desc.length > 0);
      }

      if (parsedItems.length === 0 && (body.items_desc || '').trim()) {
        const q = Math.max(1, parseInt(body.quantity, 10) || 1);
        const u = Math.max(0, parseFloat(body.commission_unit) || 0);
        parsedItems = [{
          item_type: body.item_type || 'tenis',
          items_desc: (body.items_desc || '').trim(),
          quantity: q,
          commission_unit: u,
          commission_total: q * u
        }];
      }

      if (!client_name || parsedItems.length === 0 || !order_date || !status) {
        return sendError(res, 400, 'Preencha o nome do cliente, data, status e pelo menos uma peça com descrição.');
      }

      const totalQty = parsedItems.reduce((acc, it) => acc + it.quantity, 0);
      const totalComm = parsedItems.reduce((acc, it) => acc + it.commission_total, 0);
      const avgCommUnit = totalQty > 0 ? (totalComm / totalQty) : 0;
      const summaryDesc = parsedItems.map(it => `${it.quantity}x ${it.items_desc}`).join(' + ');
      const distinctTypes = [...new Set(parsedItems.map(it => it.item_type))];
      const mainType = distinctTypes.length === 1 ? distinctTypes[0] : (distinctTypes[0] || 'outro');
      const itemsJsonStr = JSON.stringify(parsedItems);

      const now = new Date().toISOString();
      let pDate = payment_date || null;
      if (status === 'pago' && !pDate) {
        pDate = new Date().toISOString().split('T')[0];
      } else if (status !== 'pago' && !payment_date) {
        pDate = null;
      }

      const clientUser = await queryGet("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))", [client_name.trim()]);
      const client_user_id = clientUser ? clientUser.id : null;

      const sDate = body.scheduled_date || order_date || null;
      const sPeriod = body.scheduled_period || 'Manhã (06h às 14h)';
      const aStatus = body.acceptance_status || 'agendado';
      const delMethod = body.delivery_method || 'correios';
      const delJson = typeof body.delivery_data === 'object' ? JSON.stringify(body.delivery_data) : (body.delivery_json || '{}');

      await queryRun(`
        UPDATE orders 
        SET client_user_id = ?, client_name = ?, supplier = ?, items_desc = ?, item_type = ?, quantity = ?, commission_unit = ?, commission_total = ?, order_date = ?, payment_date = ?, status = ?, notes = ?, items_json = ?, scheduled_date = ?, scheduled_period = ?, acceptance_status = ?, delivery_method = ?, delivery_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `, [
        client_user_id,
        client_name.trim(),
        (supplier || '').trim(),
        summaryDesc,
        mainType,
        totalQty,
        avgCommUnit,
        totalComm,
        order_date,
        pDate,
        status,
        (notes || '').trim(),
        itemsJsonStr,
        sDate,
        sPeriod,
        aStatus,
        delMethod,
        delJson,
        now,
        id,
        userId
      ]);

      const updated = await queryGet("SELECT * FROM orders WHERE id = ? AND user_id = ?", [id, userId]);
      return sendJson(res, 200, formatOrderRow(updated));
    }

    if (req.method === 'DELETE') {
      await queryRun("DELETE FROM orders WHERE id = ? AND user_id = ?", [id, userId]);
      return sendJson(res, 200, { message: 'Pedido excluído com sucesso!' });
    }
  }

  // Quick Status Toggle: PATCH /api/orders/:id/status
  const orderStatusMatch = pathname.match(/^\/api\/orders\/(\d+)\/status$/);
  if (orderStatusMatch && req.method === 'PATCH') {
    const id = parseInt(orderStatusMatch[1], 10);
    const body = await parseJsonBody(req);
    const { status, payment_date } = body;

    if (!['pendente', 'atrasado', 'pago'].includes(status)) {
      return sendError(res, 400, 'Status inválido.');
    }

    const now = new Date().toISOString();
    let pDate = payment_date;
    if (status === 'pago' && !pDate) {
      pDate = new Date().toISOString().split('T')[0];
    } else if (status !== 'pago' && pDate === undefined) {
      pDate = null;
    }

    await queryRun(`
      UPDATE orders 
      SET status = ?, payment_date = ?, updated_at = ? 
      WHERE id = ? AND user_id = ?
    `, [status, pDate, now, id, userId]);

    const updated = await queryGet("SELECT * FROM orders WHERE id = ? AND user_id = ?", [id, userId]);
    return sendJson(res, 200, formatOrderRow(updated));
  }

  // Create Order: POST /api/orders
  if (pathname === '/api/orders' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const { client_name, supplier, order_date, payment_date, status, notes } = body;

    let parsedItems = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      parsedItems = body.items.map(it => {
        const q = Math.max(1, parseInt(it.quantity, 10) || 1);
        const u = Math.max(0, parseFloat(it.commission_unit) || 0);
        return {
          item_type: it.item_type || 'tenis',
          items_desc: (it.items_desc || '').trim(),
          quantity: q,
          commission_unit: u,
          commission_total: q * u
        };
      }).filter(it => it.items_desc.length > 0);
    }

    if (parsedItems.length === 0 && (body.items_desc || '').trim()) {
      const q = Math.max(1, parseInt(body.quantity, 10) || 1);
      const u = Math.max(0, parseFloat(body.commission_unit) || 0);
      parsedItems = [{
        item_type: body.item_type || 'tenis',
        items_desc: (body.items_desc || '').trim(),
        quantity: q,
        commission_unit: u,
        commission_total: q * u
      }];
    }

    if (!client_name || parsedItems.length === 0 || !order_date || !status) {
      return sendError(res, 400, 'Preencha o nome do cliente, data, status e pelo menos uma peça com descrição.');
    }

    const totalQty = parsedItems.reduce((acc, it) => acc + it.quantity, 0);
    const totalComm = parsedItems.reduce((acc, it) => acc + it.commission_total, 0);
    const avgCommUnit = totalQty > 0 ? (totalComm / totalQty) : 0;
    const summaryDesc = parsedItems.map(it => `${it.quantity}x ${it.items_desc}`).join(' + ');
    const distinctTypes = [...new Set(parsedItems.map(it => it.item_type))];
    const mainType = distinctTypes.length === 1 ? distinctTypes[0] : (distinctTypes[0] || 'outro');
    const itemsJsonStr = JSON.stringify(parsedItems);

    const now = new Date().toISOString();
    let pDate = payment_date || null;
    if (status === 'pago' && !pDate) {
      pDate = new Date().toISOString().split('T')[0];
    }

    const tracking_code = 'TRK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const clientUser = await queryGet("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))", [client_name.trim()]);
    const client_user_id = clientUser ? clientUser.id : null;

    const sDate = body.scheduled_date || order_date || null;
    const sPeriod = body.scheduled_period || 'Manhã (06h às 14h)';
    const aStatus = body.acceptance_status || 'agendado';
    const delMethod = body.delivery_method || 'correios';
    const delJson = typeof body.delivery_data === 'object' ? JSON.stringify(body.delivery_data) : (body.delivery_json || '{}');

    const result = await queryRun(`
      INSERT INTO orders (user_id, client_user_id, client_name, supplier, items_desc, item_type, quantity, commission_unit, commission_total, order_date, payment_date, status, notes, items_json, tracking_code, scheduled_date, scheduled_period, acceptance_status, delivery_method, delivery_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      client_user_id,
      client_name.trim(),
      (supplier || '').trim(),
      summaryDesc,
      mainType,
      totalQty,
      avgCommUnit,
      totalComm,
      order_date,
      pDate,
      status,
      (notes || '').trim(),
      itemsJsonStr,
      tracking_code,
      sDate,
      sPeriod,
      aStatus,
      delMethod,
      delJson,
      now,
      now
    ]);

    const newOrder = await queryGet("SELECT * FROM orders WHERE id = ? AND user_id = ?", [result.lastInsertRowid, userId]);
    return sendJson(res, 201, formatOrderRow(newOrder));
  }

  return false;
}

module.exports = { handleOrderRoutes };
