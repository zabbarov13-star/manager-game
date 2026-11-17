'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
function validateInitData(raw,token,now=Date.now(),maxAge=3600){
 if(typeof raw!=='string'||raw.length>16384||!token)throw Error('Откройте приложение в Telegram.');
 const p=new URLSearchParams(raw),seen=new Set();
 for(const [k]of p){if(seen.has(k))throw Error('Повтор поля авторизации.');seen.add(k);}
 const hash=p.get('hash');p.delete('hash');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 const check=[...p].sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${k}=${v}`).join('\n');
 const expected=createHmac('sha256',secret).update(check).digest('hex');
 if(!hash||!equal(hash,expected))throw Error('Неверная подпись Telegram.');
 const date=Number(p.get('auth_date')),seconds=Math.floor(now/1000);
 if(!Number.isSafeInteger(date)||date>seconds+30||date<seconds-maxAge)throw Error('Авторизация устарела. Откройте приложение заново.');
 let user;try{user=JSON.parse(p.get('user'));}catch{throw Error('Нет пользователя Telegram.');}
 if(!Number.isSafeInteger(user?.id)||user.id<=0)throw Error('Неверный пользователь Telegram.');
 return {id:String(user.id),name:String(user.first_name??'Игрок').slice(0,64)};
}
module.exports={validateInitData,equal};
