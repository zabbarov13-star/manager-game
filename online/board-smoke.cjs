const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chromium, devices } = require('playwright');
const { createRoomServer } = require('./server.cjs');
const { game, beforeLanding } = require('./construction-fixture.cjs');

(async () => {
  const server = createRoomServer({ database: ':memory:' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    const url = 'http://127.0.0.1:' + server.address().port;
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    desktop.on('pageerror', error => errors.push(error.message));
    const snapshot = game();
    await desktop.addInitScript(({ snapshot }) => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', 'yes');
      localStorage.setItem('manager.match.v2', JSON.stringify(snapshot));
    }, { snapshot });
    await desktop.goto(url);
    const view = desktop.locator('#board-viewport');
    const center = async () => {
      const box = await view.boundingBox();
      return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 220) };
    };
    const zoom = page => page.locator('#zoom-label').textContent().then(parseFloat);
    const boardPoint = (page, point) => page.locator('#board-stage').evaluate((stage, { x, y }) => {
      const rect = stage.getBoundingClientRect();
      return [(x - rect.left) / rect.width, (y - rect.top) / rect.height];
    }, point);
    const point = await center();
    const old = await boardPoint(desktop, point);
    await desktop.mouse.move(point.x, point.y);
    await desktop.mouse.wheel(0, -100);
    await desktop.waitForFunction(() => parseFloat(document.querySelector('#zoom-label').textContent) > 100);
    const resized = await boardPoint(desktop, point);
    resized.forEach((value, index) => assert.ok(Math.abs(value - old[index]) < .01));
    await desktop.mouse.wheel(0, 100);
    await desktop.waitForFunction(() => parseFloat(document.querySelector('#zoom-label').textContent) === 100);

    const mobile = await browser.newContext(devices['Pixel 7']);
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(url);
    const box = await phone.locator('#board-viewport').boundingBox();
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + 100);
    const session = await mobile.newCDPSession(phone);
    const send = (type, distance) => session.send('Input.dispatchTouchEvent', { type, touchPoints: distance ?
      [{ x: x - distance, y, id: 1 }, { x: x + distance, y, id: 2 }] : [] });
    const start = await zoom(phone);
    await send('touchStart', 30);
    for (const distance of [45, 54, 65, 76]) await send('touchMove', distance);
    await send('touchEnd');
    await phone.waitForFunction(start => parseFloat(document.querySelector('#zoom-label').textContent) > start, start);
    const enlarged = await zoom(phone);
    await send('touchStart', 75);
    for (const distance of [60, 48, 39, 30]) await send('touchMove', distance);
    await send('touchEnd');
    await phone.waitForFunction(enlarged => parseFloat(document.querySelector('#zoom-label').textContent) < enlarged, enlarged);

    for (const level of [1, 2, 3, 4]) {
      const state = game();
      for (const id of [1, 2, 4]) Object.assign(state.properties[id], { owner: 'p0', level: level - 1 });
      beforeLanding(state, 2);
      await desktop.evaluate(state => {
        localStorage.setItem('manager.match.v2', JSON.stringify(state));
        const key = Object.keys(localStorage).find(name => {
          try { return JSON.parse(localStorage.getItem(name))?.mode === 'field-module'; } catch { return false; }
        });
        if (key) {
          const settings = JSON.parse(localStorage.getItem(key));
          settings.settings.reducedMotion = true;
          localStorage.setItem(key, JSON.stringify(settings));
        }
      }, state);
      await desktop.reload();
      const follow = level !== 2;
      await desktop.locator('#settings-open').click();
      await desktop.locator('#camera-follow').setChecked(follow);
      await desktop.locator('#reduced-motion').setChecked(true);
      await desktop.getByRole('button', { name: 'Закрыть настройки' }).click();
      await desktop.reload();
      assert.equal(await desktop.locator('#camera-follow').isChecked(), follow);
      for (let i = 0; i < 4; i++) await desktop.locator('#zoom-in').click();
      await view.evaluate(node => node.scrollTo(0, 0));
      await desktop.locator('#tab-log').click();
      await desktop.evaluate(() => {
        const original = crypto.getRandomValues.bind(crypto);
        const dice = [0, 1];
        crypto.getRandomValues = array => {
          if (array instanceof Uint32Array && array.length === 1 && dice.length) {
            array[0] = dice.shift();
            return array;
          }
          return original(array);
        };
      });
      await desktop.locator('#roll-button').click();
      const build = desktop.locator('#property-card').getByRole('button', { name: level === 4 ? /Построить предприятие/ : /Построить филиал/ });
      await build.waitFor();
      assert.equal(await desktop.locator('.tile.selected').getAttribute('data-id'), '2');
      const boardScroll = await view.evaluate(node => node.scrollTop);
      assert.equal(boardScroll > 0, follow);
      await build.click();
      await desktop.getByRole('button', { name: /Передать ход/ }).waitFor();
      await desktop.waitForFunction(level => JSON.parse(localStorage.getItem('manager.match.v2')).properties[2].level === level, level);
      assert.match(await desktop.locator('#property-card .building-level').textContent(), level === 4 ? /ПРЕДПРИЯТИЕ/ : new RegExp(level + ' / 3'));
      assert.equal(await desktop.locator('.tile.selected').getAttribute('data-id'), '2');
      await desktop.getByRole('button', { name: /Передать ход/ }).click();
      assert.equal(await desktop.locator('.tile.selected').getAttribute('data-id'), '2');
    }
    assert.deepEqual(errors, []);
    console.log('PASS wheel anchor, real Chromium pinch, camera setting persistence, arrival and all construction levels');
  } finally {
    await browser?.close();
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
