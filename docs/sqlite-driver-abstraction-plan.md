# SQLite Driver Abstraction Plan

## Background

`better-sqlite3` exposes a fully synchronous API. Wrapping it in a
`SqliteDriver` interface with return type `T | Promise<T>` lets a future async
driver (e.g. `wa-sqlite` for browser/worker contexts) slot in without touching
the adapter layer.

## PRs

### PR 1 — SqliteDriver interface + better-sqlite3 wrapper (#1238)

Added `packages/activerecord/src/connection-adapters/sqlite3/driver.ts`:

- `SqliteDriver` interface with `open`, `prepare`, `exec`, `pragma`, `close`,
  `raw`, `setReadBigInts` (sync config setter), `finalize` (optional teardown).
- `BetterSqlite3Driver` wrapper over the existing `better-sqlite3` `Database`.
- `SqliteStatement` interface wrapping `better-sqlite3`'s `Statement`.

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
flags any `driver.<method>(...)` call (where `driver` is a local identifier —
e.g. a helper-function parameter or destructured variable) that is not wrapped
in `await` or chained with `.then()`/`.catch()`.

Whitelisted (always synchronous):

| Method                               | Reason                                |
| ------------------------------------ | ------------------------------------- |
| `setReadBigInts`                     | synchronous configuration setter      |
| `finalize`                           | optional teardown, no-op in sync impl |
| Property access (`driver.raw`, etc.) | not a call; no Promise returned       |

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

### PR 3 — Sprinkle async/await (upcoming)

- Make `BetterSqlite3Driver` methods return `Promise<T>` (via
  `Promise.resolve`).
- Add `async`/`await` at every `this.driver.*` call site in `sqlite3-adapter.ts`
  and the `sqlite3/` cluster.
- The `blazetrails/sqlite-driver-await` lint guard ensures any new helper
  that passes a `driver` parameter and calls methods on it without `await`
  is caught at CI time, not at runtime.
