const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const Day = require('../miniprogram/utils/schedule-day');
const Poster = require('../miniprogram/utils/poster');
const Grid = require('../miniprogram/utils/schedule-grid');
const Palette = require('../miniprogram/utils/skin-palette');
const Invite = require('../miniprogram/utils/invite');
const Share = require('../miniprogram/utils/share');
function fixtures() {
  const data = Store.defaults();
  data.courses = [{ id: 'cat-private', owner: 'cat', name: '秘密课程名称', loc: '私密教学楼A302', teacher: '私密老师张三', week: 'all', wf: 1, wt: 19, slots: [{ day: 3, s1: 1, s2: 3 }] }];
  return { data };
}

test('only an explicit invite button includes a room, generic forwarding never inherits credentials', () => {
  const invite = Share.roomInvite('Room_2026');
  assert.match(invite.path, /^\/pages\/sync\/index\?invite=1&room=Room_2026$/);
  assert.equal(Share.appMessage().path, '/pages/schedule/index');
  assert.equal(Share.timeline().query, '');
  assert.equal(Invite.roomFromQuery({ room: 'Room_2026' }), '');
  Invite.capture({ path: 'pages/sync/index', query: { invite: '1', room: 'Room_2026' } });
  assert.equal(Invite.consume(), 'Room_2026'); assert.equal(Invite.consume(), '');
  assert.equal(Invite.roomFromQuery({ invite: '1', room: '../secret' }), '');
  let page; const calls = [];
  const Sync = { config: () => ({ room: 'love2026' }), ready: () => true };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/sync/index.js'), 'utf8'), { require: id => id.endsWith('/share') ? Share : id.endsWith('/sync') ? Sync : {}, Page: p => { page = p; }, wx: {} });
  assert.equal(page.onShareAppMessage({ from: 'menu' }).path, '/pages/schedule/index');
  assert.equal(page.onShareAppMessage({ from: 'button', target: { dataset: { shareKind: 'other' } } }).path, '/pages/schedule/index');
  assert.match(page.onShareAppMessage({ from: 'button', target: { dataset: { shareKind: 'room-invite' } } }).path, /room=love2026$/);
});

