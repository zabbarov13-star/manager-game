export type LocalType = 'character.spawn' | 'character.idle';
export type GameType = 'turn.started' | 'dice.rolled' | 'property.purchased' | 'money.received' | 'money.lost' | 'game.won' | 'game.lost';
export type EventType = LocalType | GameType;
export interface CommonEvent {
  schemaVersion: 1; eventId: string; gameId: string; playerId: string;
  characterId: string; occurredAt: number;
}
export type LocalAnimationEvent = CommonEvent & {
  type: LocalType; source: 'local-ui'; sequence?: never;
  turnId?: never; propertyId?: never; diceValues?: never; amount?: never;
};
interface GameBase extends CommonEvent { source: 'game-engine'; sequence: number }
export type GameAnimationEvent = GameBase & (
  | {type:'turn.started'; turnId:number}
  | {type:'dice.rolled'; turnId:number; diceValues:[number,number]}
  | {type:'property.purchased'; turnId:number; propertyId:number}
  | {type:'money.received'|'money.lost'; amount:number; turnId?:number}
  | {type:'game.won'|'game.lost'}
);
export type AnimationEvent = LocalAnimationEvent | GameAnimationEvent;
export interface CharacterDefinition { id:string; baseId:string; free?:boolean; theme:string }
export interface AnimationContext { gameId:string; players:Record<string,string>; propertyIds?:number[] }
export type Validation = {ok:true;event:AnimationEvent}|{ok:false;reason:string};
export const priorities:Record<EventType,number> = {
  'character.spawn':20,'character.idle':10,'turn.started':30,'dice.rolled':40,
  'property.purchased':70,'money.received':50,'money.lost':50,'game.won':100,'game.lost':100,
};
export const durations:Record<EventType,number> = {
  'character.spawn':800,'character.idle':1600,'turn.started':650,'dice.rolled':800,
  'property.purchased':2000,'money.received':1000,'money.lost':1000,'game.won':2400,'game.lost':2400,
};
const commonKeys=['schemaVersion','eventId','gameId','playerId','characterId','type','source','occurredAt'];
const number=(value:unknown,min=0):value is number=>Number.isSafeInteger(value)&&Number(value)>=min;
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=240&&!/[\x00-\x1f]/.test(value);
export function validateAnimationEvent(value:unknown, context?:AnimationContext):Validation {
  if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false,reason:'event-object-required'};
  const event=value as Record<string,unknown>,type=event.type;
  if(event.schemaVersion!==1)return {ok:false,reason:'unsupported-schema'};
  if(typeof type!=='string'||!Object.hasOwn(priorities,type))return {ok:false,reason:'unknown-type'};
  for(const key of ['eventId','gameId','playerId','characterId'])if(!identifier(event[key]))return {ok:false,reason:'invalid-'+key};
  if(!number(event.occurredAt))return {ok:false,reason:'invalid-occurredAt'};
  const local=type==='character.spawn'||type==='character.idle';
  const allowed=[...commonKeys];
  if(local){if(event.source!=='local-ui')return {ok:false,reason:'local-source-required'};}
  else {
    if(event.source!=='game-engine'||!number(event.sequence))return {ok:false,reason:'game-sequence-required'};
    allowed.push('sequence');
    if(['turn.started','dice.rolled','property.purchased'].includes(type)){
      if(!number(event.turnId,1))return {ok:false,reason:'turn-required'};allowed.push('turnId');
    }
    if(type==='dice.rolled'){
      if(!Array.isArray(event.diceValues)||event.diceValues.length!==2||!event.diceValues.every(v=>number(v,1)&&v<=6))return {ok:false,reason:'invalid-dice'};
      allowed.push('diceValues');
    }
    if(type==='property.purchased'){
      if(!number(event.propertyId,1)||event.propertyId>39||context?.propertyIds&&!context.propertyIds.includes(event.propertyId))return {ok:false,reason:'invalid-property'};
      allowed.push('propertyId');
    }
    if(type==='money.received'||type==='money.lost'){
      if(!number(event.amount,1))return {ok:false,reason:'positive-amount-required'};allowed.push('amount');
      if(Object.hasOwn(event,'turnId')){if(!number(event.turnId,1))return {ok:false,reason:'invalid-turn'};allowed.push('turnId');}
    }
  }
  if(Object.keys(event).some(key=>!allowed.includes(key)))return {ok:false,reason:'unexpected-field'};
  if(context&&(event.gameId!==context.gameId||context.players[String(event.playerId)]!==event.characterId))return {ok:false,reason:'player-binding-mismatch'};
  return {ok:true,event:event as unknown as AnimationEvent};
}

