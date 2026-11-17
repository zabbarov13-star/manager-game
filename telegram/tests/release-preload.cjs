'use strict';
// Point the original release tests at this isolated build. Original test sources stay untouched.
const Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
const old=path.resolve(__dirname,'../../online/dist'),next=path.resolve(__dirname,'../dist');
const remap=p=>typeof p==='string'&&path.resolve(p).startsWith(old)?(path.resolve(p)===path.join(old,'index.html')?path.join(next,'game.js'):next+path.resolve(p).slice(old.length)):p;
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,...args){const candidate=request.startsWith('.')?path.resolve(path.dirname(parent.filename),request):request;return resolve.call(this,remap(candidate),parent,...args);};
const read=fs.readFileSync;fs.readFileSync=function(file,...args){return read.call(this,remap(file),...args);};
