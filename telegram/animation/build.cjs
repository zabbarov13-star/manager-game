'use strict';
const fs=require('node:fs'),path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const registry=require('../catalog.cjs').characters.map(c=>({...c,theme:c.theme??'classic'}));
function bundle(){const source=fs.readFileSync(path.join(__dirname,'core.ts'),'utf8');const js=stripTypeScriptTypes(source,{mode:'strip'}).replace(/^export /gm,'').replace(/[ \t]+$/gm,'');
 return `;(()=>{\n${js}\nglobalThis.ManagerAnimationCore={validateAnimationEvent,AnimationEventDispatcher,priorities,durations,snapshot,deriveGameEvents,captureRoom};\nglobalThis.ManagerAnimationRegistry=${JSON.stringify(registry)};\n})();\n`;
}
function authority(replace){
 replace('function recordTransition(room){(room.transitions??=[]).push({revision:room.gameRevision,rolls:room.game.rolls,dice:room.game.lastDice,effects:structuredClone(room.effects)});',
  'function recordTransition(room){let animation;try{animation=globalThis.ManagerAnimationCore.captureRoom(room,globalThis.ManagerAnimationRegistry);}catch{}(room.transitions??=[]).push({revision:room.gameRevision,rolls:room.game.rolls,dice:room.game.lastDice,effects:structuredClone(room.effects),animation});');
 replace("room.game.gameMode='online';room.gameRevision++;resetRoomClock(room,now);changed=true;", "room.game.gameMode='online';room.gameRevision++;recordTransition(room);resetRoomClock(room,now);changed=true;");
 replace('transitions:room.transitions??[],serverNow:now', 'transitions:room.transitions??[],animation:room.telegramAnimationState?.envelope,serverNow:now');
 replace('({id,name,character,color,ready,lastSeen})=>({id,name,character,color,ready,online:', '({id,name,character,cosmeticCharacter,color,ready,lastSeen})=>({id,name,character,cosmeticCharacter,color,ready,online:');
}
function cosmetics(html){
 const parsed="assertRoom(body&&typeof body==='object'&&!Array.isArray(body),'Некорректный запрос.');";
 if(!html.includes(parsed))throw Error('Verified room body anchor changed.');
 html=html.replace(parsed,parsed+"if(request.headers.has('X-Manager-Verified-Cosmetic'))body.telegramCharacterVerified=request.headers.get('X-Manager-Verified-Cosmetic')==='1';");
 const source='character:body.character,color,ready';
 const count=html.split(source).length-1;if(count!==2)throw Error('Cosmetic seat anchors changed: '+count);
 const binding='body.telegramCharacterVerified===true&&globalThis.ManagerAnimationRegistry.some(c=>c.id===body.telegramCharacterId)?body.telegramCharacterId:undefined';
 html=html.replaceAll(source,`character:body.character,cosmeticCharacter:${binding},color,ready`);
 const anchor='seat.character=body.character;seat.color=body.color;';if(!html.includes(anchor))throw Error('Appearance anchor changed');
 return html.replace(anchor,`seat.character=body.character;seat.cosmeticCharacter=${binding};seat.color=body.color;`);
}
module.exports={bundle,authority,cosmetics};
