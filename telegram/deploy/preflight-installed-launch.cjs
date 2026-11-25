'use strict';
// Trusted host bootstrap for an EXISTING installation. No SQL or candidate imports.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {inventory}=require('./preflight-host.cjs'),{outerArgs}=require('./preflight-launch.cjs'),{sandboxArgs}=require('./preflight-isolation.cjs'),{allowed}=require('./preflight-archive.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function read(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NOATIME);try{return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
function command(bin,args){const r=cp.spawnSync(bin,args,{encoding:'utf8',timeout:10000,maxBuffer:8*1024**2});assert.equal(r.status,0,'HOST_COMMAND_FAILED');return r.stdout;}
function tree(root,kind){const h=crypto.createHash('sha256');function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){const file=path.join(dir,e.name);assert(!e.isSymbolicLink());if(e.isDirectory())visit(file);else{const name=path.relative(root,file).split(path.sep).join('/');assert(e.isFile()&&allowed(name,kind),'UNEXPECTED_INSTALLED_FILE');h.update(name+'\0'+sha(read(file))+'\n');}}}visit(root);return h.digest('hex');}
async function state(plan){
 const host=await inventory();assert(host.databaseConfirmed&&host.commandMatches&&host.cwdMatches&&host.executableMatches);assert.equal(host.expected.database,plan.databases.rooms);assert(host.resources.databaseDiskFreeBytes>1024**3&&host.resources.memAvailableKiB>512*1024,'INSUFFICIENT_RESOURCES');
 const units={};for(const unit of Object.keys(plan.unitSha256)){assert.equal(sha(Buffer.from(command('/usr/bin/systemctl',['cat',unit]))),plan.unitSha256[unit],'UNIT_DRIFT');const props=Object.fromEntries(command('/usr/bin/systemctl',['show',unit,'--property=MainPID,ActiveState,SubState']).trim().split('\n').map(l=>l.split('=')));assert.equal(props.ActiveState,'active');assert.equal(props.SubState,'running');units[unit]=props;}
 for(const [file,digest] of Object.entries(plan.configSha256))assert.equal(sha(read(file)),digest,'CONFIG_DRIFT');
 for(const [kind,pin] of Object.entries(plan.installed)){assert.equal(fs.realpathSync('/opt/manager-'+(kind==='rooms'?'online':'telegram')+'/current'),pin.target);assert.equal(tree(pin.target,kind),pin.treeSha256,'CODE_DRIFT');}
 for(const unit of ['manager-telegram.service','manager-telegram-poller.service']){const env=Object.fromEntries(read('/proc/'+units[unit].MainPID+'/environ').toString().split('\0').map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));assert.equal(env.STARS_ENABLED,'0');assert.equal(env.ADS_VERIFIED_GATEWAY_ENABLED,'0');assert.equal(env.TELEGRAM_ENV,'production');assert.equal(env.TELEGRAM_DATABASE,plan.databases.telegram);}
 const response=await fetch('http://127.0.0.1:8443/health',{signal:AbortSignal.timeout(5000)});const health=await response.json();assert(response.ok&&health.ok&&health.mode==='adapter'&&!health.roomsEnabled&&!health.starsConfigured&&!health.adsConfigured);
 const telegramInodes=['','-wal','-shm'].map(s=>{const st=fs.lstatSync(plan.databases.telegram+s);assert(st.isFile()&&!st.isSymbolicLink());return{dev:st.dev,ino:st.ino};});
 return{host,units,telegramInodes,adapter:plan.installed.adapter.target};
}
const archiveCandidates=manifest=>manifest.runtimes.map(r=>({kind:r.kind,commit:manifest.commit,sha256:r.sha256}));
async function launch(bundle,planFile){
 assert.equal(process.platform,'linux');assert.equal(process.getuid(),0);process.umask(0o077);bundle=fs.realpathSync(bundle);
 const plan=JSON.parse(read(planFile));assert(/^[a-f0-9]{40}$/.test(plan.candidateCommit));assert.equal(plan.databases.telegram,'/var/lib/manager-telegram/telegram.sqlite');
 const st=fs.lstatSync('/root/manager-preflight');assert(st.uid===0&&!(st.mode&0o077)&&!st.isSymbolicLink());
 for(const name of fs.readdirSync(bundle)){const s=fs.lstatSync(path.join(bundle,name));assert(s.isFile()&&s.uid===0&&!(s.mode&0o022),'UNTRUSTED_BUNDLE');}
 const manifestBytes=read(path.join(bundle,'shared-release.json'));assert.equal(sha(manifestBytes),plan.manifestSha256,'MANIFEST_DRIFT');const manifest=JSON.parse(manifestBytes);assert.equal(manifest.version,1);assert.equal(manifest.commit,plan.candidateCommit);assert.deepEqual(manifest.runtimes.map(r=>r.kind).sort(),['adapter','rooms']);for(const r of manifest.runtimes)assert.equal(sha(read(path.join(bundle,'candidate-'+r.kind+'.tar'))),r.sha256);
 const out=fs.mkdtempSync('/root/manager-preflight/installed-'+new Date().toISOString().replace(/[^0-9]/g,'')+'-');const report={decision:'NO-GO',candidateCommit:manifest.commit,archives:archiveCandidates(manifest),checks:[],scope:'Real copies of both databases; no deployment; source SQL never opened; no production writes.'};
 const check=(name,ok)=>{report.checks.push({name,status:ok?'PASS':'FAIL'});assert(ok,name);};
 try{
  const before=await state(plan);check('installedPinsAndMonetizationOff',true);
  for(const kind of ['rooms','telegram']){
   const work=path.join(out,kind),control=path.join(out,kind+'-control');fs.mkdirSync(work,{mode:0o700});fs.mkdirSync(control,{mode:0o700});
   const host={...before.host,copyKind:kind,...(kind==='telegram'?{expected:{...before.host.expected,database:plan.databases.telegram},sourceInodes:before.telegramInodes}:{})};
   const info=path.join(control,'inventory.json');fs.writeFileSync(info,JSON.stringify(host),{mode:0o600});const args=outerArgs({bundle,work,control,host});args[args.length-1]='/bundle/preflight-installed-copy.cjs';args.unshift('--ro-bind',before.adapter,'/production/adapter');
   const child=cp.spawnSync('/usr/bin/python3',[path.join(bundle,'preflight-source-fds.py'),host.expected.database,info,'/usr/bin/bwrap',...args],{encoding:'utf8',timeout:45000,killSignal:'SIGKILL',maxBuffer:65536});const proof=path.join(work,'copy.json');report[kind+'Backup']=fs.existsSync(proof)?JSON.parse(read(proof)):null;check(kind+'ReadOnlyCaptureBackupRestore',child.status===0&&report[kind+'Backup']?.status==='PASS');
  }
  const verification=path.join(out,'verification');fs.mkdirSync(verification,{mode:0o700});for(const f of ['candidate','adapter','previous','restored.sqlite'])fs.renameSync(path.join(out,'rooms',f),path.join(verification,f));fs.renameSync(path.join(out,'telegram/restored.sqlite'),path.join(verification,'telegram-restored.sqlite'));fs.renameSync(path.join(out,'telegram/previous-adapter'),path.join(verification,'previous-adapter'));
  const args=sandboxArgs(verification,before.host.node,path.join(bundle,'preflight-installed-worker.cjs'));args.unshift('--ro-bind',path.join(bundle,'preflight-worker.cjs'),'/probe.cjs');const child=cp.spawnSync('/usr/bin/bwrap',args,{encoding:'utf8',timeout:90000,killSignal:'SIGKILL',maxBuffer:65536});const result=path.join(verification,'compatibility.json');report.compatibility=fs.existsSync(result)?JSON.parse(read(result)):null;check('bothRuntimeRealDatabaseCompatibility',child.status===0&&report.compatibility?.status==='PASS'&&report.compatibility.isolationVerified===true);
  const after=await state(plan);check('hostContinuity',JSON.stringify(before.units)===JSON.stringify(after.units)&&before.host.pid===after.host.pid&&before.host.docker===after.host.docker&&JSON.stringify(before.host.sourceInodes)===JSON.stringify(after.host.sourceInodes)&&JSON.stringify(before.telegramInodes)===JSON.stringify(after.telegramInodes)&&JSON.stringify(before.host.otherServices)===JSON.stringify(after.host.otherServices)&&JSON.stringify(before.host.caddy)===JSON.stringify(after.host.caddy));
  report.decision='GO';
 }catch(error){report.failure={code:/^[A-Z][A-Z0-9_]{2,79}$/.test(error.message??'')?error.message:'ISOLATED_PREFLIGHT_FAILED',name:error.name};}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});fs.writeFileSync(path.join(out,'REPORT.md'),'# '+report.decision+'\n\n'+report.checks.map(c=>'- '+c.status+': '+c.name).join('\n')+'\n\nNo deployment. Separate SQLite-consistent snapshots, not a cross-database transaction.\n',{mode:0o600});console.log(JSON.stringify({decision:report.decision,report:path.join(out,'report.json'),sha256:sha(read(path.join(out,'report.json')))}));return report;
}
if(require.main===module)launch(__dirname,process.argv[2]).then(r=>{if(r.decision!=='GO')process.exitCode=2;}).catch(()=>{console.error('NO-GO: trusted bootstrap prerequisites failed.');process.exitCode=2;});
module.exports={launch,tree,archiveCandidates};
