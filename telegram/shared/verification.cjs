'use strict';
const {createServer,request}=require('node:http'),{createHmac,randomBytes,timingSafeEqual}=require('node:crypto');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const sign=(key,value)=>createHmac('sha256',key).update(value).digest('hex');
function keyCheck(key){if(typeof key!=='string'||key.length<32)throw Error('Independent cosmetic RPC secret of at least 32 characters required.');}
function createVerificationServer(store,key){
 keyCheck(key);const seen=new Map();
 return createServer({requestTimeout:2000,headersTimeout:2000},async(req,res)=>{
  const send=(status,data)=>{const raw=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Response-Signature':sign(key,`${stamp}.${nonce}.${raw}`)});res.end(raw);};
  const stamp=req.headers['x-rpc-time'],nonce=req.headers['x-rpc-nonce'];
  if(req.method!=='POST'||req.url!=='/internal/cosmetics/verify'){res.writeHead(404).end();return;}
  try{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096){res.writeHead(413).end();return;}}
   const now=Date.now();for(const [id,expires]of seen)if(expires<now)seen.delete(id);
   if(!/^\d{13}$/.test(stamp??'')||Math.abs(now-Number(stamp))>30000||!/^[a-f0-9]{32}$/.test(nonce??'')||!equal(req.headers['x-rpc-signature']??'',sign(key,`${stamp}.${nonce}.${raw}`))){res.writeHead(403).end();return;}
   if(seen.has(nonce)||seen.size>=4096){res.writeHead(409).end();return;}seen.set(nonce,now+60000);
   const body=JSON.parse(raw);if(!Array.isArray(body.checks)||body.checks.length>6||!['admit','start'].includes(body.purpose))return send(400,{error:'Invalid contract'});
   return send(200,{valid:body.checks.map(c=>!!c&&store.verifyCosmetic(c.ticket,c.characterId,{existingSeat:body.purpose==='start',styleId:c.styleId,diceId:c.diceId}))});
  }catch{if(!res.headersSent)res.writeHead(400).end();}
 });
}
function createVerifier({endpoint='http://127.0.0.1:8444',secret,timeout=700}={}){
 keyCheck(secret);const url=new URL(endpoint);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Cosmetic RPC must use a dedicated IPv4 loopback listener.');
 return (checks,purpose)=>new Promise((resolve,reject)=>{
  const stamp=String(Date.now()),nonce=randomBytes(16).toString('hex'),raw=JSON.stringify({checks,purpose});
  const fail=()=>reject(Object.assign(Error('Проверка образа временно недоступна. Повторите запрос.'),{status:503}));
  const req=request(new URL('/internal/cosmetics/verify',url),{method:'POST',headers:{'Content-Type':'application/json','X-Rpc-Time':stamp,'X-Rpc-Nonce':nonce,'X-Rpc-Signature':sign(secret,`${stamp}.${nonce}.${raw}`)}},res=>{let result='';res.on('data',chunk=>{result+=chunk;if(result.length>4096)req.destroy();});res.on('error',fail);res.on('end',()=>{clearTimeout(timer);try{if(res.statusCode!==200||!equal(res.headers['x-response-signature']??'',sign(secret,`${stamp}.${nonce}.${result}`)))return fail();const value=JSON.parse(result);if(!Array.isArray(value.valid)||value.valid.length!==checks.length||value.valid.some(v=>typeof v!=='boolean'))return fail();resolve(value.valid);}catch{fail();}});});
  const timer=setTimeout(()=>req.destroy(),timeout);req.on('error',()=>{clearTimeout(timer);fail();});req.end(raw);
 });
}
module.exports={createVerificationServer,createVerifier,sign};
