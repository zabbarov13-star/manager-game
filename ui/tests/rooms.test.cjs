'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{randomUUID}=require('node:crypto');
const {createRoomServer}=require('../../online/server.cjs'),{CHARACTERS,COLORS}=require('../../online/dist/engine.cjs');
for(const count of [2,3,4,5,6])test(count+' participants: shared room, authoritative dice, revision and idempotency',async t=>{
 const server=createRoomServer({database:':memory:'}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port+'/api/rooms';
 async function call(route,body,token,key=randomUUID(),expected=200){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':key,...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,expected,data.error);return data;}
 const appearance=i=>({name:'QA '+i,character:CHARACTERS[i].id,color:COLORS[i].id}),host=await call('',{...appearance(0),capacity:count,mode:'code'},null,randomUUID(),201),route='/'+host.room.code,seats=[host];
 for(let i=1;i<count;i++){const seat=await call(route+'/join',appearance(i));seats.push(seat);await call(route+'/ready',{ready:true},seat.token);}
 const start=await call(route+'/start',{},host.token),actor=seats.find(p=>p.seatId===start.room.game.players[start.room.game.current].id),key=randomUUID(),body={method:'roll',args:[],gameRevision:start.room.gameRevision,requestId:randomUUID()};
 const rolled=await call(route+'/action',body,actor.token,key);assert.deepEqual(await call(route+'/action',body,actor.token,key),rolled);
 assert.equal(rolled.room.game.rolls,1);for(const seat of seats)assert.deepEqual((await call(route,undefined,seat.token)).room.game,rolled.room.game);
 const other=seats.find(p=>p!==actor);await call(route+'/chat',{text:'Проверка синхронизации'},other.token);assert.equal((await call(route,undefined,actor.token)).room.chat.at(-1).text,'Проверка синхронизации');
});
