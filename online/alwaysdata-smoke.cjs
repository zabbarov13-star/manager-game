const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, readlinkSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

test('shared-host installer switches releases and serves the assigned socket', async t => {
  const root = mkdtempSync(join(tmpdir(), 'manager-shared-host-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = resolve(__dirname, '..');
  const archive = execFileSync('tar', ['-czf', '-', 'online/server.cjs', 'online/alwaysdata-start.cjs', 'online/dist'],
    { cwd: project, maxBuffer: 32 * 1024 * 1024 });
  const install = release => execFileSync('sh', ['online/alwaysdata-install.sh', release], {
    cwd: project, input: archive, env: { ...process.env, MANAGER_DEPLOY_ROOT: root },
  });
  install('a'.repeat(40));
  assert.equal(readlinkSync(join(root, 'current')), 'releases/' + 'a'.repeat(40));
  const marker = join(root, 'data', 'keep');
  writeFileSync(marker, 'existing data');
  const release = 'b'.repeat(40);
  install(release);
  assert.equal(readlinkSync(join(root, 'current')), 'releases/' + release);
  assert.equal(readFileSync(marker, 'utf8'), 'existing data');

  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  await new Promise(done => socket.close(done));
  const child = spawn(process.execPath, [join(root, 'current', 'online', 'alwaysdata-start.cjs')], {
    env: { ...process.env, IP: '127.0.0.1', PORT: String(port), ROOM_DATABASE: join(root, 'data', 'rooms.sqlite') },
    stdio: 'inherit',
  });
  try {
    let health;
    for (let i = 0; i < 25; i++) {
      try { health = await (await fetch('http://127.0.0.1:' + port + '/health')).json(); break; }
      catch { await new Promise(done => setTimeout(done, 100)); }
    }
    assert.deepEqual(health, { ok: true, release });
    const page = await fetch('http://127.0.0.1:' + port + '/');
    assert.match(await page.text(), /Тест онлайн/);
  } finally {
    if (child.exitCode === null) {
      const closed = once(child, 'exit');
      child.kill();
      await closed;
    }
  }
});
