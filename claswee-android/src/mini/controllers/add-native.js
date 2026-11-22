import original from './add';
import { state, saveCourse, deleteCourse } from '../../lib/state';
import { clone } from '../../lib/timetable';
import { notify, modal, navigateBack } from '../navigation';
export default {
  ...original,
  onShow() { original.onShow.call(this); this.updateSections(); },
  updateSections() {
    const count = state.data.settings[`${this.data.owner}Sections`].length;
    this.setData({ sections: Array.from({ length: count }, (_, index) => `第${index + 1}节`), slots: this.data.slots.map(slot => ({ ...slot, s1: Math.min(slot.s1, count), s2: Math.min(slot.s2, count) })) });
  },
  chooseOwner(event) { original.chooseOwner.call(this, event); this.updateSections(); },
  async save() {
    if (this.saving) return;
    this.saving = true;
    try {
      const d = this.data;
      await saveCourse({ ...(d.editing ? { id: d.courseId } : {}), owner: d.owner, name: d.name, loc: d.loc.trim(), teacher: d.teacher.trim(), week: d.week, wf: d.wf, wt: d.wt, customParity: d.customParity, slots: clone(d.slots) });
      notify(d.editing ? '已更新' : '已添加'); navigateBack();
    } finally { this.saving = false; }
  },
  async remove() {
    const result = await modal({ title: '删除课程', content: '确定删除这门课吗？此操作会同步到另一台设备。' });
    if (result.confirm) { await deleteCourse(this.data.courseId); notify('已删除'); navigateBack(); }
  },
};
