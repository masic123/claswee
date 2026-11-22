let pendingRoom = '';
function roomFromQuery(query = {}) {
  if (String(query.invite || '') !== '1') return '';
  const room = String(query.room || '').trim();
  // Query values supplied by WeChat are already decoded; do not decode twice.
  return room.length >= 1 && room.length <= 64 && !/[\\/\0\r\n]/.test(room) ? room : '';
}
function capture(options = {}) {
  if (String(options.path || '').replace(/^\//, '') !== 'pages/sync/index') return;
  const room = roomFromQuery(options.query);
  if (room) pendingRoom = room;
}
function consume() { const room = pendingRoom; pendingRoom = ''; return room; }
module.exports = { roomFromQuery, capture, consume };
