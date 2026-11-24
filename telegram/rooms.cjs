'use strict';
// Standalone/test mode uses the same generic extension hook as the shared server.
function createRooms(options){
 const {createExtension}=require('./shared/room-extension.cjs');
 const extension=createExtension({handleRooms:require('./dist/engine.cjs').handleRooms,verifyBatch:async checks=>checks.map(c=>!!options.verifyCosmetic?.(c.ticket,c.characterId,{styleId:c.styleId,diceId:c.diceId})),strict:false});
 return require('../online/server.cjs').createRoomServer({...options,extension});
}
module.exports={createRooms};
