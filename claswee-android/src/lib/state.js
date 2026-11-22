import { reactive } from 'vue';
import { storage, secureStorage, http } from './platform';
import { clone, defaults, emptyData, normalize, uuid, mergeSchedules, validateCourse } from './timetable';
import { makeConnection, sameConnection, afterFailure } from './connection';

const API = 'https://masic-blog-d6g6d4r87bc035c0e-1324333320.ap-shanghai.app.tcloudbase.com/schedule-room';
export const state = reactive({ loaded: false, fatal: '', data: emptyData(), base: null, dirty: false, revision: 0, consent: 'unknown', skin: 'blush', connection: { room: '', token: '', clientId: '' }, syncing: false, lastSync: 0, syncError: '', messages: [], receipts: [], collected: [], drafts: {}, foreground: true });
let writeQueue = Promise.resolve(), syncPromise, timer, pushTimer, receiptQueue = Promise.resolve();
function checkpoint() {
  const value = clone({ data: state.data, base: state.base, dirty: state.dirty, revision: state.revision, lastSync: state.lastSync });
  const write = writeQueue.catch(() => {}).then(() => storage.set('schedule.v1', value));
  writeQueue = write;
  return write;
}
async function persistConnection(value) { await secureStorage.set(clone(value)); state.connection = value; }
export function networkAllowed() { return state.consent === 'accepted'; }
export async function init() {
  try {
    const [record, connection, consent, skin, notes] = await Promise.all([storage.get('schedule.v1'), secureStorage.get(), storage.get('consent', 'unknown'), storage.get('skin', 'blush'), storage.get('notes.v1', { receipts: [], collected: [], drafts: {} })]);
    state.connection = makeConnection(connection, () => uuid('android'));
    if (!connection) await secureStorage.set(clone(state.connection));
    if (record) { state.data = normalize(record.data); state.base = record.base; state.dirty = !!record.dirty; state.revision = record.revision || 0; state.lastSync = record.lastSync || 0; }
    else { state.data = defaults(); await checkpoint(); }
    state.consent = consent;
    state.skin = ['blush', 'mint', 'sun', 'night'].includes(skin) ? skin : 'blush';
    Object.assign(state, notes);
  } catch (error) { state.fatal = error.message; }
  state.loaded = true;
  if (!state.fatal) startSync();
}
export async function setConsent(value) { await storage.set('consent', value); state.consent = value; if (networkAllowed()) startSync(); else stopSync(); }
export async function setSkin(skin) { await storage.set('skin', skin); state.skin = skin; }
export async function editData(edit) {
  const next = clone(state.data); edit(next);
  next.updatedAt = Math.max(Date.now(), state.data.updatedAt + 1);
  state.data = normalize(next); state.dirty = true; state.revision++;
  try { await checkpoint(); } catch { throw new Error('本机存储失败，请先导出备份；本次修改尚未写入磁盘'); }
  queuePush();
}
export async function saveCourse(course) {
  const valid = validateCourse(course, state.data);
  await editData(data => { const i = data.courses.findIndex(item => item.id === valid.id); if (i < 0) data.courses.push({ ...valid, id: uuid('course') }); else data.courses[i] = valid; });
}
export async function deleteCourse(id) {
  await editData(data => { data.courses = data.courses.filter(item => item.id !== id); data.deletedCourses = [...data.deletedCourses.filter(item => item.id !== id), { id, at: Date.now() }].slice(-100); });
}
export async function useSample() {
  if (state.connection.room) throw new Error('请先退出房间，再加载示例课表');
  await editData(data => Object.assign(data, defaults()));
}
async function call(action, payload = {}, expected = clone(state.connection)) {
  if (!networkAllowed()) throw new Error('请先同意隐私说明，才能使用云同步');
  try { return await http(API, { action, clientId: expected.clientId, ...payload }, 20000, { 'X-Client-Id': expected.clientId, ...(expected.token ? { Authorization: `Bearer ${expected.token}` } : {}) }); }
  catch (error) {
    if (error.code === 'UNAUTHORIZED' && sameConnection(expected, state.connection)) await persistConnection(afterFailure(clone(state.connection), error));
    throw error;
  }
}
export async function connectRoom(action, room, password) {
  if (state.syncing) throw new Error('正在同步，请稍后再试');
  if (state.connection.room && !state.connection.needsAuth) throw new Error('请先退出当前房间');
  if (!room.trim() || password.length < 6 || password.length > 72) throw new Error('请输入房间码和 6–72 位密码');
  const recovering = state.connection.needsAuth && state.connection.room === room.trim();
  const result = await call(action, { room: room.trim(), password, ...(action === 'create' ? { data: clone(state.data) } : {}) });
  const next = { ...clone(state.connection), room: result.room, token: result.token, needsAuth: false };
  await persistConnection(next);
  const me = state.data.me;
  const pending = recovering && state.dirty;
  state.data = pending ? mergeSchedules(result.data, state.data, state.base) : normalize(clone(result.data)); state.data.me = me;
  state.base = normalize(clone(result.data)); state.base.me = me; state.dirty = pending; state.revision++; state.lastSync = Date.now(); state.syncError = ''; state.messages = [];
  await checkpoint();
  await refreshMessages().catch(() => {});
  startSync();
}
export async function leaveRoom() {
  if (syncPromise) await syncPromise.catch(() => {});
  const current = clone(state.connection);
  if (current.token && networkAllowed()) await call('leave', { room: current.room, token: current.token }, current).catch(() => {});
  await persistConnection({ ...current, room: '', token: '', needsAuth: false });
  state.messages = []; state.syncError = ''; state.base = null; state.lastSync = 0;
  await checkpoint();
}
export async function changePassword(oldPassword, newPassword, room = state.connection.room) {
  if (!room.trim()) throw new Error('请填写正确的房间码');
  if (newPassword.length < 6 || newPassword.length > 72) throw new Error('新密码需为 6–72 位');
  await call('changePassword', { room: room.trim(), oldPassword, newPassword });
}
export function queuePush() { clearTimeout(pushTimer); pushTimer = setTimeout(() => sync().catch(() => {}), 750); }
export function sync() {
  if (syncPromise) return syncPromise;
  if (!networkAllowed() || !state.foreground || !state.connection.room || state.connection.needsAuth) return Promise.resolve();
  syncPromise = (async () => {
    state.syncing = true;
    const expected = clone(state.connection);
    try {
      await writeQueue;
      const result = await call('pull', { room: expected.room, token: expected.token }, expected);
      if (!sameConnection(expected, state.connection)) return;
      if (state.dirty) {
        const merged = mergeSchedules(result.data, state.data, state.base);
        state.data = merged; state.base = clone(result.data); state.base.me = state.data.me;
        const revision = state.revision;
        await checkpoint();
        await call('push', { room: expected.room, token: expected.token, data: clone(merged) }, expected);
        if (!sameConnection(expected, state.connection)) return;
        state.base = clone(merged);
        if (revision === state.revision) state.dirty = false;
      } else {
        const me = state.data.me;
        state.data = normalize(clone(result.data)); state.data.me = me; state.base = clone(state.data);
      }
      state.lastSync = Date.now(); state.syncError = '';
      await checkpoint();
      await refreshMessages();
    } catch (error) { state.syncError = error.message; throw error; }
    finally { state.syncing = false; syncPromise = null; }
  })();
  return syncPromise;
}
export function startSync() { stopSync(); if (!state.fatal && networkAllowed()) { sync().catch(() => {}); timer = setInterval(() => sync().catch(() => {}), 15000); } }
export function stopSync() { clearInterval(timer); clearTimeout(pushTimer); }
export function setForeground(value) { state.foreground = value; if (value) startSync(); else stopSync(); }

