'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync,backup}=require('node:sqlite'),{integrity}=require('../backup-set.cjs');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function snapshot({rooms,telegram,output}){
 process.umask(0o077);if(fs.existsSync(output))throw Error('Snapshot destination must be new');fs.mkdirSync(output,{recursive:true,mode:0o700});const files=[];
 for(const [name,source]of Object.entries({rooms,telegram})){if(!fs.lstatSync(source).isFile())throw Error('Regular source database required');const db=new DatabaseSync(source,{readOnly:true}),target=path.join(output,name+'.sqlite');try{await backup(db,target);}finally{db.close();}integrity(target);files.push({name,sha256:hash(target)});}
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({version:1,consistency:'Independent online snapshots. Quiesce both writers for a coordinated recovery point.',files},null,2),{mode:0o600});return output;
}
function restore({snapshot:folder,destination}){
 const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));if(m.version!==1||m.files?.length!==2||['rooms','telegram'].some(n=>m.files.filter(f=>f.name===n).length!==1))throw Error('Invalid snapshot manifest');
 if(fs.existsSync(destination))throw Error('Restore destination must be new');for(const f of m.files){const source=path.join(folder,f.name+'.sqlite');if(!fs.lstatSync(source).isFile()||hash(source)!==f.sha256)throw Error('Snapshot checksum mismatch');integrity(source);}
 fs.mkdirSync(destination,{recursive:true,mode:0o700});for(const f of m.files)fs.copyFileSync(path.join(folder,f.name+'.sqlite'),path.join(destination,f.name+'.sqlite'),fs.constants.COPYFILE_EXCL);return destination;
}
if(require.main===module){const [op,...args]=process.argv.slice(2);const value=n=>args[args.indexOf(n)+1];Promise.resolve().then(()=>{if(op==='snapshot'&&['--rooms','--telegram','--out'].every(n=>args.includes(n)))return snapshot({rooms:value('--rooms'),telegram:value('--telegram'),output:value('--out')});if(op==='restore'&&args.length===2)return restore({snapshot:args[0],destination:args[1]});throw Error('Usage: snapshot --rooms DB --telegram DB --out NEW_DIR | restore SNAPSHOT NEW_DIR');}).then(()=>console.log('PASS: isolated snapshot/restore; existing destinations never overwritten.')).catch(()=>{console.error('Snapshot/restore failed. Inspect privately.');process.exitCode=1;});}
module.exports={snapshot,restore};
