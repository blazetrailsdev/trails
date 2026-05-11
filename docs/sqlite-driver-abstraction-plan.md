# SQLite Driver Abstraction Plan

## Background

`better-sqlite3` exposes a fully synchronous API. Wrapping it in a
`SqliteDriver` interface with return type `T | Promise<T>` lets a future async
driver (e.g. `wa-sqlite` for browser/worker contexts) slot in without touching
the adapter layer.

## PRs

### PR 1 — SqliteDriver interface + better-sqlite3 wrapper (#1238)

Added `packages/activerecord/src/connection-adapters/sqlite3/driver.ts`:

- `SqliteDriver` interface: `prepare`, `exec`, `pragma`, `close` (all
  `T | Promise<T>`), plus readonly `open: boolean` and `raw: unknown`.
- `SqliteStatement` interface: `run`, `get`, `all` (all `T | Promise<T>`),
  `columns()`, `setReadBigInts(on)` (sync setter), optional `finalize()`,
  and readonly `reader: boolean`.
- `DriverFactory` interface: `name` + `open(config)` (returns
  `Promise<SqliteDriver>`).
- `BetterSqlite3Driver` wrapper implementing `SqliteDriver` over `better-sqlite3`.

### PR 2 — Route Sqlite3Adapter through SqliteDriver (#1240)

Replaced all direct `this.db.*` call sites in `sqlite3-adapter.ts` with
`this.driver.*`. All calls remain synchronous (the `BetterSqlite3Driver`
wrapper delegates synchronously to `better-sqlite3`).

### Lint guard — `blazetrails/sqlite-driver-await`

Sprinkling `async`/`await` through 30+ call sites in PR 3 creates many
opportunities for a forgotten `await`. With the test suite still migrating to
`defineSchema` (~50% done), test coverage cannot catch every missed await
reliably.

The `blazetrails/sqlite-driver-await` ESLint rule (`eslint/sqlite-driver-await.mjs`)
flags any `driver.<method>(...)` call — where the callee object is an identifier
named `driver` (name-based, not scope-analysed; the tight file scope makes false
positives implausible) — unless the call is:

- wrapped in `await`,
- chained with `.then()`/`.catch()`/`.finally()`, or
- returned (`return driver.foo()` — caller takes responsibility for the Promise).

No `SqliteDriver` methods are unconditionally synchronous — every callable
member returns `T | Promise<T>`. Property accesses (`driver.raw`,
`driver.open`) are never `CallExpression` nodes and are therefore never
matched by the rule. (`setReadBigInts` and `finalize` live on
`SqliteStatement`, not `SqliteDriver`, and cannot appear as
`driver.<method>()` calls.)

`this.driver.<method>()` call sites are **excluded by design** — the rule
targets local `driver` variables / parameters, which are the likely pattern
for new helper functions added in and after PR 3. The adapter's own method
bodies (which use `this.driver`) are covered by the TypeScript compiler once
the return types move to `Promise<T>`.

The rule is scoped to:

```
packages/activerecord/src/connection-adapters/sqlite3/**/*.ts
packages/activerecord/src/connection-adapters/sqlite3-adapter.ts
```

### PR 3 — Async-aware adapter (#1264)

Sprinkled `async`/`await` through every `this.driver.*` call site in
`sqlite3-adapter.ts`. Removed the local sync sub-type aliases that bound
the adapter to `SyncSqliteConnection` / `SyncSqliteStatement`; the adapter
now binds to the full async-tolerant types. `BetterSqlite3Driver` methods
return raw values; the `T | Promise<T>` interface accepts them.

Two scoped exceptions kept sync (with comments):

- `disconnectBang()` — supertype is `void`-returning; can't easily go async
- `getDatabaseVersion()` — lazy-init, sync caller path

Both flagged for follow-up; both work fine for in-process-sync drivers.

### PR 4 — Consolidate transactions onto generic path (#1256)

