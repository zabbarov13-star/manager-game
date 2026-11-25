'use strict';
// No live Telegram/payment calls. Pending invoices model a restart with Stars OFF.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{createHmac}=require('node:crypto');
const {createApp}=require('../server.cjs');
test('monetization OFF rejects pending pre-checkout but preserves purchases and in-flight receipts',async t=>{
 const token='off-fixture-only',secret='s'.repeat(32),user=925001,calls=[];
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'manager-off-fixture-'));
 const off=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../deploy/monetization-off.example'),'utf8').trim().split(/\r?\n/).map(line=>line.split('=')));
 assert.deepEqual(off,{STARS_ENABLED:'0',ADS_VERIFIED_GATEWAY_ENABLED:'0'});
 const config={mode:'adapter',rpcSecret:'r'.repeat(32),environment:'test',ownerTelegramId:'',blockId:'fixture-block',supportContact:'@fixture_support',botToken:token,webhookSecret:secret,origin:'https://off.fixture',database:path.join(folder,'telegram.sqlite'),bot:async(method,body)=>{calls.push({method,body});return true;}};
 let app,base;
 async function open(){
  const before=Object.fromEntries(Object.keys(off).map(k=>[k,process.env[k]]));
  try{Object.assign(process.env,off);app=createApp(config);}
  finally{for(const [k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  app.listen(0,'127.0.0.1');await once(app,'listening');base='http://127.0.0.1:'+app.address().port;
 }
 async function close(){if(app?.listening)await new Promise(r=>app.close(r));}
 t.after(close);await open();
 const post=async(route,data,bearer,signature)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{}),...(signature?{'X-Telegram-Bot-Api-Secret-Token':signature}:{})},body:JSON.stringify(data)});
 const webhook=async(update,signature=secret)=>{const r=await post('/telegram/webhook',update,null,signature);assert.equal(r.status,200);};
 app.store.user({id:String(user),name:'Synthetic OFF fixture'});
 const pending=app.store.order(String(user),'character:mira');
 const prior=app.store.order(String(user),'character:asya');
 app.store.paid(String(user),{invoice_payload:prior.id,currency:'XTR',total_amount:10,telegram_payment_charge_id:'prior-fixture-charge'});
 const inFlight=app.store.order(String(user),'character:bella');
 app.store.checkout(String(user),{id:'approved-before-off',invoice_payload:inFlight.id,currency:'XTR',total_amount:10});
 const q={update_id:100,pre_checkout_query:{id:'pending-off',from:{id:user},invoice_payload:pending.id,currency:'XTR',total_amount:10}};
 await webhook(q);
 assert.equal(calls.at(-1).method,'answerPreCheckoutQuery');assert.equal(calls.at(-1).body.ok,false,'OFF must reject old unpaid invoices');
 assert.equal(app.store.db.prepare('SELECT status FROM orders WHERE id=?').get(pending.id).status,'created');
 assert.equal(app.store.access(String(user),'character:mira').permanent,false);
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:user,first_name:'Synthetic'})});
 p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 const session=await (await post('/api/session',{initData:p.toString()})).json();
 assert.equal(session.features.stars,false);assert.equal(session.features.ads,false);
 assert.equal((await post('/api/invoice',{product:'character:mira'},session.token)).status,503);
 assert.equal((await post('/api/ads/begin',{item:'character:mira'},session.token)).status,503);
 const payment={invoice_payload:inFlight.id,currency:'XTR',total_amount:10,telegram_payment_charge_id:'in-flight-fixture-charge'};
 const receipt={update_id:101,message:{from:{id:user},successful_payment:payment}};
 assert.equal((await post('/telegram/webhook',receipt,null,'wrong-secret')).status,403);
 await webhook(receipt);await webhook(receipt);
 assert.equal(app.store.access(String(user),'character:bella').permanent,true);
 assert.equal(calls.filter(c=>c.method==='createInvoiceLink').length,0);
 assert.equal(app.store.db.prepare('SELECT count(*) n FROM ads').get().n,0);
 await close();await open();
 assert.equal(app.store.access(String(user),'character:asya').permanent,true);
 assert.equal(app.store.access(String(user),'character:bella').permanent,true);
 assert.equal(app.store.access(String(user),'character:mira').permanent,false);
 await webhook({update_id:102,message:{from:{id:user},refunded_payment:payment}});
 assert.equal(app.store.access(String(user),'character:bella').permanent,false);
 assert.equal(app.store.access(String(user),'character:asya').permanent,true);
});
