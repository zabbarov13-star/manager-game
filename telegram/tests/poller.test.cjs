'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPoller}=require('../poller.cjs');

test('outbound poller forwards authenticated updates locally and retries failures without acknowledging them',async()=>{
 const seen=[],updates=[{update_id:771,message:{chat:{id:42,type:'private'},text:'/start'}}];
 let failures=1;
 const fetcher=async(url,options)=>{
  if(url.includes('/getUpdates')){
   const body=JSON.parse(options.body);
   seen.push({type:'poll',body,url});
   return {ok:true,status:200,json:async()=>({ok:true,result:body.offset===772?[]:updates})};
  }
  assert.equal(url,'http://127.0.0.1:8443/telegram/webhook');
  assert.equal(options.headers['X-Telegram-Bot-Api-Secret-Token'],'webhook-secret-test');
  assert.deepEqual(JSON.parse(options.body),updates[0]);
  seen.push({type:'deliver'});
  if(failures-- >0)return {ok:false,status:503};
  return {ok:true,status:200};
 };
 const poller=createPoller({token:'123:test-token',secret:'webhook-secret-test',fetcher});
 await assert.rejects(poller.pollOnce(),/Local webhook HTTP 503/);
 assert.equal(poller.offset,undefined,'Failure must not acknowledge the undelivered update');
 assert.equal(await poller.pollOnce(),1);
 assert.equal(poller.offset,772);
 assert.equal(await poller.pollOnce(),0);
 assert.equal(seen[2].body.offset,undefined);
 assert.equal(seen[4].body.offset,772);
 assert.deepEqual(seen[0].body.allowed_updates,['message','pre_checkout_query']);
});
