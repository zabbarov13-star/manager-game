const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
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
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
    const errors = [];
    const host = await browser.newContext();
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const context of [host, guest]) {
      await context.route('**/*onrender.com/**', route => {
        renderRequests.push(route.request().url());
        return route.abort();
      });
    }
    const a = await host.newPage(), b = await guest.newPage();
    for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
    const button = (page, name) => page.getByRole('button', { name, exact: true });
    const screenshotDir = process.env.UI_SCREENSHOTS;
    if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
    await a.goto(url);
    const manifest = await (await a.request.get(url + '/manifest.webmanifest')).json();
    const icon = await a.request.get(new URL(manifest.icons[0].src, url).href);
    const iconBytes = await icon.body();
    assert.equal(iconBytes.readUInt32BE(16), 512);
    assert.equal(iconBytes.readUInt32BE(20), 512);
    assert.match(await a.locator('link[rel=icon]').getAttribute('href'), /^data:image\/png;base64,/);
    assert.equal(await a.locator('link[rel=apple-touch-icon]').getAttribute('href'), './manager-icon.png');
    await button(a, 'Настройки').click();
    await button(a, 'Начать партию · 2–6 игроков').click();
    await a.locator('#player-setup-rows .player-setup-row button').first().click();
    const characters = a.locator('dialog.appearance-dialog[open] .character-grid');
    await characters.waitFor();
    const options = characters.locator('.character-choice');
    assert.equal(await options.count(), 12);
    const choice = characters.locator('.character-choice[aria-pressed=false]:enabled').first();
    const label = await choice.getAttribute('aria-label');
    await choice.click();
    assert.equal(await characters.locator('.character-choice[aria-pressed=true]').getAttribute('aria-label'), label);
    if (screenshotDir) await characters.screenshot({ path: join(screenshotDir, 'characters.png') });
    await button(a, 'Готово').click();
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
    for (const page of [a, b]) {
      const values = result.match(/\d/g).slice(0, 2).map(Number);
      assert.deepEqual(await page.locator('.panel-dice .die').evaluateAll(dice => dice.map(die => die.childElementCount)), values);
    }
    if (screenshotDir) await a.screenshot({ path: join(screenshotDir, 'desktop-table.png') });

    await a.locator('#tab-chat').click();
    const sendMessage = async (page, message) => {
      await page.getByRole('textbox', { name: 'Сообщение в чат' }).fill(message);
      await button(page, 'Отправить').click();
    };
    const long = 'Проверка переноса: ' + 'я'.repeat(275);
    await sendMessage(a, long);
    await a.locator('.chat-own').getByText(long).waitFor();
    assert.equal(await a.locator('.chat-unread').isVisible(), false);
    await b.locator('#tab-chat').getByText('1', { exact: true }).waitFor();
    await b.locator('#tab-chat').click();
    await b.locator('.chat-message').getByText(long).waitFor();
    assert.equal(await b.locator('.chat-unread').isVisible(), false);
    await sendMessage(b, 'Вижу общий результат броска.');
    await a.locator('.chat-message:not(.chat-own)').getByText('Гость QA').waitFor();
    assert.equal(await b.locator('.chat-message time').count(), 2);
    assert.equal(await b.locator('.chat-avatar svg').count(), 2);
    assert.equal(await b.locator('.chat-message').evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth)), true);
    if (screenshotDir) await b.locator('.sidebar').screenshot({ path: join(screenshotDir, 'mobile-chat.png') });

    await button(b, 'Настройки').click();
    const settings = b.locator('#settings-dialog');
    assert.ok(await settings.locator('input, button, select').count() >= 12);
    await settings.locator('#chat-sound').uncheck();
    assert.equal(await b.evaluate(() => localStorage.getItem('manager.chat-sound')), 'off');
    const themeOptions = settings.locator('.theme-choice');
    assert.equal(await themeOptions.count(), 5);
    for (let i = 0; i < 5; i++) {
      await themeOptions.nth(i).click();
      for (const dark of [false, true]) {
        await settings.locator('#dark-mode').setChecked(dark);
        assert.equal(await b.locator('body').getAttribute('data-dark'), String(dark));
        const readable = await b.locator('.chat-message p').first().evaluate(p => {
          const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
          function luminance(color) {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const [r,g,b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
              .map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
            return .2126*r + .7152*g + .0722*b;
          }
          const tones = [luminance(getComputedStyle(p).color),
            luminance(getComputedStyle(p.closest('article')).backgroundColor)].sort((a,b) => a-b);
          return (tones[1] + .05) / (tones[0] + .05);
        });
        assert.ok(readable >= 4.5, `chat contrast theme ${i}, dark=${dark}: ${readable}`);
      }
    }
    if (screenshotDir) await settings.screenshot({ path: join(screenshotDir, 'mobile-settings.png') });
    await button(b, 'Закрыть настройки').click();

    await a.close();
    await b.waitForFunction(() => !!navigator.serviceWorker.controller);
    await guest.setOffline(true);
    await b.reload({ waitUntil: 'load' });
    assert.match(await b.title(), /тест онлайн/);
    await guest.setOffline(false);
    await b.waitForFunction(() => document.querySelector('.live-badge')?.textContent === 'ОНЛАЙН');
    assert.equal(await b.locator('#last-roll').textContent(), result);
    const creator = await browser.newContext();
    const finder = await browser.newContext();
    const c = await creator.newPage(), d = await finder.newPage();
    await Promise.all([c.goto(url), d.goto(url)]);
    for (const page of [c, d]) await button(page, 'Играть онлайн').click();
    await c.getByRole('textbox', { name: 'Ваше имя' }).fill('Хозяин');
    await c.getByRole('combobox', { name: 'Тип комнаты' }).selectOption('public');
    await c.getByRole('textbox', { name: 'Название комнаты' }).fill('Открытая QA');
    await button(c, 'Создать стол').click();
    const publicCode = await c.getByRole('textbox', { name: 'Код вашей комнаты' }).inputValue();
    await d.getByRole('textbox', { name: 'Ваше имя' }).fill('Участник');
    await button(d, 'Открытые комнаты').click();
    await d.getByRole('button', { name: /Открытая QA/ }).waitFor();
    await button(d, 'Найти игру').click();
    assert.equal(await d.getByRole('textbox', { name: 'Код вашей комнаты' }).inputValue(), publicCode);
    await button(d, 'Освободить место').click();
    await button(d, 'Создать стол').waitFor();
    assert.deepEqual(renderRequests, []);
    assert.deepEqual(errors, []);
    console.log('PASS independent browser contexts, invitation, shared roll, host tab closed, offline reload and reconnect');
  } finally {
    await browser?.close();
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
