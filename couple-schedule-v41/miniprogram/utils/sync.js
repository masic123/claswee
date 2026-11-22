const CFG = 'claswee_sync_cfg_v2';
const LEGACY_CFG = 'claswe_sync_cfg_v1';
const SYNC_URL = 'https://masic-blog-d6g6d4r87bc035c0e-1324333320.ap-shanghai.app.tcloudbase.com/schedule-room';
let pushTimer = null;

// Keep the device credential in memory and in a private file as well as wx storage.
// A missing/temporarily unreadable storage entry must not generate a new device identity.
let rememberedConfig = null;
let mirroredIdentity = '';
function objectConfig(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { return null; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function completeConfig(value) {
  return value && typeof value.room === 'string' && typeof value.token === 'string' && typeof value.clientId === 'string' && !!value.clientId;
}
function readStorage(key) { try { return objectConfig(wx.getStorageSync(key)); } catch (_) { return null; } }
function backupPath() { return wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH + '/claswee-room-connection-v2.json' : ''; }
function readBackup() {
  try { const file = backupPath(); return file ? objectConfig(wx.getFileSystemManager().readFileSync(file, 'utf8')) : null; } catch (_) { return null; }
}
function identity(value) { return JSON.stringify([value.room, value.token, value.clientId]); }
function persistConfig(value) {
  let saved = false;
  try { wx.setStorageSync(CFG, value); saved = true; } catch (_) { /* Try the private-file backup below. */ }
  const signature = identity(value);
  try {
    const file = backupPath();
    if (file && signature !== mirroredIdentity) {
      const files = wx.getFileSystemManager();
      files.writeFileSync(file + '.tmp', JSON.stringify(value), 'utf8');
      files.renameSync(file + '.tmp', file);
      mirroredIdentity = signature;
      saved = true;
    }
  } catch (_) { /* wx storage remains usable if the file system is temporarily unavailable. */ }
  if (signature === mirroredIdentity) saved = true;
  if (!saved) throw new Error('无法保存房间连接，请检查微信存储空间后重试');
  rememberedConfig = Object.assign({}, value);
  return Object.assign({}, value);
}
function config() {
  const current = readStorage(CFG);
  const backup = rememberedConfig ? null : readBackup();
  const candidates = [current, rememberedConfig, backup].filter(completeConfig);
  candidates.sort((a, b) => (Number(b.connectionRevision) || 0) - (Number(a.connectionRevision) || 0));
  const source = candidates[0] || readStorage(LEGACY_CFG) || current || {};
  const value = Object.assign({ room: '', token: '', auto: true, autoPush: true, lastSync: 0, clientId: '' }, source);
  value.auto = true; value.autoPush = true;
  if (!value.clientId) value.clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  // Persist only when restoring/migrating or when the identity needs a backup.
  if (!completeConfig(current) || identity(current) !== identity(value) || current.auto !== true || current.autoPush !== true || identity(value) !== mirroredIdentity) {
    try { return persistConfig(value); } catch (error) { if (!completeConfig(source)) throw error; }
  }
  rememberedConfig = Object.assign({}, value);
  return value;
}
function setConfig(next) {
  const previous = config(), value = Object.assign({}, previous, next);
  if (identity(previous) !== identity(value)) value.connectionRevision = Math.max(Date.now(), (Number(previous.connectionRevision) || 0) + 1);
  return persistConfig(value);
}
function sameConnection(before) {
  const current = config(); return current.room === before.room && current.token === before.token;
}
function ready() { const cfg = config(); return !!(cfg.room && cfg.token); }
function errorMessage(code, fallback) {
  return ({ ROOM_EXISTS: '这个房间码已被使用，请换一个', ROOM_NOT_FOUND: '房间不存在，请先创建', LEGACY_ROOM_UNCLAIMED: '这是旧房间，需要先设置密码', ROOM_ALREADY_CLAIMED: '旧房间已被认领，请使用已设置的密码加入', INVALID_PASSWORD: '房间密码错误', ROOM_LOCKED: '密码错误次数过多，请15分钟后再试', INVALID_ROOM: '房间码格式不正确', WEAK_PASSWORD: '密码需为6–72位', UNAUTHORIZED: '房间凭证已失效，请重新输入密码', STALE_WRITE: '云端已有更新，请先拉取', DATA_TOO_LARGE: '课表数据过大，请缩小头像图片后再试' })[code] || fallback || '同步服务暂时不可用';
}
function call(action, data = {}) {
  return new Promise((resolve, reject) => {
    const cfg = config();
    const headers = { 'Content-Type': 'application/json', 'X-Client-Id': cfg.clientId };
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
    wx.request({
      url: SYNC_URL,
      method: 'POST',
      timeout: 15000,
      header: headers,
      data: Object.assign({ action, clientId: cfg.clientId }, data),
      success(res) {
        let result = res.data || {};
        if (typeof result === 'string') {
          try { result = JSON.parse(result); } catch (_) { result = {}; }
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && result.ok) return resolve(result);
        if (result.code === 'UNAUTHORIZED' && sameConnection(cfg)) setConfig({ token: '' });
        const err = new Error(errorMessage(result.code, result.message || `同步服务返回 HTTP ${res.statusCode}`));
        err.code = result.code;
        err.status = res.statusCode;
        reject(err);
      },
      fail(err) {
        const message = String((err && err.errMsg) || '');
        if (/domain list|合法域名|url not in domain/i.test(message)) {
          return reject(new Error('同步域名未加入小程序 request 合法域名，请联系管理员更新小程序配置'));
        }
        if (/timeout/i.test(message)) return reject(new Error('同步请求超时，请检查网络后重试'));
        reject(new Error(message || '同步服务连接失败，请检查网络后重试'));
      }
    });
  });
}
function createRoom(room, password, data) {
  return call('create', { room: room.trim(), password, data }).then(result => {
    setConfig({ room: result.room, token: result.token, lastSync: Date.now() });
    return result;
  });
}
function joinRoom(room, password) {
  return call('join', { room: room.trim(), password }).then(result => {
    setConfig({ room: result.room, token: result.token, lastSync: Date.now() });
    return result;
  });
}
function claimLegacy(room, password) {
  return call('claimLegacy', { room: room.trim(), password }).then(result => {
    setConfig({ room: result.room, token: result.token, lastSync: Date.now() });
    return result;
  });
}
function push(data) {
  const cfg = config();
  if (!ready()) return Promise.reject(new Error('请先创建或加入房间'));
  return call('push', { room: cfg.room, token: cfg.token, data }).then(result => { if (!sameConnection(cfg)) throw Object.assign(new Error('房间连接已切换，请重试'), { code: 'CONNECTION_CHANGED' }); setConfig({ lastSync: Date.now() }); return result; });
}
function changePassword(room, oldPassword, newPassword) {
  return call('changePassword', { room: room.trim(), oldPassword, newPassword });
}
function pull() {
  const cfg = config();
  if (!ready()) return Promise.reject(new Error('请先创建或加入房间'));
  return call('pull', { room: cfg.room, token: cfg.token }).then(result => { if (!sameConnection(cfg)) throw Object.assign(new Error('房间连接已切换，请重试'), { code: 'CONNECTION_CHANGED' }); setConfig({ lastSync: Date.now() }); return result.data; });
}
function leaveRoom() {
  clearTimeout(pushTimer); pushTimer = null;
  const cfg = config();
  const finish = () => { if (sameConnection(cfg)) setConfig({ room: '', token: '', lastSync: 0 }); };
  if (!cfg.room || !cfg.token) { finish(); return Promise.resolve(); }
  return call('leave', { room: cfg.room, token: cfg.token }).catch(() => {}).then(finish);
}
function queueAutoPush(data) {
  if (!ready()) return;
  const scheduled = config();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { const current = config(); if (current.room === scheduled.room && current.token === scheduled.token) push(data).catch(() => {}); }, 600);
}
function lastSyncText() {
  const ts = config().lastSync;
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function writeText(filename, text) {
  return new Promise((resolve, reject) => {
    const path = `${wx.env.USER_DATA_PATH}/${filename}`;
    wx.getFileSystemManager().writeFile({ filePath: path, data: text, encoding: 'utf8', success: () => resolve(path), fail: () => reject(new Error('文件生成失败')) });
  });
}
function readFile(path) { return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: path, encoding: 'utf8', success: result => resolve(result.data), fail: () => reject(new Error('读取文件失败')) })); }

function message(action, data = {}) {
  if (!['messageSend', 'messageInbox', 'messageRead'].includes(action)) return Promise.reject(new Error('不支持的留言操作'));
  const cfg = config();
  if (!cfg.room || !cfg.token) return Promise.reject(new Error('加入同一个房间后，就能给对方留个言'));
  return call(action, Object.assign({}, data, { room: cfg.room, token: cfg.token }));
}

module.exports = { config, setConfig, ready, createRoom, joinRoom, claimLegacy, changePassword, leaveRoom, push, pull, queueAutoPush, lastSyncText, writeText, readFile, errorMessage, message };
