"""Explicit one-time release identity creation. Never called by the APK builder."""
from pathlib import Path
import argparse,os,secrets,subprocess,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,required=True);a=p.parse_args()
d=a.directory.resolve();d.mkdir(parents=True,exist_ok=True);d.chmod(0o700)
key=d/'manager-release.p12';password=d/'password.txt';cert=d/'certificate.der'
if any(x.exists() for x in [key,password,cert]):raise SystemExit('Refusing to replace an existing signing identity')
password.write_text(secrets.token_urlsafe(48));password.chmod(0o600)
java=Path(os.environ.get('JAVA_HOME','/usr/lib/jvm/java-21-openjdk-amd64'))
subprocess.run([str(java/'bin/keytool'),'-genkeypair','-keystore',str(key),'-storetype','PKCS12','-storepass:file',str(password),'-keypass:file',str(password),'-alias','manager-release','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Manager Back to Past Release, O=Manager Project, C=RU'],check=True)
key.chmod(0o600)
subprocess.run([str(java/'bin/keytool'),'-exportcert','-keystore',str(key),'-storepass:file',str(password),'-alias','manager-release','-file',str(cert)],check=True)
identity={'alias':'manager-release','certificateSha256':hashlib.sha256(cert.read_bytes()).hexdigest(),'applicationId':'ru.manager.backtothepast','algorithm':'RSA-3072'}
(d/'identity.json').write_text(json.dumps(identity,indent=2))
print(json.dumps(identity))
