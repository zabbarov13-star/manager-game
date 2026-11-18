'use strict';
// Only this small trusted bootstrap runs on the host. It never loads candidate code.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {inventory}=require('./preflight-host.cjs');
function outerArgs({bundle,work,control,host}){
 const a=['--unshare-all','--unshare-user','--die-with-parent','--new-session','--cap-drop','ALL','--uid','65534','--gid','65534','--clearenv','--setenv','PATH','/usr/bin:/bin','--setenv','HOME','/tmp','--setenv','NODE_NO_WARNINGS','1','--ro-bind','/usr','/usr'];
 for(const p of ['/bin','/lib','/lib64'])if(fs.existsSync(p)){const s=fs.lstatSync(p);a.push(...(s.isSymbolicLink()?['--symlink',fs.readlinkSync(p),p]:['--ro-bind',p,p]));}
 a.push('--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/runtime','--ro-bind',host.node,'/runtime/node','--ro-bind',host.caddyBinary,'/runtime/caddy','--ro-bind',bundle,'/bundle','--ro-bind',control,'/control','--bind',work,'/audit','--ro-bind',host.current,'/production/code','--ro-bind',path.dirname(host.expected.database),'/production/db','--ro-bind',host.caddyDirectory??'/etc/caddy','/etc/caddy','--chdir','/audit','/usr/bin/setpriv','--no-new-privs','/runtime/node','--max-old-space-size=256','/bundle/preflight.cjs');return a;
}
async function launch(bundle=__dirname){
 if(process.platform!=='linux'||process.getuid()!==0||!/^24\./.test(process.versions.node))throw Error('ROOT_LINUX_NODE24_REQUIRED');process.umask(0o077);
 bundle=fs.realpathSync(bundle);for(const name of ['preflight.cjs','preflight-host.cjs','preflight-worker.cjs','preflight-snapshot.cjs','preflight-capture.py','preflight-archive.cjs','preflight-adapter.cjs','caddy-guard.cjs','shared-routing.cjs','candidate-rooms.tar','candidate-adapter.tar','shared-release.json']){const s=fs.lstatSync(path.join(bundle,name));if(!s.isFile()||s.uid!==0||(s.mode&0o022))throw Error('UNTRUSTED_BUNDLE_FILE');}
 const parent='/root/manager-preflight';const st=fs.lstatSync(parent);if(fs.realpathSync(parent)!==parent||st.uid!==0||(st.mode&0o077))throw Error('PRIVATE_PARENT_REQUIRED');
 const out=path.join(parent,'run-'+new Date().toISOString().replace(/[^0-9]/g,'')+'-'+crypto.randomBytes(4).toString('hex'));fs.mkdirSync(out,{mode:0o700});const work=path.join(out,'work'),control=path.join(out,'control');fs.mkdirSync(work,{mode:0o700});fs.mkdirSync(control,{mode:0o700});
 let report={decision:'NO-GO',checks:[],scope:'No deployment; host state only read by trusted bootstrap; all SQL and candidate code confined to namespaces.'};
 try{
  const before=await inventory();fs.writeFileSync(path.join(control,'inventory.json'),JSON.stringify(before),{mode:0o600});
  let child;const sourceFds=[];try{for(const suffix of ['','-wal','-shm'])sourceFds.push(fs.openSync(before.expected.database+suffix,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK));for(let i=0;i<sourceFds.length;i++){const f=fs.fstatSync(sourceFds[i]);if(!f.isFile()||f.dev!==before.sourceInodes[i].dev||f.ino!==before.sourceInodes[i].ino)throw Error('SOURCE_INODE_CHANGED');}child=cp.spawnSync('/usr/bin/bwrap',outerArgs({bundle,work,control,host:before}),{stdio:['ignore','pipe','pipe',...sourceFds],encoding:'utf8',timeout:150000,killSignal:'SIGKILL',maxBuffer:65536});}finally{for(const fd of sourceFds)fs.closeSync(fd);}
  const proof=path.join(work,'report.json');if(fs.existsSync(proof))report=JSON.parse(fs.readFileSync(proof,'utf8'));else report.checks.push({name:'outerIsolation',status:'BLOCKED',reason:'ISOLATION_UNAVAILABLE'});
  const after=await inventory();
  const stable=after.databaseConfirmed&&JSON.stringify(before.sourceInodes)===JSON.stringify(after.sourceInodes)&&before.docker===after.docker&&JSON.stringify(before.unit)===JSON.stringify(after.unit)&&before.pid===after.pid&&before.current===after.current&&JSON.stringify(before.code)===JSON.stringify(after.code)&&before.caddy.sha256===after.caddy.sha256&&JSON.stringify(before.caddy.active)===JSON.stringify(after.caddy.active)&&JSON.stringify(before.otherServices)===JSON.stringify(after.otherServices)&&after.service.ActiveState==='active';
  report.checks.push({name:'hostContinuity',status:stable?'PASS':'FAIL'});report.checks.push({name:'isolatedProcessExit',status:child.status===0?'PASS':'FAIL',...(child.status!==0?{reason:'ISOLATED_NO_GO_OR_TIMEOUT'}:{})});
 }catch{report.checks.push({name:'hostOrIsolation',status:'BLOCKED',reason:'HOST_OR_ISOLATION_UNAVAILABLE'});}
 report.decision=report.checks.length&&report.checks.every(c=>c.status==='PASS')?'GO':'NO-GO';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});fs.writeFileSync(path.join(out,'REPORT.md'),`# ${report.decision}: изолированная диагностика\n\n${report.checks.map(c=>`- ${c.status}: ${c.name}${c.reason?' — '+c.reason:''}`).join('\n')}\n\nGO не разрешает развёртывание. Каталог копий приватный. Подробности — report.json.\n`,{mode:0o600});console.log(JSON.stringify({decision:report.decision,report:path.join(out,'REPORT.md'),noDeployment:true}));return report;
}
if(require.main===module)launch(process.argv[2]??__dirname).then(r=>{if(r.decision!=='GO')process.exitCode=2;}).catch(()=>{console.error('NO-GO: trusted launcher prerequisites unavailable; no deployment.');process.exitCode=2;});
module.exports={launch,outerArgs};
