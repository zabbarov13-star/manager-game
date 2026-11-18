'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('game state transitions, rules, bots and dice values are byte-identical to released generated engine',()=>{
 const base=fs.readFileSync(path.resolve(__dirname,'../dist/engine.cjs'),'utf8'),telegram=fs.readFileSync(path.resolve(__dirname,'../dist/game.js'),'utf8');
 const rules=s=>s.slice(s.indexOf('function createMatch('),s.indexOf("const PENDING_KEY="));
 assert(rules(base).length>30000);assert.equal(rules(telegram),rules(base));
 const stable=require('./stable-signatures.json'),digest=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
 // Existing release builder adaptations: persistent seat IDs and a more detailed
 // construction error message. Neither changes a rule; normalize only these exact strings.
 const normalized=rules(base).replace("id:p.seatId??'p'+i","id:'p'+i").replace("const behind=owned.filter(x=>s.properties[x.id].level<p.level);if(behind.length)return no('Сначала уравняйте число филиалов в своих городах: '+behind.map(x=>x.name+' ('+s.properties[x.id].level+' из '+p.level+')').join(', ')+'.');","if(owned.some(x=>s.properties[x.id].level<p.level))return no('Сначала застройте города с меньшим числом филиалов.');");
 assert.equal(digest(normalized),stable.rulesSha256,'Rules must match the independent stable 0.19.1 signature');
 const dice=s=>s.slice(s.indexOf('function randomInt('),s.indexOf('function rollDice()')+100);
 assert(dice(base).includes('function rollDice()'));assert.equal(dice(telegram),dice(base));
 assert.equal(digest(dice(base)),stable.diceSha256,'Random source must match stable 0.19.1');
});
