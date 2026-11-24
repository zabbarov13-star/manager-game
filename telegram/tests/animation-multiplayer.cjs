'use strict';
// Real local WebRTC data channels in two isolated Chrome contexts. SDP is exchanged
// by the test runner; public PeerJS signaling/TURN and physical phones are not exercised.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {chromium}=require('playwright'),{createApp}=require('../server.cjs');
const external=process.env.QA_EXTERNAL_PEER==='1';
const botToken='test:multiplayer-only',owner=9001,guest=9002;
function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'QA player'})});const key=createHmac('sha256','WebAppData').update(botToken).digest();p.set('hash',createHmac('sha256',key).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
(async()=>{
 const port=30000+Math.floor(Math.random()*10000);
 const server=createApp({botToken,webhookSecret:'multiplayer-test-secret-at-least-32characters',origin:'http://127.0.0.1:'+port,allowHttp:true,database:':memory:',ownerTelegramId:String(owner),bot:async()=>{throw Error('No live payments allowed');}}).listen(port,'127.0.0.1');await once(server,'listening');let browser;
 try{
  for(const id of [owner,guest])server.store.user({id:String(id),name:'QA'});
  server.store.select(String(owner),{character:'mira'});
  server.store.db.prepare("INSERT INTO grants(user,item,source,expires) VALUES(?,'character:asya','qa-fixture',NULL)").run(String(guest));server.store.select(String(guest),{character:'asya'});
  browser=await chromium.launch({headless:true,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--force-webrtc-ip-handling-policy=default_public_and_private_interfaces'],...(process.env.QA_CHROME?{executablePath:process.env.QA_CHROME}:{})});const pages=[];const errors=[];
  const game=fs.readFileSync(path.resolve(__dirname,'../dist/game.js'),'utf8').replace('function mountOnline(', 'window.QAEngine={P2PNetwork,P2PAuthority,transitionSync,BOARD};function mountOnline(');
  for(const id of [owner,guest]){
   const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:${JSON.stringify(signed(id))},ready(){},expand(){},onEvent(){},BackButton:{show(){},hide(){},onClick(){}},showPopup(o,cb){cb('cancel')}}};`}));
   await page.route('**/game.js',route=>route.fulfill({contentType:'text/javascript',body:game}));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#telegram-loading').waitFor({state:'detached'});
  }
  const [host,member]=pages;
  // Owner collection grants selections without payment/advertisement buttons or fabricated history.
  await host.locator('[data-menu=shop]').click();assert.equal(await host.locator('.tg-card').count(),18);assert.equal(await host.locator('.tg-card').getByRole('button',{name:'Выбрать',exact:true}).count(),18);assert.equal(await host.getByRole('button',{name:/⭐|Смотреть рекламу/}).count(),0);
  for(const width of [390,1280]){await host.setViewportSize({width,height:900});
  for(const name of ['Мира','Ася','Белла','Акира','Хана','Юки','Крипто-Монах','Пират Уолл-Стрит','Мэр-Коррупционер','Инвестор-Тинейджер','Мадам Франшиза','Хакер-Аноним']){
   const card=host.locator('.tg-card').filter({has:host.getByRole('heading',{name,exact:true})});await card.getByRole('button',{name:'Биография и характеристики'}).click();await host.locator('.tg-animation-preview').waitFor();await host.locator('.tg-card img').evaluate(img=>img.decode());
   for(const label of ['Победа','Поражение','Ожидание'])await host.locator('.tg-animation-buttons').getByRole('button',{name:label,exact:true}).click();await host.waitForTimeout(80);assert(await host.locator('#tg-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Preview must fit viewport');await host.getByRole('button',{name:'← Все персонажи'}).click();
  }
  }
  assert.equal(server.store.db.prepare('SELECT count(*) AS n FROM orders').get().n,0);assert.equal(server.store.db.prepare('SELECT count(*) AS n FROM ads').get().n,0);
  await host.locator('.tg-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  let code='mgr-'+'a'.repeat(40)+'.'+'b'.repeat(40);
  if(external){for(const page of pages)await page.evaluate(()=>{window.qaPeerStatus=[];window.qaNet=new QAEngine.P2PNetwork({storage:localStorage,saves:{async put(){},async get(){return null;}},timeout:12000,onStatus:text=>qaPeerStatus.push(text)});});}
  else{
  for(const [index,page]of pages.entries())await page.evaluate(({code,index})=>{
   const wrap=channel=>{const handlers={};const emit=(name,value)=>(handlers[name]??[]).forEach(fn=>fn(value));const c={peer:'local-qa-peer',on(name,fn){(handlers[name]??=[]).push(fn);},get open(){return channel.readyState==='open';},send:raw=>channel.send(raw),close:()=>channel.close()};channel.onmessage=e=>emit('data',e.data);channel.onclose=()=>emit('close');channel.onerror=e=>emit('error',e);return c;};
   const net=new window.QAEngine.P2PNetwork({storage:localStorage,saves:{async put(){},async get(){return null;}},timeout:5000});net.code=code;window.qaNet=net;
   if(index===0)net.authority=new window.QAEngine.P2PAuthority({code});
   const rtc=new RTCPeerConnection({iceServers:[]});window.qaRtc=rtc;
   const attach=channel=>{window.qaChannel=wrap(channel);net.attach(window.qaChannel,index===0);if(index===1)net.connect=async()=>window.qaChannel;};
   if(index===0)attach(rtc.createDataChannel('manager-qa',{ordered:true}));else rtc.ondatachannel=e=>attach(e.channel);
  },{code,index});
  const offer=await host.evaluate(async()=>{await qaRtc.setLocalDescription(await qaRtc.createOffer());await new Promise(resolve=>{if(qaRtc.iceGatheringState==='complete')return resolve();qaRtc.onicegatheringstatechange=()=>{if(qaRtc.iceGatheringState==='complete')resolve();};});return qaRtc.localDescription.toJSON();});
  const answer=await member.evaluate(async offer=>{await qaRtc.setRemoteDescription(offer);await qaRtc.setLocalDescription(await qaRtc.createAnswer());await new Promise(resolve=>{if(qaRtc.iceGatheringState==='complete')return resolve();qaRtc.onicegatheringstatechange=()=>{if(qaRtc.iceGatheringState==='complete')resolve();};});return qaRtc.localDescription.toJSON();},offer);
  await host.evaluate(answer=>qaRtc.setRemoteDescription(answer),answer);for(const page of pages)try{await page.waitForFunction(()=>window.qaChannel?.open,{},{timeout:12000});}catch(e){console.error('Local RTC channel failed to open.');throw e;}
  }
  const created=await host.evaluate(async external=>{const body=await ManagerTelegram.decorateRoomBody({mode:'code',capacity:2,name:'Host',character:'cassette',color:'#1976ed'});return external?qaNet.create(body):qaNet.call('',body,null);},external);code=external?await host.evaluate(()=>qaNet.code):code;assert.equal(created.status,201);assert.equal(created.data.room.seats[0].cosmeticCharacter,'mira');
  const joined=await member.evaluate(async code=>qaNet.call('join',await ManagerTelegram.decorateRoomBody({name:'Guest',character:'roller',color:'#ffd000'}),{code}),code);assert.equal(joined.status,200);assert.equal(joined.data.room.seats[1].cosmeticCharacter,'asya');
  const hc={code,token:created.data.token,seatId:created.data.seatId},gc={code,token:joined.data.token,seatId:joined.data.seatId};
  // Invalid/stolen-looking proof and client verification flags do not bind a premium costume.
  const forged=await member.evaluate(c=>qaNet.call('appearance',{character:'roller',color:'#ffd000',telegramCharacterId:'anonymous-hacker',telegramCosmeticTicket:'0'.repeat(64),telegramCharacterVerified:true},c),gc);assert.equal(forged.status,200);assert.equal(forged.data.room.seats[1].cosmeticCharacter,undefined);
  const verified=await member.evaluate(async c=>qaNet.call('appearance',await ManagerTelegram.decorateRoomBody({character:'roller',color:'#ffd000'}),c),gc);assert.equal(verified.data.room.seats[1].cosmeticCharacter,'asya');
  await member.evaluate(c=>qaNet.call('ready',{ready:true},c),gc);const started=await host.evaluate(c=>qaNet.call('start',{},c),hc);assert.equal(started.status,200);
  const before=started.data.room,actor=before.game.players[before.game.current].id===hc.seatId?host:member,credentials=actor===host?hc:gc;
  assert.deepEqual(Object.values(before.animation.players).sort(),['asya','mira']);
  const action={method:'roll',args:[],requestId:'qa-action-00000001',gameRevision:before.gameRevision};const rolled=await actor.evaluate(({c,action})=>qaNet.call('action',action,c),{c:credentials,action});assert.equal(rolled.status,200);
  const duplicate=await actor.evaluate(({c,action})=>qaNet.call('action',action,c),{c:credentials,action});assert.equal(duplicate.data.room.game.rolls,1);
  const a=await host.evaluate(c=>qaNet.call('',undefined,c),hc),b=await member.evaluate(c=>qaNet.call('',undefined,c),gc);assert.deepEqual(a.data.room.animation,b.data.room.animation);const dice=a.data.room.animation.events.find(e=>e.type==='dice.rolled');assert(dice);assert.deepEqual(dice.diceValues,a.data.room.game.lastDice);
  // Both controllers consume the same confirmed transition, then a resumed page skips it.
  const accepts=[];
  for(const page of pages)accepts.push(await page.evaluate(({before,room})=>{const catalog=ManagerAnimationRegistry,storage={getItem(){return null;},setItem(){}};const c=new CharacterAnimationController({catalog:{characters:catalog},storage,getSelected:()=>null});const sync=QAEngine.transitionSync(before,room);c.acceptNetwork(room.game,{...room,...sync});const accepted=c.dispatcher.accepted.filter(e=>e.source==='game-engine');c.destroy();const resumed=new CharacterAnimationController({catalog:{characters:catalog},storage,getSelected:()=>null});resumed.acceptNetwork(room.game,{...room,newTransitions:[],animationReset:true});const replayed=resumed.dispatcher.accepted.filter(e=>e.source==='game-engine');resumed.destroy();return {accepted,replayed};},{before,room:a.data.room}));
  assert.deepEqual(accepts[0],accepts[1]);assert(accepts[0].accepted.some(e=>e.type==='dice.rolled'));assert.deepEqual(accepts[0].replayed,[]);
  // Confirm purchases by both participants through the unchanged random engine.
  const purchased=new Set();let room=a.data.room,step=0;
  while(purchased.size<2&&step++<70){
   const player=room.game.players[room.game.current],c=player.id===hc.seatId?hc:gc,page=player.id===hc.seatId?host:member;
   const methods={ready:'roll',purchase:'buy',end:'endTurn',event:'confirmCard',debt:'payDebt'};let method=methods[room.game.phase];if(room.game.phase==='purchase'){const price=await page.evaluate(cell=>QAEngine.BOARD[cell].price,room.game.purchase);if(purchased.has(player.id)||player.balance<price)method='decline';}assert(method,'Unexpected phase '+room.game.phase);
   const result=await page.evaluate(({c,method,revision,step})=>qaNet.call('action',{method,args:[],requestId:'purchase-qa-'+String(step).padStart(8,'0'),gameRevision:revision},c),{c,method,revision:room.gameRevision,step});assert.equal(result.status,200,result.data.error);room=result.data.room;if(method==='buy')purchased.add(player.id);
   if(step%12===0)await page.waitForTimeout(1100);
  }
  assert.equal(purchased.size,2,'Both participants must purchase property');
  const hostFinal=await host.evaluate(c=>qaNet.call('',undefined,c),hc),guestFinal=await member.evaluate(c=>qaNet.call('',undefined,c),gc);assert.deepEqual(hostFinal.data.room.game,guestFinal.data.room.game);assert(!JSON.stringify(hostFinal.data.room).includes('data:image'));
  if(external){await member.evaluate(()=>qaNet.connection.close());await member.waitForTimeout(150);const reconnected=await member.evaluate(c=>qaNet.call('',undefined,c),gc);assert.deepEqual(reconnected.data.room.game,hostFinal.data.room.game);}
  const saved=await host.evaluate(()=>qaNet.authority.export());await host.evaluate(({code,saved})=>{qaNet.authority=new QAEngine.P2PAuthority({code,checkpoint:saved});},{code,saved});const restored=await member.evaluate(c=>qaNet.call('',undefined,c),gc);assert.deepEqual(restored.data.room.game,hostFinal.data.room.game);
  if(external){fs.mkdirSync(path.resolve(__dirname,'../qa-results'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../qa-results/multiplayer-external.json'),JSON.stringify({status:'PASS',checkedAt:new Date().toISOString(),signaling:'manager-peer-server.onrender.com',realExternalSignaling:true,realWebRTC:true,purchasers:purchased.size,duplicateCommand:true,channelReconnect:true,hostCheckpointRestore:true,identicalGameAndAnimation:true,telegramHost:'simulated test identity; not a live Telegram client',physicalNetworkSwitch:false},null,2));}
  assert.deepEqual(errors,[]);console.log('Two isolated Chrome clients: real WebRTC frames, verified costumes, identical dice events, duplicate action, host restore, reconnect watermark and owner preview passed. '+(external?'External PeerJS signaling used.':'Public signaling/TURN not tested.'));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
