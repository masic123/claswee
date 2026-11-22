const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');
const Messages = require('./messages');

const ENV = process.env.TCB_ENV || 'masic-blog-d6g6d4r87bc035c0e';
const LEGACY_BUCKET = process.env.TCB_BUCKET || '6d61-masic-blog-d6g6d4r87bc035c0e-1324333320';
const app = cloudbase.init({ env: process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV });
const storageApp = app;
const db = app.rdb({ database: 'public' });
if (process.env.CLASWEE_DB_KEY) db.headers.set('X-Claswee-Service-Key', process.env.CLASWEE_DB_KEY);

const MAX_DATA_BYTES = 800000;
const FAILURE_LIMIT = 5;
const LOCK_MS = 15 * 60 * 1000;
// 房间凭证用于“记住此设备”：长期有效，主动退出房间时才会撤销。
// 浏览器端仍只保存令牌哈希对应的随机令牌，不保存房间密码。
const SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Client-Id',
  'Cache-Control': 'no-store'
};

function ok(fields = {}) { return Object.assign({ ok: true }, fields); }
function fail(code, message, statusCode = 400, fields = {}) { return Object.assign({ ok: false, code, message, statusCode }, fields); }
function isHttp(event) { return !!(event && (event.httpMethod || event.requestContext || event.headers)); }
function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try { return JSON.parse(body); } catch (_) { return {}; }
}
function payloadOf(event) { return isHttp(event) ? parseBody(event.body) : (event || {}); }
function header(event, name) {
  const headers = (event && event.headers) || {};
  const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}
function tokenOf(event, payload) {
  const auth = String(header(event, 'authorization') || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : String(payload.token || '');
}
function respond(event, result) {
  const statusCode = result.statusCode || (result.ok ? 200 : 400);
  const body = Object.assign({}, result);
  delete body.statusCode;
  if (!isHttp(event)) return body;
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}
function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function normalizeNewRoom(value) { return String(value || '').trim().toLowerCase(); }
function inputRoom(value) { return String(value || '').trim(); }
function validNewRoom(room) { return /^[a-z0-9_-]{4,24}$/.test(room); }
function validLegacyRoom(room) { return room.length >= 1 && room.length <= 64 && !/[\\/\0]/.test(room); }
function validPassword(value) { return typeof value === 'string' && value.length >= 6 && value.length <= 72; }
function passwordHash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function safeHexEqual(left, right) {
  try {
    const a = Buffer.from(String(left), 'hex'), b = Buffer.from(String(right), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) { return false; }
}
function cleanData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('课表数据格式错误'), { code: 'INVALID_DATA' });
  const data = JSON.parse(JSON.stringify(value));
  delete data.password; delete data.token; delete data.room;
  const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
  if (size > MAX_DATA_BYTES) throw Object.assign(new Error('课表数据过大，请缩小头像图片后再试'), { code: 'DATA_TOO_LARGE' });
  data.updatedAt = Number(data.updatedAt) > 0 ? Number(data.updatedAt) : Date.now();
  return data;
}
function dbError(result, fallback) {
  if (!result || !result.error) return;
  const error = new Error(result.error.message || fallback || '数据库操作失败');
  error.code = result.error.code;
  throw error;
}
function isUniqueViolation(error) {
  const code = String(error && error.code || '');
  const message = String(error && error.message || '');
  return /(?:^|_)23505$/.test(code) || /duplicate key/i.test(message);
}
function first(result) {
  dbError(result);
  if (Array.isArray(result.data)) return result.data[0] || null;
  return result.data || null;
}

