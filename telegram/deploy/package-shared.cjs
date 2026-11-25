'use strict';
// Native runtime bundles, without tests, env, databases or a second room server.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),{generateFiles}=require('../shared/build.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'out');
function packageShared(){
 cp.execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{cwd:root,stdio:'pipe'});
 const commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),work=fs.mkdtempSync(path.join(out,'native-')),manifest={version:1,commit,runtimes:[]};
 for(const kind of ['rooms','adapter']){
  const dir=path.join(work,kind);fs.mkdirSync(dir);const copy=f=>{const dest=path.join(dir,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);};
  if(kind==='rooms'){
   for(const f of ['online/server.cjs','online/vps/backup.sh','telegram/shared/room-extension.cjs','telegram/shared/verification.cjs','telegram/shared/dist/engine.cjs'])copy(f);
   for(const [name,bytes]of generateFiles()){const dest=path.join(dir,'online/dist',name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
  }else{
   for(const f of ['telegram/server.cjs','telegram/poller.cjs','telegram/store.cjs','telegram/auth.cjs','telegram/catalog.cjs','telegram/entitlements.cjs','telegram/bot-api.cjs','telegram/shared/verification.cjs','telegram/shared/backup.cjs','telegram/backup-set.cjs'])copy(f);
   function assets(folder,relative='telegram/dist'){for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(e.name==='engine.cjs')continue;const target=path.join(relative,e.name);if(e.isDirectory())assets(path.join(folder,e.name),target);else copy(target);}}
   assets(path.join(root,'telegram/dist'));
  }
  fs.writeFileSync(path.join(dir,'RELEASE.json'),JSON.stringify({version:1,commit,kind,roomsEnabled:kind==='rooms'}));
  const file=`manager-${kind}-${commit}.tar`;cp.execFileSync('tar',['-cf',path.join(out,file),'-C',dir,'.']);manifest.runtimes.push({kind,file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')});
 }
 fs.writeFileSync(path.join(out,'shared-release.json'),JSON.stringify(manifest,null,2));console.log('Two native runtimes prepared. Adapter has no room engine; financial modules stay out of room runtime.');return manifest;
}
if(require.main===module)packageShared();module.exports={packageShared};
