const Store = require('../../utils/store');
const Share = require('../../utils/share');
const Skin = require('../../utils/skin');
const Sync = require('../../utils/sync');
const Invite = require('../../utils/invite');
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function csv(value) { return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`; }

Page({
  onShareAppMessage(event = {}) {
    if (event.from === 'button' && event.target && event.target.dataset.shareKind === 'room-invite' && Sync.ready()) return Share.roomInvite(Sync.config().room);
    return Share.appMessage();
  },
  onShareTimeline: Share.timeline,
  data: {
    skin: 'blush', mode: 'join', room: '', password: '', confirmPassword: '', connected: false,
    status: '', lastSync: '尚未同步', fileStatus: '', busy: false, invitedRoom: '', invitation: false, showMessageComposer: false,
    passwordEditor: false, oldPassword: '', newPassword: '', newPasswordConfirm: ''
  },
  onLoad(options = {}) { this.inviteRoom = Invite.roomFromQuery(options); },
  onShow() {
    Share.enable();
    Skin.apply(this, 2);
    const cfg = Sync.config();
    this.inviteRoom = Invite.consume() || this.inviteRoom || '';
    const connected = Sync.ready(), differentInvite = this.inviteRoom && this.inviteRoom.toLowerCase() !== String(cfg.room).toLowerCase();
    this.setData({ room: !connected && this.inviteRoom ? this.inviteRoom : cfg.room, mode: this.inviteRoom ? 'join' : this.data.mode, connected, invitedRoom: differentInvite && connected ? this.inviteRoom : '', invitation: !!this.inviteRoom && !connected, lastSync: Sync.lastSyncText(), password: '', confirmPassword: '' });
    this.setData({ passwordEditor: false, oldPassword: '', newPassword: '', newPasswordConfirm: '' });
  },
  onHide() { this.setData({ passwordEditor: false, oldPassword: '', newPassword: '', newPasswordConfirm: '' }); },
  onUnload() { this.destroyed = true; },
  async acceptInvite() {
    if (!this.data.invitedRoom || this.data.busy) return;
    const room = this.data.invitedRoom; this.setData({ busy: true });
    await Sync.leaveRoom();
    this.setData({ busy: false, connected: false, mode: 'join', room, invitedRoom: '', invitation: true, password: '', confirmPassword: '', status: '房间码已填好，输入对方告诉你的密码即可加入' });
  },
  openSharePoster() { wx.navigateTo({ url: '/pages/share-poster/index' }); },
  openMessage() { this.setData({ showMessageComposer: true }); },
  closeMessage() { this.setData({ showMessageComposer: false }); },
  mode(e) { if (this.data.busy) return; this.setData({ mode: e.currentTarget.dataset.mode, status: '', password: '', confirmPassword: '', passwordEditor: false, oldPassword: '', newPassword: '', newPasswordConfirm: '' }); },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  togglePasswordEditor() {
    if (this.data.busy) return;
    this.setData({ passwordEditor: !this.data.passwordEditor, oldPassword: '', newPassword: '', newPasswordConfirm: '', status: '' });
  },
  async changePassword() {
    if (this.data.busy) return;
    const cfg = Sync.config(), room = (this.data.connected ? cfg.room : this.data.room).trim();
    const { oldPassword, newPassword, newPasswordConfirm } = this.data;
    if (!room || room.length > 64) return wx.showToast({ title: '请填写正确的房间码', icon: 'none' });
    if (!oldPassword || oldPassword.length > 72) return wx.showToast({ title: '请填写旧密码', icon: 'none' });
    if (newPassword.length < 6 || newPassword.length > 72) return wx.showToast({ title: '新密码需为6–72位', icon: 'none' });
    if (newPassword !== newPasswordConfirm) return wx.showToast({ title: '两次新密码不一致', icon: 'none' });
    if (oldPassword === newPassword) return wx.showToast({ title: '新密码不能与旧密码相同', icon: 'none' });
    this.setData({ busy: true, status: '正在验证旧密码并修改…' });
    try {
      const result = await Sync.changePassword(room, oldPassword, newPassword);
      if (!this.destroyed) this.setData({ passwordEditor: false, room: this.data.connected ? Sync.config().room : result.room, password: '', confirmPassword: '', status: '密码已修改。已连接设备可继续同步，之后加入请用新密码。' });
      wx.showToast({ title: '密码已修改' });
    } catch (error) { if (!this.destroyed) this.setData({ status: error.message }); }
    finally { if (!this.destroyed) this.setData({ busy: false, oldPassword: '', newPassword: '', newPasswordConfirm: '' }); }
  },
  validate() {
    const room = this.data.room.trim(), password = this.data.password;
    if (this.data.mode === 'create' && !/^[A-Za-z0-9_-]{4,24}$/.test(room)) { wx.showToast({ title: '新房间码需为4–24位', icon: 'none' }); return false; }
    if (this.data.mode === 'join' && (!room || room.length > 64)) { wx.showToast({ title: '请填写正确的房间码', icon: 'none' }); return false; }
    if (password.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return false; }
    if (this.data.mode === 'create' && password !== this.data.confirmPassword) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return false; }
    return true;
  },
  async enterRoom() {
    if (!this.validate() || this.data.busy) return;
    this.setData({ busy: true, status: this.data.mode === 'create' ? '正在创建房间…' : '正在验证密码…' });
    try {
      const local = Store.get(), previousRoom = Sync.config().room;
      if (this.data.mode === 'create') {
        const result = await Sync.createRoom(this.data.room, this.data.password, local);
        this.setData({ room: result.room, connected: true, status: '房间创建成功，当前课表已上传 ✅', password: '', confirmPassword: '', lastSync: Sync.lastSyncText() });
      } else {
        let result;
        try { result = await Sync.joinRoom(this.data.room, this.data.password); }
        catch (error) {
          if (error.code !== 'LEGACY_ROOM_UNCLAIMED') throw error;
          const answer = await new Promise(resolve => wx.showModal({ title: '认领旧房间', content: '这是以前创建的无密码房间。确认后，当前密码将成为该房间的新密码，原课表会完整保留。', confirmText: '确认认领', success: resolve }));
          if (!answer.confirm) throw new Error('已取消认领旧房间');
          this.setData({ status: '正在认领并迁移旧房间…' });
          result = await Sync.claimLegacy(this.data.room, this.data.password);
        }
        if (String(previousRoom).toLowerCase() === String(result.room).toLowerCase()) Store.adoptRemote(result.data, local);
        else Store.save({ ...result.data, me: local.me }, { preserveUpdatedAt: true, skipAutoPush: true });
        this.setData({ room: result.room, connected: true, status: result.claimed ? '旧房间已设置密码，原课表已保留 ✅' : '密码正确，已加入并拉取课表 ✅', password: '', lastSync: Sync.lastSyncText() });
      }
      wx.showToast({ title: this.data.mode === 'create' ? '创建成功' : '加入成功' });
      this.inviteRoom = ''; this.setData({ invitedRoom: '', invitation: false });
    } catch (error) { this.setData({ status: error.message }); }
    this.setData({ busy: false });
  },
  leave() {
    if (this.data.busy) return;
    wx.showModal({ title: '退出房间', content: '会注销本机访问凭证，云端房间和本地课表仍会保留。', success: async result => { if (!result.confirm) return; await Sync.leaveRoom(); this.setData({ room: '', connected: false, status: '已退出房间', password: '', confirmPassword: '', lastSync: '尚未同步' }); } });
  },
  async push() {
    if (!Sync.ready()) return wx.showToast({ title: '请先创建或加入房间', icon: 'none' });
    this.setData({ status: '正在上传…' });
    try { await Sync.push(Store.get()); this.setData({ status: '上传成功 ✅', lastSync: Sync.lastSyncText() }); }
    catch (error) { this.setData({ status: `上传失败：${error.message}` }); if (error.code === 'UNAUTHORIZED') this.setData({ connected: false }); }
  },
  async pull() {
    if (!Sync.ready()) return wx.showToast({ title: '请先创建或加入房间', icon: 'none' });
    this.setData({ status: '正在拉取…' });
    try {
      const remote = await Sync.pull(), local = Store.get();
      if (+remote.updatedAt < +local.updatedAt) {
        const answer = await new Promise(resolve => wx.showModal({ title: '云端版本较旧', content: '云端课表比本机旧，仍要覆盖本机吗？', success: resolve }));
        if (!answer.confirm) return this.setData({ status: '已取消拉取' });
      }
      Store.adoptRemote(remote, local);
      this.setData({ status: '拉取成功 ✅', lastSync: Sync.lastSyncText() });
    } catch (error) { this.setData({ status: `拉取失败：${error.message}` }); if (error.code === 'UNAUTHORIZED') this.setData({ connected: false }); }
  },
  async exportJson() {
    try { const path = await Sync.writeText('claswee同步文件.json', JSON.stringify(Store.get(), null, 2)); this.setData({ fileStatus: '同步文件已生成，可通过系统菜单发送。' }); wx.openDocument({ filePath: path, showMenu: true, fileType: 'json', fail: () => {} }); }
    catch (error) { this.setData({ fileStatus: error.message }); }
  },
  async exportCsv() {
    try {
      const data = Store.get(), rows = [['课程名称', '谁的课', '星期', '开始节次', '结束节次', '周次', '上课地点', '老师']];
      data.courses.forEach(course => (course.slots || [{ day: course.day, s1: course.s1, s2: course.s2 }]).forEach(slot => rows.push([course.name, data.users[course.owner].name, DAY_NAMES[slot.day - 1], `第${slot.s1}节`, `第${slot.s2}节`, Store.weekText(course), course.loc, course.teacher])));
      const path = await Sync.writeText('claswee课表.csv', `\ufeff${rows.map(row => row.map(csv).join(',')).join('\r\n')}`);
      this.setData({ fileStatus: '课表 CSV 已生成，可通过系统菜单打开或发送。' });
      wx.openDocument({ filePath: path, showMenu: true, fileType: 'csv', fail: () => {} });
    } catch (error) { this.setData({ fileStatus: error.message }); }
  },
  importFile() {
    wx.chooseMessageFile({ count: 1, type: 'file', extension: ['json'], success: async result => {
      try { const content = await Sync.readFile(result.tempFiles[0].path), imported = JSON.parse(content); Store.save(imported, { preserveUpdatedAt: true }); this.setData({ fileStatus: `导入成功 ✅ 共 ${Store.get().courses.length} 门课` }); }
      catch (error) { this.setData({ fileStatus: `导入失败：${error.message}` }); }
    } });
  }
});
