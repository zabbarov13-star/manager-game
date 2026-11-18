'use strict';
// Generate a portable before/after gallery; it is never bundled into the Mini App.
const fs = require('node:fs');
const path = require('node:path');
const characters = require('../catalog.cjs').characters.filter(c => !c.free);
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const relative = url => '..' + url;
const sections = characters.map(c => `
<section id="${c.id}">
  <header><p>${escape(c.collection)}</p><h2>${escape(c.name)}</h2><span>${escape(c.role)}</span></header>
  <div class="comparison">
    <figure><figcaption>До · портрет</figcaption><img loading="lazy" src="before/${c.id}-portrait.webp" alt="${c.name}: прежний портрет"></figure>
    <figure><figcaption>После · портрет высокого разрешения</figcaption><img loading="lazy" src="${relative(c.portraitLarge)}" alt="${c.name}: новый портрет"></figure>
    <figure><figcaption>До · игровая фигурка</figcaption><img loading="lazy" src="before/${c.id}.webp" alt="${c.name}: прежняя фигурка"></figure>
    <figure><figcaption>После · игровая фигурка</figcaption><img loading="lazy" src="${relative(c.sprite)}" alt="${c.name}: новая фигурка"></figure>
  </div>
  <div class="states">${[['idle','Ожидание'],['joy','Радость'],['failure','Разочарование'],['win','Победа'],['loss','Поражение']].map(([state,label])=>`<figure><img loading="lazy" src="${relative(c.poses[state])}" alt="${c.name}: ${label.toLowerCase()}"><figcaption>${label}</figcaption></figure>`).join('')}</div>
</section>`).join('');
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Менеджер · 12 премиальных персонажей: до и после</title><style>
*{box-sizing:border-box}body{margin:0;background:#102532;color:#fcf5e4;font:16px/1.6 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:48px 24px}h1{font-size:clamp(30px,5vw,58px);line-height:1.1;max-width:900px}h2{font-size:34px;margin:0}p{max-width:800px;color:#c7d0cd}nav{display:flex;flex-wrap:wrap;gap:12px;margin:30px 0}a{color:#f0ca7a;text-decoration:none}nav a{padding:7px 14px;border:1px solid #57727c;border-radius:20px}section{border-top:1px solid #46616b;padding:36px 0 48px;scroll-margin-top:20px}section header p{margin:0;color:#e2bb6d;letter-spacing:.08em;font-size:12px;text-transform:uppercase}header span{color:#bdcccb}.comparison{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:24px 0}figure{margin:0;min-width:0;border-radius:14px;background:#f8f0dc;color:#17384d;overflow:hidden}figcaption{padding:10px 12px;font-size:13px;font-weight:650}figure img{display:block;width:100%;height:390px;object-fit:contain;padding:14px}.states{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.states img{height:260px}.states figcaption{text-align:center}.note{font-size:14px;color:#c7d0cd}@media(max-width:760px){main{padding:24px 14px}.comparison{grid-template-columns:repeat(2,minmax(0,1fr))}figure img{height:280px}.states{grid-template-columns:repeat(2,minmax(0,1fr))}.states img{height:240px}}
</style><main><p>МЕНЕДЖЕР / ОБНОВЛЕНИЕ ПРЕМИАЛЬНОЙ КОЛЛЕКЦИИ</p><h1>Те же герои.<br>Новый уровень исполнения.</h1><p>12 существующих персонажей, три художественных направления. Имена, биографии, характеристики, цены и условия доступа сохранены. Портреты и пять состояний можно бесплатно рассмотреть в приложении.</p><p class="note">Слева показаны исходные ресурсы из ветки feature/telegram-mini-app, справа — переработанные изображения. В обоих случаях используются реальные игровые файлы. Анимации и предпросмотр проверяются в игровом интерфейсе; эта галерея показывает отдельные позы.</p><nav>${characters.map(c=>`<a href="#${c.id}">${escape(c.name)}</a>`).join('')}</nav>${sections}</main></html>`;
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('Before/after gallery:', path.join(__dirname, 'index.html'));

if (process.argv.includes('--png')) {
  (async () => {
    const sharp = require('sharp');
    const tileWidth = 500, tileHeight = 430;
    for (const portraits of [false, true]) {
    const composites = [];
    for (let index = 0; index < characters.length; index++) {
      const c = characters[index], x = index % 3 * tileWidth, y = Math.floor(index / 3) * tileHeight;
      const label = Buffer.from(`<svg width="500" height="54" xmlns="http://www.w3.org/2000/svg"><rect width="500" height="54" fill="#17384d"/><text x="16" y="23" fill="#fff8e7" font-family="Arial" font-size="19">${escape(c.name)}</text><text x="16" y="44" fill="#d5c18e" font-family="Arial" font-size="13">ДО</text><text x="266" y="44" fill="#d5c18e" font-family="Arial" font-size="13">ПОСЛЕ</text></svg>`);
      composites.push({input:label,left:x,top:y});
      for (const [offset, file] of [[0,path.join(__dirname,'before',c.id+(portraits?'-portrait':'')+'.webp')],[250,path.join(__dirname,'..',(portraits?c.portraitLarge:c.sprite).slice(1))]]) {
        const image = await sharp(file).resize(230, 356, {fit:'contain',background:'#f8f0dc'}).png().toBuffer();
        composites.push({input:image,left:x+offset+10,top:y+64});
      }
    }
    await sharp({create:{width:1500,height:1720,channels:4,background:'#f8f0dc'}}).composite(composites).png().toFile(path.join(__dirname,portraits?'before-after-portraits.png':'before-after.png'));
    }
    console.log('Comparison contact sheet ready.');
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
