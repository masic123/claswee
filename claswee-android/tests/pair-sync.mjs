import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
let cloud, session = 0, notes = [], offline = false, expire = false, sendCalls = 0;
const contexts = [], errors = [];
async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); contexts.push(context);
  await context.route('https://**/*', async route => {
    if (!route.request().url().endsWith('/schedule-room')) throw new Error('Unexpected external request');
    const p = route.request().postDataJSON();
    if (offline && p.action === 'pull') return route.abort('internetdisconnected');
    let status = 200, result = { ok: true };
    if (p.action === 'create') { cloud = structuredClone(p.data); result = { ok: true, room: p.room, token: `mock-token-${++session}`, data: cloud }; }
    else if (p.action === 'join') result = { ok: true, room: p.room, token: `mock-token-${++session}`, data: cloud };
    else if (p.action === 'pull') { if (expire) { status = 401; result = { ok: false, code: 'UNAUTHORIZED', message: '凭证需要重新验证' }; } else result = { ok: true, data: cloud }; }
    else if (p.action === 'push') { cloud = structuredClone(p.data); result = { ok: true, updatedAt: cloud.updatedAt }; }
    else if (p.action === 'messageSend') { sendCalls++; if (!notes.some(n => n.requestId === p.requestId)) notes.push({ id: 'a'.repeat(64), sender_owner: p.owner, recipient_owner: p.owner === 'cat' ? 'dog' : 'cat', content: p.text, created_at: new Date().toISOString(), requestId: p.requestId, read: false }); }
    else if (p.action === 'messageInbox') result = { ok: true, messages: notes.filter(n => n.recipient_owner === p.owner && !n.read) };
    else if (p.action === 'messageRead') notes.forEach(n => { if (n.id === p.id) n.read = true; });
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5197'); await page.getByRole('button', { name: '同意并开启云服务' }).click(); return page;
}
const tab = (page, index) => page.locator(`.tab[data-index="${index}"]`).click();
async function createCourse(page, name) {
  await tab(page, 1); await page.getByRole('button', { name: '＋ 加课', exact: true }).click(); await page.getByRole('button', { name: '手动加课', exact: true }).click(); await page.locator('input[data-key="name"]').fill(name); await page.getByRole('button', { name: '保存课程', exact: true }).click(); await page.locator('.hero').waitFor();
}
async function syncNow(page) { await tab(page, 2); await page.getByRole('button', { name: '上传课表', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('.status')?.textContent.includes('正在')); }
async function stored(page, key = 'schedule.v1') { return page.evaluate(key => JSON.parse(localStorage.getItem(`CapacitorStorage.claswee.android.${key}`)), key); }
try {
  const a = await device(); await createCourse(a, '同步数学课'); await tab(a, 2);
  await a.getByRole('button', { name: '创建房间', exact: true }).click(); await a.locator('input[data-key="room"]').fill('mock-room'); await a.locator('input[data-key="password"]').fill('test-password'); await a.locator('input[data-key="confirmPassword"]').fill('test-password'); await a.getByRole('button', { name: '创建并上传当前课表' }).click(); await a.locator('.connected').waitFor();
  const b = await device(); await tab(b, 0); await b.locator('.choice button[data-owner="dog"]').first().click(); await tab(b, 2); await b.locator('input[data-key="room"]').fill('mock-room'); await b.locator('input[data-key="password"]').fill('test-password'); await b.getByRole('button', { name: '验证密码并加入' }).click(); await b.locator('.connected').waitFor();
  await createCourse(b, '对方的数据结构'); await syncNow(b); await syncNow(a);
  assert.ok(cloud.courses.some(c => c.name === '对方的数据结构')); assert.equal(cloud.courses.length, 8);
  assert.equal((await stored(b)).data.me, 'dog'); assert.equal((await stored(a)).data.me, 'cat');
  await a.getByRole('button', { name: '写一张小纸条' }).click(); await a.locator('.note-input').fill('记得按时吃饭');
  await a.locator('.toast').waitFor({ state: 'hidden' });
  await a.screenshot({ path: 'artifacts/android-note-preview.png', animations: 'disabled' });
  await a.getByRole('button', { name: '把心意送给 小狗' }).click(); await a.locator('.note-editor').waitFor({ state: 'hidden' });
  await syncNow(b); await b.locator('.note-body').getByText('记得按时吃饭', { exact: true }).waitFor();
  await b.locator('.toast').waitFor({ state: 'hidden' });
  await b.screenshot({ path: 'artifacts/android-received-note-preview.png', animations: 'disabled' });
  await b.getByRole('button', { name: '收下留言 ♡' }).click(); await b.locator('.note-paper').waitFor({ state: 'hidden' });
  await b.reload(); await b.locator('.hero').waitFor();
  assert.equal((await stored(b, 'notes.v1')).collected[0].content, '记得按时吃饭'); assert.equal(sendCalls, 1);
  offline = true; await syncNow(a); assert.match(await a.locator('.status').textContent(), /房间和本机课表已保留/); await a.reload(); await tab(a, 2); await a.getByText('mock-room', { exact: true }).waitFor();
  offline = false; expire = true; await syncNow(a); await a.getByText('房间信息已保留，请输入密码重新验证。', { exact: true }).waitFor(); assert.equal(await a.locator('input[data-key="room"]').inputValue(), 'mock-room');
  await createCourse(a, '离线保留的课程'); expire = false; await tab(a, 2); await a.locator('input[data-key="password"]').fill('test-password'); await a.getByRole('button', { name: '验证密码并加入' }).click(); await a.locator('.connected').waitFor(); await syncNow(a);
  assert.ok(cloud.courses.some(c => c.name === '离线保留的课程')); assert.equal(cloud.courses.length, 9); assert.deepEqual(errors, []);
  fs.writeFileSync('artifacts/pair-verification.json', JSON.stringify({ passed: true, usesMockServer: true, realUserDataTouched: false, checks: ['two independent devices join room', 'partner identity stays local', 'courses synchronize both ways', 'original paper composer and received-note modal', 'small note sent exactly once', 'note collected and preserved after reload', 'network failure preserves room after reload', 'expired credentials keep room and unsynced courses', 'reauthentication merges local work'], pageErrors: errors }, null, 2));
  console.log('Pair simulation passed: two-device courses, original notes, offline persistence, and credential recovery.');
} finally { for (const context of contexts) await context.close(); await browser.close(); }
