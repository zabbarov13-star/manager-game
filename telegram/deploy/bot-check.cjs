'use strict';
// Read-only Bot API diagnostics, compatible with the VPS Node 18. No IDs, URLs
// containing credentials, provider error descriptions or token values are logged.
const fs=require('node:fs'),path=require('node:path');
const TARGET='https://manager.95-181-169-84.sslip.io';
function transportCode(error){const code=error?.name==='TimeoutError'?'TIMEOUT':error?.cause?.code;return /^[A-Z0-9_]{1,48}$/.test(code??'')?code:'NETWORK_ERROR';}
async function inspectBot({token=process.env.TELEGRAM_BOT_TOKEN,mode=process.env.TELEGRAM_ENV??'production',probe=false,expected='ManagerGameTestBot',origin=TARGET,fetcher=globalThis.fetch}={}){
 const report={checkedAt:new Date().toISOString(),readOnly:true,tokenConfigured:!!token,configuredEnvironment:mode,results:[]};
 if(!token)return {...report,status:'BLOCKED',reason:'TOKEN_MISSING'};
 if(!['test','production'].includes(mode))return {...report,status:'BLOCKED',reason:'ENVIRONMENT_INVALID'};
 async function call(environment,method){try{const response=await fetcher(`https://api.telegram.org/bot${token}/${environment==='test'?'test/':''}${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});const data=await response.json();return {ok:response.ok&&data.ok===true,httpStatus:response.status,data:data.result};}catch(error){return {ok:false,transportError:transportCode(error)};}}
 for(const environment of probe?[mode,mode==='test'?'production':'test']:[mode]){
  const me=await call(environment,'getMe'),row={environment,authenticated:me.ok,httpStatus:me.httpStatus,transportError:me.transportError};
  if(me.ok){row.expectedBot=String(me.data?.username??'').toLowerCase()===expected.toLowerCase();row.mainMiniAppDeclared=me.data?.has_main_web_app===true;
   const [hook,menu]=await Promise.all([call(environment,'getWebhookInfo'),call(environment,'getChatMenuButton')]);
   const url=hook.data?.url;let matches=false;try{const parsed=new URL(url);matches=parsed.origin===origin&&parsed.pathname==='/telegram/webhook'&&!parsed.search;}catch{}
   row.webhook={readable:hook.ok,configured:!!url,targetMatches:matches,hasError:!!hook.data?.last_error_message,pendingUpdates:hook.data?.pending_update_count??null};
   row.menu={readable:menu.ok,type:menu.data?.type??null,targetMatches:menu.data?.web_app?.url?.replace(/\/$/,'')===origin};
  }report.results.push(row);
 }
 const matched=report.results.filter(r=>r.authenticated&&r.expectedBot);report.status=matched.length===1?'PASS_IDENTITY':'BLOCKED';report.verifiedEnvironment=matched.length===1?matched[0].environment:null;return report;
}
if(require.main===module){inspectBot({probe:process.argv.includes('--probe-environments'),origin:process.env.PUBLIC_ORIGIN??TARGET}).then(report=>{const index=process.argv.indexOf('--out');if(index>=0){const file=path.resolve(process.argv[index+1]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600});}console.log(JSON.stringify(report,null,2));if(process.argv.includes('--strict')&&report.status!=='PASS_IDENTITY')process.exitCode=2;}).catch(()=>{console.error('Bot inspection failed; details redacted.');process.exitCode=1;});}
module.exports={inspectBot,transportCode};
