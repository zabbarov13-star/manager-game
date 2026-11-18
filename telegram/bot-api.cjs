'use strict';
function environment(value=process.env.TELEGRAM_ENV??'production'){
 if(!['test','production'].includes(value))throw Error('TELEGRAM_ENV must be test or production.');return value;
}
function createBotApi(token,{mode=environment(),fetcher=globalThis.fetch}={}){
 mode=environment(mode);
 return async(method,payload)=>{
  if(!/^[A-Za-z][A-Za-z0-9]+$/.test(method))throw Error('Invalid Bot API method.');
  let response;try{response=await fetcher(`https://api.telegram.org/bot${token}/${mode==='test'?'test/':''}${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});}catch{throw Object.assign(Error('Telegram временно недоступен.'),{status:502});}
  let data;try{data=await response.json();}catch{throw Object.assign(Error('Telegram вернул некорректный ответ.'),{status:502});}
  if(!response.ok||!data.ok)throw Object.assign(Error('Telegram отклонил запрос.'),{status:502});return data.result;
 };
}
module.exports={environment,createBotApi};
