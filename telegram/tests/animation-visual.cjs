'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),sharp=require('sharp');
const characters=require('../catalog.cjs').characters.filter(c=>!c.free),types=Object.keys(require('../animation/core.ts').priorities);
const folder=path.resolve(__dirname,'../animation-demo/screenshots');fs.mkdirSync(folder,{recursive:true});
(async()=>{let browser;const results=[],timings={};try{
 browser=await chromium.launch({headless:true,...(process.env.QA_CHROME?{executablePath:process.env.QA_CHROME}:{})});
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<600}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../animation-demo/index.html')).href);await page.evaluate(()=>window.demoReady);
  const times=[];
  for(const character of characters){
   await page.evaluate(id=>window.animationDemo.choose(id),character.id);const frames=[];
   for(const type of types){const a=await page.evaluate(type=>window.animationDemo.renderFrame(type,.22),type),b=await page.evaluate(type=>window.animationDemo.renderFrame(type,.72),type);assert.notEqual(a.image,b.image,character.id+' '+type+' must change rendered pixels');
    const coverage=await page.evaluate(()=>{const c=document.querySelector('#stage'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});assert(coverage>1000,character.id+' '+type+' must draw a real character');
    frames.push({type,image:b.image});times.push(b.frameMs);results.push({characterId:character.id,type,viewport:viewport.width,visual:true});
   }
   if(character.id==='mira'){
    await page.evaluate(()=>window.animationDemo.dispatcher.dispatchGame(window.animationDemo.sample('property.purchased')));await page.waitForTimeout(100);const a=await page.locator('#stage').evaluate(canvas=>canvas.toDataURL());await page.waitForTimeout(300);const b=await page.locator('#stage').evaluate(canvas=>canvas.toDataURL());assert.notEqual(a,b,'Reference rig must actually animate through requestAnimationFrame');assert(await page.locator('#character').isEnabled());
    console.log('Reference Mira verified at '+viewport.width+'px before remaining 11 characters.');
   }
   if(viewport.width===1440){const image=await page.evaluate(async frames=>{const sheet=document.createElement('canvas');sheet.width=1080;sheet.height=1530;const ctx=sheet.getContext('2d');ctx.fillStyle='#102431';ctx.fillRect(0,0,sheet.width,sheet.height);for(let i=0;i<frames.length;i++){const img=new Image();img.src=frames[i].image;await img.decode();const x=i%3*360,y=Math.floor(i/3)*510;ctx.drawImage(img,x,y+30,360,480);ctx.fillStyle='#f1d58e';ctx.font='17px Arial';ctx.fillText(frames[i].type,x+12,y+22);}return sheet.toDataURL('image/png');},frames);await sharp(Buffer.from(image.split(',')[1],'base64')).webp({quality:90}).toFile(path.join(folder,character.id+'-all-events.webp'));}
  }
  assert.deepEqual(errors,[]);times.sort((a,b)=>a-b);timings[viewport.width]={p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),renderer:'Canvas 2D, 360×480, desktop Chrome, no device CPU emulation'};
  await page.screenshot({path:path.join(folder,'demo-'+viewport.width+'.png'),fullPage:true});console.log('Visual render cases passed: '+characters.length*types.length+' at '+viewport.width+'px');await page.close();
 }
 fs.writeFileSync(path.resolve(__dirname,'../animation-demo/visual-results.json'),JSON.stringify({uniqueScenarios:108,executions:results.length,deviceCaveat:'Viewport emulation on desktop Chrome; physical Android/iOS not tested',timings,results},null,2));
}finally{await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
