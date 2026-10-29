# @blazetrails/actioncable

The server half of Action Cable, ported from the `actioncable` gem: every file
under `actioncable/lib` has a counterpart under `src/` at the Rails path.

- `channel/`: `Channel::Base` with its callbacks, naming, broadcasting,
  periodic timers and streams, and `Channel::TestCase`.
- `connection/`: `Connection::Base`, identification, authorization, callbacks,
  the internal channel, subscriptions, the message buffer, the tagged logger
  proxy, `Connection::TestCase`, and the socket layer (`Stream`,
  `StreamEventLoop`, `ClientSocket`, `WebSocket`). Node's event loop stands in
  for the nio4r selector (root `CLAUDE.md`, "Node's event loop stands in for
  Action Cable's nio4r selector").
- `server/`: `Server::Base`, broadcasting, configuration, connections and the
  worker.
- `subscription-adapter/`: the async, inline, test, PostgreSQL and Redis
  adapters over `Base`, `SubscriberMap` and `ChannelPrefix`.
- `RemoteConnections`, `Helpers::ActionCableHelper`, `TestHelper` and
  `TestCase`.

The engine (`config.action_cable`, the `/cable` mount) and the channel
generator live in `@blazetrails/trailties`.

## Browser client

Rails' JavaScript client (`actioncable/app/javascript/action_cable/*.js`, its
compiled bundles and its JS test suite) is not ported: it is already
JavaScript. An application installs the published package directly:

```sh
npm install @rails/actioncable@~8.0.200
```

Use the release matching the vendored Rails version (Rails 8.0.2 publishes as
`8.0.200`). This package depends on it only for development, pinned to that
release in `package.json`, for the interop test in
`src/published-client.trails.test.ts`. When `vendor/rails` is bumped, move that
pin with it.
