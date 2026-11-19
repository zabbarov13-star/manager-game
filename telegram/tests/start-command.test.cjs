'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events');
const {createApp}=require('../server.cjs');

test('Telegram /start provides a private Mini App button; webhook auth and update replay stay protected',async t=>{
 const sent=[];
 const secret='fixture-webhook-secret-at-least-32-chars';
 const app=createApp({
  botToken:'123:fixture',webhookSecret:secret,origin:'https://manager.example.test',
  database:':memory:',bot:async(method,payload)=>{sent.push({method,payload});return true;}
 }).listen(0,'127.0.0.1');
 await once(app,'listening');
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const address='http://127.0.0.1:'+app.address().port+'/telegram/webhook';
 const post=async (update,header=secret)=>{
  const response=await fetch(address,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':header},body:JSON.stringify(update)});
  return response.status;
 };
 const start={update_id:101,message:{message_id:1,from:{id:42},chat:{id:42,type:'private'},text:'/start'}};
 assert.equal(await post(start,'invalid'),403);
 assert.equal(sent.length,0);
 assert.equal(await post(start),200);
 assert.equal(sent.length,1);
 assert.equal(sent[0].method,'sendMessage');
 assert.equal(sent[0].payload.chat_id,42);
 assert.deepEqual(sent[0].payload.reply_markup.inline_keyboard,[[{text:'🎲 Открыть игру',web_app:{url:'https://manager.example.test/'}}]]);
 assert.equal(await post(start),200,'Replay must not send a duplicate message');
 assert.equal(sent.length,1);
 assert.equal(await post({update_id:102,message:{...start.message,text:'/start invitation'}}),200);
 assert.equal(sent.length,2);
 assert.equal(await post({update_id:103,message:{...start.message,text:'/start@ManagerGameTestBot'}}),200);
 assert.equal(sent.length,3);
 assert.equal(await post({update_id:104,message:{...start.message,chat:{id:-100,type:'supergroup'}}}),200);
 assert.equal(sent.length,3,'Do not offer web_app button in groups');
 assert.equal(await post({update_id:105,message:{...start.message,text:'/unrelated'}}),200);
 assert.equal(sent.length,3);
});
