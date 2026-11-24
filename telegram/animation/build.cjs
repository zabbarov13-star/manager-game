'use strict';
const fs=require('node:fs'),path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const registry=require('../catalog.cjs').characters.map(c=>({...c,theme:c.theme??'classic'}));
function bundle(){const source=fs.readFileSync(path.join(__dirname,'core.ts'),'utf8');const js=stripTypeScriptTypes(source,{mode:'strip'}).replace(/^export /gm,'').replace(/[ \t]+$/gm,'');
 return `;(()=>{\n${js}\nglobalThis.ManagerAnimationCore={validateAnimationEvent,AnimationEventDispatcher,priorities,durations,snapshot,deriveGameEvents,captureRoom};\nglobalThis.ManagerAnimationRegistry=${JSON.stringify(registry)};\n})();\n`;
}
function authority(replace){
 replace('function recordTransition(room){(room.transitions??=[]).push({actorId:room.game.players[room.game.current]?.id,revision:room.gameRevision,rolls:room.game.rolls,dice:room.game.lastDice,effects:structuredClone(room.effects)});',
  'function recordTransition(room){let animation;try{animation=globalThis.ManagerAnimationCore.captureRoom(room,globalThis.ManagerAnimationRegistry);}catch{}(room.transitions??=[]).push({actorId:room.game.players[room.game.current]?.id,revision:room.gameRevision,rolls:room.game.rolls,dice:room.game.lastDice,effects:structuredClone(room.effects),animation});');
 replace("room.game.gameMode='online';room.gameRevision++;resetRoomClock(room,now);changed=true;", "room.game.gameMode='online';room.gameRevision++;recordTransition(room);resetRoomClock(room,now);changed=true;");
 replace('transitions:room.transitions??[],serverNow:now', 'transitions:room.transitions??[],animation:room.telegramAnimationState?.envelope,serverNow:now');
 replace('({id,name,character,color,ready,lastSeen})=>({id,name,character,color,ready,online:', '({id,name,character,cosmeticCharacter,cosmeticStyle,cosmeticDice,color,ready,lastSeen})=>({id,name,character,cosmeticCharacter,cosmeticStyle,cosmeticDice,color,ready,online:');
}
function cosmetics(html){
 const parsed="assertRoom(body&&typeof body==='object'&&!Array.isArray(body),'Некорректный запрос.');";
 if(!html.includes(parsed))throw Error('Verified room body anchor changed.');
 html=html.replace(parsed,parsed+"if(request.headers.has('X-Manager-Verified-Cosmetic'))body.telegramCharacterVerified=request.headers.get('X-Manager-Verified-Cosmetic')==='1';");
 const source='character:body.character,color,ready';
 const count=html.split(source).length-1;if(count!==2)throw Error('Cosmetic seat anchors changed: '+count);
 const binding='body.telegramCharacterVerified===true&&globalThis.ManagerAnimationRegistry.some(c=>c.id===body.telegramCharacterId)?body.telegramCharacterId:undefined';
 html=html.replaceAll(source,`character:body.character,cosmeticCharacter:${binding},cosmeticStyle:body.telegramCharacterVerified===true?body.telegramStyleId:undefined,cosmeticDice:body.telegramCharacterVerified===true?body.telegramDiceId:undefined,cosmeticTicket:body.telegramCharacterVerified===true?body.telegramCosmeticTicket:undefined,color,ready`);
 const start='room.game=createMatch(room.seats.map';if(!html.includes(start))throw Error('Start cosmetic revalidation anchor changed.');
 html=html.replace(start,"await Promise.all(room.seats.map(async cosmeticSeat=>{if(cosmeticSeat.cosmeticCharacter&&(!env.verifyCosmetic||!await env.verifyCosmetic(cosmeticSeat.cosmeticTicket,cosmeticSeat.cosmeticCharacter,{styleId:cosmeticSeat.cosmeticStyle,diceId:cosmeticSeat.cosmeticDice}))){cosmeticSeat.cosmeticCharacter=undefined;cosmeticSeat.cosmeticTicket=undefined;cosmeticSeat.cosmeticStyle=undefined;cosmeticSeat.cosmeticDice=undefined;}}));"+start);
 const anchor='seat.character=body.character;seat.color=body.color;';if(!html.includes(anchor))throw Error('Appearance anchor changed');
 return html.replace(anchor,`seat.character=body.character;seat.cosmeticCharacter=${binding};seat.cosmeticStyle=body.telegramCharacterVerified===true?body.telegramStyleId:undefined;seat.cosmeticDice=body.telegramCharacterVerified===true?body.telegramDiceId:undefined;seat.cosmeticTicket=body.telegramCharacterVerified===true?body.telegramCosmeticTicket:undefined;seat.color=body.color;`);
}
module.exports={bundle,authority,cosmetics};
