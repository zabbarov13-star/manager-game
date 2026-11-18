'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{createHmac,randomUUID}=require('node:crypto');
const {createApp}=require('../server.cjs');
const token='123:unit-test-token',secret='unit-test-webhook-secret-32-characters';
function signed(id=123){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Тест'})});const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
test('HTTP: auth isolation, webhook signature, confirmed Stars, restoration, refunds and replay',async t=>{
 const server=createApp({starsEnabled:true,supportContact:'@fixture_support',botToken:token,webhookSecret:secret,origin:'https://unit.test',database:':memory:',bot:async method=>method==='createInvoiceLink'?'https://t.me/$unit-test-invoice':true}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(url,data,bearer,expected=200,headers={}){const r=await fetch(base+url,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})});const v=await r.json();assert.equal(r.status,expected,JSON.stringify(v));return v;}
 await call('/api/session',{initData:'user=123'},null,401);await call('/api/profile',undefined,null,401);
 const a=await call('/api/session',{initData:signed()}),b=await call('/api/session',{initData:signed(456)});
 await call('/api/profile',{character:'mira'},a.token,403);await call('/api/ads/begin',{item:'character:mira'},a.token,503);
 const order=await call('/api/invoice',{product:'character:mira'},a.token);assert.equal((await call('/api/profile',undefined,a.token)).access['character:mira'].permanent,false);
 const p={invoice_payload:order.orderId,currency:'XTR',total_amount:10,telegram_payment_charge_id:'test-charge'};
 const update={update_id:1,message:{from:{id:123},successful_payment:p}};
 await call('/telegram/webhook',update,null,403);await call('/telegram/webhook',update,null,200,{'X-Telegram-Bot-Api-Secret-Token':secret});await call('/telegram/webhook',update,null,200,{'X-Telegram-Bot-Api-Secret-Token':secret});
 assert.equal((await call('/api/profile',undefined,a.token)).access['character:mira'].permanent,true);assert.equal((await call('/api/profile',undefined,b.token)).access['character:mira'].permanent,false);
 const restored=await call('/api/session',{initData:signed()});assert.equal(restored.access['character:mira'].permanent,true);
 await call('/telegram/webhook',{update_id:2,message:{from:{id:123},refunded_payment:p}},null,200,{'X-Telegram-Bot-Api-Secret-Token':secret});assert.equal((await call('/api/profile',undefined,a.token)).access['character:mira'].available,false);
 await call('/api/profile',{style:'heritage'},a.token,403,{Origin:'https://evil.test'});
 await call('/ads/verified-receipt',{receiptId:'forged'},null,503);
 const cancelled=await call('/api/invoice',{product:'character:crypto-monk'},a.token);await call('/api/invoice/cancel',{orderId:cancelled.orderId},a.token);await call('/api/invoice',{product:'character:crypto-monk'},a.token);
});
test('HTTP: original room engine creates, joins, starts and synchronizes a two-player match',async t=>{
 const server=createApp({starsEnabled:true,supportContact:'@fixture_support',botToken:token,webhookSecret:secret,origin:'https://unit.test',database:':memory:'}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port+'/api/rooms';
 async function call(path,data,token,status=200){const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});const v=await r.json();assert.equal(r.status,status,v.error);return v;}
 const host=await call('',{mode:'code',capacity:2,name:'Хозяин',character:'cassette',color:'#1976ed'},null,201),p='/'+host.room.code;
 const guest=await call(p+'/join',{name:'Гость',character:'roller',color:'#ffd000'});await call(p+'/ready',{ready:true},guest.token);const started=await call(p+'/start',{},host.token);
 const actor=started.room.game.players[started.room.game.current].id===host.seatId?host:guest;
 const action={method:'roll',args:[],requestId:randomUUID(),gameRevision:started.room.gameRevision};await call(p+'/action',action,actor.token);await call(p+'/action',action,actor.token);
 assert.equal((await call(p,undefined,guest.token)).room.game.rolls,1);
});

