import { clone, normalize, defaults, inWeek, effectiveDay, dateKey, dateFromKey, dayNumber, calendarStart } from '../vendor/model.js';
export { clone, normalize, defaults, inWeek, dateKey, dateFromKey };
export const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const uuid = prefix => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
export function emptyData() { const data = defaults(); data.courses = []; return data; }
export function weekNow(data) { return Math.max(1, Math.floor((dayNumber(new Date()) - dayNumber(calendarStart(data))) / 7) + 1); }
export function weekDates(data, week) {
  const start = dateFromKey(calendarStart(data));
  return DAYS.map((_, index) => { const day = new Date(start); day.setDate(day.getDate() + (week - 1) * 7 + index); return day; });
}
export function coursesOnDate(data, date, filter = 'both') {
  return data.courses.filter(course => filter === 'both' || course.owner === filter).flatMap(course => {
    const rule = effectiveDay(data, course.owner, date);
    if (rule.kind === 'off' || !inWeek(course, rule.week)) return [];
    const sections = data.settings[`${course.owner}Sections`];
    return course.slots.filter(slot => slot.day === rule.day).map((slot, index) => ({ ...course, ...slot, key: `${course.id}_${index}`, start: sections[slot.s1 - 1]?.s || '', end: sections[slot.s2 - 1]?.e || '' }));
  }).sort((a, b) => a.start.localeCompare(b.start));
}
const minute = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export function sharedFree(data, date) {
  const occupied = coursesOnDate(data, date).filter(item => item.start && item.end).map(item => [minute(item.start), minute(item.end)]).sort((a, b) => a[0] - b[0]);
  const result = []; let at = 8 * 60;
  for (const [start, end] of occupied) { if (start > at && start - at >= 30) result.push({ start: clock(at), end: clock(start) }); at = Math.max(at, end); }
  if (at < 22 * 60 && 22 * 60 - at >= 30) result.push({ start: clock(at), end: '22:00' });
  return result;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function mergeObject(remote = {}, local = {}, base = {}) {
  const out = clone(remote);
  for (const key of Object.keys(local)) {
    if (equal(local[key], base[key])) continue;
    if (local[key] && !Array.isArray(local[key]) && typeof local[key] === 'object') out[key] = mergeObject(remote[key], local[key], base[key]);
    else out[key] = clone(local[key]);
  }
  return out;
}
export function mergeSchedules(remoteValue, localValue, baseValue) {
  const remote = normalize(clone(remoteValue)), local = normalize(clone(localValue)), base = baseValue || emptyData();
  const tombstones = new Map([...remote.deletedCourses, ...local.deletedCourses].map(item => [item.id, item]));
  const remoteCourses = new Map(remote.courses.map(course => [course.id, course]));
  const baseCourses = new Map((base.courses || []).map(course => [course.id, course]));
  for (const course of local.courses) if (!equal(course, baseCourses.get(course.id))) remoteCourses.set(course.id, clone(course));
  remote.courses = [...remoteCourses.values()].filter(course => !tombstones.has(course.id));
  remote.deletedCourses = [...tombstones.values()].slice(-100);
  remote.settings = mergeObject(remote.settings, local.settings, base.settings);
  remote.users = mergeObject(remote.users, local.users, base.users);
  if (!equal(local.adjustments, base.adjustments)) {
    const key = item => `${item.date}_${item.owner}`;
    const changed = new Set([...(base.adjustments || []), ...local.adjustments].map(key));
    const values = new Map(remote.adjustments.map(item => [key(item), item]));
    for (const id of changed) {
      const before = (base.adjustments || []).find(item => key(item) === id), after = local.adjustments.find(item => key(item) === id);
      if (!equal(before, after)) { if (after) values.set(id, after); else values.delete(id); }
    }
    remote.adjustments = [...values.values()];
  }
  remote.productName = local.productName !== base.productName ? local.productName : remote.productName;
  remote.me = local.me;
  remote.updatedAt = Math.max(Date.now(), local.updatedAt + 1, remote.updatedAt + 1);
  return normalize(remote);
}
export function validateCourse(course, data) {
  if (!course.name?.trim() || course.name.trim().length > 60) throw new Error('课程名称需为 1–60 字');
  if (!['cat', 'dog'].includes(course.owner)) throw new Error('请选择课程属于谁');
  const count = data.settings[`${course.owner}Sections`].length;
  if (!course.slots?.length || course.slots.some(slot => ![slot.day, slot.s1, slot.s2].every(Number.isInteger) || slot.day < 1 || slot.day > 7 || slot.s1 < 1 || slot.s2 < slot.s1 || slot.s2 > count)) throw new Error('请填写有效的星期与上课节次');
  if (!Number.isInteger(course.wf) || !Number.isInteger(course.wt) || course.wf < 1 || course.wt < course.wf || course.wt > data.settings.weeks) throw new Error(`周次需在 1–${data.settings.weeks} 之间`);
  return { ...clone(course), name: course.name.trim(), ...course.slots[0] };
}
export function validateBackup(raw) {
  const data = raw?.format === 'claswee-android-backup' ? raw.data : raw;
  if (!data || !Array.isArray(data.courses) || !data.settings || !data.users || data.courses.length > 2000) throw new Error('这不是有效的 claswee 课表备份');
  for (const owner of ['cat', 'dog']) {
    const sections = data.settings[`${owner}Sections`] || data.settings.sections;
    if (!Array.isArray(sections) || !sections.length || sections.length > 20 || sections.some(s => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.s) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.e) || s.s >= s.e)) throw new Error('备份中的节次时间无效');
  }
  const normalized = normalize(clone(data));
  normalized.courses.forEach(course => validateCourse(course, normalized));
  return normalized;
}
