/* Telegram-only presentation and commerce. Game rules and random sources remain in game.js. */
(()=>{
'use strict';
const tg=window.Telegram?.WebApp,loading=document.getElementById('telegram-loading');
let account,bridge,dialog,tab='characters',busy=false,offset=0,matchSkin=null,controller,lastBalance=null;
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,action)=>{const b=node('button',label);b.type='button';b.onclick=()=>run(action);return b;};
async function api(path,data){const r=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(account?{Authorization:'Bearer '+account.token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),cache:'no-store'});const value=await r.json();if(!r.ok)throw Error(value.error??'Ошибка связи с сервером.');return value;}
function sync(value){Object.assign(account,value);offset=account.serverTime-Date.now();if(bridge){bridge.settings.uiTheme=account.profile.style;bridge.apply();}cosmetics();}
const now=()=>Date.now()+offset;
const access=id=>account?.access[id]??{available:false,permanent:false,expires:0};
function canUse(id){const a=access(id);return a.permanent||a.expires>now();}
const character=()=>account.catalog.characters.find(c=>c.id===(matchSkin??account.profile.character));
function art(id,portrait){const c=character();if(!c||c.free||c.baseId!==id)return '';const src=portrait?c.portrait:c.sprite;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${portrait?'100 100':'80 120'}" aria-hidden="true"><image href="${src}" width="${portrait?'100':'80'}" height="${portrait?'100':'120'}" preserveAspectRatio="xMidYMid meet"/></svg>`;}
function scopedStorage(id){const prefix=`manager.telegram.v1.${id}.`;return {getItem:key=>localStorage.getItem(prefix+key),setItem:(key,value)=>localStorage.setItem(prefix+key,value),removeItem:key=>localStorage.removeItem(prefix+key)};}
const money=price=>price+' ⭐';
function remaining(id){const a=access(id);return a.permanent?'Навсегда':a.expires>now()?'Осталось '+Math.ceil((a.expires-now())/3600000)+' ч':'Заблокирован';}
function cosmetics(){document.body.dataset.tgDice=canUse('dice:jade')&&account.profile.dice==='jade'?'jade':'';document.body.dataset.tgEffect=canUse('effect:sparkle')&&account.profile.effect==='sparkle'?'sparkle':'';}
function status(message,error=false){const host=$('tg-message');if(host){host.textContent=message;host.dataset.error=String(error);}}
async function run(fn){if(busy)return;busy=true;dialog?.setAttribute('aria-busy','true');try{await fn();}catch(e){status(e.message,true);}finally{busy=false;dialog?.removeAttribute('aria-busy');}}
async function select(field,id){sync(await api('profile',{[field]:id}));render();status('Выбор сохранён.');}
function picture(c){const box=node('div',null,'tg-portrait tg-idle');if(c.free){box.innerHTML=bridge.avatarSVG(c.id);}else{const img=node('img');img.src=c.portrait;img.alt=c.name;img.loading='lazy';box.append(img);}return box;}
function actions(item,host){const owned=canUse(item.id),a=access(item.id);host.append(node('p',remaining(item.id),'tg-access'));
 if(owned){const field=item.id.split(':')[0],id=item.id.split(':')[1];host.append(button('Выбрать',()=>select(field,id)));}
 if(!a.permanent&&!item.free){const ad=button(owned?'Продлить на 24 часа':'Открыть на 24 часа',()=>watch(item.id));ad.disabled=!account.features.ads||account.ads.remaining===0||a.expires>=now()+72*3600000;host.append(ad);
  if(item.price){const buy=button('Навсегда · '+money(item.price),()=>purchase(item.id));host.append(buy);}}
}
function characterCard(c,details=false){const card=node('article',null,'tg-card');card.append(picture(c),node('small',c.collection),node('h3',c.name),node('p',c.role));
 if(details){card.append(node('p',c.bio),node('p',c.traits));const names=['Интеллект','Удача','Сила','Скорость','Харизма'];c.stats.forEach((value,i)=>{const row=node('label',names[i]+' · '+value+'/10','tg-stat'),meter=node('meter');meter.min=1;meter.max=10;meter.value=value;row.append(meter);card.append(row);});card.append(node('p','Характеристики декоративные: все игровые возможности одинаковы.','tg-note'));
  const animations=node('div',null,'tg-animation-controls');for(const [id,label]of [['idle','Ожидание'],['joy','Радость'],['failure','Неудача'],['win','Победа'],['loss','Поражение']])animations.append(button(label,()=>{card.querySelector('.tg-portrait').className='tg-portrait tg-'+id;}));card.append(animations);
 }else card.append(button('Биография и характеристики',()=>{renderDetail(c);}));
 actions(account.catalog.items.find(i=>i.id==='character:'+c.id),card);return card;
}
function renderDetail(c){const content=$('tg-content');content.replaceChildren(button('← Все персонажи',()=>render()),characterCard(c,true));}
function render(){if(!bridge||!dialog)return;dialog.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
 const host=$('tg-content');host.replaceChildren();const header=node('div',null,'tg-summary');
 const reset=Math.max(0,account.ads.resetAt-now()),h=Math.floor(reset/3600000),m=Math.floor(reset/60000)%60;
 header.append(node('strong',`Доступно просмотров: ${account.ads.remaining} из 3`),node('span',`Обновление через ${h} ч ${m} мин · 00:00 МСК`));host.append(header);
 if(!account.features.ads)host.append(node('p','Рекламные награды пока недоступны: ожидается подключение серверного подтверждения AdsGram.','tg-note'));
 if(account.ads.remaining===0)host.append(node('p','Сегодня все рекламные награды получены. Новые просмотры будут доступны завтра в 00:00 МСК.'));
 host.append(node('p','Косметика не влияет на кубики, очки и правила.','tg-note'));
 const grid=node('div',null,'tg-grid');host.append(grid);
 if(tab==='characters')for(const c of account.catalog.characters)grid.append(characterCard(c));
 else{
  const items=account.catalog.items.filter(i=>!i.free);
  if(tab==='rewards')host.insertBefore(node('p','Ежедневный подарок: выберите любую косметическую награду ниже. Один подтверждённый просмотр расходует общий лимит. Продление — ещё 24 часа, максимум 72 часа.'),grid);
  for(const item of items){if(item.kind==='character'){grid.append(characterCard(account.catalog.characters.find(c=>'character:'+c.id===item.id)));continue;}
   const card=node('article',null,'tg-card');card.append(node('h3',item.name));const preview=node('div',null,'tg-item-preview');preview.dataset.preview=item.id;preview.textContent=item.kind==='dice'?'⚄ ⚂':item.kind==='effect'?'Сияние':item.name;card.append(preview);actions(item,card);grid.append(card);}
  if(tab==='shop')for(const pack of account.catalog.packs){const card=node('article',null,'tg-card');card.append(node('h3',pack.name),node('p',pack.items.map(id=>account.catalog.items.find(i=>i.id===id).name).join(', ')),node('p','Только перечисленные предметы. Доступ навсегда.'));
   const overlap=pack.items.filter(id=>access(id).permanent);if(overlap.length)card.append(node('p','Уже куплено: '+overlap.map(id=>account.catalog.items.find(i=>i.id===id).name).join(', ')));
   const buy=button(money(pack.price),()=>purchase(pack.id));buy.disabled=overlap.length>0;card.append(buy);grid.append(card);}
 }
}
async function purchase(product){const info=account.catalog.products.find(p=>p.id===product);if(!info)throw Error('Товар не найден.');
 const names=info.items.map(id=>account.catalog.items.find(i=>i.id===id).name).join(', ');
 // User reviews exact contents and price before requesting the official invoice.
 const accepted=await new Promise(resolve=>tg.showPopup({title:info.name,message:names+' · навсегда · '+money(info.price),buttons:[{id:'buy',type:'default',text:'Перейти к оплате'},{id:'cancel',type:'cancel'}]},id=>resolve(id==='buy')));if(!accepted)return;
 const {invoice,orderId}=await api('invoice',{product});const result=await new Promise(resolve=>tg.openInvoice(invoice,resolve));
 if(result==='paid'||result==='pending'){status('Ожидаем серверное подтверждение оплаты…');for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,1200));sync(await api('profile'));if(info.items.every(id=>access(id).permanent))break;}}
 else{await api('invoice/cancel',{orderId});status(result==='cancelled'?'Оплата отменена.':'Оплата не завершена.');}render();
}
async function watch(item){if(!account.features.ads)throw Error('Рекламные награды ещё не подключены.');const intent=await api('ads/begin',{item});let watched=false;
 try{if(!window.Adsgram)await new Promise((resolve,reject)=>{const script=node('script');script.src='https://sad.adsgram.ai/js/sad.min.js';script.onload=resolve;script.onerror=()=>reject(Error('Не удалось загрузить рекламу.'));document.head.append(script);});
  controller??=window.Adsgram.init({blockId:account.features.blockId});await controller.show();watched=true;
  status('Проверяем просмотр на сервере…');const old=access(item).expires;
  for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,1500));sync(await api('profile'));if(access(item).expires!==old||access(item).permanent){render();status('Награда подтверждена.');return;}}
  throw Error('Подтверждение ещё не получено. Награда появится после проверки сервером.');
 }catch(e){if(!watched)await api('ads/cancel',{id:intent.id}).catch(()=>{});throw e;}
}
function open(value='characters'){tab=value;render();dialog.showModal();tg.BackButton?.show();refresh();}
function attach(value){bridge=value;bridge.settings.uiTheme=account.profile.style;
 dialog=node('dialog',null,'tg-dialog');dialog.setAttribute('aria-label','Персонажи, награды и магазин');const head=node('header'),title=node('h2','Коллекция «Менеджера»');head.append(title,button('Закрыть',()=>dialog.close()));
 const tabs=node('nav');tabs.setAttribute('aria-label','Разделы коллекции');for(const [id,label]of [['characters','Персонажи'],['rewards','Бесплатные награды'],['shop','Магазин']]){const b=button(label,()=>{tab=id;render();});b.dataset.tab=id;tabs.append(b);}
 const message=node('p');message.id='tg-message';message.setAttribute('role','status');const content=node('section');content.id='tg-content';dialog.append(head,tabs,message,content);document.body.append(dialog);
 const entry=node('nav',null,'tg-entry');entry.setAttribute('aria-label','Telegram коллекция');for(const [id,label]of [['characters','Персонажи'],['rewards','Бесплатные награды'],['shop','Магазин']])entry.append(button(label,()=>open(id)));document.querySelector('.topbar').after(entry);
 tg.BackButton?.onClick(()=>dialog.close());dialog.addEventListener('close',()=>tg.BackButton?.hide());
 bridge.apply();render();
 document.addEventListener('visibilitychange',()=>{if(document.hidden){bridge.save();bridge.suspend();}else refresh();});
 tg.onEvent?.('activated',refresh);tg.onEvent?.('deactivated',()=>{bridge.save();bridge.suspend();});
 setInterval(()=>{if(now()>=account.ads.resetAt)refresh();const theme='style:'+bridge.settings.uiTheme;if(!canUse(theme)){bridge.settings.uiTheme='heritage';bridge.apply();}cosmetics();},15000);
}
async function refresh(){try{sync(await api('profile'));if(dialog?.open)render();}catch(e){status(e.message,true);}}
function safeArea(){const a=tg.contentSafeAreaInset??{},b=tg.safeAreaInset??{};for(const edge of ['top','bottom','left','right'])document.documentElement.style.setProperty('--tg-inset-'+edge,Math.max(a[edge]??0,b[edge]??0)+'px');}
async function start(){try{
 if(!tg?.initData)throw Error('Для входа откройте «Менеджер» через кнопку приложения в Telegram-боте.');
 tg.ready();tg.expand();safeArea();tg.onEvent?.('safeAreaChanged',safeArea);tg.onEvent?.('contentSafeAreaChanged',safeArea);tg.onEvent?.('viewportChanged',safeArea);
 account=await api('session',{initData:tg.initData});offset=account.serverTime-Date.now();
 const storage=scopedStorage(account.user.id);try{matchSkin=JSON.parse(storage.getItem('cosmetic-match'))?.character??null;}catch{}
 window.ManagerTelegram={storage,art,canUse,open,attach,choices:all=>account.catalog.freeIds.map(id=>all.find(c=>c.id===id)),
  initialAppearance(all,colors){const selected=account.catalog.characters.find(c=>c.id===account.profile.character&&canUse('character:'+c.id)),c=all.find(c=>c.id===selected?.baseId)??all.find(c=>c.id==='cassette');return {character:c.id,color:c.color??colors[0].id};},
  saveStyle:id=>api('profile',{style:id}).then(sync).catch(e=>status(e.message,true)),
  react(state){const c=character(),p=state.players.find(p=>p.character===c?.baseId);if(!p)return;const mood=state.phase==='over'?(state.winner===p.id?'win':'loss'):p.out?'loss':lastBalance===null?'idle':p.balance>lastBalance?'joy':p.balance<lastBalance?'failure':'idle';lastBalance=p.balance;document.body.dataset.tgReaction=mood;},
  pinMatch(){matchSkin=account.profile.character;storage.setItem('cosmetic-match',JSON.stringify({character:matchSkin}));},
  releaseMatch(){matchSkin=null;storage.removeItem('cosmetic-match');},
  validateSetup(){if(!canUse('character:'+account.profile.character))throw Error('Доступ к персонажу закончился. Выберите доступного в разделе «Персонажи».');
   const c=account.catalog.characters.find(c=>c.id===account.profile.character),rows=[...document.querySelectorAll('.player-setup-row')],first=rows[0];if(first){const other=rows.slice(1).find(r=>r.dataset.character===c.baseId);if(other)other.dataset.character=first.dataset.character;first.dataset.character=c.baseId;}
  }};
 const script=node('script');script.src='/game.js';script.onload=()=>loading.remove();script.onerror=()=>{loading.textContent='Не удалось загрузить игру. Откройте приложение заново.';};document.body.append(script);
 }catch(e){loading.textContent=e.message;loading.append(button('Повторить',start));}}
start();
})();
