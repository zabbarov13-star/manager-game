'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {Store,DAY,dayKey,resetAt}=require('../store.cjs');
const {validateInitData}=require('../auth.cjs');
const catalog=require('../catalog.cjs');
function fixture(){let time=Date.UTC(2026,10,18,12);const s=new Store(':memory:',()=>time);s.user({id:'123',name:'Игрок'});return {s,now:()=>time,advance:ms=>time+=ms};}
function receipt(f,item='character:mira',id='receipt-'+Math.random()){const intent=f.s.beginAd('123',item);return {receiptId:id,intentId:intent.id,userId:'123',itemId:item,completedAt:f.now()};}
test('catalog has exactly 6 free + 12 premium; Ruslan and Adel last, decorative stats unique',()=>{
 assert.equal(catalog.characters.length,18);assert.deepEqual(catalog.characters.filter(c=>c.free).map(c=>c.name).slice(-2),['Руслан','Адель']);
 assert.equal(catalog.characters.filter(c=>!c.free).length,12);assert.equal(new Set(catalog.characters.map(c=>c.stats.join(','))).size,18);
 assert(catalog.characters.every(c=>c.stats.length===5&&c.stats.every(v=>v>=1&&v<=10)));
 assert.equal(catalog.styles.filter(s=>s.free).length,1);assert.equal(catalog.packs.filter(p=>p.price===25).length,4);
});
test('initData accepts correct HMAC and rejects forged, duplicate and expired data',()=>{
 const now=Date.now(),token='123:test',p=new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id:123,first_name:'A'})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',secret).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 assert.equal(validateInitData(p.toString(),token,now).id,'123');assert.throws(()=>validateInitData(p+'&user=x',token,now));
 assert.throws(()=>validateInitData(p.toString().replace('A','B'),token,now));assert.throws(()=>validateInitData(p.toString(),token,now+7200000));
});
test('failed views do not consume quota; receipt is required and cannot replay',()=>{
 const f=fixture(),r=receipt(f);assert.equal(f.s.profile('123').ads.remaining,3);f.s.reward(r);assert.equal(f.s.profile('123').ads.remaining,2);
 assert.equal(f.s.reward(r).duplicate,true);assert.equal(f.s.profile('123').ads.remaining,2);assert.throws(()=>f.s.reward({...r,receiptId:'different-receipt'}));
 const i=f.s.beginAd('123','style:arcade');f.s.cancelAd('123',i.id);assert.equal(f.s.profile('123').ads.remaining,2);f.s.close();
});
test('global three-view limit, extensions to 72 hours, Moscow midnight and no shortening',()=>{
 const f=fixture();for(let i=1;i<=3;i++){f.s.reward(receipt(f));assert.equal(f.s.access('123','character:mira').expires,f.now()+i*DAY);}
 assert.equal(f.s.profile('123').ads.remaining,0);assert.throws(()=>f.s.beginAd('123','style:arcade'));
 f.advance(9*3600000);assert.equal(f.s.profile('123').ads.remaining,3);f.s.reward(receipt(f));assert.equal(f.s.access('123','character:mira').expires,f.now()+3*DAY);
 assert.throws(()=>f.s.beginAd('123','character:mira'));assert.equal(dayKey(Date.UTC(2026,10,18,21)),'2026-11-19');assert.equal(resetAt(Date.UTC(2026,10,18,20,59)),Date.UTC(2026,10,18,21));f.s.close();
});
test('concurrent intents and pending overlapping orders are rejected',()=>{
 const f=fixture();const a=f.s.beginAd('123','character:mira');assert.throws(()=>f.s.beginAd('123','style:arcade'));f.s.cancelAd('123',a.id);
 f.s.order('123','character:mira');assert.throws(()=>f.s.order('123','pack:characters-1'));f.s.close();
});
test('Stars require exact account, currency, amount; duplicate events and refunds preserve independent grants',()=>{
 const f=fixture();f.s.reward(receipt(f));const o=f.s.order('123','character:mira'),p={invoice_payload:o.id,total_amount:10,currency:'XTR',telegram_payment_charge_id:'charge-1'};
 assert.throws(()=>f.s.paid('999',p));assert.throws(()=>f.s.paid('123',{...p,total_amount:1}));assert.throws(()=>f.s.paid('123',{...p,currency:'USD'}));
 f.s.checkout('123',p);f.s.paid('123',p);assert.equal(f.s.access('123','character:mira').permanent,true);assert.equal(f.s.paid('123',p).duplicate,true);
 assert.throws(()=>f.s.order('123','character:mira'));assert.throws(()=>f.s.beginAd('123','character:mira'));f.s.refunded('123',p);
 assert.equal(f.s.access('123','character:mira').permanent,false);assert.equal(f.s.access('123','character:mira').available,true);f.advance(DAY+1);assert.equal(f.s.access('123','character:mira').available,false);f.s.close();
});
test('expired style returns to heritage; selecting locked items is refused',()=>{
 const f=fixture();assert.throws(()=>f.s.select('123',{character:'mira'}));f.s.reward(receipt(f,'style:arcade'));f.s.select('123',{style:'arcade'});f.advance(DAY+1);
 assert.equal(f.s.profile('123').profile.style,'heritage');f.s.close();
});
test('permanent purchases survive database reopen and verified SQLite backup',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manager-telegram-test-')),file=path.join(dir,'source.sqlite'),backupDir=path.join(dir,'backups');
 let s=new Store(file);s.user({id:'123',name:'Persistence test'});const o=s.order('123','character:mira');s.paid('123',{invoice_payload:o.id,total_amount:10,currency:'XTR',telegram_payment_charge_id:'durable-charge'});s.close();
 s=new Store(file);assert.equal(s.access('123','character:mira').permanent,true);s.close();
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../backup.cjs')],{env:{...process.env,TELEGRAM_DATABASE:file,BACKUP_DIRECTORY:backupDir},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const copy=path.join(backupDir,fs.readdirSync(backupDir)[0]);s=new Store(copy);assert.equal(s.access('123','character:mira').permanent,true);s.close();
 for(const parent of [backupDir,dir]){for(const entry of fs.readdirSync(parent,{withFileTypes:true}))if(entry.isFile())fs.unlinkSync(path.join(parent,entry.name));if(parent===backupDir)fs.rmdirSync(parent);}fs.rmdirSync(dir);
});
