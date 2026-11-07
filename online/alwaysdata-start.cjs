// Keep the provider-assigned listener private behind the platform HTTPS proxy.
const { isIP } = require('node:net');
const { resolve, basename } = require('node:path');
const { homedir } = require('node:os');
const { createRoomServer } = require('./server.cjs');

const host = process.env.IP || process.env.HOST;
const port = Number(process.env.PORT);
if (!isIP(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw Error('The host must assign an IP address and a TCP port');
}
process.umask(0o077);
const database = process.env.ROOM_DATABASE ?? resolve(homedir(), 'manager-online/data/rooms.sqlite');
createRoomServer({ database, journal: 'delete', release: basename(resolve(__dirname, '..')) }).listen(port, host);