async function roomExact(room) {
  return first(await db.from('claswee_rooms').select('*').eq('room_code', room).limit(1));
}
async function findRoom(room) {
  let found = await roomExact(room);
  if (!found && room !== room.toLowerCase()) found = await roomExact(room.toLowerCase());
  return found;
}
function legacyFileId(room) { return `cloud://${ENV}.${LEGACY_BUCKET}/schedules/${room}.json`; }
function fileString(content) {
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  if (content && content.data) return Buffer.from(content.data).toString('utf8');
  return String(content || '');
}
async function legacyData(room) {
  try {
    const result = await storageApp.downloadFile({ fileID: legacyFileId(room) });
    if (result.code) throw new Error(result.message || result.code);
    return cleanData(JSON.parse(fileString(result.fileContent)));
  } catch (error) {
    if (!/not.?found|does not exist|404|-502005|no such/i.test(String(error && (error.message || error)))) {
      console.warn('legacy lookup failed', { room, message: error && error.message });
    }
    return null;
  }
}
function clientHash(event, payload) {
  const clientId = String(payload.clientId || header(event, 'x-client-id') || 'unknown').slice(0, 120);
  const forwarded = String(header(event, 'x-forwarded-for') || '').split(',')[0].trim();
  return sha(`${clientId}:${forwarded}`);
}
async function clearAttempt(room, client) {
  dbError(await db.from('claswee_room_attempts').delete().eq('room_code', room).eq('client_hash', client));
}
async function checkLock(room, client) {
  const attempt = first(await db.from('claswee_room_attempts').select('*').eq('room_code', room).eq('client_hash', client).limit(1));
  if (attempt && attempt.lock_until && new Date(attempt.lock_until).getTime() > Date.now()) {
    throw Object.assign(new Error('密码错误次数过多，请稍后再试'), { code: 'ROOM_LOCKED', statusCode: 429 });
  }
  return attempt;
}
async function recordFailure(room, client, previous) {
  const now = Date.now();
  const stillCurrent = previous && new Date(previous.updated_at).getTime() > now - LOCK_MS;
  const count = (stillCurrent ? Number(previous.failure_count) : 0) + 1;
  const row = { room_code: room, client_hash: client, failure_count: count, lock_until: count >= FAILURE_LIMIT ? new Date(now + LOCK_MS).toISOString() : null, updated_at: new Date(now).toISOString() };
  dbError(await db.from('claswee_room_attempts').upsert(row, { onConflict: 'room_code,client_hash' }));
  return count;
}
async function rememberMember(room, client) {
  const existing = first(await db.from('claswee_room_members').select('room_code').eq('room_code', room).eq('client_hash', client).limit(1));
  const now = new Date().toISOString();
  if (existing) dbError(await db.from('claswee_room_members').update({ last_seen_at: now }).eq('room_code', room).eq('client_hash', client));
  else {
    const inserted = await db.from('claswee_room_members').insert({ room_code: room, client_hash: client, first_seen_at: now, last_seen_at: now });
    if (inserted.error && String(inserted.error.code) !== '23505') dbError(inserted);
  }
  const counted = await db.from('claswee_room_members').select('client_hash', { count: 'exact', head: true }).eq('room_code', room);
  dbError(counted);
  dbError(await db.from('claswee_rooms').update({ member_count: Number(counted.count || 1), last_active_at: now }).eq('room_code', room));
}
async function issueSession(room, client) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  // Rejoining may race with an in-flight pull or another instance of the same client.
  // Keep valid credentials; only explicit leave revokes its own token.
  dbError(await db.from('claswee_room_sessions').delete().eq('room_code', room).lt('expires_at', new Date(now).toISOString()));
  dbError(await db.from('claswee_room_sessions').insert({ token_hash: sha(token), room_code: room, client_hash: client, created_at: new Date(now).toISOString(), expires_at: new Date(now + SESSION_MS).toISOString() }));
  await rememberMember(room, client);
  return token;
}
async function authenticatedRoom(token, expectedRoom) {
  if (!token) throw Object.assign(new Error('请重新输入房间密码'), { code: 'UNAUTHORIZED', statusCode: 401 });
  const tokenHash = sha(token);
  const session = first(await db.from('claswee_room_sessions').select('*').eq('token_hash', tokenHash).limit(1));
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session) await db.from('claswee_room_sessions').delete().eq('token_hash', tokenHash);
    throw Object.assign(new Error('房间凭证已失效，请重新输入密码'), { code: 'UNAUTHORIZED', statusCode: 401 });
  }
  if (expectedRoom && session.room_code !== expectedRoom && session.room_code !== expectedRoom.toLowerCase()) {
    throw Object.assign(new Error('房间凭证无效'), { code: 'UNAUTHORIZED', statusCode: 401 });
  }
  const room = await roomExact(session.room_code);
  if (!room) throw Object.assign(new Error('房间不存在'), { code: 'ROOM_NOT_FOUND', statusCode: 404 });
  // 只在凭证接近到期时续期，避免自动拉取造成额外数据库写入。
  if (new Date(session.expires_at).getTime() < Date.now() + SESSION_MS / 2) {
    dbError(await db.from('claswee_room_sessions').update({ expires_at: new Date(Date.now() + SESSION_MS).toISOString() }).eq('token_hash', tokenHash));
  }
  return { room, session };
}