test('HTTP: premium seat needs a live server ticket; client flags and internal-looking headers cannot bypass access',async t=>{
 const server=createApp({starsEnabled:true,supportContact:'@fixture_support',botToken:token,webhookSecret:secret,origin:'https://unit.test',database:':memory:',ownerTelegramId:'123'}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));const base='http://127.0.0.1:'+server.address().port;
 async function post(url,data,session,headers={}){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(session?{Authorization:'Bearer '+session}:{}),...headers},body:JSON.stringify(data)});const value=await r.json();assert(r.ok,JSON.stringify(value));return value;}
 const owner=await post('/api/session',{initData:signed()});const profile=await post('/api/profile',{character:'mira'},owner.token);
 const host=await post('/api/rooms',{mode:'code',capacity:2,name:'Host',character:'cassette',color:'#1976ed',telegramCharacterId:'mira',telegramCosmeticTicket:profile.cosmeticTicket.ticket});assert.equal(host.room.seats[0].cosmeticCharacter,'mira');
 const guest=await post('/api/rooms/'+host.room.code+'/join',{name:'Guest',character:'roller',color:'#ffd000',telegramCharacterId:'anonymous-hacker',telegramCharacterVerified:true,telegramCosmeticTicket:'0'.repeat(64)},null,{'X-Manager-Verified-Cosmetic':'1'});assert.equal(guest.room.seats[1].cosmeticCharacter,undefined);
 assert.equal((await post('/api/cosmetics/verify',{ticket:profile.cosmeticTicket.ticket,characterId:'mira'})).valid,true);assert.equal((await post('/api/cosmetics/verify',{ticket:profile.cosmeticTicket.ticket,characterId:'asya'})).valid,false);
});

test('actual SQLite room and cosmetic profile survive server restart, paired backup and restoration',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{backupSet,restoreSet}=require('../backup-set.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'manager-real-rooms-')),data=path.join(root,'data');fs.mkdirSync(data);let app;
 const open=async folder=>{app=createApp({botToken:token,webhookSecret:secret,origin:'https://unit.test',database:path.join(folder,'telegram.sqlite'),ownerTelegramId:'123'}).listen(0,'127.0.0.1');await once(app,'listening');};const close=()=>new Promise(done=>app.close(done));t.after(async()=>{if(app?.listening)await close();});
 async function call(url,body,session,status=200){const r=await fetch('http://127.0.0.1:'+app.address().port+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(session?{Authorization:'Bearer '+session}:{})},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();assert.equal(r.status,status,v.error);return v;}
 await open(data);app.store.user({id:'456',name:'Persistence fixture'});const order=app.store.order('456','character:asya');app.store.paid('456',{invoice_payload:order.id,total_amount:10,currency:'XTR',telegram_payment_charge_id:'persistent-fixture'});app.store.select('456',{character:'asya'});
 const host=await call('/api/rooms',{mode:'code',capacity:2,name:'Host',character:'cassette',color:'#1976ed'},null,201),route='/api/rooms/'+host.room.code;const guest=await call(route+'/join',{name:'Guest',character:'roller',color:'#ffd000'});await call(route+'/ready',{ready:true},guest.token);const started=await call(route+'/start',{},host.token);const actor=started.room.game.players[started.room.game.current].id===host.seatId?host:guest;
 const command={method:'roll',args:[],requestId:randomUUID(),gameRevision:started.room.gameRevision},rolled=await call(route+'/action',command,actor.token);await close();const snapshot=await backupSet({dataDirectory:data,backupDirectory:path.join(root,'backups')}),restored=path.join(root,'restored');restoreSet({snapshotDirectory:snapshot,destinationDirectory:restored});await open(restored);
 const profile=await call('/api/session',{initData:signed(456)});assert(profile.access['character:asya'].permanent);assert.equal(profile.profile.character,'asya');assert.equal((await call('/api/session',{initData:signed(123)})).role,'owner');const restoredRoom=await call(route,undefined,guest.token);assert.deepEqual(restoredRoom.room.game,rolled.room.game);await call(route+'/action',command,actor.token);assert.equal((await call(route,undefined,host.token)).room.game.rolls,1);
});

