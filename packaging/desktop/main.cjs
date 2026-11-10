const { app, BrowserWindow, net, protocol, session } = require('electron');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

const smoke = process.argv.includes('--manager-smoke');
if (smoke && process.env.MANAGER_SMOKE_PROFILE) app.setPath('userData', process.env.MANAGER_SMOKE_PROFILE);
const origin = 'https://95-181-169-84.sslip.io';
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/manager-icon.png', ['manager-icon.png', 'image/png']],
]);
const gamePage = value => {
  const url = new URL(value);
  return url.origin === origin && ['/', '/index.html'].includes(url.pathname);
};
let window;
function open() {
  window = new BrowserWindow({
    width: 1370, height: 920, minWidth: 390, minHeight: 520,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!gamePage(url)) event.preventDefault();
  });
  window.on('closed', () => { window = null; });
  if (smoke) {
    const timer = setTimeout(() => app.exit(2), 30000);
    window.webContents.once('did-finish-load', async () => {
      try {
        const state = await window.webContents.executeJavaScript(`(() => {
          const saved = localStorage.getItem('manager.qa-desktop');
          localStorage.setItem('manager.qa-desktop','saved');
          return {saved, dice:!!document.querySelector('.panel-dice'), board:!!document.querySelector('#board')};
        })()`);
        if (!state.dice || !state.board || (process.env.MANAGER_SMOKE_REOPEN === '1' && state.saved !== 'saved')) {
          throw Error(JSON.stringify(state));
        }
        clearTimeout(timer);
        window.webContents.session.flushStorageData();
        app.quit();
      } catch (error) { console.error(error); app.exit(1); }
    });
  }
  window.loadURL(origin + '/');
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_web, _name, callback) => callback(false));
  protocol.handle('https', async request => {
    const url = new URL(request.url);
    const asset = request.method === 'GET' && url.origin === origin && files.get(url.pathname);
    if (!asset) return net.fetch(request, { bypassCustomProtocolHandlers: true });
    const [name, type] = asset;
    return new Response(await readFile(join(__dirname, 'game', name)), {
      headers: { 'Content-Type': type, 'Cache-Control': 'no-store' },
    });
  });
  open();
  app.on('activate', () => { if (!window) open(); });
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