async function createRoom(event, payload) {
  const original = inputRoom(payload.room), room = normalizeNewRoom(original);
  if (!validNewRoom(room)) return fail('INVALID_ROOM', '房间码需为 4–24 位字母、数字、横线或下划线');
  if (!validPassword(payload.password)) return fail('WEAK_PASSWORD', '密码需为 6–72 位');
  let data;
  try { data = cleanData(payload.data); } catch (error) { return fail(error.code || 'INVALID_DATA', error.message, error.code === 'DATA_TOO_LARGE' ? 413 : 400); }
  if (await roomExact(room)) return fail('ROOM_EXISTS', '这个房间码已被使用，请换一个', 409);
  if (await legacyData(original) || (original !== room && await legacyData(room))) return fail('ROOM_EXISTS', '这个房间码属于旧房间，请从“加入房间”认领', 409, { legacy: true });
  const salt = crypto.randomBytes(16).toString('hex');
  const row = { room_code: room, password_salt: salt, password_hash: passwordHash(payload.password, salt), schedule_data: data, data_updated_at: data.updatedAt, created_at: new Date().toISOString(), last_active_at: new Date().toISOString(), member_count: 0, claimed_from_legacy: false };
  const inserted = await db.from('claswee_rooms').insert(row);
  if (inserted.error) {
    if (isUniqueViolation(inserted.error)) return fail('ROOM_EXISTS', '这个房间码已被使用，请换一个', 409);
    dbError(inserted);
  }
  const client = clientHash(event, payload), token = await issueSession(room, client);
  return ok({ room, token, data, created: true });
}
async function joinRoom(event, payload) {
  const requested = inputRoom(payload.room);
  if (!validLegacyRoom(requested)) return fail('INVALID_ROOM', '房间码格式不正确');
  const room = await findRoom(requested);
  if (!room) {
    if (await legacyData(requested)) return fail('LEGACY_ROOM_UNCLAIMED', '这是旧房间，需要先设置密码', 409);
    return fail('ROOM_NOT_FOUND', '房间不存在，请先创建', 404);
  }
  const client = clientHash(event, payload);
  let attempt;
  try { attempt = await checkLock(room.room_code, client); } catch (error) { return fail(error.code, error.message, error.statusCode); }
  const candidate = passwordHash(String(payload.password || ''), room.password_salt);
  if (!safeHexEqual(candidate, room.password_hash)) {
    const count = await recordFailure(room.room_code, client, attempt);
    return count >= FAILURE_LIMIT ? fail('ROOM_LOCKED', '密码错误次数过多，请稍后再试', 429) : fail('INVALID_PASSWORD', '房间密码错误', 401);
  }
  await clearAttempt(room.room_code, client);
  const token = await issueSession(room.room_code, client);
  return ok({ room: room.room_code, token, data: room.schedule_data, created: false });
}
async function claimLegacy(event, payload) {
  const room = inputRoom(payload.room);
  if (!validLegacyRoom(room)) return fail('INVALID_ROOM', '旧房间码格式不正确');
  if (!validPassword(payload.password)) return fail('WEAK_PASSWORD', '密码需为 6–72 位');
  if (await findRoom(room)) return fail('ROOM_ALREADY_CLAIMED', '旧房间已被认领，请使用已设置的密码加入', 409);
  const data = await legacyData(room);
  if (!data) return fail('ROOM_NOT_FOUND', '没有找到这个旧房间', 404);
  const salt = crypto.randomBytes(16).toString('hex');
  const inserted = await db.from('claswee_rooms').insert({ room_code: room, password_salt: salt, password_hash: passwordHash(payload.password, salt), schedule_data: data, data_updated_at: data.updatedAt, created_at: new Date().toISOString(), last_active_at: new Date().toISOString(), member_count: 0, claimed_from_legacy: true });
  if (inserted.error) {
    if (isUniqueViolation(inserted.error)) return fail('ROOM_ALREADY_CLAIMED', '旧房间已被其他人认领，请使用其密码加入', 409);
    dbError(inserted);
  }
  const client = clientHash(event, payload), token = await issueSession(room, client);
  return ok({ room, token, data, created: false, claimed: true });
}
async function changePassword(event, payload) {
  const requested = inputRoom(payload.room);
  if (!validLegacyRoom(requested)) return fail('INVALID_ROOM', '房间码格式不正确');
  if (!validPassword(payload.newPassword)) return fail('WEAK_PASSWORD', '新密码需为 6–72 位');
  if (typeof payload.oldPassword !== 'string' || payload.oldPassword.length > 72) return fail('INVALID_PASSWORD', '旧密码错误', 401);
  const room = await findRoom(requested);
  if (!room) return fail('ROOM_NOT_FOUND', '房间不存在，请先创建', 404);
  const client = clientHash(event, payload);
  let attempt;
  try { attempt = await checkLock(room.room_code, client); } catch (error) { return fail(error.code, error.message, error.statusCode); }
  if (!safeHexEqual(passwordHash(payload.oldPassword, room.password_salt), room.password_hash)) {
    const count = await recordFailure(room.room_code, client, attempt);
    return count >= FAILURE_LIMIT ? fail('ROOM_LOCKED', '密码错误次数过多，请稍后再试', 429) : fail('INVALID_PASSWORD', '旧密码错误', 401);
  }
  if (payload.newPassword === payload.oldPassword) return fail('PASSWORD_UNCHANGED', '新密码不能与旧密码相同');
  await clearAttempt(room.room_code, client);
  const salt = crypto.randomBytes(16).toString('hex');
  // Compare-and-set prevents a concurrent request from replacing a newer password.
  // Existing device sessions remain valid; changing the password never writes timetable data.
  const updated = first(await db.from('claswee_rooms')
    .update({ password_salt: salt, password_hash: passwordHash(payload.newPassword, salt) })
    .eq('room_code', room.room_code).eq('password_hash', room.password_hash).select('room_code'));
  if (!updated) return fail('PASSWORD_CHANGED', '房间密码已更新，请使用最新密码重试', 409);
  return ok({ room: room.room_code, passwordChanged: true });
}
async function pullRoom(event, payload) {
  const auth = await authenticatedRoom(tokenOf(event, payload), inputRoom(payload.room));
  dbError(await db.from('claswee_rooms').update({ last_active_at: new Date().toISOString() }).eq('room_code', auth.room.room_code));
  return ok({ room: auth.room.room_code, data: auth.room.schedule_data });
}
async function pushRoom(event, payload) {
  const auth = await authenticatedRoom(tokenOf(event, payload), inputRoom(payload.room));
  let data;
  try { data = cleanData(payload.data); } catch (error) { return fail(error.code || 'INVALID_DATA', error.message, error.code === 'DATA_TOO_LARGE' ? 413 : 400); }
  if (Number(data.updatedAt) < Number(auth.room.data_updated_at)) return fail('STALE_WRITE', '云端已有更新，请先拉取最新课表', 409, { updatedAt: Number(auth.room.data_updated_at) });
  const updated = await db.from('claswee_rooms').update({ schedule_data: data, data_updated_at: data.updatedAt, last_active_at: new Date().toISOString() }).eq('room_code', auth.room.room_code).lte('data_updated_at', data.updatedAt);
  dbError(updated);
  return ok({ room: auth.room.room_code, updatedAt: data.updatedAt });
}
async function leaveRoom(event, payload) {
  const token = tokenOf(event, payload);
  if (!token) return ok();
  dbError(await db.from('claswee_room_sessions').delete().eq('token_hash', sha(token)));
  return ok();
}

