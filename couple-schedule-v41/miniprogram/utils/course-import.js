function ranges(numbers) {
  const result = [];
  [...new Set(numbers)].sort((a, b) => a - b).forEach(n => {
    const last = result[result.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else result.push([n, n]);
  });
  return result;
}
function activeWeek(course, week) {
  if (course.week === 'odd') return week % 2 === 1;
  if (course.week === 'even') return week % 2 === 0;
  if (course.week !== 'custom') return true;
  return week >= course.wf && week <= course.wt && (course.customParity === 'odd' ? week % 2 === 1 : course.customParity === 'even' ? week % 2 === 0 : true);
}
function importPlan(incoming, data, owner) {
  if (!['cat', 'dog'].includes(owner) || !incoming.length) throw new Error('没有可导入课程');
  const maxSection = data.settings[`${owner}Sections`].length;
  if (incoming.some(c => c.s2 > maxSection)) throw new Error('导入课表的节次多于当前设置，请先在设置中补齐该用户的节次时间后再导入');
  if (incoming.some(c => c.wt > data.settings.weeks)) throw new Error('导入课表超过当前学期总周数，请先在设置中调整总周数后再导入');
  const key = (c, w, d, s) => JSON.stringify([c.name.trim(), (c.loc || '').trim(), (c.teacher || '').trim(), w, d, s]);
  const occupied = new Set();
  data.courses.filter(c => c.owner === owner).forEach(c => {
    for (let w = 1; w <= data.settings.weeks; w++) if (activeWeek(c, w)) {
      (c.slots || [c]).forEach(slot => { for (let s = slot.s1; s <= slot.s2; s++) occupied.add(key(c, w, slot.day, s)); });
    }
  });
  const groups = new Map(); let skippedCells = 0;
  incoming.forEach(c => {
    for (let w = c.wf; w <= c.wt; w++) {
      const sections = [];
      for (let s = c.s1; s <= c.s2; s++) {
        const id = key(c, w, c.day, s);
        if (occupied.has(id)) skippedCells++;
        else { sections.push(s); occupied.add(id); }
      }
      ranges(sections).forEach(([s1, s2]) => {
        const id = JSON.stringify([c.name, c.loc, c.teacher, c.day, s1, s2]);
        if (!groups.has(id)) groups.set(id, { course: { ...c, owner, s1, s2, slots: [{ day: c.day, s1, s2 }] }, weeks: [] });
        groups.get(id).weeks.push(w);
      });
    }
  });
  const courses = [];
  groups.forEach(group => ranges(group.weeks).forEach(([wf, wt]) => courses.push({ ...group.course, wf, wt })));
  return { courses, skippedCells };
}
module.exports = { importPlan };
