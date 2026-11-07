const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createServer } = require('node:net');
const { test } = require('node:test');
const { CHARACTERS, COLORS } = require('./dist/engine.cjs');

async function worker(database) {
  const portProbe = createServer().listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const { port } = portProbe.address();
  await new Promise(done => portProbe.close(done));
  const base = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [resolve(__dirname, 'johnny-start.cjs')], {
    env: { ...process.env, PORT: String(port), ROOM_DATABASE: database }, stdio: 'inherit',
  });
  const exited = once(child, 'exit');
  const stop = async () => { if (child.exitCode === null) child.kill(); await exited; };
  try {
    for (let i = 0; i < 30; i++) {
      if (child.exitCode !== null) break;
      try { if ((await fetch(base + '/health')).ok) return { base, stop }; } catch {}
      await new Promise(done => setTimeout(done, 100));
    }
    throw Error('Worker did not listen');
  } catch (error) {
    await stop();
    throw error;
  }
}

test('independent shared-host workers use one database and replay a committed request', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'manager-johnny-'));
  const database = join(folder, 'persistent', 'rooms.sqlite');
  const workers = [];
  t.after(async () => {
    await Promise.all(workers.map(w => w.stop()));
    rmSync(folder, { recursive: true, force: true });
  });
  const host = await worker(database);
  workers.push(host);
  const guest = await worker(database);
  workers.push(guest);
  const id = crypto.randomUUID();
  const body = JSON.stringify({ name: 'Хост', character: CHARACTERS[0].id, color: COLORS[0].id, capacity: 2 });
  const request = { method: 'POST', headers: { 'Idempotency-Key': id }, body };
  const created = await fetch(host.base + '/api/rooms', request);
  assert.equal(created.status, 201);
  const original = await created.json();
  await host.stop();
  const retried = await fetch(guest.base + '/api/rooms', request);
  assert.equal(retried.status, 201);
  assert.deepEqual(await retried.json(), original);
  const response = await fetch(guest.base + '/api/rooms/' + original.room.code + '/join', {
    method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ name: 'Гость', character: CHARACTERS[1].id, color: COLORS[1].id }),
  });
  assert.equal(response.status, 200);
  const joined = await response.json();
  assert.equal(joined.room.code, original.room.code);
  assert.equal(joined.room.seats.length, 2);
  const next = await worker(database);
  workers.push(next);
  const room = await fetch(next.base + '/api/rooms/' + original.room.code, {
    headers: { Authorization: 'Bearer ' + original.token },
  });
  assert.equal(room.status, 200);
  assert.equal((await room.json()).room.seats.length, 2);
  assert.equal((await fetch(next.base + '/dist/engine.cjs')).status, 404);
});
