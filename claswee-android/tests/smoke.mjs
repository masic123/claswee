import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = path.resolve('../couple-schedule-v41/miniprogram');
const Grid = require(path.join(source, 'utils/schedule-grid.js'));
const Store = require(path.join(source, 'utils/store.js'));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage(), errors = [], network = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5197')) network.push(request.url()); });
const tab = index => page.locator(`.tab[data-index="${index}"]`).click();
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('CapacitorStorage.claswee.android.schedule.v1')));
try {
  await page.goto('http://127.0.0.1:5197');
  await page.getByRole('button', { name: '暂不开启，仅本地使用' }).click();
  await page.locator('.columns .col').first().waitFor();
  assert.deepEqual(await page.locator('.tab-label').allTextContents(), ['设置', '课表', '同步']);
  assert.equal(await page.locator('.columns .col').count(), 7);
  assert.ok(await page.locator('.board').evaluate(el => el.scrollWidth > el.clientWidth));
  assert.ok(await page.locator('.paw-bg').evaluate(el => getComputedStyle(el).backgroundImage.includes('data:image/svg+xml')));
  const original = (await stored()).data;
  const displayedWeek = Number((await page.locator('.week-reset').textContent()).match(/\d+/)[0]);
  const start = new Date(Store.calendarStart(original) + 'T00:00:00'); start.setDate(start.getDate() + (displayedWeek - 1) * 7);
  const reference = Grid.build(original, start, 'both');
  const actualIds = await page.locator('.columns .course').evaluateAll(els => els.map(el => el.dataset.id));
  assert.deepEqual(actualIds, reference.columns.flatMap(column => column.cards.map(card => card.id)));
  assert.ok(Math.abs(await page.locator('.grid-area').first().evaluate(el => el.clientHeight) - reference.gridHeight * 390 / 750) < 1.1);
  await page.screenshot({ path: 'artifacts/android-schedule-preview.png' });
  checks.push('same three tabs, seven horizontally scrolling days, original course placement and rpx grid height');

  await page.getByRole('button', { name: '＋ 加课', exact: true }).click();
  await page.getByRole('button', { name: '手动加课', exact: true }).click();
  await page.locator('input[data-key="name"]').fill('安卓测试课');
  await page.locator('input[data-key="loc"]').fill('第一教学楼');
  await page.getByRole('button', { name: '保存课程', exact: true }).click();
  await page.locator('.columns .course-name').getByText('安卓测试课', { exact: true }).waitFor();
  await page.reload(); await page.locator('.columns .course-name').getByText('安卓测试课', { exact: true }).waitFor();
  checks.push('original full-page course editor saves and persists after restart');

  await page.locator('[data-menu="layout"]').click(); await page.locator('[data-layout="timeline"]').click();
  await page.locator('.timeline-days button').first().click();
  await page.locator('.event b').getByText('安卓测试课', { exact: true }).waitFor();
  assert.equal(await page.locator('.time-axis').count(), 1); assert.ok(await page.locator('.free-band').count() > 0);
  await page.screenshot({ path: 'artifacts/android-timeline-preview.png' });
  checks.push('original two-lane timeline, shared free time, and center time axis');

  await tab(0);
  assert.equal(await page.locator('.skin-option').count(), 4);
  const skinPositions = await page.locator('.skin-option').evaluateAll(els => els.map(el => ({ x: el.offsetLeft, y: el.offsetTop })));
  assert.equal(skinPositions[0].y, skinPositions[1].y); assert.ok(skinPositions[2].y > skinPositions[0].y);
  await page.screenshot({ path: 'artifacts/android-settings-preview.png' });
  const palettes = { blush: ['rgb(255, 248, 251)', 'rgb(168, 68, 107)'], mint: ['rgb(242, 248, 244)', 'rgb(113, 61, 52)'], sun: ['rgb(255, 249, 237)', 'rgb(104, 68, 28)'], night: ['rgb(13, 23, 43)', 'rgb(242, 232, 255)'] };
  for (const [skin, [bg, ink]] of Object.entries(palettes)) {
    await page.locator(`.skin-option[data-skin="${skin}"]`).click(); await page.waitForFunction(value => document.documentElement.dataset.skin === value, skin);
    assert.equal(await page.locator('.app-skin').evaluate(el => getComputedStyle(el).backgroundColor), bg);
    assert.equal(await page.locator('input[data-key="catName"]').evaluate(el => getComputedStyle(el).color), ink);
  }
  await page.locator('.skin-option[data-skin="mint"]').click();
  const photo = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '从相册选择头像', exact: true }).click();
  await (await photo).setFiles('public/icon.png');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('CapacitorStorage.claswee.android.schedule.v1')).data.users.cat.avatar.startsWith('data:image/jpeg;base64,'));
  assert.ok((await stored()).data.users.cat.avatar.length < 24100);
  await page.locator('input[data-key="catName"]').fill('林晚'); await page.locator('input[data-key="catName"]').blur();
  await page.locator('.choice button[data-owner="dog"]').first().click();
  await page.locator('.avatar[data-owner="cat"]').click(); await page.locator('.emojis button').getByText('🐰', { exact: true }).click();
  await page.getByRole('button', { name: '选择第一周周一' }).first().click();
  await page.getByLabel('年份', { exact: true }).selectOption('56'); await page.getByLabel('月份', { exact: true }).selectOption('9'); await page.getByLabel('周一日期', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  assert.equal((await stored()).data.settings.catStart, '2026-10-26');
  await page.reload(); await page.locator('.hero').waitFor();
  const saved = (await stored()).data;
  assert.equal(saved.users.cat.name, '林晚'); assert.equal(saved.me, 'dog'); assert.equal(saved.users.cat.avatar, '🐰');
  assert.equal(await page.locator('html').getAttribute('data-skin'), 'mint');
  checks.push('four original palettes and 2×2 previews; album photo compresses and saves; identity, nickname, emoji, Monday picker, and local skin persist');

  await tab(2); await page.getByRole('button', { name: '验证密码并加入' }).click();
  await page.getByRole('dialog', { name: '隐私说明' }).waitFor(); await page.getByRole('button', { name: '暂不开启，仅本地使用' }).click();
  assert.equal(await page.getByRole('button', { name: '写一张小纸条' }).isDisabled(), true);
  await page.screenshot({ path: 'artifacts/android-sync-preview.png' });
  await page.getByRole('button', { name: '生成周课表分享图' }).click();
  await page.locator('.poster-preview').waitFor();
  const posterSize = await page.locator('.poster-preview').evaluate(img => [img.naturalWidth, img.naturalHeight]);
  assert.equal(posterSize[0], 1500); assert.ok(posterSize[1] > 3000);
  await page.screenshot({ path: 'artifacts/android-poster-preview.png' });
  await page.getByRole('button', { name: '返回', exact: true }).click();
  checks.push('room requires cloud consent; notes require room; original full-week poster generates offline with real mini-program code');

  await tab(1);
  await page.locator('[data-menu="layout"]').click(); await page.locator('[data-layout="sections"]').click();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const actual = await page.locator('.col').first().evaluate(el => el.getBoundingClientRect().width);
    assert.ok(Math.abs(actual - 143 * width / 750) < 1.1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.setProperty('--safe-area-inset-top', '24px'); document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px'); });
  assert.equal(await page.locator('.tabbar').evaluate(el => getComputedStyle(el).paddingBottom), '34px');
  assert.equal(await page.locator('.native-navigation').evaluate(el => el.getBoundingClientRect().height), 68);
  await page.screenshot({ path: 'artifacts/android-safe-area-preview.png' });
  checks.push('320/390/430 px layouts fit; Android status and gesture insets remain outside content');
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  fs.writeFileSync('artifacts/ui-verification.json', JSON.stringify({ passed: true, checks, pageErrors: errors, externalNetworkInLocalMode: network, verifiedAgainst: source, realPhoneTested: false }, null, 2));
  console.log('UI verification passed:', checks.join('; '));
} finally { await browser.close(); }
