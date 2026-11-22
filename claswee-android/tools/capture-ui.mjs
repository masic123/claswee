import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('console', event => { if (event.type() === 'warning' || event.type() === 'error') console.log(event.type(), event.text()); });
  await page.goto('http://127.0.0.1:5197');
  await page.getByRole('button', { name: '暂不开启，仅本地使用' }).click();
  await page.locator('.columns .col').first().waitFor();
  await page.screenshot({ path: 'artifacts/android-schedule-preview.png' });
  console.log(JSON.stringify(await page.evaluate(() => ({ title: document.querySelector('.native-navigation').innerText, tabs: [...document.querySelectorAll('.tab-label')].map(el => el.textContent), hero: document.querySelector('.hero').getBoundingClientRect().toJSON(), col: document.querySelector('.col').getBoundingClientRect().toJSON(), paw:getComputedStyle(document.querySelector('.paw-bg')).backgroundImage, nick:getComputedStyle(document.querySelector('.nick-cat')).color, overflow: document.documentElement.scrollWidth - innerWidth })), null, 2));
  await page.locator('.tab[data-index="0"]').click(); await page.screenshot({ path: 'artifacts/android-settings-preview.png' });
  await page.locator('.tab[data-index="2"]').click(); await page.screenshot({ path: 'artifacts/android-sync-preview.png' });
} finally { await browser.close(); }
