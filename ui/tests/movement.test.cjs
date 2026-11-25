'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../presentation.js'),'utf8'),context);const {movementPath}=context.window.ManagerPresentation;
test('all 1600 board pairs: only card visuals use the shortest ring path; source effects are immutable',()=>{
 for(let from=0;from<40;from++)for(let to=0;to<40;to++){
  const distance=(to-from+40)%40,path=Array.from({length:distance},(_,i)=>(from+i+1)%40),effect={playerId:'p0',path},before=JSON.stringify(effect);
  assert.strictEqual(movementPath(effect,from,false),path,'dice retain authoritative movement');
  const result=movementPath(effect,from,true);assert.equal(result.length,Math.min(distance,(from-to+40)%40));if(result.length)assert.equal(result.at(-1),to);
  assert.equal(JSON.stringify(effect),before);
 }
});
test('backwards steps, tie direction, exchange teleports and full circuits preserve their semantics',()=>{
 for(const e of [{path:[9,8]},{path:[10],teleport:true},{path:Array.from({length:40},(_,i)=>(i+1)%40)}]){
  const from=e.teleport?30:e.path.length===40?0:10;assert.deepEqual(Array.from(movementPath(e,from,true)),e.path);
 }
 const backward={path:Array.from({length:20},(_,i)=>(39-i)%40)};
 assert.deepEqual(Array.from(movementPath(backward,0,true)),backward.path,'equal length must preserve explicit backward direction');
});
test('all 40 tiles and 1–6 occupants have deterministic centers and non-overlapping support points',()=>{
 const source=fs.readFileSync(require.resolve('../../index.html'),'utf8');
 const coordinate=source.slice(source.indexOf('function coordinate('),source.indexOf('function markerCenter('));
 const place=source.match(/function tokenPlacement\([^\n]+/)[0];
 const api=vm.runInNewContext(coordinate+'\n'+place+';({coordinate,tokenPlacement})');
 for(let id=0;id<40;id++)for(let n=1;n<=6;n++){
  const cell=api.coordinate(id),points=new Set();for(let i=0;i<n;i++){const p=api.tokenPlacement(cell,n,i);assert(p.x>=cell.x&&p.x<=cell.x+cell.w&&p.y>=cell.y&&p.y<=cell.y+cell.h);points.add(p.x+':'+p.y);if(n===1){assert.equal(p.x,cell.x+cell.w/2);assert.equal(p.y,cell.y+cell.h/2);}}
  assert.equal(points.size,n);
 }
});
