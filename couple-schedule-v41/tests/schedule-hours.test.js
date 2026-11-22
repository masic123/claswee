const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const Hours = require('../miniprogram/utils/schedule-hours');
const Grid = require('../miniprogram/utils/schedule-grid');

function course(id, owner, day, s1, s2, week = 'all') {
  return { id, owner, name: id, week, wf: 1, wt: 2, customParity: 'all', slots: [{ day, s1, s2 }] };
}
function schedulePage(data, now) {
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/schedule/index.js'), 'utf8'), {
    require: id => id.endsWith('/store') ? { ...Store, get: () => data } : id.endsWith('/schedule-hours') ? Hours : id.endsWith('/schedule-grid') ? Grid : {},
    Page: value => { page = value; },
    wx: {},
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  });
  page.setData = (values, done) => { Object.assign(page.data, values); if (done) done(); };
  return page;
}

test('semester totals include both people, odd weeks and dated substitutions exactly once', () => {
  const data = Store.defaults();
  data.settings.catStart = '2026-09-21';
  data.settings.dogStart = '2026-09-28';
  data.settings.weeks = 2;
  data.courses = [
    course('cat-Monday', 'cat', 1, 1, 2),
    course('cat-Tuesday-odd', 'cat', 2, 3, 3, 'odd'),
    course('dog-Monday-even', 'dog', 1, 1, 1, 'even')
  ];
  data.adjustments = [
    { date: '2026-09-21', owner: 'cat', kind: 'off' },
    { date: '2026-09-26', owner: 'cat', kind: 'use', sourceDate: '2026-09-22' }
  ];
  const now = new Date(2026, 8, 26, 10, 0);
  const stats = Hours.calculate(data, now);
  assert.deepEqual(stats.cat, { total: 4, completed: 1 });
  assert.deepEqual(stats.dog, { total: 1, completed: 0 });
  assert.deepEqual(stats.both, { total: 5, completed: 1 });
  const page = schedulePage(data, '2026-09-26T10:00:00');
  page.data.week = 1;
  page.render();
  assert.deepEqual(Array.from(page.data.hourRows, row => [row.name, row.owner, row.total, row.completed, row.percent]), [
    ['小猫', 'cat', 4, 1, 25],
    ['小狗', 'dog', 1, 0, 0]
  ]);
  page.filter({ currentTarget: { dataset: { value: 'cat' } } });
  assert.deepEqual(Array.from(page.data.hourRows, row => row.owner), ['cat']);
  page.filter({ currentTarget: { dataset: { value: 'dog' } } });
  assert.deepEqual(Array.from(page.data.hourRows, row => row.owner), ['dog']);
});

test('an in-progress multi-section class completes one section at a time', () => {
  const data = Store.defaults();
  data.settings.catStart = '2026-09-21';
  data.settings.dogStart = '2026-09-21';
  data.settings.weeks = 1;
  data.courses = [course('two-sections', 'cat', 1, 1, 2)];
  assert.deepEqual(Hours.calculate(data, new Date(2026, 8, 21, 9, 17)).cat, { total: 2, completed: 1 });
  assert.deepEqual(Hours.calculate(data, new Date(2026, 8, 21, 10, 6)).cat, { total: 2, completed: 2 });
});

test('an empty timetable stays at zero progress', () => {
  const data = Store.defaults();
  data.courses = [];
  const page = schedulePage(data, '2026-09-26T10:00:00');
  page.data.week = 4;
  page.render();
  assert.deepEqual(Array.from(page.data.hourRows, row => [row.total, row.percent]), [[0, 0], [0, 0]]);
});
