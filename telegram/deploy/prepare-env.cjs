'use strict';
// Writes a separate private deployment env; leaves the local .env unchanged.
const fs=require('node:fs'),path=require('node:path');
function prepareEnv(text,{domain='manager.95-181-169-84.sslip.io'}={}){
 if(!/^[a-z0-9.-]+$/.test(domain))throw Error('Invalid approved domain.');const allowed=new Set(['TELEGRAM_BOT_TOKEN','TELEGRAM_ENV','OWNER_TELEGRAM_ID','TELEGRAM_WEBHOOK_SECRET','SUPPORT_CONTACT','PUBLIC_ORIGIN','TELEGRAM_DATABASE','BIND','PORT','STARS_ENABLED','ADSGRAM_BLOCK_ID','ADS_VERIFIED_GATEWAY_ENABLED','ADS_RECEIPT_SECRET']);const values=new Map();for(const line of text.replace(/\r\n/g,'\n').split('\n')){if(!line.trim()||line.trim().startsWith('#'))continue;const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);if(!match||values.has(match[1]))throw Error('Review duplicate or unsupported .env syntax privately.');if(allowed.has(match[1]))values.set(match[1],match[2]);}
 for(const [key,value]of Object.entries({PUBLIC_ORIGIN:'https://'+domain,BIND:'0.0.0.0',PORT:'8090',TELEGRAM_DATABASE:'/data/telegram.sqlite',STARS_ENABLED:'0',ADS_VERIFIED_GATEWAY_ENABLED:'0'}))values.set(key,value);
 return [...values].map(([k,v])=>k+'='+v).join('\n')+'\n';
}
if(require.main===module){process.umask(0o077);const root=path.resolve(__dirname,'..'),source=path.join(root,'.env'),out=path.join(__dirname,'out/manager.env');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,prepareEnv(fs.readFileSync(source,'utf8')),{mode:0o600});console.log('Private deployment env prepared with Stars/Ads OFF. Original .env unchanged; Telegram environment must be verified, not inferred from the bot name.');}
module.exports={prepareEnv};