type Render=(event:AnimationEvent,signal:AbortSignal)=>Promise<void>;
interface Active {event:AnimationEvent;controller:AbortController}
export class AnimationEventDispatcher {
  registry:Map<string,CharacterDefinition>; context:AnimationContext; render:Render;
  active=new Map<string,Active>(); queues=new Map<string,AnimationEvent[]>();
  seen=new Set<string>(); spawned=new Set<string>(); highWater=new Map<string,number>();
  terminal=new Set<string>();
  accepted:AnimationEvent[]=[]; rejected=0;
  constructor(options:{registry:CharacterDefinition[];context:AnimationContext;render:Render}) {
    this.registry=new Map(options.registry.map(c=>[c.id,c]));this.context=options.context;this.render=options.render;
  }
  setContext(context:AnimationContext){
    if(context.gameId!==this.context.gameId){this.cancelAll();this.spawned.clear();this.terminal.clear();}
    this.context=context;
  }
  resume(gameId:string,sequence:number){if(number(sequence))this.highWater.set(gameId,Math.max(sequence,this.highWater.get(gameId)??-1));}
  dispatchLocal(input:unknown):boolean{return this.dispatch(input,'local-ui');}
  dispatchGame(input:unknown):boolean{return this.dispatch(input,'game-engine');}
  dispatch(input:unknown,source:'local-ui'|'game-engine'):boolean {
    const result=validateAnimationEvent(input,this.context);
    if(!result.ok||result.event.source!==source){this.rejected++;return false;}
    const event=result.event;
    if(this.terminal.has(event.playerId)){this.rejected++;return false;}
    if(!this.registry.has(event.characterId)||this.seen.has(event.eventId)){this.rejected++;return false;}
    if(event.source==='game-engine'){
      if(event.sequence<=(this.highWater.get(event.gameId)??-1)){this.rejected++;return false;}
      this.highWater.set(event.gameId,event.sequence);
    } else if(event.type==='character.spawn'){
      const key=event.gameId+'|'+event.playerId+'|'+event.characterId;
      if(this.spawned.has(key)){this.rejected++;return false;}this.spawned.add(key);
    }
    this.seen.add(event.eventId);if(this.seen.size>4096)this.seen.delete(this.seen.values().next().value!);
    if(priorities[event.type]===100)this.terminal.add(event.playerId);
    this.accepted.push(event);if(this.accepted.length>256)this.accepted.shift();
    const previous=this.active.get(event.playerId);
    if(previous&&priorities[event.type]>priorities[previous.event.type]){
      previous.controller.abort();this.active.delete(event.playerId);
      if(priorities[event.type]===100)this.queues.delete(event.playerId);
      this.start(event);
    } else if(previous){const queue=this.queues.get(event.playerId)??[];queue.push(event);queue.sort((a,b)=>priorities[b.type]-priorities[a.type]);if(queue.length>8)queue.pop();this.queues.set(event.playerId,queue);}
    else this.start(event);
    return true;
  }
  start(event:AnimationEvent){
    const active={event,controller:new AbortController()};this.active.set(event.playerId,active);
    Promise.resolve().then(()=>this.render(event,active.controller.signal)).catch(()=>{}).finally(()=>{
      if(this.active.get(event.playerId)!==active)return;
      this.active.delete(event.playerId);const next=this.queues.get(event.playerId)?.shift();if(next)this.start(next);
    });
  }
  cancelAll(){for(const active of this.active.values())active.controller.abort();this.active.clear();this.queues.clear();}
}

