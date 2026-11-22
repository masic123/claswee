const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const Parser = require('../miniprogram/utils/course-import');
const UI = require('./fixtures/ui-mocks');
test('new semesters default to 19 weeks while saved semester lengths are preserved', () => {
  assert.equal(Store.defaults().settings.weeks, 19);
  assert.ok(Store.defaults().courses.every(course => course.wt === 19));
  const saved = Store.defaults();
  saved.settings.weeks = 20;
  assert.equal(Store.normalize(saved).settings.weeks, 20);
});
function setup(wxOverrides = {}) {
  let data = Store.defaults(), page, modal, saves = 0;
  data.courses = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/image-import/index.js'), 'utf8'), {
    require: name => name.endsWith('/store') ? { get: () => structuredClone(data), save: value => { data = value; saves++; } } : name.endsWith('/sync') ? { config: () => ({clientId:'image-import-selftest'}) } : name.endsWith('/skin') ? UI.skin : Parser,
    Page: value => { page = value; }, wx: { showModal: value => { modal = value; }, showToast() {}, ...wxOverrides }
  });
  page.data = structuredClone(page.data); page.setData = value => Object.assign(page.data, value);
  page.settingsSnapshot = JSON.stringify(data.settings);
  page.data.courses = [{ name: '数学', loc: '', teacher: '', slots: [{ day: 1, s1: 1, s2: 2 }, { day: 3, s1: 3, s2: 4 }], week: 'odd', wf: 2, wt: 5 }];
  return { page, get data() { return data; }, get saves() { return saves; }, answer(confirm) { modal.success({ confirm }); } };
}
test('missing week range cannot be imported', () => {
  const s = setup(); s.page.data.courses[0].wf = ''; s.page.confirm(); assert.equal(s.saves, 0);
});
test('multiple slots retain exact odd weeks and repeated import deduplicates', () => {
  const s = setup(), courses = structuredClone(s.page.data.courses);
  s.page.confirm(); s.answer(true);
  assert.equal(s.saves, 1); assert.equal(s.data.courses.length, 4);
  assert.ok(s.data.courses.every(c => c.week === 'custom' && c.wf === c.wt && [3, 5].includes(c.wf)));
  s.page.data.courses = courses; s.page.confirm(); s.answer(true); assert.equal(s.data.courses.length, 4);
});
test('cancel and changed settings do not save', () => {
  const s = setup(); s.page.confirm(); s.answer(false); assert.equal(s.saves, 0);
  s.page.confirm(); s.data.settings.weeks++; s.answer(true); assert.equal(s.saves, 0);
});
test('cloud normalization keeps missing weeks unknown', () => {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/cloudfunctions/scheduleImageImport/index.js'), 'utf8'), {
    Buffer, process: { env: {} },
    require: name => name === 'wx-server-sdk' ? { init() {}, database: () => ({}) } : name === '@cloudbase/node-sdk' ? { init: () => ({ rdb: () => ({ headers: { set() {} } }) }) } : require(name), exports,
  });
  const c = exports._test.normalizeCourse({ name: '数学', slots: [{ day: 1, s1: 1, s2: 2 }] }, { weeks: 20, sectionCount: 12, owner: 'cat' });
  assert.equal(c.wf, null); assert.equal(c.wt, null);
  assert.equal(c.slots[0].s1, null);
  assert.throws(() => exports._test.parseModelJson('null', { weeks: 20 }), /识别结果格式异常/);
  assert.throws(() => exports._test.dataUrl('data:image/png;base64,PGh0bWw+'), /图片内容与格式不符/);
  const boundary = Buffer.alloc(3 * 1024 * 1024); boundary.set([255,216,255]);
  assert.ok(exports._test.dataUrl('data:image/jpeg;base64,' + boundary.toString('base64')));
  assert.throws(() => exports._test.dataUrl('data:image/jpeg;base64,' + Buffer.concat([boundary, Buffer.from([0])]).toString('base64')), /不能超过 3MB/);
  assert.equal(exports._test.normalizeCourse({ name: 'bad', slots: [{day:8,s1:4,s2:2}] }, {weeks:20,sectionCount:12}), null);
  const malformed = exports._test.normalizeCourse({ name: '数学', slots: [{day:1,s1:1,s2:2}], wf:true, wt:20 }, {weeks:20,sectionCount:12});
  assert.equal(malformed.wf, null);
  const partial = exports._test.parseModelJson(JSON.stringify({ courses:[{name:'bad',slots:[]}] }), {weeks:20,sectionCount:12});
  assert.equal(partial.courses.length, 0);
  assert.equal(partial.warnings.length, 1);
  const evidenced = exports._test.normalizeCourse({ name:'数学', slots:[{day:1,s1:7,s2:8,sectionEvidence:'第1-2节'}], wf:1,wt:20,weekEvidence:'1-16周' }, {weeks:20,sectionCount:12});
  assert.equal(evidenced.wf, 1); assert.equal(evidenced.wt, 16);
  assert.equal(evidenced.slots[0].s1, 1); assert.equal(evidenced.slots[0].s2, 2);
  const currentWeek = exports._test.normalizeCourse({name:'英语',slots:[{day:2,s1:8,s2:8,sectionEvidence:'教室33-108'}],wf:1,wt:20,weekEvidence:'WEEK 4'}, {weeks:20,sectionCount:12});
  assert.equal(currentWeek.wf, null); assert.equal(currentWeek.slots[0].s1, null);
  const merged = exports._test.parseModelJson(JSON.stringify({ courses: [
    { name: '数学', loc: 'A101', teacher: '张老师', slots: [{ day: 1 }] },
    { name: '数学', loc: 'A101', teacher: '张老师', slots: [{ day: 3 }] },
    { name: '数学', loc: 'B202', teacher: '张老师', slots: [{ day: 5 }] }
  ] }), { weeks: 20, sectionCount: 12, owner: 'cat' });
  assert.equal(merged.courses.length, 2);
  assert.equal(merged.courses[0].slots.length, 2);
  assert.equal(merged.warnings.length, 0);
});

