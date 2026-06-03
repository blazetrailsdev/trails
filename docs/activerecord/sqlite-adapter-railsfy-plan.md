# SQLite adapter Rails-fy plan: retire the driver registry for adapter-subclass selection

**Status:** planning (2026-06-03). Follow-up to PR #2905 (merged), which
relocated the SQLite driver abstraction + 3 drivers (`better-sqlite3`,
`node-sqlite`, `expo-sqlite`) from `activesupport` → `activerecord` as a **pure
move** — the runtime `SqliteDriver` registry was left intact.

## Why

The runtime `SqliteDriver` registry (`registerSqliteDriver()` / `getSqlite()` /
`getSqliteAsync()` / `config.driver` / `AR_SQLITE_DRIVER`) is a **trails
invention with no Rails counterpart**. Rails has no "driver" concept: the
per-library connection object is a _client_ obtained via `new_client`, and
`SQLite3Adapter` is **concrete**, wiring the one `sqlite3` gem directly. "One DB,
multiple backing libraries" is modeled in Rails as thin adapter subclasses over
a base (`AbstractMysqlAdapter` + `Mysql2Adapter`).

This campaign makes the SQLite adapters Rails-faithful: select the backend by
`adapter:` **name** via adapter classes, and retire the runtime registry +
`config.driver`. The end goal is for the builtin **`node:sqlite`** to be the
default backend — eliminating the `better-sqlite3` native dependency from the
default path, which is _more_ Rails-like (a batteries-included builtin, like
Rails' bundled gem).

## Decisions locked in

- **Default backend → `node:sqlite`**, once Node 24 is in place.
- **Node floor bump is handled separately by PR #2909** (`node24-upgrade`:
  Node 20/22 → 24 LTS across `.tool-versions`, CI, `setup-pnpm`, runner image,
  generated-app defaults). #2909 is the **prerequisite** that makes `node:sqlite`
  available + stable in dev + CI. This campaign does **not** own the bump.
- **`config.driver` removed** in PR1. Custom drivers → write a custom adapter
  subclass (the Rails way).
- **Registry teardown follows** `config.driver` removal (not all in PR1).
- **expo deferred**: `expo-sqlite` is async-only (no `openSync`) and the adapter
  `connect()` path is sync-only. `ExpoSqliteAdapter` is blocked on building
  async-connect support into `AbstractAdapter` — out of scope here.
- **Keep `SQLite3Adapter` concrete.** It is instantiated at ~150 sites (mostly
  tests; **0** `instanceof` checks). It stays the base/default class — do **not**
  rename it to `AbstractSqlite3Adapter`: that diverges from Rails' concrete
  `SQLite3Adapter` and would force ~150 edits incl. forbidden test renames.
  Alternate backends are expressed as subclasses.

## End-state architecture

- `SQLite3Adapter` (concrete, the `sqlite3`/`sqlite` default) — obtains its
  client via a new `protected newClient(openConfig): SyncSqliteConnection` seam
  (the `new_client` analog), wiring the default backend **directly** (no
  registry). Already holds all shared dialect/quoting/schema via
  `connection-adapters/sqlite3/`.
- `BetterSqlite3Adapter extends SQLite3Adapter` — overrides `newClient()` →
  `betterSqlite3Driver`; selected by `adapter: better_sqlite3`. `better-sqlite3`
  stays an **optional** peer dependency.
- `ExpoSqliteAdapter extends SQLite3Adapter` — later, post async-connect.
- `config.driver` + `getSqlite` / `registerSqliteDriver` / `getSqliteAsync` /
  `clearSqliteDrivers` + `AR_SQLITE_DRIVER` — removed by end of campaign.

## Phased PRs

Each branches from `main`. PR1↔PR2 both touch `sqlite3-adapter.ts`, so they ship
**sequentially** (PR1 merges, then PR2 off updated `main`) — not as parallel
siblings. Target ≤500 LOC each.

### PR1 — `newClient()` seam + register `better_sqlite3` + retire `config.driver`

_Node-agnostic; ships independent of #2909. Behavior-preserving: default backend
stays better-sqlite3 (works on Node 20+, CI-stable) so PR1 is not coupled to the
Node bump._

- `connection-adapters/sqlite3-adapter.ts`: add `protected newClient(openConfig)`;
  `connect()` (~line 2069) calls `this.newClient(...)` instead of the
  `getSqlite(driverOpt)` / `config.driver` branch. Default `newClient()` imports
  `betterSqlite3Driver` from `../sqlite/better-sqlite3.js` and calls `openSync()`.
- Remove `driver?:` from `SQLite3AdapterOptions`
  (`connection-adapters/pool-config.ts:274`) and the `config.driver` handling in
  `connect()`. Update the handful of tests passing `{ driver: ... }` (e.g.
  `adapters/sqlite3/sqlite3-adapter.test.ts:690,702`) — drop the
  injection-specific cases (the feature is being removed).
