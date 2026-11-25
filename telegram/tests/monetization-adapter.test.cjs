'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {createApp}=require('../server.cjs');
test('enabled Stars adapter uses exact XTR invoices and preserves receipts/refunds across restart; Ads remains fail closed',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'manager-monetization-')),file=path.join(folder,'telegram.sqlite');
 const botToken='mock-bot-only',secret='s'.repeat(32),calls=[];let app,base,failInvoice=false,update=8000;
 const options={mode:'adapter',environment:'production',botToken,webhookSecret:secret,rpcSecret:'r'.repeat(32),origin:'https://commerce.fixture',database:file,ownerTelegramId:'',starsEnabled:true,supportContact:'@fixture_support',gatewayEnabled:true,blockId:'mock-block',receiptSecret:'a'.repeat(32),bot:async(method,body)=>{calls.push({method,body});if(method==='createInvoiceLink'){if(failInvoice)throw Object.assign(Error('Mock network failure'),{status:502});return'https://t.me/$mock-no-payment';}return true;}};
 const open=async()=>{app=createApp(options).listen(0,'127.0.0.1');await once(app,'listening');base='http://127.0.0.1:'+app.address().port;};
 const close=async()=>{if(app?.listening)await new Promise(r=>app.close(r));};
 t.after(async()=>{await close();fs.rmSync(folder,{recursive:true,force:true,maxRetries:3});});await open();
 const request=async(route,data,bearer,status=200,signature)=>{const r=await fetch(base+route,{method:data===undefined?'GET':'POST',headers:{Origin:options.origin,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{}),...(signature?{'X-Telegram-Bot-Api-Secret-Token':signature}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});const value=await r.json();assert.equal(r.status,status,route);return value;};
 function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Synthetic fixture'})});p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(botToken).digest()).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
 const login=id=>request('/api/session',{initData:signed(id)}),hook=(value,status=200)=>request('/telegram/webhook',{update_id:++update,...value},null,status,secret);
 const a=await login(450101);assert.equal(a.features.stars,true);assert.equal(a.features.ads,false);assert.equal(a.features.blockId,null);
 await request('/api/ads/begin',{item:'character:mira'},a.token,503);await request('/ads/verified-receipt',{userId:450101},null,404);assert.equal(app.store.db.prepare('SELECT count(*) n FROM ads').get().n,0);
 const invoice=await request('/api/invoice',{product:'character:mira'},a.token),wire=calls.find(c=>c.method==='createInvoiceLink').body;
 assert.equal(wire.currency,'XTR');assert.equal(wire.provider_token,'');assert.equal(wire.payload,invoice.orderId);assert.equal(wire.prices.length,1);assert.equal(wire.prices[0].amount,10);
 const payment={invoice_payload:invoice.orderId,currency:'XTR',total_amount:10,telegram_payment_charge_id:'mock-charge-mira'};
 for(const invalid of [{from:{id:450102}},{currency:'USD'},{total_amount:9}]){await hook({pre_checkout_query:{...payment,id:'query-'+update,from:{id:450101},...invalid}});assert.equal(calls.at(-1).body.ok,false);}
 await hook({pre_checkout_query:{...payment,id:'valid-query',from:{id:450101}}});assert.equal(calls.at(-1).body.ok,true);assert.equal(app.store.access('450101','character:mira').permanent,false);
 for(const invalid of [{from:{id:450102}},{successful_payment:{...payment,total_amount:9}},{successful_payment:{...payment,currency:'USD'}}])await hook({message:{from:{id:450101},successful_payment:payment,...invalid}},400);
 assert.equal(app.store.access('450101','character:mira').permanent,false);
 await request('/telegram/webhook',{update_id:++update,message:{from:{id:450101},successful_payment:payment}},null,403,'wrong-secret');
 const paid={update_id:++update,message:{from:{id:450101},successful_payment:payment}};await request('/telegram/webhook',paid,null,200,secret);await request('/telegram/webhook',paid,null,200,secret);await hook({message:paid.message});
 assert.equal(app.store.db.prepare("SELECT count(*) n FROM grants WHERE source=?").get('payment:'+payment.telegram_payment_charge_id).n,1);
 await hook({message:{from:{id:450101},refunded_payment:payment}});await hook({message:{from:{id:450101},refunded_payment:payment}});await hook({message:paid.message});
 assert.equal(app.store.access('450101','character:mira').permanent,false);assert.equal(app.store.db.prepare('SELECT status FROM orders WHERE id=?').get(invoice.orderId).status,'refunded');
 failInvoice=true;await request('/api/invoice',{product:'character:bella'},a.token,502);assert.equal(app.store.db.prepare("SELECT count(*) n FROM orders WHERE status='failed'").get().n,1);
 await close();await open();const restored=await login(450101);assert.equal(restored.access['character:mira'].permanent,false);assert.equal(app.store.db.prepare('SELECT count(*) n FROM grants WHERE revoked=1').get().n,1);assert.equal(app.store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(calls.some(c=>c.method==='refundStarPayment'),false,'no financial operation performed');
});
