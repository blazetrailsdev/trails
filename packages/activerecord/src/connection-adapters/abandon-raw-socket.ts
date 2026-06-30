/**
 * Neutralizes a driver's raw connection during `discard!` WITHOUT closing
 * the underlying socket.
 *
 * Rails' `discard!` deliberately abandons the file descriptor instead of
 * closing it — PostgreSQL does `@raw_connection&.socket_io&.reopen(IO::NULL)`
 * (postgresql_adapter.rb) and mysql2 sets `@raw_connection.automatic_close =
 * false` (mysql2_adapter.rb). Both leave the live server socket untouched so a
 * forked child tearing down its inherited copy can't disturb the parent's
 * connection. Calling `client.end()` / `destroy()` would actively close it,
 * violating that contract.
 *
 * The node analog: locate the driver's underlying socket (which keeps the
 * event loop alive and re-emits errors on the abandoned handle), strip its
 * listeners, and `unref()` it so the abandoned fd no longer holds the process
 * open — mirroring the redirect-to-/dev/null effect — but never close it.
 *
 * Driver shapes differ: node-postgres exposes the socket at
 * `client.connection.stream`; node-mysql2 at `connection.stream`. We probe both
 * defensively and no-op on anything that doesn't look like a socket.
 *
 * @internal
 */
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
  } catch {
    // Best-effort: a partially torn-down socket may throw. Abandoning it
    // (the reference is already dropped by the caller) is still correct.
  }
}
