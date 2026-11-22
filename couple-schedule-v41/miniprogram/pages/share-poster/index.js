const Store = require('../../utils/store');
const Share = require('../../utils/share');
const Skin = require('../../utils/skin');
const Day = require('../../utils/schedule-day');
const Poster = require('../../utils/poster');
const Images = require('../../utils/poster-images');
const WEEKEND_KEY = 'claswee.poster.includeWeekend';
Page({
  onShareAppMessage: Share.appMessage,
  onShareTimeline: Share.timeline,
  data: { skin: 'blush', filter: 'both', date: '', week: 1, weekIndex: 0, weekOptions: [], weekRange: '', includeWeekend: true, maskCourses: false, busy: false, posterPath: '', error: '', canvasHeight: 600 },
  onLoad(options = {}) {
    const data = Store.get(), start = Store.calendarStart(data), total = Store.calendarWeeks(data);
    const current = Math.floor((Day.dayNumber(Day.shanghaiDate()) - Day.dayNumber(start)) / 7) + 1;
    const week = Math.max(1, Math.min(total, +options.week || current));
    this.setData({ includeWeekend: wx.getStorageSync(WEEKEND_KEY) !== false, filter: ['cat', 'dog'].includes(options.filter) ? options.filter : 'both', weekOptions: Array.from({ length: total }, (_, index) => `第 ${index + 1} 周`) });
    this.chooseWeek(week);
  },
  onShow() { Share.enable(); Skin.apply(this); },
  onReady() { this.generate(); },
  onUnload() { this.destroyed = true; this.generation = (this.generation || 0) + 1; },
  chooseWeek(week) {
    const data = Store.get(), date = Day.addDays(Store.calendarStart(data), (week - 1) * 7), end = Day.addDays(date, this.data.includeWeekend ? 6 : 4);
    this.setData({ week, weekIndex: week - 1, date, weekRange: `${date.slice(5).replace('-', '.')} — ${end.slice(5).replace('-', '.')}` });
  },
  setWeek(e) { this.chooseWeek(+e.detail.value + 1); this.generate(); },
  setWeekend(e) {
    const includeWeekend = !!e.detail.value;
    wx.setStorageSync(WEEKEND_KEY, includeWeekend);
    this.setData({ includeWeekend }, () => { this.chooseWeek(this.data.week); this.generate(); });
  },
  setMask(e) { this.setData({ maskCourses: !!e.detail.value }, () => this.generate()); },
  async generate() {
    const generation = (this.generation || 0) + 1; this.generation = generation;
    const temporaryFiles = [];
    this.setData({ busy: true, posterPath: '', error: '' });
    try {
      const model = Poster.model(Store.get(), this.data.date, this.data.maskCourses, { skin: Skin.get(), filter: this.data.filter, includeWeekend: this.data.includeWeekend });
      await new Promise(resolve => this.setData({ canvasHeight: model.height / 2 }, resolve));
      const node = await new Promise(resolve => wx.createSelectorQuery().in(this).select('#shareCanvas').fields({ node: true, size: true }).exec(result => resolve(result && result[0] && result[0].node)));
      if (this.destroyed || generation !== this.generation) return;
      if (!node) throw new Error('当前微信版本无法生成图片，请更新微信后重试');
      node.width = model.width; node.height = model.height;
      const results = await Promise.all([
        Images.load(node, '/assets/claswee-mini-code.jpg', '小程序码加载失败，请重试'),
        Images.avatar(node, model.catAvatar, temporaryFiles),
        Images.avatar(node, model.dogAvatar, temporaryFiles)
      ].map(promise => promise.then(value => ({ value }), error => ({ error }))));
      const failed = results.find(result => result.error); if (failed) throw failed.error;
      const [qrImage, catAvatarImage, dogAvatarImage] = results.map(result => result.value);
      if (this.destroyed || generation !== this.generation) return;
      Poster.draw(node.getContext('2d'), model, { qrImage, catAvatarImage, dogAvatarImage });
      await new Promise(resolve => typeof node.requestAnimationFrame === 'function' ? node.requestAnimationFrame(resolve) : setTimeout(resolve, 30));
      if (this.destroyed || generation !== this.generation) return;
      const path = await new Promise((resolve, reject) => wx.canvasToTempFilePath({ canvas: node, destWidth: model.width, destHeight: model.height, fileType: 'png', success: result => resolve(result.tempFilePath), fail: () => reject(new Error('图片生成失败，请重试')) }, this));
      if (!this.destroyed && generation === this.generation) this.setData({ posterPath: path, busy: false });
    } catch (error) { if (!this.destroyed && generation === this.generation) this.setData({ busy: false, error: error.message || '图片生成失败' }); }
    finally { Images.release(temporaryFiles); }
  },
  preview() { if (this.data.posterPath) wx.previewImage({ urls: [this.data.posterPath] }); },
  shareImage() {
    if (!this.data.posterPath || this.data.busy) return;
    if (typeof wx.showShareImageMenu === 'function') wx.showShareImageMenu({ path: this.data.posterPath, fail: error => { if (!/cancel/i.test(String(error.errMsg || ''))) this.preview(); } });
    else this.preview();
  },
  saveImage() {
    if (!this.data.posterPath || this.data.busy) return;
    wx.saveImageToPhotosAlbum({ filePath: this.data.posterPath, success: () => wx.showToast({ title: '已保存到相册' }), fail: error => {
      if (/cancel/i.test(String(error.errMsg || ''))) return;
      if (/auth|deny|denied|authorize/i.test(String(error.errMsg || ''))) wx.showModal({ title: '开启相册权限', content: '允许保存图片后，就能把这张课表图发到朋友圈。', confirmText: '去设置', success: result => { if (result.confirm) wx.openSetting({}); } });
      else wx.showToast({ title: '保存失败，可长按预览图保存', icon: 'none' });
    } });
  }
});
