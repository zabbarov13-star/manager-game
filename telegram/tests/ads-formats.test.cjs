'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {createApp}=require('../server.cjs');
test('separate ad format flags: Reward/Stars fail closed, Interstitial requires its own int-ID',async t=>{
 for(const [enabled,id,expected]of [[false,'int-999999',false],[true,'',false],[true,'1788',false],[true,'58198',false],[true,'int-999999',true]]){
  const token='synthetic-token',origin='https://ads.fixture',calls=[];
  const app=createApp({mode:'adapter',environment:'production',botToken:token,webhookSecret:'w'.repeat(32),rpcSecret:'r'.repeat(32),origin,database:':memory:',ownerTelegramId:'',starsEnabled:false,gatewayEnabled:true,blockId:'1788',interstitialEnabled:enabled,interstitialBlockId:id,bot:async method=>{calls.push(method);return true;}}).listen(0,'127.0.0.1');
  await once(app,'listening');const base='http://127.0.0.1:'+app.address().port;
  try{
   const health=await(await fetch(base+'/health')).json();assert.equal(health.interstitialConfigured,expected);assert.equal(health.adsConfigured,false);assert.equal(health.starsConfigured,false);assert.equal(health.roomsEnabled,false);
   const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:990001,first_name:'Fixture'})});params.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update([...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
   const request=async(route,data,bearer)=>fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(data)});
   const response=await request('/api/session',{initData:params.toString()});assert.equal(response.status,200);const account=await response.json();assert.equal(account.features.interstitial,expected);assert.equal(account.features.interstitialBlockId,expected?id:null);assert.equal(account.features.ads,false);assert.equal(account.features.stars,false);
   assert.equal((await request('/api/ads/begin',{item:'character:mira'},account.token)).status,503);
   assert.equal((await request('/api/invoice',{product:'character:mira'},account.token)).status,503);
   assert.equal((await request('/ads/verified-receipt',{userId:990001})).status,404);
   assert.equal(app.store.profile('990001').ads.remaining,3);assert.equal(app.store.access('990001','character:mira').permanent,false);assert.deepEqual(calls,[]);
   assert.equal(app.store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{await new Promise(resolve=>app.close(resolve));}
 }
});
