const Store = require('./store');
const Sync = require('./sync');
const RECEIPTS = 'claswee.message.receipts';
function context() { const cfg = Sync.config(); return { room: cfg.room, token: cfg.token, owner: Store.get().me }; }
function same(left, right = context()) { return left.room === right.room && left.token === right.token && left.owner === right.owner; }
function receipts() { try { return wx.getStorageSync(RECEIPTS) || []; } catch (_) { return []; } }
function save(value) { wx.setStorageSync(RECEIPTS, value); }
let flushing;
async function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const cfg = context(); if (!cfg.room || !cfg.token) return;
    for (const item of receipts().filter(x => x.room === cfg.room && x.owner === cfg.owner)) {
      if (!same(cfg)) return;
      try { await Sync.message('messageRead', { owner: cfg.owner, id: item.id }); }
      catch (error) { if (error.code !== 'MESSAGE_NOT_FOUND') continue; }
      save(receipts().filter(x => !(x.room === item.room && x.owner === item.owner && x.id === item.id)));
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
async function inbox() {
  const cfg = context(); if (!cfg.room || !cfg.token) return [];
  await flush(); if (!same(cfg)) return [];
  const result = await Sync.message('messageInbox', { owner: cfg.owner });
  if (!same(cfg)) return [];
  const collected = receipts().filter(x => x.room === cfg.room && x.owner === cfg.owner).map(x => x.id);
  return (result.messages || []).filter(x => !collected.includes(x.id)).map(item => ({ ...item, room: cfg.room, owner: cfg.owner }));
}
async function collect(item) {
  const cfg = context(); if (item.room !== cfg.room || item.owner !== cfg.owner) return;
  if (!receipts().some(x => x.id === item.id && x.room === item.room && x.owner === item.owner)) save([...receipts(), { id: item.id, room: item.room, owner: item.owner }]);
  await flush();
}
function requestId() { return `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`; }
async function send(text, id, expected) {
  if (!same(expected)) throw new Error('房间或身份已切换，请重新打开留言');
  const result = await Sync.message('messageSend', { owner: expected.owner, text, requestId: id });
  if (!same(expected)) throw new Error('房间或身份已切换，请在原房间确认留言');
  return result;
}
module.exports = { context, same, inbox, collect, send, requestId };
