const Store = require('../../utils/store');
const Skin = require('../../utils/skin');
const Sync = require('../../utils/sync');

const Parser = require('../../utils/course-import');
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEK_MODES = [{ value: 'all', label: '每周' }, { value: 'odd', label: '单周' }, { value: 'even', label: '双周' }];
const IMAGE_IMPORT_URL = 'https://masic-blog-d6g6d4r87bc035c0e-1324333320.ap-shanghai.app.tcloudbase.com/schedule-image-import';
const CHUNK_CHARS = 80000;
const UPLOAD_CONCURRENCY = 4;

function requestImage(payload, clientId) {
  return new Promise((resolve, reject) => wx.request({
    url: IMAGE_IMPORT_URL, method: 'POST', timeout: 65000,
    header: { 'Content-Type': 'application/json', 'X-Claswee-Client': clientId },
    data: Object.assign({ clientId }, payload),
    success: response => {
      const result = typeof response.data === 'string' ? (() => { try { return JSON.parse(response.data); } catch (_) { return {}; } })() : response.data || {};
      if (result.ok) resolve(result);
      else reject(new Error(result.message || `识别失败（HTTP ${response.statusCode}）`));
    },
    fail: error => reject(new Error(String(error && error.errMsg || '网络错误')))
  }));
}

