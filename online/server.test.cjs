const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { CHARACTERS, COLORS } = require('./dist/engine.cjs');
const { createRoomServer } = require('./server.cjs');
const { roomFetch } = require('./entrances.cjs');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
async function stop(server) {
  if (!server.listening) return;
  const closed = once(server, 'close');
  server.close();
  await closed;
}

test('two HTTP entrances share the room, replay lost writes and survive restart', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'manager-rooms-'));
  const database = join(folder, 'rooms.sqlite');
  let server = createRoomServer({ database, allowedOrigins: ['https://game.example.test'] });
  let origin = await listen(server);
  let loseResponse = false;
  const primary = createServer(async (req, res) => {
    const headers = { 'Content-Type': 'application/json' };
    for (const key of ['authorization', 'idempotency-key']) if (req.headers[key]) headers[key] = req.headers[key];
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const reply = await fetch(origin + req.url, { method: req.method, headers,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const body = await reply.text();
    if (loseResponse) { loseResponse = false; res.destroy(); return; }
    res.writeHead(reply.status, headers).end(body);
  });
  const primaryUrl = await listen(primary);
  t.after(async () => { await stop(primary); await stop(server); rmSync(folder, { recursive: true, force: true }); });
  const p0 = { name: 'Хост', character: CHARACTERS[0].id, color: COLORS[0].id };
  const p1 = { name: 'Гость', character: CHARACTERS[1].id, color: COLORS[1].id };

  const call = async (base, path, body, token, status = 200, send = fetch) => {
    const response = await send(base + '/api/rooms' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(),
        ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, status, result.error);
    return result;
  };
  const via = (local, backup) => (path, options) =>
    roomFetch(path, options, [backup], (target, opts) => fetch(target.startsWith('/') ? local + target : target, opts));
  const fallback = via('http://127.0.0.1:1', origin);
  const withPrimary = via(primaryUrl, origin);

  loseResponse = true;
  const host = await call('', '', { ...p0, mode: 'private', capacity: 2 }, null, 201, withPrimary);
  const room = '/' + host.room.code;
  const invite = await call(primaryUrl, room + '/invite', {}, host.token);
  await call('', room + '/join', p1, null, 403, fallback);
  const guest = await call('', room + '/join', { ...p1, invite: invite.invitation }, null, 200, fallback);
  assert.equal(guest.room.code, host.room.code);
  assert.equal(guest.room.seats.length, 2);
  await call('', room + '/ready', { ready: true }, guest.token, 200, fallback);
  const begun = await call(primaryUrl, room + '/start', {}, host.token);
  const who = begun.room.game.players[begun.room.game.current].id === 'p0' ? host : guest;
  const other = who === host ? guest : host;
  const command = { method: 'roll', args: [[99,99]], requestId: crypto.randomUUID(),
    gameRevision: begun.room.gameRevision };
  await call(origin, room + '/action', command, other.token, 403);
  loseResponse = true;
  const confirmed = await call('', room + '/action', command, who.token, 200, withPrimary);
  assert.equal(confirmed.room.game.rolls, 1);
  assert.ok(confirmed.room.game.lastDice.every(die => die >= 1 && die <= 6));
  assert.equal((await call(origin, room + '/action', command, who.token)).room.game.rolls, 1);
  const seen = await call('', room, undefined, guest.token, 200, fallback);
  assert.deepEqual(seen.room.game, confirmed.room.game);
  await stop(server);
  server = createRoomServer({ database, allowedOrigins: ['https://game.example.test'] });
  origin = await listen(server);
  const resumed = await call(origin, room, undefined, guest.token);
  assert.equal(resumed.room.gameRevision, confirmed.room.gameRevision);
  assert.deepEqual(resumed.room.game, confirmed.room.game);
  const nextMethod = { purchase: 'buy', end: 'endTurn', event: 'confirmCard' }[resumed.room.game.phase];
  if (nextMethod) {
    const advanced = await call(origin, room + '/action', {
      method: nextMethod, args: [], requestId: crypto.randomUUID(), gameRevision: resumed.room.gameRevision,
    }, who.token);
    assert.equal(advanced.room.gameRevision, resumed.room.gameRevision + 1);
    assert.deepEqual((await call(origin, room, undefined, guest.token)).room.game, advanced.room.game);
  }
  const cors = await fetch(origin + '/api/rooms', { method: 'OPTIONS', headers: { Origin: 'https://game.example.test' } });
  assert.equal(cors.status, 204);
  assert.equal(cors.headers.get('access-control-allow-origin'), 'https://game.example.test');
  assert.match(await (await fetch(origin)).text(), /Тест онлайн/);
  assert.equal((await fetch(origin + '/dist/engine.cjs')).status, 404);
});
