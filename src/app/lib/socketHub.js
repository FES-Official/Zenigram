export function emitToUsers(userIds = [], eventName, payload = {}) {
  const io = globalThis.__linkexIo;
  if (!io || !eventName) return false;

  const uniqueIds = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  uniqueIds.forEach((userId) => {
    io.to(`user:${userId}`).emit(eventName, payload);
  });

  return true;
}
