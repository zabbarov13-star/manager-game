'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../animation/core.ts'),catalog=require('../catalog.cjs');
const fixture={exports:{}};
new Function('module',fs.readFileSync(require.resolve('../dist/engine.cjs'),'utf8').replace('module.exports={handleRooms,CHARACTERS,COLORS};','module.exports={createMatch,MatchEngine,CHARACTERS,COLORS,validMatch};'))(fixture);
const E=fixture.exports;
function setup(){const s=E.createMatch(E.CHARACTERS.slice(0,2).map((c,i)=>({name:'Player '+i,character:c.id,color:E.COLORS[i].id})),{firstPlayer:0,rulesProfile:'original'});return {s,context:{gameId:'confirmed:test',players:Object.fromEntries(s.players.map((p,i)=>[p.id,i?'asya':'mira'])),propertyIds:Object.keys(s.properties).map(Number)}};}
test('confirmed engine dice, purchase and decline emit actual values without duplicate purchase debit',()=>{
 const {s,context}=setup();const target=Number(Object.keys(s.properties)[0]);s.players[0].position=(target+37)%40;const initial=Core.snapshot(s);new E.MatchEngine(s).roll([1,2]);assert.equal(s.purchase,target);
 const rolled=Core.deriveGameEvents(initial,s,context,1,123);assert.deepEqual(rolled.find(e=>e.type==='dice.rolled').diceValues,[1,2]);assert.equal(rolled.some(e=>e.type==='property.purchased'),false);
 const before=Core.snapshot(s);new E.MatchEngine(s).buy();assert(E.validMatch(s));const purchased=Core.deriveGameEvents(before,s,context,2,124);
 assert.equal(purchased.filter(e=>e.type==='property.purchased').length,1);assert.equal(purchased.find(e=>e.type==='property.purchased').propertyId,target);assert.equal(purchased.some(e=>e.type==='money.lost'),false);
 const declined=setup();declined.s.players[0].position=(target+37)%40;new E.MatchEngine(declined.s).roll([1,2]);const snap=Core.snapshot(declined.s);new E.MatchEngine(declined.s).decline();assert.equal(Core.deriveGameEvents(snap,declined.s,declined.context,2,125).some(e=>e.type==='property.purchased'),false);
});
test('money events use confirmed paid ledger amounts; only final state awards victory',()=>{
 const {s,context}=setup();let before=Core.snapshot(s);s.players[0].position=35;new E.MatchEngine(s).roll([2,3]);
 const events=Core.deriveGameEvents(before,s,context,1,126);const income=events.find(e=>e.type==='money.received');assert(income);assert.equal(income.amount,s.finance.entries.find(e=>e.type!=='opening'&&e.to===s.players[0].id).amount);assert(!events.some(e=>e.type==='game.won'));
 before=Core.snapshot(s);s.players[1].out=true;s.winner=s.players[0].id;s.phase='over';const final=Core.deriveGameEvents(before,s,context,2,127);assert.equal(final.filter(e=>e.type==='game.won').length,1);assert.equal(final.filter(e=>e.type==='game.lost').length,1);assert.deepEqual(Core.deriveGameEvents(Core.snapshot(s),s,context,3,128),[]);
});
test('authority creates one stable envelope for both clients; reconnect baseline skips old effects',()=>{
 const {s}=setup();const room={code:'ABC123',createdAt:100,gameRevision:1,game:s,seats:s.players.map((p,i)=>({id:p.id,cosmeticCharacter:i?'asya':'mira'}))};
 const start=Core.captureRoom(room,catalog.characters,130);assert.deepEqual(Core.captureRoom(room,catalog.characters,999),start);
 new E.MatchEngine(s).roll([1,2]);room.gameRevision++;const host=structuredClone(Core.captureRoom(room,catalog.characters,140)),guest=structuredClone(Core.captureRoom(room,catalog.characters,141));assert.deepEqual(host,guest);
 const d=new Core.AnimationEventDispatcher({registry:catalog.characters,context:{gameId:guest.gameId,players:guest.players},render:async()=>{}});d.resume(guest.gameId,guest.throughSequence);for(const event of guest.events)assert.equal(d.dispatchGame(event),false);assert.equal(d.accepted.length,0);d.cancelAll();
});
