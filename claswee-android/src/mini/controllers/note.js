import { state, noteContext, saveDraft, sendNote, collectNote } from '../../lib/state';
import { ui, notify, backHandlers } from '../navigation';
export default {
  data: { skin: 'blush', showNote: false, showEditor: false, draft: '', length: 0, sending: false, collecting: false, error: '', fromName: '', toName: '', sender: 'cat', note: null, remaining: 0, sentTime: '' },
  onShow() {
    this.back = () => {
      if (this.data.showEditor && !this.data.sending) { this.closeComposer(); return true; }
      if (this.data.showNote && !this.data.collecting) { this.later(); return true; }
      return false;
    };
    backHandlers.add(this.back); this.check();
  },
  onUnload() { backHandlers.delete(this.back); },
  swallow() {},
  check(force = false) {
    if (this.data.showEditor || ui.legal) return;
    const note = state.messages.find(note => note.room === state.connection.room && note.owner === state.data.me);
    if (!note || !state.connection.room || state.connection.needsAuth) return this.setData({ showNote: false, note: null });
    if (!force && this.deferredId === note.id) return;
    const date = new Date(note.created_at), fromName = state.data.users[note.sender_owner]?.name || '对方';
    this.setData({ showNote: true, note, remaining: state.messages.length, sender: note.sender_owner, fromName, skin: state.skin, error: '', sentTime: `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` });
  },
  later() { this.deferredId = this.data.note?.id; this.setData({ showNote: false }); },
  async collect() {
    if (this.data.collecting || !this.data.note) return;
    this.setData({ collecting: true, error: '' });
    try { await collectNote(this.data.note); this.check(true); }
    catch (error) { this.setData({ error: error.message || '暂时无法收下，请稍后再试' }); }
    finally { this.setData({ collecting: false }); }
  },
  openComposer() {
    const context = noteContext();
    if (!context.room || !context.token || context.needsAuth) { ui.compose = false; return notify('请先加入同一个房间'); }
    this.context = context;
    const draft = state.drafts[`${context.room}:${context.owner}`]?.text || '';
    const to = context.owner === 'cat' ? 'dog' : 'cat';
    this.setData({ showEditor: true, showNote: false, draft, length: draft.length, toName: state.data.users[to].name, sender: context.owner, skin: state.skin, error: '' });
  },
  input(event) { const draft = event.detail.value; this.setData({ draft, length: draft.length, error: '' }); },
  async closeComposer() {
    if (this.data.sending) return;
    try { await saveDraft(this.data.draft, this.context); }
    catch (error) { notify(error.message); }
    ui.compose = false; this.setData({ showEditor: false });
  },
  async send() {
    if (this.data.sending || !this.data.draft.trim()) return;
    this.setData({ sending: true, error: '' });
    try { await sendNote(this.data.draft, this.context); this.setData({ showEditor: false, draft: '', length: 0 }); ui.compose = false; notify('心意已送达'); }
    catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ sending: false }); }
  },
};