Audit + tests confirming `Sqlite3Adapter` uses only explicit
`BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT` SQL via `driver.exec()`. No reliance
on `db.transaction(fn)` (which is better-sqlite3-specific). Adapter is
portable to async drivers (node:sqlite, wa-sqlite, expo-sqlite) by
construction.

### PR M — Move driver abstraction to activesupport (#1247)

Moved `SqliteDriver` / `SqliteStatement` / `SqliteConnection` interfaces +
registry to `packages/activesupport/src/sqlite-adapter.ts`. Driver
implementations live under `packages/activesupport/src/sqlite-drivers/`.
The activerecord adapter consumes them via `getSqlite(name)`.

Key interface additions:

- `SqliteDriverCapabilities`: `inProcessSync`, `streaming`, `loadExtension`,
  `concurrentStatements`, `foreignKeysOnByDefault`, `immediateTransactions`.
- `SyncSqliteConnection` / `SyncSqliteStatement` sub-types for inProcessSync
  drivers (better-sqlite3 + node:sqlite via openSync).
- `globalThis`-stashed registry to survive module duplication.

### PR 5 — node:sqlite driver (#1271)

Added `packages/activesupport/src/sqlite-drivers/node-sqlite.ts` wrapping
Node 22.5+'s built-in `node:sqlite`. Soft-loads via `createRequire` so
older Node doesn't crash on import; exposes `isNodeSqliteAvailable` for
test gating. Capabilities: `inProcessSync: true`, `streaming: false`,
`loadExtension: false`, `concurrentStatements: false`,
`foreignKeysOnByDefault: false`, `immediateTransactions: true`.

### PR 7 — expo-sqlite driver (#1299)

Shipped `packages/activesupport/src/sqlite-drivers/expo-sqlite.ts` wrapping
Expo's modern async API (`openDatabaseAsync`, `runAsync`, `getAllAsync`,
`getEachAsync`, `closeAsync`). Same shape as node-sqlite (soft-load,
self-register, expose `isExpoSqliteAvailable` for test gating).

Capabilities:

| Capability               | Value | Why                                                  |
| ------------------------ | ----- | ---------------------------------------------------- |
| `inProcessSync`          | false | expo-sqlite's modern API is async-only               |
| `streaming`              | true  | `getEachAsync` yields rows                           |
| `loadExtension`          | false | No FTS / spatial extensions on RN                    |
| `concurrentStatements`   | false | Single-connection-per-DB model; serialize statements |
| `foreignKeysOnByDefault` | false | Must `PRAGMA foreign_keys = ON` post-open            |
| `immediateTransactions`  | true  | `BEGIN IMMEDIATE` supported                          |

**Async-only:** no `openSync` hook on the driver. Implements
`open(): Promise<SqliteConnection>` only. PR 3 (#1264) made async drivers
first-class; that work is the prerequisite this driver depends on.

**Web fallback:** Expo SDK 51+ auto-forks to wa-sqlite under the hood when
running on web. The driver itself is platform-agnostic — Expo handles
native iOS/Android vs web internally.

**`expo-sqlite` peer dep:** added to `optionalDependencies` in
`activesupport/package.json` so Trails consumers don't need Expo unless
they're using this driver.

**Reference impl:** `packages/activesupport/src/sqlite-drivers/node-sqlite.ts`
is the closest in shape (soft-load, capabilities object, single-driver
self-registration). Cherry-pick its structure.

**Out of scope (defer to PR 6):** CI matrix integration, parity tests
across all three drivers (better-sqlite3 / node:sqlite / expo-sqlite),
docs in the website. PR 6 is still the planned follow-up that wires
all drivers into a CI matrix.

### PR 6 — CI matrix + parity tests + docs (blocked on driver landing)

Originally planned to land after PR 5; still pending. After PR 7
(expo-sqlite) lands, this PR wires all three drivers into a CI matrix
and adds parity tests asserting identical behavior across them.
