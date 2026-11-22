const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const Hours = require('../miniprogram/utils/schedule-hours');
const Grid = require('../miniprogram/utils/schedule-grid');
const UI = require('./fixtures/ui-mocks');

function page(name, data, now = '2026-09-26T10:00:00') {
  let instance;
  const wx = { showToast() {}, setNavigationBarTitle() {} };
  const facade = { ...Store, get: () => data, save: value => { data = Store.normalize(value); return data; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages', name, 'index.js'), 'utf8'), {
    require: id => id.endsWith('/store') ? facade : id.endsWith('/schedule-hours') ? Hours : id.endsWith('/schedule-grid') ? Grid : id.endsWith('/skin') ? UI.skin : id.endsWith('/notifications') ? UI.notifications : {},
    Page: value => { instance = value; }, wx,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  });
  instance.setData = (values, done) => { Object.assign(instance.data, values); if (done) done(); };
  return { instance, getData: () => data };
}

function course(id, owner, day, week = 'all') {
  return { id, owner, name: id, loc: '', teacher: '', week, wf: 1, wt: 19, customParity: 'all', slots: [{ day, s1: 1, s2: 2 }] };
}

test('a one-day substitution uses the source date weekday and source week parity in both views', () => {
  const data = Store.defaults();
  data.courses = [course('odd-Monday', 'cat', 1, 'odd'), course('even-Monday', 'cat', 1, 'even'), course('Saturday', 'cat', 6), course('dog-Saturday', 'dog', 6)];
  data.adjustments = [{ date: '2026-09-26', owner: 'cat', kind: 'use', sourceDate: '2026-09-14' }];
  const { instance } = page('schedule', data);
  instance.data.week = 4;
  instance.data.timelineDay = 6;
  instance.render();
  assert.deepEqual(Array.from(instance.data.columns[5].cards, x => x.name), ['odd-Monday', 'dog-Saturday']);
  assert.match(instance.data.columns[5].adjustmentLabel, /按9\.14周一上课/);
  assert.deepEqual(Array.from(instance.data.catItems, x => x.name), ['odd-Monday']);
  assert.deepEqual(Array.from(instance.data.dogItems, x => x.name), ['dog-Saturday']);
  instance.showToday({ currentTarget: { dataset: { owner: 'cat' } } });
  assert.deepEqual(Array.from(instance.data.todayCourses, x => x.name), ['odd-Monday']);
  assert.match(instance.data.todayAdjustmentLabel, /按9\.14周一上课/);
});

test('resting one owner hides only their courses and removing the rule restores them', () => {
  let data = Store.defaults();
  data.courses = [course('cat-Saturday', 'cat', 6), course('dog-Saturday', 'dog', 6)];
  const settings = page('settings', data);
  settings.instance.load();
  settings.instance.setData({ adjustmentDate: '2026-09-26', adjustmentOwner: 'cat', adjustmentKind: 'off' });
  settings.instance.saveAdjustment();
  data = settings.getData();
  assert.equal(data.adjustments.length, 1);
  const schedule = page('schedule', data);
  schedule.instance.data.week = 4;
  schedule.instance.data.timelineDay = 6;
  schedule.instance.render();
  assert.deepEqual(Array.from(schedule.instance.data.columns[5].cards, x => x.name), ['dog-Saturday']);
  assert.equal(schedule.instance.data.catItems.length, 0);
  assert.equal(schedule.instance.data.dogItems.length, 1);
  settings.instance.removeAdjustment({ currentTarget: { dataset: { key: '2026-09-26_cat' } } });
  assert.equal(settings.getData().adjustments.length, 0);
});

test('rules normalize, deduplicate by date and owner, and survive a cloud-style JSON round trip', () => {
  const data = Store.defaults();
  data.adjustments = [
    { date: '2026-09-26', owner: 'cat', kind: 'off' },
    { date: '2026-09-26', owner: 'cat', kind: 'use', sourceDate: '2026-09-14' },
    { date: '2026-02-30', owner: 'dog', kind: 'off' },
    { date: '2026-09-26', owner: 'dog', kind: 'use', sourceDate: 'n/a' }
  ];
  const restored = Store.normalize(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.adjustments.length, 1);
  assert.equal(restored.adjustments[0].kind, 'use');
  assert.equal(Store.effectiveDay(restored, 'cat', '2026-09-26').week, 3);
  assert.equal(Store.effectiveDay(restored, 'dog', '2026-09-26').day, 6);
});
