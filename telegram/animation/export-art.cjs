'use strict';
// Encode approved-reference raster artwork. Input PNG paths remain private to the workspace.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),{createHash}=require('node:crypto');
const inputs=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),assets=path.resolve(__dirname,'../assets');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function crop(image){
 const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width,height}=info,seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let left=width,top=height,right=-1,bottom=-1;
 for(let start=0;start<seen.length;start++){if(seen[start]||data[start*4+3]<8)continue;let head=0,tail=1,count=0,x0=width,y0=height,x1=0,y1=0;queue[0]=start;seen[start]=1;while(head<tail){const pixel=queue[head++],x=pixel%width,y=Math.floor(pixel/width);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const next of [x>0?pixel-1:-1,x+1<width?pixel+1:-1,y>0?pixel-width:-1,y+1<height?pixel+width:-1])if(next>=0&&!seen[next]&&data[next*4+3]>=8){seen[next]=1;queue[tail++]=next;}}if(count>=64){left=Math.min(left,x0);right=Math.max(right,x1);top=Math.min(top,y0);bottom=Math.max(bottom,y1);}}
 if(right<left)throw Error('Empty character');left=Math.max(0,left-4);top=Math.max(0,top-4);right=Math.min(width-1,right+4);bottom=Math.min(height-1,bottom+4);return sharp(image).extract({left,top,width:right-left+1,height:bottom-top+1}).toBuffer();
}
(async()=>{const report=[];fs.mkdirSync(path.join(assets,'premium-v2'),{recursive:true});for(const [id,files]of Object.entries(inputs)){
 const base=await sharp(files.base).trim().toBuffer();await sharp(base).resize(384,576,{fit:'contain',background:'#00000000'}).webp({quality:90,alphaQuality:100}).toFile(path.join(assets,id+'.webp'));
 const meta=await sharp(base).metadata();await sharp(base).extract({left:0,top:0,width:meta.width,height:Math.min(meta.height,Math.round(meta.height*.6))}).resize(512,512,{fit:'contain',background:'#00000000'}).webp({quality:90,alphaQuality:100}).toFile(path.join(assets,id+'-portrait.webp'));
 await sharp(base).extract({left:0,top:0,width:meta.width,height:Math.round(meta.height*.6)}).resize(1024,1024,{fit:'contain',background:'#00000000'}).webp({quality:94,alphaQuality:100}).toFile(path.join(assets,'premium-v2',id+'-portrait-large.webp'));
 const sheet=await sharp(files.emotions).metadata(),w=Math.floor(sheet.width/2),h=Math.floor(sheet.height/2);for(const [index,state]of ['joy','failure','win','loss'].entries()){
  const region=await sharp(files.emotions).extract({left:index%2*w,top:Math.floor(index/2)*h,width:w,height:h}).png().toBuffer();await sharp(await crop(region)).resize(384,576,{fit:'contain',background:'#00000000'}).webp({quality:91,alphaQuality:100}).toFile(path.join(assets,'premium-v2',id+'-'+state+'.webp'));
 }
 report.push({id,baseSha256:digest(files.base),emotionSheetSha256:digest(files.emotions),sheet:{width:sheet.width,height:sheet.height}});console.log('Prepared approved character:',id);
 }fs.writeFileSync(path.join(assets,'character-source-report.json'),JSON.stringify({renderer:'Canvas 2D; raster sprites and independent effect layers',characters:report},null,2));})().catch(error=>{console.error(error);process.exitCode=1;});
