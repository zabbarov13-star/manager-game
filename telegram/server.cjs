'use strict';
const {createServer}=require('node:http');
const {readFileSync,mkdirSync,existsSync}=require('node:fs');
const {resolve,dirname,extname}=require('node:path');
const {randomBytes,createHmac}=require('node:crypto');
const {Store}=require('./store.cjs');
const {validateInitData,equal}=require('./auth.cjs');
const catalog=require('./catalog.cjs');
function createApp(config={}){
 const token=config.botToken??process.env.TELEGRAM_BOT_TOKEN;
 const webhookSecret=config.webhookSecret??process.env.TELEGRAM_WEBHOOK_SECRET;
 const receiptSecret=config.receiptSecret??process.env.ADS_RECEIPT_SECRET;
 const blockId=config.blockId??process.env.ADSGRAM_BLOCK_ID;
 const gatewayEnabled=config.gatewayEnabled??process.env.ADS_VERIFIED_GATEWAY_ENABLED==='1';
 const origin=config.origin??process.env.PUBLIC_ORIGIN;
 if(!token||!webhookSecret||!origin)throw Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_ORIGIN.');
 if(new URL(origin).protocol!=='https:'&&!config.allowHttp)throw Error('PUBLIC_ORIGIN must use HTTPS.');
 if(webhookSecret.length<32||(gatewayEnabled&&(!receiptSecret||receiptSecret.length<32)))throw Error('Use independent secrets of at least 32 characters.');
 const file=config.database??process.env.TELEGRAM_DATABASE??resolve(__dirname,'data/telegram.sqlite');
 if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
 const store=config.store??new Store(file),sessions=new Map(),rates=new Map();
 const rooms=require('./rooms.cjs').createRooms({database:config.roomsDatabase??(file===':memory:'?':memory:':resolve(dirname(file),'rooms.sqlite')),allowedOrigins:[origin],trustProxy:false});
 const root=config.dist??resolve(__dirname,'dist');
 const bot=config.bot??(async(method,body)=>{
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  const data=await r.json();if(!r.ok||!data.ok)throw Object.assign(Error('Telegram временно недоступен.'),{status:502});return data.result;
 });
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const body=async req=>{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw Object.assign(Error('Слишком большой запрос.'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');};
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  const url=new URL(req.url,'http://localhost');
  try{
   if(url.pathname==='/health')return send(res,200,{ok:true,service:'manager-telegram',adsConfigured:!!(gatewayEnabled&&blockId),starsConfigured:true});
   const remote=req.socket.remoteAddress??'unknown',now=Date.now();
   if(rates.size>4096)for(const [key,value]of rates)if(value.until<now)rates.delete(key);
   let rate=rates.get(remote);if(!rate||rate.until<now){rate={n:0,until:now+60000};rates.set(remote,rate);}if(++rate.n>240)return send(res,429,{error:'Повторите запрос позже.'});
   if(url.pathname==='/api/rooms'||url.pathname.startsWith('/api/rooms/')){rooms.emit('request',req,res);return;}
   if(url.pathname==='/telegram/webhook'&&req.method==='POST'){
    if(!equal(req.headers['x-telegram-bot-api-secret-token']??'',webhookSecret))return send(res,403,{error:'Forbidden'});
    const update=JSON.parse(await body(req));if(!Number.isSafeInteger(update.update_id))return send(res,400,{error:'Invalid update'});
    if(store.db.prepare('SELECT id FROM updates WHERE id=?').get(update.update_id))return send(res,200,{ok:true});
    if(update.pre_checkout_query){const q=update.pre_checkout_query;let error;
     try{store.checkout(String(q.from.id),q);}catch(e){error=e.message;}
     await bot('answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok:!error,...(error?{error_message:error}:{})});
    }
    const msg=update.message;
    if(msg?.text?.match(/^\/paysupport(?:@\w+)?(?:\s|$)/))await bot('sendMessage',{chat_id:msg.chat.id,text:process.env.SUPPORT_CONTACT?'Помощь по покупкам: '+process.env.SUPPORT_CONTACT:'Поддержка платежей ещё не настроена владельцем приложения. Не совершайте покупки до настройки поддержки.'});
    if(msg?.successful_payment)store.paid(String(msg.from.id),msg.successful_payment);
    if(msg?.refunded_payment)store.refunded(String(msg.from.id),msg.refunded_payment);
    store.db.prepare('INSERT OR IGNORE INTO updates VALUES(?,?)').run(update.update_id,now);return send(res,200,{ok:true});
   }
   // This is an INTERNAL authenticated receipt-gateway contract, not a native AdsGram signature.
   // Native Reward URL only supplies userId and cannot prove a unique event. Never grant from it.
   if(url.pathname==='/ads/verified-receipt'&&req.method==='POST'){
    if(!gatewayEnabled||!receiptSecret)return send(res,503,{error:'Verified provider gateway is not configured.'});
    const raw=await body(req),timestamp=req.headers['x-receipt-timestamp'],signature=req.headers['x-receipt-signature'];
    if(!/^\d{13}$/.test(timestamp??'')||Math.abs(now-Number(timestamp))>300000||!equal(signature??'',createHmac('sha256',receiptSecret).update(`${timestamp}.${raw}`).digest('hex')))return send(res,403,{error:'Forbidden'});
    return send(res,200,store.reward(JSON.parse(raw)));
   }
   if(url.pathname.startsWith('/api/')){
    if(req.headers.origin&&req.headers.origin!==origin)return send(res,403,{error:'Forbidden origin'});
    if(url.pathname==='/api/session'&&req.method==='POST'){
     let user;try{user=validateInitData(JSON.parse(await body(req)).initData,token);}catch(e){e.status=401;throw e;}store.user(user);
     for(const [key,value]of sessions)if(value.expires<now)sessions.delete(key);
     if(sessions.size>=10000)return send(res,503,{error:'Сервер занят.'});
     const session=randomBytes(32).toString('hex');sessions.set(session,{user:user.id,expires:now+12*3600000});
     return send(res,200,{token:session,user, ...store.profile(user.id),catalog,features:{ads:!!(gatewayEnabled&&blockId),blockId:gatewayEnabled?blockId:null,stars:true}});
    }
    const session=sessions.get((req.headers.authorization??'').replace(/^Bearer /,''));
    if(!session||session.expires<=now)return send(res,401,{error:'Откройте приложение заново в Telegram.'});
    const user=session.user;
    if(url.pathname==='/api/profile'&&req.method==='GET')return send(res,200,store.profile(user));
    const data=req.method==='POST'?JSON.parse(await body(req)):{};
    if(url.pathname==='/api/profile'&&req.method==='POST')return send(res,200,store.select(user,data));
    if(url.pathname==='/api/ads/begin'&&req.method==='POST'){
     if(!gatewayEnabled||!blockId)return send(res,503,{error:'Серверное подтверждение AdsGram ещё не подключено.'});
     return send(res,200,store.beginAd(user,data.item));
    }
    if(url.pathname==='/api/ads/cancel'&&req.method==='POST'){store.cancelAd(user,data.id);return send(res,200,{ok:true});}
    if(url.pathname==='/api/invoice'&&req.method==='POST'){
     const order=store.order(user,data.product);
     try{const invoice=await bot('createInvoiceLink',{title:order.name,description:order.items.map(id=>catalog.items.find(i=>i.id===id)?.name).join(', ')+' · навсегда',payload:order.id,provider_token:'',currency:'XTR',prices:[{label:order.name,amount:order.price}]});return send(res,200,{invoice,orderId:order.id});}
     catch(e){store.db.prepare("UPDATE orders SET status='failed' WHERE id=? AND status='created'").run(order.id);throw e;}
    }
    if(url.pathname==='/api/invoice/cancel'&&req.method==='POST'){store.db.prepare("UPDATE orders SET status='cancelled' WHERE user=? AND id=? AND status='created'").run(user,data.orderId);return send(res,200,{ok:true});}
    return send(res,404,{error:'Не найдено.'});
   }
   if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'});
   const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
   const path=resolve(root,name);if(!path.startsWith(root+require('node:path').sep)||!existsSync(path))return send(res,404,{error:'Не найдено.'});
   const ext=extname(path);if(!['.html','.js','.css','.webp','.png','.json','.webmanifest'].includes(ext))return send(res,404,{error:'Не найдено.'});
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
   res.writeHead(200,{'Content-Type':mime[ext],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(path));
  }catch(e){send(res,e.status??(e instanceof SyntaxError?400:500),{error:e.status||e instanceof SyntaxError?e.message:'Сервис временно недоступен.'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=256;
 server.on('close',()=>{store.close();rooms.emit('close');});server.store=store;return server;
}
if(require.main===module){process.umask(0o077);createApp().listen(Number(process.env.PORT??8090),process.env.BIND??'127.0.0.1');}
module.exports={createApp};
