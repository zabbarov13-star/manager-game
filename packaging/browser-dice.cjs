const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chromium, webkit } = require('playwright');
const { createRoomServer } = require('../online/server.cjs');

(async () => {
  const server = createRoomServer({ database: ':memory:' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await (process.env.QA_WEBKIT === '1' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: {width: 390, height: 844}, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.rollSources = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer?.duration > .4 && this.buffer.duration < .76) {
          const record = { duration: this.buffer.duration, started: performance.now(), ended: null };
          window.rollSources.push(record);
          this.addEventListener('ended', () => { record.ended = performance.now(); }, { once: true });
        }
        return start.apply(this, args);
      };
    });
    const url = 'http://127.0.0.1:' + server.address().port;
    await page.goto(url);
    await page.locator('#settings-open').click();
    await page.locator('#music-on').uncheck();
    await page.getByRole('button', { name:'Готово', exact:true }).click();
    await page.locator('#roll-button').click();
    await page.waitForFunction(() => /^\d/.test(document.querySelector('#dice-result').textContent));
    assert.equal(await page.locator('#dice-tray.rolling').count(), 0);
    const records = await page.evaluate(() => window.rollSources);
    assert.equal(records.length, 1);
    assert(records[0].ended !== null);
    assert(records[0].duration < .75);
    assert.deepEqual(errors, []);
    // Start a fresh local context to exercise the muted animation.
    const muted = await browser.newPage();
    await muted.goto(url);
    await muted.locator('#settings-open').click();
    await muted.locator('#sfx-on').uncheck();
    await muted.getByRole('button', { name:'Готово', exact:true }).click();
    await muted.locator('#roll-button').click();
    await muted.locator('#dice-tray.rolling').waitFor();
    await muted.waitForFunction(() => /^\d/.test(document.querySelector('#dice-result').textContent));
    console.log('Verified audio ended before displayed result; muted dice animated normally.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
