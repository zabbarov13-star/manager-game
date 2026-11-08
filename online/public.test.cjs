const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { createRoomServer } = require('./server.cjs');
const { CHARACTERS, COLORS } = require('./dist/engine.cjs');
const player = i => ({ name: 'Игрок ' + i, character: CHARACTERS[i].id, color: COLORS[i].id });

test('public directory, private invitation, concurrent joins and stable seat IDs', async t => {
  const server = createRoomServer({ database: ':memory:' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(done => server.close(done)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/rooms';
  async function call(path, body, token, status = 200) {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { 'Idempotency-Key': crypto.randomUUID(), ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    assert.equal(r.status, status, data.error);
    return data;
  }
  const [open, closed] = await Promise.all([
    call('', { ...player(0), mode: 'public', title: 'Вечер', capacity: 3 }, null, 201),
    call('', { ...player(0), mode: 'private', capacity: 2 }, null, 201),
  ]);
  const path = '/' + open.room.code;
  assert.notEqual(open.room.code, closed.room.code);
  assert.deepEqual((await call('/PUBLIC')).rooms, [{ code: open.room.code, title: 'Вечер', count: 1, capacity: 3 }]);
  await call('/' + closed.room.code + '/join', player(1), null, 403);
  const first = await call(path + '/join', player(1));
  const second = await call(path + '/join', player(2));
  assert.deepEqual((await call('/PUBLIC')).rooms, []);
  await call(path + '/leave', {}, first.token);
  await call(path, undefined, first.token, 401);
  await call(path + '/join', { ...player(3), name: player(2).name.toUpperCase() }, null, 409);
  await call(path + '/ready', { ready: true }, second.token);
  const started = await call(path + '/start', {}, open.token);
  assert.deepEqual(started.room.game.players.map(x => x.id), ['p0', 'p2']);
  await call(path + '/leave', {}, second.token, 409);
  await call(path + '/join', player(3), null, 400);
  const actor = started.room.game.players[started.room.game.current].id === second.seatId ? second : open;
  await call(path + '/action', { method: 'roll', args: [], requestId: crypto.randomUUID(), gameRevision: started.room.gameRevision }, actor.token);
  assert.equal((await call(path, undefined, second.token)).room.game.rolls, 1);
  assert.equal((await call('/' + closed.room.code, undefined, closed.token)).room.game, null);
  assert.deepEqual((await call('/PUBLIC')).rooms, []);
  const race = await call('', { ...player(0), mode: 'public', capacity: 2 }, null, 201);
  const replies = await Promise.all([1, 2].map(async i => {
    const response = await fetch(base + '/' + race.room.code + '/join', {
      method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(player(i)),
    });
    await response.text();
    return response.status;
  }));
  assert.deepEqual(replies.sort(), [200, 400]);
  for (let i = 0; i < 5; i++) await call('', player(0), null, 201);
  await call('', player(0), null, 429);
});
