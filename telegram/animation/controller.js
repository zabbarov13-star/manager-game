/* Confirmed-state adapter and local visibility lifecycle. No animation is awaited by game actions. */
(() => {
  'use strict';
  const Core=window.ManagerAnimationCore;
  class CharacterAnimationController {
    constructor({catalog,storage,getSelected}){
      this.catalog=catalog;this.storage=storage;this.getSelected=getSelected;this.renderers=new Map();this.bindings={};this.engineBindings=new Map();this.idleTimers=new Map();this.spawnedContexts=new Set();this.meta=null;this.network=false;this.view=null;
      try{this.meta=JSON.parse(storage.getItem('animation-local.v1'));}catch{}
      this.dispatcher=new Core.AnimationEventDispatcher({registry:catalog.characters.map(c=>({...c,theme:c.theme??'classic'})),context:{gameId:'unbound',players:{}},render:(event,signal)=>this.render(event,signal)});
      this.active=true;this.lastEvents=new Map();this.onVisibility=()=>this.setActive(!document.hidden&&document.body.dataset.tgActive!=='false');
      this.onActivity=event=>this.setActive(event.detail===true&&!document.hidden);
      document.addEventListener('visibilitychange',this.onVisibility);document.addEventListener('manager:activity',this.onActivity);
    }
    setActive(active){this.active=active;if(!active){this.dispatcher.cancelAll();this.stopIdle();}else{this.startIdle();for(const [id,event]of this.lastEvents)if(this.dispatcher.terminal.has(id)){const record=this.renderers.get(id);record?.renderer.load().then(()=>{if(this.active&&this.renderers.get(id)===record)record.renderer.renderFrame(event,1);}).catch(()=>{});}}}
    definition(id){return this.catalog.characters.find(c=>c.id===id);}
    characterForEngineId(id){return this.definition(this.engineBindings.get(id));}
    ensureView(){
      if(this.view)return;
      this.view=document.createElement('section');this.view.className='tg-character-feedback';this.view.setAttribute('aria-label','Анимации персонажей');
      (document.querySelector('.sidebar')??document.body).append(this.view);
    }
    context(gameId,state,bindings){
      if(gameId!==this.dispatcher.context.gameId)this.lastEvents.clear();
      this.bindings=bindings;this.engineBindings.clear();
      for(const player of state.players){const id=bindings[player.id]??player.character;this.engineBindings.set(player.character,id);}
      this.dispatcher.setContext({gameId,players:bindings,propertyIds:Object.keys(state.properties).map(Number)});
      this.mountPlayers(state);
    }
    mountPlayers(state){
      this.ensureView();const live=new Set();
      for(const player of state.players){const character=this.definition(this.bindings[player.id]);if(!character||character.free)continue;live.add(player.id);
        let record=this.renderers.get(player.id);
        if(record?.characterId!==character.id){record?.renderer.cancel();record?.element.remove();clearTimeout(this.idleTimers.get(player.id));this.idleTimers.delete(player.id);this.renderers.delete(player.id);record=null;}
        if(!record){const element=document.createElement('article'),name=document.createElement('strong'),caption=document.createElement('small'),canvas=document.createElement('canvas');
          name.textContent=player.name+' · '+character.name;caption.textContent='Ожидание';element.append(name,canvas,caption);this.view.append(element);
          const renderer=new window.ManagerCharacterAnimation.CharacterCanvasRenderer(canvas,character);record={characterId:character.id,element,caption,renderer};this.renderers.set(player.id,record);
          renderer.load().then(()=>{if(this.renderers.get(player.id)!==record)return;renderer.renderFrame(this.localEvent('character.idle',player.id),.5);}).catch(()=>{caption.textContent='Изображение временно недоступно';});
        }
        this.spawn(player.id);
      }
      for(const [id,record]of this.renderers)if(!live.has(id)){record.renderer.cancel();record.element.remove();this.renderers.delete(id);clearTimeout(this.idleTimers.get(id));this.idleTimers.delete(id);}
      this.view.hidden=this.renderers.size===0;
      this.startIdle();
    }
    localEvent(type,playerId){return {schemaVersion:1,eventId:'ui:'+crypto.randomUUID(),gameId:this.dispatcher.context.gameId,playerId,characterId:this.bindings[playerId],type,source:'local-ui',occurredAt:Date.now()};}
    spawn(playerId){const key=this.dispatcher.context.gameId+'|'+playerId+'|'+this.bindings[playerId];if(this.spawnedContexts.has(key))return;this.spawnedContexts.add(key);if(this.spawnedContexts.size>256)this.spawnedContexts.delete(this.spawnedContexts.values().next().value);this.dispatcher.dispatchLocal(this.localEvent('character.spawn',playerId));}
    stopIdle(){for(const timer of this.idleTimers.values())clearTimeout(timer);this.idleTimers.clear();}
    startIdle(){
      if(document.hidden||!this.active)return;
      for(const [playerId,record]of this.renderers)if(!this.idleTimers.has(playerId)&&!this.dispatcher.terminal.has(playerId)){
        const tick=()=>{this.idleTimers.delete(playerId);if(document.hidden||!this.active||!record.element.isConnected||this.dispatcher.terminal.has(playerId))return;
          if(!this.dispatcher.active.has(playerId))this.dispatcher.dispatchLocal(this.localEvent('character.idle',playerId));
          this.scheduleIdle(playerId,tick);
        };this.scheduleIdle(playerId,tick);
      }
    }
    scheduleIdle(playerId,tick){this.idleTimers.set(playerId,setTimeout(tick,3000+Math.random()*3000));}
    async render(event,signal){
      this.lastEvents.set(event.playerId,event);
      if(document.hidden||!this.active)return;
      const record=this.renderers.get(event.playerId);if(!record)return;
      record.caption.textContent=window.ManagerCharacterAnimation.labels[event.type];
      const character=this.definition(event.characterId),pose=window.ManagerCharacterAnimation.poseFor(event.type);
      if(character)document.querySelectorAll(`svg[data-tg-premium="${character.id}"] image[data-tg-body]`).forEach(image=>image.setAttribute('href',character.poses[pose]));
      await record.renderer.play(event,signal);
      if(this.renderers.get(event.playerId)===record){clearTimeout(this.idleTimers.get(event.playerId));this.idleTimers.delete(event.playerId);this.startIdle();}
    }
    ownBindings(state){const selected=this.getSelected();return Object.fromEntries(state.players.map((player,index)=>[player.id,index===0&&selected?selected.id:player.character]));}
    saveMeta(){try{this.storage.setItem('animation-local.v1',JSON.stringify(this.meta));}catch{}}
    beginLocal(state){
      this.network=false;this.hasLocalBaseline=true;this.dispatcher.cancelAll();this.stopIdle();
      this.meta={gameId:'local:'+crypto.randomUUID(),revision:0,snapshot:null,throughSequence:-1};
      this.context(this.meta.gameId,state,this.ownBindings(state));this.commitLocal(state);
    }
    restoreLocal(state){
      this.network=false;this.hasLocalBaseline=true;this.dispatcher.cancelAll();this.stopIdle();
      this.meta={gameId:'local:'+crypto.randomUUID(),revision:0,snapshot:Core.snapshot(state),throughSequence:0};
      this.context(this.meta.gameId,state,this.ownBindings(state));this.dispatcher.resume(this.meta.gameId,0);this.saveMeta();
    }
    syncState(state){
      if(state.gameMode==='online')return;
      if(!this.meta?.gameId)this.meta={gameId:'local:'+crypto.randomUUID(),revision:0,snapshot:Core.snapshot(state),throughSequence:0};
      // Restoring a save establishes a baseline, never a replay from stale local metadata.
      if(!this.hasLocalBaseline){this.meta.snapshot=Core.snapshot(state);this.hasLocalBaseline=true;}
      this.network=false;this.context(this.meta.gameId,state,this.ownBindings(state));
      if(!this.meta.snapshot)this.meta.snapshot=Core.snapshot(state);
      this.dispatcher.resume(this.meta.gameId,this.meta.throughSequence);this.saveMeta();
    }
    commitLocal(state){
      if(this.network||state.gameMode==='online')return;
      if(!this.meta?.gameId){this.syncState(state);return;}
      this.context(this.meta.gameId,state,this.ownBindings(state));
      const events=Core.deriveGameEvents(this.meta.snapshot,state,this.dispatcher.context,++this.meta.revision,Date.now());
      this.meta.snapshot=Core.snapshot(state);
      for(const event of events)this.dispatcher.dispatchGame(event);
      this.meta.throughSequence=this.meta.revision*128+Math.max(0,events.length-1);this.saveMeta();
    }
    acceptNetwork(state,room){
      this.network=true;
      const envelope=room.animation;
      if(!envelope||envelope.schemaVersion!==1||envelope.revision!==room.gameRevision||typeof envelope.gameId!=='string'||!envelope.players||typeof envelope.players!=='object'||!Number.isSafeInteger(envelope.throughSequence)){
        this.dispatcher.cancelAll();this.stopIdle();this.engineBindings.clear();
        for(const record of this.renderers.values()){record.renderer.cancel();record.element.remove();}this.renderers.clear();if(this.view)this.view.hidden=true;return;
      }
      const bindings=Object.fromEntries(state.players.map(player=>[player.id,envelope.players[player.id]??player.character]));
      this.context(envelope.gameId,state,bindings);
      const transitions=room.newTransitions??[];
      if(room.animationReset||!transitions.length){this.dispatcher.resume(envelope.gameId,envelope.throughSequence);return;}
      for(const transition of transitions){const payload=transition.animation;
        if(payload?.schemaVersion!==1||payload.gameId!==envelope.gameId||payload.revision!==transition.revision||!Array.isArray(payload.events))continue;
        for(const event of payload.events??[])this.dispatcher.dispatchGame(event);
      }
    }
    destroy(){document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('manager:activity',this.onActivity);this.stopIdle();this.dispatcher.cancelAll();for(const record of this.renderers.values())record.renderer.cancel();this.renderers.clear();this.view?.remove();}
  }
  window.CharacterAnimationController=CharacterAnimationController;
})();
