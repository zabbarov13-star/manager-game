'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {Store}=require('../store.cjs'),{createApp}=require('../server.cjs'),catalog=require('../catalog.cjs');
test('owner is explicit, numeric, unbounded for registered cosmetic items and never fabricates payments',()=>{
 assert.throws(()=>new Store(':memory:',Date.now,{ownerTelegramId:'@username'}));
 const s=new Store(':memory:',Date.now,{ownerTelegramId:'9001'});s.user({id:'9001',name:'Owner'});s.user({id:'9002',name:'Owner'});
 for(const item of catalog.items){assert.equal(s.access('9001',item.id).permanent,true);if(!item.free)assert.equal(s.access('9002',item.id).available,false);}
 catalog.items.push({id:'effect:future-fixture',kind:'effect',name:'Future cosmetic',price:1});assert.equal(s.access('9001','effect:future-fixture').permanent,true);assert.equal(s.access('9002','effect:future-fixture').available,false);catalog.items.pop();
 assert.equal(s.access('9001','character:nonexistent').available,false);
 assert.throws(()=>s.order('9001','character:mira'));assert.throws(()=>s.beginAd('9001','character:mira'));assert.equal(s.db.prepare('SELECT count(*) AS n FROM orders').get().n,0);assert.equal(s.db.prepare('SELECT count(*) AS n FROM ads').get().n,0);s.close();
 const unset=new Store(':memory:',Date.now,{ownerTelegramId:''});unset.user({id:'9001',name:'First administrator'});assert.equal(unset.profile('9001').role,'player');unset.close();
});
test('owner role cannot be obtained through forged initData, names or profile flags; restores on another session',async t=>{
 const token='test:owner-auth-token',app=createApp({botToken:token,webhookSecret:'owner-test-webhook-secret-32-characters',origin:'https://owner.test',ownerTelegramId:'9001',database:':memory:',bot:async()=>{throw Error('Owner must not call payment API');}}).listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port;
 const sign=(id,key=token)=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Same displayed owner name',username:'same_owner'})});const secret=createHmac('sha256','WebAppData').update(key).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();};
 async function call(route,data,session){const response=await fetch(base+route,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json()};}
 assert.equal((await call('/api/session',{initData:sign(9001,'forged-key')})).status,401);
 const owner=(await call('/api/session',{initData:sign(9001)})).data,regular=(await call('/api/session',{initData:sign(9002)})).data;
 assert.equal(owner.role,'owner');assert.equal(regular.role,'player');assert.equal((await call('/api/invoice',{product:'character:mira'},owner.token)).status,409);
 const spoof=await call('/api/profile',{role:'owner',owner:true,userId:'9001'},regular.token);assert.equal(spoof.data.role,'player');assert.equal((await call('/api/profile',{character:'mira'},regular.token)).status,403);
 const restored=(await call('/api/session',{initData:sign(9001)})).data;assert.equal(restored.role,'owner');assert(Object.values(restored.access).every(a=>a.permanent));assert(!JSON.stringify(restored.catalog).includes('OWNER_TELEGRAM_ID'));
});
test('historical replacement purchase and refund retain their original provenance',()=>{
 const s=new Store();s.user({id:'9002',name:'Historical customer'});
 s.db.prepare("INSERT INTO orders(id,user,product,amount,items,created,status,charge) VALUES('old','9002','character:timur',10,?,1,'paid','legacy-charge')").run(JSON.stringify(['character:timur']));
 s.db.prepare("INSERT INTO grants(user,item,source,expires) VALUES('9002','character:timur','payment:legacy-charge',NULL)").run();
 assert.equal(s.access('9002','character:crypto-monk').permanent,true);s.refunded('9002',{invoice_payload:'old',currency:'XTR',total_amount:10,telegram_payment_charge_id:'legacy-charge'});assert.equal(s.access('9002','character:crypto-monk').available,false);s.close();
});
