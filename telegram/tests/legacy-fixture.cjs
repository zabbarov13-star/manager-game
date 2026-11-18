'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
function legacyServerFactory(output){
 const root=path.resolve(__dirname,'../..'),original=path.join(root,'online/dist'),map=p=>typeof p==='string'&&p.startsWith(original)?output+p.slice(original.length):p;
 const shim={...fs,readFileSync(p,...args){const v=fs.readFileSync(map(p),...args);return typeof v==='string'?v.replace(/\r\n/g,'\n'):v;},writeFileSync:(p,...args)=>fs.writeFileSync(map(p),...args),mkdirSync:(p,...args)=>fs.mkdirSync(map(p),...args),copyFileSync:(a,b,...args)=>fs.copyFileSync(a,map(b),...args)};
 const generate=path.join(root,'online/generate.cjs'),builder=new Module(generate,module);builder.filename=generate;builder.paths=Module._nodeModulePaths(path.dirname(generate));const originalRequire=builder.require.bind(builder);builder.require=name=>name==='node:fs'?shim:originalRequire(name);builder._compile(fs.readFileSync(generate,'utf8'),generate);
 const file=path.join(root,'online/server.cjs'),serverModule=new Module(file,module);serverModule.filename=file;serverModule.paths=Module._nodeModulePaths(path.dirname(file));const load=serverModule.require.bind(serverModule);serverModule.require=name=>name==='./dist/engine.cjs'?require(path.join(output,'engine.cjs')):load(name);serverModule._compile(fs.readFileSync(path.join(__dirname,'fixtures/legacy-room-server.cjs.txt'),'utf8'),file);return serverModule.exports.createRoomServer;
}

module.exports={legacyServerFactory};
