const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const { database } = require('./fixtures/rdb-mock');
const hash = (value, salt) => crypto.scryptSync(value, salt, 64).toString('hex');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const request = { action: 'changePassword', room: 'room-a', oldPassword: 'old-password', newPassword: 'new-password', clientId: 'device-a' };

function service() {
  const data = Store.defaults(), salt = 'test-password-salt';
  const room = { room_code: 'room-a', password_salt: salt, password_hash: hash(request.oldPassword, salt), schedule_data: data, data_updated_at: data.updatedAt, member_count: 1 };
  const session = { token_hash: sha('existing-token'), room_code: 'room-a', client_hash: 'existing-device', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 365 * 86400000).toISOString() };
  const db = database({ claswee_rooms: [room], claswee_room_sessions: [session], claswee_room_members: [{ room_code: 'room-a', client_hash: 'existing-device' }] });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/cloudfunctions/scheduleRoom/index'), 'utf8'), {
    require: name => name === '@cloudbase/node-sdk' ? { init: () => ({ rdb: () => db, downloadFile: async () => { throw new Error('not found'); } }) } : name === './messages' ? {} : require(name),
    process: { env: {} }, Buffer, console: { error() {}, warn() {} }, module, exports: module.exports
  });
  return { db, call: module.exports.main, data, room };
}

test('knowing the old password is sufficient; new joins require the new password and connected devices keep syncing', async () => {
  const s = service(), before = structuredClone(s.db.tables.claswee_rooms[0]);
  const result = await s.call(request);
  assert.equal(result.ok, true); assert.equal(result.room, 'room-a');
  const room = s.db.tables.claswee_rooms[0];
  assert.notEqual(room.password_salt, before.password_salt);
  assert.equal(room.password_hash, hash(request.newPassword, room.password_salt));
  for (const key of Object.keys(before).filter(key => !key.startsWith('password_'))) assert.deepEqual(room[key], before[key]);
  assert.equal(s.db.tables.claswee_room_sessions.length, 1);
  assert.equal((await s.call({ action: 'pull', room: 'room-a', token: 'existing-token' })).ok, true);
  assert.equal((await s.call({ action: 'join', room: 'room-a', password: request.oldPassword, clientId: 'new-device' })).code, 'INVALID_PASSWORD');
  assert.equal((await s.call({ action: 'join', room: 'room-a', password: request.newPassword, clientId: 'new-device' })).ok, true);
  for (const secret of [request.oldPassword, request.newPassword, room.password_hash, room.password_salt]) assert.equal(JSON.stringify(result).includes(secret), false);
});

test('a valid session cannot replace old-password verification; five wrong attempts lock both changing and joining', async () => {
  const s = service(), originalHash = s.db.tables.claswee_rooms[0].password_hash;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await s.call({ ...request, oldPassword: 'wrong-password', token: 'existing-token' });
    assert.equal(result.code, attempt === 5 ? 'ROOM_LOCKED' : 'INVALID_PASSWORD');
  }
  assert.equal((await s.call(request)).code, 'ROOM_LOCKED');
  assert.equal((await s.call({ action: 'join', room: 'room-a', password: request.oldPassword, clientId: 'device-a' })).code, 'ROOM_LOCKED');
  assert.equal(s.db.tables.claswee_rooms[0].password_hash, originalHash);
  assert.equal((await s.call({ ...request, clientId: 'other-device' })).ok, true);
});

test('missing rooms, weak or unchanged passwords and malformed input never modify room data', async () => {
  const s = service(), before = structuredClone(s.db.tables.claswee_rooms);
  for (const newPassword of ['', 'short', 'x'.repeat(73), null, {}]) assert.equal((await s.call({ ...request, newPassword })).code, 'WEAK_PASSWORD');
  assert.equal((await s.call({ ...request, newPassword: request.oldPassword })).code, 'PASSWORD_UNCHANGED');
  assert.equal((await s.call({ ...request, oldPassword: {} })).code, 'INVALID_PASSWORD');
  assert.equal((await s.call({ ...request, room: '../room-a' })).code, 'INVALID_ROOM');
  assert.equal((await s.call({ ...request, room: 'missing-room' })).code, 'ROOM_NOT_FOUND');
  assert.deepEqual(s.db.tables.claswee_rooms, before);
});

