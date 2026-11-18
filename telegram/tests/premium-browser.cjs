'use strict';
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createHmac}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createApp}=require('../server.cjs');
const characters=require('../catalog.cjs').characters.filter(c=>!c.free&&(!process.env.QA_CHARACTER||c.id===process.env.QA_CHARACTER));
const token='123:art-review-test-token';
function initData(){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123,first_name:'Проверка графики'})});const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}

(async()=>{
 const port=30000+Math.floor(Math.random()*10000),origin='http://127.0.0.1:'+port;
 const server=createApp({botToken:token,webhookSecret:'art-review-test-webhook-secret-long-enough',origin,allowHttp:true,database:':memory:',bot:async()=>{throw Error('Live payments forbidden in art QA');}}).listen(port,'127.0.0.1');await once(server,'listening');
 const screenshots=path.resolve(__dirname,'../art-review/screenshots');fs.mkdirSync(screenshots,{recursive:true});const results=[];let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.QA_CHROME?{executablePath:process.env.QA_CHROME}:{})});
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
   // Clear the synthetic grants between viewports so every preview starts locked.
   server.store.db.prepare('DELETE FROM grants').run();
   const context=await browser.newContext({viewport,hasTouch:viewport.width<600}),page=await context.newPage();const errors=[],mutations=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{if(request.method()==='POST'&&/\/api\/(profile|invoice|ads)/.test(request.url()))mutations.push(request.url());});
   await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:${JSON.stringify(initData())},ready(){},expand(){},onEvent(){},BackButton:{show(){},hide(){},onClick(){}},showPopup(o,cb){cb('cancel')}}};`}));
   await page.goto(origin);await page.locator('#telegram-loading').waitFor({state:'detached'});
   await page.locator('.tg-entry').getByRole('button',{name:'Персонажи',exact:true}).click();
   for(const c of characters){
    const card=page.locator('.tg-card').filter({has:page.getByRole('heading',{name:c.name,exact:true})});
    await card.getByRole('button',{name:'Бесплатный предпросмотр'}).click();
    const showcase=page.locator('.tg-showcase'),image=showcase.locator('.tg-showcase-image');
    await image.evaluate(img=>img.decode());assert.equal(await showcase.locator('meter').count(),5);
    assert.equal(await showcase.getByRole('button',{name:'Выбрать',exact:true}).count(),0,'Locked preview must not offer play selection');
    await page.locator('.tg-dialog').screenshot({path:path.join(screenshots,`${c.id}-${viewport.width}-portrait.png`)});
    for(const [state,label]of [['idle','Ожидание'],['joy','Радость'],['failure','Разочарование'],['win','Победа'],['loss','Поражение']]){
     await showcase.getByRole('button',{name:label,exact:true}).click();await image.evaluate(img=>img.decode());assert.equal(await showcase.locator('.tg-art-stage').getAttribute('data-state'),state);assert((await image.getAttribute('src')).endsWith(c.poses[state]));
     if(state==='win'){
      assert.equal(await image.evaluate(img=>getComputedStyle(img).animationName),'premium-victory');
      assert.equal(await showcase.locator('.tg-victory-burst').evaluate(element=>getComputedStyle(element).display),'block');
      await page.locator('.tg-dialog').screenshot({path:path.join(screenshots,`${c.id}-${viewport.width}-victory.png`)});
     }
    }
    assert.equal(server.store.access('123','character:'+c.id).available,false);
    await page.getByRole('button',{name:'← Все персонажи',exact:true}).click();
   }
   assert.deepEqual(mutations,[],'Preview must not mutate access, create invoices or start ads');
   // Test-only ownership fixtures, introduced only after all locked previews have been verified.
   for(const c of characters)server.store.db.prepare("INSERT INTO grants(user,item,source,expires) VALUES('123',?,'visual-qa',NULL)").run('character:'+c.id);
   await page.locator('.tg-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   for(const c of characters){
    await page.locator('.tg-entry').getByRole('button',{name:'Персонажи',exact:true}).click();
    const card=page.locator('.tg-card').filter({has:page.getByRole('heading',{name:c.name,exact:true})});await card.getByRole('button',{name:'Выбрать',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.tg-dialog').hasAttribute('aria-busy'));
    await page.locator('.tg-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
    await page.locator('#settings-open').click();await page.locator('#party-open').click();await page.locator('#party-start').click();
    const sprite=page.locator(`.player-token svg[data-tg-premium="${c.id}"] image`);await sprite.first().waitFor();assert.equal(await sprite.first().getAttribute('href'),c.sprite);
    const bound=await page.locator('.tg-entry').evaluate(e=>e.getBoundingClientRect().right);assert(bound<=viewport.width+1);
    await page.locator('#board-viewport').screenshot({path:path.join(screenshots,`${c.id}-${viewport.width}-board.png`)});
    results.push({character:c.id,viewport:viewport.width,lockedPreview:true,allFivePoses:true,board:true});
   }
   assert.deepEqual(errors,[]);console.log(`Verified ${characters.length} premium characters at ${viewport.width}px: locked preview, five poses, portrait and board.`);await context.close();
  }
  fs.writeFileSync(path.resolve(__dirname,'../art-review/browser-results.json'),JSON.stringify({telegramHost:'simulated; no real payments or ads',results},null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
