function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Max 1MB body limit
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Corpo da requisição excede o limite máximo permitido (1MB).'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Formato JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = {
  sendJson,
  sendError,
  parseJsonBody
};