async function dispatch(event) {
  if (isHttp(event) && String(event.httpMethod || '').toUpperCase() === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const payload = payloadOf(event);
  try {
    if (payload.action === 'create') return respond(event, await createRoom(event, payload));
    if (payload.action === 'join') return respond(event, await joinRoom(event, payload));
    if (payload.action === 'claimLegacy') return respond(event, await claimLegacy(event, payload));
    if (payload.action === 'changePassword') return respond(event, await changePassword(event, payload));
    if (payload.action === 'pull') return respond(event, await pullRoom(event, payload));
    if (payload.action === 'push') return respond(event, await pushRoom(event, payload));
    if (payload.action === 'leave') return respond(event, await leaveRoom(event, payload));
    if (['messageSend', 'messageInbox', 'messageRead'].includes(payload.action)) {
      const auth = await authenticatedRoom(tokenOf(event, payload), inputRoom(payload.room));
      return respond(event, await Messages.handle(db, auth, payload));
    }
    return respond(event, fail('INVALID_ACTION', '不支持的操作'));
  } catch (error) {
    console.error('scheduleRoom failed', { action: payload.action, code: error && error.code, message: error && error.message });
    return respond(event, fail(error.code || 'SERVER_ERROR', error.message || '服务器内部错误', error.statusCode || 500));
  }
}

exports.main = dispatch;
exports._test = { normalizeNewRoom, validNewRoom, validLegacyRoom, validPassword, passwordHash, safeHexEqual, cleanData, payloadOf, tokenOf, isUniqueViolation };
