'use strict';
// One source for the standalone page, room client, Telegram and native wrappers.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');
function embed(html) {
  const blocks = {
    head: '<style id="manager-shell-style">\n' + read('shell.css') + '\n</style>\n<script>\n' + read('presentation.js')+'\n'+read('motion.js')+'\n'+read('shell.js') + '\n</script>',
    menu: read('menu.html').replace('{{manager-icon}}','data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,'assets/manager.webp')).toString('base64')).replace('{{smaylokrut}}','data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,'assets/smaylokrut.webp')).toString('base64')).replace('{{cat-and-differences}}','data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,'assets/cat-and-differences.webp')).toString('base64')) + '\n<script>window.ManagerShell.boot();</script>'
  };
  for (const [name, content] of Object.entries(blocks)) {
    const start = '<!-- manager-shell:' + name + ' -->', end = '<!-- /manager-shell:' + name + ' -->';
    const block = start + '\n' + content + '\n' + end;
    if (html.includes(start)) {
      const from = html.indexOf(start), to = html.indexOf(end, from);
      if (to < 0) throw Error('Unclosed shell block: ' + name);
      html = html.slice(0, from) + block + html.slice(to + end.length);
    } else {
      const anchor = name === 'head' ? '</head>' : '<body>';
      if (!html.includes(anchor)) throw Error('Missing shell anchor: ' + anchor);
      html = html.replace(anchor, name === 'head' ? block + '\n' + anchor : '<body data-screen="menu">\n' + block);
    }
  }
  const chatStart = '/* manager-shared-chat:start */', chatEnd = '/* manager-shared-chat:end */';
  if (html.includes(chatStart)) {
    const a=html.indexOf(chatStart),b=html.indexOf(chatEnd,a);
    if(b<0)throw Error('Unclosed chat source');
    html=html.slice(0,a)+chatStart+'\n'+fs.readFileSync(path.join(root,'online/table-ui.js'),'utf8').replace(/\r\n/g,'\n')+'\n'+html.slice(b);
  }
  return html;
}
if (require.main === module) {
  const file = path.join(root, 'index.html');
  fs.writeFileSync(file, embed(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')));
}
module.exports = { embed };
