const { queryRun } = require('../db/client');
const logger = require('../utils/logger');

// In-memory sliding window rate limiter: key -> [timestamps]
const rateLimitMap = new Map();

function checkRateLimit(key, maxAttempts = 5, windowMs = 5 * 60 * 1000) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  
  // Filter only attempts within window
  const recent = timestamps.filter(t => now - t < windowMs);
  
  if (recent.length >= maxAttempts) {
    rateLimitMap.set(key, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((recent[0] + windowMs - now) / 1000)
    };
  }
  
  recent.push(now);
  rateLimitMap.set(key, recent);
  return { allowed: true };
}

function clearRateLimit(key) {
  rateLimitMap.delete(key);
}

function applySecurityHeaders(req, res) {
  // CORS configuration (allow same-origin or configured origins)
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Strict Transport Security (HSTS) when on HTTPS
  if (req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; img-src 'self' data: https:; font-src 'self' https: data:; connect-src 'self' https:;"
  );
}

// Clean expired sessions periodically
let lastClean = 0;
async function cleanExpiredSessions() {
  const now = Date.now();
  // Run cleanup at most once every hour
  if (now - lastClean > 60 * 60 * 1000) {
    lastClean = now;
    try {
      const res = await queryRun("DELETE FROM sessions WHERE datetime(expires_at) < datetime('now')");
      if (res.rowsAffected > 0) {
        logger.info(`Limpeza de sessões expiradas: ${res.rowsAffected} removidas.`);
      }
    } catch (err) {
      logger.warn('Aviso na limpeza de sessões:', err.message);
    }
  }
}

module.exports = {
  checkRateLimit,
  clearRateLimit,
  applySecurityHeaders,
  cleanExpiredSessions
};
