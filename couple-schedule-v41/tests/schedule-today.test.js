const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const Hours = require('../miniprogram/utils/schedule-hours');
const Grid = require('../miniprogram/utils/schedule-grid');
const UI = require('./fixtures/ui-mocks');

function loadPage(name, store, wx = {}) {
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages', name, 'index.js'), 'utf8'), {
    require: id => id.endsWith('/store') ? store : id.endsWith('/schedule-hours') ? Hours : id.endsWith('/schedule-grid') ? Grid : id.endsWith('/skin') ? UI.skin : id.endsWith('/notifications') ? UI.notifications : {},
    Page: value => { page = value; }, wx,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [2026, 8, 22, 10])); } }
  });
  page.setData = values => Object.assign(page.data, values);
  return page;
}

test('avatar uses actual today and owner calendar, parity, slots and section times', () => {
  const data = Store.defaults();
  data.settings.dogStart = '2026-09-07';
  data.settings.dogSections[0] = { s: '09:00', e: '09:45' };
  const course = (id, owner, week, slots) => ({ id, owner, name: id, week, wf: 1, wt: 20, slots });
  data.courses = [
    course('cat-even', 'cat', 'even', [{ day: 2, s1: 3, s2: 4 }, { day: 2, s1: 1, s2: 2 }]),
    course('cat-odd', 'cat', 'odd', [{ day: 2, s1: 1, s2: 2 }]),
    course('dog-odd', 'dog', 'odd', [{ day: 2, s1: 1, s2: 1 }]),
    course('wrong-day', 'cat', 'all', [{ day: 1, s1: 1, s2: 2 }])
  ];
  const page = loadPage('schedule', { ...Store, get: () => data });
  page.data.week = 12;
  page.data.filter = 'dog';
  page.showToday({ currentTarget: { dataset: { owner: 'cat' } } });
  assert.equal(page.data.todayCourses.length, 2);
  assert.equal(page.data.todayCourses[0].name, 'cat-even');
  assert.equal(page.data.todayCourses[0].time, '08:30–10:05');
  assert.equal(page.data.week, 12);
  page.showToday({ currentTarget: { dataset: { owner: 'dog' } } });
  assert.equal(page.data.todayCourses.length, 1);
  assert.equal(page.data.todayCourses[0].name, 'dog-odd');
  assert.equal(page.data.todayCourses[0].time, '09:00–09:45');
  data.settings.dogStart = '2026-10-05';
  page.showToday({ currentTarget: { dataset: { owner: 'dog' } } });
  assert.equal(page.data.todayCourses.length, 0);
  page.closeToday();
  assert.equal(page.data.todayOpen, false);
});

test('together view keeps classroom and teacher on overlapping course cards and daily timeline', () => {
  const data = Store.defaults();
  data.courses = [
    { id: 'cat-class', owner: 'cat', name: '高等数学', loc: 'A302', teacher: '张老师', week: 'all', wf: 1, wt: 19, slots: [{ day: 1, s1: 1, s2: 2 }] },
    { id: 'dog-class', owner: 'dog', name: '数据结构', loc: 'B512', teacher: '李老师', week: 'all', wf: 1, wt: 19, slots: [{ day: 1, s1: 1, s2: 2 }] }
  ];
  const page = loadPage('schedule', { ...Store, get: () => data });
  page.data.week = 1;
  page.data.timelineDay = 1;
  page.render();
  assert.deepEqual(Array.from(page.data.columns[0].cards, card => [card.narrow, card.loc, card.teacher]), [
    [true, 'A302', '张老师'], [true, 'B512', '李老师']
  ]);
  assert.deepEqual(Array.from(page.data.catItems, item => [item.loc, item.teacher]), [['A302', '张老师']]);
  assert.deepEqual(Array.from(page.data.dogItems, item => [item.loc, item.teacher]), [['B512', '李老师']]);
  const template = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/schedule/index.wxml'), 'utf8');
  assert.match(template, /wx:if="\{\{card\.loc\}\}" class="course-loc"/);
  assert.match(template, /wx:if="\{\{card\.teacher\}\}" class="course-teacher"/);
  page.data.filter = 'cat';
  page.render();
  assert.deepEqual(Array.from(page.data.columns[0].cards, card => [card.narrow, card.loc, card.teacher]), [
    [false, 'A302', '张老师']
  ]);
});

