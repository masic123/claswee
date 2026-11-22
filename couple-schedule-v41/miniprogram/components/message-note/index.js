const Messages = require('../../utils/messages');
const Store = require('../../utils/store');
const Skin = require('../../utils/skin');
function time(value) {
  const date = new Date(new Date(value).getTime() + 8 * 3600000);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}
Component({
  properties: { compose: { type: Boolean, value: false, observer(value) { if (value) this.openComposer(); } } },
  data: { skin: 'blush', showNote: false, showEditor: false, draft: '', length: 0, sending: false, collecting: false, error: '', fromName: '', toName: '', sender: 'cat', note: null, remaining: 0, sentTime: '' },
  lifetimes: {
    attached() { this.active = true; this.setData({ skin: Skin.get() }); this.check(); },
    detached() { this.active = false; this.generation = (this.generation || 0) + 1; }
  },
  pageLifetimes: {
    show() { this.active = true; this.setData({ skin: Skin.get() }); this.check(); },
    hide() { this.active = false; this.generation = (this.generation || 0) + 1; this.setData({ showNote: false }); }
  },
  methods: {
    swallow() {},
    async check() {
      if (!this.active || this.data.showEditor || this.checking) return;
      this.checking = true; const generation = this.generation || 0;
      try { const notes = await Messages.inbox(); if (this.active && generation === (this.generation || 0) && !this.data.showEditor) { this.notes = notes; this.nextNote(); } }
      catch (_) { /* 下次打开页面再检查，不打断课表使用。 */ }
      finally { this.checking = false; if (this.active && generation !== (this.generation || 0) && !this.data.showEditor) this.check(); }
    },
    nextNote() {
      const note = (this.notes || [])[0], current = Messages.context();
      if (!note || note.room !== current.room || note.owner !== current.owner || !current.token) return this.setData({ showNote: false, note: null });
      const user = Store.get().users[note.sender_owner];
      this.setData({ showNote: true, note, remaining: this.notes.length, sender: note.sender_owner, fromName: user.name, sentTime: time(note.created_at), collecting: false, error: '' });
    },
    async collect() {
      if (!this.data.note || this.data.collecting) return;
      this.setData({ collecting: true });
      try { await Messages.collect(this.data.note); this.notes = (this.notes || []).slice(1); if (this.active) this.nextNote(); }
      catch (_) { this.setData({ collecting: false, error: '暂时无法收下，请稍后再试' }); }
    },
    later() { this.setData({ showNote: false }); },
    openComposer() {
      const ctx = Messages.context();
      if (!ctx.room || !ctx.token) { wx.showToast({ title: '请先加入同一个房间', icon: 'none' }); return this.triggerEvent('close'); }
      this.composeContext = ctx; this.sendId = Messages.requestId();
      const users = Store.get().users, to = ctx.owner === 'cat' ? 'dog' : 'cat';
      this.setData({ showEditor: true, showNote: false, skin: Skin.get(), toName: users[to].name, sender: ctx.owner, error: '', sending: false });
    },
    input(event) { const draft = event.detail.value; this.setData({ draft, length: draft.length, error: '' }); },
    closeComposer() { if (this.data.sending) return; this.setData({ showEditor: false, error: '' }); this.triggerEvent('close'); },
    async send() {
      const text = this.data.draft.trim(); if (!text || this.data.sending) return;
      this.setData({ sending: true, error: '' });
      try {
        await Messages.send(text, this.sendId, this.composeContext);
        this.setData({ sending: false, showEditor: false, draft: '', length: 0 });
        this.triggerEvent('close'); wx.showToast({ title: '心意已送达', icon: 'success' });
      } catch (error) { this.setData({ sending: false, error: error.message || '发送失败，请重试' }); }
    }
  }
});
