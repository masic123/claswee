import Store from './store.js';
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const SECTION_ROW_RPX = 100, REST_ROW_RPX = 34;
function dateValue(value) { const parts = String(value).split('-').map(Number); return new Date(parts[0], parts[1] - 1, parts[2]); }
function dateText(date) { return `${date.getMonth() + 1}.${date.getDate()}`; }
function ellipsize(value, maxLength) { const chars = Array.from(String(value || '')); return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join('')}…` : chars.join(''); }
function activeSlots(data, courses, date) {
  const effective = { cat: Store.effectiveDay(data, 'cat', date), dog: Store.effectiveDay(data, 'dog', date) };
  return courses.reduce((items, course) => {
    const current = effective[course.owner];
    if (current.week < 1 || current.week > data.settings.weeks || !Store.inWeek(course, current.week)) return items;
    const slots = course.slots && course.slots.length ? course.slots : [{ day: course.day, s1: course.s1, s2: course.s2 }];
    slots.forEach((slot, index) => { if (+slot.day === current.day) items.push({ course, slot, index }); });
    return items;
  }, []);
}
function adjustmentLabel(data, date, filter) {
  const owners = filter === 'both' ? ['cat', 'dog'] : [filter];
  const labels = owners.map(owner => {
    const rule = Store.adjustmentFor(data, owner, date); if (!rule) return null;
    const source = rule.kind === 'use' ? dateValue(rule.sourceDate) : null;
    return { owner, text: source ? `按${dateText(source)}${DAYS[(source.getDay() || 7) - 1]}上课` : '休息' };
  }).filter(Boolean);
  if (!labels.length) return '';
  if (labels.length === 2 && labels[0].text === labels[1].text) return `调休 · ${labels[0].text}`;
  return labels.map(item => `${data.users[item.owner].name}：${item.text}`).join(' / ');
}
function placeOverlaps(items, styleBuilder) {
  const sorted = items.sort((a, b) => a.start - b.start || a.end - b.end);
  let group = [], groupEnd = -Infinity;
  function placeGroup() {
    if (!group.length) return;
    const columns = [];
    const ordered = group.slice().sort((a, b) => {
      const ownerOrder = (a.owner === 'cat' ? 0 : a.owner === 'dog' ? 1 : 2) - (b.owner === 'cat' ? 0 : b.owner === 'dog' ? 1 : 2);
      return ownerOrder || a.start - b.start || a.end - b.end;
    });
    ordered.forEach(item => {
      let column = columns.findIndex(end => item.start >= end);
      if (column < 0) { column = columns.length; columns.push(0); }
      columns[column] = item.end; item.column = column;
    });
    const count = Math.max(1, columns.length);
    group.forEach(item => { item.narrow = count > 1; item.style = styleBuilder(item, item.column, count); });
  }
  sorted.forEach(item => {
    if (group.length && item.start >= groupEnd) { placeGroup(); group = []; groupEnd = -Infinity; }
    group.push(item); groupEnd = Math.max(groupEnd, item.end);
  });
  placeGroup();
}
// Shared by the phone timetable and its exported image, in the page's original rpx units.
function build(data, startDate, filter = 'both', options = {}) {
  const dayCount = options.includeWeekend === false ? 5 : 7;
  const courses = data.courses.filter(course => filter === 'both' || course.owner === filter);
  const sectionCount = Math.max(data.settings.catSections.length, data.settings.dogSections.length);
  const restBoundaries = [{ section: data.settings.lunchAfter, label: '午休' }, { section: data.settings.dinnerAfter, label: '晚休' }].filter(rest => rest.section >= 1 && rest.section < sectionCount);
  const gridHeight = sectionCount * SECTION_ROW_RPX + restBoundaries.length * REST_ROW_RPX;
  const sectionTop = section => (section - 1) * SECTION_ROW_RPX + restBoundaries.filter(rest => rest.section < section).length * REST_ROW_RPX;
  const restRows = restBoundaries.map((rest, index) => ({ key: rest.label, label: rest.label, top: rest.section * SECTION_ROW_RPX + index * REST_ROW_RPX, height: REST_ROW_RPX,
    style: `top:${(rest.section * SECTION_ROW_RPX + index * REST_ROW_RPX) / gridHeight * 100}%;height:${REST_ROW_RPX / gridHeight * 100}%` }));
  const columns = Array.from({ length: dayCount }, (_, dayIndex) => {
    const date = new Date(startDate); date.setDate(date.getDate() + dayIndex);
    const cards = activeSlots(data, courses, date).map(({ course, slot, index }) => ({
      id: course.id, key: `${course.id}_${index}_${dayIndex}`, name: course.name, loc: course.loc, teacher: course.teacher,
      owner: course.owner, s1: +slot.s1, s2: +slot.s2, single: +slot.s1 === +slot.s2, start: +slot.s1, end: +slot.s2 + 0.01,
      sectionText: slot.s1 === slot.s2 ? `第${slot.s1}节` : `第${slot.s1}–${slot.s2}节`, weekText: Store.weekText(course)
    })).sort((a, b) => a.s1 - b.s1 || a.s2 - b.s2);
    const displayCards = cards.flatMap(card => {
      const ends = restBoundaries.filter(rest => rest.section >= card.s1 && rest.section < card.s2).map(rest => rest.section).concat(card.s2);
      let first = card.s1;
      return ends.map(last => { const part = { ...card, key: `${card.key}_${first}`, s1: first, s2: last, start: first, end: last + .01, single: first === last }; first = last + 1; return part; });
    });
    placeOverlaps(displayCards, (card, column, count) => {
      Object.assign(card, { top: sectionTop(card.s1) + 4, height: (card.s2 - card.s1 + 1) * SECTION_ROW_RPX - 8, leftPercent: column / count, widthPercent: 1 / count });
      return `top:calc(${sectionTop(card.s1) / gridHeight * 100}% + 4rpx);height:calc(${(card.s2 - card.s1 + 1) * SECTION_ROW_RPX / gridHeight * 100}% - 8rpx);left:calc(${column * 100 / count}% + 3rpx);width:calc(${100 / count}% - 6rpx)`;
    });
    displayCards.forEach(card => { card.displayName = ellipsize(card.name, card.narrow ? 5 : 12); });
    return { day: dayIndex + 1, name: DAYS[dayIndex], date: dateText(date), adjustmentLabel: adjustmentLabel(data, date, filter), cards: displayCards, restRows,
      rows: Array.from({ length: sectionCount }, (_, index) => ({ section: index + 1, top: sectionTop(index + 1), height: SECTION_ROW_RPX,
        style: `top:${sectionTop(index + 1) / gridHeight * 100}%;height:${SECTION_ROW_RPX / gridHeight * 100}%`, now: !!options.displayHasToday && dayIndex + 1 === options.todayDay && index === options.nowSectionIndex })), height: gridHeight };
  });
  return { columns, restRows, gridHeight, sectionCount };
}
export default { build, activeSlots, adjustmentLabel, placeOverlaps };
