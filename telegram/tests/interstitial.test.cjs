'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../interstitial.js'),'utf8');
function fixture(options={}){
 const data=options.data??new Map(),calls=[],timers=new Map();let clock=2e9,busy=false,visible=true;
 const context={window:{Adsgram:{init:({blockId})=>{calls.push(blockId);return{show:async()=>{calls.push('show');if(options.noFill)throw Error('no inventory');if(options.hang)return new Promise(()=>{});},destroy:()=>calls.push('destroy')};}}},
  setTimeout:(fn,ms)=>{const id={};timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);
 const client=context.window.ManagerInterstitial.create({storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(options.storageFails)throw Error('storage disabled');data.set(k,v);}},features:()=>({interstitial:true,interstitialBlockId:'int-999999',...options.features}),
  loadSdk:async()=>{calls.push('load');if(options.load)await options.load();},visible:()=>visible,available:()=>!busy,setBusy:v=>{busy=v;},locks:options.noLocks?undefined:{request:async(name,opts,fn)=>fn(options.lockBusy?null:{})}});
 const observe=(phase,id='match-1')=>{const state={phase};client.observe(state,id);return state;};
 const finish=async(id='match-1')=>{observe('ready',id);const end=observe('over',id);await client.complete(end);return end;};
 // Date is resolved in the VM realm.
 clock=2000000;context.Date={now:()=>clock};
 return{client,observe,finish,calls,data,timers,get busy(){return busy;},set visible(v){visible=v;},advance:()=>{clock+=900001;}};
}
test('Interstitial only on a live final transition, once after completion callback',async()=>{
 const f=fixture();const active=f.observe('ready');await f.client.complete(active);f.observe('purchase');const end=f.observe('over');assert.deepEqual(f.calls,[],'render alone cannot show during animation/save');
 await f.client.complete(end);assert.deepEqual(f.calls,['load','int-999999','show']);assert.equal(f.busy,false);assert.equal(f.timers.size,0);
 f.observe('over');await f.client.complete(end);assert.equal(f.calls.filter(c=>c==='show').length,1);
});
test('reload/restored results and duplicate match ID never replay; cooldown persists',async()=>{
 const f=fixture();await f.finish();const reload=fixture({data:f.data});const restored=reload.observe('over');await reload.client.complete(restored);await reload.finish();assert.deepEqual(reload.calls,[]);
 await f.finish('match-2');assert.equal(f.calls.filter(c=>c==='show').length,1);f.advance();await f.finish('match-3');assert.equal(f.calls.filter(c=>c==='show').length,2);
});
test('explicit restore/reconnect baseline does not show final results',async()=>{const f=fixture();f.observe('ready');const s={phase:'over'};f.client.baseline(s,'match-1');f.client.observe(s,'match-1');await f.client.complete(s);assert.deepEqual(f.calls,[]);});
for(const [label,opts]of Object.entries({OFF:{features:{interstitial:false}},missing:{features:{interstitialBlockId:''}},reward1788:{features:{interstitialBlockId:'1788'}},noLocks:{noLocks:true},parallelTab:{lockBusy:true},noStorage:{storageFails:true}}))test('fail closed: '+label,async()=>{const f=fixture(opts);await f.finish();assert.deepEqual(f.calls,[]);assert.equal(f.busy,false);});
test('no inventory releases UI, never retries same results and creates no reward',async()=>{const f=fixture({noFill:true});const end=await f.finish();await f.client.complete(end);assert.equal(f.busy,false);assert.equal(f.calls.filter(c=>c==='show').length,1);assert.deepEqual([...f.data.keys()],['ads-interstitial.v1']);});
test('late SDK load cannot interrupt a new active match; busy blocks parallel completion',async()=>{
 let release;const f=fixture({load:()=>new Promise(r=>{release=r;})});f.observe('ready');const end=f.observe('over'),pending=f.client.complete(end);await new Promise(setImmediate);assert.equal(f.busy,true);f.observe('ready','new-match');release();await pending;assert.equal(f.calls.includes('show'),false);assert.equal(f.busy,false);
});
test('hidden page does not load; stalled SDK show is destroyed and UI released',async()=>{
 const hidden=fixture();hidden.visible=false;await hidden.finish();assert.deepEqual(hidden.calls,[]);
 const f=fixture({hang:true}),pending=f.finish();await new Promise(setImmediate);assert.equal(f.busy,true);assert.equal([...f.timers.values()][0].ms,120000);[...f.timers.values()][0].fn();await pending;assert.equal(f.busy,false);assert(f.calls.includes('destroy'));
});
test('Stars OFF removes purchase actions and Reward button remains voluntary',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../client.js'),'utf8'),actions=client.slice(client.indexOf('function actions('),client.indexOf('\nfunction characterCard('));
 const buttons=[];const context={account:{features:{stars:false,ads:false},ads:{remaining:3}},canUse:()=>false,access:()=>({permanent:false,expires:0}),node:()=>({}),remaining:()=>'',button:(label,fn)=>{const b={label,fn};buttons.push(b);return b;},now:()=>0,watch:()=>assert.fail('no click'),purchase:()=>assert.fail('Stars OFF')};
 vm.runInNewContext(actions+'\nactions({id:"style:test",price:20},{append(){}});',context);
 assert.equal(buttons.length,1);assert.match(buttons[0].label,/Смотреть рекламу/);assert.equal(buttons[0].disabled,true);
 assert(client.includes('else if(account.features.stars){const buy=button(money(pack.price)'));
});
test('build hooks exist exactly once in original UI and bundle the independent controller',()=>{
 const build=fs.readFileSync(path.join(__dirname,'../build.cjs'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 for(const anchor of ["if(method==='endTurn')camera?.finish();","if(previousTurn!==s.turn)camera?.finish();"]){assert.equal(html.split(anchor).length-1,1);assert(build.includes(anchor));}
 assert(build.includes('if(!onlineQueue.length)window.ManagerTelegram.adsComplete(s)'));
 assert(build.includes("['client.js','interstitial.js','telegram.css']"));assert(build.includes('src="/interstitial.js"'));
 for(const file of ['client.js','interstitial.js','build.cjs','server.cjs'])assert(!/monetag|onclckvd|otieu/i.test(fs.readFileSync(path.join(__dirname,'..',file),'utf8')));
});


test('legacy unbound network state never arms a post-game ad',async()=>{const f=fixture();await f.finish('unbound');assert.deepEqual(f.calls,[]);});
