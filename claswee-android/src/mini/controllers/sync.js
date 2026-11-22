import { state, connectRoom, leaveRoom, changePassword, sync, editData, networkAllowed } from '../../lib/state';
import { exportFile, shareText } from '../../lib/platform';
import { clone, validateBackup } from '../../lib/timetable';
import { ui, notify, modal, navigate } from '../navigation';
import { chooseFile } from '../runtime';
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const csv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
function lastSync() { return state.lastSync ? new Date(state.lastSync).toLocaleString('zh-CN', { hour12: false }) : '尚未同步'; }
export default {
  data: { skin: 'blush', mode: 'join', room: '', password: '', confirmPassword: '', connected: false, status: '', lastSync: '尚未同步', fileStatus: '', busy: false, invitedRoom: '', invitation: false, passwordEditor: false, oldPassword: '', newPassword: '', newPasswordConfirm: '' },
  onShow() { ui.title = 'claswee 同步'; this.setData({ skin: state.skin, password: '', confirmPassword: '', passwordEditor: false }); this.update(); },
  onHide() { this.setData({ password: '', confirmPassword: '', oldPassword: '', newPassword: '', newPasswordConfirm: '', passwordEditor: false }); },
  update() {
    this.setData({ connected: !!state.connection.room && !state.connection.needsAuth, lastSync: lastSync(), ...(state.connection.room ? { room: state.connection.room } : {}) });
    if (state.connection.needsAuth) this.setData({ status: '房间信息已保留，请输入密码重新验证。' });
    else if (state.syncError) this.setData({ status: '连接暂时不可用，房间和本机课表已保留。恢复网络后会自动重连。' });
  },
  input(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  mode(event) { if (!this.data.busy) this.setData({ mode: event.currentTarget.dataset.mode, password: '', confirmPassword: '', status: '' }); },
  async enterRoom() {
    if (this.data.busy) return;
    if (!networkAllowed()) { ui.legal = 'privacy'; return; }
    const { mode, password, confirmPassword } = this.data, room = this.data.room.trim();
    if (mode === 'create' && !/^[A-Za-z0-9_-]{4,24}$/.test(room)) return notify('新房间码需为4–24位字母、数字、下划线或短横线');
    if (!room || room.length > 64) return notify('请填写正确的房间码');
    if (password.length < 6 || password.length > 72) return notify('密码需为6–72位');
    if (mode === 'create' && password !== confirmPassword) return notify('两次密码不一致');
    this.setData({ busy: true, status: mode === 'create' ? '正在创建房间…' : '正在验证密码…' });
    try {
      try { await connectRoom(mode === 'create' ? 'create' : 'join', room, password); }
      catch (error) {
        if (mode !== 'join' || error.code !== 'LEGACY_ROOM_UNCLAIMED') throw error;
        const answer = await modal({ title: '认领旧房间', content: '这是以前创建的无密码房间。确认后，当前密码将成为该房间的新密码，原课表会完整保留。', confirmText: '确认认领' });
        if (!answer.confirm) throw new Error('已取消认领旧房间');
        await connectRoom('claimLegacy', room, password);
      }
      this.setData({ room: state.connection.room, connected: true, password: '', confirmPassword: '', status: mode === 'create' ? '房间创建成功，当前课表已上传 ✅' : '密码正确，已加入并拉取课表 ✅', lastSync: lastSync() });
      notify(mode === 'create' ? '创建成功' : '加入成功');
    } catch (error) { this.setData({ status: error.message }); }
    finally { this.setData({ busy: false }); }
  },
  togglePasswordEditor() { this.setData({ passwordEditor: !this.data.passwordEditor, oldPassword: '', newPassword: '', newPasswordConfirm: '' }); },
  async changePassword() {
    if (this.data.busy) return;
    const { oldPassword, newPassword, newPasswordConfirm } = this.data;
    if (!oldPassword) return notify('请填写旧密码');
    if (newPassword !== newPasswordConfirm) return notify('两次新密码不一致');
    if (oldPassword === newPassword) return notify('新密码不能与旧密码相同');
    this.setData({ busy: true });
    try { await changePassword(oldPassword, newPassword, this.data.room); this.setData({ passwordEditor: false, status: '密码已修改，已连接设备可以继续同步。' }); notify('密码已修改'); }
    catch (error) { this.setData({ status: error.message }); }
    finally { this.setData({ busy: false, oldPassword: '', newPassword: '', newPasswordConfirm: '' }); }
  },
  async leave() {
    if (this.data.busy) return;
    const result = await modal({ title: '退出房间', content: '会注销本机访问凭证，云端房间和本地课表仍会保留。' });
    if (!result.confirm) return;
    await leaveRoom(); this.setData({ connected: false, room: '', status: '已退出房间', lastSync: '尚未同步' });
  },
  async push() { return this.performSync('上传'); }, async pull() { return this.performSync('拉取'); },
  async performSync(verb) {
    if (this.data.busy) return;
    this.setData({ busy: true, status: `正在${verb}…` });
    try {
      if (!networkAllowed()) { ui.legal = 'privacy'; throw new Error('请先同意开启云服务'); }
      await sync(); this.update();
      if (state.connection.needsAuth) return;
      this.setData({ status: `${verb}成功 ✅`, lastSync: lastSync() });
    } catch (error) { this.update(); if (!state.syncError && !state.connection.needsAuth) this.setData({ status: `${verb}失败：${error.message}` }); }
    finally { this.setData({ busy: false }); }
  },
  openMessage() { ui.compose = true; },
  openSharePoster() { navigate('/pages/share-poster/index'); },
  async invite() { await shareText(`一起用 claswee 情侣课表\n房间码：${state.connection.room}\n在“同步”页输入房间码，密码请另行告诉对方。`); },
  async exportJson() { await exportFile('claswee同步文件.json', clone(state.data)); this.setData({ fileStatus: '同步文件已生成，可通过系统菜单发送。' }); },
  async exportCsv() {
    const d = state.data, rows = [['课程名称', '谁的课', '星期', '开始节次', '结束节次', '周次', '上课地点', '老师']];
    for (const c of d.courses) for (const slot of c.slots) rows.push([c.name, d.users[c.owner].name, DAY_NAMES[slot.day - 1], slot.s1, slot.s2, c.week === 'all' ? '每周' : c.week === 'odd' ? '单周' : c.week === 'even' ? '双周' : `${c.wf}–${c.wt}周`, c.loc, c.teacher]);
    await exportFile('claswee课表.csv', '\ufeff' + rows.map(row => row.map(csv).join(',')).join('\r\n')); this.setData({ fileStatus: '课表 CSV 已生成。' });
  },
  async importFile() {
    const file = await chooseFile('.json,application/json'); if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!Array.isArray(raw.courses) || !raw.settings || !raw.users) throw new Error('请选择 claswee 导出的同步文件');
      const result = await modal({ title: '导入同步文件', content: `将用文件中的 ${raw.courses.length} 门课覆盖当前课表，是否继续？` });
      if (!result.confirm) return;
      const next = validateBackup(raw); next.me = state.data.me;
      await editData(data => Object.assign(data, next)); this.setData({ fileStatus: `导入成功 ✅ 共 ${next.courses.length} 门课` });
    } catch (error) { this.setData({ fileStatus: `导入失败：${error.message}` }); }
  },
};
