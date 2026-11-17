'use strict';
// Servidor local para probar la página en tu PC: `npm start` → http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/state');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/state') return handler(req, res);

  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) {
    res.statusCode = 403;
    return res.end('Prohibido');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      return res.end('No encontrado');
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`🎁 Amigo Invisible en http://localhost:${PORT}`));
}

module.exports = server;
