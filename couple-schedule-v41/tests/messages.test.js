const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Service = require('../miniprogram/cloudfunctions/scheduleRoom/messages');
const { database } = require('./fixtures/rdb-mock');
const auth = { room: { room_code: 'room-a' }, session: { client_hash: 'trusted-cat-device' } };
const event = { action: 'messageSend', owner: 'cat', text: '下课一起吃饭 ♡\n我等你。', requestId: 'message_request_12345' };
test('notes route to the other owner, retain line breaks and deduplicate retries', async () => {
  const db = database();
  const first = await Service.handle(db, auth, event);
  const retry = await Service.handle(db, auth, event);
  assert.equal(retry.id, first.id); assert.equal(db.tables.claswee_room_messages.length, 1);
  assert.equal((await Service.handle(db, auth, { action: 'messageInbox', owner: 'cat' })).messages.length, 0);
  const inbox = await Service.handle(db, auth, { action: 'messageInbox', owner: 'dog' });
  assert.equal(inbox.messages[0].content, event.text);
  assert.equal(inbox.messages[0].recipient_owner, 'dog');
});
test('read receipts are idempotent and cannot cross rooms or recipients', async () => {
  const db = database(); const { id } = await Service.handle(db, auth, event);
  await assert.rejects(Service.handle(db, { ...auth, room: { room_code: 'room-b' } }, { action: 'messageRead', owner: 'dog', id }), error => error.code === 'MESSAGE_NOT_FOUND');
  await assert.rejects(Service.handle(db, auth, { action: 'messageRead', owner: 'cat', id }), error => error.code === 'MESSAGE_NOT_FOUND');
  assert.equal((await Service.handle(db, { ...auth, room: { room_code: 'room-b' } }, { action: 'messageInbox', owner: 'dog' })).messages.length, 0);
  await Service.handle(db, auth, { action: 'messageRead', owner: 'dog', id });
  await Service.handle(db, auth, { action: 'messageRead', owner: 'dog', id });
  assert.equal((await Service.handle(db, auth, { action: 'messageInbox', owner: 'dog' })).messages.length, 0);
});
test('blank or oversized notes and invalid identity cannot be saved; daily cap allows retries', async () => {
  const db = database();
  for (const text of [' \n ', '字'.repeat(301)]) await assert.rejects(Service.handle(db, auth, { ...event, text }), error => error.code === 'INVALID_MESSAGE');
  await assert.rejects(Service.handle(db, auth, { ...event, owner: 'other' }), error => error.code === 'INVALID_OWNER');
  for (let n = 0; n < 30; n++) await Service.handle(db, auth, { ...event, requestId: `message_request_${n}` });
  await assert.rejects(Service.handle(db, auth, { ...event, requestId: 'message_request_31' }), error => error.code === 'MESSAGE_LIMIT');
  assert.equal((await Service.handle(db, auth, { ...event, requestId: 'message_request_0' })).ok, true);
});
test('message HTTP actions still require the room access token before touching notes', async () => {
  const db = database(); let dispatch; const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/cloudfunctions/scheduleRoom/index'), 'utf8'), {
    require: name => name === '@cloudbase/node-sdk' ? { init: () => ({ rdb: () => db }) } : name === './messages' ? Service : require(name),
    process: { env: {} }, Buffer, console: { error() {}, warn() {} }, module, exports: module.exports
  });
  dispatch = module.exports.main;
  const result = await dispatch({ action: 'messageInbox', owner: 'dog', room: 'room-a', token: 'invalid' });
  assert.equal(result.code, 'UNAUTHORIZED'); assert.equal(db.tables.claswee_room_messages, undefined);
});
test('an offline collection stays hidden locally and is acknowledged after reconnect', async () => {
  const values = new Map(); let offline = true, reads = 0;
  const cfg = { room: 'room-a', token: 'token-a', owner: 'dog' }, note = { id: 'a'.repeat(64), sender_owner: 'cat', content: '你好', created_at: '2026-10-13T00:00:00Z' };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/messages'), 'utf8'), { module, require: id => id.endsWith('/store') ? { get: () => ({ me: cfg.owner }) } : { config: () => cfg, message: async action => { if (action === 'messageRead') { if (offline) throw new Error('offline'); reads++; } return { messages: [note] }; } }, wx: { getStorageSync: k => values.get(k), setStorageSync: (k, v) => values.set(k, v) }, Date, Promise, Math });
  const Messages = module.exports;
  const notes = await Messages.inbox(); await Messages.collect(notes[0]);
  assert.equal((await Messages.inbox()).length, 0); assert.equal(reads, 0);
  offline = false; await Messages.inbox(); assert.equal(reads, 1); assert.equal(values.get('claswee.message.receipts').length, 0);
});
test('a late inbox from a previous room does not appear after switching rooms', async () => {
  let finish; const cfg = { room: 'room-a', token: 'token-a' }, module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/messages'), 'utf8'), { module, require: id => id.endsWith('/store') ? { get: () => ({ me: 'dog' }) } : { config: () => cfg, message: () => new Promise(resolve => { finish = resolve; }) }, wx: { getStorageSync: () => [] }, Date, Promise, Math });
  const waiting = module.exports.inbox(); await new Promise(resolve => setImmediate(resolve));
  cfg.room = 'room-b'; cfg.token = 'token-b'; finish({ messages: [{ id: 'old-room-note' }] });
  assert.equal((await waiting).length, 0);
});

test('reopening a page retries the inbox after an earlier hidden-page request completes', async () => {
  let definition, finish, calls = 0;
  const Messages = { context: () => ({ room: 'room-a', token: 'token-a', owner: 'dog' }), inbox: () => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([{ id: 'new-note', room: 'room-a', owner: 'dog', sender_owner: 'cat', content: '等你下课', created_at: '2026-10-14T00:00:00Z' }]) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/components/message-note/index'), 'utf8'), { Component: value => { definition = value; }, require: id => id.endsWith('/messages') ? Messages : id.endsWith('/store') ? { get: () => ({ users: { cat: { name: '小猫' } } }) } : { get: () => 'blush' }, Date });
  const component = { ...definition.methods, data: { ...definition.data }, active: true, generation: 0, setData(values) { Object.assign(this.data, values); } };
  const first = component.check(); definition.pageLifetimes.hide.call(component); definition.pageLifetimes.show.call(component);
  finish([]); await first; await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); assert.equal(component.data.showNote, true); assert.equal(component.data.note.id, 'new-note');
});
