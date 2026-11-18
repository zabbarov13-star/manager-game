'use strict';
// Only prepares private local configuration; never calls Telegram or a hosting API.
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),env=path.join(root,'.env'),dir=path.join(root,'data/staging/tls');
process.umask(0o077);fs.mkdirSync(dir,{recursive:true});const key=path.join(dir,'localhost-key.pem'),cert=path.join(dir,'localhost-cert.pem');
if(!fs.existsSync(key)&&!fs.existsSync(cert)){
 const win='C:/Program Files/Git/usr/bin/openssl.exe',openssl=process.env.OPENSSL_BIN??(process.platform==='win32'&&fs.existsSync(win)?win:'openssl');
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','14','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore'});
}else if(!fs.existsSync(key)||!fs.existsSync(cert))throw Error('Incomplete TLS files; inspect privately. Nothing overwritten.');
let text=fs.existsSync(env)?fs.readFileSync(env,'utf8'):'';
const defaults={TELEGRAM_ENV:'test',PUBLIC_ORIGIN:'https://localhost:8443',TELEGRAM_DATABASE:'./data/staging/telegram.sqlite',BIND:'127.0.0.1',PORT:'8443',STARS_ENABLED:'0',ADS_VERIFIED_GATEWAY_ENABLED:'0',TELEGRAM_BOT_TOKEN:'',SUPPORT_CONTACT:'',TELEGRAM_WEBHOOK_SECRET:randomBytes(32).toString('hex'),ADS_RECEIPT_SECRET:randomBytes(32).toString('hex')};
for(const [name,value]of Object.entries(defaults))if(!new RegExp('^'+name+'=','m').test(text))text+=(text.endsWith('\n')?'':'\n')+name+'='+value+'\n';
fs.writeFileSync(env,text,{mode:0o600});console.log('Prepared isolated local HTTPS configuration. Secrets remain private; no bot changes.');
