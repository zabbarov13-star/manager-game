"""Keep the proven 0.18.3 rules/PeerServer; patch presentation and native integration only."""
from pathlib import Path
import re,hashlib,json
root=Path(__file__).resolve().parents[2];tools=root/'mobile/tools'
s=(root/'game-0.18.3.html').read_text()
def change(old,new,count=1):
 global s
 if s.count(old)!=count:raise SystemExit('Base game changed: '+old[:100])
 s=s.replace(old,new)
change("document.querySelector('.turn-panel').prepend(connection);","dialog.querySelector('.dialog-heading').after(connection);")
# Full clock text must never reveal the invitation token over the table.
s=re.sub(r" function clockUpdate\(\)\{[^\n]+", " function clockUpdate(){clock.hidden=!active||!room?.game;if(clock.hidden)return;if(connectionState!=='connected'){clock.textContent='Переподключение…';return;}const c=room.clock;if(!c){clock.hidden=true;return;}const now=Date.now()+((room.serverNow??lastReceived)-lastReceived),remaining=Math.max(0,Math.ceil((((c.paused?c.decisionDeadline:c.deadline)??now)-now)/1000));clock.textContent=(c.paused?'Решение: ':'До конца хода: ')+remaining+' с';}",s,count=1)
change("function open(){document.getElementById('settings-dialog')?.close();","function open(){if(window.ManagerNative?.openOnline){window.ManagerNative.openOnline();return;}window.ManagerNative?.enableNetwork?.();document.getElementById('settings-dialog')?.close();")
# A saved online session must not connect automatically when an offline app is opened.
s=s.replace("&&/^https?:$/.test(location.protocol)&&session?.code", "&&!window.ManagerNative&&/^https?:$/.test(location.protocol)&&session?.code")
# Remove floating legacy diagnostic window; connection details already include diagnostics.
scripts=list(re.finditer(r'<script>([\s\S]*?)</script>',s))
for m in reversed(scripts):
 if 'mgrDiagOpen' in m.group(1):s=s[:m.start()]+s[m.end():]
s=s.replace('0.18.3','0.19.0')
s=re.sub(r'<title>[^<]*</title>','<title>Менеджер — Назад в прошлое · 0.19.0</title>',s,count=1)
change("s=store.load()?.state??null;hand.hidden=true;","s=store.load()?.state??null;if(s){migrateCharacters(s);migrateRules(s);initFinance(s);}hand.hidden=true;")
s=s.replace("opts.host||'0.peerjs.com'","opts.host||'manager-peer-server.onrender.com'")
# Mobile safe area is applied by native view constraints/insets, without an address bar.
css='<style>html{overscroll-behavior:none}body{max-width:100%;margin:0}dialog{box-sizing:border-box;max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}.topbar{min-width:0}.header-actions{min-width:0}.board-viewport{touch-action:pan-x pan-y}.tab-panels{min-width:0}#mgrDiagOpen{display:none!important}</style>'
s=s.replace('</head>',css+'</head>')
s=s.replace('</body>','<script>'+(tools/'compact-room.js').read_text()+'</script></body>')
web=root/'mobile/web';web.mkdir(exist_ok=True);(web/'index.html').write_bytes(s.encode('utf-8'))
bootstrap='<script>'+(tools/'native-bootstrap.js').read_text()+'</script>'
csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data: blob:; connect-src https: wss: blob: data:; object-src 'none'; base-uri 'none'; frame-src 'none'"
native=s.replace('<head>','<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">'+bootstrap,1)
for path in ['mobile/android/assets/game.html','mobile/ios/Manager/game.html']:
 p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(native.encode('utf-8'))
(root/'mobile/ios/Manager/compact-room.js').write_bytes((tools/'compact-room.js').read_text().encode('utf-8'))
(root/'mobile/build-info.json').write_text(json.dumps({'version':'0.19.0','base':'0.18.3','baseSha256':hashlib.sha256((root/'game-0.18.3.html').read_bytes()).hexdigest(),'nativeSha256':hashlib.sha256(native.encode()).hexdigest(),'peerServer':{'host':'manager-peer-server.onrender.com','port':443,'secure':True,'path':'/peerjs','key':'peerjs'}},indent=2)+'\n')
print('Client prepared: '+str(len(native.encode()))+' bytes, all original resources embedded')
