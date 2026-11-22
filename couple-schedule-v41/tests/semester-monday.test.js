const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const UI = require('./fixtures/ui-mocks');

function setup(initial = Store.defaults()) {
  let data = structuredClone(initial), page, saves = 0;
  const toasts = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/settings/index.js'), 'utf8'), {
    require: id => id.endsWith('/store') ? {
      ...Store, get: () => structuredClone(data), save: value => { data = structuredClone(value); saves++; }
    } : id.endsWith('/skin') ? UI.skin : {},
    Page: value => { page = value; },
    wx: { setNavigationBarTitle() {}, showToast: value => toasts.push(value) }
  });
  page.data = structuredClone(page.data);
  page.setData = values => Object.assign(page.data, values);
  page.load();
  return { page, toasts, get data() { return data; }, get saves() { return saves; } };
}

test('every selectable month lists all and only its real Mondays, including leap years', () => {
  for (let year = 1970; year <= 2100; year++) {
    for (let month = 1; month <= 12; month++) {
      const expected = [];
      for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
        if (new Date(year, month - 1, day).getDay() === 1) expected.push(day);
      }
      assert.deepEqual(Store.mondayDays(year, month), expected, `${year}-${month}`);
    }
  }
  assert.equal(Store.isMonday('2026-09-06'), false);
  assert.equal(Store.isMonday('2026-09-07'), true);
  assert.equal(Store.isMonday('2026-02-30'), false);
  assert.equal(Store.isMonday('2024-02-29'), false);
  assert.equal(Store.isMonday('2024-01-01'), true);
  assert.deepEqual(Store.mondayDays(2026, 13), []);
});

test('both start pickers save a selected Monday without changing the other person or courses', () => {
  const s = setup(), originalCourses = structuredClone(s.data.courses);
  s.page.setCatStart({ detail: { value: [2026 - 1970, 8, 0] } });
  assert.equal(s.data.settings.catStart, '2026-09-07');
  assert.equal(s.data.settings.dogStart, '2026-08-31');
  s.page.setDogStart({ detail: { value: [2026 - 1970, 9, 2] } });
  assert.equal(s.data.settings.dogStart, '2026-10-19');
  assert.deepEqual(s.data.courses, originalCourses);
  assert.equal(s.saves, 2);
});

test('switching from a five-Monday month to a four-Monday month keeps a valid day and cancel never saves', () => {
  const s = setup();
  assert.equal(s.page.data.catStartRange[2].length, 5);
  assert.equal(s.page.data.catStartValue[2], 4);
  s.page.changeStartColumn({ currentTarget: { dataset: { owner: 'cat' } }, detail: { column: 1, value: 8 } });
  assert.deepEqual(Array.from(s.page.data.catStartRange[2]), ['7日（周一）', '14日（周一）', '21日（周一）', '28日（周一）']);
  assert.equal(s.page.data.catStartValue[2], 3);
  assert.equal(s.saves, 0);
  s.page.cancelStartPicker();
  assert.equal(s.page.data.catStartValue[1], 7);
  assert.equal(s.page.data.catStartValue[2], 4);
  assert.equal(s.saves, 0);
});

test('invalid picker events cannot save non-Mondays or out-of-range dates', () => {
  const s = setup();
  for (const value of ['2026-09-06', [-1, 8, 0], [56, 12, 0], [56, 8, 4], [56, 8, 0.5], [56, 8]]) {
    s.page.setCatStart({ detail: { value } });
    s.page.setDogStart({ detail: { value } });
  }
  assert.equal(s.saves, 0);
  assert.equal(s.data.settings.catStart, '2026-08-31');
  assert.equal(s.data.settings.dogStart, '2026-08-31');
});

test('opening legacy non-Monday settings flags them without silently rewriting shared data', () => {
  const data = Store.defaults(); data.settings.catStart = '2026-09-06';
  const s = setup(data);
  assert.equal(s.page.data.catStartInvalid, true);
  assert.equal(s.data.settings.catStart, '2026-09-06');
  assert.equal(s.saves, 0);
  s.page.setCatStart({ detail: { value: [56, 8, 0] } });
  assert.equal(s.data.settings.catStart, '2026-09-07');
  assert.equal(s.page.data.catStartInvalid, false);
});
