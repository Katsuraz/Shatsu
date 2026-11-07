import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, RoomStore } from './lib/rooms.js';
import { searchYoutube } from './lib/catalog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Content-Type must be application/json');
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 16000) throw new HttpError(413, 'Payload too large'); }
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

export function createShatsuServer({ store = new RoomStore(), searchCatalog = searchYoutube } = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com https://img.youtube.com https://i.scdn.co; connect-src 'self' https://accounts.spotify.com https://api.spotify.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') return respond(res, 200, { ok: true, name: 'Shatsu', version: '0.3.0' });
      if (url.pathname === '/api/config' && req.method === 'GET') return respond(res, 200, { spotifyClientId: process.env.SHATSU_SPOTIFY_CLIENT_ID || '' });
      if (url.pathname === '/api/time' && req.method === 'GET') return respond(res, 200, { serverNow: Date.now() });
      if (url.pathname === '/api/search' && req.method === 'GET') {
        const provider = url.searchParams.get('provider') || 'youtube';
        if (provider !== 'youtube') throw new HttpError(400, 'Use Spotify sign-in for Spotify search');
        const tracks = await searchCatalog(url.searchParams.get('q') || '');
        return respond(res, 200, { tracks });
      }
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        const data = await body(req); return respond(res, 201, store.create(data.name));
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{8})(?:\/(join|resume|action|presence|events))?$/i);
      if (match) {
        const code = match[1].toUpperCase(), endpoint = match[2];
        if (endpoint === 'events' && req.method === 'GET') {
          store.get(code); // Validate before sending irreversible SSE headers.
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          const unsubscribe = store.subscribe(code, state => { if (!res.destroyed) res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`); });
          const ping = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n'); }, 20000);
          res.on('close', () => { clearInterval(ping); unsubscribe(); });
          return;
        }
        if (req.method === 'POST') {
          const data = await body(req);
          switch (endpoint) {
            case 'join': return respond(res, 200, store.join(code, data.name));
            case 'resume': return respond(res, 200, store.resume(code, data.token));
            case 'presence': return respond(res, 200, store.touch(code, data.token));
            case 'action': return respond(res, 200, store.action(code, data.token, data));
          }
        }
        throw new HttpError(405, 'Method not allowed');
      }
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'API route not found');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      const requested = decodeURIComponent(url.pathname);
      const filepath = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
      if (filepath !== path.resolve(root) && !filepath.startsWith(path.resolve(root) + path.sep)) throw new HttpError(403, 'Forbidden');
      let file;
      try { if (!(await stat(filepath)).isFile()) throw new Error('not file'); file = await readFile(filepath); }
      catch { throw new HttpError(404, 'Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(filepath)] || 'application/octet-stream', 'Cache-Control': filepath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
      return res.end(req.method === 'HEAD' ? undefined : file);
    } catch (error) {
      if (!res.headersSent) respond(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
      else res.destroy();
    }
  });
  const cleanInterval = setInterval(() => store.cleanup(), 10 * 60 * 1000);
  cleanInterval.unref();
  server.on('close', () => clearInterval(cleanInterval));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  createShatsuServer().listen(port, host, () => console.log(`Shatsu listening on http://${host}:${port}`));
}
