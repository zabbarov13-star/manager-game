'use strict';
// Optional transport fallback for networks where Telegram cannot reach our HTTPS webhook.
// Run exactly one poller and delete the Telegram webhook before enabling it.
// Updates are forwarded to the existing authenticated local webhook handler, preserving
// deduplication, payment verification, persistence and all game-specific behavior.
const {setTimeout:sleep}=require('node:timers/promises');
const {environment}=require('./bot-api.cjs');

function createPoller({token,secret,port=8443,mode='production',fetcher=globalThis.fetch,delay=sleep,logger=console}={}){
 if(!token||!secret)throw Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required.');
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid adapter port.');
 const prefix=environment(mode)==='test'?'test/':'';
 const api='https://api.telegram.org/bot'+token+'/'+prefix+'getUpdates';
 const local='http://127.0.0.1:'+port+'/telegram/webhook';
 let offset;
 async function pollOnce(signal){
  const result=await fetcher(api,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({timeout:20,limit:25,allowed_updates:['message','pre_checkout_query'],...(offset===undefined?{}:{offset})}),
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)
  });
  if(!result.ok)throw Error('getUpdates HTTP '+result.status);
  const payload=await result.json();
  if(payload.ok!==true||!Array.isArray(payload.result))throw Error('Invalid getUpdates response.');
  for(const update of payload.result){
   if(!Number.isSafeInteger(update.update_id)||update.update_id<0)throw Error('Invalid Telegram update.');
   const delivered=await fetcher(local,{
    method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},
    body:JSON.stringify(update),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)
   });
   if(!delivered.ok)throw Error('Local webhook HTTP '+delivered.status);
   offset=update.update_id+1;
  }
  return payload.result.length;
 }
 async function run(signal){
  let errors=0;
  while(!signal?.aborted){
   try{await pollOnce(signal);errors=0;}
   catch(e){
    if(signal?.aborted)break;
    // Never log full Telegram API URLs or tokens.
    logger.error('Manager Telegram poller:',/^getUpdates HTTP |^Local webhook HTTP |^Invalid /.test(e.message)?e.message:'Connection failure');
    errors++;
    try{await delay(Math.min(30000,1000*2**Math.min(errors,5)),undefined,{signal});}catch{if(signal?.aborted)break;}
   }
  }
 }
 return {pollOnce,run,get offset(){return offset;}};
}
if(require.main===module){
 const abort=new AbortController();
 for(const name of ['SIGTERM','SIGINT'])process.once(name,()=>abort.abort());
 createPoller({
  token:process.env.TELEGRAM_BOT_TOKEN,
  secret:process.env.TELEGRAM_WEBHOOK_SECRET,
  port:Number(process.env.PORT??8443),
  mode:process.env.TELEGRAM_ENV??'production'
 }).run(abort.signal).catch(()=>{console.error('Manager Telegram poller stopped unexpectedly.');process.exitCode=1;});
}
module.exports={createPoller};