test('unconfirmed section cannot be imported', () => {
  const s = setup(); s.page.data.courses[0].slots[0].s1 = null;
  s.page.confirm(); assert.equal(s.saves, 0);
});
test('layout suggestion stays separate until the user adopts it', () => {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/cloudfunctions/scheduleImageImport/index.js'), 'utf8'), {
    Buffer, process: { env: {} },
    require: name => name === 'wx-server-sdk' ? { init() {}, database: () => ({}) } : name === '@cloudbase/node-sdk' ? { init: () => ({ rdb: () => ({ headers: { set() {} } }) }) } : require(name), exports,
  });
  const sections = Store.defaults().settings.catSections;
  const course = exports._test.normalizeCourse({ name: '数学', slots: [{ day: 1, sectionHint: 'afternoon_second' }] }, { weeks: 20, sectionCount: 12, sections, owner: 'cat' });
  assert.equal(course.slots[0].s1, null);
  assert.equal(course.slots[0].suggestedS1, 7);
  assert.equal(course.slots[0].suggestedS2, 8);
  assert.equal(exports._test.sectionSuggestion('afternoon_second', sections.slice(0, 7)), null);
  assert.equal(exports._test.sectionSuggestion('afternoon_second', sections.map(() => ({ s: '09:00' }))), null);
  assert.equal(exports._test.sectionSuggestion('afternoon_second', sections, { lunchAfter:4, dinnerAfter:10 }).suggestedS1, 8);
  assert.equal(exports._test.sectionSuggestion('afternoon_second', sections, { lunchAfter:4, dinnerAfter:10 }).suggestedS2, 10);
  const s = setup();
  s.page.data.courses[0].slots[0] = { day: 1, s1: null, s2: null, suggestedS1: 7, suggestedS2: 8 };
  s.page.confirm(); assert.equal(s.saves, 0);
  s.page.acceptSuggestion({ currentTarget: { dataset: { index: 0, slot: 0 } } });
  assert.equal(s.page.data.courses[0].slots[0].s1, 7);
  assert.equal(s.page.data.courses[0].slots[0].s2, 8);
});

