'use strict';
const {createHash}=require('node:crypto');
function identifyClient(html){const source=html.replace(/\r\n/g,'\n'),start=source.indexOf('function createMatch('),end=source.indexOf('const PENDING_KEY=');let match=false;
 if(start>=0&&end>start){const rules=source.slice(start,end).replace("id:p.seatId??'p'+i","id:'p'+i").replace("const behind=owned.filter(x=>s.properties[x.id].level<p.level);if(behind.length)return no('Сначала уравняйте число филиалов в своих городах: '+behind.map(x=>x.name+' ('+s.properties[x.id].level+' из '+p.level+')').join(', ')+'.');","if(owned.some(x=>s.properties[x.id].level<p.level))return no('Сначала застройте города с меньшим числом филиалов.');");try{match=createHash('sha256').update(rules).digest('hex')===require('../tests/stable-signatures.json').rulesSha256;}catch{}}
 return {title:source.match(/<title[^>]*>([^<]*)/i)?.[1]?.slice(0,150)??null,versionMentions:[...new Set(source.match(/v?0\.19\.[0-9]+/g)??[])].slice(0,8),clientRulesMatchStable0191:match,htmlSha256:createHash('sha256').update(source).digest('hex'),serverRuntimeNotVerified:true};
}
async function inspectPublic(origin='https://95-181-169-84.sslip.io'){try{const response=await fetch(origin+'/',{signal:AbortSignal.timeout(15000)});return {origin,httpStatus:response.status,...identifyClient(await response.text())};}catch(error){return {origin,reachable:false,transportError:require('./bot-check.cjs').transportCode(error)};}}
if(require.main===module)inspectPublic(process.argv[2]).then(report=>console.log(JSON.stringify(report,null,2)));
module.exports={identifyClient,inspectPublic};
