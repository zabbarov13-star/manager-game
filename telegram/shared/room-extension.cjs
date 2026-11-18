'use strict';
const {createHash}=require('node:crypto');
function createExtension({handleRooms,verifyBatch,strict=true}){
 let pending=0;
 return {handleRooms,async prepare({pathname,method,authorization,body,readRoom}){
  const valid=new Set(),environment={verifyCosmetic:(ticket,id)=>valid.has(ticket+':'+id)};
  if(method!=='POST')return {verified:false,environment};
  let data;try{data=JSON.parse(body);}catch{return {verified:false,environment};}
  if(!data||typeof data!=='object'||Array.isArray(data))return {verified:false,environment};
  const parts=pathname.split('/').filter(Boolean),code=parts[2],op=parts[3];let checks=[],purpose='admit',guard;
  if((parts.length===2||op==='join'||op==='appearance')&&data.telegramCharacterId){
   checks=[{ticket:data.telegramCosmeticTicket,characterId:data.telegramCharacterId}];
  }else if(op==='start'){
   const row=readRoom(code);if(!row)return {verified:false,environment};const room=JSON.parse(row.data),token=authorization.replace(/^Bearer /,''),hashed=createHash('sha256').update(token).digest('hex');
   if(room.game||!room.seats.some(s=>s.id===room.hostId&&s.hash===hashed))return {verified:false,environment};
   checks=room.seats.filter(s=>s.cosmeticCharacter).map(s=>({ticket:s.cosmeticTicket,characterId:s.cosmeticCharacter}));purpose='start';guard={code,revision:row.revision};
  }
  if(!checks.length)return {verified:false,environment,guard};
  if(pending>=32)throw Object.assign(Error('Verifier busy'),{status:503});pending++;
  try{const results=await verifyBatch(checks,purpose);checks.forEach((c,i)=>{if(results[i])valid.add(c.ticket+':'+c.characterId);});
   if(strict&&purpose==='admit'&&!results[0])throw Object.assign(Error('Cosmetic access denied'),{status:403});return {verified:purpose==='admit'&&results[0]===true,environment,guard};
  }finally{pending--;}
 }};
}
function fromEnvironment(){return createExtension({handleRooms:require('./dist/engine.cjs').handleRooms,verifyBatch:require('./verification.cjs').createVerifier({endpoint:process.env.COSMETIC_RPC_ENDPOINT,secret:process.env.COSMETIC_RPC_SECRET})});}
module.exports={createExtension,fromEnvironment};
