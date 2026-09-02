const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const logger = require('../utils/logger');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

// Fail-Fast: Require cloud database credentials in production environment
if (isProduction && (!tursoUrl || !tursoToken)) {
  logger.error('FATAL: Em ambiente de produção (NODE_ENV=production), as variáveis TURSO_DATABASE_URL e TURSO_AUTH_TOKEN são obrigatórias!');
  process.exit(1);
}

let dbUrl = tursoUrl;
let authToken = tursoToken;

if (!dbUrl) {
  const dataDir = path.join(__dirname, '..', '..', 'dados');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  dbUrl = `file:${path.join(dataDir, 'banco.db')}`;
}

logger.info(`Conectando ao banco de dados: ${dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://') ? 'Turso Cloud (' + dbUrl.split('@').pop() + ')' : 'Local LibSQL (' + dbUrl + ')'}`);

const db = createClient({
  url: dbUrl,
  authToken: authToken
});

async function queryAll(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return rs.rows;
}

async function queryGet(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return rs.rows[0] || null;
}

async function queryRun(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return {
    lastInsertRowid: rs.lastInsertRowid ? Number(rs.lastInsertRowid) : null,
    rowsAffected: rs.rowsAffected
  };
}

function formatOrderRow(order) {
  if (!order) return null;
  let items = [];
  try {
    if (order.items_json && typeof order.items_json === 'string' && order.items_json.trim()) {
      items = JSON.parse(order.items_json);
    }
  } catch (e) {}
  if (!Array.isArray(items) || items.length === 0) {
    items = [{
      item_type: order.item_type || 'tenis',
      items_desc: order.items_desc || '',
      quantity: Number(order.quantity) || 1,
      commission_unit: Number(order.commission_unit) || 0,
      commission_total: Number(order.commission_total) || 0
    }];
  }
  let deliveryData = {};
  try {
    if (order.delivery_json && typeof order.delivery_json === 'string' && order.delivery_json.trim()) {
      deliveryData = JSON.parse(order.delivery_json);
    } else if (typeof order.delivery_json === 'object' && order.delivery_json !== null) {
      deliveryData = order.delivery_json;
    }
  } catch (e) {}

  return {
    ...order,
    quantity: Number(order.quantity) || 1,
    commission_unit: Number(order.commission_unit) || 0,
    commission_total: Number(order.commission_total) || 0,
    delivery_method: order.delivery_method || 'correios',
    delivery_data: deliveryData,
    items
  };
}

module.exports = {
  db,
  queryAll,
  queryGet,
  queryRun,
  formatOrderRow
};
