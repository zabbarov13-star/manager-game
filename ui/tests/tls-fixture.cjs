'use strict';
// Dedicated disposable localhost certificate; never reads or rewrites telegram/.env.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
module.exports=function createTLS(){
 const parent=path.resolve(__dirname,'../../telegram/data/qa-fixtures');fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const folder=fs.mkdtempSync(path.join(parent,'tls-'));
 const windows='C:/Program Files/Git/usr/bin/openssl.exe',openssl=process.env.OPENSSL_BIN||(process.platform==='win32'&&fs.existsSync(windows)?windows:'openssl');
 cp.execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',path.join(folder,'localhost-key.pem'),'-out',path.join(folder,'localhost-cert.pem')],{stdio:'ignore'});
 fs.chmodSync(path.join(folder,'localhost-key.pem'),0o600);return folder;
};
