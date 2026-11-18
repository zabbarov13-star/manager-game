'use strict';
// Offline feasibility check, not a migration of the real VPS or an APK UI test.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),{once}=require('node:events'),{randomUUID}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {legacyServerFactory}=require('./legacy-fixture.cjs');
test('one room DB preserves legacy commands, credentials and replay across extended engine and code rollback',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'manager-shared-compat-')),database=path.join(folder,'rooms.sqlite'),legacy=legacyServerFactory(path.join(folder,'legacy'));
 const enhanced=require('../rooms.cjs').createRooms;let server,base;
 async function stop(){if(server?.listening)await new Promise(resolve=>server.close(resolve));}
 async function open(factory){server=factory({database,verifyCosmetic:()=>false,allowedOrigins:[]});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;}
 t.after(stop); // Temporary data retained for diagnostics; never touch a real DB.
 async function call(route,body,token,status=200,key=randomUUID()){
  const response=await fetch(base+'/api/rooms'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
 }
 function rows(table){const db=new DatabaseSync(database,{readOnly:true});try{return db.prepare('SELECT * FROM '+table+' ORDER BY '+(table==='replay'?'id':'code')).all();}finally{db.close();}}
 await open(legacy);
 const host=await call('',{name:'Legacy APK protocol',character:'cassette',color:'#1976ed',mode:'code',capacity:2},null,201),route='/'+host.room.code;
 const guest=await call(route+'/join',{name:'Telegram protocol',character:'roller',color:'#ffd000'});await call(route+'/ready',{ready:true},guest.token);const start=await call(route+'/start',{},host.token);
 const actor=start.room.game.players[start.room.game.current].id===host.seatId?host:guest;
 const key=randomUUID(),command={method:'roll',args:[],requestId:randomUUID(),gameRevision:start.room.gameRevision},rolled=await call(route+'/action',command,actor.token,200,key);
 assert.equal(rolled.room.game.rolls,1);await stop();const replayBefore=rows('replay'),roomsBefore=rows('online_rooms');
 await open(enhanced);
 assert.deepEqual((await call(route,undefined,guest.token)).room.game,rolled.room.game);
 assert.deepEqual(await call(route+'/action',command,actor.token,200,key),rolled,'HTTP replay must retain its original response across the update');
 assert.deepEqual(rows('replay'),replayBefore);assert.deepEqual(rows('online_rooms'),roomsBefore);
 const method={purchase:'buy',end:'endTurn',event:'confirmCard',roll:'roll'}[rolled.room.game.phase];assert(method,'Fixture needs an ordinary next action');
 const nextActor=rolled.room.game.players[rolled.room.game.current].id===host.seatId?host:guest;const nextKey=randomUUID(),next={method,args:[],requestId:randomUUID(),gameRevision:rolled.room.gameRevision},advanced=await call(route+'/action',next,nextActor.token,200,nextKey);
 assert.equal(advanced.room.gameRevision,rolled.room.gameRevision+1);assert(advanced.room.animation,'Extended events are additive to the original game response');await stop();const replayExtended=rows('replay'),roomsExtended=rows('online_rooms');
 await open(legacy);
 assert.deepEqual((await call(route,undefined,host.token)).room.game,advanced.room.game);
 assert.deepEqual(await call(route+'/action',next,nextActor.token,200,nextKey),advanced,'Rollback must replay the newer response without a duplicate action');
 assert.deepEqual(rows('replay'),replayExtended);assert.deepEqual(rows('online_rooms'),roomsExtended);
 await stop();const db=new DatabaseSync(database,{readOnly:true});assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
});
