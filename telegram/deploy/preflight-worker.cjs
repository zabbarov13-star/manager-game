'use strict';
// Runs only inside the mount/network sandbox. Never accepts a source DB path.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite'),{once}=require('node:events'),assert=require('node:assert/strict');
const phases=new Set(['ready','purchase','auction','event','debt','end','trade','over']);
const serverMessages=new Map([
 ['Ключ запроса уже использован.','IDEMPOTENCY_KEY_CONFLICT'],
 ['Партия обновилась. Повторите действие.','STALE_GAME_REVISION'],
 ['Сейчас действие другого игрока.','NOT_YOUR_TURN'],
 ['Нет идентификатора действия.','INVALID_REQUEST_ID'],
 ['Некорректный ключ запроса.','INVALID_IDEMPOTENCY_KEY'],
 ['Комната не найдена.','ROOM_NOT_FOUND'],
 ['Срок комнаты истёк.','ROOM_EXPIRED'],
 ['Нужен сохранённый ключ участника.','INVALID_SEAT_CREDENTIAL'],
 ['Слишком много запросов. Повторите позже.','RATE_LIMITED'],
 ['Проверка образа временно недоступна. Повторите запрос.','VERIFIER_UNAVAILABLE'],
 ['Недостаточно денег. Можно заложить имущество или отказаться от покупки.','INSUFFICIENT_FUNDS'],
 ['Недостаточно денег. Можно заложить имущество или выбрать аукцион.','INSUFFICIENT_FUNDS'],
 ['Сервер временно не создаёт комнаты.','INSUFFICIENT_DISK'],
]);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function fixtureError(code){const error=new Error(code);error.name='FixtureProtocolError';return error;}
function annotate(error,context){
 // Keep the SAME exception, including original message, stack and cause.
 if(error&&typeof error==='object')try{Object.defineProperty(error,'diagnostic',{value:structuredClone(context),configurable:true});}catch{}
 return error;
}
function safeMessage(error){
 const message=typeof error?.message==='string'?error.message:'';
 if(serverMessages.has(message)||['HTTP_STATUS_MISMATCH','FIXTURE_INVALID_GAME_REVISION','FIXTURE_ACTOR_UNKNOWN','FIXTURE_INITIAL_PHASE_NOT_READY','FIXTURE_REPLAY_INPUT_CHANGED','UNSUPPORTED_FIXTURE_PHASE','fetch failed'].includes(message))return message;
 if(error?.name==='AssertionError')return 'ASSERTION_MISMATCH';
 return '[REDACTED_UNRECOGNIZED_MESSAGE]';
}
function safeException(error,seen=new Set(),depth=0){
 if(!error||typeof error!=='object'||seen.has(error)||depth>4)return {name:'Error',message:'[REDACTED_OR_CIRCULAR_CAUSE]'};
 seen.add(error);const name=['Error','TypeError','SyntaxError','AssertionError','HTTPStatusError','FixtureProtocolError'].includes(error.name)?error.name:'Error',message=safeMessage(error),frames=[];
 // Never include assertion diffs, source snippets, paths or arbitrary function names.
 for(const line of String(error.stack??'').split('\n')){const m=line.match(/(?:[\\/])(preflight-worker\.cjs|worker\.cjs|server\.cjs|engine\.cjs|room-extension\.cjs):(\d+):(\d+)\)?$/);if(m)frames.push({file:m[1],line:Number(m[2]),column:Number(m[3])});if(frames.length===8)break;}
 const out={name,message,stack:[name+': '+message,...frames.map(f=>`    at ${f.file}:${f.line}:${f.column}`)].join('\n'),location:frames[0]??null};
 if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOENT','EACCES','SQLITE_BUSY','SQLITE_ERROR','SQLITE_CORRUPT'].includes(error.code))out.code=error.code;
 if(error.cause!==undefined)out.cause=safeException(error.cause,seen,depth+1);
 return out;
}
const stages=new Set(['LOAD_OR_BASE_SCHEMA','PREVIOUS_STARTUP','CANDIDATE_STARTUP','HISTORICAL_GET_COMPARISON','FIXTURE_SETUP','FIXTURE_UPGRADE_REPLAY','FIXTURE_CANDIDATE_NEXT_ACTION','FIXTURE_ROLLBACK_REPLAY','RESTORED_INTEGRITY','CLEANUP']);
const operations=new Set(['LOAD_CODE','START_PREVIOUS','START_CANDIDATE','COMPARE_HISTORICAL_COPIES','CREATE_FIXTURE','JOIN_FIXTURE','READY_FIXTURE','START_FIXTURE','FIRST_ROLL','REPLAY_ORIGINAL_ROLL','CHECK_REPLAY_BODY','READ_AFTER_REPLAY','CHECK_REPLAY_STATE','SELECT_NEXT_ACTION','APPLY_NEXT_ACTION','CHECK_NEXT_REVISION','REPLAY_CANDIDATE_ACTION','CHECK_ROLLBACK_BODY','READ_AFTER_ROLLBACK','CHECK_ROLLBACK_STATE','CHECK_SQLITE_INTEGRITY','CLOSE_SERVER']);
const actions=new Set(['roll','decline','endTurn','confirmCard','auctionStep','payDebt','bankrupt']);
function safeFailure(error){
 const c=error?.diagnostic??{},out={status:'FAIL',reason:'ISOLATED_COMPATIBILITY_FAILED',stage:stages.has(c.stage)?c.stage:'ISOLATION_OR_LOAD_OR_BASE_SCHEMA',operation:operations.has(c.operation)?c.operation:'UNKNOWN',error:safeException(error)};
 if(c.http){const h=c.http,request={},response={},r=h.response??{};
  for(const k of ['requestIdValid','idempotencyKeyValid'])if(typeof h.request?.[k]==='boolean')request[k]=h.request[k];if(actions.has(h.request?.action))request.action=h.request.action;
  if(Number.isSafeInteger(h.request?.fixtureGameRevision)&&h.request.fixtureGameRevision>=0)request.fixtureGameRevision=h.request.fixtureGameRevision;
  for(const k of ['jsonParsed','hasRoom','hasError'])if(typeof r[k]==='boolean')response[k]=r[k];if(Number.isSafeInteger(r.bytes)&&r.bytes>=0)response.bytes=r.bytes;
  for(const k of ['fixtureReplyGameRevision','fixtureReplyRolls'])if(Number.isSafeInteger(r[k])&&r[k]>=0)response[k]=r[k];if(phases.has(r.fixtureReplyPhase))response.fixtureReplyPhase=r.fixtureReplyPhase;
  response.contentType=['application/json','text/plain','text/html'].includes(r.contentType)?r.contentType:'other';response.serverErrorCode=[...serverMessages.values()].includes(r.serverErrorCode)?r.serverErrorCode:r.hasError?'REDACTED_UNKNOWN_SERVER_ERROR':null;
  if(serverMessages.has(r.serverMessage))response.serverMessage=r.serverMessage;
  out.http={method:['GET','POST'].includes(h.method)?h.method:'other',endpoint:['/health','/api/rooms','/api/rooms/<room>','/api/rooms/<room>/action','/api/rooms/<room>/join','/api/rooms/<room>/ready','/api/rooms/<room>/start'].includes(h.endpoint)?h.endpoint:'[redacted]',expectedStatus:Number.isInteger(h.expectedStatus)&&h.expectedStatus>=100&&h.expectedStatus<=599?h.expectedStatus:null,actualStatus:Number.isInteger(h.actualStatus)&&h.actualStatus>=100&&h.actualStatus<=599?h.actualStatus:null,request,response};
 }
 if(c.fixture){out.fixture={};for(const k of ['requestBodyUnchanged','requestIdReused','idempotencyKeyReused','actorCredentialReused','revisionIntentionallyReplayed','requestIdFresh','idempotencyKeyFresh','revisionFromLatestRead'])if(typeof c.fixture[k]==='boolean')out.fixture[k]=c.fixture[k];if(phases.has(c.fixture.phase))out.fixture.phase=c.fixture.phase;if(['host','guest'].includes(c.fixture.actorRole))out.fixture.actorRole=c.fixture.actorRole;}
 if(error?.cleanupError)out.cleanupError=safeException(error.cleanupError);return out;
}
function createClient(getBase,getContext,fetcher=fetch){return async function call(route,body,token,status=200,key=crypto.randomUUID()){
 const context=getContext(),method=body===undefined?'GET':'POST';
 context.http={method,endpoint:route==='/health'?'/health':'/api/rooms'+(route?'/<room>'+ (route.endsWith('/action')?'/action':route.endsWith('/join')?'/join':route.endsWith('/ready')?'/ready':route.endsWith('/start')?'/start':''):''),expectedStatus:status,actualStatus:null,
  request:{...(body?.method?{action:body.method}:{}),...(Number.isSafeInteger(body?.gameRevision)?{fixtureGameRevision:body.gameRevision}:{}),...(body?.requestId?{requestIdValid:uuid(body.requestId)}:{}),...(method==='POST'?{idempotencyKeyValid:uuid(key)}:{})}};
 try{const response=await fetcher(getBase()+(route==='/health'?route:'/api/rooms'+route),{method,headers:{'Content-Type':'application/json',...(method==='POST'?{'Idempotency-Key':key}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  context.http.actualStatus=response.status;const bytes=Buffer.from(await response.arrayBuffer()),type=response.headers.get('content-type')?.split(';')[0]?.trim();let value,parseError;
  try{value=JSON.parse(bytes.toString('utf8'));}catch(error){parseError=error;}
  const serverError=typeof value?.error==='string'?value.error:null;
  context.http.response={contentType:['application/json','text/plain','text/html'].includes(type)?type:'other',bytes:bytes.length,jsonParsed:!parseError,hasRoom:!!value?.room,hasError:serverError!==null,serverErrorCode:serverMessages.get(serverError)??(serverError?'REDACTED_UNKNOWN_SERVER_ERROR':null),...(serverMessages.has(serverError)?{serverMessage:serverError}:{})};
  if(Number.isSafeInteger(value?.room?.gameRevision))context.http.response.fixtureReplyGameRevision=value.room.gameRevision;if(phases.has(value?.room?.game?.phase))context.http.response.fixtureReplyPhase=value.room.game.phase;if(Number.isSafeInteger(value?.room?.game?.rolls))context.http.response.fixtureReplyRolls=value.room.game.rolls;
  if(response.status!==status){const error=new Error('HTTP_STATUS_MISMATCH',{cause:parseError??(serverError?new Error(serverError):undefined)});error.name='HTTPStatusError';throw error;}
  if(parseError)throw parseError;
  return value;
 }catch(error){throw annotate(error,context);}
};}
function nextFixtureAction(room,host,guest){
 const game=room.game,phase=game?.phase;if(!Number.isSafeInteger(room.gameRevision)||room.gameRevision<0)throw fixtureError('FIXTURE_INVALID_GAME_REVISION');
 const actorId=phase==='auction'?game.auction?.current:phase==='debt'?game.debt?.payerId:phase==='trade'?game.trade?.toId:game?.players?.[game.current]?.id;
 const actor=actorId===host.seatId?host:actorId===guest.seatId?guest:null;if(!actor)throw fixtureError('FIXTURE_ACTOR_UNKNOWN');
 // Decline is legal even when a random property costs more than the initial balance.
 let method={purchase:'decline',end:'endTurn',event:'confirmCard',ready:'roll',auction:'auctionStep'}[phase];
 if(phase==='debt'){const payer=game.players.find(p=>p.id===actorId);if(payer.balance>=game.debt.amount)method='payDebt';else if(!Object.values(game.properties).some(p=>p.owner===actorId))method='bankrupt';}
 if(!method)throw fixtureError('UNSUPPORTED_FIXTURE_PHASE');
 return {actor,method,phase,actorRole:actor===host?'host':'guest'};
}
function fingerprint(file){const db=new DatabaseSync(file,{readOnly:true}),out={};try{for(const table of ['online_rooms','replay']){const h=crypto.createHash('sha256');for(const row of db.prepare('SELECT * FROM '+table+' ORDER BY '+(table==='replay'?'id':'code')).iterate())h.update(JSON.stringify(row)+'\n');out[table]=h.digest('hex');}return out;}finally{db.close();}}
async function historicalComparison(root,oldFactory,newFactory,extension){
 const source=path.join(root,'restored.sqlite'),files=['historical-old.sqlite','historical-new.sqlite'].map(f=>path.join(root,f)),token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex'),now=Date.now(),originalNow=Date.now,servers=[];let codes;
 try{
  for(const file of files){fs.copyFileSync(source,file,fs.constants.COPYFILE_EXCL);const db=new DatabaseSync(file);try{const rows=db.prepare('SELECT code,data FROM online_rooms ORDER BY code').all();codes=rows.map(r=>r.code);for(const row of rows){const r=JSON.parse(row.data);assert(/^[A-Z2-9]{6}$/.test(row.code));r.createdAt=now;for(const seat of r.seats)seat.lastSeen=now;if(r.seats[0])r.seats[0].hash=hash;if(r.clock)for(const key of ['deadline','decisionDeadline','auctionEnd'])r.clock[key]=now+3600000;db.prepare('UPDATE online_rooms SET data=?,updated_at=? WHERE code=?').run(JSON.stringify(r),now,row.code);}}finally{db.close();}}
  Date.now=()=>now;for(let i=0;i<2;i++){const s=(i?newFactory:oldFactory)({database:files[i],...(i?{extension}:{})});servers.push(s);s.listen(0,'127.0.0.1');await once(s,'listening');}
  let closed=0;for(const code of codes){const replies=[];for(const s of servers){const response=await fetch('http://127.0.0.1:'+s.address().port+'/api/rooms/'+code,{headers:{Authorization:'Bearer '+token}});replies.push({status:response.status,data:await response.json()});}assert.equal(replies[0].status,replies[1].status);assert([200,410].includes(replies[0].status));if(replies[0].status===200){assert.deepEqual(replies[0].data.room.game,replies[1].data.room.game);assert.equal(replies[0].data.room.gameRevision,replies[1].data.room.gameRevision);assert.deepEqual(replies[0].data.room.seats.map(s=>({id:s.id,character:s.character,color:s.color})),replies[1].data.room.seats.map(s=>({id:s.id,character:s.character,color:s.color})));}else closed++;await new Promise(r=>setTimeout(r,10));}
  return {status:'PASS',rooms:codes.length,closed,syntheticCredentialsAndRefreshedClockMetadata:true,scope:'Historical game/economy JSON compared via real GET handlers on two private copies. Real player tokens not used.'};
 }finally{Date.now=originalNow;for(const s of servers)if(s.listening)await new Promise(r=>s.close(r));}
}
async function probe(root,{fetcher=fetch}={}){
 const context={stage:'LOAD_OR_BASE_SCHEMA',operation:'LOAD_CODE'},result={historicalRowsRetained:false,previousStartup:false,candidateStartup:false,fixtureUpgradeReplay:false,fixtureRollbackReplay:false,integrity:false};
 const database=path.join(root,'restored.sqlite');let server,base,primaryError;
 const step=(stage,operation,fixture)=>{context.stage=stage;context.operation=operation;delete context.http;if(fixture)context.fixture=fixture;};
 const call=createClient(()=>base,()=>context,fetcher);
 const close=async()=>{if(server?.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));};
 try{
  const before=fingerprint(database),old=require(path.join(root,'previous/online/server.cjs')).createRoomServer,newServer=require(path.join(root,'candidate/online/server.cjs')).createRoomServer;
  const extension=require(path.join(root,'candidate/telegram/shared/room-extension.cjs')).createExtension({handleRooms:require(path.join(root,'candidate/telegram/shared/dist/engine.cjs')).handleRooms,verifyBatch:async checks=>checks.map(()=>false)});
  const open=async candidate=>{server=(candidate?newServer:old)({database,...(candidate?{extension}:{})});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;await call('/health');};
  step('PREVIOUS_STARTUP','START_PREVIOUS');await open(false);result.previousStartup=true;await close();assert.deepEqual(fingerprint(database),before);
  step('CANDIDATE_STARTUP','START_CANDIDATE');await open(true);result.candidateStartup=true;await close();assert.deepEqual(fingerprint(database),before);result.historicalRowsRetained=true;
  step('HISTORICAL_GET_COMPARISON','COMPARE_HISTORICAL_COPIES');result.historicalComparison=await historicalComparison(root,old,newServer,extension);
  step('FIXTURE_SETUP','START_PREVIOUS');await open(false);
  const engine=require(path.join(root,'previous/online/dist/engine.cjs')),characters=engine.CHARACTERS,colors=engine.COLORS;
  step('FIXTURE_SETUP','CREATE_FIXTURE');const host=await call('',{name:'DIAGNOSTIC FIXTURE HOST',character:characters[0].id,color:colors[0].id,mode:'code',rulesProfile:'original',capacity:2},null,201),route='/'+host.room.code;
  step('FIXTURE_SETUP','JOIN_FIXTURE');const guest=await call(route+'/join',{name:'DIAGNOSTIC FIXTURE GUEST',character:characters[1].id,color:colors[1].id});
  step('FIXTURE_SETUP','READY_FIXTURE');await call(route+'/ready',{ready:true},guest.token);
  step('FIXTURE_SETUP','START_FIXTURE');const start=await call(route+'/start',{},host.token),initial=nextFixtureAction(start.room,host,guest);
  if(initial.method!=='roll')throw fixtureError('FIXTURE_INITIAL_PHASE_NOT_READY');
  const actor=initial.actor,key=crypto.randomUUID(),command={method:'roll',args:[],requestId:crypto.randomUUID(),gameRevision:start.room.gameRevision},wire=JSON.stringify(command),originalInput={wire,key,requestId:command.requestId,credential:actor.token};
  step('FIXTURE_SETUP','FIRST_ROLL',{phase:initial.phase,actorRole:initial.actorRole});const rolled=await call(route+'/action',command,actor.token,200,key);
  assert.equal(rolled.room.game.rolls,1);assert.equal(rolled.room.gameRevision,start.room.gameRevision+1);await close();
  step('FIXTURE_UPGRADE_REPLAY','START_CANDIDATE');await open(true);
  const same={requestBodyUnchanged:JSON.stringify(command)===originalInput.wire,requestIdReused:command.requestId===originalInput.requestId,idempotencyKeyReused:key===originalInput.key,actorCredentialReused:actor.token===originalInput.credential};
  step('FIXTURE_UPGRADE_REPLAY','REPLAY_ORIGINAL_ROLL',{...same,revisionIntentionallyReplayed:true});
  if(!Object.values(same).every(Boolean))throw fixtureError('FIXTURE_REPLAY_INPUT_CHANGED');const replayed=await call(route+'/action',command,actor.token,200,key);
  context.operation='CHECK_REPLAY_BODY';assert.deepEqual(replayed,rolled);
  step('FIXTURE_UPGRADE_REPLAY','READ_AFTER_REPLAY');const current=await call(route,undefined,guest.token);
  context.operation='CHECK_REPLAY_STATE';assert.deepEqual(current.room.game,rolled.room.game);assert.equal(current.room.gameRevision,rolled.room.gameRevision);result.fixtureUpgradeReplay=true;
  step('FIXTURE_CANDIDATE_NEXT_ACTION','SELECT_NEXT_ACTION',{phase:phases.has(current.room.game.phase)?current.room.game.phase:'unknown'});
  const selected=nextFixtureAction(current.room,host,guest),nextKey=crypto.randomUUID(),next={method:selected.method,args:[],requestId:crypto.randomUUID(),gameRevision:current.room.gameRevision};
  assert.notEqual(nextKey,key);assert.notEqual(next.requestId,command.requestId);
  step('FIXTURE_CANDIDATE_NEXT_ACTION','APPLY_NEXT_ACTION',{phase:selected.phase,actorRole:selected.actorRole,requestIdFresh:true,idempotencyKeyFresh:true,revisionFromLatestRead:true});
  const advanced=await call(route+'/action',next,selected.actor.token,200,nextKey);context.operation='CHECK_NEXT_REVISION';assert.equal(advanced.room.gameRevision,current.room.gameRevision+1);await close();
  step('FIXTURE_ROLLBACK_REPLAY','START_PREVIOUS');await open(false);
  step('FIXTURE_ROLLBACK_REPLAY','REPLAY_CANDIDATE_ACTION',{requestIdReused:true,idempotencyKeyReused:true,actorCredentialReused:true,revisionIntentionallyReplayed:true});
  const rollbackReply=await call(route+'/action',next,selected.actor.token,200,nextKey);context.operation='CHECK_ROLLBACK_BODY';assert.deepEqual(rollbackReply,advanced);
  step('FIXTURE_ROLLBACK_REPLAY','READ_AFTER_ROLLBACK');const restored=await call(route,undefined,host.token);context.operation='CHECK_ROLLBACK_STATE';assert.deepEqual(restored.room.game,advanced.room.game);assert.equal(restored.room.gameRevision,advanced.room.gameRevision);result.fixtureRollbackReplay=true;await close();
  step('RESTORED_INTEGRITY','CHECK_SQLITE_INTEGRITY');const db=new DatabaseSync(database,{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');result.integrity=true;}finally{db.close();}
  result.fixtureProtocol={sameWireBodyAndCredentialsOnReplay:true,reusedRequestIdAndIdempotencyKey:true,newCommandUsesFreshIdsAndLatestRevision:true,actorFromCurrentPhase:true,nextActionPhase:selected.phase,nextAction:selected.method};
  return result;
 }catch(error){primaryError=error;throw annotate(error,context);}finally{
  try{await close();}catch(error){if(primaryError)try{Object.defineProperty(primaryError,'cleanupError',{value:error});}catch{}else throw annotate(error,{stage:'CLEANUP',operation:'CLOSE_SERVER'});}
 }
}
if(require.main===module){let isolationVerified=false;Promise.resolve().then(()=>{assert.equal(process.getuid(),65534);assert(!fs.existsSync('/root')&&!fs.existsSync('/var/lib/manager-online')&&!fs.existsSync('/opt/manager-online'));assert(Object.values(require('node:os').networkInterfaces()).flat().every(a=>a.internal));assert(!process.env.TELEGRAM_BOT_TOKEN&&!process.env.COSMETIC_RPC_SECRET);isolationVerified=true;return probe('/audit');}).then(result=>fs.writeFileSync('/audit/compatibility.json',JSON.stringify({status:'PASS',isolationVerified:true,...result,scope:'Actual copied server and candidate startup, historical GET comparison with synthetic credentials/clock metadata on copies, synthetic gameplay/replay. No real player commands or credentials used.'}),{mode:0o600})).catch(error=>{fs.writeFileSync('/audit/compatibility.json',JSON.stringify({isolationVerified,...safeFailure(error)}),{mode:0o600});process.exitCode=1;});}
module.exports={probe,fingerprint,historicalComparison,annotate,safeException,safeFailure,createClient,nextFixtureAction};
