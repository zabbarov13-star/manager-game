// Passenger intercepts this single HTTP listen call and assigns its own socket.
const { homedir } = require('node:os');
const { resolve } = require('node:path');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  throw Error('Manager requires Node.js 22.13 or newer with node:sqlite');
}
const { createRoomServer } = require('./server.cjs');
process.umask(0o077);
const database = process.env.ROOM_DATABASE ?? resolve(homedir(), 'manager-online-data', 'rooms.sqlite');
const server = createRoomServer({ database, journal: 'delete' });
const port = process.env.PORT || '8080';
if (/^\d+$/.test(port)) server.listen(Number(port), '127.0.0.1');
else server.listen(port);