function freshId() { return `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sectionLabels(count) { return Array.from({ length: count }, (_, index) => `第${index + 1}节`); }
function asCourse(raw, owner, count, weeks) {
  const slots = (Array.isArray(raw.slots) ? raw.slots : []).filter(slot => slot && Number.isInteger(slot.day) && slot.day >= 1 && slot.day <= 7).map(slot => {
    const explicitS1 = Number.isInteger(slot.s1) && slot.s1 >= 1 && slot.s1 <= count ? slot.s1 : null;
    const explicitS2 = Number.isInteger(slot.s2) && slot.s2 >= 1 && slot.s2 <= count ? slot.s2 : null;
    const guessedS1 = Number.isInteger(slot.suggestedS1) && slot.suggestedS1 >= 1 && slot.suggestedS1 <= count ? slot.suggestedS1 : null;
    const guessedS2 = Number.isInteger(slot.suggestedS2) && slot.suggestedS2 >= guessedS1 && slot.suggestedS2 <= count ? slot.suggestedS2 : null;
    const sectionEstimated = !explicitS1 && !explicitS2 && !!guessedS1 && !!guessedS2;
    return { day:slot.day, s1:sectionEstimated ? guessedS1 : explicitS1, s2:sectionEstimated ? guessedS2 : explicitS2, suggestedS1:guessedS1, suggestedS2:guessedS2, sectionEstimated, dayUncertain:!!slot.dayUncertain };
  });
  if (!raw.name || !slots.length) return null;
  const wfDefaulted = !Number.isInteger(raw.wf), wtDefaulted = !Number.isInteger(raw.wt);
  return { name: String(raw.name).trim(), loc: raw.loc || '', teacher: raw.teacher || '', owner, slots, day: slots[0].day, s1: slots[0].s1, s2: slots[0].s2, week: raw.week === 'custom' ? (['odd', 'even'].includes(raw.customParity) ? raw.customParity : 'all') : (['odd', 'even'].includes(raw.week) ? raw.week : 'all'), wf: wfDefaulted ? 1 : raw.wf, wt: wtDefaulted ? weeks : raw.wt, wfDefaulted, wtDefaulted, weekDefaulted: wfDefaulted || wtDefaulted, customParity: ['all', 'odd', 'even'].includes(raw.customParity) ? raw.customParity : 'all', warning: raw.warning || '' };
}

Page({
  onLoad() { wx.redirectTo({ url: '/pages/course-assistant/index?source=image' }); },
  data: { skin: 'blush', imagePath: '', owner: 'cat', ownerLabel: '小猫', catName: '小猫', dogName: '小狗', busy: false, status: '', courses: [], warnings: [], days: DAYS, sections: [], weekModes: WEEK_MODES, weekLabels: WEEK_MODES.map(item => item.label) },
  onShow() {
    Skin.apply(this);
    const data = Store.get(), owner = this.ownerInitialized ? this.data.owner : (data.me === 'dog' ? 'dog' : 'cat');
    this.ownerInitialized = true;
    this.setData({ catName: data.users.cat.name, dogName: data.users.dog.name, owner, ownerLabel: data.users[owner].name, sections: sectionLabels((owner === 'dog' ? data.settings.dogSections : data.settings.catSections).length) });
  },
  onUnload() { this.destroyed = true; },
  chooseOwner(e) {
    if (this.data.busy) return;
    const data = Store.get(), owner = e.currentTarget.dataset.owner;
    this.setData({ catName: data.users.cat.name, dogName: data.users.dog.name, owner, ownerLabel: data.users[owner].name, sections: sectionLabels((owner === 'dog' ? data.settings.dogSections : data.settings.catSections).length), courses: [] });
  },
  chooseImage() {
    if (this.data.busy || this.choosingImage) return;
    this.choosingImage = true;
    const finish = imagePath => {
      this.choosingImage = false;
      if (!this.destroyed) this.setData({ imagePath, courses: [], warnings: [], status: '' });
    };
    wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['original'], success: result => {
      if (this.destroyed || !result.tempFiles || !result.tempFiles.length) { this.choosingImage = false; return; }
      const original = result.tempFiles[0].tempFilePath;
      if (result.tempFiles[0].size <= 3 * 1024 * 1024) return finish(original);
      wx.compressImage({ src: original, quality: 85, success: compressed => finish(compressed.tempFilePath), fail: () => finish(original) });
    }, fail: () => { this.choosingImage = false; } });
  },
  recognize() {
    if (!this.data.imagePath || this.data.busy || this.choosingImage) return;
    const data = Store.get(), owner = this.data.owner, sections = owner === 'dog' ? data.settings.dogSections : data.settings.catSections;
    this.settingsSnapshot = JSON.stringify(data.settings);
    this.setData({ busy: true, status: '正在识别课表…', courses: [], warnings: [] });
    wx.getFileSystemManager().readFile({ filePath: this.data.imagePath, encoding: 'base64', success: file => {
      if (this.destroyed) return;
      if (file.data.length > 4 * 1024 * 1024) { this.setData({ busy: false, status: '图片过大，请裁剪后重试（压缩后不超过 3MB）' }); return; }
      const mime = file.data.startsWith('iVBOR') ? 'png' : file.data.startsWith('/9j/') ? 'jpeg' : file.data.startsWith('UklGR') ? 'webp' : '';
      if (!mime) { this.setData({ busy: false, status: '请选择 JPG、PNG 或 WEBP 图片' }); return; }
      const clientId = Sync.config().clientId;
      const uploadId = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const partCount = Math.ceil(file.data.length / CHUNK_CHARS);
      (async () => {
        const uploadPart = partIndex => requestImage({ action:'upload', uploadId, partIndex, partCount, mime,
          content:file.data.slice(partIndex * CHUNK_CHARS, (partIndex + 1) * CHUNK_CHARS), sections }, clientId);
        await uploadPart(0);
        if (!this.destroyed) this.setData({ status:`正在上传图片 1/${partCount}…` });
        for (let start = 1; start < partCount; start += UPLOAD_CONCURRENCY) {
          if (this.destroyed) throw new Error('页面已关闭');
          const indexes = Array.from({ length:Math.min(UPLOAD_CONCURRENCY, partCount - start) }, (_, offset) => start + offset);
          const settled = await Promise.all(indexes.map(index => uploadPart(index).then(() => null, error => error)));
          const failed = settled.find(error => error);
          if (failed) throw failed;
          if (!this.destroyed) this.setData({ status:`正在上传图片 ${Math.min(start + UPLOAD_CONCURRENCY, partCount)}/${partCount}…` });
        }
        if (this.destroyed) throw new Error('页面已关闭');
        this.setData({ status: '正在提取文字位置…' });
        const prepared = await requestImage({ action: 'prepare', uploadId, owner, weeks: data.settings.weeks, sectionCount: sections.length, sections, lunchAfter:data.settings.lunchAfter, dinnerAfter:data.settings.dinnerAfter }, clientId).catch(() => ({ ocrReady:false, message:'OCR 暂不可用，继续使用图片识别；请仔细核对星期' }));
        if (this.destroyed) throw new Error('页面已关闭');
        this.setData({ status: prepared.message || '正在识别课表…' });
        const result = await requestImage({ action: 'recognize', uploadId, owner, weeks: data.settings.weeks, sectionCount: sections.length, sections, lunchAfter:data.settings.lunchAfter, dinnerAfter:data.settings.dinnerAfter }, clientId);
        if (!prepared.ocrReady) result.warnings = [prepared.message || 'OCR 未启用，请核对星期', ...(result.warnings || [])];
        return result;
      })().then(result => {
        if (this.destroyed) return;
        const courses = (result.courses || []).map(item => asCourse(item, owner, sections.length, data.settings.weeks)).filter(Boolean);
        this.setData({ busy: false, courses, warnings: result.warnings || [], status: courses.length ? `识别到 ${courses.length} 门课程，请确认后导入` : '没有识别到可导入课程，请换一张更清晰的课表图片' });
      }).catch(error => {
        requestImage({ action: 'cancel', uploadId, sections }, clientId).catch(() => {});
        if (this.destroyed) return;
        const message = String(error && error.message || '网络错误');
        console.warn('scheduleImageImport request failed', { message });
        this.setData({ busy: false, status: /domain list|合法域名/i.test(message) ? '识别域名未加入小程序 request 合法域名' : /timeout/i.test(message) ? '识别请求超时，请重试' : message });
      });
    }, fail: () => { if (!this.destroyed) this.setData({ busy: false, status: '图片读取失败，请重新选择' }); } });
  },
  input(e) {
    const index = +e.currentTarget.dataset.index, key = e.currentTarget.dataset.key, courses = clone(this.data.courses);
    if (!courses[index] || !['name','loc','teacher','wf','wt'].includes(key)) return;
    courses[index][key] = e.detail.value;
    if (key === 'wf' || key === 'wt') {
      courses[index][`${key}Defaulted`] = false;
      courses[index].weekDefaulted = !!(courses[index].wfDefaulted || courses[index].wtDefaulted);
    }
    this.setData({ courses });
  },
  pick(e) {
    const index = +e.currentTarget.dataset.index, key = e.currentTarget.dataset.key, courses = clone(this.data.courses), value = +e.detail.value;
    if (!courses[index]) return;
    const course = courses[index], slot = course.slots[+e.currentTarget.dataset.slot || 0];
    if (key === 'day') slot.day = value + 1;
    if (key === 'day') slot.dayUncertain = false;
    if (key === 's1') { slot.s1 = value + 1; slot.sectionEstimated = false; }
    if (key === 's2') { slot.s2 = value + 1; slot.sectionEstimated = false; }
    if (key === 'week') course.week = WEEK_MODES[value].value;
    if (slot.s1 && slot.s2 && slot.s2 < slot.s1) slot.s2 = slot.s1;
    Object.assign(course, course.slots[0]);
    this.setData({ courses });
  },
  acceptSuggestion(e) {
    const index = +e.currentTarget.dataset.index, slotIndex = +e.currentTarget.dataset.slot, courses = clone(this.data.courses);
    const course = courses[index], slot = course && course.slots[slotIndex];
    if (!slot || !slot.suggestedS1 || !slot.suggestedS2 || slot.suggestedS2 < slot.suggestedS1) return;
    slot.s1 = slot.suggestedS1;
    slot.s2 = slot.suggestedS2;
    slot.sectionEstimated = false;
    Object.assign(course, course.slots[0]);
    this.setData({ courses });
  },
  remove(e) { const courses = clone(this.data.courses); courses.splice(+e.currentTarget.dataset.index, 1); this.setData({ courses }); },
  confirm() {
    if (this.data.busy || !this.data.courses.length) return;
    const data = Store.get(), owner = this.data.owner;
    if (JSON.stringify(data.settings) !== this.settingsSnapshot) return wx.showToast({ title: '节次或学期已改变，请重新识别', icon: 'none' });
    const incoming = [];
    for (const course of this.data.courses) {
      const wf = Number(course.wf), wt = Number(course.wt);
      if (!course.name.trim() || !Number.isInteger(wf) || !Number.isInteger(wt) || wf < 1 || wt < wf || wt > data.settings.weeks) return wx.showToast({ title: `请填写有效课程名和周次（1至${data.settings.weeks}周）`, icon: 'none' });
      if (course.slots.some(slot => !Number.isInteger(slot.day) || slot.day < 1 || slot.day > 7 || !Number.isInteger(slot.s1) || !Number.isInteger(slot.s2) || slot.s1 < 1 || slot.s2 < slot.s1 || slot.s2 > (owner === 'dog' ? data.settings.dogSections : data.settings.catSections).length)) return wx.showToast({ title: '请逐项选择有效的上课节次', icon: 'none' });
      const parity = course.week === 'custom' ? course.customParity : course.week;
      for (let w = wf; w <= wt; w++) {
        if (parity === 'odd' && w % 2 === 0 || parity === 'even' && w % 2 === 1) continue;
        for (const slot of course.slots) incoming.push({ name:course.name, loc:course.loc, teacher:course.teacher, owner, day:slot.day, s1:slot.s1, s2:slot.s2, slots:[{ day:slot.day, s1:slot.s1, s2:slot.s2 }], wf:w, wt:w, week:'custom', customParity:'all' });
      }
    }
    if (!incoming.length) return wx.showToast({ title: '所选周次没有上课日期', icon: 'none' });
    const estimates = this.data.courses.reduce((count, course) => count + course.slots.filter(slot => slot.sectionEstimated || slot.dayUncertain).length, 0);
    const defaultedWeeks = this.data.courses.filter(course => course.weekDefaulted).length;
    wx.showModal({ title: '确认导入截图课表', content: `将课程添加给${this.data.ownerLabel}，保留已有课程并跳过重复时段。${defaultedWeeks ? `有 ${defaultedWeeks} 门课的周次按当前学期预填，请确认。` : ''}${estimates ? `有 ${estimates} 个时段含 AI 推测节次或待核对星期，请对照原图确认。` : '请确认周次及节次已核对。'}`, success: result => {
      if (!result.confirm || this.destroyed) return;
      const latest = Store.get();
      if (JSON.stringify(latest.settings) !== this.settingsSnapshot) return wx.showToast({ title: '设置已变化，请重新识别', icon: 'none' });
      try {
        const plan = Parser.importPlan(incoming, latest, owner);
        plan.courses.forEach(course => latest.courses.push(Object.assign({}, course, { id: freshId() })));
        Store.save(latest);
        this.setData({ courses: [], status: `已导入 ${plan.courses.length} 条课程安排，重复时段已跳过` });
      } catch (_) { wx.showToast({ title: '课程数据有误，请核对后重试', icon: 'none' }); }
    } });
  }
});
