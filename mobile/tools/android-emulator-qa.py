from pathlib import Path
import subprocess,os,time,json,sys
r=Path(__file__).resolve().parents[3];sdk=r/'toolchains/android-sdk';out=r/'mobile-release/mobile/tests/android-runtime';out.mkdir(exist_ok=True)
env=os.environ.copy();env.update(ANDROID_AVD_HOME=str(r/'toolchains/avd'),ANDROID_USER_HOME=str(r/'toolchains/android-user'),ANDROID_EMULATOR_HOME=str(r/'toolchains/android-user'),ANDROID_SDK_ROOT=str(sdk),ANDROID_I_WANT_MY_TCG='yes',ANDROID_ADB_SERVER_PORT='36155',TMPDIR=str(r/'toolchains/emulator-temp'))
adb=[str(sdk/'platform-tools/adb'),'-P','36155'];serial='127.0.0.1:38617'
def run(*args,timeout=30,check=True):return subprocess.run(adb+['-s',serial]+list(args),env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout,check=check)
log=(out/'emulator.log').open('w');emu=subprocess.Popen([str(sdk/'emulator/emulator'),'-avd','Manager35','-ports','5554,38617','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader','-accel','off','-memory','2560','-cores','2','-no-metrics'],env=env,stdout=log,stderr=subprocess.STDOUT)
report={'hardwareAcceleration':False,'physicalDevice':False,'installed':False,'launched':False,'offline':False}
try:
 subprocess.run(adb+['start-server'],env=env,check=True,timeout=30)
 boot=False
 for step in range(60):
  if emu.poll() is not None:raise RuntimeError('Emulator exited: '+str(emu.returncode))
  subprocess.run(adb+['connect',serial],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
  probe=run('shell','getprop','sys.boot_completed',timeout=10,check=False)
  if probe.stdout.strip()==b'1':boot=True;break
  print('Waiting for Android boot: '+str(step*10)+'s',flush=True);time.sleep(10)
 if not boot:raise RuntimeError('Software-only emulator boot timeout; no installation claim')
 report['androidVersion']=run('shell','getprop','ro.build.version.release').stdout.decode().strip()
 print('Android booted',flush=True)
 run('shell','settings','put','global','airplane_mode_on','1');run('shell','svc','wifi','disable');run('shell','svc','data','disable',check=False)
 apk=r/'release-files/Manager-Android.apk';result=run('install','-r',str(apk),timeout=180);(out/'installation.log').write_bytes(result.stdout);assert b'Success' in result.stdout;report['installed']=True
 run('shell','input','keyevent','82',check=False)
 result=run('shell','am','start','-W','-n','ru.manager.backtothepast.personal/ru.manager.backtothepast.MainActivity',timeout=180);(out/'launch.log').write_bytes(result.stdout);assert b'Error:' not in result.stdout;report['launched']=True
 time.sleep(30)
 (out/'portrait.png').write_bytes(run('exec-out','screencap','-p',timeout=60).stdout)
 logs=run('logcat','-d','-s','ManagerWeb:I','AndroidRuntime:E','chromium:E',timeout=60).stdout;(out/'logcat.log').write_bytes(logs)
 state=run('shell','dumpsys','activity','activities',timeout=60).stdout;(out/'activity.txt').write_bytes(state)
 assert b'ru.manager.backtothepast.personal' in state
 report['offline']=True
 run('shell','settings','put','system','accelerometer_rotation','0');run('shell','settings','put','system','user_rotation','1');time.sleep(8);(out/'landscape.png').write_bytes(run('exec-out','screencap','-p',timeout=60).stdout)
 run('shell','am','force-stop','ru.manager.backtothepast.personal');run('shell','am','start','-W','-n','ru.manager.backtothepast.personal/ru.manager.backtothepast.MainActivity',timeout=180);report['relaunch']=True
 print(json.dumps(report),flush=True)
except Exception as e:
 report['error']=str(e);print(json.dumps(report),flush=True);raise
finally:
 (out/'results.json').write_text(json.dumps(report,indent=2)+'\n')
 emu.terminate()
 try:emu.wait(timeout=15)
 except subprocess.TimeoutExpired:emu.kill()
 subprocess.run(adb+['kill-server'],env=env,check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);log.close()
