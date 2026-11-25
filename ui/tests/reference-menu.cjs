'use strict';
// Focused menu/navigation/launch/save regression; broader browser.cjs stays unchanged.
// Telegram SDK fixture and viewports are not real Telegram or physical devices.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {chromium,devices}=require('../../telegram/node_modules/playwright');
const {createRoomServer}=require('../../online/server.cjs'),{createApp}=require('../../telegram/server.cjs');
const output=path.resolve(__dirname,'../../release-output/ui-qa');fs.mkdirSync(output,{recursive:true});
const token='123:local-presentation-fixture-token',secret='local-presentation-fixture-webhook-32-chars';
function initData(){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:987654,first_name:'QA'})});const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
async function main(){
 const web=createRoomServer({database:':memory:'}).listen(0,'127.0.0.1');await once(web,'listening');
 const reservation=require('node:net').createServer().listen(0,'127.0.0.1');await once(reservation,'listening');const tgPort=reservation.address().port;await new Promise(r=>reservation.close(r));
 const telegram=createApp({botToken:token,webhookSecret:secret,origin:'http://127.0.0.1:'+tgPort,database:':memory:',allowHttp:true}).listen(tgPort,'127.0.0.1');await once(telegram,'listening');
 const browser=await chromium.launch({executablePath:process.env.QA_BROWSER||undefined});const results=[],errors=[];
 try{
  for(const [edition,server]of [['web',web],['telegram-fixture',telegram]])for(const [device,options]of [['desktop',{viewport:{width:1440,height:1000}}],['android-emulated',devices['Pixel 7']],['ios-viewport',devices['iPhone 13']]]){
   if(process.env.QA_EDITION&&edition!==process.env.QA_EDITION)continue;
   const context=await browser.newContext({...options,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push({edition,device,error:e.message}));const requests=[];page.on('request',r=>requests.push(r.url()));
   page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);
   if(edition==='telegram-fixture')await context.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:${JSON.stringify(initData())},ready(){},expand(){},onEvent(){},BackButton:{show(){},hide(){},onClick(){}}}};`}));
   const url='http://127.0.0.1:'+server.address().port;await page.goto(url);await page.waitForFunction(()=>document.body.classList.contains('modern-ui'),null,{timeout:15000}).catch(async e=>{throw Error(JSON.stringify({edition,device,errors,loading:await page.locator('#telegram-loading').textContent().catch(()=>null)}));});
   const timing=await page.evaluate(()=>({interactiveMs:performance.now(),domMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,bytes:performance.getEntriesByType('navigation')[0].transferSize+performance.getEntriesByType('resource').reduce((s,r)=>s+r.transferSize,0)}));
   assert.equal(await page.locator('body').getAttribute('data-screen'),'menu');assert.equal(await page.locator('.layout').isVisible(),false);assert(!requests.some(r=>r.includes('premium-v2')),'cold menu must not load premium art');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'menu horizontal overflow');
   if(process.env.UI_SCREENSHOTS)await page.screenshot({path:path.join(output,edition+'-'+device+'-menu.png'),fullPage:true});
   await page.locator('[data-menu=settings]').first().click();await page.locator('#settings-dialog').waitFor();await page.locator('#reduced-motion').check();await page.locator('#settings-dialog .close-button').click();
   await page.locator('[data-menu=rules]').click();assert((await page.locator('#rules-dialog').innerText()).includes('Original'));await page.locator('#rules-dialog .close-button').click();
   await page.locator('[data-menu=shop]').click();if(edition==='web'){await page.locator('#platform-shop').waitFor();await page.locator('#platform-shop .close-button').click();}else{await page.locator('.tg-dialog').waitFor();await page.getByRole('button',{name:'Закрыть',exact:true}).click();}
   await page.locator('[data-menu=more]').click();await page.locator('#more-games').waitFor();await page.locator('#more-games .close-button').click();
   await page.locator('[data-menu=play]').click();assert.equal(await page.locator('[data-menu=continue]').isDisabled(),true);await page.locator('[data-menu=new]').first().click();await page.locator('#party-dialog').waitFor();await page.locator('#party-mode').selectOption('local');await page.locator('#party-start').click();
   await page.waitForFunction(()=>document.body.dataset.screen==='game');assert.equal(await page.locator('#tab-game').getAttribute('aria-selected'),'true');
   assert.deepEqual(await page.locator('[role=tab]:visible').allTextContents(),['Игра','Клетка','Владения','Журнал']);assert.equal(await page.locator('#trade-menu').evaluate(n=>n.parentElement.id),'players-panel');
   await page.locator('.menu-open').click();await page.locator('[data-menu=play]').click();assert.equal(await page.locator('[data-menu=continue]').isEnabled(),true);await page.reload();await page.waitForFunction(()=>document.body.classList.contains('modern-ui'),null,{timeout:15000}).catch(async e=>{throw Error(JSON.stringify({edition,device,errors,loading:await page.locator('#telegram-loading').textContent().catch(()=>null)}));});await page.locator('[data-menu=play]').click();await page.locator('[data-menu=continue]').click();assert.equal(await page.locator('#tab-game').getAttribute('aria-selected'),'true');
   results.push({edition,device,status:'PASS',timing,savedMatchRestored:true});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'reference-menu.json'),JSON.stringify({results,errors,telegramRealClient:'BLOCKED',physicalDevices:'BLOCKED'},null,2));console.log(JSON.stringify(results.map(r=>({edition:r.edition,device:r.device,status:r.status,interactiveMs:r.timing.interactiveMs}))));
 }finally{await browser.close();await new Promise(r=>web.close(r));await new Promise(r=>telegram.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
