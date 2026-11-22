import { state, editData, networkAllowed } from '../../lib/state';
import { readImage, recognizeImage, deduplicateCourses } from '../../lib/image-import';
import { clone, uuid } from '../../lib/timetable';
import { ui, notify, navigateBack, modal } from '../navigation';
import { chooseFile } from '../runtime';
export default {
  data: { skin: 'blush', owner: 'cat', catName: '小猫', dogName: '小狗', imagePath: '', busy: false, status: '', warnings: [], courses: [], days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], sections: [], weekLabels: ['每周', '单周', '双周'] },
  onShow() { ui.title = '截图导入'; this.setData({ skin: state.skin, owner: state.data.me, catName: state.data.users.cat.name, dogName: state.data.users.dog.name }); this.updateSections(); },
  updateSections() { this.setData({ sections: state.data.settings[`${this.data.owner}Sections`].map((_, index) => `第${index + 1}节`) }); },
  chooseOwner(event) { if (this.data.busy) return; this.setData({ owner: event.currentTarget.dataset.owner, courses: [], warnings: [] }); this.updateSections(); },
  async chooseImage() {
    if (this.data.busy) return;
    const file = await chooseFile('image/*'); if (!file) return;
    this.setData({ imagePath: await readImage(file), courses: [], warnings: [], status: '' });
  },
  async recognize() {
    if (this.data.busy || !this.data.imagePath) return;
    if (!networkAllowed()) { ui.legal = 'privacy'; return; }
    const consent = await modal({ title: '识别课表图片', content: '将所选图片发送至云端识别，确认识别结果后才会写入课表。', confirmText: '同意并识别' });
    if (!consent.confirm) return;
    this.setData({ busy: true, status: '正在准备图片…', courses: [], warnings: [] });
    this.snapshot = JSON.stringify(state.data.settings);
    try {
      const result = await recognizeImage(this.data.imagePath, clone(state.data), this.data.owner, state.connection.clientId, status => this.setData({ status }));
      this.setData({ courses: result.courses, warnings: result.warnings, status: result.courses.length ? `识别到 ${result.courses.length} 门课，请逐项核对` : '没有识别到课程，请换一张更清晰的图片' });
    } catch (error) { this.setData({ status: error.message }); }
    finally { this.setData({ busy: false }); }
  },
  input(event) {
    const { index, key } = event.currentTarget.dataset, courses = this.data.courses;
    courses[index][key] = ['wf', 'wt'].includes(key) ? Number(event.detail.value) : event.detail.value;
    if (['wf', 'wt'].includes(key)) { courses[index][`${key}Defaulted`] = false; courses[index].weekDefaulted = courses[index].wfDefaulted || courses[index].wtDefaulted; }
  },
  pick(event) {
    const { index, slot, key } = event.currentTarget.dataset, course = this.data.courses[index], value = Number(event.detail.value);
    if (key === 'week') course.week = ['all', 'odd', 'even'][value];
    else { course.slots[slot][key] = value + 1; if (key === 'day') course.slots[slot].dayUncertain = false; else course.slots[slot].sectionEstimated = false; if (key === 's1' && course.slots[slot].s2 < value + 1) course.slots[slot].s2 = value + 1; }
  },
  remove(event) { this.data.courses.splice(+event.currentTarget.dataset.index, 1); },
  async confirm() {
    if (this.data.busy) return;
    if (JSON.stringify(state.data.settings) !== this.snapshot) return notify('学期或节次设置已变化，请重新识别');
    const incoming = deduplicateCourses(this.data.courses, state.data);
    await editData(data => incoming.forEach(course => data.courses.push({ ...course, id: uuid('course') })));
    notify(`已导入 ${incoming.length} 门课程，重复课程已跳过`); navigateBack();
  },
};
