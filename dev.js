// Local dev server — serves the static site and mounts the same api/fetch.js
// handler Vercel runs in production. No vercel CLI needed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import handler from './api/fetch.js';

const ROOT = process.cwd();
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/fetch') return handler(req, res);

  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const filePath = normalize(join(ROOT, rel));
  if (!filePath.startsWith(ROOT + sep)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  try {
    const data = await readFile(filePath);
    res.setHeader('Content-Type', TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(3000, () => console.log('ShareCheck dev server → http://localhost:3000'));
