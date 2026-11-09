const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { createRoomServer } = require('./server.cjs');
const { game, land, players, MatchEngine, buildingAvailability, buildingStock, validMatch, resetRoomClock } = require('./construction-fixture.cjs');

for (const profile of ['original', 'balanced']) test(profile + ': purchase, revisits, even construction, enterprise', () => {
  const state = game(profile);
  const match = new MatchEngine(state);
  land(state, 1);
  match.buy();
  assert.throws(() => match.build(1), /повторно/);
  land(state, 1);
  match.build(1);
  assert.throws(() => match.build(1), /уже строили/);
  for (const id of [2, 4]) {
    land(state, id);
    match.buy();
  }
  land(state, 1);
  assert.throws(() => match.build(1), /Пуэбла.*Мехико/);
  for (const [level, ids] of [[1, [2, 4]], [2, [1, 2, 4]], [3, [1, 2, 4]]]) {
    for (const id of ids) {
      land(state, id);
      const balance = state.players[0].balance;
      match.build(id);
      assert.equal(state.properties[id].level, level);
      assert.equal(state.players[0].balance, balance - 5000);
      assert.ok(validMatch(JSON.parse(JSON.stringify(state))));
    }
    if (level === 2) {
      land(state, 1);
      assert.throws(() => match.build(4), /повторно/);
    }
  }
  assert.equal(buildingStock(state).branches, 19);
  for (const id of [1, 2, 4]) {
    land(state, id);
    assert.equal(buildingAvailability(state, id).next, 4);
    match.build(id);
    assert.equal(state.properties[id].level, 4);
  }
  assert.deepEqual(buildingStock(state), { branches: 28, enterprises: 9 });
  land(state, 1);
  assert.throws(() => match.build(1), /уже построено/);
  assert.ok(validMatch(state));
});

test('server charges once per visit and preserves levels 2, 3 and 4 for both participants', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'manager-construction-'));
  const database = join(folder, 'rooms.sqlite');
  const server = createRoomServer({ database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const db = new DatabaseSync(database);
  t.after(async () => { db.close(); const closed = once(server, 'close'); server.close(); await closed; rmSync(folder, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/rooms';
  async function call(path, body, token, status = 200) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { 'Idempotency-Key': crypto.randomUUID(), ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body && { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, status, result.error);
    return result;
  }
  const host = await call('', players[0], null, 201);
  const path = '/' + host.room.code;
  const guest = await call(path + '/join', players[1]);
  await call(path + '/ready', { ready: true }, guest.token);
  await call(path + '/start', {}, host.token);
  const stored = () => JSON.parse(db.prepare('SELECT data FROM online_rooms WHERE code = ?').get(host.room.code).data);
  const initial = stored();
  initial.game = game();
  initial.game.gameMode = 'online';
  for (const id of [1, 2, 4]) Object.assign(initial.game.properties[id], { owner: 'p0', level: 1 });

  for (const level of [2, 3, 4]) {
    const room = level === 2 ? initial : stored();
    for (const id of [2, 4]) room.game.properties[id].level = level - 1;
    land(room.game, 1);
    resetRoomClock(room, Date.now());
    db.prepare('UPDATE online_rooms SET data = ? WHERE code = ?').run(JSON.stringify(room), host.room.code);
    const command = { method: 'build', args: [1], requestId: crypto.randomUUID(), gameRevision: room.gameRevision };
    await call(path + '/action', command, guest.token, 403);
    const built = (await call(path + '/action', command, host.token)).room;
    assert.equal(built.game.properties[1].level, level);
    assert.equal(built.game.players[0].balance, room.game.players[0].balance - 5000);
    await call(path + '/action', { ...command, requestId: crypto.randomUUID(), gameRevision: built.gameRevision }, host.token, 400);
    await call(path + '/action', command, host.token);
    assert.deepEqual((await call(path, undefined, guest.token)).room.game, built.game);
  }
});
