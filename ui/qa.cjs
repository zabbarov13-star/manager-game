'use strict';
// One entry point. No remote writes, real Telegram updates, payments or deployment.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release-output/ui-qa');fs.mkdirSync(out,{recursive:true});
const report={version:1,startedAt:new Date().toISOString(),checks:[],external:{physicalAndroid:'BLOCKED',physicalIOS:'BLOCKED',telegramRealClients:'BLOCKED',macOSLinuxNative:'BLOCKED',installedVpsRevision:'BLOCKED'}};
function step(name,command,args,extra={}){
 const p=cp.spawnSync(command,args,{cwd:root,encoding:'utf8',env:{...process.env,...extra},timeout:240000,maxBuffer:8*1024**2});
 fs.writeFileSync(path.join(out,name+'.log'),(p.stdout??'')+(p.stderr??'')+(p.error?'\n'+p.error.message:''));report.checks.push({name,status:p.status===0?'PASS':'FAIL',exitCode:p.status});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(name+': '+report.checks.at(-1).status);
 if(p.status!==0){console.error((p.stdout??'').slice(-1500)+(p.stderr??'').slice(-1500));process.exitCode=1;throw Error(name+' failed; see release-output/ui-qa/'+name+'.log');}
}
try{
 step('shared-source',process.execPath,['ui/build.cjs']);step('web-build',process.execPath,['online/generate.cjs']);step('telegram-build',process.execPath,['telegram/build.cjs']);
 step('runtime-archives',process.execPath,['telegram/tests/native-runtime.cjs']);
 const tests=['tests/p2p-routing-baseline.cjs','ui/tests/presentation.test.cjs','ui/tests/movement.test.cjs','ui/tests/rooms.test.cjs','online/server.test.cjs','online/public.test.cjs','online/construction.test.cjs','packaging/test-dice.cjs',...fs.readdirSync(path.join(root,'telegram/tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>'telegram/tests/'+n)];
 const tls=require('./tests/tls-fixture.cjs')();
 step('unit-integration',process.execPath,['--test',...tests],{QA_TLS_DIR:tls});
 report.external.linuxNamespaceIsolation='BLOCKED_UNLESS_PREFLIGHT_BWRAP_TEST_1';
 for(const platform of ['android','desktop','ios'])step('stage-'+platform,process.env.PYTHON??'python',['packaging/stage-native.py',platform]);
 step('native-assets',process.env.PYTHON??'python',['ui/tests/native-assets.py']);
 step('browser-matrix',process.execPath,['ui/tests/browser.cjs'],{QA_EDITION:''});
 step('browser-network-regression',process.execPath,['online/browser-smoke.cjs'],{NODE_PATH:path.join(root,'telegram/node_modules'),CHROMIUM_EXECUTABLE:process.env.QA_BROWSER??''});
 step('board-gestures-construction',process.execPath,['online/board-smoke.cjs'],{NODE_PATH:path.join(root,'telegram/node_modules')});
 for(const file of ['browser-smoke','shared-browser','character-field'])step('telegram-'+file,process.execPath,['telegram/tests/'+file+'.cjs'],{QA_CHROME:process.env.QA_BROWSER??''});
 step('archive-extractor',process.env.PYTHON??'python',['online/vps/unpack-release.test.py']);
 step('performance',process.execPath,['ui/tests/baseline.cjs','after.json']);
 report.finishedAt=new Date().toISOString();report.automatic='PASS';report.release='BLOCKED_PENDING_PLATFORM_ACCEPTANCE';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('Automatic QA PASS; real-client/device acceptance remains BLOCKED. No deployment performed.');
}catch(e){report.automatic='FAIL';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.error(e.message);process.exitCode=1;}
