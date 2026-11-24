'use strict';
// Final incremental QA: existing archives, adapter-only + one rooms server.
// Synthetic identities, memory-only databases, loopback, no live Bot API or builds.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {createHmac, randomBytes, randomUUID} = require('node:crypto');
const {chromium} = require('../../telegram/node_modules/playwright');
const root = path.resolve(process.env.QA_PACKAGED_ROOT || '');
assert(process.env.QA_PACKAGED_ROOT, 'Set QA_PACKAGED_ROOT to the verified extracted candidate');
const identity = JSON.parse(fs.readFileSync(path.join(root, 'STAND-IDENTITY.json')));
assert.equal(identity.code, 'a3279b0a1f1b697f8662a2b911eadd9dc9b92425');
const adapterRoot = path.join(root, 'adapter-runtime');
const roomsRoot = path.join(root, 'rooms-runtime');
const {createApp} = require(path.join(adapterRoot, 'telegram/server.cjs'));
const {createRoomServer} = require(path.join(roomsRoot, 'online/server.cjs'));
const {createExtension} = require(path.join(roomsRoot, 'telegram/shared/room-extension.cjs'));
const {createVerifier} = require(path.join(roomsRoot, 'telegram/shared/verification.cjs'));
const token = 'qa:packaged-candidate-not-a-live-token';
const rpc = randomBytes(32).toString('hex');
const report = {scope:'Packaged adapter-only + shared rooms; Chromium with synthetic Telegram SDK, not real Telegram/physical devices',code:identity.code,checks:[],errors:[]};
const output = path.resolve('release-output/final-acceptance/packaged-acceptance.json');
const onlineOnly=process.env.QA_PACKAGED_ONLINE_ONLY==='1';
if(onlineOnly) {
  const prior=JSON.parse(fs.readFileSync(output)); assert.equal(prior.code,identity.code);
  for(const name of ['packaged-navigation','packaged-local-roll-close-reopen']) {
    const evidence=prior.checks.find(c=>c.name===name&&c.status==='PASS'); assert(evidence,'Missing prior local PASS');
    report.checks.push({...evidence,reused:true});
  }
  report.timing=prior.timing;
}
let stage = 'setup', adapter, common, front, browser;
const pass = name => { report.checks.push({name,status:'PASS'}); console.log('PASS: '+name); };
async function listen(server) { server.listen(0,'127.0.0.1'); await once(server,'listening'); return 'http://127.0.0.1:'+server.address().port; }
async function stop(server) { if(server?.listening) { server.closeAllConnections?.(); await new Promise(r=>server.close(r)); } }
function signed(id) {
  const p = new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'QA fixture'})});
  const key = createHmac('sha256','WebAppData').update(token).digest();
  p.set('hash',createHmac('sha256',key).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
  return p.toString();
}
(async()=>{
  let adapterBase, commonBase;
  front = createServer(async(req,res)=>{
    try {
      const chunks=[]; for await(const chunk of req) chunks.push(chunk);
      const target = req.url === '/api/rooms' || req.url.startsWith('/api/rooms/') ? commonBase : adapterBase;
      const headers={}; for(const key of ['authorization','content-type','idempotency-key','origin']) if(req.headers[key]) headers[key]=req.headers[key];
      const r=await fetch(target+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
      res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json'}).end(Buffer.from(await r.arrayBuffer()));
    } catch { res.writeHead(503).end('{}'); }
  });
  const origin=await listen(front);
  adapter=createApp({mode:'adapter',environment:'test',rpcSecret:rpc,botToken:token,webhookSecret:randomBytes(32).toString('hex'),origin,allowHttp:true,database:':memory:',ownerTelegramId:'910001',starsEnabled:false,gatewayEnabled:false,bot:async()=>{throw Error('Live Bot API forbidden');}});
  const verifier=await listen(adapter.verifier); adapterBase=await listen(adapter);
  common=createRoomServer({database:':memory:',allowedOrigins:[origin],extension:createExtension({handleRooms:require(path.join(roomsRoot,'telegram/shared/dist/engine.cjs')).handleRooms,verifyBatch:createVerifier({endpoint:verifier,secret:rpc})})});
  commonBase=await listen(common);
  adapter.store.user({id:'910001',name:'QA fixture owner'});
  adapter.store.select('910001',{character:'mira',style:'arcade',dice:'jade'});
  browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER?{executablePath:process.env.QA_BROWSER}:{})});
  async function context(id) {
    const c=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
    await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await c.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:${JSON.stringify(signed(id))},ready(){},expand(){},onEvent(){},BackButton:{show(){},hide(){},onClick(){}}}};`}));
    c.on('page',p=>{p.setDefaultTimeout(15000);p.on('pageerror',()=>report.errors.push('Uncaught browser error'));});
    return c;
  }
  async function open(c) { const p=await c.newPage(); await p.goto(origin); await p.locator('#telegram-loading').waitFor({state:'detached'}); return p; }
  if(!onlineOnly) {
  stage='packaged-navigation';
  const localContext=await context(910001); let local=await open(localContext);
  const timing=await local.evaluate(()=>({menuReadyMs:performance.now(),navigationMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}));
  assert.equal(await local.locator('body').getAttribute('data-screen'),'menu');
  await local.locator('[data-menu=settings]').first().click(); await local.locator('#reduced-motion').check(); await local.locator('#settings-dialog .close-button').click();
  await local.locator('[data-menu=rules]').click(); await local.locator('#rules-dialog').waitFor(); await local.locator('#rules-dialog .close-button').click();
  await local.locator('[data-menu=shop]').click(); assert.equal(await local.locator('.tg-card').count(),18); await local.getByRole('button',{name:'Закрыть',exact:true}).click();
  report.timing={...timing,scope:'Local packaged Chromium fixture, not Telegram startup or WAN'}; pass(stage);
  stage='packaged-local-roll-close-reopen';
  await local.locator('[data-menu=play]').click(); await local.locator('[data-menu=new]').first().click(); await local.locator('#party-mode').selectOption('local'); await local.locator('#party-start').click(); await local.locator('#tab-game').click();
  await local.locator('#roll-button').click(); await local.waitForFunction(()=>/\d \+ \d = \d/.test(document.querySelector('#last-roll').textContent));
  const save=()=>local.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.endsWith('manager.match.v2'));return JSON.parse(localStorage.getItem(k));});
  const before=await save(); assert.equal(before.rolls,1);
  await local.close(); local=await open(localContext); await local.locator('[data-menu=play]').click(); await local.locator('[data-menu=continue]').click(); assert.deepEqual(await save(),before);
  await localContext.close(); pass(stage);
  }
  stage='packaged-two-client-online';
  const hc=await context(910001),gc=await context(910002),host=await open(hc),guest=await open(gc);
  async function online(p) { await p.locator('#settings-open').click(); await p.locator('.start-match').click(); await p.locator('#party-mode').selectOption('online'); await p.locator('#online-network-kind').selectOption('server',{force:true}); }
  await online(host); await host.getByLabel('Ваше имя',{exact:true}).fill('QA host'); await host.getByLabel('Вместимость',{exact:true}).selectOption('2');
  const creating=host.waitForResponse(r=>r.url().endsWith('/api/rooms')&&r.request().method()==='POST'); await host.getByRole('button',{name:'Создать стол',exact:true}).click(); const createdResponse=await creating; assert.equal(createdResponse.status(),201); const h=await createdResponse.json();
  await online(guest); await guest.getByRole('button',{name:'Войти по коду / приглашению',exact:true}).click(); await guest.getByLabel('Ваше имя',{exact:true}).fill('QA guest'); await guest.getByLabel('Код комнаты',{exact:true}).fill(h.room.code);
  const joining=guest.waitForResponse(r=>r.url().endsWith('/join')&&r.request().method()==='POST'); await guest.getByRole('button',{name:'Занять место',exact:true}).click(); const joinedResponse=await joining; assert.equal(joinedResponse.status(),200); const g=await joinedResponse.json(); await guest.getByRole('button',{name:'Я готов',exact:true}).click();
  const starting=host.waitForResponse(r=>r.url().endsWith('/start')); await host.getByRole('button',{name:'Начать общую партию',exact:true}).click(); const start=await (await starting).json();
  for(const p of [host,guest]) {
    if(await p.locator('#online-dialog').evaluate(d=>d.open)) {
      const back=p.getByRole('button',{name:'Вернуться к полю',exact:true});
      await back.waitFor({state:'visible'}); await back.click();
    }
  }
  const actor=start.room.game.players[start.room.game.current].id===h.seatId?host:guest;
  await actor.locator('#tab-game').click();
  await actor.waitForFunction(()=>{const b=document.getElementById('roll-button');return b&&!b.disabled&&b.getClientRects().length>0;});
  const [rolledResponse]=await Promise.all([
    actor.waitForResponse(r=>r.url().endsWith('/action')&&r.request().method()==='POST'),
    actor.locator('#roll-button').click(),
  ]);
  assert.equal(rolledResponse.status(),200); const rolled=await rolledResponse.json(); assert.equal(rolled.room.game.rolls,1); pass(stage);
  stage='packaged-chat-reconnect-sync';
  async function room(p,credentials) { const r=await p.request.get(origin+'/api/rooms/'+h.room.code,{headers:{Authorization:'Bearer '+credentials.token}}); assert.equal(r.status(),200); return (await r.json()).room; }
  const invalid=await guest.request.post(origin+'/api/rooms/'+h.room.code+'/chat',{headers:{Origin:origin,Authorization:'Bearer '+g.token,'Idempotency-Key':'0'.repeat(32)},data:{text:'Rejected fixture request'}});
  assert.equal(invalid.status(),400,'Malformed idempotency keys must remain rejected');
  const chat=await guest.request.post(origin+'/api/rooms/'+h.room.code+'/chat',{headers:{Origin:origin,Authorization:'Bearer '+g.token,'Idempotency-Key':randomUUID()},data:{text:'QA packaged reconnect'}}); assert.equal(chat.status(),200);
  assert.equal((await room(host,h)).chat.at(-1).text,'QA packaged reconnect');
  await host.locator('#tab-chat .chat-unread').waitFor({state:'visible'});
  await host.locator('#tab-chat').click(); await host.getByRole('list',{name:'История сообщений'}).getByText('QA packaged reconnect',{exact:true}).waitFor();
  assert.equal(await host.locator('#tab-chat .chat-unread').isVisible(),false);
  pass('packaged-chat-notification-read');
  stage='packaged-reload-recovery';
  await guest.reload(); await guest.locator('#telegram-loading').waitFor({state:'detached'});
  await guest.waitForFunction(()=>document.body.dataset.screen==='game');
  await guest.locator('.player-token svg[data-tg-premium="mira"] image').first().waitFor();
  pass(stage); stage='packaged-offline-reconnect-sync';
  await gc.setOffline(true);
  await guest.evaluate(()=>window.dispatchEvent(new Event('online')));
  await guest.waitForFunction(()=>document.querySelector('.connection-status')?.dataset.state==='reconnecting');
  await gc.setOffline(false);
  await guest.waitForFunction(()=>document.querySelector('.connection-status')?.dataset.state==='connected');
  assert.deepEqual((await room(host,h)).game,(await room(guest,g)).game);
  assert.equal((await room(guest,g)).game.rolls,1);
  assert.equal((await room(guest,g)).seats.find(s=>s.id===h.seatId).cosmeticCharacter,'mira'); pass(stage);
  stage='packaged-no-payments-errors';
  assert.equal(adapter.store.db.prepare('SELECT count(*) n FROM orders').get().n,0); assert.equal(adapter.store.db.prepare('SELECT count(*) n FROM ads').get().n,0); assert.deepEqual(report.errors,[]); pass(stage);
})().catch(e=>{
  const location=(e.stack||'').split('\n').map(line=>line.match(/([\w.-]+\.cjs:\d+:\d+)/)?.[1]).filter(Boolean).slice(0,3);
  report.checks.push({name:stage,status:'FAIL',errorType:e.name,location,...(typeof e.actual==='number'?{actual:e.actual,expected:e.expected}:{})});
  // Do not serialize requests, room responses, tokens, URLs or arbitrary exception text.
  console.error('FAIL: '+stage+' ('+e.name+') at '+location.join(', '));
  if(stage==='setup') console.error(String(e.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,300));
  process.exitCode=1;
}).finally(async()=>{
  await browser?.close(); await stop(front); await stop(common); await stop(adapter); await stop(adapter?.verifier);
  report.finishedAt=new Date().toISOString(); fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
});
