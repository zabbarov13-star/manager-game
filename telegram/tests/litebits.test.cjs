'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHmac}=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{once}=require('node:events');
const {Store}=require('../store.cjs'),{create,PLACEMENT}=require('../litebits.cjs'),{createApp}=require('../server.cjs');
const SECRET='synthetic-callback-secret-'.repeat(3),TOKEN='9201365065:synthetic-token-only';
function fixture(file=':memory:'){
 let now=Date.UTC(2026,10,25,12);const store=new Store(file,()=>now,{ownerTelegramId:''});store.user({id:'123',name:'Fixture'});
 const provider=create(store,{secret:SECRET});
 const sign=(event,extra={})=>{const raw=Buffer.from(JSON.stringify(event)),ts=String(Math.floor(now/1000));return{raw,headers:{'x-lba-timestamp':ts,'x-lba-event-id':event.event_id,'x-lba-signature':createHmac('sha256',SECRET).update(ts+'.').update(raw).digest('base64url'),...extra}};};
 const event=()=>({event:'impression.verified',event_id:randomUUID(),placement_id:PLACEMENT,telegram_user_id:123,ext_user_id:'123',occurred_at:new Date(now).toISOString()});
 const deliver=e=>{const s=sign(e);return provider.callback(s.raw,s.headers);};
 return{store,provider,event,sign,deliver,advance:ms=>now+=ms,close:()=>store.close()};
}
test('signed callback grants only a server opt-in; duplicate event/header mutation never grants twice',()=>{
 const f=fixture();try{f.provider.begin('123','character:mira');assert.equal(f.store.access('123','character:mira').available,false);const e=f.event();assert.equal(f.deliver(e).credited,true);assert.equal(f.deliver(e).duplicate,true);assert.equal(f.store.profile('123').ads.remaining,2);
  const s=f.sign(e,{'x-lba-event-id':randomUUID()});assert.throws(()=>f.provider.callback(s.raw,s.headers),{status:400});assert.throws(()=>f.deliver({...e,earning:99}),{status:409});
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM receipts').get().n,1);
 }finally{f.close();}
});
for(const type of ['signature','timestamp','placement','user','ext-user','event','future'])test('reject forged or mismatched LiteBits callback: '+type,()=>{
 const f=fixture();try{f.provider.begin('123','character:mira');const e=f.event();if(type==='placement')e.placement_id=randomUUID();if(type==='user')e.telegram_user_id='123';if(type==='ext-user')e.ext_user_id='999';if(type==='event')e.event='rewarded';if(type==='future')e.occurred_at='2099-01-01T00:00:00Z';const s=f.sign(e);if(type==='signature')s.headers['x-lba-signature']='a'.repeat(43);if(type==='timestamp')s.headers['x-lba-timestamp']='1000000000';assert.throws(()=>f.provider.callback(s.raw,s.headers));assert.equal(f.store.profile('123').ads.remaining,3);assert.equal(f.store.db.prepare('SELECT count(*) n FROM litebits_events').get().n,0);}finally{f.close();}
});
test('three confirmed rewards, fourth opt-in blocked; shared SQLite quota and 72h cap',()=>{
 const f=fixture();try{for(let i=1;i<=3;i++){f.provider.begin('123','character:mira');assert.equal(f.deliver(f.event()).credited,true);assert.equal(f.store.profile('123').ads.remaining,3-i);f.advance(1000);}
  assert.throws(()=>f.provider.begin('123','style:arcade'));assert.equal(f.store.db.prepare("SELECT count(*) n FROM ads WHERE status='issued'").get().n,3);assert.equal(f.deliver(f.event()).credited,false);
 }finally{f.close();}
});
test('unmatched/cancelled/wrong-user callbacks cannot attach to a later opt-in',()=>{
 const f=fixture();try{const old=f.event();assert.equal(f.deliver(old).credited,false);f.advance(1000);const intent=f.provider.begin('123','character:mira');assert.equal(f.deliver(old).duplicate,true);
  const other=f.event();other.telegram_user_id=456;other.ext_user_id='456';assert.equal(f.deliver(other).credited,false);f.store.cancelAd('123',intent.id);assert.equal(f.deliver(f.event()).credited,false);assert.equal(f.store.profile('123').ads.remaining,3);
 }finally{f.close();}
});
test('delayed signed callback matches original window across expiry and restart; newer opt-in unchanged',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'manager-litebits-')),file=path.join(folder,'fixture.sqlite');let f=fixture(file);
 try{const first=f.provider.begin('123','character:mira');f.advance(1000);const e=f.event();f.close();f=fixture(file);f.advance(2*3600000);const next=f.provider.begin('123','style:arcade');assert.equal(f.deliver(e).credited,true);assert.equal(f.store.db.prepare('SELECT status FROM ads WHERE id=?').get(first.id).status,'issued');assert.equal(f.store.db.prepare('SELECT status FROM ads WHERE id=?').get(next.id).status,'pending');f.close();f=fixture(file);assert.equal(f.deliver(e).duplicate,true);assert(f.store.access('123','character:mira').available);assert.equal(f.store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{f.close();fs.rmSync(folder,{recursive:true,force:true,maxRetries:3});}
});
test('event ledger and reward roll back together; begin mapping failure leaves no orphan intent',()=>{
 const f=fixture();try{f.store.db.exec("CREATE TRIGGER fail_begin BEFORE INSERT ON litebits_intents BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");assert.throws(()=>f.provider.begin('123','character:mira'));assert.equal(f.store.db.prepare('SELECT count(*) n FROM ads').get().n,0);f.store.db.exec('DROP TRIGGER fail_begin');f.provider.begin('123','character:mira');const e=f.event();f.store.db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON litebits_events BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");assert.throws(()=>f.deliver(e));assert.equal(f.store.profile('123').ads.remaining,3);assert.equal(f.store.db.prepare('SELECT count(*) n FROM receipts').get().n,0);assert.equal(f.store.access('123','character:mira').available,false);f.store.db.exec('DROP TRIGGER fail_event');assert.equal(f.deliver(e).credited,true);
 }finally{f.close();}
});
test('HTTP adapter authenticates initData and enforces OFF; publishable SDK key requires session',async()=>{
 const origin='https://litebits.fixture';let app,base;
 const open=async enabled=>{app=createApp({mode:'adapter',environment:'production',database:':memory:',ownerTelegramId:'',botToken:TOKEN,webhookSecret:'w'.repeat(32),rpcSecret:'r'.repeat(32),origin,starsEnabled:false,gatewayEnabled:false,interstitialEnabled:false,liteBitsEnabled:enabled,liteBitsRewardsEnabled:enabled,liteBitsApiKey:'lba_synthetic_publishable',liteBitsCallbackSecret:SECRET,bot:async()=>assert.fail('no Bot API calls')}).listen(0,'127.0.0.1');await once(app,'listening');base='http://127.0.0.1:'+app.address().port;};
 const close=async()=>{if(app?.listening)await new Promise(r=>app.close(r));};
 const request=(route,data,token)=>fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123,first_name:'Fixture'})});p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(TOKEN).digest()).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 try{for(const enabled of [false,true]){await open(enabled);assert.equal((await request('/api/session',{initData:'forged'})).status,401);const sessionResponse=await request('/api/session',{initData:p.toString()});assert.equal(sessionResponse.status,200);const session=await sessionResponse.json();assert.equal(session.features.liteBits,enabled);assert.equal(session.features.ads,false);assert.equal(session.features.stars,false);assert(!JSON.stringify(session).includes('lba_synthetic'));assert.equal((await request('/api/litebits/config',{})).status,401);const config=await request('/api/litebits/config',{},session.token);assert.equal(config.status,enabled?200:503);if(enabled){const value=await config.json();assert.equal(value.placementId,PLACEMENT);assert.equal(value.apiKey,'lba_synthetic_publishable');assert(!JSON.stringify(value).includes(SECRET));}
   assert.equal((await request('/api/litebits/begin',{item:'character:mira'},session.token)).status,enabled?200:503);assert.equal((await request('/api/ads/begin',{item:'character:mira'},session.token)).status,503);assert.equal((await request('/api/invoice',{product:'character:mira'},session.token)).status,503);assert.equal((await request('/ads/litebits/callback',{})).status,enabled?401:503);
   if(enabled){const event={event:'impression.verified',event_id:require('node:crypto').randomUUID(),placement_id:PLACEMENT,telegram_user_id:123,occurred_at:new Date().toISOString()},raw=JSON.stringify(event),ts=String(Math.floor(Date.now()/1000));const callback=()=>fetch(base+'/ads/litebits/callback',{method:'POST',headers:{'Content-Type':'application/json','x-lba-timestamp':ts,'x-lba-event-id':event.event_id,'x-lba-signature':createHmac('sha256',SECRET).update(ts+'.'+raw).digest('base64url')},body:raw});assert.equal((await callback()).status,200);const duplicate=await callback();assert.equal((await duplicate.json()).duplicate,true);assert.equal(app.store.profile('123').ads.remaining,2);}
await close();}
 }finally{await close();}
});
