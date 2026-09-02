const { db, queryAll, queryGet, queryRun } = require('./client');
const { hashPassword } = require('../utils/crypto');
const logger = require('../utils/logger');

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
  const defaultSettings = [
    { key: 'default_commission', value: '10.00' },
    { key: 'schedule_mode', value: 'manual' }, // 'manual' ou 'automatico'
    { key: 'schedule_daily_limit', value: '4' },
    { key: 'schedule_work_days', value: '1,2,3,4,5' }, // Segunda a Sexta
    { key: 'schedule_period_name', value: 'Manhã (06h às 14h)' }
  ];

  for (const s of defaultSettings) {
    const existing = await queryGet("SELECT value FROM settings WHERE user_id = ? AND key = ?", [userId, s.key]);
    if (!existing) {
      await queryRun(
        "INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)",
        [userId, s.key, s.value, new Date().toISOString()]
      );
    }
  }
}

async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'assessor', -- 'assessor' ou 'cliente'
      assessor_id INTEGER,
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
      client_user_id INTEGER,
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
      tracking_code TEXT,
      scheduled_date TEXT, -- YYYY-MM-DD
      scheduled_period TEXT DEFAULT 'Manhã (06h às 14h)',
      acceptance_status TEXT DEFAULT 'agendado', -- 'aguardando_aceite', 'agendado', 'recusado'
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

  // Run migrations for existing databases
  try { await db.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'assessor'"); } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN assessor_id INTEGER"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN client_user_id INTEGER"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN items_json TEXT DEFAULT '[]'"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN tracking_code TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN scheduled_date TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN scheduled_period TEXT DEFAULT 'Manhã (06h às 14h)'"); } catch (e) {}
  try { await db.execute("ALTER TABLE orders ADD COLUMN acceptance_status TEXT DEFAULT 'agendado'"); } catch (e) {}
  try { await db.execute("ALTER TABLE expenses ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  try { await db.execute("ALTER TABLE settings ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}

  // Backfill tracking codes for existing orders
  try {
    const ordersWithoutTrack = await queryAll("SELECT id FROM orders WHERE tracking_code IS NULL OR tracking_code = ''");
    for (const ord of ordersWithoutTrack) {
      const code = 'TRK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      await queryRun("UPDATE orders SET tracking_code = ? WHERE id = ?", [code, ord.id]);
    }
  } catch (e) {}

  // Check if settings table has old global PRIMARY KEY on key
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
      logger.info('Tabela settings migrada para multi-tenant.');
    }
  } catch (err) {
    try { await db.execute("ALTER TABLE settings ADD COLUMN user_id INTEGER DEFAULT 1"); } catch (e) {}
  }

  // Check if categories table has old global UNIQUE(name) constraint
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
      logger.info('Tabela categories migrada para multi-tenant.');
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
    logger.info('Usuário padrão inicial criado: admin / admin123');
  }

  // Seed default categories and settings for admin
  await seedUserDefaults(adminUser.id);
}

module.exports = {
  initDatabase,
  seedUserDefaults
};
