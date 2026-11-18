'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),{DatabaseSync}=require('node:sqlite');
const {annotate,safeException,safeFailure,createClient,nextFixtureAction,probe}=require('../deploy/preflight-worker.cjs'),{legacyServerFactory}=require('./legacy-fixture.cjs');
const privateText='DO_NOT_REPORT: password=example-private-token, Player Private Person, database-row-secret';
const context=()=>({stage:'FIXTURE_UPGRADE_REPLAY',operation:'REPLAY_ORIGINAL_ROLL'});
test('original exception identity, message, stack and cause survive annotation; report drops private text/diffs',async()=>{
 const cause=new Error(privateText),original=new Error(privateText,{cause});original.stack=`Error: ${privateText}\n    at sensitiveFunction (/home/Private Person/secret/preflight-worker.cjs:23:7)`;const message=original.message,stack=original.stack,c=context();
 const call=createClient(()=> 'http://fixture.test',()=>c,async()=>{throw original;});let caught;try{await call('/ABCDEF/action',{method:'roll',gameRevision:1,requestId:require('node:crypto').randomUUID()},'private-seat-token');}catch(e){caught=e;}
 assert.strictEqual(caught,original);assert.equal(caught.message,message);assert.equal(caught.stack,stack);assert.strictEqual(caught.cause,cause);
 const report=safeFailure(caught),json=JSON.stringify(report);for(const text of [privateText,'Private Person','example-private-token','database-row-secret','private-seat-token','sensitiveFunction','ABCDEF'])assert(!json.includes(text));assert.equal(report.error.location.file,'preflight-worker.cjs');assert.equal(report.error.location.line,23);assert(report.error.cause);
 let mismatch;try{assert.deepEqual({row:privateText},{row:'another private row'});}catch(e){mismatch=e;}assert(!JSON.stringify(safeException(mismatch)).includes(privateText));assert.equal(safeException(mismatch).message,'ASSERTION_MISMATCH');
});
test('HTTP mismatch reports expected/actual status, known server cause and callsite without response body/credentials',async()=>{
 const c=context(),token='do-not-log-seat',key=require('node:crypto').randomUUID(),requestId=require('node:crypto').randomUUID();const call=createClient(()=> 'http://fixture.test',()=>c,async()=>new Response(JSON.stringify({error:'Ключ запроса уже использован.',token,player:privateText,room:{game:{secret:privateText}}}),{status:409,headers:{'Content-Type':'application/json'}}));
 let error;try{await call('/ABCDEF/action',{method:'roll',gameRevision:1,requestId},token,200,key);}catch(e){error=e;}const report=safeFailure(error);
 assert.equal(error.message,'HTTP_STATUS_MISMATCH');assert.equal(error.cause.message,'Ключ запроса уже использован.');assert.equal(report.http.expectedStatus,200);assert.equal(report.http.actualStatus,409);assert.equal(report.http.response.serverErrorCode,'IDEMPOTENCY_KEY_CONFLICT');assert.equal(report.error.cause.message,'Ключ запроса уже использован.');assert(report.error.location);const raw=JSON.stringify(report);for(const s of [token,key,requestId,'ABCDEF',privateText])assert(!raw.includes(s));
});
test('unknown server errors and invalid JSON retain original cause only in memory',async()=>{
 const c=context(),call=createClient(()=> 'http://fixture.test',()=>c,async()=>new Response(JSON.stringify({error:privateText}),{status:500,headers:{'Content-Type':'application/json'}}));let error;try{await call('/ABCDEF/action',{},'token');}catch(e){error=e;}assert.equal(error.cause.message,privateText);assert(!JSON.stringify(safeFailure(error)).includes(privateText));
 const bad=createClient(()=> 'http://fixture.test',context,async()=>new Response(privateText,{status:200,headers:{'Content-Type':'text/plain'}}));await assert.rejects(bad('/ABCDEF/action',{},'token'),e=>e instanceof SyntaxError&&!JSON.stringify(safeFailure(e)).includes(privateText));
});
test('fixture uses real ready phase, avoids unaffordable purchase and selects auction/debt actor, not stale current',()=>{
 const host={seatId:'p0'},guest={seatId:'p1'},game={phase:'ready',current:0,players:[{id:'p0',balance:100},{id:'p1',balance:100}],properties:{},debt:{payerId:'p1',amount:50},auction:{current:'p1'}},room={game,gameRevision:3};
 assert.equal(nextFixtureAction(room,host,guest).method,'roll');game.phase='purchase';assert.equal(nextFixtureAction(room,host,guest).method,'decline');game.phase='auction';assert.strictEqual(nextFixtureAction(room,host,guest).actor,guest);assert.equal(nextFixtureAction(room,host,guest).method,'auctionStep');game.phase='debt';assert.strictEqual(nextFixtureAction(room,host,guest).actor,guest);assert.equal(nextFixtureAction(room,host,guest).method,'payDebt');game.phase='roll';assert.throws(()=>nextFixtureAction(room,host,guest),/UNSUPPORTED_FIXTURE_PHASE/);
});
function auditRoot(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manager-preflight-error-')),legacy=path.join(dir,'previous/online/dist');legacyServerFactory(legacy);fs.copyFileSync(path.join(__dirname,'fixtures/legacy-room-server.cjs.txt'),path.join(dir,'previous/online/server.cjs'));
 for(const f of ['online/server.cjs','telegram/shared/room-extension.cjs','telegram/shared/verification.cjs','telegram/shared/dist/engine.cjs']){const target=path.join(dir,'candidate',f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.resolve(__dirname,'../..',f),target);}
 const db=new DatabaseSync(path.join(dir,'restored.sqlite'));db.exec('CREATE TABLE online_rooms(code TEXT PRIMARY KEY,revision INTEGER,data TEXT,updated_at INTEGER);CREATE TABLE replay(id TEXT PRIMARY KEY,signature TEXT,status INTEGER,sealed TEXT,expires INTEGER)');db.close();return dir;
}
function exchangeDoubles(fetcher){return async(url,options)=>{if(options?.method!=='POST'||!String(url).endsWith('/action')||JSON.parse(options.body).method!=='roll')return fetcher(url,options);
 const object=globalThis.crypto,descriptor=Object.getOwnPropertyDescriptor(object,'getRandomValues');Object.defineProperty(object,'getRandomValues',{configurable:true,value:a=>{a.fill(4);return a;}});try{return await fetcher(url,options);}finally{if(descriptor)Object.defineProperty(object,'getRandomValues',descriptor);else delete object.getRandomValues;}
};}
test('reproduces old FIXTURE_UPGRADE_REPLAY failure after 5+5 exchange -> ready; fixed probe passes upgrade and rollback',async()=>{
 const oldFile=path.join(os.tmpdir(),'old-preflight-worker.cjs'),oldModule=new Module(oldFile,module);oldModule.filename=oldFile;oldModule._compile(fs.readFileSync(path.join(__dirname,'fixtures/preflight-worker-before-errors.cjs.txt'),'utf8'),oldFile);
 const fetcher=globalThis.fetch;globalThis.fetch=exchangeDoubles(fetcher);try{await assert.rejects(oldModule.exports.probe(auditRoot()),e=>e.message==='ISOLATED_COMPATIBILITY_FAILED'&&e.stage==='FIXTURE_UPGRADE_REPLAY'&&e.cause===undefined);}finally{globalThis.fetch=fetcher;}
 const result=await probe(auditRoot(),{fetcher:exchangeDoubles(fetcher)});assert(result.fixtureUpgradeReplay&&result.fixtureRollbackReplay);assert.equal(result.fixtureProtocol.nextActionPhase,'ready');assert.equal(result.fixtureProtocol.nextAction,'roll');
});
test('isolated negative upgrade replay keeps HTTP 409 evidence and error cause; never retries/masks failure',async()=>{
 const fetcher=fetch;let rejected=false;const root=auditRoot();
 const inject=async(url,options)=>{if(options?.method==='POST'&&String(url).endsWith('/action')){const command=JSON.parse(options.body);if(!rejected&&command.method==='roll'){const response=await fetcher(url,options);rejected=true;return response;}if(rejected&&command.method==='roll')return new Response(JSON.stringify({error:'Ключ запроса уже использован.',private:privateText}),{status:409,headers:{'Content-Type':'application/json'}});}return fetcher(url,options);};
 let error;try{await probe(root,{fetcher:inject});}catch(e){error=e;}assert(error);assert.equal(error.diagnostic.stage,'FIXTURE_UPGRADE_REPLAY');assert.equal(error.diagnostic.operation,'REPLAY_ORIGINAL_ROLL');assert.equal(error.cause.message,'Ключ запроса уже использован.');const report=safeFailure(error);assert.equal(report.http.expectedStatus,200);assert.equal(report.http.actualStatus,409);assert(!JSON.stringify(report).includes(privateText));
});
