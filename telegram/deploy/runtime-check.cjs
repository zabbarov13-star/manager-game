'use strict';
// Disposable image bootstrap: no real credentials, external network or payments.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
async function check(){
 assert.equal(Number(process.versions.node.split('.')[0]),24,'Node 24 required');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manager-image-'));
 const app=require('../server.cjs').createApp({botToken:'image-bootstrap-only',webhookSecret:'x'.repeat(32),origin:'https://bootstrap.invalid',database:path.join(dir,'telegram.sqlite'),ownerTelegramId:'',starsEnabled:false,gatewayEnabled:false});
 await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(0,'127.0.0.1',resolve);});
 try{const base='http://127.0.0.1:'+app.address().port,health=await fetch(base+'/health'),data=await health.json();assert.equal(health.status,200);assert.equal(data.service,'manager-telegram');assert.equal(data.starsConfigured,false);assert.equal(data.adsConfigured,false);for(const [route,expected]of [['/api/profile',401],['/',200]]){const r=await fetch(base+route);await r.arrayBuffer();assert.equal(r.status,expected);}}
 finally{await new Promise(resolve=>app.close(resolve));}
 const {DatabaseSync}=require('node:sqlite');for(const file of ['telegram.sqlite','rooms.sqlite']){const db=new DatabaseSync(path.join(dir,file),{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}}
 console.log('PASS: isolated Node 24 image, HTTP UI, unauthenticated access rejection and both SQLite databases. No provider calls.');
}
if(require.main===module)check().catch(()=>{console.error('Image bootstrap failed; details redacted.');process.exitCode=1;});
module.exports={check};
