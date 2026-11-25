'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),https=require('node:https'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {createBotApi,environment}=require('../bot-api.cjs'),{createApp}=require('../server.cjs'),{Store}=require('../store.cjs'),{DatabaseSync}=require('node:sqlite'),{backupSet,restoreSet}=require('../backup-set.cjs');
test('official test Bot API is isolated and failures never expose token URLs',async()=>{
 const urls=[],api=createBotApi('private-test-token',{mode:'test',fetcher:async url=>{urls.push(url);return {ok:true,json:async()=>({ok:true,result:true})};}});await api('createInvoiceLink',{});assert.equal(urls[0],'https://api.telegram.org/botprivate-test-token/test/createInvoiceLink');
 assert.throws(()=>environment('staging'));assert.throws(()=>environment('https://evil.test'));
 const bad=createBotApi('never-log-this',{fetcher:async()=>{throw Error('https://api.telegram.org/botnever-log-this');}});await assert.rejects(bad('getMe',{}),e=>!e.message.includes('never-log-this'));
});

test('refund helper cannot operate in production or revoke a grant before the authenticated webhook',async()=>{
 const {refundTestPayment}=require('../test-refund.cjs');await assert.rejects(refundTestPayment({mode:'production'}),/only operates/);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manager-test-refund-')),file=path.join(dir,'telegram.sqlite'),store=new Store(file);store.user({id:'5000',name:'Test fixture'});const order=store.order('5000','character:mira');store.paid('5000',{invoice_payload:order.id,total_amount:10,currency:'XTR',telegram_payment_charge_id:'test-only-charge'});const calls=[];
 const result=await refundTestPayment({orderId:order.id,database:file,mode:'test',bot:async(method,body)=>{calls.push({method,body});return true;}});assert(result.awaitingWebhook);assert.deepEqual(calls,[{method:'refundStarPayment',body:{user_id:5000,telegram_payment_charge_id:'test-only-charge'}}]);assert(store.access('5000','character:mira').permanent);store.close();
});
test('unconfigured Stars refuse new invoices, health reports reality, paysupport uses configured contact',async t=>{
 const sent=[],app=createApp({environment:'test',botToken:'test-only',webhookSecret:'s'.repeat(32),origin:'https://test.invalid',database:':memory:',supportContact:'@fixture_support',bot:async(method,body)=>{sent.push({method,body});return true;}}).listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(r=>app.close(r)));const base='http://127.0.0.1:'+app.address().port;
 assert.equal((await (await fetch(base+'/health')).json()).starsConfigured,false);
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:500,first_name:'Test'})});p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update('test-only').digest()).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 const session=await (await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:p.toString()})})).json();assert.equal(session.features.stars,false);
 assert.equal((await fetch(base+'/api/invoice',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({product:'character:mira'})})).status,503);
 const update={update_id:500,message:{from:{id:100},chat:{id:100},text:'/paysupport'}};await fetch(base+'/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'s'.repeat(32)},body:JSON.stringify(update)});assert.equal(sent[0].method,'sendMessage');assert(sent[0].body.text.includes('@fixture_support'));
});

test('local staging TLS validates against its certificate and has no unauthenticated profile access',async t=>{
 const folder=process.env.QA_TLS_DIR??path.resolve(__dirname,'../data/staging/tls'),cert=fs.readFileSync(path.join(folder,'localhost-cert.pem')),key=fs.readFileSync(path.join(folder,'localhost-key.pem'));
 const app=createApp({environment:'test',botToken:'tls-fixture-only',webhookSecret:'s'.repeat(32),origin:'https://localhost:8443',database:':memory:'});const server=https.createServer({key,cert},(req,res)=>app.emit('request',req,res)).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(()=>{app.emit('close');resolve();})));
 const get=url=>new Promise((resolve,reject)=>https.get({hostname:'127.0.0.1',port:server.address().port,path:url,ca:cert},r=>{let text='';r.on('data',part=>text+=part);r.on('end',()=>resolve({status:r.statusCode,data:JSON.parse(text)}));}).on('error',reject));
 assert.equal((await get('/health')).data.environment,'test');assert.equal((await get('/api/profile')).status,401);
});