test('legacy hidden weekends return on the phone grid and both weekend days remain available in timeline', () => {
  const data = Store.defaults(); data.settings.weekend = false;
  data.courses = [
    { id: 'saturday', owner: 'cat', name: '周六补课', loc: 'A302', teacher: '张老师', week: 'all', wf: 1, wt: 19, slots: [{ day: 6, s1: 1, s2: 2 }] },
    { id: 'sunday', owner: 'dog', name: '周日实验', loc: 'B512', teacher: '李老师', week: 'all', wf: 1, wt: 19, slots: [{ day: 7, s1: 3, s2: 4 }] }
  ];
  assert.equal(Store.normalize(Store.clone(data)).settings.weekend, true);
  const page = loadPage('schedule', { ...Store, get: () => data });
  page.data.week = 7; page.data.timelineDay = 6; page.render();
  assert.equal(page.data.columns.length, 7); assert.equal(page.data.weekRange, '10.12 – 10.18');
  assert.equal(page.data.columns[5].cards[0].name, '周六补课');
  assert.equal(page.data.columns[6].cards[0].name, '周日实验');
  assert.equal(page.data.timelineDays.length, 7); assert.equal(page.data.catItems[0].name, '周六补课');
  page.data.timelineDay = 7; page.render();
  assert.equal(page.data.timelineDayName, '周日'); assert.equal(page.data.dogItems[0].name, '周日实验');
});

test('legacy rest rows keep the old positions and short schedules clamp them safely', () => {
  const legacy = Store.defaults();
  delete legacy.settings.lunchAfter;
  delete legacy.settings.dinnerAfter;
  Store.normalize(legacy);
  assert.equal(legacy.settings.lunchAfter, 4);
  assert.equal(legacy.settings.dinnerAfter, 8);
  legacy.settings.catSections = legacy.settings.catSections.slice(0, 3);
  legacy.settings.dogSections = legacy.settings.dogSections.slice(0, 3);
  Store.normalize(legacy);
  assert.equal(legacy.settings.lunchAfter, 2);
  assert.equal(legacy.settings.dinnerAfter, 3);
});

test('configurable lunch and dinner rows split only at the selected sections', () => {
  const data = Store.defaults();
  data.settings.lunchAfter = 6;
  data.settings.dinnerAfter = 10;
  data.courses = [{ id:'cross', owner:'cat', name:'跨时段课', week:'all', wf:1, wt:19, slots:[{ day:1, s1:6, s2:11 }] }];
  const page = loadPage('schedule', { ...Store, get: () => data });
  page.data.week = 1;
  page.render();
  assert.equal(page.data.restRows.length, 2);
  assert.equal(page.data.restRows[0].label, '午休');
  assert.equal(page.data.restRows[1].label, '晚休');
  const cards = page.data.columns[0].cards;
  assert.deepEqual(Array.from(cards, card => [card.s1, card.s2]), [[6, 6], [7, 10], [11, 11]]);
  assert.equal(page.data.gridHeight, 12 * 100 + 2 * 34);
  data.settings.dinnerAfter = 12;
  page.render();
  assert.equal(page.data.restRows.length, 1);
  assert.deepEqual(Array.from(page.data.columns[0].cards, card => [card.s1, card.s2]), [[6, 6], [7, 11]]);
});

test('settings keep lunch before dinner when either picker is moved', () => {
  let data = Store.defaults(), saves = 0;
  const facade = { ...Store, get: () => structuredClone(data), save: value => { data = Store.normalize(value); saves++; return data; } };
  const page = loadPage('settings', facade, { setNavigationBarTitle() {} });
  page.load();
  assert.equal(page.data.lunchAfter, 4);
  assert.equal(page.data.dinnerAfter, 8);
  page.setBreak({ currentTarget:{ dataset:{ key:'lunchAfter' } }, detail:{ value:'8' } });
  assert.equal(data.settings.lunchAfter, 9);
  assert.equal(data.settings.dinnerAfter, 10);
  page.setBreak({ currentTarget:{ dataset:{ key:'dinnerAfter' } }, detail:{ value:'4' } });
  assert.equal(data.settings.lunchAfter, 5);
  assert.equal(data.settings.dinnerAfter, 6);
  assert.equal(saves, 2);
});
