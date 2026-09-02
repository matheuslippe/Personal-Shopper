const { queryGet, queryRun } = require('../db/client');
const { seedUserDefaults } = require('../db/migrations');
const { hashPassword, verifyPassword, generateSessionToken } = require('../utils/crypto');
const { sendJson, sendError, parseJsonBody } = require('../utils/http');
const { checkRateLimit, clearRateLimit } = require('../middleware/security');

async function handleAuthRoutes(pathname, req, res, session) {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  // 1. Register: POST /api/auth/register
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1');
    if (!isLocal && process.env.NODE_ENV === 'production') {
      const rateCheck = checkRateLimit(`register_${clientIp}`, 20, 5 * 60 * 1000);
      if (!rateCheck.allowed) {
        return sendError(res, 429, `Muitas tentativas de cadastro. Tente novamente em ${rateCheck.retryAfterSeconds} segundos.`);
      }
    }

    const body = await parseJsonBody(req);
    const { username, password, confirmPassword, role, assessor_id } = body;

    if (!username || !password) {
      return sendError(res, 400, 'Informe usuário e senha para cadastro.');
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      return sendError(res, 400, 'O nome de usuário deve ter no mínimo 3 caracteres.');
    }

    if (password.length < 6) {
      return sendError(res, 400, 'A senha deve ter no mínimo 6 caracteres.');
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return sendError(res, 400, 'As senhas digitadas não coincidem.');
    }

    const existingUser = await queryGet("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [cleanUsername]);
    if (existingUser) {
      return sendError(res, 400, 'Este nome de usuário já está cadastrado. Escolha outro nome.');
    }

    const userRole = (role === 'cliente') ? 'cliente' : 'assessor';
    let assessorIdVal = assessor_id ? parseInt(assessor_id, 10) : null;
    if (userRole === 'cliente' && !assessorIdVal) {
      const firstAssessor = await queryGet("SELECT id FROM users WHERE role = 'assessor' ORDER BY id ASC LIMIT 1");
      assessorIdVal = firstAssessor ? firstAssessor.id : 1;
    }

    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();
    const insertResult = await queryRun(
      "INSERT INTO users (username, password_hash, salt, role, assessor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [cleanUsername, hash, salt, userRole, assessorIdVal, now]
    );

    const userId = insertResult.lastInsertRowid;
    if (userRole === 'assessor') {
      await seedUserDefaults(userId);
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await queryRun(
      "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [token, userId, expiresAt, now]
    );

    clearRateLimit(`register_${clientIp}`);

    return sendJson(res, 201, {
      token,
      user: { id: userId, username: cleanUsername, role: userRole, assessor_id: assessorIdVal },
      message: 'Conta criada com sucesso!'
    });
  }

  // 2. Login: POST /api/auth/login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const { username, password } = body;

    if (!username || !password) {
      return sendError(res, 400, 'Informe usuário e senha.');
    }

    const rateKey = `login_${clientIp}_${username.trim().toLowerCase()}`;
    const rateCheck = checkRateLimit(rateKey, 5, 5 * 60 * 1000);
    if (!rateCheck.allowed) {
      return sendError(res, 429, `Muitas tentativas de login incorretas. Tente novamente em ${rateCheck.retryAfterSeconds} segundos.`);
    }

    const user = await queryGet("SELECT * FROM users WHERE username = ?", [username.trim()]);
    if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
      return sendError(res, 401, 'Usuário ou senha incorretos.');
    }

    // Success: clear rate limit key
    clearRateLimit(rateKey);

    const userRole = user.role || 'assessor';
    if (userRole === 'assessor') {
      await seedUserDefaults(user.id);
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await queryRun(
      "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [token, user.id, expiresAt, now]
    );

    return sendJson(res, 200, {
      token,
      user: { id: user.id, username: user.username, role: userRole, assessor_id: user.assessor_id },
      message: 'Login realizado com sucesso!'
    });
  }

  // Protected Auth Endpoints (require active session)
  if (!session) return false;

  // 3. Me: GET /api/auth/me
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await queryGet("SELECT id, username, role, assessor_id FROM users WHERE id = ?", [session.user_id]);
    return sendJson(res, 200, {
      user: {
        id: session.user_id,
        username: session.username,
        role: user ? (user.role || 'assessor') : 'assessor',
        assessor_id: user ? user.assessor_id : null
      }
    });
  }

  // 4. Logout: POST /api/auth/logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
      await queryRun("DELETE FROM sessions WHERE token = ?", [token]);
    }
    return sendJson(res, 200, { message: 'Desconectado com sucesso.' });
  }

  // 5. Change Password: POST /api/auth/change-password
  if (pathname === '/api/auth/change-password' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return sendError(res, 400, 'A nova senha deve ter pelo menos 8 caracteres.');
    }

    const user = await queryGet("SELECT * FROM users WHERE id = ?", [session.user_id]);
    if (!verifyPassword(currentPassword, user.salt, user.password_hash)) {
      return sendError(res, 400, 'Senha atual incorreta.');
    }

    const { hash, salt } = hashPassword(newPassword);
    await queryRun("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", [hash, salt, session.user_id]);
    return sendJson(res, 200, { message: 'Senha atualizada com sucesso!' });
  }

  return false;
}

module.exports = { handleAuthRoutes };
