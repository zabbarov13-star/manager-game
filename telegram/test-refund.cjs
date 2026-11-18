'use strict';
const path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{environment,createBotApi}=require('./bot-api.cjs');
async function refundTestPayment({orderId,database,mode=environment(),botToken=process.env.TELEGRAM_BOT_TOKEN,bot}={}){
 if(mode!=='test')throw Error('This helper only operates in the separate Telegram test environment.');
 if(!orderId||!database||!botToken&&!bot)throw Error('Set test bot token, existing test database and order ID privately.');
 const db=new DatabaseSync(path.resolve(database),{readOnly:true});let order;try{order=db.prepare('SELECT user,charge,status FROM orders WHERE id=?').get(orderId);}finally{db.close();}
 if(!order||order.status!=='paid'||!order.charge||!Number.isSafeInteger(Number(order.user))||Number(order.user)<=0)throw Error('A confirmed paid test order is required.');
 const api=bot??createBotApi(botToken,{mode:'test'});await api('refundStarPayment',{user_id:Number(order.user),telegram_payment_charge_id:order.charge});
 // Only the provider's authenticated refunded_payment webhook revokes the grant.
 return {requested:true,awaitingWebhook:true};
}
if(require.main===module){if(!process.argv.includes('--apply-test-refund')){console.log('No operation. Requires TELEGRAM_ENV=test and --apply-test-refund ORDER_ID; production refunds are unsupported.');}else{const index=process.argv.indexOf('--apply-test-refund');refundTestPayment({orderId:process.argv[index+1],database:path.resolve(__dirname,process.env.TELEGRAM_DATABASE??'data/test/telegram.sqlite')}).then(()=>console.log('Test refund requested; await the authenticated webhook. No local grant was forged or revoked.')).catch(e=>{console.error(e.message);process.exitCode=1;});}}
module.exports={refundTestPayment};
