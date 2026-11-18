'use strict';
// Prepared configuration tool. Running --apply changes the bot; owner approval is required.
const {randomBytes}=require('node:crypto');
const {environment,createBotApi}=require('./bot-api.cjs');
(async()=>{
 if(process.argv.includes('--secrets')){const fs=require('node:fs'),path=require('node:path'),file=path.join(__dirname,'.env');let text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';for(const name of ['TELEGRAM_WEBHOOK_SECRET','ADS_RECEIPT_SECRET'])if(!new RegExp('^'+name+'=.+$','m').test(text)){text=text.replace(new RegExp('^'+name+'=.*$','gm'),'');text+=(text.endsWith('\n')?'':'\n')+name+'='+randomBytes(32).toString('hex')+'\n';}process.umask(0o077);fs.writeFileSync(file,text,{mode:0o600});console.log('Secrets written to private .env; values are not logged.');return;}
 const mode=environment(),origin=process.env.PUBLIC_ORIGIN,token=process.env.TELEGRAM_BOT_TOKEN,secret=process.env.TELEGRAM_WEBHOOK_SECRET;
 if(!origin||new URL(origin).protocol!=='https:'||!token||!secret||secret.length<32||!process.env.SUPPORT_CONTACT)throw Error('Set bot token, HTTPS origin, webhook secret and SUPPORT_CONTACT in a private .env file.');
 const actions=[['setWebhook',{url:origin+'/telegram/webhook',secret_token:secret,allowed_updates:['message','pre_checkout_query'],drop_pending_updates:false}],['setChatMenuButton',{menu_button:{type:'web_app',text:'Играть в «Менеджер»',web_app:{url:origin}}}],['setMyCommands',{commands:[{command:'paysupport',description:'Помощь с покупками Telegram Stars'}]}]];
 if(!process.argv.includes('--apply')){console.log('Prepared bot configuration:',mode,origin,'; webhook + menu button + /paysupport. No changes made. Run with --apply only after owner approval.');return;}
 const bot=createBotApi(token,{mode});for(const [method,payload]of actions){await bot(method,payload);console.log(method+': OK');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
