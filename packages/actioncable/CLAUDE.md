# actioncable — Claude guide

Rules that bind only inside `packages/actioncable`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.
A `§ "…"` reference below names a section of the root file unless it names
one in this file.

## Node's event loop stands in for Action Cable's nio4r selector (`StreamEventLoop`, `Stream#write`)

`ActionCable::Connection::StreamEventLoop`
(`vendor/rails/v8.0.2/actioncable/lib/action_cable/connection/stream_event_loop.rb`)
owns an `NIO::Selector` and one thread running `run` (`:86-133`): it drains a
todo queue, `select`s, reads up to 4096 bytes from each readable socket with
`read_nonblock` and hands them to `stream.receive`, and calls
`stream.flush_write_buffer` for each writable one. `spawn` (`:62-80`) starts
that thread and `wakeup` (`:82-84`) interrupts the `select`. `Stream#write`
(`vendor/rails/v8.0.2/actioncable/lib/action_cable/connection/stream.rb:37-70`)
calls `write_nonblock` and keeps the unwritten tail in `@write_head` /
`@write_buffer` for the loop to flush (`:72-92`).

A Node `net.Socket` is already registered with the process's event loop. It
emits `data` when readable and buffers every `write` in full, so there is never
a partial write to carry, no selector to own, no loop thread to spawn and
nothing to wake. **Node's event loop stands in for the nio4r selector and its
thread.** The `connection/` port, when it lands, follows these rules:

- The private `spawn`, `run` and `wakeup` are not ported. They are a
  `SCOPED_SKIP_GROUPS` entry in `scripts/parity/conventions.ts` citing this
  section.
- `writes_pending` and `Stream#flush_write_buffer` are ported, because the
  hijacked io's `write_nonblock` can write part of a frame. `@map` holds a
  monitor object standing in for `NIO::Monitor`, and its `interests`
  accessor's setter is where nio4r registers writable interest with the
  selector: setting `:rw` on an `:r` monitor starts the one writable wait,
  which calls `stream.flush_write_buffer` and sets `:r` when it answers true,
  as `run` does (`stream_event_loop.rb:100-106`). So `writes_pending` is
  Rails' body, `if monitor = @map[io]; monitor.interests = :rw; end`
  (`:47-53`), with no guard of its own.
- `attach` and `detach` keep their Rails names and callers. The hijacked io
  is the ruby-compat `TCPSocket` the Rack handler hands out, a Ruby IO, so
  `attach(io, stream)` (`stream_event_loop.rb:30-36`) holds the stream in
  `@map` where Rails holds the NIO monitor and reads the io as `run` does
  (`:111-129`): it awaits `io.wait_readable` where `run` waits in `select`,
  then calls `io.read_nonblock(4096, exception: false)` and hands the result
  to `stream.receive`, or calls `stream.close` at end of file or on a raise,
  and keeps reading. The read ends when the io leaves `@map`: `detach`
  (`:38-45`) deletes the entry and calls `io.close`, and `Stream#close`
  reaches `detach`; a `stream.close` that raises deletes it as `run` does.
- `timer`, `post` and `stop` (`:19-28`, `:56-59`) port as ordinary methods over
  ruby-compat's `TimerTask` and `ThreadPoolExecutor`.
- `Stream#write` is ported line for line over the io's `write_nonblock`,
  with its `@stream_send` arm, its `write_nonblock` result arms, `@write_lock`,
  `@write_head`, `@write_buffer` and its `rescue EOFError, Errno::ECONNRESET`
  (`stream.rb:37-70`).
- `Connection::ClientSocket` drives the npm `websocket-driver` (its own story
  adds the dependency), built with
  `Driver.http` from a request-shaped object read off the Rack env where Rails
  calls `WebSocket::Driver.rack(self, …)`
  (`vendor/rails/v8.0.2/actioncable/lib/action_cable/connection/client_socket.rb:49`);
  the driver's `io` stream's `data` event calls `ClientSocket#write` (`:76`),
  where the Ruby driver calls `socket.write`.
- `Connection::WebSocket` is otherwise a plain port; its one covered call is
  `::WebSocket::Driver.websocket?(env)`
  (`vendor/rails/v8.0.2/actioncable/lib/action_cable/connection/web_socket.rb:14`),
  which is `Driver.isWebSocket` on the same request-shaped object.

The files this section will cover, none ported yet, so a grep finds every
citation once they are:
`packages/actioncable/src/connection/stream-event-loop.ts`,
`connection/stream.ts`, `connection/client-socket.ts`, and
`connection/web-socket.ts` for that one call.

It does **not** cover `Server::Worker`, which is to port line for line over
ruby-compat's `ThreadPoolExecutor`, and it is not a receipt for dropping a
`synchronize` anywhere else: § "The pool monitor guards only sections that span
an `await`" still decides those.

This is a genuine runtime difference, ratified repo-wide here. A socket story
cites this section; it is not a new decision to argue.