interface Player {id:string;character:string;balance:number;out:boolean}
interface FinancialEntry {id:string;type:string;from:string;to:string;amount:number;status:string;turn?:number;time:string}
export interface ConfirmedState {
  turn:number;current:number;rolls:number;lastDice:number[]|null;phase:string;winner:string|null;
  players:Player[];properties:Record<string,{owner:string|null}>;
  finance?:{sequence:number;entries:FinancialEntry[]};
}
export interface StateSnapshot {
  turn:number;current:string;rolls:number;phase:string;winner:string|null;
  players:Record<string,{balance:number;out:boolean}>;owners:Record<string,string|null>;financeSequence:number;
}
export function snapshot(state:ConfirmedState):StateSnapshot {
  return {turn:state.turn,current:state.players[state.current]?.id,rolls:state.rolls,phase:state.phase,winner:state.winner,
    players:Object.fromEntries(state.players.map(p=>[p.id,{balance:p.balance,out:p.out}])),
    owners:Object.fromEntries(Object.entries(state.properties).map(([id,p])=>[id,p.owner])),financeSequence:state.finance?.sequence??0};
}
export function deriveGameEvents(previous:StateSnapshot|null,state:ConfirmedState,context:AnimationContext,revision:number,occurredAt:number):GameAnimationEvent[] {
  if(!number(revision)||revision>Math.floor(Number.MAX_SAFE_INTEGER/128)||!number(occurredAt))return [];
  const events:GameAnimationEvent[]=[];
  const emit=(playerId:string,payload:Record<string,unknown>)=>{
    const characterId=context.players[playerId];if(!characterId||events.length>=128)return;
    const sequence=revision*128+events.length;
    const candidate={schemaVersion:1,eventId:`${context.gameId}:animation:${sequence}`,gameId:context.gameId,playerId,characterId,source:'game-engine',sequence,occurredAt,...payload};
    const checked=validateAnimationEvent(candidate,context);if(checked.ok&&checked.event.source==='game-engine')events.push(checked.event);
  };
  if(!previous){if(state.phase==='ready'&&state.rolls===0&&state.turn===1)emit(state.players[state.current]?.id,{type:'turn.started',turnId:state.turn});return events;}
  if(state.rolls>previous.rolls&&Array.isArray(state.lastDice))emit(previous.current,{type:'dice.rolled',turnId:previous.turn,diceValues:state.lastDice});
  const purchases=new Set<string>();
  const entries=(state.finance?.entries??[]).filter(entry=>Number(entry.id.slice(1))>previous.financeSequence&&['paid','settled'].includes(entry.status)&&entry.amount>0);
  for(const [id,property]of Object.entries(state.properties)){
    if(previous.owners[id]===null&&property.owner&&entries.some(entry=>entry.from===property.owner&&['purchase','auction'].includes(entry.type))){
      emit(property.owner,{type:'property.purchased',turnId:state.turn,propertyId:Number(id)});purchases.add(property.owner);
    }
  }
  for(const entry of entries){
    const turn=number(entry.turn,1)?{turnId:entry.turn}:{};
    if(context.players[entry.to])emit(entry.to,{type:'money.received',amount:entry.amount,...turn});
    if(context.players[entry.from]&&!(purchases.has(entry.from)&&['purchase','auction'].includes(entry.type)))emit(entry.from,{type:'money.lost',amount:entry.amount,...turn});
  }
  if(state.turn!==previous.turn||state.players[state.current]?.id!==previous.current)emit(state.players[state.current]?.id,{type:'turn.started',turnId:state.turn});
  for(const player of state.players)if(player.out&&!previous.players[player.id]?.out)emit(player.id,{type:'game.lost'});
  if(state.phase==='over'&&previous.phase!=='over'&&state.winner&&context.players[state.winner]){
    emit(state.winner,{type:'game.won'});
    for(const player of state.players)if(player.id!==state.winner&&!player.out&&!previous.players[player.id]?.out)emit(player.id,{type:'game.lost'});
  }
  return events;
}

export function captureRoom(room:any,registry:CharacterDefinition[],occurredAt=Date.now()) {
  if(!room.game||!number(room.gameRevision)||!identifier(room.code)||!number(room.createdAt))return undefined;
  const known=new Set(registry.map(c=>c.id));
  const players=Object.fromEntries(room.game.players.map((player:Player)=>{
    const seat=room.seats.find((seat:any)=>seat.id===player.id);
    return [player.id,known.has(seat?.cosmeticCharacter)?seat.cosmeticCharacter:player.character];
  }));
  const context:AnimationContext={gameId:`game:${room.code}:${room.createdAt}`,players,propertyIds:Object.keys(room.game.properties).map(Number)};
  const prior=room.telegramAnimationState;
  if(prior?.revision===room.gameRevision)return prior.envelope;
  const events=deriveGameEvents(prior?.snapshot??null,room.game,context,room.gameRevision,occurredAt);
  const envelope={schemaVersion:1,revision:room.gameRevision,gameId:context.gameId,players,events,throughSequence:room.gameRevision*128+Math.max(0,events.length-1)};
  room.telegramAnimationState={revision:room.gameRevision,snapshot:snapshot(room.game),envelope};
  return envelope;
}
