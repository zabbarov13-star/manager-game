'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../animation/core.ts');
const chars=require('../catalog.cjs').characters.filter(c=>!c.free);
const valid=(type,characterId='mira',sequence=1)=>({schemaVersion:1,eventId:'e-'+sequence+'-'+type,gameId:'g',playerId:'p0',characterId,type,source:type.startsWith('character.')?'local-ui':'game-engine',occurredAt:1000,...(!type.startsWith('character.')?{sequence}:{}),...(['turn.started','dice.rolled','property.purchased'].includes(type)?{turnId:1}:{}),...(type==='dice.rolled'?{diceValues:[2,6]}:{}),...(type==='property.purchased'?{propertyId:1}:{}),...(type.startsWith('money.')?{amount:500}:{})});
const context=characterId=>({gameId:'g',players:{p0:characterId},propertyIds:[1,2,4]});
test('all 108 character/event contracts validate without inserting defaults',()=>{
 let checked=0;for(const c of chars)for(const type of Object.keys(Core.priorities)){const value=valid(type,c.id);assert.equal(Core.validateAnimationEvent(value,context(c.id)).ok,true,c.id+' '+type);assert.equal(Core.validateAnimationEvent({...value,occurredAt:undefined}).ok,false);checked++;}assert.equal(checked,108);
});
test('runtime rejects missing fields, malformed dice, wrong source, foreign players and local game fields',()=>{
 for(const type of Object.keys(Core.priorities)){
  const event=valid(type);for(const key of Object.keys(event)){const missing={...event};delete missing[key];assert.equal(Core.validateAnimationEvent(missing,context('mira')).ok,false,type+' '+key);}
 }
 for(const diceValues of [[0,6],[1,7],[1.5,3],[1],[1,2,3]])assert.equal(Core.validateAnimationEvent({...valid('dice.rolled'),diceValues}).ok,false);
 for(const type of ['character.spawn','character.idle'])for(const [field,value]of [['sequence',0],['turnId',1],['amount',1],['propertyId',1]])assert.equal(Core.validateAnimationEvent({...valid(type),[field]:value}).ok,false);
 assert.equal(Core.validateAnimationEvent({...valid('game.won'),schemaVersion:2}).ok,false);
 assert.equal(Core.validateAnimationEvent(valid('game.won'),context('asya')).ok,false);
 assert.equal(Core.validateAnimationEvent({...valid('property.purchased'),propertyId:3},context('mira')).ok,false);
 assert.equal(Core.validateAnimationEvent({...valid('money.received'),amount:0}).ok,false);
});
test('dispatcher enforces source channels, membership, duplicate IDs, sequence and reconnect watermark',async()=>{
 const rendered=[],d=new Core.AnimationEventDispatcher({registry:chars,context:context('mira'),render:async event=>{rendered.push(event.type);}});
 assert.equal(d.dispatchGame(valid('character.spawn')),false);assert.equal(d.dispatchLocal(valid('dice.rolled')),false);
 assert(d.dispatchLocal(valid('character.spawn')));assert.equal(d.dispatchLocal({...valid('character.spawn'),eventId:'second-spawn'}),false);
 assert(d.dispatchGame(valid('dice.rolled','mira',10)));assert.equal(d.dispatchGame(valid('dice.rolled','mira',10)),false);
 assert.equal(d.dispatchGame({...valid('dice.rolled','mira',9),eventId:'old'}),false);
 d.resume('g',100);assert.equal(d.dispatchGame(valid('money.received','mira',99)),false);assert(d.dispatchGame(valid('money.received','mira',101)));
 assert.equal(d.dispatchGame({...valid('turn.started','mira',102),playerId:'intruder'}),false);
 await new Promise(resolve=>setImmediate(resolve));assert(rendered.includes('dice.rolled'));d.cancelAll();
});
test('purchase and terminal effects abort lower priority work and clean their queues',async()=>{
 const started=[],cancelled=[];
 const d=new Core.AnimationEventDispatcher({registry:chars,context:context('mira'),render:(event,signal)=>new Promise(resolve=>{started.push(event.type);signal.addEventListener('abort',()=>{cancelled.push(event.type);resolve();},{once:true});})});
 d.dispatchLocal(valid('character.idle'));await new Promise(resolve=>setImmediate(resolve));
 d.dispatchGame(valid('property.purchased','mira',1));await new Promise(resolve=>setImmediate(resolve));
 d.dispatchGame(valid('money.received','mira',2));assert.equal(d.queues.get('p0').length,1);
 d.dispatchGame(valid('game.won','mira',3));await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started,['character.idle','property.purchased','game.won']);assert.deepEqual(cancelled,['character.idle','property.purchased']);assert(!d.queues.has('p0'));
 assert.equal(d.dispatchLocal({...valid('character.idle'),eventId:'late-idle'}),false);d.cancelAll();
});
module.exports={valid};
