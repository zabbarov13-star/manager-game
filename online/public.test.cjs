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

test('four- and six-player rooms keep independent dice and chat', async t => {
  const server = createRoomServer({ database: ':memory:' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(done => server.close(done)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/rooms';
  async function request(path, body, token, status = 200) {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Idempotency-Key': crypto.randomUUID(), ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, status, result.error);
    return result;
  }

  const rooms = await Promise.all([4, 6].map(async count => {
    const host = await request('', { ...player(0), capacity: count }, null, 201);
    const path = '/' + host.room.code;
    const seats = [host];
    for (let i = 1; i < count; i++) seats.push(await request(path + '/join', player(i)));
    await Promise.all(seats.slice(1).map(seat => request(path + '/ready', { ready: true }, seat.token)));
    const { room } = await request(path + '/start', {}, host.token);
    assert.equal(room.game.players.length, count);
    const actor = seats.find(seat => seat.seatId === room.game.players[room.game.current].id);
    const command = { method: 'roll', args: [], requestId: crypto.randomUUID(), gameRevision: room.gameRevision };
    const rolled = (await request(path + '/action', command, actor.token)).room;
    await request(path + '/chat', { text: 'Стол на ' + count }, host.token);
    return { path, seats, rolled, count };
  }));
  assert.notEqual(rooms[0].path, rooms[1].path);
  for (const { path, seats, rolled, count } of rooms) {
    const views = await Promise.all(seats.map(seat => request(path, undefined, seat.token)));
    for (const { room } of views) {
      assert.deepEqual(room.game.lastDice, rolled.game.lastDice);
      assert.equal(room.game.rolls, 1);
      assert.deepEqual(room.chat.map(message => message.text), ['Стол на ' + count]);
    }
  }
});
