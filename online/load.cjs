const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const { CHARACTERS, COLORS } = require('./dist/engine.cjs');
const { setTimeout: sleep } = require('node:timers/promises');

const seconds = Number(process.env.LOAD_SECONDS ?? 12);
const cpu = process.env.LOAD_CPU;
const hz = Number(execFileSync('getconf', ['CLK_TCK']).toString());
const sleepPoll = 1800;

async function run(players, index) {
  const folder = mkdtempSync(join(tmpdir(), 'manager-load-'));
  const port = 17930 + index;
  const base = 'http://127.0.0.1:' + port;
  const args = ['online/server.cjs'];
  const child = spawn(cpu ? 'taskset' : process.execPath, cpu ? ['-c', cpu, process.execPath, ...args] : args, {
    env: { ...process.env, PORT: String(port), ROOM_TRUST_PROXY: '1', ROOM_DATABASE: join(folder, 'rooms.sqlite') },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const stopped = once(child, 'exit');
  const timings = [], actions = [];
  let failures = 0;
  let peakRss = 0;
  const stat = () => {
    const status = readFileSync('/proc/' + child.pid + '/status', 'utf8');
    peakRss = Math.max(peakRss, Number(status.match(/^VmRSS:\s*(\d+)/m)?.[1] ?? 0));
    const fields = readFileSync('/proc/' + child.pid + '/stat', 'utf8').split(') ')[1].split(' ');
    return (Number(fields[11]) + Number(fields[12])) / hz;
  };
  async function request(path, ip, body, token) {
    const start = performance.now();
    const r = await fetch(base + '/api/rooms' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Real-IP': ip, 'Idempotency-Key': crypto.randomUUID(),
        ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    const time = performance.now() - start;
    timings.push(time);
    if (path.endsWith('/action')) actions.push(time);
    if (!r.ok) { failures++; throw Error(r.status + ' ' + data.error); }
    return data;
  }
  try {
    for (let retry = 0; retry < 25; retry++) {
      try { if ((await fetch(base + '/health')).ok) break; } catch {}
      await sleep(100);
    }
    const rooms = await Promise.all(Array.from({ length: players / 2 }, async (_, i) => {
      const ip = '198.51.100.' + (i + 1);
      const figure = n => ({ name: 'Игрок ' + n, character: CHARACTERS[n].id, color: COLORS[n].id });
      const h = await request('', ip, { ...figure(0), capacity: 2, mode: 'public' });
      const path = '/' + h.room.code;
      const g = await request(path + '/join', ip, figure(1));
      await request(path + '/ready', ip, { ready: true }, g.token);
      const { room } = await request(path + '/start', ip, {}, h.token);
      return { ip, path, room, tokens: { p0: h.token, p1: g.token } };
    }));
    assert.equal(new Set(rooms.map(r => r.path)).size, rooms.length);
    const cpuStart = stat(), start = performance.now();
    const sampler = setInterval(stat, 500);
    try {
      do {
        await Promise.all(rooms.map(async table => {
          const before = table.room;
          const game = before.game;
          const method = { ready: 'roll', purchase: 'decline', end: 'endTurn', event: 'confirmCard' }[game.phase];
          const token = table.tokens[game.players[game.current].id];
          if (method) {
            const result = await request(table.path + '/action', table.ip, {
              method, args: [], requestId: crypto.randomUUID(), gameRevision: before.gameRevision,
            }, token);
            assert.equal(result.room.gameRevision, before.gameRevision + 1);
            table.room = result.room;
          }
          const snapshots = await Promise.all(Object.values(table.tokens).map(t => request(table.path, table.ip, undefined, t)));
          assert.equal(snapshots[0].room.code, before.code);
          assert.deepEqual(snapshots[0].room.game, snapshots[1].room.game);
          table.room = snapshots[0].room;
        }));
        await sleep(sleepPoll);
      } while (performance.now() - start < seconds * 1000);
    } finally { clearInterval(sampler); }
    const elapsed = (performance.now() - start) / 1000;
    const cpuPercent = 100 * (stat() - cpuStart) / elapsed;
    const p95 = list => list.sort((a,b) => a-b)[Math.ceil(list.length * .95)-1]?.toFixed(1);
    console.log(JSON.stringify({ players, rooms: rooms.length, seconds: elapsed.toFixed(1), requests: timings.length,
      actions: actions.length, apiP95ms: p95(timings), actionP95ms: p95(actions), rssMiB: (peakRss / 1024).toFixed(1),
      cpuPercent: cpuPercent.toFixed(1), failures, pinnedCpu: cpu ?? null }));
  } finally {
    child.kill();
    await stopped;
    rmSync(folder, { recursive: true, force: true });
  }
}
(async () => {
  const counts = process.env.LOAD_PLAYERS ? process.env.LOAD_PLAYERS.split(',').map(Number) : [10,20,50];
  assert.ok(counts.every(n => Number.isInteger(n) && n >= 2 && n <= 50 && n % 2 === 0));
  assert.ok(Number.isFinite(seconds) && seconds >= 1 && seconds <= 21600);
  for (const [i, n] of counts.entries()) await run(n, i);
})().catch(error => { console.error(error); process.exitCode = 1; });
