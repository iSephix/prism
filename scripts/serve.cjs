// SPDX-License-Identifier: Apache-2.0
// Local reference-demo server; no application backend or writable endpoints.
'use strict';
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const root = fs.realpathSync(path.join(__dirname, '..')),
  port = Number(process.env.PRISM19_PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PRISM19_PORT must be 1–65535.');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8'
};
const allowed = new Set(['experiments', 'examples', 'dist', 'spec', 'docs', 'LICENSE', 'NOTICE', 'THIRD_PARTY.md',
  'README.md'
]);
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  if (req.url === '/') {
    res.writeHead(302, {
      Location: '/examples/'
    });
    res.end();
    return;
  }
  try {
    const decoded = decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
      relative = decoded === '/' ? 'examples/index.html' : decoded.replace(/^\/+/, ''),
      parts = relative.split('/');
    if (parts.some(p => p === '..' || p.startsWith('.') || p.includes('\\')) || !allowed.has(parts[0]))
      throw Error('Not found');
    let file = path.resolve(root, relative);
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    file = fs.realpathSync(file);
    if (!file.startsWith(root + path.sep)) throw Error('Not found');
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(self)'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(
  `Prism 19 demo: http://localhost:${port}/examples/\nPhone cameras require an HTTPS host; this server binds to localhost.`
  ));
