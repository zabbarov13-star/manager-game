'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../motion.js'),'utf8'),context);const motion=context.window.ManagerMotion;
const themes=['blueprint','deal','crown','hologram','garden','robot','crypto','pirate','cash','phone','restaurant','matrix'];
test('12 distinct movement traces; all local phases are finite and stopping restores the support point',()=>{
 const traces=new Set();for(const theme of themes){const trace=[];for(const phase of Object.keys(motion.phases))for(const t of [0,.15,.35,.65,.85,1]){const pose=motion.gait(theme,phase,t);assert(Object.values(pose).every(Number.isFinite));if(phase==='walk')trace.push(pose);if(phase==='stop'&&t===1)assert.deepEqual(JSON.parse(JSON.stringify(pose)),{x:0,y:0,r:0,sx:1,sy:1});}traces.add(JSON.stringify(trace));}assert.equal(traces.size,12);
});
test('an opponent and a legacy peer never inherit the viewing player look',()=>{
 const room={seats:[{id:'a',cosmeticStyle:'arcade',cosmeticDice:'jade'},{id:'b',cosmeticStyle:'velvet'}]};
 assert.deepEqual(JSON.parse(JSON.stringify(motion.actorLook('a',room))),{theme:'arcade',dice:'jade'});
 assert.deepEqual(JSON.parse(JSON.stringify(motion.actorLook('b',room))),{theme:'velvet',dice:''});
 assert.deepEqual(JSON.parse(JSON.stringify(motion.actorLook('legacy',room))),{theme:'heritage',dice:''});
 const node={dataset:{}};motion.dice(node,motion.actorLook('a',room));motion.dice(node,motion.actorLook('b',room));assert.deepEqual(node.dataset,{look:'velvet',dice:''});
 const own={theme:'arcade',dice:'jade'};assert.strictEqual(motion.localLook({id:'p0',kind:'human'},own),own);
 for(const player of [{id:'p0',kind:'bot'},{id:'p1',kind:'human'},{id:'p1',kind:'bot'}])assert.deepEqual(JSON.parse(JSON.stringify(motion.localLook(player,own))),{theme:'heritage',dice:''});
});
