'use strict';
// Preserve local lossless captures; commit smaller review copies without changing their dimensions.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
(async()=>{
 const folder=path.join(__dirname,'screenshots');let count=0,bytes=0;
 for(const name of fs.readdirSync(folder).filter(name=>name.endsWith('.png'))){const target=path.join(folder,name.replace(/\.png$/,'.webp'));await sharp(path.join(folder,name)).webp({quality:90}).toFile(target);count++;bytes+=fs.statSync(target).size;}
 console.log(`Exported ${count} review screenshots (${bytes} bytes). Original PNGs retained locally.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
