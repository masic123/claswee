/* ===== Claswee 安全房间同步：密码只用于换取本机访问令牌，不落本地存储 ===== */
window.Sync = (function () {
  const DATA_KEY = 'couple_schedule_data_v1';
  const CFG_KEY = 'couple_schedule_sync_cfg_v1';
  const DEFAULT_SYNC_URL = 'https://masic-blog-d6g6d4r87bc035c0e-1324333320.ap-shanghai.app.tcloudbase.com/schedule-room';

  function loadLocal() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('读取本地数据失败', e);
      return null;
    }
  }

  function saveLocal(data, preserveUpdatedAt) {
    try {
      if (!preserveUpdatedAt) data.updatedAt = Date.now();
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('保存本地数据失败', e);
      return false;
    }
  }

  function makeClientId() {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return 'web_' + Array.from(bytes).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    }
    return 'web_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function getConfig() {
    let cfg;
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); }
    catch (_) { cfg = {}; }
    cfg.url = DEFAULT_SYNC_URL;
    cfg.room = String(cfg.room || '');
    cfg.token = String(cfg.token || '');
    if (!cfg.clientId) {
      cfg.clientId = makeClientId();
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    }
    return cfg;
  }

  function setConfig(next) {
    const value = Object.assign({}, getConfig(), next, { url: DEFAULT_SYNC_URL });
    localStorage.setItem(CFG_KEY, JSON.stringify(value));
    return value;
  }

  function sameConnection(before) {
    const current = getConfig(); return current.room === before.room && current.token === before.token;
  }

  function ready() {
    const cfg = getConfig();
    return !!(cfg.room && cfg.token);
  }

  function errorMessage(code, fallback) {
    return ({
      ROOM_EXISTS: '这个房间码已被使用，请换一个',
      ROOM_NOT_FOUND: '房间不存在，请先创建',
      LEGACY_ROOM_UNCLAIMED: '这是旧房间，需要先设置密码',
      ROOM_ALREADY_CLAIMED: '旧房间已被认领，请使用已设置的密码加入',
      INVALID_PASSWORD: '房间密码错误',
      ROOM_LOCKED: '密码错误次数过多，请 15 分钟后再试',
      INVALID_ROOM: '房间码格式不正确',
      WEAK_PASSWORD: '密码需为 6–72 位',
      UNAUTHORIZED: '房间凭证已失效，请重新输入密码',
      STALE_WRITE: '云端已有更新，请先拉取最新课表',
      DATA_TOO_LARGE: '课表数据过大，请缩小头像图片后再试',
      UPGRADE_REQUIRED: '同步服务已升级，请刷新页面后输入房间密码'
    })[code] || fallback || '同步服务暂时不可用';
  }

  function request(action, data) {
    const cfg = getConfig();
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Client-Id': cfg.clientId };
    if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
    const body = Object.assign({ action: action, clientId: cfg.clientId }, data || {});
    return new Promise(function (resolve, reject) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);
      fetch(DEFAULT_SYNC_URL, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: controller ? controller.signal : undefined })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (json) {
            if (!response.ok || !json.ok) {
              const error = new Error(errorMessage(json.code, json.message || json.error || ('HTTP ' + response.status)));
              error.code = json.code;
              error.status = response.status;
              error.legacy = !!json.legacy;
              throw error;
            }
            return json;
          });
        })
        .then(function (json) { clearTimeout(timer); resolve(json); })
        .catch(function (error) {
          clearTimeout(timer);
          if (error && error.name === 'AbortError') return reject(new Error('同步请求超时，请稍后重试'));
          if (error && error.name === 'TypeError') return reject(new Error('网络请求失败，请检查网络后重试'));
          reject(error);
        });
    });
  }

  function connectResult(result, direction) {
    setConfig({ room: result.room, token: result.token, lastSync: Date.now(), lastSyncDir: direction });
    return result;
  }
  function createRoom(room, password, data) { return request('create', { room: room.trim(), password: password, data: data }).then(function (result) { return connectResult(result, 'push'); }); }
  function joinRoom(room, password) { return request('join', { room: room.trim(), password: password }).then(function (result) { return connectResult(result, 'pull'); }); }
  function claimLegacy(room, password) { return request('claimLegacy', { room: room.trim(), password: password }).then(function (result) { return connectResult(result, 'pull'); }); }
  function changePassword(room, oldPassword, newPassword) { return request('changePassword', { room: room.trim(), oldPassword: oldPassword, newPassword: newPassword }); }
  function pull() {
    const cfg = getConfig();
    if (!ready()) return Promise.reject(new Error('请先创建或加入房间'));
    return request('pull', { room: cfg.room }).then(function (result) {
      if (!sameConnection(cfg)) throw Object.assign(new Error('房间连接已切换，请重试'), { code: 'CONNECTION_CHANGED' });
      setConfig({ lastSync: Date.now(), lastSyncDir: 'pull' });
      return result.data;
    }).catch(function (error) {
      if (error.code === 'UNAUTHORIZED' && sameConnection(cfg)) setConfig({ token: '' });
      throw error;
    });
  }
  function push(data) {
    const cfg = getConfig();
    if (!ready()) return Promise.reject(new Error('请先创建或加入房间'));
    return request('push', { room: cfg.room, data: data }).then(function (result) {
      if (!sameConnection(cfg)) throw Object.assign(new Error('房间连接已切换，请重试'), { code: 'CONNECTION_CHANGED' });
      setConfig({ lastSync: Date.now(), lastSyncDir: 'push' });
      return result;
    }).catch(function (error) {
      if (error.code === 'UNAUTHORIZED' && sameConnection(cfg)) setConfig({ token: '' });
      throw error;
    });
  }
  function leaveRoom() {
    const cfg = getConfig();
    const finish = function () { if (sameConnection(cfg)) setConfig({ room: '', token: '', lastSync: 0, lastSyncDir: '' }); };
    if (!cfg.token) { finish(); return Promise.resolve(); }
    return request('leave', { room: cfg.room }).catch(function () {}).then(finish);
  }

  function exportFile(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'claswee同步文件.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  }

  function importFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(reader.result);
          if (!data || !Array.isArray(data.courses)) throw new Error('文件格式不对');
          resolve(data);
        } catch (e) { reject(new Error('解析失败：' + e.message)); }
      };
      reader.onerror = function () { reject(new Error('读取文件失败')); };
      reader.readAsText(file);
    });
  }

  function lastSyncText() {
    const cfg = getConfig();
    if (!cfg.lastSync) return '从未';
    const d = new Date(cfg.lastSync);
    const p = function (n) { return n < 10 ? '0' + n : n; };
    return (cfg.lastSyncDir === 'push' ? '上传' : '拉取') + '于 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  return { loadLocal: loadLocal, saveLocal: saveLocal, getConfig: getConfig, setConfig: setConfig, ready: ready, createRoom: createRoom, joinRoom: joinRoom, claimLegacy: claimLegacy, changePassword: changePassword, leaveRoom: leaveRoom, pull: pull, push: push, exportFile: exportFile, importFile: importFile, lastSyncText: lastSyncText, errorMessage: errorMessage };
})();
