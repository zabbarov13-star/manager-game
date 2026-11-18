'use strict';
// Point the original release tests at this isolated build. Original test sources stay untouched.
const Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
const old=path.resolve(__dirname,'../../online/dist'),next=path.resolve(__dirname,'../dist');
const remap=p=>typeof p==='string'&&path.resolve(p).startsWith(old)?(path.resolve(p)===path.join(old,'index.html')?path.join(next,'game.js'):next+path.resolve(p).slice(old.length)):p;
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,...args){const candidate=request.startsWith('.')?path.resolve(path.dirname(parent.filename),request):request;return resolve.call(this,remap(candidate),parent,...args);};
const read=fs.readFileSync;fs.readFileSync=function(file,...args){return read.call(this,remap(file),...args);};
const stream=fs.createReadStream;fs.createReadStream=function(file,...args){const target=path.resolve(file)===path.join(old,'index.html')?path.join(next,'index.html'):remap(file);return stream.call(this,target,...args);};
// The original HTTP recovery test removes its own temporary fixture directory.
// Validate its resolved target before allowing a recursive removal on Windows.
const remove=fs.rmSync;fs.rmSync=function(file,options){if(options?.recursive){const target=path.resolve(file),temp=path.resolve(require('node:os').tmpdir());if(!target.startsWith(temp+path.sep)||!['manager-rooms-','manager-construction-'].some(prefix=>path.basename(target).startsWith(prefix)))throw Error('Refusing recursive test cleanup outside its temporary fixture.');}return remove.call(this,file,options);};
