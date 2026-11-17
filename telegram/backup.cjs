'use strict';
const {DatabaseSync,backup}=require('node:sqlite');
const {existsSync,mkdirSync}=require('node:fs');
const {resolve}=require('node:path');
(async()=>{process.umask(0o077);const source=process.env.TELEGRAM_DATABASE??resolve(__dirname,'data/telegram.sqlite'),dir=process.env.BACKUP_DIRECTORY;
 if(!dir||!existsSync(source))throw Error('Set BACKUP_DIRECTORY and TELEGRAM_DATABASE to an existing database.');
 mkdirSync(dir,{recursive:true});const output=resolve(dir,'telegram-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
 const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,output);}finally{db.close();}
 const check=new DatabaseSync(output,{readOnly:true});try{const result=check.prepare('PRAGMA integrity_check').get();if(result.integrity_check!=='ok')throw Error('Backup integrity check failed.');}finally{check.close();}
 console.log('Verified backup:',output);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
