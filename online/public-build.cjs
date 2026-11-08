// These changes apply to the generated server edition, leaving the released HTML intact.
function engineAndClient(replace) {
  replace('id:\'p\'+i,name:String(p.name', "id:p.seatId??'p'+i,name:String(p.name");
  replace("kind:'human'})),{rulesProfile:room.rulesProfile", "kind:'human',seatId:p.id})),{rulesProfile:room.rulesProfile");
  replace("assertRoom(ROOM_POLICY.publicEnabled,", "assertRoom(env.publicEnabled||ROOM_POLICY.publicEnabled,");
  replace("assertRoom(mode!=='public'||ROOM_POLICY.publicEnabled", "assertRoom(mode!=='public'||env.publicEnabled||ROOM_POLICY.publicEnabled");
  replace("room.mode!=='public'||ROOM_POLICY.publicEnabled", "room.mode!=='public'||env.publicEnabled||ROOM_POLICY.publicEnabled");
  replace("WHERE json_extract(data, '$.mode') = 'public' AND json_extract(data, '$.game') IS NULL ORDER BY updated_at DESC LIMIT 20", "WHERE json_extract(data, '$.mode') = 'public' AND json_extract(data, '$.game') IS NULL AND json_array_length(data, '$.seats') BETWEEN 1 AND json_extract(data, '$.capacity')-1 AND updated_at >= ? ORDER BY updated_at DESC LIMIT 20");
  replace('LIMIT 20").all();return roomJSON', 'LIMIT 20").bind(now-45000).all();return roomJSON');
  replace('return {code:r.code,count:r.seats.length,capacity:r.capacity};', "return {code:r.code,title:r.title??'Стол '+r.code,count:r.seats.length,capacity:r.capacity};");
  replace('room={code:c,mode,rulesProfile:', "room={code:c,mode,title:typeof body.title==='string'?(body.title.trim().slice(0,40)||'Стол '+c):'Стол '+c,rulesProfile:");
  replace('const room=JSON.parse(row.data);let migrated=false;', "const room=JSON.parse(row.data);assertRoom(room.seats.length,'Комната закрыта.',410);let migrated=false;");
  replace("if(invite)invite.used=true;newToken=roomToken();seat={id:'p'+room.seats.length,", "assertRoom(!env.publicEnabled||!room.seats.some(p=>p.name.toLowerCase()===cleanRoomName(body.name).toLowerCase()),'Это имя уже занято.',409);if(invite)invite.used=true;newToken=roomToken();seat={id:Array.from({length:6},(_,i)=>'p'+i).find(id=>!room.seats.some(p=>p.id===id)),");
  replace("  else if(request.method==='POST'&&op==='appearance')", "  else if(request.method==='POST'&&op==='leave'){assertRoom(!room.game,'Место в начатой партии сохраняется.',409);room.seats=seat.id===room.hostId?[]:room.seats.filter(p=>p.id!==seat.id);changed=true;}\n  else if(request.method==='POST'&&op==='appearance')");
  replace("body=raw?JSON.parse(raw):{};}", "body=raw?JSON.parse(raw):{};assertRoom(body&&typeof body==='object'&&!Array.isArray(body),'Некорректный запрос.');}");
}
function interfaceOnly(replace) {
  replace('Публичная · после тестирования', 'Открытая · в общем списке');
  replace("o.disabled=value==='public';mode.append(o);", "mode.append(o);");
  replace("const createFields=el('div',null,'online-fields');", "const roomTitle=el('input');roomTitle.maxLength=40;roomTitle.placeholder='Например, Вечерняя партия';const createFields=el('div',null,'online-fields');");
  replace("field('Тип комнаты',mode),field('Мест за столом'", "field('Тип комнаты',mode),field('Название комнаты',roomTitle),field('Мест за столом'");
  replace("...appearance,mode:mode.value,capacity:", "...appearance,mode:mode.value,title:roomTitle.value,capacity:");
  replace("entryActions.append(create,lookup,join);entrance.append(entranceTabs,identity,createFields,joinFields,picker.element,entryActions,el('p','Публичные комнаты и подбор соперников откроются после совместного тестирования.','module-note'));", `const directory=el('section',null,'online-fields');
 directory.setAttribute('aria-label','Открытые комнаты');
 async function enterPublic(table){
  if(!name.value.trim()){name.focus();throw Error('Введите имя для входа в комнату.');}
  const credentials={code:table.code};
  const details=await api('lobby',{},credentials);
  releaseChoices(details.seats);
  remember(await api('join',{name:name.value,...appearance},credentials));
 }
 async function showDirectory(quick){
  ensureWeb();
  if(networkKind.value!=='server')throw Error('Список доступен для новых серверных комнат.');
  if(quick&&!name.value.trim()){name.focus();throw Error('Введите имя для поиска игры.');}
  const {rooms}=await api('',undefined,{code:'PUBLIC'});
  directory.replaceChildren();
  if(quick&&rooms.length){await enterPublic(rooms[0]);return;}
  if(!rooms.length){directory.append(el('p','Свободных открытых комнат сейчас нет. Можно создать свою или повторить поиск.'));return;}
  for(const table of rooms)directory.append(button(table.title+' · '+table.count+'/'+table.capacity+' · свободно '+(table.capacity-table.count),()=>run(()=>enterPublic(table))));
 }
 const leaveLobby=button('Освободить место',()=>run(async()=>{
  await api('leave',{});
  stopOnline();session=null;
  try{storage?.removeItem('manager.online.v1');}catch{}
  onExit();entryMode('create');
 }));
 entryActions.append(create,lookup,join,button('Открытые комнаты',()=>run(()=>showDirectory(false))),button('Найти игру',()=>run(()=>showDirectory(true))));
 entrance.append(entranceTabs,identity,createFields,joinFields,picker.element,entryActions,directory);
 `);
  replace("if(!model.started){\n   actions.append", "if(!model.started){\n   if(networkKind.value==='server')actions.append(leaveLobby);\n   actions.append");
  replace("const heading=el('h2','Онлайн с друзьями · общий стол')", "const heading=el('h2','Играть онлайн')");
  replace("dialog.append(header,description,status,lobby,editor,entrance,alternate);document.body.append(dialog);",
    "dialog.append(header,description,status,lobby,editor,entrance,alternate);document.body.append(dialog);document.getElementById('settings-open').before(button('Играть онлайн',()=>open()));");
}
module.exports = { engineAndClient, interfaceOnly };
