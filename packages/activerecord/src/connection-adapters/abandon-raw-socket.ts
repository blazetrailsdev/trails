/** @internal */
interface RawSocketLike {
  removeAllListeners?: () => unknown;
  unref?: () => unknown;
}

interface RawConnectionLike {
  stream?: RawSocketLike;
  connection?: { stream?: RawSocketLike };
}

export function abandonRawSocket(rawConnection: unknown): void {
  if (rawConnection === null || rawConnection === undefined) return;
  const candidate = rawConnection as RawConnectionLike;
  const socket = candidate.stream ?? candidate.connection?.stream;
  if (!socket) return;
  try {
    socket.removeAllListeners?.();
    socket.unref?.();
  } catch {}
}
