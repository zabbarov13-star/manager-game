'use strict';
const fs=require('node:fs'),path=require('node:path'),{X509Certificate}=require('node:crypto');
const blocked=[],root=path.resolve(__dirname,'..');
for(const name of ['TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','PUBLIC_ORIGIN','SUPPORT_CONTACT'])if(!process.env[name])blocked.push(name+' is missing');
if(process.env.TELEGRAM_ENV!=='test')blocked.push('TELEGRAM_ENV must be test for this staging check');
if(process.env.TELEGRAM_WEBHOOK_SECRET&&process.env.TELEGRAM_WEBHOOK_SECRET.length<32)blocked.push('Webhook secret is too short');
const cert=path.join(root,'data/staging/tls/localhost-cert.pem');try{if(Date.parse(new X509Certificate(fs.readFileSync(cert)).validTo)<Date.now())blocked.push('Local TLS certificate expired');}catch{blocked.push('Local TLS certificate missing');}
console.log(JSON.stringify({localTlsOnly:true,publicHttpsConfirmed:false,liveTelegramConfirmed:false,status:blocked.length?'BLOCKED':'PASS',blocked},null,2));if(blocked.length)process.exitCode=2;