test('cold and warm invites prefill inputs without changing an existing room connection', async () => {
  let page, cfg = { room: '', token: '' };
  const sync = { config: () => cfg, ready: () => !!cfg.token, lastSyncText: () => '尚未同步' };
  const modules = { store: Store, share: { ...Share, enable() {} }, sync, invite: Invite, skin: { apply() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/sync/index.js'), 'utf8'), { require: id => modules[id.split('/').pop()], Page: value => { page = value; }, wx: {} });
  page.setData = values => Object.assign(page.data, values);
  page.onLoad({ invite: '1', room: 'friend-room' }); page.onShow();
  assert.equal(page.data.room, 'friend-room'); assert.equal(page.data.mode, 'join'); assert.equal(cfg.room, '');
  cfg = { room: 'my-room', token: 'my-token' };
  Invite.capture({ path: 'pages/sync/index', query: { invite: '1', room: 'another-room' } }); page.onShow();
  assert.equal(page.data.room, 'my-room'); assert.equal(page.data.invitedRoom, 'another-room'); assert.equal(cfg.token, 'my-token');
  await Promise.resolve();
});

test('calendar uses each school, term boundaries, parity and substitutions; mask omits private text', () => {
  const { data } = fixtures();
  data.settings.dogStart = '2026-09-07';
  data.settings.dogSections[0] = { s: '09:00', e: '09:45' };
  data.courses.push({ id: 'dog', owner: 'dog', name: '英语', week: 'even', wf: 1, wt: 10, slots: [{ day: 3, s1: 1, s2: 1 }] });
  const day = Day.summary(data, '2026-10-14');
  assert.equal(day.catSections, 3); assert.equal(day.dog[0].time, '09:00–09:45');
  assert.deepEqual(day.free.map(x => x.text), ['08:00–08:30', '11:10–22:00']);
  const masked = JSON.stringify(Poster.model(data, '2026-10-14', true));
  for (const text of ['秘密课程名称', '私密教学楼A302', '私密老师张三']) assert.equal(masked.includes(text), false);
  assert.equal(JSON.stringify(Poster.model(data, '2026-10-14', false)).includes('秘密课程名称'), true);
  data.adjustments = [{ owner: 'cat', date: '2026-10-14', kind: 'off' }];
  assert.equal(Day.summary(data, '2026-10-14').catSections, 0);
  data.adjustments = [{ owner: 'cat', date: '2026-10-15', kind: 'use', sourceDate: '2026-10-14' }];
  assert.equal(Day.summary(data, '2026-10-15').catSections, 3);
  data.courses[0].wt = 2; assert.equal(Day.summary(data, '2026-10-14').catSections, 0);
  assert.equal(Day.shanghaiDate(Date.parse('2026-10-13T17:00:00Z')), '2026-10-14');
});

test('remote sync preserves device identity and all course modes honor start/end weeks', () => {
  const local = Store.defaults(); local.me = 'dog'; const remote = Store.defaults(); remote.me = 'cat';
  const storage = new Map(); global.wx = { setStorageSync: (key, value) => storage.set(key, value) };
  try { assert.equal(Store.adoptRemote(remote, local).me, 'dog'); } finally { delete global.wx; }
  assert.equal(Store.inWeek({ week: 'odd', wf: 3, wt: 5 }, 1), false);
  assert.equal(Store.inWeek({ week: 'all', wf: 3, wt: 5 }, 6), false);
});

test('the poster contains every day of the selected week, optional weekend, and no masked course text', () => {
  const data = Store.defaults(); data.settings.weekend = false;
  data.courses = [{ id: 'weekly', owner: 'cat', name: '仅本周的课程', loc: '教室A', teacher: '老师B', week: 'odd', wf: 7, wt: 7, slots: [{ day: 1, s1: 1, s2: 2 }, { day: 5, s1: 3, s2: 4 }, { day: 7, s1: 5, s2: 6 }] }];
  const model = Poster.model(data, '2026-10-14', false, { includeWeekend: false });
  assert.equal(model.width, 1500);
  assert.equal(model.height, (386 + 102 + model.gridHeight + 162) * 2);
  assert.equal(model.days.some(day => Object.hasOwn(day, 'free')), false);
  assert.equal(model.start, '2026-10-12'); assert.equal(model.end, '2026-10-16'); assert.equal(model.week, 7);
  assert.equal(model.days.length, 5); assert.equal(model.days[0].cat.length, 1); assert.equal(model.days[4].cat.length, 1);
  assert.equal(Poster.model(data, '2026-10-21', false).days[0].cat.length, 0);
  const fullWeek = Poster.model(data, '2026-10-14', false);
  assert.equal(fullWeek.days.length, 7); assert.equal(fullWeek.columns.length, 7);
  assert.equal(fullWeek.end, '2026-10-18'); assert.equal(fullWeek.days[6].cat.length, 1);
  assert.equal(fullWeek.columns[6].cards[0].name, '仅本周的课程');
  assert.equal(model.columns.length, 5); assert.equal(data.settings.weekend, false);
  const masked = JSON.stringify(Poster.model(data, '2026-10-14', true));
  for (const privateText of ['仅本周的课程', '教室A', '老师B']) assert.equal(masked.includes(privateText), false);
});

test('share weekend selection is device-local, remembered, and updates the selected week range', () => {
  const data = Store.defaults(), storage = new Map(); let page, generated = 0;
  const modules = { store: { ...Store, get: () => data }, share: Share, skin: {}, 'schedule-day': Day, poster: Poster, 'poster-images': {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/share-poster/index.js'), 'utf8'), {
    require: id => modules[id.split('/').pop()], Page: value => { page = value; },
    wx: { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) }
  });
  page.setData = (values, callback) => { Object.assign(page.data, values); if (callback) callback(); };
  page.generate = () => { generated++; };
  page.onLoad({ week: '7', filter: 'dog' });
  assert.equal(page.data.includeWeekend, true); assert.equal(page.data.weekRange, '10.12 — 10.18');
  page.setWeekend({ detail: { value: false } });
  assert.equal(page.data.includeWeekend, false); assert.equal(page.data.weekRange, '10.12 — 10.16');
  assert.equal(data.settings.weekend, true); assert.equal(generated, 1);
  page.onLoad({ week: '8' });
  assert.equal(page.data.includeWeekend, false); assert.equal(page.data.weekRange, '10.19 — 10.23');
  page.setWeekend({ detail: { value: true } });
  assert.equal(page.data.weekRange, '10.19 — 10.25'); assert.equal(data.settings.weekend, true);
});

test('export uses the phone grid placement, rest splits, selected owner and current skin', () => {
  const data = Store.defaults(); data.settings.weekend = false;
  data.courses = [
    { id: 'cross-rest', owner: 'cat', name: '跨午休课程', loc: 'A302', teacher: '张老师', week: 'all', wf: 1, wt: 19, slots: [{ day: 1, s1: 3, s2: 6 }] },
    { id: 'overlap', owner: 'dog', name: '重叠课程', week: 'all', wf: 1, wt: 19, slots: [{ day: 1, s1: 3, s2: 4 }] }
  ];
  const phone = Grid.build(data, new Date(2026, 9, 12));
  const poster = Poster.model(data, '2026-10-14', false, { skin: 'night' });
  assert.deepEqual(poster.restRows, phone.restRows);
  assert.deepEqual(poster.columns.map(column => column.cards.map(({ top, height, leftPercent, widthPercent, displayName }) => ({ top, height, leftPercent, widthPercent, displayName }))), phone.columns.map(column => column.cards.map(({ top, height, leftPercent, widthPercent, displayName }) => ({ top, height, leftPercent, widthPercent, displayName }))));
  assert.equal(poster.columns[0].cards.length, 3); assert.equal(poster.skin, 'night');
  const single = Poster.model(data, '2026-10-14', false, { filter: 'dog' });
  assert.equal(single.columns[0].cards.length, 1); assert.equal(single.columns[0].cards[0].widthPercent, 1);
  const css = fs.readFileSync(path.join(__dirname, '../miniprogram/styles/skins.wxss'), 'utf8');
  const mapping = { bg:'bg', card:'card', text:'text', muted:'muted', line:'line', cat:'cat', catInk:'cat-ink', catSoft:'cat-soft', dog:'dog', dogInk:'dog-ink', dogSoft:'dog-soft', grid:'grid', surface:'surface' };
  for (const skin of ['blush', 'mint', 'sun', 'night']) {
    const block = css.match(new RegExp(`\\.skin-${skin}\\{([^}]+)\\}`))[1], colors = Palette.get(skin);
    for (const [key, token] of Object.entries(mapping)) assert.ok(block.includes(`--skin-${token}:${colors[key]};`), `${skin} ${key} differs from phone`);
    for (const colorsKey of ['hero','catCourse','dogCourse']) for (const color of colors[colorsKey]) assert.ok(block.includes(color));
  }
});

test('late pulls and queued uploads from the old room cannot overwrite a newly joined room', async () => {
  let app, finishPull, cfg = { room: 'old', token: 'old-token' }, adopted = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/app.js'), 'utf8'), { require: id => id.endsWith('/store') ? { get: () => ({ updatedAt: 1 }), adoptRemote: () => { adopted++; } } : id.endsWith('/sync') ? { config: () => cfg, pull: () => new Promise(resolve => { finishPull = resolve; }) } : Invite, App: value => { app = value; }, wx: {} });
  app.autoPull(); cfg = { room: 'new', token: 'new-token' }; finishPull({ updatedAt: 10 });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(adopted, 0);
  let queued, requests = 0; const module = { exports: {} };
  const values = new Map([['claswee_sync_cfg_v2', { room: 'old', token: 'old-token', clientId: 'test-client', auto: true, autoPush: true }]]);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/utils/sync.js'), 'utf8'), { module, wx: { getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, value), request: () => { requests++; } }, setTimeout: callback => { queued = callback; return 1; }, clearTimeout() {}, Date, Promise });
  module.exports.queueAutoPush({ updatedAt: 1 });
  values.set('claswee_sync_cfg_v2', { ...values.get('claswee_sync_cfg_v2'), room: 'new', token: 'new-token' }); queued();
  assert.equal(requests, 0);
});
