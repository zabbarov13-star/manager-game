const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { CHARACTERS, COLORS } = require('../dist/engine.cjs');
const base = process.env.MANAGER_TEST_ORIGIN || 'https://95-181-169-84.sslip.io';
const timings = [];
const nonce = randomUUID().slice(0,8);
let errors = 0;
async function api(path, { body, token, key = randomUUID(), expected = 200 } = {}) {
  const start = performance.now();
  try {
    const r = await fetch(base + '/api/rooms' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined && {'Content-Type':'application/json','Idempotency-Key':key}),
        ...(token && {Authorization:'Bearer '+token}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json();
    assert.equal(r.status, expected, data.error);
    return data;
  } catch (e) { errors++; throw e; }
  finally { timings.push(performance.now() - start); }
}
const player = i => ({name:'QA '+nonce+' '+i,character:CHARACTERS[i].id,color:COLORS[i].id});
async function room(count, mode, label) {
  const host = await api('', {body:{...player(0),title:'QA '+nonce+' '+label,mode,capacity:count},expected:201});
  const path = '/' + host.room.code;
  const auth = {token:host.token};
  const members = [host];
  if (mode === 'private') await api(path+'/join', {body:player(1),expected:403});
  for (let i=1;i<count;i++) {
    const invite = mode === 'private' ? (await api(path+'/invite',{...auth,body:{}})).invitation : undefined;
    const member = await api(path+'/join',{body:{...player(i),...(invite&&{invite})}});
    members.push(member);
    await api(path+'/ready',{token:member.token,body:{ready:true}});
  }
  const started = await api(path+'/start',{...auth,body:{}});
  assert.equal(started.room.game.players.length,count);
  return {path,members,game:started.room};
}
async function roll(table) {
  const {path,members,game}=table;
  const actor = members.find(p=>p.seatId===game.game.players[game.game.current].id);
  const body={method:'roll',args:[[99,99]],requestId:randomUUID(),gameRevision:game.gameRevision};
  const key=randomUUID(), opts={body,key,token:actor.token};
  const first=await api(path+'/action',opts);
  const replay=await api(path+'/action',opts);
  assert.equal(first.room.game.rolls,1);
  assert.deepEqual(first.room.game.lastDice,replay.room.game.lastDice);
  assert.equal(first.room.gameRevision,replay.room.gameRevision);
  assert(first.room.game.lastDice.every(n=>n>=1&&n<=6));
  const reads=await Promise.all(members.map(p=>api(path,{token:p.token})));
  assert(reads.every(x=>x.room.gameRevision===first.room.gameRevision&&
    JSON.stringify(x.room.game.lastDice)===JSON.stringify(first.room.game.lastDice)));
}
(async()=>{
  const health=await fetch(base+'/health',{signal:AbortSignal.timeout(8000)});
  assert(health.ok);
  assert((await health.json()).ok);
  const asset=await fetch(base+'/dist/engine.cjs',{signal:AbortSignal.timeout(8000)});
  assert.equal(asset.status,404);
  const publicHost=await api('',{body:{...player(0),title:'QA '+nonce,mode:'public',capacity:2},expected:201});
  const lobby=await api('/PUBLIC');
  assert(lobby.rooms.some(r=>r.code===publicHost.room.code));
  await api('/'+publicHost.room.code+'/leave',{body:{},token:publicHost.token});
  assert(!(await api('/PUBLIC')).rooms.some(r=>r.code===publicHost.room.code));
  const tables=await Promise.all([room(2,'private','A'),room(4,'code','B'),room(6,'code','C')]);
  assert.equal(new Set(tables.map(x=>x.path)).size,tables.length);
  await api(tables[0].path,{token:tables[1].members[0].token,expected:401});
  await Promise.all(tables.map(roll));
  if (process.env.MANAGER_TEST_RESTART === '1') {
    require('node:child_process').execFileSync('systemctl', ['restart','manager-online.service']);
    for (let attempt=0; attempt<15; attempt++) {
      try { if ((await fetch(base+'/health',{signal:AbortSignal.timeout(3000)})).ok) break; } catch {}
      await sleep(500);
    }
  } else await sleep(2200);
  const resumed=await Promise.all(tables.map(t=>api(t.path,{token:t.members[1].token})));
  assert(resumed.every((x,i)=>x.room.code===tables[i].game.code&&x.room.game.rolls===1));
  timings.sort((a,b)=>a-b);
  console.log(JSON.stringify({https:base.startsWith('https://'),rooms:[2,4,6],requests:timings.length,
    p95ms:Math.round(timings[Math.ceil(timings.length*.95)-1]),errors,accessIsolation:true,replay:true,reconnect:true,restarted:process.env.MANAGER_TEST_RESTART === '1'}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
