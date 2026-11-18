'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{DatabaseSync,backup}=require('node:sqlite');
const names=['telegram.sqlite','rooms.sqlite'];
function hash(file){const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024),fd=fs.openSync(file,'r');try{let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)digest.update(buffer.subarray(0,count));return digest.digest('hex');}finally{fs.closeSync(fd);}}
function integrity(file){const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLite integrity check failed.');}finally{db.close();}}
async function backupSet({dataDirectory,backupDirectory}){
 process.umask(0o077);const data=path.resolve(dataDirectory),output=path.resolve(backupDirectory);for(const name of names)if(!fs.statSync(path.join(data,name)).isFile())throw Error('Both databases must exist.');
 fs.mkdirSync(output,{recursive:true});const folder=fs.mkdtempSync(path.join(output,'snapshot-')),files=[];
 for(const name of names){const source=new DatabaseSync(path.join(data,name),{readOnly:true});try{await backup(source,path.join(folder,name));}finally{source.close();}integrity(path.join(folder,name));files.push({name,sha256:hash(path.join(folder,name))});}
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),consistency:'Independent SQLite online snapshots; stop writes for a coordinated release rollback point.',files},null,2),{mode:0o600});return folder;
}
function restoreSet({snapshotDirectory,destinationDirectory}){
 process.umask(0o077);const snapshot=path.resolve(snapshotDirectory),destination=path.resolve(destinationDirectory);
 if(fs.existsSync(destination))throw Error('Restore destination must not exist; existing data is never overwritten.');
 const manifest=JSON.parse(fs.readFileSync(path.join(snapshot,'manifest.json'),'utf8'));
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.files)||manifest.files.length!==2||names.some(name=>manifest.files.filter(f=>f.name===name).length!==1))throw Error('Invalid snapshot manifest.');
 for(const f of manifest.files){const file=path.join(snapshot,f.name);if(hash(file)!==f.sha256)throw Error('Snapshot checksum mismatch.');integrity(file);}
 fs.mkdirSync(destination,{recursive:true});for(const name of names)fs.copyFileSync(path.join(snapshot,name),path.join(destination,name),fs.constants.COPYFILE_EXCL);
 for(const name of names)integrity(path.join(destination,name));fs.writeFileSync(path.join(destination,'RESTORE.json'),JSON.stringify({schemaVersion:1,restoredAt:new Date().toISOString(),snapshotCreatedAt:manifest.createdAt},null,2),{mode:0o600});return destination;
}
if(require.main===module){const [op,input,output]=process.argv.slice(2);Promise.resolve().then(()=>{if(!input||!output)throw Error('Usage: backup-set.cjs snapshot DATA_DIR BACKUP_DIR | restore SNAPSHOT_DIR NEW_DATA_DIR');return op==='snapshot'?backupSet({dataDirectory:input,backupDirectory:output}):op==='restore'?restoreSet({snapshotDirectory:input,destinationDirectory:output}):Promise.reject(Error('Unknown operation.'));}).then(()=>console.log('PASS: verified '+op+'; no existing database overwritten.')).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={backupSet,restoreSet,integrity};
