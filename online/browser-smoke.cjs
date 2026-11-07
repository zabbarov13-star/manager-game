const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createRoomServer } = require('./server.cjs');

(async () => {
  const server = createRoomServer({ database: ':memory:' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const renderRequests = [];
  try {
    browser = await chromium.launch();
    const host = await browser.newContext();
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const context of [host, guest]) {
      await context.route('**/*onrender.com/**', route => {
        renderRequests.push(route.request().url());
        return route.abort();
      });
    }
    const a = await host.newPage(), b = await guest.newPage();
    const button = (page, name) => page.getByRole('button', { name, exact: true });
    await a.goto(url);
    await button(a, 'Настройки').click();
    await button(a, 'Начать партию · 2–6 игроков').click();
    await a.getByRole('combobox', { name: 'Режим' }).selectOption('online');
    await a.getByRole('textbox', { name: 'Ваше имя' }).fill('Хост QA');
    await button(a, 'Создать стол').click();
    const link = await a.getByRole('textbox', { name: 'Ссылка на комнату' }).inputValue();
    await b.goto(link);
    await b.getByRole('textbox', { name: 'Ваше имя' }).fill('Гость QA');
    await button(b, 'Проверить комнату').click();
    await b.locator('.room-preview').filter({ hasText: /1 \/ 6 мест/ }).waitFor();
    await button(b, 'Занять место').click();
    await b.getByRole('list', { name: 'Участники комнаты' }).getByText('Хост QA · создатель').waitFor();
    await button(b, 'Я готов').click();
    await button(a, 'Начать общую партию').click();
    await button(b, 'Вернуться к полю').click();
    for (const page of [a, b]) {
      await page.waitForFunction(() => document.querySelector('.live-badge')?.textContent === 'ОНЛАЙН');
    }
    const actor = await a.locator('.turn-panel h2').textContent();
    await (actor.includes('Хост QA') ? a : b).locator('#roll-button').click();
    for (const page of [a, b]) {
      await page.waitForFunction(() => /\d \+ \d = \d/.test(document.querySelector('#last-roll')?.textContent));
    }
    const result = await a.locator('#last-roll').textContent();
    assert.equal(await b.locator('#last-roll').textContent(), result);
    await a.close();
    await b.waitForFunction(() => !!navigator.serviceWorker.controller);
    await guest.setOffline(true);
    await b.reload({ waitUntil: 'load' });
    assert.match(await b.title(), /тест онлайн/);
    await guest.setOffline(false);
    await b.waitForFunction(() => document.querySelector('.live-badge')?.textContent === 'ОНЛАЙН');
    assert.equal(await b.locator('#last-roll').textContent(), result);
    assert.deepEqual(renderRequests, []);
    console.log('PASS independent browser contexts, invitation, shared roll, host tab closed, offline reload and reconnect');
  } finally {
    await browser?.close();
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
