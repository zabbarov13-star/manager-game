'use strict';
// Deterministic asset export only: trim alpha, split generated key-pose sheets, resize, encode WebP.
// All artwork and expression changes are generated with image_gen before this script is used.
// Usage: node prepare.cjs <private input-manifest.json>; input paths are never committed.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const sharp=require('sharp');
const catalog=require('../catalog.cjs').characters.filter(c=>!c.free);
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const assets=path.resolve(__dirname,'../assets'),output=path.join(assets,'premium-v2');
fs.mkdirSync(output,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');

// Choose a crop from substantial alpha components, excluding a few pixels bleeding
// over a generated atlas cell boundary. No pixels inside the chosen crop are painted
// or erased; the full character and sizeable detached accessories are preserved.
async function spriteCrop(image) {
 const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=info,seen=new Uint8Array(width*height),queue=new Int32Array(width*height);
 let left=width,top=height,right=-1,bottom=-1;
 for(let start=0;start<seen.length;start++){
  if(seen[start]||data[start*4+3]<8)continue;
  let head=0,tail=1,count=0,x0=width,y0=height,x1=0,y1=0;queue[0]=start;seen[start]=1;
  while(head<tail){const pixel=queue[head++],x=pixel%width,y=Math.floor(pixel/width);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const next of [x>0?pixel-1:-1,x+1<width?pixel+1:-1,y>0?pixel-width:-1,y+1<height?pixel+width:-1])if(next>=0&&!seen[next]&&data[next*4+3]>=8){seen[next]=1;queue[tail++]=next;}
  }
  if(count>=64){left=Math.min(left,x0);right=Math.max(right,x1);top=Math.min(top,y0);bottom=Math.max(bottom,y1);}
 }
 if(right<left)throw Error('Empty generated sprite cell.');
 left=Math.max(0,left-4);top=Math.max(0,top-4);right=Math.min(width-1,right+4);bottom=Math.min(height-1,bottom+4);
 return sharp(image).extract({left,top,width:right-left+1,height:bottom-top+1}).toBuffer();
}

(async()=>{
 const report=[];
 for(const c of catalog.filter(c=>!process.argv[3]||c.id===process.argv[3])){
  const files=input[c.id];if(!files?.base||!files?.portrait||!files?.expressions)throw Error('Missing generated artwork: '+c.id);
  const source=await sharp(files.base).trim().toBuffer();
  await sharp(source).resize(384,576,{fit:'contain',background:'#00000000'}).webp({quality:90,alphaQuality:100}).toFile(path.join(assets,c.id+'.webp'));
  const portrait=await sharp(files.portrait).trim().toBuffer();
  await sharp(portrait).resize({width:1024,height:1536,fit:'inside',withoutEnlargement:true}).webp({quality:93,alphaQuality:100}).toFile(path.join(output,c.id+'-portrait-large.webp'));
  await sharp(portrait).resize(512,512,{fit:'cover',position:'north'}).webp({quality:88,alphaQuality:100}).toFile(path.join(assets,c.id+'-portrait.webp'));
  const metadata=await sharp(files.expressions).metadata();if(!metadata.hasAlpha)throw Error('Sheet must have alpha: '+c.id);
  const halfWidth=Math.floor(metadata.width/2),halfHeight=Math.floor(metadata.height/2);
  for(const [index,state]of ['joy','failure','win','loss'].entries()){
   const extracted=await sharp(files.expressions).extract({left:index%2*halfWidth,top:Math.floor(index/2)*halfHeight,width:halfWidth,height:halfHeight}).png().toBuffer();
   const trimmed=await spriteCrop(extracted);
   await sharp(trimmed).resize(384,576,{fit:'contain',background:'#00000000'}).webp({quality:91,alphaQuality:100}).toFile(path.join(output,c.id+'-'+state+'.webp'));
  }
  report.push({id:c.id,sourceSha256:Object.fromEntries(Object.entries(files).map(([key,file])=>[key,hash(fs.readFileSync(file))])),sourcePortrait:await sharp(files.portrait).metadata().then(({width,height})=>({width,height})),poseSheet:{width:metadata.width,height:metadata.height},outputs:[c.sprite,c.portrait,c.portraitLarge,...Object.values(c.poses).slice(1)].map(url=>({url,bytes:fs.statSync(path.join(assets,'..',url.slice(1))).size}))});
  console.log('Exported portrait and 5 poses:',c.id);
 }
 fs.writeFileSync(path.join(__dirname,'asset-report.json'),JSON.stringify({tool:'built-in image_gen',export:'sharp; alpha-preserving WebP',characters:report},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
