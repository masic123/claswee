const Store = require('../../utils/store');
const Share = require('../../utils/share');
const Skin = require('../../utils/skin');
const Hours = require('../../utils/schedule-hours');
const Grid = require('../../utils/schedule-grid');
const { activeSlots, adjustmentLabel, placeOverlaps } = Grid;
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function clockToMin(value) { const parts = String(value || '08:00').split(':').map(Number); return parts[0] * 60 + parts[1]; }
function minText(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function dateValue(value) { const parts = String(value).split('-').map(Number); return new Date(parts[0], parts[1] - 1, parts[2]); }
function weekStart(data, week) { const date = dateValue(Store.calendarStart(data)); date.setDate(date.getDate() + (week - 1) * 7); return date; }
function dateText(date) { return `${date.getMonth() + 1}.${date.getDate()}`; }
function dayNumber(date) { return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000); }
function currentWeek(data) { const start = dateValue(Store.calendarStart(data)); return Math.max(1, Math.min(Store.calendarWeeks(data), Math.floor((dayNumber(new Date()) - dayNumber(start)) / 7) + 1)); }
function weekday() { const day = new Date().getDay(); return day === 0 ? 7 : day; }
function hoursSummary(data, filter, now) {
  const hours = Hours.calculate(data, now);
  const owners = filter === 'both' ? ['cat', 'dog'] : [filter];
  return {
    hourRows: owners.map(owner => {
      const current = hours[owner];
      return {
        owner, name: data.users[owner].name,
        total: current.total, completed: current.completed, remaining: current.total - current.completed,
        percent: current.total ? Math.round(current.completed / current.total * 100) : 0
      };
    })
  };
}
function ownerWeekText(data, owner, date) {
  const week = Store.weekForDate(data, owner, date);
  return week < 1 ? '开学前' : `第${week}周`;
}
function isImageAvatar(value) { return /^(data:|cloud:\/\/|https?:\/\/|wxfile:\/\/)/.test(String(value || '')); }
Page({
  onShareAppMessage: Share.appMessage,
  onShareTimeline: Share.timeline,
  data: {
    skin: 'blush', week: 0, weeks: 19, weekRange: '', filter: 'both', layout: 'sections', columns: [],
    timelineDay: 0, timelineDays: [], catItems: [], dogItems: [], free: [], freeBands: [], timelineTicks: [],
    productName: 'claswee', catName: '小猫', dogName: '小狗', catAvatar: '🐱', dogAvatar: '🐶',
    catAvatarIsImage: false, dogAvatarIsImage: false, filterLabel: '一起看', layoutLabel: '按节数',
    filterMenuOpen: false, layoutMenuOpen: false, addMenuOpen: false,
    todayOpen: false, todayOwner: 'cat', todayName: '', todayLabel: '', todayCourses: [],
    hourRows: []
  },
  onShow() {
    Share.enable();
    Skin.apply(this, 1);
    const data = Store.get();
    this.setData({ week: Math.min(this.data.week || currentWeek(data), Store.calendarWeeks(data)), timelineDay: this.data.timelineDay || weekday(), layout: data.settings.layoutMode, productName: data.productName, weeks: Store.calendarWeeks(data) });
    wx.setNavigationBarTitle({ title: data.productName });
    this.render();
    this.scheduleHoursRefresh();
  },
  scheduleHoursRefresh() {
    if (this.hoursTimer) clearTimeout(this.hoursTimer);
    const now = new Date();
    const delay = 60050 - now.getSeconds() * 1000 - now.getMilliseconds();
    this.hoursTimer = setTimeout(() => {
      this.setData(hoursSummary(Store.get(), this.data.filter, new Date()));
      this.scheduleHoursRefresh();
    }, delay);
  },
  render() {
    const data = Store.get(), dayCount = 7, week = this.data.week;
    const visibleCourses = data.courses.filter(course => this.data.filter === 'both' || course.owner === this.data.filter);
    const startDate = weekStart(data, week), endDate = new Date(startDate); endDate.setDate(endDate.getDate() + dayCount - 1);
    const todayDate = new Date(), todayNumber = dayNumber(todayDate), todayWeek = currentWeek(data), todayDay = weekday(), nowMin = todayDate.getHours() * 60 + todayDate.getMinutes();
    const displayHasToday = week === todayWeek && todayNumber >= dayNumber(startDate) && todayNumber <= dayNumber(endDate);
    const ownSections = data.me === 'dog' ? data.settings.dogSections : data.settings.catSections;
    const nowSectionIndex = ownSections.findIndex(section => nowMin >= clockToMin(section.s) && nowMin <= clockToMin(section.e));
    const { columns, restRows, gridHeight } = Grid.build(data, startDate, this.data.filter, { displayHasToday, todayDay, nowSectionIndex });
    const timelineDay = Math.min(Math.max(1, this.data.timelineDay), dayCount), entries = { cat: [], dog: [] };
    const timelineDate = new Date(startDate); timelineDate.setDate(timelineDate.getDate() + timelineDay - 1);
    activeSlots(data, visibleCourses, timelineDate).forEach(({ course, slot, index }) => {
      const sections = course.owner === 'dog' ? data.settings.dogSections : data.settings.catSections;
      const start = clockToMin((sections[slot.s1 - 1] || {}).s), end = clockToMin((sections[slot.s2 - 1] || {}).e);
      entries[course.owner].push({ id: course.id, key: `${course.id}_${index}`, name: course.name, loc: course.loc, teacher: course.teacher, start, end, time: `${minText(start)}–${minText(end)}` });
    });
    const all = entries.cat.concat(entries.dog), startAt = all.length ? Math.min(480, ...all.map(item => item.start)) : 480, endAt = all.length ? Math.max(1320, ...all.map(item => item.end)) : 1320, duration = Math.max(1, endAt - startAt);
    const timelineTicks = [];
    for (let value = Math.ceil(startAt / 60) * 60; value <= endAt; value += 60) timelineTicks.push({ value, label: minText(value), style: `top:${((value - startAt) / duration * 100).toFixed(2)}%` });
    ['cat', 'dog'].forEach(owner => placeOverlaps(entries[owner], (item, column, count) => `top:${((item.start - startAt) / duration * 100).toFixed(2)}%;height:${Math.max(4, (item.end - item.start) / duration * 100).toFixed(2)}%;left:calc(${column * 100 / count}% + 4rpx);width:calc(${100 / count}% - 8rpx)`));
    const busy = all.map(item => ({ start: item.start, end: item.end })).sort((a, b) => a.start - b.start), merged = [];
    busy.forEach(item => { const last = merged[merged.length - 1]; if (last && item.start <= last.end) last.end = Math.max(last.end, item.end); else merged.push(Object.assign({}, item)); });
    const freeIntervals = []; let cursor = startAt;
    merged.forEach(item => { if (item.start - cursor >= 10) freeIntervals.push({ start: cursor, end: item.start }); cursor = Math.max(cursor, item.end); });
    if (endAt - cursor >= 10) freeIntervals.push({ start: cursor, end: endAt });
    const free = freeIntervals.map(item => `${minText(item.start)}–${minText(item.end)}`);
    const freeBands = freeIntervals.map((item, index) => ({ key: index, style: `top:${((item.start - startAt) / duration * 100).toFixed(2)}%;height:${((item.end - item.start) / duration * 100).toFixed(2)}%` }));
    const timelineStartDate = new Date(startDate); timelineStartDate.setDate(timelineStartDate.getDate() + timelineDay - 1);
    const catAvatar = data.users.cat.avatar, dogAvatar = data.users.dog.avatar;
    this.setData({
      weeks: Store.calendarWeeks(data), weekRange: `${dateText(startDate)} – ${dateText(endDate)}`, productName: data.productName,
      catWeekLabel: ownerWeekText(data, 'cat', startDate), dogWeekLabel: ownerWeekText(data, 'dog', startDate),
      catName: data.users.cat.name, dogName: data.users.dog.name, catAvatar, dogAvatar,
      catAvatarIsImage: isImageAvatar(catAvatar), dogAvatarIsImage: isImageAvatar(dogAvatar),
      filterLabel: this.data.filter === 'both' ? '一起看' : (this.data.filter === 'cat' ? data.users.cat.name : data.users.dog.name),
      layoutLabel: this.data.layout === 'sections' ? '按节数' : '按时间',
      columns, restRows, gridHeight, timelineDay, timelineDate: dateText(timelineStartDate), timelineAdjustmentLabel: adjustmentLabel(data, timelineDate, this.data.filter), timelineDays: DAYS.slice(0, dayCount),
      timelineDayName: DAYS[timelineDay - 1], catItems: entries.cat, dogItems: entries.dog,
      free, freeText: free.length ? free.join('、') : '今天没有连续空闲时段', freeBands, timelineTicks,
      ...hoursSummary(data, this.data.filter, todayDate)
    });
  },
  showToday(e) {
    const owner = e.currentTarget.dataset.owner;
    if (owner !== 'cat' && owner !== 'dog') return;
    const data = Store.get(), date = new Date(), day = date.getDay() || 7;
    const sections = owner === 'dog' ? data.settings.dogSections : data.settings.catSections;
    const courses = activeSlots(data, data.courses.filter(course => course.owner === owner), date)
      .map(({ course, slot, index }) => {
        const first = sections[+slot.s1 - 1], last = sections[+slot.s2 - 1];
        return { key: `${course.id}_${index}`, name: course.name, loc: course.loc, teacher: course.teacher,
          start: first ? clockToMin(first.s) : Infinity,
          time: first && last ? `${first.s}–${last.e}` : '时间待设置',
          sectionText: +slot.s1 === +slot.s2 ? `第${slot.s1}节` : `第${slot.s1}–${slot.s2}节` };
      }).sort((a, b) => a.start - b.start);
    this.setData({ todayOpen: true, todayOwner: owner, todayName: data.users[owner].name,
      todayLabel: `${date.getMonth() + 1}月${date.getDate()}日 · ${DAYS[day - 1]} · ${ownerWeekText(data, owner, date)}`,
      todayAdjustmentLabel: adjustmentLabel(data, date, owner),
      todayCourses: courses.map(({ start, ...course }) => course), filterMenuOpen: false, layoutMenuOpen: false });
  },
  closeToday() { this.setData({ todayOpen: false }); },
  stopPropagation() {},
  onHide() { if (this.hoursTimer) clearTimeout(this.hoursTimer); this.hoursTimer = null; this.closeToday(); this.closeMenus(); this.closeAddMenu(); },
  onUnload() { if (this.hoursTimer) clearTimeout(this.hoursTimer); this.hoursTimer = null; },
  toggleMenu(e) { const menu = e.currentTarget.dataset.menu; this.setData({ filterMenuOpen: menu === 'filter' ? !this.data.filterMenuOpen : false, layoutMenuOpen: menu === 'layout' ? !this.data.layoutMenuOpen : false }); },
  closeMenus() { this.setData({ filterMenuOpen: false, layoutMenuOpen: false }); },
  filter(e) { this.setData({ filter: e.currentTarget.dataset.value, filterMenuOpen: false }, () => this.render()); },
  prev() { this.setData({ week: Math.max(1, this.data.week - 1) }, () => this.render()); },
  next() { this.setData({ week: Math.min(this.data.weeks, this.data.week + 1) }, () => this.render()); },
  today() { const data = Store.get(); this.setData({ week: currentWeek(data), timelineDay: weekday() }, () => this.render()); },
  changeLayout(e) { const layout = e.currentTarget.dataset.layout, data = Store.get(); data.settings.layoutMode = layout; Store.save(data); this.setData({ layout, layoutMenuOpen: false }, () => this.render()); },
  chooseDay(e) { this.setData({ timelineDay: +e.currentTarget.dataset.day }, () => this.render()); },
  openSharePoster() {
    this.closeAddMenu();
    wx.navigateTo({ url: `/pages/share-poster/index?week=${this.data.week}&filter=${this.data.filter}` });
  },
  add() { this.closeMenus(); this.setData({ addMenuOpen: !this.data.addMenuOpen }); },
  closeAddMenu() { this.setData({ addMenuOpen: false }); },
  addManual() { this.closeAddMenu(); wx.navigateTo({ url: '/pages/add/index' }); },
  addFromImage() { this.closeAddMenu(); wx.navigateTo({ url: '/pages/course-assistant/index?source=image' }); },
  addWithAI() { this.closeAddMenu(); wx.navigateTo({ url: '/pages/course-assistant/index' }); },
  addPreset(e) { const day = +e.currentTarget.dataset.day, section = +e.currentTarget.dataset.section; wx.navigateTo({ url: `/pages/add/index?day=${day}&section=${section}` }); },
  edit(e) { wx.navigateTo({ url: `/pages/add/index?id=${e.currentTarget.dataset.id}` }); }
});
