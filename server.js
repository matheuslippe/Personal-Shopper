const http = require('http');
const { initDatabase } = require('./src/db/migrations');
const { authenticate } = require('./src/middleware/auth');
const { applySecurityHeaders } = require('./src/middleware/security');
const { handleAuthRoutes } = require('./src/routes/auth');
const { handleOrderRoutes } = require('./src/routes/orders');
const { handleExpenseRoutes } = require('./src/routes/expenses');
const { handleCategoryRoutes } = require('./src/routes/categories');
const { handleDashboardRoutes } = require('./src/routes/dashboard');
const { handleSettingsRoutes } = require('./src/routes/settings');
const { handleExportRoutes } = require('./src/routes/export');
const { handleClientRoutes } = require('./src/routes/client');
const { serveStaticFile } = require('./src/utils/staticServer');
const { sendError } = require('./src/utils/http');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

// Main HTTP Dispatcher
const server = http.createServer(async (req, res) => {
  // Apply Security Headers & CORS
  applySecurityHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  try {
    // 1. Public Routes: Auth (Register, Login) & Public Tracking (GET /api/tracking/:code)
    const publicAuthHandled = await handleAuthRoutes(pathname, req, res, null);
    if (publicAuthHandled !== false) return;

    const publicClientHandled = await handleClientRoutes(pathname, req, res, null, searchParams);
    if (publicClientHandled !== false) return;

    // 2. Protected API Endpoints
    if (pathname.startsWith('/api/')) {
      const session = await authenticate(req);
      if (!session) {
        return sendError(res, 401, 'Sessão expirada ou não autenticado.');
      }

      // Protected Auth Routes (Me, Logout, Change Password)
      const authHandled = await handleAuthRoutes(pathname, req, res, session);
      if (authHandled !== false) return;

      // Protected Client Portal Routes
      const clientHandled = await handleClientRoutes(pathname, req, res, session, searchParams);
      if (clientHandled !== false) return;

      // Settings Routes
      const settingsHandled = await handleSettingsRoutes(pathname, req, res, session);
      if (settingsHandled !== false) return;

      // Orders Routes
      const ordersHandled = await handleOrderRoutes(pathname, req, res, session, searchParams);
      if (ordersHandled !== false) return;

      // Categories Routes
      const categoriesHandled = await handleCategoryRoutes(pathname, req, res, session);
      if (categoriesHandled !== false) return;

      // Expenses Routes
      const expensesHandled = await handleExpenseRoutes(pathname, req, res, session, searchParams);
      if (expensesHandled !== false) return;

      // Dashboard Analytics Routes
      const dashboardHandled = await handleDashboardRoutes(pathname, req, res, session, searchParams);
      if (dashboardHandled !== false) return;

      // Export Backup & CSVs
      const exportHandled = await handleExportRoutes(pathname, req, res, session);
      if (exportHandled !== false) return;

      return sendError(res, 404, 'Endpoint não encontrado.');
    }

    // 3. Static Files Serving (SPA)
    return serveStaticFile(pathname, res);

  } catch (err) {
    logger.error('Erro no processamento da requisição:', err.message);
    return sendError(res, 500, 'Erro interno do servidor: ' + err.message);
  }
});

// Initialize database schema and start server when run directly
if (require.main === module) {
  initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      logger.info('=======================================================');
      logger.info(' 🚀 Sistema de Assessoria & Financeiro Pessoal Ativo!');
      logger.info(` 🌐 Acesse: http://localhost:${PORT}`);
      logger.info(' 👤 Usuário padrão: admin | Senha: admin123');
      logger.info('=======================================================');
    });
  }).catch(err => {
    logger.error('❌ Falha crítica ao inicializar banco de dados:', err.message);
    process.exit(1);
  });
}

module.exports = server;
