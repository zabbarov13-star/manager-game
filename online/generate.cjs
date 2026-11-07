const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(value => value.includes('async function handleRooms('));
const end = script?.indexOf('\nconst $=id=>document.getElementById(id),money=');
if (!(end > 0)) throw Error('Game engine boundary changed');
const engine = script.slice(0, end) + '\nmodule.exports={handleRooms,CHARACTERS,COLORS};})();\n';

let html = source;
function replace(from, to) {
  if (html.split(from).length !== 2) throw Error('Client anchor changed: ' + from);
  html = html.replace(from, () => to);
}
const entrances = (process.env.ROOM_ENTRANCES ?? '').split(',').map(value => value.trim()).filter(Boolean).map(value => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value) throw Error('Use HTTPS origins for ROOM_ENTRANCES');
  return url.origin;
});
if (entrances.length > 2) throw Error('Configure at most two backup HTTPS entrances');
const transport = fs.readFileSync(path.join(__dirname, 'entrances.cjs'), 'utf8')
  .replace('module.exports = { roomFetch };', '');
replace('<title>Менеджер — Назад в прошлое · 0.19.0</title>',
  '<title>Менеджер — Назад в прошлое · тест онлайн</title>');
replace('Автономная версия <b>0.19.0</b>', 'Тест онлайн <b>0.19</b>');
replace('class RoomTransport{', transport + '\nconst roomEntrances=' +
  JSON.stringify(entrances) + ';\nclass RoomTransport{');
replace("session?.code?.startsWith('mgr-')||!session?'p2p':'server'", "session?.code?.startsWith('mgr-')?'p2p':'server'");
replace("if(fragment.get('room')?.startsWith('mgr-'))networkKind.value='p2p';",
  "if(fragment.get('room'))networkKind.value=fragment.get('room').startsWith('mgr-')?'p2p':'server';");
replace("networkKind.value==='p2p'?p2p.fetch(path,options):fetch(path,options)",
  "networkKind.value==='p2p'?p2p.fetch(path,options):roomFetch(path,options,roomEntrances)");
replace("header.after(field('Способ подключения',networkKind),p2pHelp,advanced,recovery);",
  "const legacy=el('details');legacy.append(el('summary','Диагностика и прежние комнаты'),field('Способ подключения',networkKind),p2pHelp,advanced,recovery);header.after(legacy);");
replace('Независимый игровой сервер · прежний режим', 'Игровой сервер');
replace('Выбран прежний серверный режим.', 'Выбран игровой сервер.');
replace("ensureWeb();remember(await api('join',{name:name.value,...appearance,invite:invitation.value.trim()},{code:enteredCode()}));",
  "ensureWeb();const credentials={code:enteredCode()},invite=invitation.value.trim();const preview=await api('lobby',{invite},credentials);releaseChoices(preview.seats);remember(await api('join',{name:name.value,...appearance,invite},credentials));");

replace('1800*2**Math.min(failures,4)', '(1800+Math.random()*500)*2**Math.min(failures,4)');
if (process.env.ROOM_SHARED_HOST === '1') {
  replace('setInterval(poll,1800);', 'setInterval(poll,3000);');
}

const out = path.join(__dirname, 'dist');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'engine.cjs'), engine);
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const name of ['manifest.webmanifest','manager-icon.png']) {
  fs.copyFileSync(path.join(root, name), path.join(out, name));
}
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const version = require('node:crypto').createHash('sha256').update(html).update(sw).digest('hex').slice(0,16);
fs.writeFileSync(path.join(out, 'sw.js'), sw.replace(/const cacheName = prefix \+ '[^']+';/,
  "const cacheName = prefix + '" + version + "';"));
