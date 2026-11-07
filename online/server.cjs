const { createServer } = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { handleRooms } = require('./dist/engine.cjs');

const hash = value => createHash('sha256').update(value).digest('hex');
const keyFor = id => Buffer.from(hash('manager-response-v1:' + id), 'hex');
const json = (error, status) => new Response(JSON.stringify({ error }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
const route = /^\/api\/rooms(?:\/[A-Z2-9]{6}(?:\/(?:join|lobby|invite|appearance|ready|start|action|chat))?)?$/;
const allowedAssets = { '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/manager-icon.png': ['manager-icon.png', 'image/png'] };
const day = 86400000;

function createRoomServer({ database, allowedOrigins = [], journal = 'wal', release }) {
  if (!['wal', 'delete'].includes(journal)) throw Error('Unsupported SQLite journal mode');
  if (database !== ':memory:') mkdirSync(dirname(resolve(database)), { recursive: true, mode: 0o700 });
  const sqlite = new DatabaseSync(database);
  sqlite.exec(`
    PRAGMA journal_mode=${journal.toUpperCase()};
    PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS online_rooms (
      code TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS replay (
      id TEXT PRIMARY KEY, signature TEXT NOT NULL, status INTEGER NOT NULL, sealed TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS replay_expiry ON replay(expires);
  `);
  const DB = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...values) {
      return {
        first: () => statement.get(...values),
        run: () => ({ meta: { changes: Number(statement.run(...values).changes) } }),
        all: () => ({ results: statement.all(...values) }),
      };
    } };
  } };
  const replay = sqlite.prepare('SELECT * FROM replay WHERE id = ?');
  const save = sqlite.prepare('INSERT INTO replay VALUES (?, ?, ?, ?, ?)');
  const purge = sqlite.prepare('DELETE FROM replay WHERE expires <= ?');
  let cleanupAt = 0;
  let queue = Promise.resolve();
  let queued = 0;

  async function transact(request, id, body) {
    const now = Date.now();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      if (now >= cleanupAt) purge.run(now);
      const lookup = id && hash(id);
      const signature = id && hash(JSON.stringify([request.url, request.headers.get('Authorization'), body]));
      const cached = lookup && replay.get(lookup);
      let result;
      if (cached) {
        if (cached.signature !== signature) result = json('Ключ запроса уже использован.', 409);
        else {
          const sealed = Buffer.from(cached.sealed, 'base64');
          const decoder = createDecipheriv('aes-256-gcm', keyFor(id), sealed.subarray(0, 12));
          decoder.setAuthTag(sealed.subarray(12, 28));
          const data = Buffer.concat([decoder.update(sealed.subarray(28)), decoder.final()]);
          result = new Response(data, { status: cached.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
        }
      } else {
        result = await handleRooms(request, { DB });
        if (result.status >= 500) {
          sqlite.exec('ROLLBACK');
          return result;
        }
        if (lookup && result.ok) {
          const nonce = randomBytes(12);
          const encoder = createCipheriv('aes-256-gcm', keyFor(id), nonce);
          const data = Buffer.concat([encoder.update(await result.clone().text(), 'utf8'), encoder.final()]);
          save.run(lookup, signature, result.status,
            Buffer.concat([nonce, encoder.getAuthTag(), data]).toString('base64'), now + day);
        }
      }
      sqlite.exec('COMMIT');
      if (now >= cleanupAt) cleanupAt = now + 60000;
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  async function api(req, pathname) {
    if (!route.test(pathname)) return json('Комната или действие не найдены.', 404);
    if (!['GET', 'POST'].includes(req.method)) return json('Метод не поддерживается.', 405);
    let id, body;
    if (req.method === 'POST') {
      id = req.headers['idempotency-key'];
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return json('Некорректный ключ запроса.', 400);
      }
      const chunks = [];
      let size = 0;
      // Keep the request stream alive long enough to return an HTTP 413.
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 12000) { req.resume(); return json('Запрос слишком большой.', 413); }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    if (queued >= 64) return json('Сервис перегружен. Повторите позже.', 503);
    const request = new Request('https://room.internal' + pathname, {
      method: req.method, headers: { Authorization: req.headers.authorization ?? '' }, body,
    });
    queued++;
    const work = queue.then(() => transact(request, id, body)).finally(() => queued--);
    queue = work.catch(() => {});
    return work;
  }

  const server = createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const { pathname } = new URL(req.url, 'http://room.internal');
      if (pathname.startsWith('/api/')) {
        res.setHeader('Vary', 'Origin');
        if (allowedOrigins.includes(req.headers.origin)) {
          res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
        }
        if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
        const response = await api(req, pathname);
        res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(await response.text());
        return;
      }
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      if (pathname === '/health') {
        sqlite.prepare('SELECT 1').get();
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, ...(release && { release }) }));
        return;
      }
      const asset = Object.hasOwn(allowedAssets, pathname) && allowedAssets[pathname];
      if (!asset) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': asset[1] }).end(readFileSync(resolve(__dirname, 'dist', asset[0])));
    } catch (error) {
      // Leave request bodies, invitation codes and credentials out of logs.
      console.error('ROOM_HTTP_FAILED', error.code ?? 'internal');
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end('{"error":"Игровой сервер временно недоступен."}');
    }
  });
  server.on('close', () => sqlite.close());
  return server;
}

if (require.main === module) {
  process.umask(0o077);
  createRoomServer({
    database: process.env.ROOM_DATABASE ?? 'data/rooms.sqlite',
    journal: process.env.ROOM_JOURNAL ?? 'wal',
    allowedOrigins: (process.env.ROOM_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  }).listen(Number(process.env.PORT ?? 8080), process.env.ROOM_BIND ?? '127.0.0.1');
}
module.exports = { createRoomServer };
