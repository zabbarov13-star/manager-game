'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../litebits-client.js'),'utf8');
function fixture(options={}){
 const calls=[],scripts=[],timers=new Map(),messages=[];let confirmed=0;
 const placementId='7490adb6-4d31-465c-ace6-815455d05220';
 function SDK(config){assert.equal(config.placementId,placementId);assert.equal(config.baseUrl,'https://ads.litebits.io');assert.equal(config.fallbacks,false);assert.equal(config.sandbox,false);calls.push('init');if(options.constructorFails)throw Error(config.apiKey);this.on=(event,fn)=>{assert.equal(event,'nofill');this.noFill=fn;};this.destroy=()=>calls.push('destroy');this.show=async()=>{calls.push('show');if(options.show)return options.show(this);return{verified:true};};}
 const context={window:{LiteBitsAds:options.loadSdk?undefined:SDK},document:{createElement:()=>({remove(){this.removed=true;}}),head:{append:script=>scripts.push(script)}},setTimeout:(fn,ms)=>{if(ms===1500){queueMicrotask(fn);return{};}const id={};timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);
 const api=async(route,data)=>{calls.push(route);if(route==='litebits/begin')return{id:'synthetic-intent'};if(route==='litebits/config')return{apiKey:'lba_secret_must_not_leak',placementId:options.wrongPlacement?'wrong':placementId,baseUrl:'https://ads.litebits.io'};if(route==='litebits/status')return{status:options.issued?'issued':'pending'};return{ok:true};};
 const watch=()=>context.window.ManagerLiteBits.watch('character:mira',{enabled:options.enabled!==false,api,status:s=>messages.push(s),confirmed:async()=>confirmed++});
 return{watch,calls,scripts,timers,messages,context,confirmed:()=>confirmed};
}
test('LiteBits OFF makes no SDK or server request',async()=>{const f=fixture({enabled:false});await assert.rejects(f.watch(),/выключены/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.scripts,[]);});
test('correct SDK placement, explicit fallbacks OFF and confirmed server status grants UI success',async()=>{const f=fixture({issued:true});await f.watch();assert.equal(f.confirmed(),1);assert(f.calls.includes('litebits/status'));assert(!f.calls.includes('ads/cancel'));assert.equal(f.timers.size,0);});
test('client verified/rewarded never credits without an issued server intent',async()=>{const f=fixture();await assert.rejects(f.watch(),/Подтверждение задерживается/);assert.equal(f.confirmed(),0);assert(!f.calls.includes('ads/cancel'),'keep verified intent for delayed callback');});
test('wrong Placement ID fails before SDK request',async()=>{const f=fixture({wrongPlacement:true});await assert.rejects(f.watch(),/Настройки/);assert(!f.calls.includes('show'));assert(f.calls.includes('ads/cancel'));});
for(const code of ['NO_FILL','NETWORK','ABANDONED','AUTH'])test('SDK failure: '+code,async()=>{const f=fixture({show:async sdk=>{if(code==='NO_FILL')sdk.noFill();throw Object.assign(Error('provider data must not leak'),{code});}});await assert.rejects(f.watch(),e=>!e.message.includes('provider data'));assert.equal(f.confirmed(),0);assert.equal(f.calls.includes('ads/cancel'),code!=='NETWORK');assert.equal(f.timers.size,0);});
test('unverified/fallback results cannot create rewards',async()=>{const f=fixture({show:async()=>({verified:true,fallback:true})});await assert.rejects(f.watch());assert.equal(f.confirmed(),0);assert(f.calls.includes('ads/cancel'));});
test('SDK script loads only on a click, errors and timeouts cancel safely',async()=>{
 for(const fail of ['error','timeout']){const f=fixture({loadSdk:true});assert.equal(f.scripts.length,0);const p=f.watch(),failure=assert.rejects(p,/загруз/);await new Promise(setImmediate);assert.equal(f.scripts[0].src,'https://ads.litebits.io/sdk/v1.js');if(fail==='error')f.scripts[0].onerror();else [...f.timers.values()][0]();await failure;assert(f.scripts[0].removed);assert(f.calls.includes('ads/cancel'));assert.equal(f.confirmed(),0);}
});
test('parallel show is rejected and provider exceptions never reveal publisher key',async()=>{
 let resolve;const f=fixture({show:()=>new Promise(r=>{resolve=r;})}),p=f.watch();await new Promise(setImmediate);await assert.rejects(f.watch(),/предыдущий/);resolve({verified:false});await assert.rejects(p);
 const broken=fixture({constructorFails:true});await assert.rejects(broken.watch(),e=>!e.message.includes('lba_secret'));assert.equal(broken.confirmed(),0);
});