export const noteContext = () => ({ ...clone(state.connection), owner: state.data.me });
const noteSame = current => sameConnection(current, state.connection) && current.owner === state.data.me;
function saveNotes() {
  const record = clone({ receipts: state.receipts, collected: state.collected, drafts: state.drafts });
  const writing = receiptQueue.catch(() => {}).then(() => storage.set('notes.v1', record)); receiptQueue = writing; return writing;
}
export async function refreshMessages() {
  if (!state.connection.room || !networkAllowed() || state.connection.needsAuth) return;
  const ctx = noteContext();
  for (const item of state.receipts.filter(item => item.room === ctx.room && item.owner === ctx.owner)) {
    if (!noteSame(ctx)) return;
    try { await call('messageRead', { room: ctx.room, owner: ctx.owner, id: item.id }, ctx); }
    catch (error) { if (error.code !== 'MESSAGE_NOT_FOUND') continue; }
    state.receipts = state.receipts.filter(receipt => receipt.id !== item.id);
    await saveNotes();
  }
  const result = await call('messageInbox', { room: ctx.room, owner: ctx.owner }, ctx);
  if (noteSame(ctx)) state.messages = (result.messages || []).filter(item => !state.receipts.some(receipt => receipt.id === item.id)).map(item => ({ ...item, room: ctx.room, owner: ctx.owner }));
}
export async function saveDraft(text, ctx = noteContext()) {
  if (!noteSame(ctx)) throw new Error('房间或身份已切换，草稿未保存到其他房间');
  const key = `${ctx.room}:${ctx.owner}`;
  state.drafts[key] = { text, requestId: uuid('note') };
  await saveNotes();
}
export async function sendNote(text, expected) {
  if (!noteSame(expected)) throw new Error('房间或身份已切换，请重新打开小纸条');
  if (!text.trim() || text.trim().length > 300) throw new Error('小纸条需为 1–300 字');
  const key = `${expected.room}:${expected.owner}`;
  if (state.drafts[key]?.text !== text) await saveDraft(text);
  const draft = clone(state.drafts[key]);
  await call('messageSend', { room: expected.room, owner: expected.owner, text: text.trim(), requestId: draft.requestId }, expected);
  if (!noteSame(expected)) throw new Error('房间或身份已切换，请在原房间核对发送结果');
  delete state.drafts[key]; await saveNotes();
}
export async function collectNote(item) {
  const ctx = noteContext();
  if (item.room !== ctx.room || item.owner !== ctx.owner) throw new Error('房间或身份已切换，请重新打开小纸条');
  if (!state.receipts.some(row => row.id === item.id)) state.receipts.push({ room: item.room, owner: item.owner, id: item.id });
  if (!state.collected.some(row => row.id === item.id)) state.collected.unshift(clone(item));
  await saveNotes(); state.messages = state.messages.filter(row => row.id !== item.id);
  refreshMessages().catch(() => {});
}
export async function clearLocalData() {
  if (state.connection.room) throw new Error('请先退出房间，再清除本机数据');
  state.data = emptyData(); state.base = null; state.dirty = false; state.revision++; state.lastSync = 0;
  state.receipts = []; state.collected = []; state.drafts = {};
  await Promise.all([checkpoint(), saveNotes()]);
}
