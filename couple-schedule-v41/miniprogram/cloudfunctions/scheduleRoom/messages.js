const crypto = require('crypto');
function reject(code, message, statusCode = 400) { throw Object.assign(new Error(message), { code, statusCode }); }
function rows(result) { if (result.error) reject(result.error.code || 'SERVER_ERROR', '留言暂时无法保存，请稍后重试', 500); return result.data || []; }
function owner(value) { if (value !== 'cat' && value !== 'dog') reject('INVALID_OWNER', '请先在设置中选择“我是谁”'); return value; }
function cleanText(value) {
  if (typeof value !== 'string') reject('INVALID_MESSAGE', '请写下要给对方的留言');
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!text || text.length > 300) reject('INVALID_MESSAGE', '留言需为 1–300 字');
  return text;
}
async function handle(db, auth, payload, now = Date.now()) {
  const room = auth.room.room_code, me = owner(payload.owner);
  if (payload.action === 'messageSend') {
    const text = cleanText(payload.text), requestId = String(payload.requestId || '');
    if (!/^[A-Za-z0-9_-]{12,80}$/.test(requestId)) reject('INVALID_MESSAGE', '请重新打开留言编辑器');
    const id = crypto.createHash('sha256').update(`${room}:${auth.session.client_hash}:${requestId}`).digest('hex');
    const existing = rows(await db.from('claswee_room_messages').select('id').eq('room_code', room).eq('id', id).limit(1));
    if (existing.length) return { ok: true, id };
    const recent = rows(await db.from('claswee_room_messages').select('id').eq('room_code', room).eq('sender_client', auth.session.client_hash).gte('created_at', new Date(now - 86400000).toISOString()).limit(30));
    if (recent.length >= 30) reject('MESSAGE_LIMIT', '今天已经留了很多心意，明天再写吧', 429);
    const recipient = me === 'cat' ? 'dog' : 'cat';
    const result = await db.from('claswee_room_messages').insert({ id, room_code: room, sender_client: auth.session.client_hash, sender_owner: me, recipient_owner: recipient, content: text, created_at: new Date(now).toISOString(), read_at: null });
    if (result.error && String(result.error.code) !== '23505') rows(result);
    return { ok: true, id };
  }
  if (payload.action === 'messageInbox') {
    const messages = rows(await db.from('claswee_room_messages').select('id,sender_owner,content,created_at').eq('room_code', room).eq('recipient_owner', me).is('read_at', null).order('created_at', { ascending: true }).limit(20));
    return { ok: true, messages };
  }
  if (payload.action === 'messageRead') {
    const id = String(payload.id || ''); if (!/^[a-f0-9]{64}$/.test(id)) reject('INVALID_MESSAGE', '留言编号不正确');
    const found = rows(await db.from('claswee_room_messages').select('id').eq('room_code', room).eq('recipient_owner', me).eq('id', id).limit(1));
    if (!found.length) reject('MESSAGE_NOT_FOUND', '没有找到这张留言', 404);
    rows(await db.from('claswee_room_messages').update({ read_at: new Date(now).toISOString() }).eq('room_code', room).eq('recipient_owner', me).eq('id', id).is('read_at', null));
    return { ok: true };
  }
  reject('INVALID_ACTION', '不支持的留言操作');
}
module.exports = { handle, cleanText };
