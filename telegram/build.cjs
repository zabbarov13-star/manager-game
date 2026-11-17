'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'dist');
fs.mkdirSync(out,{recursive:true});
// Run the unchanged release builder with LF-normalized text and an isolated output directory.
// Git's Windows checkout uses CRLF; the release builder uses exact LF anchors.
const original=path.join(root,'online/dist');
const remap=p=>typeof p==='string'&&p.startsWith(original)?out+p.slice(original.length):p;
const shim={...fs,readFileSync(p,...args){const value=fs.readFileSync(remap(p),...args);return typeof value==='string'?value.replace(/\r\n/g,'\n'):value;},
 writeFileSync:(p,...args)=>fs.writeFileSync(remap(p),...args),mkdirSync:(p,...args)=>fs.mkdirSync(remap(p),...args),copyFileSync:(a,b,...args)=>fs.copyFileSync(a,remap(b),...args)};
const filename=path.join(root,'online/generate.cjs'),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
const req=mod.require.bind(mod);mod.require=name=>name==='node:fs'?shim:req(name);mod._compile(fs.readFileSync(filename,'utf8'),filename);
let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
function replace(a,b){if(!html.includes(a))throw Error('Telegram integration anchor missing: '+a.slice(0,100));html=html.replace(a,()=>b);}
replace('if ("serviceWorker" in navigator && window.isSecureContext) {','if (false) {');
replace("session?.code?.startsWith('mgr-')?'p2p':'server'", "session?.code?.startsWith('mgr-')||!session?'p2p':'server'");
replace('<head>','<head><script src="https://telegram.org/js/telegram-web-app.js"></script>');
replace('</head>','<link rel="stylesheet" href="/telegram.css"></head>');
replace("let storage;try{storage=localStorage;}catch{storage=null;}","let storage;try{storage=window.ManagerTelegram.storage;}catch{storage=null;}");
replace('function avatarSVG(id,color){','function avatarSVG(id,color){const art=window.ManagerTelegram?.art(id,true);if(art)return art;');
replace('function figureSVG(id,color){','function figureSVG(id,color){const art=window.ManagerTelegram?.art(id,false);if(art)return art;');
replace('characters:CHARACTERS.map(c=>','characters:window.ManagerTelegram.choices(CHARACTERS).map(c=>');
replace('let appearance={character:CHARACTERS[0].id,color:COLORS[0].id};','let appearance=window.ManagerTelegram.initialAppearance(CHARACTERS,COLORS);');
replace("b.onclick=()=>{state.settings.uiTheme=theme.id;", "b.onclick=()=>{if(!window.ManagerTelegram.canUse('style:'+theme.id)){window.ManagerTelegram.open('shop');return;}state.settings.uiTheme=theme.id;");
replace('state.settings.uiTheme=theme.id;settingsUI();persist();','state.settings.uiTheme=theme.id;settingsUI();persist();window.ManagerTelegram.saveStyle(theme.id);');
replace('function render(){if(!s)return;', 'function render(){if(!s)return;window.ManagerTelegram.react(s);');
replace('const a=appearanceState(settings);body.dataset.theme=a.theme;', "const a=appearanceState(settings);if(!window.ManagerTelegram.canUse('style:'+a.theme)){a.theme='heritage';settings.uiTheme='heritage';}body.dataset.theme=a.theme;");
replace("$('party-start').onclick=()=>{try{const config=", "$('party-start').onclick=()=>{try{window.ManagerTelegram.validateSetup();const config=");
replace("s=createMatch(config,{rulesProfile:$('party-profile').value});", "s=createMatch(config,{rulesProfile:$('party-profile').value});window.ManagerTelegram.pinMatch();");
replace("if(partyUI.active)partyUI.render();else if(state.phase==='event')showEvent();", "window.ManagerTelegram.attach({CHARACTERS,avatarSVG,figureSVG,settings:state.settings,apply:()=>{settingsUI();persist();partyUI?.render();},save:()=>persist(),suspend:()=>sound.suspend()});if(partyUI.active)partyUI.render();else if(state.phase==='event')showEvent();");
// Load original scripts only after Telegram identity and account-scoped storage are ready.
const scripts=[];html=html.replace(/<script>([\s\S]*?)<\/script>/g,(_,code)=>{scripts.push(code);return '';});
// Diagnostics is a separate script and remains available, behind the original interface.
html=html.replace(/<script id="manager-p2p-diagnostics">([\s\S]*?)<\/script>/g,(_,code)=>{scripts.push(code);return '';});
fs.writeFileSync(path.join(out,'game.js'),scripts.join('\n'));
replace('</body>','<div id="telegram-loading" role="status">Проверяем вход через Telegram…</div><script src="/client.js"></script></body>');
fs.writeFileSync(path.join(out,'index.html'),html);
for(const name of ['client.js','telegram.css'])fs.copyFileSync(path.join(__dirname,name),path.join(out,name));
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
for(const name of fs.readdirSync(path.join(__dirname,'assets')))if(/\.webp$/.test(name))fs.copyFileSync(path.join(__dirname,'assets',name),path.join(out,'assets',name));
fs.writeFileSync(path.join(out,'BUILD.json'),JSON.stringify({baseline:'v0.19.1',commit:'ffa7f151874648ddf159c8a321827a4abe75ae00',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex'),generatedAt:new Date().toISOString()},null,2));
console.log('Telegram build ready:',out);
