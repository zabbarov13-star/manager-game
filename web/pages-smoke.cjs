const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({args:['--no-sandbox']});
try {
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:false});
 const page=await ctx.newPage();
 const url=process.argv[2] || 'http://localhost:8765/';
 await page.goto(url,{waitUntil:'load'});
 assert.match(await page.title(),/0\.19\.0/);
 await page.waitForFunction(()=>navigator.serviceWorker.controller && document.querySelectorAll('button').length>50, {timeout:45000});
 const cached=await page.evaluate(async()=>Boolean(await caches.match(new URL('index.html',location.href))));
 assert.equal(cached,true);
 const m=await page.evaluate(async()=>await (await fetch('./manifest.webmanifest')).json());
 assert.equal(m.display,'standalone');
 assert.equal(m.scope,'./');
 await ctx.setOffline(true);
 await page.reload({waitUntil:'load'});
 assert.match(await page.title(),/0\.19\.0/);
 assert.ok(await page.locator('button').count()>50);
 console.log('PASS version, mobile layout DOM, manifest, service worker, cache, offline reload');
} finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
