'use strict';
// Invoked by the trusted launcher with read-only inherited source descriptors.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{DatabaseSync,backup}=require('node:sqlite');
const {assertOuterIsolation}=require('./preflight.cjs');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const host=JSON.parse(fs.readFileSync('/control/inventory.json')),kind=host.copyKind;
 assertOuterIsolation(host);assert(['rooms','telegram'].includes(kind));
 // Test the actual inherited descriptors, not only mount flags.
 for(const fd of [3,4,5]){assert.throws(()=>fs.writeSync(fd,Buffer.from('DENIED'),0,6,0));assert.throws(()=>fs.openSync('/proc/self/fd/'+fd,'r+'));}
 const captured=cp.spawnSync('/usr/bin/python3',['/bundle/preflight-capture.py','/production/db/rooms.sqlite','/audit/captured','--inherited'],{stdio:['ignore','pipe','pipe',3,4,5],encoding:'utf8',timeout:3000});
 for(const fd of [3,4,5])fs.closeSync(fd);
 assert.equal(captured.status,0,'READ_ONLY_CAPTURE_UNAVAILABLE');const capture=JSON.parse(captured.stdout);
 const source='/audit/captured/rooms.sqlite',saved='/audit/backup.sqlite',restored='/audit/restored.sqlite';
 const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,saved);}finally{db.close();}
 const index=fs.readFileSync(source+'-shm'),read=require('node:os').endianness()==='LE'?'readUInt32LE':'readUInt32BE';assert.equal(index[read](16),capture.expectedWalFrames);
 fs.chmodSync(saved,0o600);fs.copyFileSync(saved,restored,fs.constants.COPYFILE_EXCL);fs.chmodSync(restored,0o600);assert.equal(hash(saved),hash(restored));
 const copy=new DatabaseSync(restored,{readOnly:true});let tables;try{assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(copy.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(copy.prepare('PRAGMA page_count').get().page_count,capture.expectedPageCount);tables=copy.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r=>r.name);assert((kind==='rooms'?['online_rooms','replay']:['profiles','grants','orders','updates']).every(t=>tables.includes(t)));}finally{copy.close();}
 if(kind==='rooms'){
  const manifest=JSON.parse(fs.readFileSync('/bundle/shared-release.json'));const {extractArchive}=require('./preflight-archive.cjs');
  for(const k of ['rooms','adapter'])extractArchive('/bundle/candidate-'+k+'.tar',manifest,k,'/audit/'+(k==='rooms'?'candidate':'adapter'));
  for(const file of ['online/server.cjs','online/dist/engine.cjs']){const to=path.join('/audit/previous',file);fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});fs.copyFileSync(path.join('/production/code',file),to,fs.constants.COPYFILE_EXCL);}
 }else for(const file of ['store.cjs','catalog.cjs','entitlements.cjs']){const to='/audit/previous-adapter/telegram/'+file;fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});fs.copyFileSync('/production/adapter/telegram/'+file,to,fs.constants.COPYFILE_EXCL);}
 return{status:'PASS',kind,capture,backupSha256:hash(saved),restoreSha256:hash(restored),integrity:true,foreignKeys:true,schema:true};
}
if(require.main===module)main().then(r=>fs.writeFileSync('/audit/copy.json',JSON.stringify(r),{mode:0o600})).catch(()=>{fs.writeFileSync('/audit/copy.json',JSON.stringify({status:'FAIL',reason:'ISOLATED_COPY_OR_RESTORE_FAILED'}),{mode:0o600});process.exitCode=2;});
module.exports={main};