test('OCR date columns correct a model weekday swap only with a matching text anchor', () => {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/cloudfunctions/scheduleImageImport/index.js'), 'utf8'), {
    Buffer, process: { env: {} },
    require: name => name === 'wx-server-sdk' ? { init() {}, database: () => ({}) } : name === '@cloudbase/node-sdk' ? { init: () => ({ rdb: () => ({ headers: { set() {} } }) }) } : require(name), exports,
  });
  const ocr = { width:700, height:1300, lines:[
    ...['09/21','09/22','09/23','09/24','09/25','09/26','09/27'].map((text,index) => ({ id:`t${index+1}`, text, score:.98, box:[index*100+20,100,index*100+70,120] })),
    { id:'t8', text:'高等数学', score:.97, box:[130,400,185,430] },
    { id:'t9', text:'33-20', score:.99, box:[130,440,185,470] },
    { id:'t10', text:'12-10', score:.99, box:[130,440,185,470] },
  ] };
  const headers = exports._test.ocrHeaders(ocr, new Date('2026-09-23T00:00:00Z'));
  assert.equal(headers.length, 7); assert.equal(headers[0].day, 1);
  const result = exports._test.parseModelJson(JSON.stringify({courses:[{name:'高等数学',slots:[{day:1,sourceIds:['t8']}]}]}), { owner:'cat', weeks:20, sectionCount:12, sections:Store.defaults().settings.catSections }, ocr);
  assert.equal(result.courses[0].slots[0].day, 2);
  assert.equal(result.courses[0].slots[0].daySource, 'ocr');
  assert.equal(exports._test.ocrHeaders({ ...ocr, lines:ocr.lines.slice(0,7) }, new Date('2025-04-01T00:00:00Z')).length, 0);
});
test('OCR timeout keeps the original vision path available', async () => {
  const exports = {}, saved = [];
  const image = Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
  const pgDb = { headers:{ set() {} }, from(table) {
    return {
      select() { return this; }, eq() { return this; }, order() {
        return Promise.resolve({ data:[{ part_index:0, part_count:1, mime:'png', content:image }] });
      },
      upsert(row) { saved.push({ table, row }); return Promise.resolve({ data:[] }); }
    };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/cloudfunctions/scheduleImageImport/index.js'), 'utf8'), {
    Buffer, process:{ env:{ SCHEDULE_OCR_SERVICE_KEY:'private-test' } },
    require:name => name === 'wx-server-sdk' ? { init() {}, database:() => ({}) }
      : name === '@cloudbase/node-sdk' ? { init:() => ({ rdb:() => pgDb, callFunction:async () => { throw Object.assign(new Error('timed out'), { code:'TIMEOUT' }); } }) }
      : require(name), exports, console:{ warn() {} }
  });
  const result = await exports._test.prepareOcr({ uploadId:'valid_upload_id_1234' }, 'client-hash');
  assert.equal(result.ocrReady, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].table, 'claswee_image_import_ocr');
  assert.equal(Object.keys(saved[0].row.result).length, 0);
});
test('DeepSeek vision uses the official image endpoint and structured response', async () => {
  const exports = {}, requests = [], env = { SCHEDULE_VISION_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-key' };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/cloudfunctions/scheduleImageImport/index.js'), 'utf8'), {
    Buffer, AbortSignal, process: { env },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ courses: [{ name: '数学', slots: [{ day: 1, sectionEvidence: '第1-2节' }], weekEvidence: '1-16周' }], warnings: [] }) } }] }) };
    },
    require: name => name === 'wx-server-sdk' ? { init() {}, database: () => ({}) } : name === '@cloudbase/node-sdk' ? { init: () => ({ rdb: () => ({ headers: { set() {} } }) }) } : require(name), exports,
  });
  const config = exports._test.visionConfig(env);
  assert.equal(config.model, 'deepseek-flash');
  assert.equal(config.url, 'https://api.deepseek.com/chat/completions');
  assert.throws(() => exports._test.visionConfig({ SCHEDULE_VISION_PROVIDER: 'deepseek' }), /正在配置/);
  const result = await exports._test.recognize('data:image/png;base64,iVBORw0KGgo=', { owner: 'cat', weeks: 20, sectionCount: 12, sections: Store.defaults().settings.catSections });
  assert.equal(result.courses[0].wf, 1);
  assert.equal(result.courses[0].slots[0].s2, 2);
  assert.equal(requests[0].url, config.url);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.messages[1].content[1].image_url.detail, 'original');
  assert.equal(body.thinking.type, 'disabled');
  assert.equal(body.response_format.type, 'json_object');
  const ocr = { width: 700, height: 1800, lines: [{ id:'t1', text:'数学', score:.98, box:[120,400,180,430] }],
    crops:[{ top:0, bottom:950, image:'data:image/jpeg;base64,/9j/' }, { top:900, bottom:1800, image:'data:image/jpeg;base64,/9j/' }] };
  await exports._test.recognize('data:image/png;base64,iVBORw0KGgo=', { owner:'cat', weeks:20, sectionCount:12, sections:Store.defaults().settings.catSections }, 'test', ocr);
  const withOcr = JSON.parse(requests[1].options.body);
  assert.equal(withOcr.messages[1].content.length, 4);
  assert.equal(withOcr.messages[1].content[1].image_url.detail, 'low');
  assert.equal(withOcr.messages[1].content[2].image_url.detail, 'original');
  assert.ok(withOcr.messages[0].content.includes('t1'));
});

