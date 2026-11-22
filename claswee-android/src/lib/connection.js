// Pure connection policy: transient failures never remove the user's room or device ID.
export function makeConnection(previous, id) {
  if (previous && (typeof previous.clientId !== 'string' || previous.clientId.length < 12)) throw new Error('本机连接记录不完整，请联系开发者；为保护房间身份，未自动重置');
  return previous || { room: '', token: '', clientId: id(), needsAuth: false };
}
export function sameConnection(left, right) { return left.room === right.room && left.token === right.token && left.clientId === right.clientId; }
export function afterFailure(connection, error) { return error.code === 'UNAUTHORIZED' ? { ...connection, needsAuth: true } : { ...connection }; }
