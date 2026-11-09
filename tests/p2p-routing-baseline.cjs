const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const start = html.indexOf('function p2pOptions(');
const end = html.indexOf('function mountOnline(', start);
assert.ok(start >= 0 && end > start);
const { P2PNetwork } = runInNewContext(
  html.slice(start, end) + '\n({ P2PNetwork });',
  { setTimeout, clearTimeout, p2pSecret: () => 'a'.repeat(40) }
);

const primary = 'manager-peer-server.onrender.com';
const backup = 'backup.example.test';

function client(unreachable = []) {
  const attempted = [];
  const peerIds = new Map();
  class Peer extends EventEmitter {
    constructor(id, { host }) {
      super();
      this.host = host;
      attempted.push(host);
      queueMicrotask(() => {
        if (unreachable.includes(host)) {
          this.emit('error', { type: 'network', message: 'simulated blocked endpoint' });
        } else {
          peerIds.set(host, id);
          this.emit('open', id);
        }
      });
    }

    destroy() {
      this.destroyed = true;
    }
  }

  const network = new P2PNetwork({ Peer, saves: {} });
  network.configure({ servers: [{ host: backup }] });
  return { network, attempted, peerIds };
}

test('0.19.0 registers both peers on Render when both networks can reach it', async () => {
  const host = client();
  const guest = client();
  await Promise.all([host.network.init('host'), guest.network.init('guest')]);
  assert.equal(host.peerIds.get(primary), 'host');
  assert.equal(guest.peerIds.get(primary), 'guest');
  assert.deepEqual(guest.attempted, [primary]);
});

test('0.19.0 reproduces asymmetric routing when only the guest loses Render', async () => {
  const host = client();
  const guest = client([primary]);
  await Promise.all([host.network.init('host'), guest.network.init('guest')]);
  assert.deepEqual(host.attempted, [primary]);
  assert.deepEqual(guest.attempted, [primary, backup]);
  assert.equal(host.peerIds.get(backup), undefined);
  assert.equal(guest.peerIds.get(backup), 'guest');
});