- `connection-adapters.ts`: register `better_sqlite3` → `SQLite3Adapter`
  alongside existing `sqlite3`/`sqlite`; drop the better-sqlite3
  auto-import-to-register hack in `sqlite3Loader` (adapter imports its driver
  directly now).
- Registry left in place this PR (still used by `sqlite-template.ts`'s
  `getSqliteAsync()` template-clone path + driver self-registration).
- ~150 `new SQLite3Adapter(...)` sites: **unchanged**.

### PR2 — `node:sqlite` becomes the default

_Depends on #2909 / Node 24._

- Flip `SQLite3Adapter`'s default `newClient()` from better-sqlite3 → import
  `nodeSqliteDriver` from `../sqlite/node-sqlite.js` (`openSync()`).
- Add `BetterSqlite3Adapter extends SQLite3Adapter` (overrides `newClient()` →
  better-sqlite3) for opt-in; point `better_sqlite3` adapter-name registration
  at it.
- The ~150 `new SQLite3Adapter(...)` default sites now run on `node:sqlite` —
  verified on Node 24. `node-sqlite.ts` is feature-adequate: implements
  `restoreFromPath` (via `node:sqlite` `backup()`), `pragma`, bigint, `iterate`;
  the adapter uses only built-in `COLLATE`, no custom SQL functions.
- Rewire `test-helpers/sqlite-template.ts` (`getSqliteAsync()`) +
  `test-setup-ar.ts` / `test-setup-worker-db.ts` to the default driver directly;
  this lets PR3 delete the registry.

### PR3 — registry teardown

- Delete `getSqlite` / `getSqliteAsync` / `registerSqliteDriver` /
  `clearSqliteDrivers` + `REGISTRY_KEY` + `AR_SQLITE_DRIVER` from
  `sqlite/sqlite-adapter.ts`; keep the `SqliteConnection` / `SqliteStatement` /
  `SqliteDriver` _types_ (the client protocol) and the driver modules'
  self-contained `openSync`.
- Remove driver self-registration side effects from the driver modules.
- Revisit the setup-free `sqlite-drivers` vitest project (`SQLITE_DRIVER_TESTS`
  in `vitest.config.ts`) + delete the registry tests in `sqlite-adapter.test.ts`.

### Later (out of scope) — `ExpoSqliteAdapter`

Blocked on async-connect support in `AbstractAdapter`. Track separately.

## Critical files

- `packages/activerecord/src/connection-adapters/sqlite3-adapter.ts` — `connect()`
  - new `newClient()` seam; class stays concrete.
- `packages/activerecord/src/connection-adapters/pool-config.ts` — drop `driver?:`.
- `packages/activerecord/src/connection-adapters.ts` — adapter-name registration.
- `packages/activerecord/src/sqlite/{better-sqlite3,node-sqlite}.ts` —
  `betterSqlite3Driver` / `nodeSqliteDriver` (`openSync`) imported directly.
- `packages/activerecord/src/sqlite/sqlite-adapter.ts` — registry (torn down PR3).
- `packages/activerecord/src/test-helpers/sqlite-template.ts`, `test-setup-ar.ts`,
  `test-setup-worker-db.ts` — registry consumers to rewire (PR2/PR3).
- `packages/trailties/src/database.ts` — `new SQLite3Adapter(...)` (line 473) +
  the `config.driver`/registry error-message block (~438–460).
- `packages/activerecord/dx-tests/tsconfig.json` — add `paths` for any **new**
  cross-package bare specifier introduced into activerecord source (the PR #2905
  lesson: dx-tests typecheck runs with no build).

## Mirror, don't reinvent

- Follow `connection-adapters/mysql2-adapter.ts` + `abstract-mysql-adapter.ts`
  for the base/subclass split and `adapterName` handling. All sqlite subclasses
  return `adapterName === "sqlite"`, exactly as `Mysql2Adapter` returns
  `"mysql"` — no `AdapterName` type change needed.
- `newClient()` mirrors Rails `SQLite3Adapter#new_client`.

## Verification (per PR)

- `pnpm exec tsc --build packages/activerecord packages/trailties packages/activerecord-cli` — clean.
- `pnpm test:types` under the no-`dist` condition (move `dist` aside) — guards
  the dx-tests `paths` regression class from #2905.
- Targeted vitest (not the full suite): `adapters/sqlite3/sqlite3-adapter.test.ts`,
  `connection-adapters/sqlite3-adapter.transactions.test.ts`,
  `sqlite3-introspection.test.ts`, the `sqlite-drivers` project files, and
  `trailties` `database`/`db` tests.
- PR2 specifically: confirm CI **SQLite Tests** job (Node 24, post-#2909) is
  green with the ~150 default sites now on `node:sqlite`.
- `pnpm api:compare --package activerecord` stays 100%; `test:compare` delta ≥ 0
  (verify regenerated manifests show no unexpected diff, per the #2905 method).