test('two concurrent changes using the same old password cannot overwrite one another', async () => {
  const s = service();
  const results = await Promise.all([
    s.call({ ...request, clientId: 'device-1', newPassword: 'first-new-password' }),
    s.call({ ...request, clientId: 'device-2', newPassword: 'second-new-password' })
  ]);
  assert.equal(results.filter(x => x.ok).length, 1);
  assert.equal(results.filter(x => x.code === 'PASSWORD_CHANGED').length, 1);
  const winningPassword = results[0].ok ? 'first-new-password' : 'second-new-password';
  const room = s.db.tables.claswee_rooms[0];
  assert.equal(room.password_hash, hash(winningPassword, room.password_salt));
});

test('HTTP change requests verify the password without requiring a prior login', async () => {
  const s = service();
  const response = await s.call({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ ...request, room: 'ROOM-A' }) });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).room, 'room-a');
  const rejected = await s.call({ httpMethod: 'POST', headers: {}, body: JSON.stringify(request) });
  assert.equal(rejected.statusCode, 401);
  assert.equal(JSON.parse(rejected.body).code, 'INVALID_PASSWORD');
});

test('the mini-program client sends passwords only in the request and preserves its current connection', async () => {
  const values = new Map([['claswee_sync_cfg_v2', { room: 'connected-room', token: 'existing-token', clientId: 'device-a', auto: true, autoPush: true }]]);
  const calls = [], module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/sync'), 'utf8'), {
    module, wx: {
      getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, value),
      request: options => { calls.push(options.data); options.success({ statusCode: 200, data: { ok: true, room: 'other-room', passwordChanged: true } }); }
    }, setTimeout, clearTimeout, Date, Promise
  });
  await module.exports.changePassword(' other-room ', request.oldPassword, request.newPassword);
  assert.equal(calls[0].action, 'changePassword'); assert.equal(calls[0].room, 'other-room');
  assert.equal(calls[0].oldPassword, request.oldPassword); assert.equal(calls[0].newPassword, request.newPassword);
  assert.equal(values.get('claswee_sync_cfg_v2').room, 'connected-room');
  assert.equal(values.get('claswee_sync_cfg_v2').token, 'existing-token');
  assert.equal(JSON.stringify(Array.from(values)).includes('password'), false);
});

function miniPage(connected = false, failure = false) {
  let page, calls = 0;
  const cfg = connected ? { room: 'room-a', token: 'existing-token' } : { room: '', token: '' };
  const moduleSync = { config: () => cfg, changePassword: async () => { calls++; if (failure) throw new Error('旧密码错误'); return { ok: true, room: 'room-a' }; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/sync/index'), 'utf8'), {
    require: name => name.endsWith('/sync') ? moduleSync : {}, Page: value => { page = value; }, wx: { showToast() {} }
  });
  page.data = structuredClone(page.data); page.setData = values => Object.assign(page.data, values);
  Object.assign(page.data, { connected, room: 'room-a', oldPassword: request.oldPassword, newPassword: request.newPassword, newPasswordConfirm: request.newPassword, passwordEditor: true });
  return { page, get calls() { return calls; } };
}

test('the mini-program change form supports disconnected users and clears password fields after success or failure', async () => {
  for (const connected of [false, true]) for (const failure of [false, true]) {
    const s = miniPage(connected, failure); await s.page.changePassword();
    assert.equal(s.calls, 1); assert.equal(s.page.data.busy, false);
    for (const field of ['oldPassword', 'newPassword', 'newPasswordConfirm']) assert.equal(s.page.data[field], '');
    assert.match(s.page.data.status, failure ? /旧密码错误/ : /密码已修改/);
    assert.equal(s.page.data.connected, connected);
  }
});

test('confirmation mismatch, repeat submission and cancel never issue a change request', async () => {
  const s = miniPage(); s.page.data.newPasswordConfirm = 'different-password';
  await s.page.changePassword(); assert.equal(s.calls, 0);
  s.page.data.newPasswordConfirm = request.newPassword; s.page.data.busy = true;
  await s.page.changePassword(); assert.equal(s.calls, 0);
  s.page.data.busy = false; s.page.togglePasswordEditor();
  assert.equal(s.page.data.passwordEditor, false); assert.equal(s.page.data.oldPassword, '');
  assert.equal(s.calls, 0);
});
