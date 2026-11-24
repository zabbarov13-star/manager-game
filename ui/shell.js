/* Shared presentation only. Commands, entitlement checks and saves stay in the game. */
(()=>{'use strict';
const $=id=>document.getElementById(id);let bridge,pending=null,booted=false,tradeMenu,savedCamera=null;
const shell=window.ManagerShell={
 get inMenu(){return document.body.dataset.screen==='menu';},
 boot(){if(booted)return;booted=true;
  if(window.ManagerAndroid||window.ManagerNative)document.querySelectorAll('.menu-game-card').forEach(a=>a.target='_self');
  document.addEventListener('click',e=>{const b=e.target.closest('[data-menu]');if(b){e.preventDefault();action(b.dataset.menu);}});
 },
 mount(value){document.body.prepend(document.querySelector('.topbar'));bridge=value;tradeMenu=$('trade-menu');document.body.classList.add('modern-ui');try{const value=JSON.parse(bridge.storage?.getItem('manager.camera.v1'));if(value&&Number.isFinite(value.zoom)&&value.zoom>=.5&&value.zoom<=2.5&&['left','top'].every(k=>Number.isFinite(value[k])&&value[k]>=0))savedCamera=value;}catch{}window.addEventListener('pagehide',saveCamera);const menu=document.createElement('button');menu.type='button';menu.className='icon-button menu-open';menu.dataset.menu='home';menu.textContent='Меню';document.querySelector('.header-actions').prepend(menu);
  $('rules-open').textContent='▤';$('rules-open').setAttribute('aria-label','Все правила игры');
  const tab=document.createElement('button');Object.assign(tab,{id:'tab-game',type:'button',textContent:'Игра'});tab.dataset.tab='game';tab.setAttribute('role','tab');tab.setAttribute('aria-controls','panel-game');tab.setAttribute('aria-selected','false');tab.onclick=()=>bridge.showTab('game');
  const panel=document.createElement('div');panel.id='panel-game';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-game');document.querySelector('.tabs').prepend(tab);$('panel-cell').before(panel);panel.append(document.querySelector('.turn-panel'));
  $('roll-button').append($('roll-button-label'));$('board-stage').append($('roll-button'));document.querySelector('.turn-tools').hidden=true;
  const chat=$('tab-chat');if(chat)$('tab-log').before(chat);
  document.querySelector('.page-footer')?.remove();const credits=document.querySelector('.asset-attribution');if(credits){credits.className='game-art-credit';$('rules-dialog').querySelector('form').append(credits);}for(const b of document.querySelectorAll('.header-actions>button'))if(b.textContent==='Играть онлайн')b.hidden=true;
  for(const d of [$('party-dialog'),$('online-dialog')])d?.addEventListener('close',()=>refresh());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&!shell.inMenu)home();});
  restLabel();refresh();bridge.showTab('game');$('menu-status').textContent='2–6 участников · ваши правила · ваш стиль';
  if(pending){const next=pending;pending=null;action(next);}
 },
 enterGame(){document.body.dataset.screen='game';document.dispatchEvent(new CustomEvent('manager:screen'));bridge?.resume();if(savedCamera){const value=savedCamera;savedCamera=null;requestAnimationFrame(()=>bridge.restoreCamera(value));}refresh();},
 beforeRender(){if(tradeMenu)document.querySelector('.turn-tools').append(tradeMenu);},
 afterRender(){const trade=tradeMenu,players=$('players-panel');if(trade&&players&&trade.parentNode!==players)players.append(trade);},
 drawConstruction(state){
  document.querySelectorAll('.tile-buildings,.tile-owner-name').forEach(e=>e.remove());
  const svg=(tag,attrs,text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;};
  for(const [id,prop]of Object.entries(state.properties)){if(prop.owner===null)continue;const inner=document.querySelector('.tile[data-id="'+id+'"] .tile-content'),owner=state.players.find(p=>p.id===prop.owner);if(!inner||!owner)continue;
   inner.append(svg('text',{x:40,y:8,'text-anchor':'middle','font-size':5.4,fill:'#fff',stroke:'#000','stroke-width':.25,'paint-order':'stroke',class:'tile-owner-name','pointer-events':'none'},owner.name.slice(0,13)));
   if(!prop.level)continue;const g=svg('g',{class:'tile-buildings','aria-label':prop.level===4?'Предприятие':prop.level+' филиала','pointer-events':'none'});g.append(svg('rect',{x:5,y:117,width:70,height:10,rx:2,fill:prop.level===4?'#164a40':'#17384b'}));g.append(svg('text',{x:40,y:124.5,'text-anchor':'middle','font-size':7,fill:'#fff'},prop.level===4?'ПРЕДПРИЯТИЕ':'ФИЛИАЛЫ '+prop.level+' / 3'));inner.append(g);
  }
 },
 decorateConstruction(host,level){const status=document.createElement('div');status.className='construction-status';status.setAttribute('aria-label','Фактическая застройка');for(let n=1;n<=4;n++){const e=document.createElement('span');e.textContent=n===4?'Предприятие':'Филиал '+n;const built=level===4?n===4:n<=level;e.setAttribute('aria-current',String(built));status.append(e);}host.append(status);host.querySelectorAll('.rent-table tr').forEach((row,i)=>row.dataset.built=String(i===level));},
 refresh
};
function restLabel(){const inner=document.querySelector('.tile[data-id="20"] .tile-content');if(!inner)return;const ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g'),bg=document.createElementNS(ns,'rect'),text=document.createElementNS(ns,'text');g.setAttribute('pointer-events','none');for(const [k,v]of Object.entries({x:18,y:106,width:104,height:22,rx:5,fill:'#fff7db',stroke:'#18384b'}))bg.setAttribute(k,v);for(const [k,v]of Object.entries({x:70,y:122,'text-anchor':'middle','font-family':'Arial,sans-serif','font-size':15,'font-weight':700,fill:'#17384b'}))text.setAttribute(k,v);text.textContent='ОТДЫХ';g.append(bg,text);inner.append(g);}
function refresh(){const b=document.querySelector('[data-menu=continue]');if(b)b.hidden=!bridge?.hasMatch();}
function saveCamera(){if(!bridge||shell.inMenu)return;try{bridge.storage?.setItem('manager.camera.v1',JSON.stringify(bridge.camera.snapshot()));}catch{}}
function home(){saveCamera();document.body.dataset.screen='menu';document.querySelector('.menu-actions').hidden=false;$('menu-play-options').hidden=true;refresh();document.querySelector('[data-menu=play]')?.focus();}
function action(id){
 if(id==='play'){document.querySelector('.menu-actions').hidden=true;$('menu-play-options').hidden=false;refresh();document.querySelector('[data-menu=new]').focus();return;}
 if(id==='back'){document.querySelector('.menu-actions').hidden=false;$('menu-play-options').hidden=true;return;}
 if(id==='home'){home();return;}
 if(!bridge){pending=id;$('menu-status').textContent='Подготавливаем игру и проверяем доступ. Раздел откроется автоматически.';return;}
 if(id==='continue'){if(bridge.hasMatch()){shell.enterGame();bridge.showTab('game');}return;}
 if(id==='explore'){shell.enterGame();bridge.showTab('game');return;}
 if(id==='new'){for(const d of document.querySelectorAll('dialog[open]'))d.close();bridge.openSetup();return;}
 if(id==='online'){bridge.openOnline();return;}
 if(id==='settings'||id==='rules'){for(const d of document.querySelectorAll('dialog[open]'))d.close();$(id+'-open').click();return;}
 if(id==='shop'){if(window.ManagerTelegram){window.ManagerTelegram.open('characters');}else $('platform-shop').showModal();return;}
 if(id==='more')$('more-games').showModal();
}
})();
