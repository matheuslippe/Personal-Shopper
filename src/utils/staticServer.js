const path = require('path');
const fs = require('fs');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

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

function serveStaticFile(pathname, res) {
  const normalized = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const relative = normalized === '/' || normalized === '\\' ? 'index.html' : normalized.replace(/^[\\\/]+/, '');
  let filePath = path.resolve(PUBLIC_DIR, relative);

  // Strict boundary check: ensure resolved path is inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Acesso Negado');
  }

  // Fallback to index.html for SPA routing
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
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Arquivo não encontrado');
  }
}

module.exports = {
  serveStaticFile
};
