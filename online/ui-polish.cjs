const fs = require('node:fs');
const path = require('node:path');

module.exports = function polish(replace) {
  const asset = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
  replace('</head>', '<style>\n' + asset('table-ui.css') + '\n</style>\n</head>');
  replace('<link rel="apple-touch-icon" href="./manager-icon.png">',
    '<link rel="apple-touch-icon" sizes="512x512" href="./manager-icon.png">\n<link rel="icon" sizes="32x32" type="image/png" href="data:image/png;base64,' +
    fs.readFileSync(path.join(__dirname, 'ui-icons', 'favicon.png')).toString('base64') + '">');
  replace('function mountOnline(', asset('table-ui.js') + '\nfunction mountOnline(');
  replace("chatKey='',appearanceDirty", "appearanceDirty");
  replace("lobbyKey='';chatKey='';browsing", "lobbyKey='';chatView.reset();browsing");
  replace("function renderChat(){tab.hidden=!active;const key=JSON.stringify(room?.chat??[]);if(key===chatKey)return;chatKey=key;messages.replaceChildren();for(const m of room?.chat??[]){const p=el('p'),who=el('strong',m.name+': ');p.append(who,document.createTextNode(m.text));messages.append(p);}}",
    "const chatView=mountChatView({tab,panel,messages});\n function renderChat(){tab.hidden=!active;chatView.render(room,session?.seatId);}");
  replace('<label class="range-row">Громкость эффектов', '<label class="toggle-row"><span>Звук уведомлений чата</span><input type="checkbox" id="chat-sound" checked></label><label class="range-row">Громкость эффектов');
  replace('<p>Два кубика. Сорок клеток.', '<p id="turn-description">Два кубика. Сорок клеток.');
  replace("document.querySelector('.turn-panel>p:not(.audio-hint)').textContent", "$('turn-description').textContent");
  replace('<div class="roll-summary"><span', '<div class="roll-summary"><div class="panel-dice" aria-hidden="true"><div class="die"></div><div class="die"></div></div><span');
  replace("<span class=\"roll-action-caption\" aria-hidden=\"true\">Бросить</span>", '');
  replace("$('roll-button').after($('roll-button-label'));", '');
  replace("$('roll-count').textContent='Ход '+s.turn;", "renderPanelDice(s.lastDice);$('roll-count').textContent='Ход '+s.turn;");
  replace("$('roll-count').textContent='Бросков: '+state.rolls;", "renderPanelDice(state.lastDice);$('roll-count').textContent='Бросков: '+state.rolls;");
  replace('dice:1900,diceHold:1050', 'dice:780,diceHold:500');
  const flicker = "let frame=0;const timer=short?null:setInterval(()=>{renderDice($('die-a'),(frame*3+1)%6+1);renderDice($('die-b'),(frame*5+2)%6+1);frame++;},87);";
  replace(flicker + 'await wait(short?170:PACE.dice);if(timer)clearInterval(timer);', 'await wait(short?170:PACE.dice);');
  replace(flicker + '\n await wait(short?170:PACE.dice);if(timer)clearInterval(timer);', 'await wait(short?170:PACE.dice);');
};
