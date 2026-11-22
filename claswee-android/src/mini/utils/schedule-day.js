// Pure date/calendar helpers for the shared timetable poster.
const DAY_MS = 86400000;
function dayNumber(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(x => !Number.isInteger(x))) return NaN;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) return NaN;
  return Math.floor(date.getTime() / DAY_MS);
}
function dateKey(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }
function addDays(value, count) { return dateKey(dayNumber(value) + count); }
function shanghaiDate(now = Date.now()) { return new Date(+now + 8 * 3600000).toISOString().slice(0, 10); }
function shanghaiMinutes(now = Date.now()) { const d = new Date(+now + 8 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
function timeToMin(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match || +match[1] > 23 || +match[2] > 59) return NaN;
  return +match[1] * 60 + +match[2];
}
function minText(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function occurs(course, week, totalWeeks) {
  if (week < 1 || week > totalWeeks || week < (+course.wf || 1) || week > (+course.wt || totalWeeks)) return false;
  const parity = course.week === 'custom' ? course.customParity : course.week;
  return parity === 'odd' ? week % 2 === 1 : parity === 'even' ? week % 2 === 0 : true;
}
function dayCourses(data, owner, date) {
  const settings = data.settings || {}, target = dayNumber(date);
  if (!Number.isFinite(target)) return [];
  const adjustment = (data.adjustments || []).find(x => x.owner === owner && x.date === date);
  if (adjustment && adjustment.kind === 'off') return [];
  const source = adjustment && adjustment.kind === 'use' ? dayNumber(adjustment.sourceDate) : target;
  const start = dayNumber(settings[owner === 'dog' ? 'dogStart' : 'catStart'] || settings.start);
  if (!Number.isFinite(source) || !Number.isFinite(start)) return [];
  const week = Math.floor((source - start) / 7) + 1;
  const weekday = new Date(source * DAY_MS).getUTCDay() || 7;
  const sections = settings[owner === 'dog' ? 'dogSections' : 'catSections'] || settings.sections || [];
  const seen = new Set(), entries = [];
  (data.courses || []).filter(c => c.owner === owner && occurs(c, week, +settings.weeks || 19)).forEach(course => {
    const slots = course.slots && course.slots.length ? course.slots : [course];
    slots.forEach((slot, index) => {
      if (+slot.day !== weekday || !sections[+slot.s1 - 1] || !sections[+slot.s2 - 1]) return;
      const startTime = timeToMin(sections[+slot.s1 - 1].s), endTime = timeToMin(sections[+slot.s2 - 1].e);
      const key = `${course.id}_${slot.day}_${slot.s1}_${slot.s2}`;
      if (seen.has(key) || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return;
      seen.add(key);
      entries.push({ id: course.id, key: `${course.id}_${index}`, owner, name: String(course.name || '未命名课程'), loc: String(course.loc || ''), teacher: String(course.teacher || ''), s1: +slot.s1, s2: +slot.s2, start: startTime, end: endTime, time: `${minText(startTime)}–${minText(endTime)}` });
    });
  });
  return entries.sort((a, b) => a.start - b.start || a.end - b.end);
}
function sharedFree(cat, dog) {
  const all = cat.concat(dog);
  const start = Math.min(480, ...all.map(x => x.start)), end = Math.max(1320, ...all.map(x => x.end));
  const merged = [];
  all.slice().sort((a, b) => a.start - b.start || a.end - b.end).forEach(item => {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else merged.push({ start: item.start, end: item.end });
  });
  const free = []; let cursor = start;
  merged.forEach(item => { if (item.start - cursor >= 10) free.push({ start: cursor, end: item.start }); cursor = Math.max(cursor, item.end); });
  if (end - cursor >= 10) free.push({ start: cursor, end });
  return free.map(x => ({ ...x, text: `${minText(x.start)}–${minText(x.end)}` }));
}
function sectionCount(entries) {
  const sections = new Set();
  entries.forEach(item => { for (let n = item.s1; n <= item.s2; n++) sections.add(n); });
  return sections.size;
}
function summary(data, date) {
  const cat = dayCourses(data, 'cat', date), dog = dayCourses(data, 'dog', date);
  return { date, weekday: new Date(dayNumber(date) * DAY_MS).getUTCDay() || 7, cat, dog, free: sharedFree(cat, dog), catSections: sectionCount(cat), dogSections: sectionCount(dog) };
}
export default { dayNumber, dateKey, addDays, shanghaiDate, shanghaiMinutes, timeToMin, minText, occurs, dayCourses, sharedFree, sectionCount, summary };
