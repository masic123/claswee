const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { database } = require('./fixtures/rdb-mock');
const source = file => fs.readFileSync(require.resolve(file), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const connected = { room: 'room-a', token: 'token-a', clientId: 'device-a', auto: true, autoPush: true };
const cfgKey = 'claswee_sync_cfg_v2';

function miniState() {
  const storage = new Map([[cfgKey, copy(connected)]]), files = new Map(), requests = [];
  const state = { storage, files, requests, readError: false, writeError: false, fileError: false };
  state.load = () => {
    const module = { exports: {} };
    vm.runInNewContext(source('../miniprogram/utils/sync'), {
      module, setTimeout, clearTimeout,
      wx: {
        env: { USER_DATA_PATH: '/private' },
        getStorageSync(key) { if (state.readError) throw Error('read failed'); return storage.has(key) ? copy(storage.get(key)) : ''; },
        setStorageSync(key, value) { if (state.writeError) throw Error('quota exceeded'); storage.set(key, copy(value)); },
        getFileSystemManager() { return {
          readFileSync(file) { if (state.fileError || !files.has(file)) throw Error('missing'); return files.get(file); },
          writeFileSync(file, text) { if (state.fileError) throw Error('file unavailable'); files.set(file, text); },
          renameSync(old, next) { if (state.fileError) throw Error('rename failed'); files.set(next, files.get(old)); files.delete(old); }
        }; },
        request(options) { requests.push(options); }
      }
    });
    return module.exports;
  };
  return state;
}

test('mini restores the same device and room after storage loss and process restart', () => {
  const s = miniState();
  assert.equal(s.load().config().token, connected.token);
  s.storage.delete(cfgKey);
  const restarted = s.load();
  assert.equal(restarted.ready(), true);
  assert.equal(restarted.config().clientId, connected.clientId);
  assert.equal(s.storage.get(cfgKey).token, connected.token);
});

test('mini survives transient storage reads and can persist a new connection despite storage quota failure', () => {
  const s = miniState(), client = s.load();
  client.config(); s.readError = true;
  assert.equal(client.config().token, connected.token);
  s.writeError = true;
  client.setConfig({ room: 'room-b', token: 'token-b' });
  s.readError = false;
  assert.equal(client.config().token, 'token-b');
  const restarted = s.load();
  assert.equal(restarted.config().room, 'room-b');
  assert.equal(restarted.config().token, 'token-b');
});

test('mini explicitly leaving or invalidating a credential cannot resurrect the file or legacy token', async () => {
  for (const action of ['leave', 'unauthorized']) {
    const s = miniState(), client = s.load(); client.config();
    s.storage.set('claswe_sync_cfg_v1', copy(connected));
    const request = action === 'leave' ? client.leaveRoom() : client.pull();
    s.requests[0].success(action === 'leave' ? { statusCode: 200, data: { ok: true } } : { statusCode: 401, data: { ok: false, code: 'UNAUTHORIZED' } });
    if (action === 'leave') await request; else await assert.rejects(request, { code: 'UNAUTHORIZED' });
    s.storage.delete(cfgKey);
    assert.equal(s.load().ready(), false);
  }
});

test('mini storage fallback does not hide failure when neither persistence method is available', () => {
  const s = miniState(); s.storage.clear(); s.writeError = true; s.fileError = true;
  assert.throws(() => s.load().setConfig(connected), /无法保存房间连接/);
});

test('mini stale failures and responses cannot disconnect or supply data to a newly joined room', async () => {
  for (const statusCode of [200, 401]) {
    const s = miniState(), client = s.load(), pending = client.pull();
    client.setConfig({ room: 'room-b', token: 'token-b' });
    s.requests[0].success({ statusCode, data: statusCode === 200 ? { ok: true, data: { courses: ['old-room'] } } : { code: 'UNAUTHORIZED' } });
    await assert.rejects(pending, { code: statusCode === 200 ? 'CONNECTION_CHANGED' : 'UNAUTHORIZED' });
    assert.equal(client.config().token, 'token-b');
  }
});

test('a delayed mini leave does not clear a new connection', async () => {
  const s = miniState(), client = s.load(), pending = client.leaveRoom();
  client.setConfig({ room: 'room-b', token: 'token-b' });
  s.requests[0].success({ statusCode: 200, data: { ok: true } }); await pending;
  assert.equal(client.config().token, 'token-b');
});

function webClient() {
  const storage = new Map(), requests = [], window = {};
  vm.runInNewContext(source('../js/sync'), {
    window, console, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: () => new Promise(resolve => requests.push(resolve))
  });
  window.Sync.setConfig(connected);
  return { client: window.Sync, requests };
}

test('web old unauthorized responses cannot erase a new session, but current invalid tokens are cleared', async () => {
  for (const switchRoom of [true, false]) {
    const { client, requests } = webClient(), pending = client.pull();
    if (switchRoom) client.setConfig({ room: 'room-b', token: 'token-b' });
    requests[0]({ ok: false, status: 401, json: async () => ({ ok: false, code: 'UNAUTHORIZED' }) });
    await assert.rejects(pending, { code: 'UNAUTHORIZED' });
    assert.equal(client.getConfig().token, switchRoom ? 'token-b' : '');
  }
});

test('web refuses successful old-room responses after switching and preserves new connection during delayed leave', async () => {
  for (const action of ['pull', 'leaveRoom']) {
    const { client, requests } = webClient(), pending = client[action]();
    client.setConfig({ room: 'room-b', token: 'token-b' });
    requests[0]({ ok: true, status: 200, json: async () => ({ ok: true, data: {} }) });
    if (action === 'pull') await assert.rejects(pending, { code: 'CONNECTION_CHANGED' }); else await pending;
    assert.equal(client.getConfig().token, 'token-b');
  }
});

test('server rejoining the same client or adding devices retains valid sessions; leave only revokes its own', async () => {
  const salt = 'session-test', password = 'fixture-password';
  const db = database({ claswee_rooms: [{ room_code: 'room-a', password_salt: salt, password_hash: crypto.scryptSync(password, salt, 64).toString('hex'), schedule_data: { courses: [] } }] });
  const module = { exports: {} };
  const serviceSource = process.env.CLASWEE_SESSION_SERVICE
    ? fs.readFileSync(process.env.CLASWEE_SESSION_SERVICE, 'utf8')
    : source('../miniprogram/cloudfunctions/scheduleRoom/index');
  vm.runInNewContext(serviceSource, {
    require: name => name === '@cloudbase/node-sdk' ? { init: () => ({ rdb: () => db }) } : name === './messages' ? {} : require(name),
    module, exports: module.exports, Buffer, console: { error() {} }, process: { env: {} }
  });
  const call = module.exports.main;
  const join = clientId => call({ action: 'join', room: 'room-a', password, clientId });
  const first = await join('device-a'), second = await join('device-a');
  assert.notEqual(first.token, second.token);
  for (let i = 0; i < 13; i++) assert.equal((await join('other-' + i)).ok, true);
  const pull = (token, room = 'room-a') => call({ action: 'pull', room, token });
  assert.equal((await pull(first.token)).ok, true);
  assert.equal((await pull(second.token)).ok, true);
  assert.equal((await pull(first.token, 'room-b')).code, 'UNAUTHORIZED');
  assert.equal((await pull('invented-token')).code, 'UNAUTHORIZED');
  await call({ action: 'leave', room: 'room-a', token: first.token });
  assert.equal((await pull(first.token)).code, 'UNAUTHORIZED');
  assert.equal((await pull(second.token)).ok, true);
  db.tables.claswee_room_sessions.push({ token_hash: 'expired', room_code: 'room-a', expires_at: '2020-01-01T00:00:00.000Z' });
  await join('device-c');
  assert.equal(db.tables.claswee_room_sessions.some(row => row.token_hash === 'expired'), false);
});
