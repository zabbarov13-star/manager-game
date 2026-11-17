'use strict';
const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const catalog=require('./catalog.cjs');
const DAY=86400000;
const dayKey=now=>new Date(now+10800000).toISOString().slice(0,10);
const resetAt=now=>(Math.floor((now+10800000)/DAY)+1)*DAY-10800000;
function fail(message,status=409){throw Object.assign(Error(message),{status});}
class Store{
 constructor(file=':memory:',clock=Date.now){this.now=clock;this.db=new DatabaseSync(file);this.db.exec(`
 PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS profiles(user TEXT PRIMARY KEY,name TEXT NOT NULL,character TEXT NOT NULL DEFAULT 'cassette',style TEXT NOT NULL DEFAULT 'heritage',dice TEXT,effect TEXT);
 CREATE TABLE IF NOT EXISTS grants(user TEXT NOT NULL,item TEXT NOT NULL,source TEXT NOT NULL,expires INTEGER,revoked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user,item,source));
 CREATE TABLE IF NOT EXISTS ads(id TEXT PRIMARY KEY,user TEXT NOT NULL,item TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,receipt TEXT UNIQUE,day TEXT,issued INTEGER);
 CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,received INTEGER NOT NULL,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user TEXT NOT NULL,product TEXT NOT NULL,amount INTEGER NOT NULL,items TEXT NOT NULL,created INTEGER NOT NULL,status TEXT NOT NULL,charge TEXT UNIQUE,checkout_query TEXT);
 CREATE TABLE IF NOT EXISTS updates(id INTEGER PRIMARY KEY,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS grants_user ON grants(user);
 CREATE INDEX IF NOT EXISTS ads_user_day ON ads(user,day,status);
 CREATE INDEX IF NOT EXISTS orders_user ON orders(user,status);
 `);}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 user(user){this.db.prepare('INSERT INTO profiles(user,name) VALUES(?,?) ON CONFLICT(user) DO UPDATE SET name=excluded.name').run(user.id,user.name);}
 access(user,item,now=this.now()){
  if(catalog.items.some(i=>i.id===item&&i.free))return {available:true,permanent:true,expires:null};
  const rows=this.db.prepare('SELECT expires FROM grants WHERE user=? AND item=? AND revoked=0').all(user,item);
  const permanent=rows.some(r=>r.expires===null),expires=Math.max(0,...rows.map(r=>r.expires??0));
  return {available:permanent||expires>now,permanent,expires:permanent?null:expires};
 }
 profile(user){const now=this.now(),profile=this.db.prepare('SELECT character,style,dice,effect FROM profiles WHERE user=?').get(user);
  const accesses=Object.fromEntries(catalog.items.map(i=>[i.id,this.access(user,i.id,now)]));
  if(!accesses[`style:${profile.style}`]?.available){profile.style='heritage';this.db.prepare('UPDATE profiles SET style=? WHERE user=?').run('heritage',user);}
  const used=this.db.prepare("SELECT count(*) AS n FROM ads WHERE user=? AND day=? AND status='issued'").get(user,dayKey(now)).n;
  return {profile,access:accesses,ads:{remaining:3-used,resetAt:resetAt(now)},serverTime:now};
 }
 select(user,values){return this.tx(()=>{for(const field of ['character','style','dice','effect'])if(Object.hasOwn(values,field)){
   const value=values[field];if(value===null&&['dice','effect'].includes(field)){this.db.prepare(`UPDATE profiles SET ${field}=NULL WHERE user=?`).run(user);continue;}
   if(typeof value!=='string'||!this.access(user,`${field}:${value}`).available)fail('Предмет недоступен.',403);
   this.db.prepare(`UPDATE profiles SET ${field}=? WHERE user=?`).run(value,user);
  }return this.profile(user);});}
 beginAd(user,item){return this.tx(()=>{const now=this.now(),known=catalog.items.find(i=>i.id===item);
  if(!known||known.free||this.access(user,item).permanent)fail('Награда не требует рекламы.');
  const status=this.profile(user);if(status.ads.remaining<=0)fail('Сегодня все три награды получены.');
  if(this.access(user,item).expires>=now+3*DAY)fail('Уже накоплены 72 часа.');
  this.db.prepare("UPDATE ads SET status='expired' WHERE user=? AND status='pending' AND expires<=?").run(user,now);
  if(this.db.prepare("SELECT id FROM ads WHERE user=? AND status='pending'").get(user))fail('Завершите предыдущий просмотр.');
  const id=randomUUID();this.db.prepare("INSERT INTO ads(id,user,item,created,expires,status) VALUES(?,?,?,?,?,'pending')").run(id,user,item,now,now+15*60000);
  return {id,item,expires:now+15*60000};
 });}
 cancelAd(user,id){this.db.prepare("UPDATE ads SET status='cancelled' WHERE user=? AND id=? AND status='pending'").run(user,id);}
 reward({receiptId,intentId,userId,itemId,completedAt}){return this.tx(()=>{
  const now=this.now();if(typeof receiptId!=='string'||receiptId.length<8||receiptId.length>200)fail('Неверный receipt.',400);
  if(this.db.prepare('SELECT id FROM receipts WHERE id=?').get(receiptId))return {duplicate:true};
  const ad=this.db.prepare('SELECT * FROM ads WHERE id=? AND user=? AND item=?').get(intentId,String(userId),itemId);
  if(!ad||ad.status!=='pending'||ad.expires<=now||!Number.isSafeInteger(completedAt)||completedAt<ad.created||completedAt>now+30000)fail('Нет действующего подтверждённого просмотра.');
  if(this.profile(ad.user).ads.remaining<=0||this.access(ad.user,ad.item).permanent)fail('Награда уже недоступна.');
  const old=this.access(ad.user,ad.item).expires??0,expires=Math.max(old,Math.min(Math.max(now,old)+DAY,now+3*DAY));
  this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(receiptId,now,JSON.stringify({intentId,userId,itemId,completedAt}));
  this.db.prepare("INSERT INTO grants(user,item,source,expires) VALUES(?,?,'ads',?) ON CONFLICT(user,item,source) DO UPDATE SET expires=excluded.expires,revoked=0").run(ad.user,ad.item,expires);
  this.db.prepare("UPDATE ads SET status='issued',receipt=?,day=?,issued=? WHERE id=?").run(receiptId,dayKey(now),now,ad.id);
  return {expires};
 });}
 order(user,productId){return this.tx(()=>{const product=catalog.products.find(p=>p.id===productId);if(!product)fail('Товар не найден.',404);
  const overlap=product.items.filter(item=>this.access(user,item).permanent);if(overlap.length)fail('Часть набора уже куплена: '+overlap.join(', '));
  const now=this.now();const pending=this.db.prepare("SELECT items FROM orders WHERE user=? AND status IN ('created','checkout') AND created>?").all(user,now-30*60000);
  if(pending.some(p=>JSON.parse(p.items).some(i=>product.items.includes(i))))fail('Счёт на эти предметы уже создан. Дождитесь завершения или истечения 30 минут.');
  const id=randomUUID();this.db.prepare("INSERT INTO orders(id,user,product,amount,items,created,status) VALUES(?,?,?,?,?,?,'created')").run(id,user,product.id,product.price,JSON.stringify(product.items),now);return {...product,id,productId:product.id};
 });}
 checkPayment(user,payment){const o=this.db.prepare('SELECT * FROM orders WHERE id=?').get(payment.invoice_payload);
  if(!o||o.user!==String(user)||o.amount!==payment.total_amount||payment.currency!=='XTR')fail('Платёж не соответствует счёту.',400);return o;
 }
 checkout(user,payment){return this.tx(()=>{const o=this.checkPayment(user,payment);if(o.status==='checkout'&&o.checkout_query===payment.id)return true;if(o.status!=='created'||o.created<this.now()-30*60000)fail('Счёт недействителен.');
  if(JSON.parse(o.items).some(i=>this.access(o.user,i).permanent))fail('Предмет уже куплен.');this.db.prepare("UPDATE orders SET status='checkout',checkout_query=? WHERE id=?").run(payment.id??'',o.id);return true;
 });}
 paid(user,payment){return this.tx(()=>{const o=this.checkPayment(user,payment),charge=payment.telegram_payment_charge_id;
  if(typeof charge!=='string'||!charge)fail('Нет ID платежа.',400);
  if(o.charge){if(o.charge===charge)return {duplicate:true};fail('Повторная оплата того же счёта.');}
  this.db.prepare("UPDATE orders SET status='paid',charge=? WHERE id=?").run(charge,o.id);
  for(const item of JSON.parse(o.items))this.db.prepare('INSERT INTO grants(user,item,source,expires) VALUES(?,?,?,NULL)').run(o.user,item,`payment:${charge}`);
  return {granted:JSON.parse(o.items)};
 });}
 refunded(user,payment){return this.tx(()=>{const o=this.checkPayment(user,payment);if(o.charge!==payment.telegram_payment_charge_id)fail('Возврат не соответствует платежу.',400);
  this.db.prepare("UPDATE orders SET status='refunded' WHERE id=?").run(o.id);this.db.prepare('UPDATE grants SET revoked=1 WHERE user=? AND source=?').run(o.user,`payment:${o.charge}`);return {refunded:true};
 });}
 close(){this.db.close();}
}
module.exports={Store,dayKey,resetAt,DAY};
