'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../store.cjs');
test('a cosmetic ticket authorizes only owned looks; old character-only tickets remain compatible',()=>{
 const store=new Store(':memory:',Date.now,{ownerTelegramId:'101'});
 try{
  for(const id of ['101','102'])store.user({id,name:'Fixture'});
  const owner=store.cosmeticTicket('101'),guest=store.cosmeticTicket('102');
  assert(store.verifyCosmetic(owner.ticket,owner.characterId,{styleId:'arcade',diceId:'jade'}));
  assert(store.verifyCosmetic(guest.ticket,guest.characterId));
  assert(store.verifyCosmetic(guest.ticket,guest.characterId,{styleId:'heritage',diceId:null}));
  assert.equal(store.verifyCosmetic(guest.ticket,guest.characterId,{styleId:'arcade'}),false);
  assert.equal(store.verifyCosmetic(guest.ticket,guest.characterId,{diceId:'jade'}),false);
  assert.equal(store.verifyCosmetic(guest.ticket,guest.characterId,{styleId:'unknown'}),false);
  assert.equal(store.verifyCosmetic('0'.repeat(64),owner.characterId,{styleId:'arcade',diceId:'jade'}),false);
 }finally{store.db.close();}
});
