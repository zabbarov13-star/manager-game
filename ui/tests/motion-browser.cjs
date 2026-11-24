'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('node:http'),{once}=require('node:events');
const {chromium}=require('../../telegram/node_modules/playwright'),catalog=require('../../telegram/catalog.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.QA_BROWSER||undefined});
 const server=createServer((_req,res)=>res.end('<!doctype html><canvas></canvas>')).listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  await page.addScriptTag({path:require.resolve('../motion.js')});await page.addScriptTag({path:require.resolve('../../telegram/animation/renderer.js')});
  await page.addScriptTag({content:require('../../telegram/animation/build.cjs').bundle()});
  await page.addScriptTag({path:require.resolve('../../telegram/animation/controller.js')});
  let count=0;
  for(const character of catalog.characters.filter(c=>!c.free)){
   const inline=p=>'data:image/webp;base64,'+fs.readFileSync(path.resolve(__dirname,'../../telegram',p.slice(1))).toString('base64');
   const definition={...character,sprite:inline(character.sprite),poses:Object.fromEntries(Object.entries(character.poses).map(([key,value])=>[key,inline(value)]))};
   const rows=await page.evaluate(async c=>{
    const renderer=new ManagerCharacterAnimation.CharacterCanvasRenderer(document.querySelector('canvas'),c);await renderer.load();const rows=[];
    for(const phase of Object.keys(ManagerMotion.phases)){
     const hashes=[];for(const t of [.1,.35,.65,.9]){renderer.renderFrame({type:'visual.'+phase},t);const pixels=renderer.ctx.getImageData(0,0,360,480).data;let hash=2166136261;for(let i=0;i<pixels.length;i+=13)hash=Math.imul(hash^pixels[i],16777619);hashes.push(hash);}
     const frames=renderer.metrics.frames,start=performance.now();await renderer.play({type:'visual.'+phase},new AbortController().signal);
     rows.push({phase,samples:new Set(hashes).size,frames:renderer.metrics.frames-frames,elapsed:performance.now()-start,expected:ManagerMotion.phases[phase]});
    }renderer.cancel();return rows;
   },definition);
   for(const row of rows){assert(row.samples>=3&&row.frames>=5&&row.elapsed>=row.expected-30&&row.elapsed<row.expected+750,character.id+' '+JSON.stringify(row));count++;}
   if(character.id==='mira'){
    const lifecycle=await page.evaluate(async c=>{
     const marker=document.createElement('div');marker.className='player-token';marker.dataset.playerId='p0';marker.innerHTML='<svg><image data-tg-body /></svg>';document.body.append(marker);
     const controller=new CharacterAnimationController({catalog:{characters:[c]},storage:{getItem(){return null;},setItem(){}},getSelected:()=>c});
     controller.context('local-motion-fixture',{players:[{id:'p0',character:c.id,name:'Fixture'}],properties:{}},{p0:c.id});const record=controller.renderers.get('p0');await record.renderer.load();controller.dispatcher.cancelAll();
     controller.dispatcher.dispatchLocal(controller.localEvent('character.idle','p0'));await new Promise(r=>setTimeout(r,30));
     ManagerMotion.notify('p0','walk');await new Promise(r=>setTimeout(r,120));const walking=record.localPlaying&&!controller.dispatcher.active.has('p0')&&marker.querySelector('image').hasAttribute('transform');
     controller.onActivity({detail:false});const frames=record.renderer.metrics.frames;await new Promise(r=>setTimeout(r,100));const paused=frames===record.renderer.metrics.frames;
     controller.destroy();marker.remove();return {walking,paused,timers:controller.idleTimers.size,renderers:controller.renderers.size};
    },definition);
    assert.deepEqual(lifecycle,{walking:true,paused:true,timers:0,renderers:0});
   }
  }
  assert.equal(count,48);console.log('PASS 12 characters x 4 local phases: at least 3 distinct rendered Canvas samples each; approved WebP poses used.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