test('initial owner follows current user and preserves explicit selection on return', () => {
  const s = setup(); s.data.me = 'dog'; s.page.onShow();
  assert.equal(s.page.data.owner, 'dog');
  s.page.chooseOwner({currentTarget:{dataset:{owner:'cat'}}}); s.page.onShow();
  assert.equal(s.page.data.owner, 'cat');
});

test('pending image selection blocks recognition and ignores callbacks after unload', () => {
  let choose, compress;
  const s = setup({chooseMedia: options => { choose = options; }, compressImage: options => { compress = options; }});
  s.page.data.imagePath = 'old.png';
  s.page.chooseImage(); s.page.recognize();
  assert.equal(s.page.data.busy, false);
  choose.success({tempFiles:[{tempFilePath:'new.png'}]});
  s.page.onUnload(); compress.success({tempFilePath:'compressed.jpg'});
  assert.equal(s.page.data.imagePath, 'old.png');
  assert.equal(s.page.choosingImage, false);
});

test('large screenshot is sent as bounded chunks before recognition', async () => {
  const calls = [], pending = [], base64 = '/9j/' + 'A'.repeat(205000);
  const s = setup({
    getFileSystemManager: () => ({ readFile: options => options.success({ data: base64 }) }),
    request: options => {
      calls.push(options.data);
      if (options.data.action === 'upload' && options.data.partIndex > 0) { pending.push(options); return; }
      options.success({ statusCode: 200, data: options.data.action === 'recognize' ? { ok: true, courses: [], warnings: [] } : { ok: true, uploaded: options.data.partIndex + 1 } });
    }
  });
  s.data.settings.lunchAfter = 6;
  s.data.settings.dinnerAfter = 10;
  s.page.data.imagePath = 'schedule.jpg';
  s.page.recognize();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2);
  assert.deepEqual(calls.map(call => call.action), ['upload', 'upload', 'upload']);
  pending[1].success({ statusCode:200, data:{ ok:true, uploaded:3 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 3);
  pending[0].success({ statusCode:200, data:{ ok:true, uploaded:2 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call.action), ['upload', 'upload', 'upload', 'prepare', 'recognize']);
  assert.ok(calls.slice(3).every(call => call.lunchAfter === 6 && call.dinnerAfter === 10));
  assert.ok(calls.slice(0, 3).every(call => call.content.length <= 80000));
  assert.equal(calls.slice(0, 3).map(call => call.content).join(''), base64);
  assert.equal(s.page.data.busy, false);
});
test('failed parallel upload waits for in-flight chunks before cleanup', async () => {
  const calls = [];
  let lastPart;
  const s = setup({
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'/9j/' + 'A'.repeat(205000) }) }),
    request: options => {
      calls.push(options.data.action);
      if (options.data.action === 'upload' && options.data.partIndex === 1) return options.fail({ errMsg:'network failed' });
      if (options.data.action === 'upload' && options.data.partIndex === 2) { lastPart = options; return; }
      options.success({ statusCode:200, data:{ ok:true } });
    }
  });
  s.page.data.imagePath = 'schedule.jpg';
  s.page.recognize();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(lastPart);
  assert.equal(calls.includes('cancel'), false);
  lastPart.success({ statusCode:200, data:{ ok:true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.at(-1), 'cancel');
  assert.equal(calls.includes('prepare'), false);
});

