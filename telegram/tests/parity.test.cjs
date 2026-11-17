'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('game state transitions, rules, bots and dice values are byte-identical to released generated engine',()=>{
 const base=fs.readFileSync(path.resolve(__dirname,'../dist/engine.cjs'),'utf8'),telegram=fs.readFileSync(path.resolve(__dirname,'../dist/game.js'),'utf8');
 const rules=s=>s.slice(s.indexOf('function createMatch('),s.indexOf("const PENDING_KEY="));
 assert(rules(base).length>30000);assert.equal(rules(telegram),rules(base));
 const dice=s=>s.slice(s.indexOf('function randomInt('),s.indexOf('function rollDice()')+100);
 assert(dice(base).includes('function rollDice()'));assert.equal(dice(telegram),dice(base));
});
