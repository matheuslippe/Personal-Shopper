const { queryGet } = require('../db/client');
const { cleanExpiredSessions } = require('./security');

async function authenticate(req) {
  // Trigger non-blocking periodic expired sessions cleanup
  cleanExpiredSessions().catch(() => {});

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

module.exports = {
  authenticate
};
