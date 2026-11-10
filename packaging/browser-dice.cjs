const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chromium, webkit } = require('playwright');
const { createRoomServer } = require('../online/server.cjs');

async function checkBoardDice(page) {
  const geometry = await page.evaluate(() => {
    const tray = document.querySelector('#dice-tray');
    const result = document.querySelector('#dice-result');
    const faces = [...tray.querySelectorAll('.die')];
    const rect = node => node.getBoundingClientRect().toJSON();
    const intersects = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
      Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    const obstacles = [...document.querySelectorAll('#board .tile-hit, .token, #roll-button, #zoom-in, #zoom-out')]
      .map(rect).filter(box => box.width && box.height);
    const smaller = faces.map(rect), resultBefore = rect(result);
    const overlaps = smaller.some(box => obstacles.some(other => intersects(box, other)));
    for (const face of faces) face.style.scale = 'none';
    const original = faces.map(rect), resultAfter = rect(result);
    for (const face of faces) face.style.removeProperty('scale');
    return {
      factors: smaller.map((box, index) => box.width / original[index].width),
      overlaps, resultBefore, resultAfter,
      resultFont: parseFloat(getComputedStyle(result).fontSize),
      controlsReachable: getComputedStyle(tray).pointerEvents === 'none',
    };
  });
  assert(geometry.factors.every(value => Math.abs(value - .8) < .02), JSON.stringify(geometry));
  assert(!geometry.overlaps, JSON.stringify(geometry));
  assert(geometry.controlsReachable);
  assert.deepEqual(geometry.resultBefore, geometry.resultAfter);
  assert(geometry.resultFont >= 12);
}
(async () => {
  const server = createRoomServer({ database: ':memory:' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await (process.env.QA_WEBKIT === '1' ? webkit : chromium).launch();
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
    await checkBoardDice(page);
    const records = await page.evaluate(() => window.rollSources);
    assert.equal(records.length, 1);
    assert(records[0].ended !== null);
    assert(records[0].duration < .75);
    assert.deepEqual(errors, []);
    // Start a fresh local context to exercise the muted animation.
    const muted = await browser.newPage({viewport: {width: 1440, height: 900}});
    await muted.goto(url);
    await muted.locator('#settings-open').click();
    await muted.locator('#sfx-on').uncheck();
    await muted.getByRole('button', { name:'Готово', exact:true }).click();
    await muted.locator('#roll-button').click();
    await muted.locator('#dice-tray.rolling').waitFor();
    await muted.waitForFunction(() => /^\d/.test(document.querySelector('#dice-result').textContent));
    await checkBoardDice(muted);
    console.log('Verified audio ended before displayed result; muted dice animated normally.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
