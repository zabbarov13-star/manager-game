'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{createHmac,randomUUID}=require('node:crypto');
const {createApp}=require('../server.cjs');
const token='123:unit-test-token',secret='unit-test-webhook-secret-32-characters';
function signed(id=123){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Тест'})});const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
test('HTTP: auth isolation, webhook signature, confirmed Stars, restoration, refunds and replay',async t=>{
 const server=createApp({botToken:token,webhookSecret:secret,origin:'https://unit.test',database:':memory:',bot:async method=>method==='createInvoiceLink'?'https://t.me/$unit-test-invoice':true}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
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
 const server=createApp({botToken:token,webhookSecret:secret,origin:'https://unit.test',database:':memory:'}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port+'/api/rooms';
 async function call(path,data,token,status=200){const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});const v=await r.json();assert.equal(r.status,status,v.error);return v;}
 const host=await call('',{mode:'code',capacity:2,name:'Хозяин',character:'cassette',color:'#1976ed'},null,201),p='/'+host.room.code;
 const guest=await call(p+'/join',{name:'Гость',character:'roller',color:'#ffd000'});await call(p+'/ready',{ready:true},guest.token);const started=await call(p+'/start',{},host.token);
 const actor=started.room.game.players[started.room.game.current].id===host.seatId?host:guest;
 const action={method:'roll',args:[],requestId:randomUUID(),gameRevision:started.room.gameRevision};await call(p+'/action',action,actor.token);await call(p+'/action',action,actor.token);
 assert.equal((await call(p,undefined,guest.token)).room.game.rolls,1);
});

test('HTTP: premium seat needs a live server ticket; client flags and internal-looking headers cannot bypass access',async t=>{
 const server=createApp({botToken:token,webhookSecret:secret,origin:'https://unit.test',database:':memory:',ownerTelegramId:'123'}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(done=>server.close(done)));const base='http://127.0.0.1:'+server.address().port;
 async function post(url,data,session,headers={}){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(session?{Authorization:'Bearer '+session}:{}),...headers},body:JSON.stringify(data)});const value=await r.json();assert(r.ok,JSON.stringify(value));return value;}
 const owner=await post('/api/session',{initData:signed()});const profile=await post('/api/profile',{character:'mira'},owner.token);
 const host=await post('/api/rooms',{mode:'code',capacity:2,name:'Host',character:'cassette',color:'#1976ed',telegramCharacterId:'mira',telegramCosmeticTicket:profile.cosmeticTicket.ticket});assert.equal(host.room.seats[0].cosmeticCharacter,'mira');
 const guest=await post('/api/rooms/'+host.room.code+'/join',{name:'Guest',character:'roller',color:'#ffd000',telegramCharacterId:'anonymous-hacker',telegramCharacterVerified:true,telegramCosmeticTicket:'0'.repeat(64)},null,{'X-Manager-Verified-Cosmetic':'1'});assert.equal(guest.room.seats[1].cosmeticCharacter,undefined);
 assert.equal((await post('/api/cosmetics/verify',{ticket:profile.cosmeticTicket.ticket,characterId:'mira'})).valid,true);assert.equal((await post('/api/cosmetics/verify',{ticket:profile.cosmeticTicket.ticket,characterId:'asya'})).valid,false);
});
