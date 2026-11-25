/* Cosmetic-only, terminal-transition observer. Never runs from restore/render alone. */
(function(root){
 'use strict';
 function create({storage,features,loadSdk,visible,available,setBusy,locks,schedule=setTimeout,cancel=clearTimeout}){
  let current=null,pending=null,controller;
  function baseline(state,id){current={state,id,over:state.phase==='over'};pending=null;}
  function observe(state,id){
   if(typeof id!=='string'||!id||id==='unbound'){baseline(state,id);return;}
   const previous=current;current={state,id,over:state.phase==='over'};
   if(previous?.id===id&&!previous.over&&current.over)pending={state,id};
   else if(!current.over||previous?.id!==id)pending=null;
  }
  async function complete(state){
   const entry=pending;if(!entry||entry.state!==state)return;pending=null;
   const f=features();
   if(!f.interstitial||!/^int-\d+$/.test(f.interstitialBlockId??'')||!locks?.request||!visible()||!available())return;
   try{await locks.request('manager-ads-interstitial',{ifAvailable:true},async lock=>{
    if(!lock||!visible()||!available()||current.state!==state)return;
    // Claim before loading/showing. A failed/no-fill attempt is not retried on results reopening.
    const key='ads-interstitial.v1',record=JSON.parse(storage.getItem(key)??'{"seen":[],"last":0}');
    if(!Array.isArray(record.seen)||!Number.isFinite(record.last))return;
    if(record.seen.includes(entry.id)||Date.now()-record.last<15*60*1000)return;
    record.seen=record.seen.slice(-255).concat(entry.id);record.last=Date.now();
    storage.setItem(key,JSON.stringify(record));
    setBusy(true);
    try{
     await loadSdk();if(!visible()||current.state!==state||current.state.phase!=='over')return;
     controller??=root.Adsgram.init({blockId:f.interstitialBlockId});
     let timer;
     try{await Promise.race([controller.show(),new Promise(resolve=>{timer=schedule(()=>{try{controller.destroy?.();}catch{}resolve();},120000);})]);}
     finally{cancel(timer);}
    }finally{setBusy(false);}
   });}catch{/* Storage/SDK/no inventory failures must never interrupt a game. */}
  }
  return{baseline,observe,complete};
 }
 if(typeof module==='object'&&module.exports)module.exports={create};else root.ManagerInterstitial={create};
})(typeof window==='object'?window:globalThis);
