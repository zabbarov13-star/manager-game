'use strict';
// Test-only Telegram host simulation. No developer identity bypass exists in the shipped client/server.
const assert=require('node:assert/strict'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {chromium}=require('playwright');
const {createApp}=require('../server.cjs');
const token='123:browser-fixture-token',secret='browser-fixture-webhook-secret-32characters';
function initData(){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123,first_name:'Тестовый игрок'})});const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
(async()=>{
 const port=20000+Math.floor(Math.random()*10000);
 const server=createApp({botToken:token,webhookSecret:secret,origin:'http://127.0.0.1:'+port,allowHttp:true,database:':memory:',bot:async()=>{throw Error('Live bot calls forbidden in smoke test');}}).listen(port,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;let browser;
 try{browser=await chromium.launch({headless:true,...(process.env.QA_CHROME?{executablePath:process.env.QA_CHROME}:{})});
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
   const context=await browser.newContext({viewport,hasTouch:viewport.width<600});
   const errors=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:${JSON.stringify(initData())},ready(){},expand(){},onEvent(){},BackButton:{show(){},hide(){},onClick(){}},showPopup(o,cb){cb('cancel')}}};`}));
   await page.addInitScript(()=>localStorage.setItem('manager.field.v1','original-version-sentinel'));
   await page.goto(url);try{await page.locator('#telegram-loading').waitFor({state:'detached',timeout:10000});}catch(e){console.error('Bootstrap diagnostics:',errors,await page.locator('#telegram-loading').textContent());throw e;}
   await page.locator('[data-menu=shop]').click();
   assert.equal(await page.locator('.tg-card').count(),18);
   assert.equal(await page.locator('.tg-card img').count(),12);
   const missing=await page.locator('.tg-card img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().then(()=>null,()=>img.src))));assert(missing.every(v=>v===null),JSON.stringify(missing));
   await page.locator('.tg-card').first().getByRole('button',{name:'Биография и характеристики'}).click();assert.equal(await page.locator('meter').count(),5);
   await page.locator('.tg-dialog').getByRole('button',{name:'Персонажи',exact:true}).click();await page.screenshot({path:require('node:path').resolve(__dirname,`../qa-collection-${viewport.width}.png`),fullPage:true});
   server.store.db.prepare("INSERT OR IGNORE INTO grants(user,item,source,expires) VALUES('123','character:mira','test-fixture',NULL)").run();
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(100);
   await page.locator('.tg-card').filter({has:page.getByRole('heading',{name:'Мира',exact:true})}).getByRole('button',{name:'Выбрать',exact:true}).click();
   await page.locator('.tg-dialog').getByRole('button',{name:'Магазин',exact:true}).click();assert.equal(await page.getByRole('button',{name:'25 ⭐',exact:true}).count(),4);
   await page.locator('.tg-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
   await page.locator('#settings-open').click();await page.locator('.start-match').click();
   if(viewport.width>600){await page.locator('#party-mode').selectOption('bots');await page.locator('#player-count').selectOption('6');await page.locator('#bot-difficulty').selectOption('hard');}
   await page.locator('#party-start').click();
   await page.locator('#settings-open').click();await page.locator('#music-on').uncheck();await page.getByRole('button',{name:'Готово',exact:true}).last().click();
   await page.locator('#roll-button').click();await page.waitForFunction(()=>/^\d/.test(document.getElementById('dice-result').textContent));
   assert(await page.locator('.player-token svg[data-tg-premium="mira"] image').count()>0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('manager.field.v1')),'original-version-sentinel');
   assert(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('manager.telegram.v1.123.'))));
   await page.reload();await page.locator('#telegram-loading').waitFor({state:'detached'});assert(await page.locator('.player-token svg[data-tg-premium="mira"] image').count()>0,'Saved local match and selected costume must survive reload');
   assert.deepEqual(errors,[]);await page.screenshot({path:require('node:path').resolve(__dirname,`../qa-${viewport.width}.png`),fullPage:true});
   console.log(`Verified ${viewport.width}px: auth, 18 portraits, stats, packs, local match, dice, isolated saves, no JS errors.`);await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
