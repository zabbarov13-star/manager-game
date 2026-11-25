'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Execute the actual client functions, with a fake DOM/SDK/clock and no network.
const source=fs.readFileSync(path.join(__dirname,'../client.js'),'utf8');
const functions=source.slice(source.indexOf('async function loadRewardSdk()'),source.indexOf('\nfunction open(',source.indexOf('async function loadRewardSdk()')));
function fixture({enabled=true,expires=0,profileExpires=expires,show,blockId='mock-reward-block'}={}){
 const calls=[],scripts=[],timers=new Map(),messages=[],access={expires,permanent:false};let renders=0;
 const context={account:{features:{ads:enabled,blockId}},controller:undefined,window:{},
  node:()=>({remove(){this.removed=true;}}),document:{head:{append(script){scripts.push(script);}}},
  access:()=>access,now:()=>1000,status:s=>messages.push(s),render:()=>renders++,
  sync:p=>Object.assign(access,p),api:async(route,data)=>{calls.push({route,data});if(route==='ads/begin')return{id:'mock-intent'};if(route==='profile')return{expires:profileExpires,permanent:false};return{ok:true};},
  setTimeout:(fn,ms)=>{const id={};if(ms===20000)timers.set(id,fn);else queueMicrotask(fn);return id;},clearTimeout:id=>timers.delete(id)};
 if(show)context.window.Adsgram={init:({blockId:actualBlockId})=>{assert.equal(actualBlockId,blockId);return{show:()=>show(access)};}};
 const client=vm.runInNewContext(functions+'\n({watch,loadRewardSdk})',context);
 return{...client,context,calls,scripts,timers,messages,access,renders:()=>renders};
}
test('OFF never creates an intent or loads SDK',async()=>{const f=fixture({enabled:false});await assert.rejects(f.watch('character:mira'),/ещё не подключены/);assert.equal(f.calls.length,0);assert.equal(f.scripts.length,0);});
test('verified grant received during show is detected from the pre-show baseline',async()=>{
 const f=fixture({profileExpires:86401000,show:async state=>{state.expires=86401000;return{done:true,error:false};}});
 await f.watch('character:mira');assert.equal(f.calls.filter(c=>c.route==='profile').length,1);assert.equal(f.renders(),1);assert.equal(f.calls.filter(c=>c.route==='ads/cancel').length,0);
});
test('SDK success without server grant never confirms a reward',async()=>{const f=fixture({show:async()=>({done:true,error:false})});await assert.rejects(f.watch('character:mira'),/Подтверждение ещё не получено/);assert.equal(f.renders(),0);assert.equal(f.access.expires,0);assert.equal(f.calls.filter(c=>c.route==='profile').length,30);assert.equal(f.calls.filter(c=>c.route==='ads/cancel').length,0,'allow delayed verified receipt');});
test('expiry decreasing while polling is not a new reward',async()=>{const f=fixture({expires:2000,profileExpires:0,show:async()=>({done:true,error:false})});await assert.rejects(f.watch('character:mira'),/Подтверждение ещё не получено/);assert.equal(f.renders(),0);});
test('SDK timeout cleans handlers, cancels pending intent and allows a retry',async()=>{
 const f=fixture({profileExpires:86401000}),pending=f.watch('character:mira'),failure=assert.rejects(pending,/вовремя/);
 await new Promise(setImmediate);assert.equal(f.scripts.length,1);assert.equal(f.scripts[0].src,'https://sad.adsgram.ai/js/sad.min.js');assert.equal(f.timers.size,1);[...f.timers.values()][0]();await failure;
 assert(f.scripts[0].removed);assert.equal(f.scripts[0].onload,null);assert.equal(f.scripts[0].onerror,null);assert.equal(f.timers.size,0);assert.equal(f.calls.filter(c=>c.route==='ads/cancel').length,1);
 f.context.window.Adsgram={init:()=>({show:async()=>({done:true,error:false})})};await f.watch('character:mira');assert.equal(f.renders(),1);assert.equal(f.scripts.length,1);
});
for(const type of ['network','missing-init','invalid-init'])test('SDK load failure: '+type,async()=>{const f=fixture(),pending=f.watch('character:mira'),failure=assert.rejects(pending,/SDK|загрузить/);await new Promise(setImmediate);if(type==='network')f.scripts[0].onerror();else{if(type==='invalid-init')f.context.window.Adsgram={init:'not-a-function'};f.scripts[0].onload();}await failure;assert(f.scripts[0].removed);assert.equal(f.calls.filter(c=>c.route==='ads/cancel').length,1);assert.equal(f.calls.filter(c=>c.route==='profile').length,0);});
for(const [name,show] of [['skip',async()=>({done:false,error:false})],['error',async()=>({done:true,error:true})],['no-fill',async()=>{throw Error('mock no inventory');}]])test('unsuccessful show cancels without polling: '+name,async()=>{const f=fixture({show});await assert.rejects(f.watch('character:mira'));assert.equal(f.calls.filter(c=>c.route==='ads/cancel').length,1);assert.equal(f.calls.filter(c=>c.route==='profile').length,0);assert.equal(f.renders(),0);});

test('registered Reward Unit 1788 is passed unchanged as SDK blockId, not platform or Bot ID',async()=>{const sample=fs.readFileSync(path.join(__dirname,'../.env.example'),'utf8');const blockId=sample.match(/^ADSGRAM_BLOCK_ID=([^\r\n]*)/m)?.[1];assert.equal(blockId,'1788');let shows=0;const f=fixture({blockId,profileExpires:86401000,show:async()=>{shows++;return{done:true,error:false};}});assert.equal(shows,0);await f.watch('character:mira');assert.equal(shows,1);assert.equal(f.renders(),1);});

test('registered Reward Unit 1788 with OFF configuration never loads or shows an ad',async()=>{const sample=fs.readFileSync(path.join(__dirname,'../.env.example'),'utf8');assert(/^STARS_ENABLED=0\r?$/m.test(sample));assert(/^ADS_VERIFIED_GATEWAY_ENABLED=0\r?$/m.test(sample));let shows=0;const f=fixture({enabled:false,blockId:'1788',show:async()=>{shows++;return{done:true,error:false};}});await assert.rejects(f.watch('character:mira'),/ещё не подключены/);assert.equal(shows,0);assert.equal(f.scripts.length,0);assert.equal(f.calls.length,0);});
