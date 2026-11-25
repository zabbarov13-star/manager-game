/* SDK events are UI hints. Only our authenticated server reports an issued grant. */
(() => {
 'use strict';
 const PLACEMENT='7490adb6-4d31-465c-ace6-815455d05220';let active=false;
 async function load(){
  if(typeof window.LiteBitsAds==='function')return;
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');let timer;
   const finish=error=>{clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
   timer=setTimeout(()=>finish(Error('Реклама не загрузилась вовремя.')),20000);
   script.src='https://ads.litebits.io/sdk/v1.js';
   script.onload=()=>finish(typeof window.LiteBitsAds==='function'?null:Error('SDK рекламы недоступен.'));
   script.onerror=()=>finish(Error('Не удалось загрузить рекламу.'));document.head.append(script);
  });
 }
 async function watch(item,{enabled,api,status,confirmed}){
  if(!enabled)throw Error('Рекламные награды выключены.');
  if(active)throw Error('Завершите предыдущий просмотр.');active=true;
  let intent,ads,started=false,verified=false,provider=false,timer;
  try{
   intent=await api('litebits/begin',{item});
   const config=await api('litebits/config',{});
   if(config.placementId!==PLACEMENT||config.baseUrl!=='https://ads.litebits.io'||typeof config.apiKey!=='string'||!config.apiKey)throw Error('Настройки рекламы не готовы.');
   await load();
   provider=true;ads=new window.LiteBitsAds({apiKey:config.apiKey,placementId:PLACEMENT,baseUrl:config.baseUrl,fallbacks:false,sandbox:false});
   ads.on('nofill',()=>status('Сейчас рекламы нет. Попробуйте позже.'));
   // Do not credit, trust or persist earning/rewarded from the browser.
   started=true;
   const result=await Promise.race([ads.show(),new Promise((_,reject)=>{timer=setTimeout(()=>{ads.destroy();reject(Object.assign(Error('Таймаут рекламы.'),{code:'TIMEOUT'}));},180000);})]);
   clearTimeout(timer);
   if(!result?.verified||result.fallback)throw Object.assign(Error('Просмотр не подтверждён.'),{code:'UNVERIFIED'});
   verified=true;status('Ожидаем серверное подтверждение просмотра…');
   for(let i=0;i<30;i++){
    const receipt=await api('litebits/status',{id:intent.id});
    if(receipt.status==='issued'){await confirmed();status('Награда подтверждена сервером.');return;}
    await new Promise(resolve=>setTimeout(resolve,1500));
   }
   throw Object.assign(Error('Подтверждение задерживается. Награда появится после серверной проверки.'),{code:'PENDING'});
  }catch(error){
   const definitive=['NO_FILL','CONFIG','NOT_CONFIGURED','AUTH','BUSY','ABANDONED','UNVERIFIED'].includes(error.code);
   if(intent&&!verified&&(!started||definitive))await api('ads/cancel',{id:intent.id}).catch(()=>{});
   if(error.code==='NO_FILL')throw Error('Сейчас рекламы нет. Попробуйте позже.');
   if(error.code==='NETWORK'||error.code==='TIMEOUT')throw Error('Ошибка сети рекламы. Если просмотр подтверждён, награда появится после серверной проверки.');
   // Never copy provider errors (which may include request credentials) to UI/logs.
   if(error.code==='PENDING')throw Error('Подтверждение задерживается. Награда появится после серверной проверки.');
   if(error.code||provider)throw Error('Просмотр не завершён. Награда не начислена клиентом.');
   throw error;
  }finally{clearTimeout(timer);try{ads?.destroy();}catch{}active=false;}
 }
 window.ManagerLiteBits={watch};
})();
