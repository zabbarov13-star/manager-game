'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const before=require('./fixtures/catalog-before.json');
const after=require('../catalog.cjs');
const visualKeys=new Set(['artVersion','portraitLarge','poses']);
const base=path.resolve(__dirname,'..');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('visual update preserves all 18 identities, biographies, stats, prices and packs',()=>{
 assert.deepEqual(after.characters.map(c=>Object.fromEntries(Object.entries(c).filter(([key])=>!visualKeys.has(key)))),before.characters);
 for(const key of ['items','products','packs','styles','freeIds'])assert.deepEqual(after[key],before[key]);
 assert.equal(after.characters.filter(c=>c.free).length,6);
});

function webp(file){
 const data=fs.readFileSync(file);assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
 let offset=12;
 while(offset+8<data.length){const kind=data.toString('ascii',offset,offset+4),length=data.readUInt32LE(offset+4);if(kind==='VP8X')return {alpha:!!(data[offset+8]&16),width:data.readUIntLE(offset+12,3)+1,height:data.readUIntLE(offset+15,3)+1};offset+=8+length+(length%2);}
 throw Error('Missing alpha-capable WebP header: '+file);
}
test('every premium character has a high-resolution portrait and five distinct transparent raster poses',()=>{
 for(const c of after.characters.filter(c=>!c.free)){
  const portrait=path.join(base,c.portraitLarge.slice(1)),metadata=webp(portrait);
  assert(metadata.alpha,c.id);assert(Math.max(metadata.width,metadata.height)>=1024,c.id+' portrait resolution');
  const hashes=new Set();for(const state of ['idle','joy','failure','win','loss']){
   const file=path.join(base,c.poses[state].slice(1));assert(fs.statSync(file).size>5000,c.id+' '+state);const meta=webp(file);assert(meta.alpha,c.id+' '+state);assert(meta.height>=300,c.id+' '+state);hashes.add(digest(file));
  }assert.equal(hashes.size,5,c.id+' must have genuinely different artwork');
  assert.notEqual(digest(path.join(base,c.sprite.slice(1))),digest(path.join(base,'art-review/before',c.id+'.webp')),c.id+' must be redesigned');
 }
});