test('uncompressed image below 3MB is kept at original quality', () => {
  let choose, compressed = false;
  const s = setup({ chooseMedia: options => { choose = options; }, compressImage: () => { compressed = true; } });
  s.page.chooseImage();
  choose.success({ tempFiles:[{ tempFilePath:'original.jpg', size:227000 }] });
  assert.equal(s.page.data.imagePath, 'original.jpg');
  assert.equal(compressed, false);
});

test('missing course weeks default to the 19-week semester and estimated sections remain reviewable', async () => {
  const s = setup({
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'/9j/' + 'A'.repeat(100) }) }),
    request: options => options.success({ statusCode:200, data:options.data.action === 'recognize'
      ? { ok:true, courses:[{ name:'数学', slots:[{ day:1, suggestedS1:7, suggestedS2:8, dayUncertain:true }], wf:null, wt:null }], warnings:[] }
      : { ok:true, ocrReady:true } })
  });
  s.page.data.imagePath = 'example.jpg';
  s.page.recognize();
  await new Promise(resolve => setImmediate(resolve));
  const slot = s.page.data.courses[0].slots[0];
  assert.equal(slot.s1, 7); assert.equal(slot.s2, 8);
  assert.equal(slot.sectionEstimated, true); assert.equal(slot.dayUncertain, true);
  assert.equal(s.page.data.courses[0].wf, 1);
  assert.equal(s.page.data.courses[0].wt, 19);
  assert.equal(s.page.data.courses[0].weekDefaulted, true);
  s.page.pick({ currentTarget:{ dataset:{ index:0, slot:0, key:'s1' } }, detail:{ value:'6' } });
  assert.equal(s.page.data.courses[0].slots[0].sectionEstimated, false);
  s.page.confirm(); assert.equal(s.saves, 0);
  s.answer(true); assert.equal(s.saves, 1);
  assert.ok(s.data.courses.every(course => !Object.hasOwn(course, 'weekDefaulted') && !Object.hasOwn(course, 'sectionEstimated')));
});

test('missing course weeks follow an existing semester setting without replacing explicit ranges', async () => {
  const s = setup({
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'/9j/' + 'A'.repeat(100) }) }),
    request: options => options.success({ statusCode:200, data:options.data.action === 'recognize'
      ? { ok:true, courses:[
        { name:'数学', slots:[{ day:1, s1:1, s2:2 }], wf:null, wt:null },
        { name:'英语', slots:[{ day:2, s1:3, s2:4 }], wf:4, wt:16 }
      ], warnings:[] }
      : { ok:true, ocrReady:true } })
  });
  s.data.settings.weeks = 20;
  s.page.settingsSnapshot = JSON.stringify(s.data.settings);
  s.page.data.imagePath = 'example.jpg';
  s.page.recognize();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.page.data.courses[0].wf, 1);
  assert.equal(s.page.data.courses[0].wt, 20);
  assert.equal(s.page.data.courses[0].weekDefaulted, true);
  assert.equal(s.page.data.courses[1].wf, 4);
  assert.equal(s.page.data.courses[1].wt, 16);
  assert.equal(s.page.data.courses[1].weekDefaulted, false);
  s.page.input({ currentTarget:{ dataset:{ index:0, key:'wt' } }, detail:{ value:'18' } });
  assert.equal(s.page.data.courses[0].weekDefaulted, true);
  s.page.input({ currentTarget:{ dataset:{ index:0, key:'wf' } }, detail:{ value:'2' } });
  assert.equal(s.page.data.courses[0].weekDefaulted, false);
});
