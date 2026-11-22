import { state } from '../../lib/state';
import { storage, exportImage } from '../../lib/platform';
import Store from '../utils/store';
import Day from '../utils/schedule-day';
import Poster from '../utils/poster';
import { ui, notify } from '../navigation';
function loadImage(source) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片读取失败，请重新选择头像后重试')); img.src = source; }); }
async function avatar(source) {
  if (/^cloud:\/\/|^wxfile:\/\//.test(source)) throw new Error('请在设置中重新选择头像，再生成分享图');
  return /^(data:|https?:\/\/|blob:)/.test(source) ? loadImage(source) : null;
}
export default {
  data: { skin: 'blush', week: 1, weekIndex: 0, weekRange: '', weekOptions: [], filter: 'both', includeWeekend: true, maskCourses: false, busy: false, posterPath: '', error: '', canvasHeight: 600 },
  onLoad(options) {
    const data = state.data, current = Math.floor((Day.dayNumber(Day.shanghaiDate()) - Day.dayNumber(Store.calendarStart(data))) / 7) + 1;
    this.setData({ filter: ['cat', 'dog'].includes(options.filter) ? options.filter : 'both', weekOptions: Array.from({ length: Store.calendarWeeks(data) }, (_, index) => `第 ${index + 1} 周`) });
    this.chooseWeek(Math.max(1, Math.min(Store.calendarWeeks(data), +options.week || current)));
  },
  onShow() { ui.title = '分享课表'; this.setData({ skin: state.skin }); },
  async onReady() { this.setData({ includeWeekend: await storage.get('poster.weekend', true) }); this.chooseWeek(this.data.week); await this.generate(); },
  onUnload() { this.destroyed = true; this.generation = (this.generation || 0) + 1; },
  chooseWeek(week) {
    const date = Day.addDays(Store.calendarStart(state.data), (week - 1) * 7), end = Day.addDays(date, this.data.includeWeekend ? 6 : 4);
    this.setData({ week, weekIndex: week - 1, date, weekRange: `${date.slice(5).replace('-', '.')} — ${end.slice(5).replace('-', '.')}` });
  },
  setWeek(event) { this.chooseWeek(+event.detail.value + 1); this.generate(); },
  setWeekend(event) { this.setData({ includeWeekend: !!event.detail.value }); storage.set('poster.weekend', this.data.includeWeekend); this.chooseWeek(this.data.week); this.generate(); },
  setMask(event) { this.setData({ maskCourses: !!event.detail.value }); this.generate(); },
  async generate() {
    const generation = (this.generation || 0) + 1; this.generation = generation;
    this.setData({ busy: true, error: '', posterPath: '' });
    try {
      const model = Poster.model(Store.get(), this.data.date, this.data.maskCourses, { skin: state.skin, filter: this.data.filter, includeWeekend: this.data.includeWeekend });
      const canvas = document.createElement('canvas'); canvas.width = model.width; canvas.height = model.height;
      const [qrImage, catAvatarImage, dogAvatarImage] = await Promise.all([loadImage('/assets/claswee-mini-code.jpg'), avatar(model.catAvatar), avatar(model.dogAvatar)]);
      if (this.destroyed || generation !== this.generation) return;
      Poster.draw(canvas.getContext('2d'), model, { qrImage, catAvatarImage, dogAvatarImage });
      this.setData({ posterPath: canvas.toDataURL('image/png'), canvasHeight: model.height / 2 });
    } catch (error) { if (!this.destroyed && generation === this.generation) this.setData({ error: error.message }); }
    finally { if (!this.destroyed && generation === this.generation) this.setData({ busy: false }); }
  },
  preview() {},
  async saveImage() { if (this.data.posterPath) { await exportImage('claswee周课表.png', this.data.posterPath, false); notify('图片已保存'); } },
  async shareImage() { if (this.data.posterPath) await exportImage('claswee周课表.png', this.data.posterPath, true); },
};
