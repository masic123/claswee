import Store from './store.js';

function parseDate(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}
function weekday(date) { return date.getDay() || 7; }
function minutes(value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  return hour * 60 + minute;
}
function calculate(data, now = new Date()) {
  const today = Store.dateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const result = { cat: { total: 0, completed: 0 }, dog: { total: 0, completed: 0 } };
  const rules = new Map((data.adjustments || []).map(rule => [`${rule.date}_${rule.owner}`, rule]));
  const byOwner = {
    cat: data.courses.filter(course => course.owner === 'cat'),
    dog: data.courses.filter(course => course.owner === 'dog')
  };

  function record(owner, date, slot) {
    const count = Math.max(0, +slot.s2 - +slot.s1 + 1);
    if (!count) return;
    result[owner].total += count;
    if (date < today) result[owner].completed += count;
    if (date === today) {
      const sections = data.settings[owner === 'cat' ? 'catSections' : 'dogSections'];
      for (let section = +slot.s1; section <= +slot.s2; section++) {
        if (sections[section - 1] && minutes(sections[section - 1].e) <= nowMinutes) result[owner].completed++;
      }
    }
  }

  ['cat', 'dog'].forEach(owner => {
    const start = parseDate(Store.ownerStart(data, owner));
    const sections = data.settings[owner === 'cat' ? 'catSections' : 'dogSections'];
    byOwner[owner].forEach(course => {
      const slots = course.slots && course.slots.length ? course.slots : [{ day: course.day, s1: course.s1, s2: course.s2 }];
      for (let week = 1; week <= data.settings.weeks; week++) {
        if (!Store.inWeek(course, week)) continue;
        const weekStart = new Date(start);
        weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
        slots.forEach(slot => {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + ((+slot.day - weekday(weekStart) + 7) % 7));
          const key = Store.dateKey(date);
          if (rules.has(`${key}_${owner}`)) return;
          if (!sections[slot.s2 - 1]) return;
          record(owner, key, slot);
        });
      }
    });
    (data.adjustments || []).filter(rule => rule.owner === owner && rule.kind === 'use').forEach(rule => {
      const source = parseDate(rule.sourceDate);
      const sourceWeek = Store.weekForDate(data, owner, source);
      if (sourceWeek < 1 || sourceWeek > data.settings.weeks) return;
      const sourceDay = weekday(source);
      byOwner[owner].forEach(course => {
        if (!Store.inWeek(course, sourceWeek)) return;
        const slots = course.slots && course.slots.length ? course.slots : [{ day: course.day, s1: course.s1, s2: course.s2 }];
        slots.forEach(slot => {
          if (+slot.day === sourceDay && sections[slot.s2 - 1]) record(owner, rule.date, slot);
        });
      });
    });
  });
  result.both = {
    total: result.cat.total + result.dog.total,
    completed: result.cat.completed + result.dog.completed
  };
  return result;
}

export default { calculate };