test('sustained room polling retains original room limits without exhausting the separate commerce budget',async t=>{
 const app=createApp({botToken:token,webhookSecret:secret,origin:'https://unit.test',database:':memory:'}).listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(r=>app.close(r)));const base='http://127.0.0.1:'+app.address().port;
 const created=await (await fetch(base+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({mode:'code',capacity:2,name:'Poll fixture',character:'cassette',color:'#1976ed'})})).json();
 for(let i=0;i<245;i++){const response=await fetch(base+'/api/rooms/'+created.room.code,{headers:{Authorization:'Bearer '+created.token}});assert.equal(response.status,200);await response.arrayBuffer();await new Promise(r=>setTimeout(r,13));}
 assert.equal((await fetch(base+'/api/profile')).status,401,'Commerce should still reach authentication, not global room-poll throttling');
});

test('expiry in a lobby removes the premium skin at start; an expired admission ticket cannot hide permanent owner access',async t=>{
 let now=Date.now();const {Store}=require('../store.cjs'),store=new Store(':memory:',()=>now,{ownerTelegramId:'123'}),app=createApp({botToken:token,webhookSecret:secret,origin:'https://unit.test',store,database:':memory:'}).listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(r=>app.close(r)));const base='http://127.0.0.1:'+app.address().port;
 async function post(url,body,session,status=200){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(session?{Authorization:'Bearer '+session}:{})},body:JSON.stringify(body)});const value=await r.json();assert.equal(r.status,status,value.error);return value;}
 const owner=await post('/api/session',{initData:signed(123)}),guest=await post('/api/session',{initData:signed(456)});store.db.prepare("INSERT INTO grants(user,item,source,expires) VALUES('456','character:asya','ad-fixture',?)").run(now+1000);
 const op=await post('/api/profile',{character:'mira'},owner.token),gp=await post('/api/profile',{character:'asya'},guest.token);const host=await post('/api/rooms',{mode:'code',capacity:2,name:'Host',character:'cassette',color:'#1976ed',telegramCharacterId:'mira',telegramCosmeticTicket:op.cosmeticTicket.ticket},null,201),route='/api/rooms/'+host.room.code;
 const joined=await post(route+'/join',{name:'Guest',character:'roller',color:'#ffd000',telegramCharacterId:'asya',telegramCosmeticTicket:gp.cosmeticTicket.ticket});assert.equal(joined.room.seats[1].cosmeticCharacter,'asya');assert(!JSON.stringify(joined.room).includes(gp.cosmeticTicket.ticket));
 now+=360000;assert.equal(store.verifyCosmetic(op.cosmeticTicket.ticket,'mira'),false);assert.equal(store.verifyCosmetic(op.cosmeticTicket.ticket,'mira',{existingSeat:true}),true);assert.equal(store.verifyCosmetic(gp.cosmeticTicket.ticket,'asya',{existingSeat:true}),false);
 await post(route+'/ready',{ready:true},joined.token);const start=await post(route+'/start',{},host.token);assert.equal(start.room.animation.players[host.seatId],'mira');assert.equal(start.room.animation.players[joined.seatId],'roller');assert.equal(start.room.game.players[1].balance,20000);
 // Expiry after a confirmed start must preserve the already admitted costume.
 store.db.prepare("UPDATE grants SET expires=? WHERE user='456' AND item='character:asya'").run(now+1000);const freshOwner=await post('/api/profile',{character:'mira'},owner.token),freshGuest=await post('/api/profile',{character:'asya'},guest.token);
 const h2=await post('/api/rooms',{mode:'code',capacity:2,name:'Host',character:'cassette',color:'#1976ed',telegramCharacterId:'mira',telegramCosmeticTicket:freshOwner.cosmeticTicket.ticket},null,201),r2='/api/rooms/'+h2.room.code;
 const g2=await post(r2+'/join',{name:'Guest',character:'roller',color:'#ffd000',telegramCharacterId:'asya',telegramCosmeticTicket:freshGuest.cosmeticTicket.ticket});await post(r2+'/ready',{ready:true},g2.token);assert.equal((await post(r2+'/start',{},h2.token)).room.animation.players[g2.seatId],'asya');now+=2000;
 const stillPlaying=await (await fetch(base+r2,{headers:{Authorization:'Bearer '+g2.token}})).json();assert.equal(stillPlaying.room.animation.players[g2.seatId],'asya');assert.equal(store.access('456','character:asya').available,false);
});
