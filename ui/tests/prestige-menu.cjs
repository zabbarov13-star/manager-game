'use strict';
// Menu-only visual acceptance. Desktop Chromium viewports are not physical devices.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events');
const {chromium}=require('../../telegram/node_modules/playwright');
const {createRoomServer}=require('../../online/server.cjs');
const out=path.resolve('release-output/prestige-menu');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=createRoomServer({database:':memory:'}).listen(0,'127.0.0.1');await once(server,'listening');let browser;
 const results=[],errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER?{executablePath:process.env.QA_BROWSER}:{})});
  for(const [width,height,zoom=1] of [[320,568],[390,844],[430,932],[768,1024],[1440,1000],[568,320],[1024,768],[1440,1000,2]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage();
   page.on('pageerror',()=>errors.push('Uncaught browser error'));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.body.classList.contains('modern-ui'));if(zoom!==1)await page.evaluate(z=>document.documentElement.style.zoom=z,zoom);
   await page.evaluate(()=>{document.documentElement.style.setProperty('--tg-inset-top','24px');document.documentElement.style.setProperty('--tg-inset-bottom','20px');});
   async function check(screen){
    const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:[...document.querySelectorAll('#main-menu button,.header-actions button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return {label:b.textContent.trim()||b.getAttribute('aria-label'),width:r.width,height:r.height,clipped:b.scrollWidth>b.clientWidth+1||b.scrollHeight>b.clientHeight+1};}),headerOverlap:(()=>{const a=document.querySelector('.brand').getBoundingClientRect(),b=document.querySelector('.header-actions').getBoundingClientRect();return a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;})(),runningAnimations:document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.target?.closest?.('#main-menu,.topbar')).map(a=>({name:a.animationName,target:a.effect.target.id||a.effect.target.tagName}))}));
    assert.equal(data.overflow,false,screen+' overflow at '+width);assert.equal(data.headerOverlap,false,'Header overlap at '+width);assert.deepEqual(data.runningAnimations,[],'Reduced motion '+JSON.stringify(data.runningAnimations));
    for(const b of data.buttons){assert(b.width>=44&&b.height>=44,screen+' touch target '+b.label);assert(!b.clipped,screen+' clipped button '+b.label);}
    if(zoom===1&&(width===390||width===1440))await page.screenshot({path:path.join(out,screen+'-'+width+'.png'),fullPage:true});
    if(screen==='play')assert.deepEqual(await page.locator('.play-card').evaluateAll(nodes=>nodes.map(b=>b.dataset.menu)),['new','continue','online','explore','back']);
    if(screen==='home')assert(await page.locator('.menu-actions>button:not(.menu-play)').evaluateAll(nodes=>Math.max(...nodes.map(b=>b.getBoundingClientRect().height))-Math.min(...nodes.map(b=>b.getBoundingClientRect().height))<1));
    assert.equal(await page.locator('.menu-brand').evaluate(e=>getComputedStyle(e).animationName),'none');
    results.push({screen,width,height,zoom,status:'PASS',buttons:data.buttons.length,safeAreaSimulation:true,reducedMotion:true});
   }
   await check('home');await page.locator('[data-menu=play]').click();assert.equal(await page.locator('#main-menu').getAttribute('data-view'),'play');assert.equal(await page.locator('[data-menu=continue]').isDisabled(),true);await check('play');
   if(width===390){await page.locator('[data-menu=online]').click();await page.locator('#online-dialog').waitFor({state:'visible'});await page.locator('#online-dialog').evaluate(d=>d.close());}
   await page.locator('[data-menu=back]').click();assert.equal(await page.locator('#main-menu').getAttribute('data-view'),'home');
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: 16 menu/viewport/200% CSS zoom cases; touch targets, overflow, safe areas, reduced motion, back, no fake save');
 }finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'visual.json'),JSON.stringify({scope:'Chromium viewport simulation, not physical Telegram',results,errors},null,2)+'\n');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
