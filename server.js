/**
 * Sistema de Assessoria de Compras & Financeiro Pessoal
 * Backend REST API & Static Server com Turso (SQLite Cloud via @libsql/client)
 */

require('dotenv').config();
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- DATABASE INITIALIZATION (TURSO CLOUD / LOCAL LIBSQL) ---
const DATA_DIR = path.join(__dirname, 'dados');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Read database credentials from environment variables (Render / .env)
const dbUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(DATA_DIR, 'banco.db')}`;
const dbAuthToken = process.env.TURSO_AUTH_TOKEN || undefined;

const db = createClient({
  url: dbUrl,
  authToken: dbAuthToken
});

console.log(`🔌 Conectando ao banco de dados: ${dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://') ? 'Turso Cloud (' + dbUrl.split('@').pop() + ')' : 'Local LibSQL (' + dbUrl + ')'}`);

// Database Query Helpers
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
  return {
    ...order,
    quantity: Number(order.quantity) || 1,
    commission_unit: Number(order.commission_unit) || 0,
    commission_total: Number(order.commission_total) || 0,
    items
  };
}

// --- PASSWORD & CRYPTO HELPERS ---
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const checkHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return checkHash === hash;
}

async function seedUserDefaults(userId) {
  if (!userId) return;
  // Seed default categories if user has none
  const cats = await queryAll("SELECT id FROM categories WHERE user_id = ?", [userId]);
  if (cats.length === 0) {
    const defaultCategories = [
      { name: 'Alimentação', color: '#f97316' },
      { name: 'Investimento', color: '#10b981' },
      { name: 'Banheiro', color: '#06b6d4' },
      { name: 'Transporte', color: '#6366f1' },
      { name: 'Outros', color: '#8b5cf6' }
    ];
    for (const cat of defaultCategories) {
      await queryRun(
        "INSERT INTO categories (user_id, name, color, is_default, created_at) VALUES (?, ?, ?, 1, ?)",
        [userId, cat.name, cat.color, new Date().toISOString()]
      );
    }
  }

  // Seed default settings if user has none
  const setting = await queryGet("SELECT value FROM settings WHERE user_id = ? AND key = 'default_commission'", [userId]);
  if (!setting) {
    await queryRun(
      "INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, 'default_commission', '10.00', ?)",
      [userId, new Date().toISOString()]
    );
  }
}

