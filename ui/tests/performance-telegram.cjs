'use strict';
// Compare against an independently built, isolated source checkout. Never use a live bot.
const fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{createHmac}=require('node:crypto');
const {chromium,devices}=require('../../telegram/node_modules/playwright');
const baseline=path.resolve(process.argv[2]||'release-output/ui-qa/baseline-4982083'),root=path.resolve(__dirname,'../..');
const token='123:isolated-performance-fixture',secret='performance-fixture-webhook-at-least-32';
function identity(){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:990001,first_name:'QA'})});p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update([...p].sort().map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
async function start(folder){const reserved=require('node:net').createServer().listen(0,'127.0.0.1');await once(reserved,'listening');const port=reserved.address().port;await new Promise(r=>reserved.close(r));const url='http://127.0.0.1:'+port;const app=require(path.join(folder,'telegram/server.cjs')).createApp({botToken:token,webhookSecret:secret,origin:url,allowHttp:true,database:':memory:',ownerTelegramId:'',bot:async()=>{throw Error('Live bot calls forbidden');}}).listen(port,'127.0.0.1');await once(app,'listening');return {app,url};}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.QA_BROWSER||undefined}),results=[];
 try{for(const [version,folder]of [['before',baseline],['after',root]]){
  const {app,url}=await start(folder);
  try{for(const [platform,options]of [['desktop',{viewport:{width:1440,height:1000}}],['mobile',devices['Pixel 7']]]){
   const runs=[];
   for(let n=0;n<3;n++){
    const c=await browser.newContext({...options,serviceWorkers:'block'}),page=await c.newPage();
    await c.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:${JSON.stringify(identity())},ready(){},expand(){},onEvent(){},BackButton:{show(){},hide(){},onClick(){}}}};`}));
    await page.goto(url);await page.locator('#telegram-loading').waitFor({state:'detached',timeout:20000});await page.locator('#party-open').waitFor({state:'attached'});
    runs.push(await page.evaluate(()=>({interactiveMs:performance.now(),bytes:performance.getEntriesByType('navigation')[0].transferSize+performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.transferSize,0)})));await c.close();
   }
   results.push({version,platform,runs});
  }}finally{await new Promise(r=>app.close(r));}
 }}finally{await browser.close();}
 const result={scope:'Local Chromium, signed fixture Telegram host, three cold contexts; not real Telegram/WebView',baselineCommit:'4982083ed6b1062f45b921c62ba46081295d7119',results};
 fs.writeFileSync(path.join(root,'release-output/ui-qa/telegram-performance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
