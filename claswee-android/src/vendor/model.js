// Timetable rules migrated from the existing claswee mini-program.
const KEY = 'claswe_data_v1';
const DEFAULT_WEEKS = 19;
const DEFAULT_SECTIONS = [
  ['08:30', '09:15'], ['09:20', '10:05'], ['10:25', '11:10'], ['11:15', '12:00'],
  ['13:30', '14:15'], ['14:20', '15:05'], ['15:25', '16:10'], ['16:15', '17:00'],
  ['18:30', '19:15'], ['19:20', '20:05'], ['20:10', '20:55'], ['21:00', '21:45']
].map(([s, e]) => ({ s, e }));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sampleCourses(weeks) {
  const seed = Date.now();
  return [
    ['cat', '高等数学', '33楼204', '张老师', 1, 1, 2, 'all'],
    ['cat', '大学英语', '外语楼301', '', 2, 3, 4, 'all'],
    ['cat', '线性代数', '33楼208', '', 3, 1, 2, 'odd'],
    ['dog', '数据结构', '信息楼512', '李老师', 1, 6, 8, 'all'],
    ['dog', '计算机网络', '信息楼508', '', 4, 1, 2, 'all'],
    ['dog', '体育（篮球）', '东体育场', '', 5, 3, 4, 'even']
  ].map((item, index) => ({
    id: `sample_${seed}_${index}`, owner: item[0], name: item[1], loc: item[2], teacher: item[3],
    day: item[4], s1: item[5], s2: item[6], slots: [{ day: item[4], s1: item[5], s2: item[6] }],
    week: item[7], wf: 1, wt: weeks, customParity: 'all'
  }));
}
function defaults() {
  return {
    version: 3, productName: 'claswee', me: 'cat', updatedAt: Date.now(),
    users: { cat: { name: '小猫', avatar: '🐱' }, dog: { name: '小狗', avatar: '🐶' } },
    settings: { start: '2026-08-31', catStart: '2026-08-31', dogStart: '2026-08-31', weeks: DEFAULT_WEEKS, weekend: true, layoutMode: 'sections', lunchAfter: 4, dinnerAfter: 8,
      sections: clone(DEFAULT_SECTIONS), catSections: clone(DEFAULT_SECTIONS), dogSections: clone(DEFAULT_SECTIONS) },
    courses: sampleCourses(DEFAULT_WEEKS), deletedCourses: [], adjustments: []
  };
}
function sectionVersion(settings, owner) {
  const versions = settings && settings.sectionTimesUpdatedAt;
  const value = versions && Number(versions[owner]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function sameSections(a, b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }
function mergeSectionTimes(local, remote) {
  const versions = {};
  let mergedLocal = false;
  ['cat', 'dog'].forEach(owner => {
    const field = owner === 'dog' ? 'dogSections' : 'catSections';
    const localVersion = sectionVersion(local.settings, owner), remoteVersion = sectionVersion(remote.settings, owner);
    const localHasVersion = localVersion > 0, remoteHasVersion = remoteVersion > 0;
    const useLocal = localHasVersion !== remoteHasVersion
      ? localHasVersion
      : localHasVersion
        ? localVersion >= remoteVersion
        : (+local.updatedAt || 0) >= (+remote.updatedAt || 0);
    if (useLocal) {
      const sectionsChanged = !sameSections(local.settings[field], remote.settings[field]);
      remote.settings[field] = clone(local.settings[field]);
      if (localHasVersion) versions[owner] = localVersion;
      if (sectionsChanged || localHasVersion !== remoteHasVersion || localVersion !== remoteVersion) mergedLocal = true;
    } else if (remoteHasVersion) versions[owner] = remoteVersion;
  });
  if (Object.keys(versions).length) remote.settings.sectionTimesUpdatedAt = versions;
  else delete remote.settings.sectionTimesUpdatedAt;
  return mergedLocal;
}
function markSectionTimesChanged(data, owners) {
  if (!data.settings) data.settings = {};
  if (!data.settings.sectionTimesUpdatedAt || typeof data.settings.sectionTimesUpdatedAt !== 'object') data.settings.sectionTimesUpdatedAt = {};
  (Array.isArray(owners) ? owners : [owners]).filter(owner => owner === 'cat' || owner === 'dog').forEach(owner => {
    const previous = Number(data.settings.sectionTimesUpdatedAt[owner]) || 0;
    data.settings.sectionTimesUpdatedAt[owner] = Math.max(Date.now(), previous + 1);
  });
  return data;
}
function makeSections(list, fallback) {
  const source = Array.isArray(list) && list.length ? list : fallback;
  return source.map(x => ({ s: x.s || '08:30', e: x.e || '09:15' }));
}
function normalizeBreaks(settings, sectionCount) {
  const last = Math.max(1, sectionCount);
  const lunchLimit = Math.max(1, last - 1);
  const lunchValue = Number(settings.lunchAfter);
  const lunchAfter = Number.isInteger(lunchValue) && lunchValue >= 1 ? Math.min(lunchValue, lunchLimit) : Math.min(4, lunchLimit);
  const dinnerValue = Number(settings.dinnerAfter);
  const dinnerAfter = Number.isInteger(dinnerValue) && dinnerValue > lunchAfter ? Math.min(dinnerValue, last) : Math.min(8, last);
  return { lunchAfter, dinnerAfter: Math.max(Math.min(last, lunchAfter + 1), dinnerAfter) };
}
function validDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parts = text.split('-').map(Number), date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}
function isMonday(value) { return validDate(value) && dateFromKey(value).getDay() === 1; }
function mondayDays(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1970 || year > 2100 || month < 1 || month > 12) return [];
  const first = new Date(year, month - 1, 1), days = [];
  const last = new Date(year, month, 0).getDate();
  for (let day = 1 + (8 - first.getDay()) % 7; day <= last; day += 7) days.push(day);
  return days;
}
function dayNumber(value) {
  if (value instanceof Date) return Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000);
  const parts = String(value || '').split('-').map(Number);
  return Math.floor(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1) / 86400000);
}
function dateKey(value) {
  if (!(value instanceof Date)) return String(value || '');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function dateFromKey(value) {
  const parts = value.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function weekday(value) { const day = value.getDay(); return day || 7; }
function earlierDate(a, b) { return dayNumber(a) <= dayNumber(b) ? a : b; }
function ownerStart(data, owner) { return owner === 'dog' ? data.settings.dogStart : data.settings.catStart; }
function calendarStart(data) { return earlierDate(data.settings.catStart, data.settings.dogStart); }
function calendarWeeks(data) {
  // 公共周导航覆盖两人的完整日期范围，每门课仍按所属人的周次计算。
  const anchor = dayNumber(calendarStart(data));
  const totalWeeks = +data.settings.weeks || 1;
  const lastDate = Math.max(
    dayNumber(data.settings.catStart) + totalWeeks * 7 - 1,
    dayNumber(data.settings.dogStart) + totalWeeks * 7 - 1);
  return Math.max(1, Math.floor((lastDate - anchor) / 7) + 1);
}
function weekForDate(data, owner, date) {
  return Math.floor((dayNumber(date) - dayNumber(ownerStart(data, owner))) / 7) + 1;
}
function adjustmentFor(data, owner, date) {
  const key = dateKey(date);
  return (data.adjustments || []).find(item => item.date === key && item.owner === owner) || null;
}
function effectiveDay(data, owner, date) {
  const rule = adjustmentFor(data, owner, date);
  if (rule && rule.kind === 'off') return { kind: 'off', day: 0, week: 0, rule };
  const sourceDate = rule && rule.kind === 'use' ? dateFromKey(rule.sourceDate) : (date instanceof Date ? date : dateFromKey(dateKey(date)));
  return { kind: rule ? 'use' : 'normal', day: weekday(sourceDate), week: weekForDate(data, owner, sourceDate), rule };
}
function normalize(raw) {
  const base = defaults();
  const data = raw && typeof raw === 'object' ? raw : base;
  data.version = 3;
  data.productName = !data.productName || data.productName === 'claswe' ? base.productName : data.productName;
  data.me = data.me === 'dog' ? 'dog' : 'cat';
  data.users = data.users || {};
  ['cat', 'dog'].forEach(owner => {
    data.users[owner] = data.users[owner] || {};
    data.users[owner].name = data.users[owner].name || base.users[owner].name;
    data.users[owner].avatar = data.users[owner].avatar || base.users[owner].avatar;
  });
  data.settings = data.settings || {};
  const legacyStart = validDate(data.settings.start) ? data.settings.start : (validDate(data.settings.catStart) ? data.settings.catStart : (validDate(data.settings.dogStart) ? data.settings.dogStart : base.settings.start));
  data.settings.catStart = validDate(data.settings.catStart) ? data.settings.catStart : legacyStart;
  data.settings.dogStart = validDate(data.settings.dogStart) ? data.settings.dogStart : legacyStart;
  data.settings.start = earlierDate(data.settings.catStart, data.settings.dogStart);
  data.settings.weeks = Math.max(1, Math.min(40, +data.settings.weeks || DEFAULT_WEEKS));
  // The phone timetable always includes the weekend, including legacy hidden-weekend data.
  // Image export keeps its own device-local preference, outside the synced timetable.
  data.settings.weekend = true;
  data.settings.layoutMode = data.settings.layoutMode === 'timeline' ? 'timeline' : 'sections';
  delete data.settings.sectionBgColor;
  delete data.settings.sectionBgImage;
  const legacy = makeSections(data.settings.sections, DEFAULT_SECTIONS);
  data.settings.catSections = makeSections(data.settings.catSections, legacy);
  data.settings.dogSections = makeSections(data.settings.dogSections, legacy);
  if (data.settings.sectionTimesUpdatedAt && typeof data.settings.sectionTimesUpdatedAt === 'object') {
    const versions = {};
    ['cat', 'dog'].forEach(owner => { const value = Number(data.settings.sectionTimesUpdatedAt[owner]); if (Number.isFinite(value) && value > 0) versions[owner] = value; });
    if (Object.keys(versions).length) data.settings.sectionTimesUpdatedAt = versions;
    else delete data.settings.sectionTimesUpdatedAt;
  } else delete data.settings.sectionTimesUpdatedAt;
  /* 两个人的节次时间独立保存；公共字段只作为旧版兼容的网格骨架。 */
  data.settings.sections = clone(data.settings.catSections.length >= data.settings.dogSections.length ? data.settings.catSections : data.settings.dogSections);
  Object.assign(data.settings, normalizeBreaks(data.settings, data.settings.sections.length));
  data.courses = Array.isArray(data.courses) ? data.courses : [];
  data.courses.forEach(course => {
    course.id = course.id || `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    course.owner = course.owner === 'dog' ? 'dog' : 'cat';
    course.name = String(course.name || '未命名课程');
    course.loc = course.loc || ''; course.teacher = course.teacher || '';
    const sectionCount = Math.max(1, (course.owner === 'dog' ? data.settings.dogSections : data.settings.catSections).length);
    const slots = Array.isArray(course.slots) && course.slots.length ? course.slots : [{ day: course.day || 1, s1: course.s1 || 1, s2: course.s2 || 1 }];
    course.slots = slots.map(slot => ({ day: Math.max(1, Math.min(7, +slot.day || 1)), s1: Math.max(1, Math.min(sectionCount, +slot.s1 || 1)), s2: Math.max(1, Math.min(sectionCount, +slot.s2 || 1)) })).map(slot => ({ ...slot, s2: Math.max(slot.s1, slot.s2) }));
    Object.assign(course, course.slots[0]);
    course.week = ['all', 'odd', 'even', 'custom'].includes(course.week) ? course.week : 'all';
    course.wf = Math.max(1, +course.wf || 1); course.wt = Math.max(course.wf, +course.wt || data.settings.weeks);
    course.customParity = ['all', 'odd', 'even'].includes(course.customParity) ? course.customParity : 'all';
  });
  data.deletedCourses = Array.isArray(data.deletedCourses) ? data.deletedCourses : [];
  const adjustments = new Map();
  (Array.isArray(data.adjustments) ? data.adjustments : []).forEach(item => {
    if (!item || !validDate(item.date) || !['cat', 'dog'].includes(item.owner) || !['off', 'use'].includes(item.kind)) return;
    if (item.kind === 'use' && !validDate(item.sourceDate)) return;
    adjustments.set(`${item.date}_${item.owner}`, {
      date: item.date, owner: item.owner, kind: item.kind,
      ...(item.kind === 'use' ? { sourceDate: item.sourceDate } : {})
    });
  });
  data.adjustments = Array.from(adjustments.values()).sort((a, b) => a.date.localeCompare(b.date) || a.owner.localeCompare(b.owner));
  data.updatedAt = +data.updatedAt || Date.now();
  return data;
}
function inWeek(course, week) {
  if (week < (+course.wf || 1) || week > (+course.wt || Infinity)) return false;
  if (course.week === 'odd') return week % 2 === 1;
  if (course.week === 'even') return week % 2 === 0;
  if (course.week === 'custom') {
    if (week < +course.wf || week > +course.wt) return false;
    if (course.customParity === 'odd') return week % 2 === 1;
    if (course.customParity === 'even') return week % 2 === 0;
  }
  return true;
}
function weekText(course) {
  if (course.week === 'odd') return '单周';
  if (course.week === 'even') return '双周';
  if (course.week === 'custom') return `第${course.wf}–${course.wt}周${course.customParity === 'all' ? '' : `（${course.customParity === 'odd' ? '单周' : '双周'}）`}`;
  return '每周';
}
export { KEY, DEFAULT_SECTIONS, defaults, normalize, clone, markSectionTimesChanged, mergeSectionTimes, inWeek, weekText, ownerStart, calendarStart, calendarWeeks, weekForDate, dateKey, adjustmentFor, effectiveDay, isMonday, mondayDays, dayNumber, dateFromKey };
