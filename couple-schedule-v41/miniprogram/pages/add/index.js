const Store = require('../../utils/store');
const Share = require('../../utils/share');
const Skin = require('../../utils/skin');
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function sectionLabels(n) { return Array.from({ length: n }, (_, i) => `第${i + 1}节`); }
function freshSlot(count) { return { day: 1, s1: 1, s2: Math.min(2, count) }; }
Page({
  onShareAppMessage: Share.appMessage,
  onShareTimeline: Share.timeline,
  data: { skin: 'blush', editing: false, courseId: '', name: '', loc: '', teacher: '', owner: 'cat', catName: '小猫', dogName: '小狗', week: 'all', wf: 1, wt: 20, customParity: 'all', slots: [], days: DAYS, sections: [], weekOptions: Array.from({ length: 40 }, (_, i) => i + 1) },
  onLoad(options) { this.courseId = options.id || ''; this.preset = options.day ? { day: +options.day, s1: +options.section || 1, s2: +options.section || 1 } : null; },
  onShow() {
    Skin.apply(this);
    Share.enable();
    const data = Store.get(), count = data.settings.catSections.length;
    let course = data.courses.find(x => x.id === this.courseId);
    if (course) course = Store.clone(course);
    const seed = course || { owner: data.me, name: '', loc: '', teacher: '', week: 'all', wf: 1, wt: data.settings.weeks, customParity: 'all', slots: [this.preset || freshSlot(count)] };
    this.setData({ editing: !!course, courseId: course ? course.id : '', name: seed.name, loc: seed.loc, teacher: seed.teacher, owner: seed.owner, catName: data.users.cat.name, dogName: data.users.dog.name, week: seed.week, wf: seed.wf, wt: seed.wt, customParity: seed.customParity, slots: seed.slots, sections: sectionLabels(count), weeks: data.settings.weeks });
    wx.setNavigationBarTitle({ title: course ? '编辑课程' : '添加课程' });
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  chooseOwner(e) { this.setData({ owner: e.currentTarget.dataset.owner }); },
  chooseWeek(e) { this.setData({ week: e.currentTarget.dataset.week }); },
  chooseParity(e) { this.setData({ customParity: e.currentTarget.dataset.parity }); },
  pickSlot(e) {
    const { index, key } = e.currentTarget.dataset, slots = this.data.slots.slice();
    slots[index][key] = +e.detail.value + 1;
    if (key === 's1' && slots[index].s2 < slots[index].s1) slots[index].s2 = slots[index].s1;
    this.setData({ slots });
  },
  pickWeek(e) { const key = e.currentTarget.dataset.key, value = +e.detail.value + 1; const update = { [key]: value }; if (key === 'wf' && value > this.data.wt) update.wt = value; if (key === 'wt' && value < this.data.wf) update.wf = value; this.setData(update); },
  addSlot() { this.setData({ slots: this.data.slots.concat(freshSlot(this.data.sections.length)) }); },
  removeSlot(e) { if (this.data.slots.length === 1) return wx.showToast({ title: '至少保留一个上课时间', icon: 'none' }); const slots = this.data.slots.slice(); slots.splice(+e.currentTarget.dataset.index, 1); this.setData({ slots }); },
  save() {
    const name = this.data.name.trim(); if (!name) return wx.showToast({ title: '请填写课程名称', icon: 'none' });
    const data = Store.get();
    const payload = { owner: this.data.owner, name, loc: this.data.loc.trim(), teacher: this.data.teacher.trim(), week: this.data.week, wf: this.data.wf, wt: this.data.wt, customParity: this.data.customParity, slots: this.data.slots.map(s => ({ ...s })) };
    Object.assign(payload, payload.slots[0]);
    if (this.data.editing) { const index = data.courses.findIndex(x => x.id === this.data.courseId); if (index >= 0) data.courses[index] = Object.assign(data.courses[index], payload); }
    else data.courses.push(Object.assign({ id: `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }, payload));
    Store.save(data); wx.showToast({ title: this.data.editing ? '已更新' : '已添加' }); setTimeout(() => wx.navigateBack(), 350);
  },
  remove() { wx.showModal({ title: '删除课程', content: '确定删除这门课吗？此操作会同步到另一台设备。', success: res => { if (!res.confirm) return; const data = Store.get(); data.courses = data.courses.filter(x => x.id !== this.data.courseId); data.deletedCourses.push({ id: this.data.courseId, at: Date.now() }); Store.save(data); wx.showToast({ title: '已删除' }); setTimeout(() => wx.navigateBack(), 350); } }); }
});
