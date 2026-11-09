const { homedir } = require('node:os');
const { resolve } = require('node:path');
const { createRoomServer } = require('./server.cjs');

process.umask(0o077);
const database = process.env.ROOM_DATABASE ?? resolve(homedir(), 'manager-online/data/rooms.sqlite');
const server = createRoomServer({ database });
server.listen(8080, '127.0.0.1', () => console.log('Manager: http://127.0.0.1:8080/'));