// Initialize tables and default seed data
async function initDatabase() {
  // Create tables if not exist
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      client_name TEXT NOT NULL,
      supplier TEXT DEFAULT '',
      items_desc TEXT NOT NULL,
      item_type TEXT NOT NULL, -- 'tenis', 'roupa', 'blusa', 'outro'
      quantity INTEGER NOT NULL DEFAULT 1,
      commission_unit REAL NOT NULL,
      commission_total REAL NOT NULL,
      order_date TEXT NOT NULL, -- YYYY-MM-DD
      payment_date TEXT, -- YYYY-MM-DD
      status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'atrasado', 'pago'
      notes TEXT DEFAULT '',
      items_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL, -- YYYY-MM-DD
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE RESTRICT
    )
  `);

  // Run migrations for existing databases to ensure user_id is present
  try { await db.execute("ALTER TABLE orders ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN items_json TEXT DEFAULT '[]'"); } catch (e) {}
  try { await db.execute("ALTER TABLE expenses ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  // Check if settings table in existing SQLite has old global PRIMARY KEY on key and migrate if needed
  try {
    const tableInfo = await queryGet("SELECT sql FROM sqlite_master WHERE type='table' AND name='settings'");
    if (tableInfo && tableInfo.sql && tableInfo.sql.includes('key TEXT PRIMARY KEY')) {
      await db.execute('PRAGMA foreign_keys = OFF;');
      await db.execute('DROP TABLE IF EXISTS settings_v2;');
      await db.execute(`
        CREATE TABLE settings_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`INSERT OR IGNORE INTO settings_v2 (user_id, key, value, updated_at) SELECT COALESCE(user_id, 1), key, value, updated_at FROM settings`);
      await db.execute(`DROP TABLE settings`);
      await db.execute(`ALTER TABLE settings_v2 RENAME TO settings`);
      await db.execute('PRAGMA foreign_keys = ON;');
      console.log('✔ Tabela settings migrada para multi-tenant!');
    } else {
      try { await db.execute("ALTER TABLE settings ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
    }
  } catch (err) {
    try { await db.execute("ALTER TABLE settings ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  }

  // Check if categories table in existing SQLite has old global UNIQUE(name) constraint and migrate if needed
  try {
    const tableInfo = await queryGet("SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'");
    if (tableInfo && tableInfo.sql && tableInfo.sql.includes('name TEXT UNIQUE')) {
      await db.execute('PRAGMA foreign_keys = OFF;');
      await db.execute('DROP TABLE IF EXISTS categories_v2;');
      await db.execute(`
        CREATE TABLE categories_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute(`INSERT OR IGNORE INTO categories_v2 (id, user_id, name, color, is_default, created_at) SELECT id, COALESCE(user_id, 1), name, color, is_default, created_at FROM categories`);
      await db.execute(`DROP TABLE categories`);
      await db.execute(`ALTER TABLE categories_v2 RENAME TO categories`);
      await db.execute('PRAGMA foreign_keys = ON;');
      console.log('✔ Tabela categories migrada para multi-tenant!');
    } else {
      try { await db.execute("ALTER TABLE categories ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
    }
  } catch (err) {
    try { await db.execute("ALTER TABLE categories ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  }

  // Ensure default admin user: admin / admin123
  let adminUser = await queryGet("SELECT * FROM users WHERE username = ?", ['admin']);
  if (!adminUser) {
    const { hash, salt } = hashPassword('admin123');
    const now = new Date().toISOString();
    const res = await queryRun(
      "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
      ['admin', hash, salt, now]
    );
    adminUser = { id: res.lastInsertRowid, username: 'admin' };
    console.log('✔ Usuário padrão criado: admin / admin123');
  }

  // Seed default categories and settings for admin
  await seedUserDefaults(adminUser.id);

  // Seed sample initial data if database has no orders
  const orderCountRow = await queryGet("SELECT COUNT(*) as count FROM orders");
  const orderCount = orderCountRow ? Number(orderCountRow.count) : 0;
  if (orderCount === 0) {
    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];
    
    const d0 = new Date(today);
    const d1 = new Date(today); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(today); d2.setDate(d2.getDate() - 3);
    const d3 = new Date(today); d3.setDate(d3.getDate() - 5);
    const d4 = new Date(today); d4.setDate(d4.getDate() - 8);

    const sampleOrders = [
      { client: 'Carlos Silva', supplier: 'Atacado Brás SP', desc: 'Tênis Nike Air Force Branco (tam 41)', type: 'tenis', qty: 2, unit: 10, total: 20, oDate: formatDate(d0), pDate: formatDate(d0), status: 'pago', notes: 'Cliente pagou via Pix comissão e produtos' },
      { client: 'Mariana Costa', supplier: 'Confecções Sul', desc: 'Blusa Moletom Oversized Bege + Calça Cargo', type: 'blusa', qty: 3, unit: 10, total: 30, oDate: formatDate(d1), pDate: null, status: 'atrasado', notes: 'Cliente já pagou fornecedor, cobrando a comissão' },
      { client: 'Lucas Oliveira', supplier: 'Import Tênis SP', desc: 'Tênis Adidas Forum Low (tam 40)', type: 'tenis', qty: 1, unit: 10, total: 10, oDate: formatDate(d2), pDate: null, status: 'pendente', notes: 'Aguardando confirmação do cliente' },
      { client: 'Fernanda Lima', supplier: 'Moda Streetwear', desc: 'Conjunto Roupas Fitness + Camisetas Dry Fit', type: 'roupa', qty: 5, unit: 10, total: 50, oDate: formatDate(d3), pDate: formatDate(d3), status: 'pago', notes: 'Entregue com sucesso' },
      { client: 'Carlos Silva', supplier: 'Atacado Brás SP', desc: 'Camisetas Básicas Algodão Pima', type: 'roupa', qty: 4, unit: 10, total: 40, oDate: formatDate(d4), pDate: formatDate(d4), status: 'pago', notes: 'Cliente recorrente' }
    ];

    for (const o of sampleOrders) {
      const now = new Date().toISOString();
      await queryRun(`
        INSERT INTO orders (client_name, supplier, items_desc, item_type, quantity, commission_unit, commission_total, order_date, payment_date, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [o.client, o.supplier, o.desc, o.type, o.qty, o.unit, o.total, o.oDate, o.pDate, o.status, o.notes, now, now]);
    }

    // Sample expenses
    const catAlim = await queryGet("SELECT id FROM categories WHERE name = 'Alimentação'");
    const catBanh = await queryGet("SELECT id FROM categories WHERE name = 'Banheiro'");
    const catTrans = await queryGet("SELECT id FROM categories WHERE name = 'Transporte'");

    if (catAlim) {
      await queryRun(
        "INSERT INTO expenses (category_id, description, amount, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [catAlim.id, 'Almoço no Centro / Brás', 28.50, formatDate(d0), new Date().toISOString(), new Date().toISOString()]
      );
    }
    if (catBanh) {
      await queryRun(
        "INSERT INTO expenses (category_id, description, amount, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [catBanh.id, 'Uso de Banheiro Shopping/Ponto', 3.50, formatDate(d0), new Date().toISOString(), new Date().toISOString()]
      );
    }
    if (catTrans) {
      await queryRun(
        "INSERT INTO expenses (category_id, description, amount, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [catTrans.id, 'Passagem de Metrô / Ônibus', 8.80, formatDate(d1), new Date().toISOString(), new Date().toISOString()]
      );
    }
    console.log('✔ Dados de exemplo inicial sincronizados com o banco.');
  }
}

// --- HTTP SERVER & ROUTING HELPERS ---
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { // 2MB max
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

async function authenticate(req) {
  const authHeader = req.headers['authorization'] || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['cookie']) {
    const cookies = req.headers['cookie'].split(';').reduce((acc, str) => {
      const [k, v] = str.trim().split('=');
      acc[k] = v;
      return acc;
    }, {});
    token = cookies['auth_token'];
  }

  if (!token) return null;

  const session = await queryGet(`
    SELECT s.*, u.username, u.id as user_id 
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `, [token]);

  return session || null;
}

// MIME types for static server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// --- MAIN SERVER DISPATCHER ---
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  try {
    // --- AUTHENTICATION ROUTES (PUBLIC) ---
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { username, password, confirmPassword } = body;

      if (!username || !password) {
        return sendError(res, 400, 'Informe usuário e senha para cadastro.');
      }

      const cleanUsername = username.trim();
      if (cleanUsername.length < 3) {
        return sendError(res, 400, 'O nome de usuário deve ter no mínimo 3 caracteres.');
      }

      if (password.length < 4) {
        return sendError(res, 400, 'A senha deve ter no mínimo 4 caracteres.');
      }

      if (confirmPassword !== undefined && password !== confirmPassword) {
        return sendError(res, 400, 'As senhas digitadas não coincidem.');
      }

      const existingUser = await queryGet("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [cleanUsername]);
      if (existingUser) {
        return sendError(res, 400, 'Este nome de usuário já está cadastrado.');
      }

      const { hash, salt } = hashPassword(password);
      const now = new Date().toISOString();
      const insertResult = await queryRun(
        "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
        [cleanUsername, hash, salt, now]
      );

      const userId = insertResult.lastInsertRowid;

      // Seed default categories & settings for the new user
      await seedUserDefaults(userId);

      // Create session valid for 30 days
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await queryRun(
        "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        [token, userId, expiresAt, now]
      );

      return sendJson(res, 201, {
        token,
        user: { id: userId, username: cleanUsername },
        message: 'Conta criada com sucesso!'
      });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { username, password } = body;

      if (!username || !password) {
        return sendError(res, 400, 'Informe usuário e senha.');
      }

      const user = await queryGet("SELECT * FROM users WHERE username = ?", [username.trim()]);
      if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
        return sendError(res, 401, 'Usuário ou senha incorretos.');
      }

      // Ensure user defaults exist
      await seedUserDefaults(user.id);

      // Create session valid for 30 days
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      await queryRun(
        "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        [token, user.id, expiresAt, now]
      );

      return sendJson(res, 200, {
        token,
        user: { id: user.id, username: user.username },
        message: 'Login realizado com sucesso!'
      });
    }

    // --- PROTECTED API ENDPOINTS CHECK ---
    if (pathname.startsWith('/api/')) {
      const session = await authenticate(req);
      if (!session && pathname !== '/api/auth/check-status') {
        return sendError(res, 401, 'Sessão expirada ou não autenticado.');
      }

      const userId = session.user_id;

      // Check auth status
      if (pathname === '/api/auth/me' && req.method === 'GET') {
        return sendJson(res, 200, { user: { id: session.user_id, username: session.username } });
      }

      // Logout
      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (token) {
          await queryRun("DELETE FROM sessions WHERE token = ?", [token]);
        }
        return sendJson(res, 200, { message: 'Desconectado com sucesso.' });
      }

      // Change Password
      if (pathname === '/api/auth/change-password' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword || newPassword.length < 4) {
          return sendError(res, 400, 'A nova senha deve ter pelo menos 4 caracteres.');
        }

        const user = await queryGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!verifyPassword(currentPassword, user.salt, user.password_hash)) {
          return sendError(res, 400, 'Senha atual incorreta.');
        }

        const { hash, salt } = hashPassword(newPassword);
        await queryRun("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", [hash, salt, userId]);
        return sendJson(res, 200, { message: 'Senha atualizada com sucesso!' });
      }

      // Settings GET / POST (isolated by user_id)
      if (pathname === '/api/settings') {
        if (req.method === 'GET') {
          const rows = await queryAll("SELECT key, value FROM settings WHERE user_id = ?", [userId]);
          const settings = {};
          rows.forEach(r => settings[r.key] = r.value);
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
          rows.forEach(r => settings[r.key] = r.value);
          return sendJson(res, 200, settings);
        }
      }

      // --- ORDERS (VENDAS / ASSESSORIAS) CRUD (isolated by user_id) ---
      if (pathname === '/api/orders' && req.method === 'GET') {
        const status = searchParams.get('status');
        const search = searchParams.get('search');
        const supplier = searchParams.get('supplier');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const month = searchParams.get('month'); // YYYY-MM

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
        const rawOrders = await queryAll(query, params);
        const orders = rawOrders.map(formatOrderRow);
        return sendJson(res, 200, orders);
      }

      // Single Order
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

          await queryRun(`
            UPDATE orders 
            SET client_name = ?, supplier = ?, items_desc = ?, item_type = ?, quantity = ?, commission_unit = ?, commission_total = ?, order_date = ?, payment_date = ?, status = ?, notes = ?, items_json = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
          `, [
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

      // Create Order
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

        const result = await queryRun(`
          INSERT INTO orders (user_id, client_name, supplier, items_desc, item_type, quantity, commission_unit, commission_total, order_date, payment_date, status, notes, items_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          userId,
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
          now,
          now
        ]);

        const newOrder = await queryGet("SELECT * FROM orders WHERE id = ? AND user_id = ?", [result.lastInsertRowid, userId]);
        return sendJson(res, 201, formatOrderRow(newOrder));
      }

      // --- CATEGORIES CRUD (isolated by user_id) ---
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

      // --- EXPENSES (FINANCEIRO PESSOAL) CRUD (isolated by user_id) ---
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

      // --- DASHBOARDS ANALYTICS & CONSOLIDATED METRICS (isolated by user_id) ---
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

        const itemsByType = await queryAll(`
          SELECT 
            item_type, 
            COUNT(*) as orders_count, 
            SUM(quantity) as pieces_count, 
            SUM(commission_total) as total_commission 
          FROM orders 
          WHERE user_id = ? AND order_date LIKE ?
          GROUP BY item_type
        `, [userId, `${currentMonth}%`]);

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

      // Export Backup (JSON - isolated by user_id)
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

      // Export Orders CSV (isolated by user_id)
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

      // Export Expenses CSV (isolated by user_id)
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

      return sendError(res, 404, 'Endpoint não encontrado.');
    }

    // --- STATIC FILES SERVING ---
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Acesso Negado');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      return res.end(content);
    } else {
      res.writeHead(404);
      return res.end('Arquivo não encontrado');
    }

  } catch (err) {
    console.error('Server error:', err);
    sendError(res, 500, 'Erro interno do servidor: ' + err.message);
  }
});

// Initialize database and start server
initDatabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` 🚀 Sistema de Assessoria & Financeiro Pessoal Ativo!`);
    console.log(` 🌐 Acesse: http://localhost:${PORT}`);
    console.log(` 👤 Usuário padrão: admin | Senha: admin123`);
    console.log(`=======================================================`);
  });
}).catch(err => {
  console.error('❌ Falha ao inicializar banco de dados:', err);
  process.exit(1);
});
