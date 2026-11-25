'use strict';
const {createHmac,timingSafeEqual,createHash}=require('node:crypto');
const PLACEMENT='7490adb6-4d31-465c-ace6-815455d05220',BOT_ID='9201365065';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(status){throw Object.assign(Error('Invalid LiteBits callback.'),{status});}
function verify(raw,headers,secret,placement,now){
 const timestamp=headers['x-lba-timestamp'],signature=headers['x-lba-signature'],eventId=headers['x-lba-event-id'];
 if(typeof timestamp!=='string'||!/^\d{10,11}$/.test(timestamp)||String(Number(timestamp))!==timestamp||Math.abs(now/1000-Number(timestamp))>300)fail(401);
 if(typeof signature!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(signature))fail(401);
 const expected=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('base64url');
 if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail(401);
 let event;try{event=JSON.parse(raw.toString('utf8'));}catch{fail(400);}
 if(!event||Array.isArray(event)||!uuid.test(eventId??'')||event.event_id!==eventId||event.event!=='impression.verified'||event.placement_id!==placement||!Number.isSafeInteger(event.telegram_user_id)||event.telegram_user_id<=0||(event.ext_user_id!==undefined&&event.ext_user_id!==String(event.telegram_user_id)))fail(400);
 const completedAt=Date.parse(event.occurred_at);
 if(typeof event.occurred_at!=='string'||!Number.isSafeInteger(completedAt)||completedAt>now+30000||completedAt<now-86400000)fail(400);
 return{id:eventId,user:String(event.telegram_user_id),completedAt,hash:createHash('sha256').update(raw).digest('hex')};
}
function create(store,{secret,placement=PLACEMENT}){
 // Additive tables only. Existing ads/grants remain the shared quota and entitlement ledger.
 store.db.exec(`CREATE TABLE IF NOT EXISTS litebits_intents(id TEXT PRIMARY KEY REFERENCES ads(id),user TEXT NOT NULL,placement TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS litebits_intents_user ON litebits_intents(user,placement,created);
 CREATE TABLE IF NOT EXISTS litebits_events(id TEXT PRIMARY KEY,hash TEXT NOT NULL,received INTEGER NOT NULL,user TEXT NOT NULL,placement TEXT NOT NULL,intent TEXT,outcome TEXT NOT NULL);`);
 return{
  begin(user,item){return store.tx(()=>{const intent=store.beginAdInTransaction(user,item);store.db.prepare('INSERT INTO litebits_intents VALUES(?,?,?,?,?)').run(intent.id,String(user),placement,store.now(),intent.expires);return intent;});},
  callback(raw,headers){
   const event=verify(raw,headers,secret,placement,store.now());
   return store.tx(()=>{
    const previous=store.db.prepare('SELECT hash FROM litebits_events WHERE id=?').get(event.id);
    if(previous){if(previous.hash!==event.hash)fail(409);return{ok:true,duplicate:true};}
    // No documented signed nonce exists. Bind only to a unique server-recorded opt-in
    // whose time window contains the signed completion, never to the latest client claim.
    const intents=store.db.prepare(`SELECT a.* FROM litebits_intents l JOIN ads a ON a.id=l.id WHERE l.user=? AND l.placement=? AND l.created<=? AND l.expires>? AND a.status IN ('pending','expired')`).all(event.user,placement,event.completedAt,event.completedAt);
    const ad=intents.length===1?intents[0]:null;let outcome='unmatched';
    if(ad){
     if(store.profile(ad.user).ads.remaining<=0)outcome='quota';
     else if(store.access(ad.user,ad.item).permanent)outcome='permanent';
     else if(store.access(ad.user,ad.item).expires>=store.now()+3*86400000)outcome='duration_cap';
     else{store.rewardInTransaction({receiptId:'litebits:'+event.id,intentId:ad.id,userId:ad.user,itemId:ad.item,completedAt:event.completedAt},true);outcome='issued';}
    }
    store.db.prepare('INSERT INTO litebits_events VALUES(?,?,?,?,?,?,?)').run(event.id,event.hash,store.now(),event.user,placement,ad?.id??null,outcome);
    return{ok:true,credited:outcome==='issued'};
   });
  }
 };
}
module.exports={create,verify,PLACEMENT,BOT_ID};
