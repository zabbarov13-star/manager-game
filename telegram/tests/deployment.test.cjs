'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {verifyCaddyChange}=require('../deploy/caddy-guard.cjs'),{makePlan,rootPath,rollbackPlan,verifyDataTree}=require('../deploy/vps.cjs'),{prepareEnv}=require('../deploy/prepare-env.cjs'),{inspectBot}=require('../deploy/bot-check.cjs');
const domain='manager.95-181-169-84.sslip.io';
const route=(host,upstream)=>({match:[{host:[host]}],handle:[{handler:'reverse_proxy',upstreams:[{dial:upstream}]}]});
function config(routes){return {apps:{http:{servers:{srv0:{listen:[':443'],routes}}},tls:{automation:{policies:[]}}}};}
test('shared Caddy guard preserves Smaylok/legacy Manager and rejects unrelated edits, grouped hosts and wrong upstream',()=>{
 const original=config([route('smaylok.example','127.0.0.1:18080'),route('95-181-169-84.sslip.io','127.0.0.1:8080')]),candidate=structuredClone(original);candidate.apps.http.servers.srv0.routes.unshift(route(domain,'127.0.0.1:8443'));assert(verifyCaddyChange(original,candidate,domain).preservedOtherSites);
 const changed=structuredClone(candidate);changed.apps.http.servers.srv0.routes[1].handle[0].upstreams[0].dial='127.0.0.1:9999';assert.throws(()=>verifyCaddyChange(original,changed,domain));
 const tls=structuredClone(candidate);tls.apps.tls.automation.policies.push({issuers:[{module:'internal'}]});assert.throws(()=>verifyCaddyChange(original,tls,domain));
 const grouped=structuredClone(candidate);grouped.apps.http.servers.srv0.routes[0].match[0].host.push('smaylok.example');assert.throws(()=>verifyCaddyChange(original,grouped,domain));
 const wrong=config([...original.apps.http.servers.srv0.routes,route(domain,'127.0.0.1:18080')]);assert.throws(()=>verifyCaddyChange(original,wrong,domain));
});
function inventory(){return {rootInventory:true,warnings:[],managerCandidates:[],listeners:[],units:[{name:'caddy.service',ActiveState:'active'}],caddy:{main:'/etc/caddy/Caddyfile',sha256:'a'.repeat(64),activeSha256:'b'.repeat(64)},fingerprint:'c'.repeat(64)}};
const manifest={schemaVersion:1,commit:'d'.repeat(40),sha256:'e'.repeat(64)};
test('a public/original Manager blocks a duplicate install; unknown data is never adopted just because port 8080 exists',()=>{
 const found=inventory();found.publicClient={clientRulesMatchStable0191:true};assert.equal(makePlan({inventory:found,manifest,mode:'new'}).status,'BLOCKED');
 found.managerCandidates=[{path:'/opt/old-manager',managerRepository:true}];assert.equal(makePlan({inventory:found,manifest,mode:'update'}).status,'BLOCKED');
 const busy=inventory();busy.listeners.push({port:8443});assert.equal(makePlan({inventory:busy,manifest,mode:'new'}).status,'BLOCKED');
 assert.throws(()=>rootPath('/opt/manager/../smaylok'));assert.throws(()=>rootPath('/opt/smaylok'));assert.throws(()=>rootPath('/'));
});
test('reviewed known layouts use only loopback 8443 and retain financial data/credentials on rollback',()=>{
 const root='/opt/manager-mini-app',managed={kind:'manager-mini-app',root,origin:'https://'+domain};const plan=makePlan({inventory:inventory(),manifest,root,managed,mode:'update'});assert.equal(plan.status,'READY_FOR_REVIEW');assert.equal(plan.hostPort,'127.0.0.1:8443');assert.equal(plan.dataDirectory,root+'/shared/data');assert.equal(plan.starsEnabled,false);assert.equal(plan.adsEnabled,false);
 const record={...managed,release:'f'.repeat(40),previous:{release:'a'.repeat(40),image:'manager-mini-app:'+'a'.repeat(40)}};const rollback=rollbackPlan(root,record);assert(rollback.keepCurrentDatabases);assert(rollback.keepCurrentCredentials);assert.equal(rollback.caddyReload,false);assert.throws(()=>rollbackPlan(root,{...record,previous:null}));
});
test('deployment env is a private copy with payments/ads off and no unrelated SSH secret',()=>{
 const source='TELEGRAM_ENV=test\nTELEGRAM_BOT_TOKEN=private-token\nOWNER_TELEGRAM_ID=9001\nSSH_PASSWORD=do-not-copy\nSTARS_ENABLED=1\nADS_VERIFIED_GATEWAY_ENABLED=1\nPUBLIC_ORIGIN=https://localhost:8443\n';const prepared=prepareEnv(source);assert(prepared.includes('PUBLIC_ORIGIN=https://'+domain));assert(prepared.includes('STARS_ENABLED=0'));assert(prepared.includes('ADS_VERIFIED_GATEWAY_ENABLED=0'));assert(!prepared.includes('do-not-copy'));assert(source.includes('STARS_ENABLED=1'));
});
test('read-only bot diagnostics never disclose a token, user ID, secret error or old webhook URL',async()=>{
 const token='never-log-this-token',fetcher=async url=>({ok:true,status:200,json:async()=>url.endsWith('getMe')?{ok:true,result:{id:123456789,username:'ManagerGameTestBot'}}:url.endsWith('getWebhookInfo')?{ok:true,result:{url:'https://private.invalid/secret-path',last_error_message:token,pending_update_count:2}}:{ok:true,result:{type:'default'}}});const report=await inspectBot({token,fetcher,mode:'production'}),text=JSON.stringify(report);assert.equal(report.status,'PASS_IDENTITY');for(const secret of [token,'123456789','secret-path','private.invalid'])assert(!text.includes(secret));assert.equal(report.results[0].webhook.targetMatches,false);
});
test('a linked Manager data root is refused instead of following another application data',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'manager-deploy-data-'));fs.writeFileSync(path.join(folder,'progress.json'),'{}');verifyDataTree(folder);
 // Symlink creation on Windows may require a privilege, so junctions exercise the root guard.
 const link=folder+'-linked';fs.symlinkSync(folder,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>verifyDataTree(link));
});
