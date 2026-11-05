"""Run actual installed iPhone/iPad simulator apps; no claim about physical devices."""
from pathlib import Path
import subprocess,json,time,sys
out=Path('mobile/out');out.mkdir(exist_ok=True)
app=Path('mobile/derived/Build/Products/Debug-iphonesimulator/Manager.app').resolve()
def cmd(*args):return subprocess.check_output(args,text=True,stderr=subprocess.STDOUT)
items=json.loads(cmd('xcrun','simctl','list','devices','available','--json'))['devices']
chosen=[]
for family in ['iPhone','iPad']:
 options=[d for runtime,devices in items.items() if 'iOS' in runtime for d in devices if d.get('isAvailable') and d['name'].startswith(family)]
 if not options:raise SystemExit('No '+family+' simulator runtime available on runner')
 chosen.append((family,options[0]))
report=[]
for family,d in chosen:
 udid=d['udid'];subprocess.run(['xcrun','simctl','boot',udid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 subprocess.run(['xcrun','simctl','bootstatus',udid,'-b'],check=True,timeout=300)
 cmd('xcrun','simctl','install',udid,str(app));cmd('xcrun','simctl','launch',udid,'ru.manager.backtothepast','-manager-smoke')
 container=Path(cmd('xcrun','simctl','get_app_container',udid,'ru.manager.backtothepast','data').strip());probe=container/'Library/Caches/manager-smoke.json'
 deadline=time.monotonic()+120
 while not probe.exists() and time.monotonic()<deadline:time.sleep(2)
 cmd('xcrun','simctl','io',udid,'screenshot',str(out/(family+'-portrait.png')))
 if not probe.exists():
  marker=container/'Library/Caches/manager-start.json'
  raise SystemExit(family+' WebView completion missing; native-start='+str(marker.exists()))
 data=json.loads(probe.read_text());(out/(family+'-probe.json')).write_text(json.dumps(data,indent=2))
 if data.get('storage')!='persisted' or not data.get('native') or data.get('buttons',0)<5:raise SystemExit(family+' WebView probe failed: '+str(data))
 log=cmd('xcrun','simctl','spawn',udid,'log','show','--last','3m','--style','compact','--predicate','eventMessage CONTAINS "MANAGER_SMOKE"')
 (out/(family+'-smoke.log')).write_text(log)
 # Unified simulator logs can omit NSLog; the native sandbox JSON is authoritative.
 cmd('xcrun','simctl','io',udid,'screenshot',str(out/(family+'-portrait.png')))
 cmd('xcrun','simctl','terminate',udid,'ru.manager.backtothepast');probe.unlink()
 cmd('xcrun','simctl','launch',udid,'ru.manager.backtothepast','-manager-smoke')
 deadline=time.monotonic()+90
 while not probe.exists() and time.monotonic()<deadline:time.sleep(2)
 if not probe.exists():raise SystemExit(family+' relaunch WebView result missing')
 restored=json.loads(probe.read_text());(out/(family+'-relaunch-probe.json')).write_text(json.dumps(restored,indent=2))
 if restored.get('previous')!='persisted':raise SystemExit(family+' persistence did not survive relaunch')
 log2=cmd('xcrun','simctl','spawn',udid,'log','show','--last','1m','--style','compact','--predicate','eventMessage CONTAINS "MANAGER_SMOKE"')
 (out/(family+'-relaunch.log')).write_text(log2)
 
 report.append({'family':family,'device':d['name'],'installed':True,'launched':True,'webSmoke':True,'physicalDevice':False})
 subprocess.run(['xcrun','simctl','shutdown',udid],check=True)
(out/'ios-simulator-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
