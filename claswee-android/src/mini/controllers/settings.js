// Ported from miniprogram/pages/settings/index.js.
import Store from '../utils/store.js';
import Share from '../utils/share.js';
import Skin from '../utils/skin.js';
const START_YEARS = Array.from({ length: 131 }, (_, index) => index + 1970);
const START_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
function startPicker(owner, value) {
  const [rawYear, rawMonth, day] = String(value).split('-').map(Number);
  const year = Math.max(1970, Math.min(2100, rawYear)), month = rawMonth;
  const days = Store.mondayDays(year, month);
  return {
    [`${owner}StartRange`]: [START_YEARS.map(x => `${x}年`), START_MONTHS.map(x => `${x}月`), days.map(x => `${x}日（周一）`)],
    [`${owner}StartValue`]: [year - 1970, month - 1, Math.max(0, days.indexOf(day))],
    [`${owner}StartInvalid`]: !Store.isMonday(value)
  };
}
const EMOJIS = ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐯', '🐨', '🐹', '🦁', '🐷', '🐸', '🐵', '🐧', '🦄', '🐴', '🐔', '🐺'];
// 两张头像会随房间课表一起同步，需给课程数据和 HTTP 请求体留出空间。
const AVATAR_MAX_BASE64_CHARS = 24000;
const AVATAR_COMPRESSION = [
  { compressedWidth: 256, quality: 72 },
  { compressedWidth: 192, quality: 55 },
  { compressedWidth: 128, quality: 42 }
];
function addMinutes(time, amount) { const [h, m] = time.split(':').map(Number); const value = h * 60 + m + amount; return `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function isImageAvatar(value) { return /^(data:|cloud:\/\/|https?:\/\/|wxfile:\/\/)/.test(String(value || '')); }
function compressAvatar(path, options) {
  return new Promise(resolve => wx.compressImage({ src:path, ...options, success: result => resolve(result.tempFilePath || path), fail: () => resolve(path) }));
}
function readAvatar(path) {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath:path, encoding:'base64', success: result => resolve(String(result.data || '')), fail: () => reject(new Error('头像图片读取失败')) }));
}
function avatarMime(base64) {
  return base64.startsWith('/9j/') ? 'image/jpeg' : base64.startsWith('iVBOR') ? 'image/png' : base64.startsWith('UklGR') ? 'image/webp' : '';
}
export default ({
  onShareAppMessage: Share.appMessage,
  onShareTimeline: Share.timeline,
  data: { skin: 'blush', skinOptions: Object.keys(Skin.THEMES).map(value => ({ value, name: Skin.THEMES[value].name })), productName: '', catName: '', dogName: '', catAvatar: '🐱', dogAvatar: '🐶', me: 'cat', catStart: '', dogStart: '', weeks: 19, weekOptions: Array.from({ length: 40 }, (_, i) => i + 1), weekend: true, sectionOwner: 'cat', sectionsExpanded: false, sections: [], lunchAfter: 4, dinnerAfter: 8, breakSectionCount: 12, lunchOptions: [], dinnerOptions: [], adjustmentDate: '', adjustmentSourceDate: '', adjustmentMinDate: '', adjustmentMaxDate: '', adjustmentOwner: 'both', adjustmentKind: 'use', adjustmentRows: [], avatarTarget: '', avatarSaving: false, avatarHelp: '', emojiSheet: false, emojis: EMOJIS },
  onShow() { Share.enable(); Skin.apply(this, 0); const today = Store.dateKey(new Date()); this.setData({ sectionsExpanded: false, adjustmentDate: this.data.adjustmentDate || today, adjustmentSourceDate: this.data.adjustmentSourceDate || today }); this.load(); },
  load() { const d = Store.get(), owner = this.data.sectionOwner, catAvatar = d.users.cat.avatar, dogAvatar = d.users.dog.avatar;
    this.setData({ ...startPicker('cat', d.settings.catStart), ...startPicker('dog', d.settings.dogStart) });
    const breakSectionCount = Math.max(d.settings.catSections.length, d.settings.dogSections.length);
    const lunchOptions = Array.from({ length:Math.max(0, breakSectionCount - 1) }, (_, index) => `第${index + 1}节后`);
    const dinnerOptions = Array.from({ length:Math.max(0, breakSectionCount - 1) }, (_, index) => index + 2 === breakSectionCount ? `第${index + 2}节后（末节，不显示）` : `第${index + 2}节后`);
    const adjustmentRows = d.adjustments.map(item => ({
      ...item, key: `${item.date}_${item.owner}`, ownerName: d.users[item.owner].name,
      description: item.kind === 'off' ? '休息，不显示课程' : `按 ${item.sourceDate} 的课表上课`
    }));
    const endDateParts = Store.calendarStart(d).split('-').map(Number);
    const endDate = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2]);
    endDate.setDate(endDate.getDate() + Store.calendarWeeks(d) * 7 - 1);
    this.setData({ productName: d.productName, catName: d.users.cat.name, dogName: d.users.dog.name, catAvatar, dogAvatar, catIsImage: isImageAvatar(catAvatar), dogIsImage: isImageAvatar(d.users.dog.avatar), me: d.me, wechatNickname: d.users[d.me].name, wechatAvatar: d.users[d.me].avatar, wechatAvatarIsImage: isImageAvatar(d.users[d.me].avatar), catStart: d.settings.catStart, dogStart: d.settings.dogStart, weeks: d.settings.weeks, weekend: d.settings.weekend, sections: d.settings[owner === 'dog' ? 'dogSections' : 'catSections'], lunchAfter:d.settings.lunchAfter, dinnerAfter:d.settings.dinnerAfter, breakSectionCount, lunchOptions, dinnerOptions, adjustmentRows, adjustmentMinDate: Store.calendarStart(d), adjustmentMaxDate: Store.dateKey(endDate) }); wx.setNavigationBarTitle({ title: 'claswee 设置' }); },
  chooseSkin(e) {
    const skin = Skin.set(e.currentTarget.dataset.skin);
    this.setData({ skin });
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ skin });
    Skin.applyNavigation(skin);
    this.load();
  },
  input(e) { const key = e.currentTarget.dataset.key, d = Store.get(), value = e.detail.value; if (key === 'productName') d.productName = value.trim() || 'claswee'; else if (key === 'catName') d.users.cat.name = value.trim() || '小猫'; else d.users.dog.name = value.trim() || '小狗'; Store.save(d); this.load(); },
  chooseMe(e) { const d = Store.get(); d.me = e.currentTarget.dataset.owner; Store.save(d); this.load(); },
  changeStartColumn(e) {
    const owner = e.currentTarget.dataset.owner, column = Number(e.detail.column), index = Number(e.detail.value);
    if (!['cat', 'dog'].includes(owner) || !Number.isInteger(column) || column < 0 || column > 2 || !Number.isInteger(index)) return;
    const value = this.data[`${owner}StartValue`].slice();
    if (index < 0 || index >= this.data[`${owner}StartRange`][column].length) return;
    value[column] = index;
    const days = Store.mondayDays(START_YEARS[value[0]], START_MONTHS[value[1]]);
    value[2] = Math.min(value[2], days.length - 1);
    const range = this.data[`${owner}StartRange`].slice();
    range[2] = days.map(day => `${day}日（周一）`);
    this.setData({ [`${owner}StartValue`]: value, [`${owner}StartRange`]: range });
  },
  cancelStartPicker() { this.load(); },
  setSemesterStart(owner, indexes) {
    if (!Array.isArray(indexes) || indexes.length !== 3) return wx.showToast({ title: '请选择第一周的周一', icon: 'none' });
    const [yearIndex, monthIndex, dayIndex] = indexes.map(Number);
    if (![yearIndex, monthIndex, dayIndex].every(Number.isInteger)) return;
    const year = START_YEARS[yearIndex], month = START_MONTHS[monthIndex], day = Store.mondayDays(year, month)[dayIndex];
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!Store.isMonday(value)) return wx.showToast({ title: '请选择第一周的周一', icon: 'none' });
    const d = Store.get(); d.settings[`${owner}Start`] = value; Store.save(d); this.load();
  },
  setCatStart(e) { this.setSemesterStart('cat', e.detail.value); },
  setDogStart(e) { this.setSemesterStart('dog', e.detail.value); },
  setWeeks(e) { const value = +e.detail.value + 1, d = Store.get(); d.settings.weeks = value; Store.save(d); this.setData({ weeks: value }); },
  setAdjustmentDate(e) { this.setData({ adjustmentDate: e.detail.value }); },
  setAdjustmentSourceDate(e) { this.setData({ adjustmentSourceDate: e.detail.value }); },
  chooseAdjustmentOwner(e) { this.setData({ adjustmentOwner: e.currentTarget.dataset.owner }); },
  chooseAdjustmentKind(e) { this.setData({ adjustmentKind: e.currentTarget.dataset.kind }); },
  saveAdjustment() {
    const d = Store.get();
    const { adjustmentDate: date, adjustmentSourceDate: sourceDate, adjustmentKind: kind, adjustmentOwner: selectedOwner } = this.data;
    const owners = selectedOwner === 'both' ? ['cat', 'dog'] : [selectedOwner];
    if (!date || (kind === 'use' && !sourceDate)) return wx.showToast({ title: '请选择日期', icon: 'none' });
    if (date < this.data.adjustmentMinDate || date > this.data.adjustmentMaxDate) return wx.showToast({ title: '调整日期不在学期内', icon: 'none' });
    if (kind === 'use' && sourceDate === date) return wx.showToast({ title: '请选不同的参照日期', icon: 'none' });
    if (kind === 'use' && owners.some(owner => { const week = Store.weekForDate(d, owner, sourceDate); return week < 1 || week > d.settings.weeks; })) {
      return wx.showToast({ title: '参照日期不在对应学期内', icon: 'none' });
    }
    const replacements = new Set(owners.map(owner => `${date}_${owner}`));
    d.adjustments = d.adjustments.filter(item => !replacements.has(`${item.date}_${item.owner}`));
    owners.forEach(owner => d.adjustments.push({ date, owner, kind, ...(kind === 'use' ? { sourceDate } : {}) }));
    Store.save(d);
    this.load();
    wx.showToast({ title: '调休已保存' });
  },
  removeAdjustment(e) {
    const key = e.currentTarget.dataset.key, d = Store.get();
    d.adjustments = d.adjustments.filter(item => `${item.date}_${item.owner}` !== key);
    Store.save(d);
    this.load();
    wx.showToast({ title: '已恢复正常课表' });
  },
  setBreak(e) {
    const key = e.currentTarget.dataset.key, index = Number(e.detail.value), d = Store.get();
    const last = Math.max(d.settings.catSections.length, d.settings.dogSections.length);
    if (!Number.isInteger(index) || index < 0 || index >= last - 1 || last < 2) return;
    if (key === 'lunchAfter') {
      d.settings.lunchAfter = Math.min(last - 1, index + 1);
      d.settings.dinnerAfter = Math.max(d.settings.dinnerAfter, d.settings.lunchAfter + 1);
    } else if (key === 'dinnerAfter') {
      d.settings.dinnerAfter = Math.min(last, index + 2);
      d.settings.lunchAfter = Math.min(d.settings.lunchAfter, d.settings.dinnerAfter - 1);
    } else return;
    Store.save(d);
    this.load();
  },
  toggleSections() { this.setData({ sectionsExpanded: !this.data.sectionsExpanded }); },
  switchOwner(e) { const sectionOwner = e.currentTarget.dataset.owner; const d = Store.get(); this.setData({ sectionOwner, sectionsExpanded: false, sections: d.settings[sectionOwner === 'dog' ? 'dogSections' : 'catSections'] }); },
  setTime(e) { const { index, key } = e.currentTarget.dataset, d = Store.get(), owner = this.data.sectionOwner, field = owner === 'dog' ? 'dogSections' : 'catSections'; d.settings[field][index][key] = e.detail.value; d.settings.sections = Store.clone(d.settings.catSections); Store.markSectionTimesChanged(d, owner); Store.save(d); this.setData({ sections: d.settings[field] }); },
  addSection() { this.setData({ sectionsExpanded: true }); const d = Store.get(); ['catSections', 'dogSections'].forEach(field => { const last = d.settings[field][d.settings[field].length - 1]; d.settings[field].push({ s: addMinutes(last.e, 5), e: addMinutes(last.e, 50) }); }); d.settings.sections = Store.clone(d.settings.catSections); Store.markSectionTimesChanged(d, ['cat', 'dog']); Store.save(d); this.load(); },
  removeSection(e) { const d = Store.get(), index = +e.currentTarget.dataset.index; if (d.settings.catSections.length <= 1) return wx.showToast({ title: '至少保留一节课', icon: 'none' }); ['catSections', 'dogSections'].forEach(field => d.settings[field].splice(index, 1)); const count = d.settings.catSections.length; d.courses.forEach(course => { course.slots.forEach(slot => { slot.s1 = Math.min(slot.s1, count); slot.s2 = Math.max(slot.s1, Math.min(slot.s2, count)); }); Object.assign(course, course.slots[0]); }); d.settings.sections = Store.clone(d.settings.catSections); Store.markSectionTimesChanged(d, ['cat', 'dog']); Store.save(d); this.load(); },
  avatar(e) { if (!this.data.avatarSaving) this.setData({ avatarTarget: e.currentTarget.dataset.owner, emojiSheet: true }); },
  chooseEmoji(e) { if (this.data.avatarSaving) return; const d = Store.get(), owner = this.data.avatarTarget; d.users[owner].avatar = e.currentTarget.dataset.emoji; Store.save(d); this.setData({ [`${owner}Avatar`]: d.users[owner].avatar, [`${owner}IsImage`]: false, emojiSheet: false }); this.load(); },
  uploadAvatar(e) {
    if (this.data.avatarSaving) return;
    const owner = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.owner || this.data.avatarTarget;
    if (!['cat', 'dog'].includes(owner)) return;
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album'], sizeType: ['compressed'],
      success: result => {
        const file = result.tempFiles && result.tempFiles[0];
        if (file && file.tempFilePath) this.uploadAvatarPath(file.tempFilePath, owner);
        else wx.showToast({ title:'没有选到图片', icon:'none' });
      },
      fail: error => { if (!/cancel/i.test(String(error && error.errMsg || ''))) wx.showToast({ title:'选择图片失败', icon:'none' }); }
    });
  },
  onWechatAvatarTap() { this.setData({ avatarHelp:'如果没有弹出微信头像选择，可点“从相册选择头像”；也可先把微信头像保存到手机相册。' }); },
  onChooseAvatar(e) {
    const path = e.detail && e.detail.avatarUrl;
    if (!path) { this.setData({ avatarHelp:'微信没有返回头像，请用“从相册选择头像”重试。' }); return; }
    this.setData({ avatarHelp:'' });
    return this.uploadAvatarPath(path, Store.get().me);
  },
  async uploadAvatarPath(path, owner) {
    if (!path || !['cat', 'dog'].includes(owner) || this.data.avatarSaving) return;
    this.setData({ avatarSaving: true });
    wx.showLoading({ title: '正在保存头像' });
    let notice = '头像已保存', succeeded = false;
    try {
      let avatar = '';
      for (const options of AVATAR_COMPRESSION) {
        const compressed = await compressAvatar(path, options);
        const base64 = await readAvatar(compressed);
        const mime = avatarMime(base64);
        if (!mime) throw new Error('图片格式不支持');
        if (base64.length <= AVATAR_MAX_BASE64_CHARS) { avatar = `data:${mime};base64,${base64}`; break; }
        if (compressed === path) throw new Error('头像压缩失败，请换张图片');
      }
      if (!avatar) throw new Error('头像过大，请换张图片');
      const data = Store.get();
      data.users[owner].avatar = avatar;
      Store.save(data);
      this.setData({ emojiSheet: false, avatarHelp:'' });
      this.load();
      succeeded = true;
    } catch (error) {
      console.warn('avatar save failed', { message: String(error && error.message || error) });
      notice = error && error.message || '头像保存失败';
    } finally {
      wx.hideLoading();
      this.setData({ avatarSaving: false });
    }
    wx.showToast({ title: notice, icon: succeeded ? 'success' : 'none' });
  },
  useWechatNickname(e) {
    const name = String(e.detail.value || '').trim(); if (!name) return;
    const d = Store.get(), owner = d.me; d.users[owner].name = name; Store.save(d); this.load(); wx.showToast({ title: '昵称已保存' });
  },
  closeAvatar() { this.setData({ emojiSheet: false }); },
  noop() {},
  clear() { wx.showModal({ title: '清空课程', content: '确定清空所有课程吗？此操作不可恢复。', success: res => { if (res.confirm) { const d = Store.get(); d.courses = []; d.deletedCourses = []; d.adjustments = []; Store.save(d); this.load(); wx.showToast({ title: '已清空' }); } } }); },
  reset() { wx.showModal({ title: '恢复默认', content: '恢复默认设置会覆盖当前的课表和设置。', success: res => { if (res.confirm) { Store.reset(); this.setData({ sectionOwner: 'cat' }); this.load(); wx.showToast({ title: '已恢复默认' }); } } }); }
});
