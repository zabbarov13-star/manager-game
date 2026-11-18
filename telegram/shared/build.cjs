'use strict';
// Build ONLY the optional server engine. APK HTML/assets and online/dist stay intact.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),animations=require('../animation/build.cjs');
function generateFiles(extended=false){
 const root=path.resolve(__dirname,'../..'),virtual=path.join(root,'online/dist'),files=new Map();
 const shim={...fs,mkdirSync(){},writeFileSync:(p,data)=>files.set(p,data),copyFileSync:(a,b)=>files.set(b,fs.readFileSync(a)),readFileSync(p,...args){const value=files.has(p)?files.get(p):fs.readFileSync(p,...args);return typeof value==='string'?value.replace(/\r\n/g,'\n'):value;}};
 const file=path.join(root,'online/generate.cjs'),builder=new Module(file,module);builder.filename=file;builder.paths=Module._nodeModulePaths(path.dirname(file));const original=builder.require.bind(builder);
 builder.require=name=>name==='node:fs'?shim:name==='./public-build.cjs'&&extended?{...original(name),engineAndClient(replace){original(name).engineAndClient(replace);animations.authority(replace);}}:original(name);builder._compile(fs.readFileSync(file,'utf8'),file);
 return new Map([...files].map(([p,data])=>[path.relative(virtual,p),data]));
}
function buildSharedEngine(output=path.join(__dirname,'dist')){
 const engine=generateFiles(true).get('engine.cjs');if(typeof engine!=='string')throw Error('Shared engine not generated');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'engine.cjs'),animations.bundle()+animations.cosmetics(engine));
}
if(require.main===module){buildSharedEngine();console.log('Shared room extension built; original APK assets retained.');}
module.exports={buildSharedEngine,generateFiles};
