"""Build a release APK with an explicit, pinned signing identity. Never create keys."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import argparse,subprocess,os,shutil,json,hashlib,tempfile,re,xml.etree.ElementTree as ET
p=argparse.ArgumentParser()
for name in ['sdk','html','output','keystore','password-file']:p.add_argument('--'+name,type=Path,required=True)
p.add_argument('--previous-apk',type=Path);p.add_argument('--version-code',type=int);p.add_argument('--version-name');a=p.parse_args()
r=Path(__file__).resolve().parent;release=json.loads((r/'release.json').read_text())
for path in [a.keystore,a.password_file,a.html]:
 if not path.is_file():raise SystemExit('Required build input not found: '+str(path))
tools=a.sdk/'build-tools/35.0.0';platform=a.sdk/'platforms/android-35/android.jar'
if not platform.is_file():raise SystemExit('Install Android SDK Platform 35')
env=os.environ.copy();java_home=Path(env.get('JAVA_HOME','/usr/lib/jvm/java-21-openjdk-amd64'));env['JAVA_HOME']=str(java_home);env['LD_LIBRARY_PATH']=str(tools/'lib64')+':'+str(java_home/'lib')+':'+str(java_home/'lib/server')+':'+env.get('LD_LIBRARY_PATH','')
java=java_home/'bin/java'
def run(*args):return subprocess.run([str(x) for x in args],check=True,env=env)
def output(*args):return subprocess.check_output([str(x) for x in args],env=env,text=True,stderr=subprocess.STDOUT)
for name in ['aapt2','zipalign','apksigner']:(tools/name).chmod(0o755)
with tempfile.TemporaryDirectory() as temp:
 cert=Path(temp)/'certificate.der'
 run(java_home/'bin/keytool','-exportcert','-keystore',a.keystore,'-storepass:file',a.password_file,'-alias',release['alias'],'-file',cert)
 fingerprint=hashlib.sha256(cert.read_bytes()).hexdigest()
 if fingerprint!=release['certificateSha256']:raise SystemExit('Wrong signing key: certificate does not match android/release.json')
ns='{http://schemas.android.com/apk/res/android}'
manifest=ET.parse(r/'AndroidManifest.xml');node=manifest.getroot()
version=a.version_code or int(node.get(ns+'versionCode'));name=a.version_name or node.get(ns+'versionName')
if version<release['versionCode']:raise SystemExit('Version code rollback refused')
if node.get('package')!=release['applicationId']:raise SystemExit('Application ID differs from pinned release identity')
def apk_metadata(path):
 text=output(tools/'aapt2','dump','badging',path)
 m=re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",text)
 if not m:raise SystemExit('Could not read APK identity')
 signatures=output(tools/'apksigner','verify','--verbose','--print-certs',path)
 c=re.search(r'Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]+)',signatures)
 if not c:raise SystemExit('Could not verify APK certificate')
 return {'applicationId':m[1],'versionCode':int(m[2]),'versionName':m[3],'certificateSha256':c[1].lower(),'signatureVerification':signatures}
if a.previous_apk:
 old=apk_metadata(a.previous_apk)
 if old['applicationId']!=release['applicationId'] or old['certificateSha256']!=fingerprint:raise SystemExit('Previous APK has another package/signature: not an in-place update')
 if old['versionCode']>=version:raise SystemExit('Update requires a strictly higher version code')
b=r/'build';b.mkdir(exist_ok=True)
for directory in ['classes','dex','assets']:
 target=b/directory
 if target.exists():shutil.rmtree(target)
 target.mkdir()
html=a.html.read_text()
if 'window.ManagerNative' not in html or "connect-src https: wss: blob: data:" not in html:raise SystemExit('Use the network-isolated HTML from native/build.py')
bridge="""<script>(function(){const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){const name=this.download;fetch(this.href).then(r=>r.blob()).then(async b=>ManagerAndroid.saveText(name,await b.text(),b.type)).catch(()=>alert('Не удалось сохранить файл'));return;}return click.call(this);};})();</script>"""
(b/'assets/game.html').write_text(html)
node.set(ns+'versionCode',str(version));node.set(ns+'versionName',name);ET.register_namespace('android',ns[1:-1]);manifest.write(b/'AndroidManifest.xml',encoding='utf-8',xml_declaration=True)
run(tools/'aapt2','compile','--dir',r/'res','-o',b/'res.zip')
run(tools/'aapt2','link','-o',b/'unsigned.apk','-I',platform,'--manifest',b/'AndroidManifest.xml','-A',b/'assets',b/'res.zip')
run(java,'-m','jdk.compiler/com.sun.tools.javac.Main','-source','8','-target','8','-encoding','UTF-8','-classpath',platform,'-d',b/'classes',*sorted((r/'src').rglob('*.java')))
run(java,'-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--min-api','26','--lib',platform,'--output',b/'dex',*sorted((b/'classes').rglob('*.class')))
with ZipFile(b/'unsigned.apk','a',ZIP_DEFLATED) as z:z.write(b/'dex/classes.dex','classes.dex')
run(tools/'zipalign','-f','-P','16','4',b/'unsigned.apk',b/'aligned.apk')
a.output.parent.mkdir(parents=True,exist_ok=True)
run(tools/'apksigner','sign','--ks',a.keystore,'--ks-key-alias',release['alias'],'--ks-pass','file:'+str(a.password_file),'--out',a.output,b/'aligned.apk')
run(tools/'zipalign','-c','-P','16','4',a.output)
metadata=apk_metadata(a.output)
if metadata['certificateSha256']!=fingerprint or metadata['versionCode']!=version:raise SystemExit('Final APK identity mismatch')
with ZipFile(a.output) as z:
 assert z.testzip() is None
 for f in ['AndroidManifest.xml','resources.arsc','classes.dex','assets/game.html']:assert f in z.namelist()
 assert z.read('assets/game.html').decode()==html
metadata.update({'apk':a.output.name,'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'bytes':a.output.stat().st_size,'offline':True,'physicalDeviceTested':False,'previousApkChecked':bool(a.previous_apk)})
a.output.with_suffix('.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in metadata.items() if k!='signatureVerification'}))