test('all four character packs and other product prices grant once, persist and refund only their own transaction',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manager-commerce-')),file=path.join(dir,'telegram.sqlite'),catalog=require('../catalog.cjs');let store=new Store(file);const pack=catalog.packs.filter(p=>p.id.startsWith('pack:characters-'));assert.equal(pack.length,4);assert.equal(new Set(pack.flatMap(p=>p.items)).size,12);for(const p of pack){assert.equal(p.items.length,3);assert.equal(p.price,25);}
 const expected={'character:mira':10,'dice:jade':15,'style:arcade':20,'pack:styles':39,'pack:cosmetics':39};for(const [id,price]of Object.entries(expected))assert.equal(catalog.products.find(p=>p.id===id).price,price);
 const orders=[];for(const [i,product]of [...pack,...Object.keys(expected).map(id=>catalog.products.find(p=>p.id===id))].entries()){const user=String(5000+i);store.user({id:user,name:'Product fixture'});const order=store.order(user,product.id),payment={id:'checkout-'+i,invoice_payload:order.id,total_amount:product.price,currency:'XTR',telegram_payment_charge_id:'matrix-charge-'+i};store.checkout(user,payment);store.paid(user,payment);assert(store.paid(user,payment).duplicate);orders.push({user,product,payment});}store.close();store=new Store(file);
 for(const {user,product,payment}of orders){for(const item of product.items)assert(store.access(user,item).permanent);store.refunded(user,payment);for(const item of product.items)assert.equal(store.access(user,item).permanent,false);}store.close();
});
test('paired snapshots restore purchases, selection, owner, ad rights and rooms; tampering and overwrite are refused',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'manager-restore-')),data=path.join(root,'data'),backups=path.join(root,'backups'),dest=path.join(root,'restored');fs.mkdirSync(data);
 const owner='9001',user='9002',file=path.join(data,'telegram.sqlite'),store=new Store(file,Date.now,{ownerTelegramId:owner});store.user({id:owner,name:'Owner'});store.user({id:user,name:'Player'});const order=store.order(user,'character:mira');store.paid(user,{invoice_payload:order.id,total_amount:10,currency:'XTR',telegram_payment_charge_id:'backup-fixture-charge'});store.select(user,{character:'mira'});const ad=store.beginAd(user,'style:arcade');store.reward({receiptId:'restore-receipt-1',intentId:ad.id,userId:user,itemId:'style:arcade',completedAt:Date.now()});store.close();
 const rooms=new DatabaseSync(path.join(data,'rooms.sqlite'));rooms.exec("CREATE TABLE rooms(code TEXT PRIMARY KEY,data TEXT);INSERT INTO rooms VALUES('fixture','{\"gameRevision\":9,\"confirmed\":true}')");rooms.close();
 const snapshot=await backupSet({dataDirectory:data,backupDirectory:backups});restoreSet({snapshotDirectory:snapshot,destinationDirectory:dest});const restored=new Store(path.join(dest,'telegram.sqlite'),Date.now,{ownerTelegramId:owner});assert.equal(restored.profile(user).profile.character,'mira');assert(restored.access(user,'character:mira').permanent);assert(restored.access(user,'style:arcade').available);assert.equal(restored.role(owner),'owner');assert.equal(restored.db.prepare('SELECT count(*) AS n FROM orders').get().n,1);restored.close();
 const restoredRooms=new DatabaseSync(path.join(dest,'rooms.sqlite'));assert.equal(JSON.parse(restoredRooms.prepare('SELECT data FROM rooms').get().data).gameRevision,9);restoredRooms.close();assert.throws(()=>restoreSet({snapshotDirectory:snapshot,destinationDirectory:dest}),/must not exist/);
 fs.appendFileSync(path.join(snapshot,'rooms.sqlite'),'tamper');assert.throws(()=>restoreSet({snapshotDirectory:snapshot,destinationDirectory:path.join(root,'tampered')}),/checksum/);
 // Test data is intentionally left under the OS temporary directory; no recursive delete.
});
