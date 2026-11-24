'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('shared presentation is reproducible in standalone, web, Telegram and native HTML',()=>{
 const {embed}=require('../build.cjs');assert.equal(embed(source),source);
 for(const file of ['index.html','online/dist/index.html','telegram/dist/index.html']){
  const text=fs.readFileSync(path.join(root,file),'utf8');for(const marker of ['id="main-menu"','id="menu-play-options"','data-screen="menu"'])assert(text.includes(marker),file+': '+marker);
 }
 assert(!fs.readFileSync(path.join(root,'telegram/client.js'),'utf8').includes("bridge.apply();render();"),'shop must not load on attach');
});
test('camera restores both axes, preserves zoom and respects manual control and disabled follow',()=>{
 const code=source.slice(source.indexOf('function cameraDestination('),source.indexOf('\nconst UI_THEMES='));
 const make=vm.runInNewContext(code+';createBoardCamera',{Date,document:{hidden:false,querySelector:()=>null},window:{innerHeight:1000},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
 let zoom=2,follow=true;const viewport={scrollLeft:170,scrollTop:240,scrollTo(p){this.scrollLeft=p.left;this.scrollTop=p.top;}},stage={};
 const camera=make({viewport,stage,getZoom:()=>zoom,getFollowEnabled:()=>follow,getReducedMotion:()=>true});
 camera.begin();viewport.scrollLeft=350;viewport.scrollTop=900;camera.finish();assert.equal(viewport.scrollLeft,170);assert.equal(viewport.scrollTop,240);assert.equal(zoom,2);
 camera.begin();camera.hold();viewport.scrollLeft=500;camera.finish();assert.equal(viewport.scrollLeft,500);
 camera.begin();viewport.scrollTop=420;zoom=1;camera.cancelReturn();camera.finish();assert.equal(viewport.scrollTop,420);
 camera.begin();viewport.scrollLeft=650;follow=false;camera.finish();assert.equal(viewport.scrollLeft,650);
});
test('runtime URL allowlist refuses traversal and non-content-addressed files',()=>{
 const {asset}=require('../assets.cjs');assert(asset('/assets/runtime/'+'a'.repeat(64)+'.webp'));
 for(const url of ['/assets/runtime/../secret','/assets/runtime/x.js','/assets/runtime/'+'a'.repeat(64)+'.sqlite','/assets/runtime/'+'a'.repeat(64)+'.webp/extra'])assert.equal(asset(url),null);
});
