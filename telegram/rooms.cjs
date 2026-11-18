'use strict';
// Reuse the original authoritative room server without changing its source or protocol.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
function createRooms(options){const file=path.resolve(__dirname,'../online/server.cjs'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m.managerVerifyCosmetic=options.verifyCosmetic;
 const original=m.require.bind(m);m.require=name=>name==='./dist/engine.cjs'?require('./dist/engine.cjs'):original(name);
 const source=fs.readFileSync(file,'utf8'),anchor="headers: { Authorization: req.headers.authorization ?? '' }, body,";
 if(!source.includes(anchor))throw Error('Room verification header anchor changed.');
 const verify='handleRooms(request, { DB, publicEnabled })';if(!source.includes(verify))throw Error('Room verifier environment anchor changed.');
 m._compile(source.replace(verify,'handleRooms(request, { DB, publicEnabled, verifyCosmetic: module.managerVerifyCosmetic })').replace(anchor,"headers: { Authorization: req.headers.authorization ?? '', 'X-Manager-Verified-Cosmetic': req.managerCosmeticVerified ? '1' : '0' }, body,"),file);return m.exports.createRoomServer(options);
}
module.exports={createRooms};
