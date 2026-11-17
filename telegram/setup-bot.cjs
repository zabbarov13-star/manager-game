'use strict';
// Prepared configuration tool. Running --apply changes the bot; owner approval is required.
const {randomBytes}=require('node:crypto');
(async()=>{
 if(process.argv.includes('--secrets')){console.log('TELEGRAM_WEBHOOK_SECRET='+randomBytes(32).toString('hex'));console.log('ADS_RECEIPT_SECRET='+randomBytes(32).toString('hex'));return;}
 const origin=process.env.PUBLIC_ORIGIN,token=process.env.TELEGRAM_BOT_TOKEN,secret=process.env.TELEGRAM_WEBHOOK_SECRET;
 if(!origin||new URL(origin).protocol!=='https:'||!token||!secret||secret.length<32||!process.env.SUPPORT_CONTACT)throw Error('Set bot token, HTTPS origin, webhook secret and SUPPORT_CONTACT in a private .env file.');
 const actions=[['setWebhook',{url:origin+'/telegram/webhook',secret_token:secret,allowed_updates:['message','pre_checkout_query'],drop_pending_updates:false}],['setChatMenuButton',{menu_button:{type:'web_app',text:'Играть в «Менеджер»',web_app:{url:origin}}}],['setMyCommands',{commands:[{command:'paysupport',description:'Помощь с покупками Telegram Stars'}]}]];
 if(!process.argv.includes('--apply')){console.log('Prepared bot configuration:',origin,'; webhook + menu button + /paysupport. No changes made. Run with --apply only after owner approval.');return;}
 for(const [method,payload]of actions){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});const v=await r.json();if(!v.ok)throw Error(method+' failed; inspect bot permissions privately.');console.log(method+': OK');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
