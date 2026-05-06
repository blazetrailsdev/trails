# SQLite driver abstraction plan

Goal: decouple `Sqlite3Adapter` from `better-sqlite3` so the same adapter can
run on top of any SQLite driver — `node:sqlite`, `expo-sqlite`,
`@sqlite.org/sqlite-wasm`, `wa-sqlite`, `sql.js`, etc. — by having activerecord
consume a generic `getSqlite()` accessor from `activesupport`, modeled on
`getFs()` / `fs-adapter.ts`.

## Status (2026-05-06)

- ✅ **Original PR 1 merged** — `packages/activerecord/src/connection-adapters/sqlite3/driver.ts`
  exists with `SqliteConnection` / `SqliteStatement` / `SqliteDriver` interfaces, plus
  `drivers/better-sqlite3.ts` wrapping the existing `Database`/`Statement` calls.
- ✅ **Original PR 2 merged** — `Sqlite3Adapter` routes all driver calls through
  `this.driver.foo()`. Statement pool typed against `SqliteStatement`.
  `safeIntegers` unified as `setReadBigInts`.
- 🟡 **PR #1241 in flight** — adds `blazetrails/sqlite-driver-await` ESLint rule
  scoped to `sqlite3/**` and `sqlite3-adapter.ts`. Flags any `driver.<method>(...)`
  not wrapped in `await` / `.then` / `.catch`. With async committed everywhere
  (open question #1 settled below), this rule is no longer a PR 3 _gate_ — it's
  a permanent regression guard against future drift. Merge it as-is; PR M
  extends the rule's glob to `packages/activesupport/src/sqlite-adapter.ts` and
  `sqlite-drivers/**` when the driver code moves.

The driver interface today **lives in activerecord**. The pivot below moves it
to activesupport so other packages (FileStore, ActionDispatch session store,
ActiveJob queue adapters) get SQLite for free, and so `node:fs` / `process.env`
plumbing can be solved once at the activesupport layer instead of re-derived
inside activerecord.

## Why activesupport

The abstraction "open a SQLite handle and run statements" is a generic
capability, like "read/write a filesystem." Query building, type maps, and
schema dumping stay in activerecord. Bytes-in/rows-out is a primitive.

Concretely, putting the driver in activesupport:

1. **Pattern parity with `getFs()`.** Same `register*Adapter` / `get*` shape,
   same lazy-load default, same subpath-export model for non-Node drivers.
   Consumers already know how to swap `getFs`; swapping `getSqlite` is the
   same muscle memory.
2. **Dissolves the carve-out.** The old PR 6 ("remove `node:fs` from the base
   adapter") existed only because activerecord was tangled with both
   `better-sqlite3` and `node:fs`. Once the driver lives in activesupport
   behind `getSqlite()`, activerecord stops touching either. The
   browser-bundle CI gate moves to activesupport, where `getFs` already needs
   it.
3. **Reuse beyond AR.** Rails has `SQLite3CacheStore`, SQLite session stores,
   SQLite-backed ActiveJob queues. Each of these lands in a different
   trails package. Putting the driver in activesupport means each consumer
   takes a dep on activesupport (which they already do) instead of on
   activerecord.

## Design

### Driver interface

`packages/activesupport/src/sqlite-adapter.ts` (moved from
`packages/activerecord/src/connection-adapters/sqlite3/driver.ts`).

**Design principles**

- All methods async-tolerant: return type `T | Promise<T>`. Sync drivers (better-sqlite3) return values directly; async drivers (sqlite-wasm, sqlite-network, expo-sqlite) return Promises. Callers always `await`. This applies to `prepare()` too — sync drivers return the statement immediately and the adapter pays one microtask at the await boundary; async drivers return a Promise. The adapter never assumes one or the other.
- Driver code is opaque to AR query construction: bytes-in (SQL string + binds), rows-out (raw row values + column metadata). Type-coercion / casting / Date-encoding stay in the AR adapter so PG/MySQL/SQLite share one code path.
- Driver-thrown errors are not normalized at this layer; AR's `translateException` maps them. Drivers throw whatever the underlying library throws.
- Statements are reusable across `run` / `get` / `all` / `iterate` calls. Each call independently rebinds.

**Bind values**

```ts
/** Anything a sqlite driver must accept as a bound parameter. */
export type SqliteBindValue =
  | null
  | string
  | number
  | bigint
  | boolean // drivers MAY coerce to 0/1; AR adapter pre-coerces for parity with PG/MySQL
  | Uint8Array // BLOB; Buffer (Node) is also valid because Buffer extends Uint8Array
  | Date; // drivers MAY coerce to ISO string; AR pre-formats for parity

/** Positional or named binds; statement methods accept either form. */
export type SqliteBinds = readonly SqliteBindValue[] | { readonly [name: string]: SqliteBindValue };
```

**Driver and statement**

```ts
export interface SqliteConnection {
  prepare(sql: string): SqliteStatement | Promise<SqliteStatement>;

  /** Multi-statement DDL/DML. No binds, no return value. */
  exec(sql: string): void | Promise<void>;

  /**
   * `PRAGMA <source>;` — returns rows from `prepare("PRAGMA …").all()`.
   * `simple: true` returns the scalar value of the first column when there's
   * exactly one row + one column (mirrors better-sqlite3's helper).
   */
  pragma(source: string, opts?: { simple?: boolean }): unknown | Promise<unknown>;

  /** Idempotent. After close(), all calls reject / throw. */
  close(): void | Promise<void>;

  /** True between successful open() and close(). */
  isOpen(): boolean;

  /** Driver-specific escape hatch (e.g. better-sqlite3 `Database` instance). */
  readonly raw: unknown;
}

export interface SqliteStatement {
  /** INSERT/UPDATE/DELETE/DDL. */
  run(binds?: SqliteBinds): RunResult | Promise<RunResult>;

  /** First row, or null if none. */
  get(binds?: SqliteBinds): unknown | Promise<unknown>;

  /** All rows. Drivers MAY stream internally but MUST return a fully-realized array. */
  all(binds?: SqliteBinds): unknown[] | Promise<unknown[]>;

  /**
   * Row-at-a-time iteration. Sync drivers return Iterable; async drivers return
   * AsyncIterable. AR's batch path uses this for large result sets.
   */
  iterate(binds?: SqliteBinds): Iterable<unknown> | AsyncIterable<unknown>;

  /** Column metadata for the prepared statement. Stable across calls. */
  columns(): ColumnInfo[];

  /**
   * When true, integer columns return as bigint; when false, as number (with
   * silent loss of precision for values outside Number.MAX_SAFE_INTEGER).
   * Default: false. Drivers without a per-statement toggle (some WASM ports)
   * MAY no-op and document the gap.
   */
  setReadBigInts(on: boolean): void;

  /**
   * Release driver resources. Optional — drivers without explicit finalization
   * (better-sqlite3) leave it undefined; the statement pool calls it when set.
   */
  finalize?(): void | Promise<void>;
}

export interface ColumnInfo {
  name: string; // result-set column name (alias if any)
  column: string | null; // source column from the underlying table; null for expressions
  table: string | null; // source table name; null for expressions
  database: string | null; // attached-db name; null for expressions or main db
  type: string | null; // declared sqlite type per sqlite_master, may be null
}

export interface RunResult {
  /** Rows affected. SQLite reports this from `sqlite3_changes()`. */
  changes: number;
  /**
   * INSERT rowid. `bigint` when setReadBigInts is on, else `number`.
   * Caller must check the type if it accepts both modes.
   */
  lastInsertRowid: number | bigint;
}
```

**Open / driver registration**

```ts
export interface SqliteOpenConfig {
  /** File path or special URI (`:memory:`, `file::memory:?cache=shared`). */
  database: string;

  /** Open in read-only mode. Default false. */
  readOnly?: boolean;

  /** SQLITE_OPEN_NOMUTEX equivalent — opt-in for single-threaded use. */
  noMutex?: boolean;

  /** busy_timeout ms for SQLITE_BUSY contention. Default 5000. */
  timeout?: number;

  /**
   * Driver-specific options pass-through. Drivers document their own keys;
   * AR core never inspects this object.
   */
  driverOptions?: Record<string, unknown>;
}

export interface SqliteDriver {
  readonly name: string;

  /**
   * Driver self-declared capabilities. Consumers introspect this to decide
   * whether a given feature path is available without splitting the adapter
   * into sync/async code paths. The adapter itself always awaits at driver
   * boundaries (see "Settled decisions" below); capabilities are for
   * feature-detection, not call-shape branching.
   */
  readonly capabilities: SqliteDriverCapabilities;

  open(config: SqliteOpenConfig): Promise<SqliteConnection>;

  /**
   * Pre-flight check used by `tasks/sqlite_database_tasks.ts` to decide
   * whether `db:create` should run before connecting. Optional — drivers
   * that can't statelessly answer (network-backed, ephemeral) leave it
   * undefined and the task layer falls back to attempt-and-catch.
   */
  databaseExists?(config: SqliteOpenConfig): boolean | Promise<boolean>;
}

export interface SqliteDriverCapabilities {
  /**
   * True when prepare/run/get/all return values without yielding to the event
   * loop (the adapter still awaits at the boundary; this only signals
   * microtask-only overhead vs. real I/O latency). better-sqlite3 + node:sqlite:
   * true. WASM, network, expo-sqlite: false.
   */
  readonly inProcessSync: boolean;

  /**
   * True when iterate() yields rows incrementally (vs. collecting then
   * yielding). Drivers that materialize all rows internally MUST set false
   * so AR's batch path can pick a different strategy.
   */
  readonly streaming: boolean;

  /**
   * True when SQLite extensions (loadable .so / .dll / .dylib via
   * `sqlite3_load_extension`) work. node:sqlite: false. better-sqlite3:
   * true on Node, false on bundled-WASM builds. Adapter paths that need
   * extensions throw NotImplementedError when this is false.
   */
  readonly loadExtension: boolean;

  /**
   * True when multiple statements can be live on one connection at once
   * without interfering. better-sqlite3 + node:sqlite: true. Some
   * older WASM ports: false (must finalize before preparing the next).
   * AR's statement-cache eviction policy reads this.
   */
  readonly concurrentStatements: boolean;

  /**
   * True when the driver enforces foreign-key constraints by default.
   * SQLite is opt-in via `PRAGMA foreign_keys = ON`; most drivers default
   * to ON for AR, but turso/libsql defaults differ. AR's connection setup
   * uses this to decide whether to issue the PRAGMA.
   */
  readonly foreignKeysOnByDefault: boolean;

  /**
   * True when `BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE` are honored. WAL mode
   * + standard SQLite: true. Some network-backed drivers serialize
   * differently and don't accept these. AR's transaction setup falls back
   * to plain `BEGIN` when false.
   */
  readonly immediateTransactions: boolean;
}
```

**Capability matrix per driver** (sanity-check that the flag set is right; also drives PR 6's parity allow-list):

| Capability               | better-sqlite3 (Node) | node:sqlite (≥22.5) | sqlite-wasm (browser)      | expo-sqlite (RN) | turso/libsql (network) |
| ------------------------ | --------------------- | ------------------- | -------------------------- | ---------------- | ---------------------- |
| `inProcessSync`          | true                  | true                | false (init() async)       | false            | false                  |
| `streaming`              | true                  | true                | false (collect-then-yield) | false            | false                  |
| `loadExtension`          | true                  | false               | false                      | false            | false                  |
| `concurrentStatements`   | true                  | true                | varies                     | true             | true                   |
| `foreignKeysOnByDefault` | false (PRAGMA needed) | false               | false                      | false            | varies                 |
| `immediateTransactions`  | true                  | true                | true                       | true             | false (network)        |

**Out of scope for v1** (tracked as future open questions, not blocking):
custom function/aggregate registration, virtual tables, authorizer hooks, `db.backup()`, online schema-change hooks, encryption (SQLCipher) plumbing. Drivers expose these via `driver.raw` until usage patterns are clear enough to lift into the interface. Capabilities flags can be added incrementally — the interface is open for extension as long as new flags default to `false` (driver presumed not to support).

### Accessor surface (mirrors `fs-adapter.ts`)

```ts
export function registerSqliteDriver(driver: SqliteDriver): void;
export function clearSqliteDrivers(): void;
export function getSqlite(name?: string): SqliteDriver;
export async function getSqliteAsync(name?: string): Promise<SqliteDriver>;
```

**Resolution rules** (deterministic; no implicit "first wins"):

- `getSqlite(name)` with an explicit `name` returns the registered driver or throws if missing.
- `getSqlite()` with no arg:
  1. If `AR_SQLITE_DRIVER` env var is set (Node only), use it. Throws if the named driver isn't registered.
  2. Else, if **exactly one** driver is registered, return it.
  3. Else (zero registered, or two-or-more without an explicit selection), throw with a helpful message naming the registered drivers and the env var to set.
- `getSqliteAsync()` exists for drivers whose modules are themselves async (WASM bindings that await `init()` before exporting). Same resolution rules as `getSqlite()`. Mirrors the `getFsAsync` precedent.
- Driver-name collisions overwrite the prior registration with a one-time `console.warn`. Tests use `clearSqliteDrivers()` to swap deterministically.

### Package layout

```
packages/activesupport/src/
  sqlite-adapter.ts           # interface + registry + getSqlite/getSqliteAsync
  sqlite-drivers/
    better-sqlite3.ts         # imports better-sqlite3 (optional peer dep)
    node-sqlite.ts            # imports node:sqlite
```

`@blazetrails/activesupport` `package.json` exports map:

```json
"./sqlite/better-sqlite3": "./dist/.../sqlite-drivers/better-sqlite3.js",
"./sqlite/node-sqlite":    "./dist/.../sqlite-drivers/node-sqlite.js"
```

activerecord's `Sqlite3Adapter` imports the _type_ `SqliteConnection` from
activesupport and resolves the _instance_ via `getSqlite()`. No driver code
remains in activerecord.

`better-sqlite3` becomes an `optionalPeerDependency` of activesupport.
`node:sqlite` is a Node built-in — no install footprint. Consumers using
neither (browser/RN) register their own driver and never import the
defaults.

### Config

```ts
{
  adapter: "sqlite3",
  driver: "better-sqlite3", // or "node-sqlite", or a SqliteDriver
  database: "./dev.sqlite3",
}
```

`pool-config` accepts `driver: string | SqliteDriver` and passes it
through to the sqlite3 adapter, which calls `getSqlite(config.driver)` at
connect time.

## PR breakdown (revised)

Sized for the project's 300-LOC ceiling. Old PRs 1 and 2 are already merged;
the remaining work re-homes the abstraction in activesupport, then proceeds
with async + node:sqlite.

### PR M — Move driver interface from activerecord to activesupport

- Copy `packages/activerecord/src/connection-adapters/sqlite3/driver.ts` →
  `packages/activesupport/src/sqlite-adapter.ts`. Type-only move; no runtime
  behavior change.
- Add `registerSqliteDriver` / `clearSqliteDrivers` / `getSqlite` /
  `getSqliteAsync` accessors mirroring `fs-adapter.ts`.
- Move `packages/activerecord/src/connection-adapters/sqlite3/drivers/better-sqlite3.ts`
  → `packages/activesupport/src/sqlite-drivers/better-sqlite3.ts`. Self-registers
  on import.
- Add subpath exports in activesupport `package.json`. Move
  `better-sqlite3` peer-dep declaration from activerecord to activesupport.
- **No deprecation shims.** Pre-1.0; every consumer of the activerecord-side
  interfaces is in this monorepo. PR M is the rename — in-flight branches
  rebase onto main like any other PR.
- activerecord's `Sqlite3Adapter` constructor now calls
  `getSqlite(config.driver).open(config)` instead of newing up a
  `BetterSqlite3Driver` directly.
- **Back-compat import lives in `packages/activerecord/src/test-setup-ar.ts` only**, NOT `activerecord/index.ts`. Putting it in `index.ts` would pull `better-sqlite3` transitively for every consumer that imports any AR module — defeating the optionalPeerDependency promise. Apps using sqlite explicitly opt in via either (a) `import "@blazetrails/activesupport/sqlite/better-sqlite3"` in their bootstrap, or (b) `driver: betterSqlite3Driver` in their pool config.
- `pool-config` accepts the `driver` field.

LOC: realistic ~350 (median). The diff covers: type-only move, 4 accessors,
driver-module move, 2 package.json exports entries, peer-dep migration, adapter
constructor rewrite, pool-config plumbing, test-setup back-compat import.
Plan to split as PR Mb (test-setup + back-compat imports) if the main diff
crosses 300; don't fight to fit in one PR.

**This PR replaces old PRs 1 (already done), 5 (registry), and 6 (carve-out)
in one move.** The carve-out is implicit: `getFs` calls move with the driver
into activesupport, and activerecord's adapter stops importing them.

### PR 3 — Async-aware adapter

`blazetrails/sqlite-driver-await` (PR #1241) provides the regression guard:
missed `await driver.foo()` becomes a CI lint failure. After PR M, extend the
rule's scope to the activesupport driver paths.

Scope:

- Sprinkle `async`/`await` through `sqlite3-adapter.ts` at every driver
  call boundary. Public methods that already return promises (`execQuery`,
  `selectAll`, transaction control) need no signature change. Sync-typed
  internal helpers (`pragma()`, `_cachedStatement`, introspection helpers,
  `copyTable`) become async.
- Audit: `grep` for adapter callers that don't `await`. Most are tests and
  internal sqlite paths; PG/MySQL parallels are already async.
- Statement pool gains async finalize on eviction.

**No performance gate.** Async everywhere is the explicit design choice — the
flexibility to drop in WASM / network / async drivers (sqlite-wasm, expo-sqlite,
turso) is the whole point of the abstraction. better-sqlite3's microtask-per-call
overhead is acceptable; if a benchmark elsewhere regresses noticeably, address
it in that benchmark, not by reverting the async lift.

LOC: ~250–300, plus a focused test pass.

### PR 4 — Consolidate transactions onto the generic path

- Audit any remaining reliance on better-sqlite3's `db.transaction(fn)`.
  Currently we call `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT` directly via
  `db.exec`, so this PR is likely a no-op audit + tests proving
  nested-transaction parity with PG/MySQL across drivers.

LOC: ~100, mostly tests.

### PR 5 — `node:sqlite` driver

`packages/activesupport/src/sqlite-drivers/node-sqlite.ts` implementing
`SqliteConnection`. Self-registers as `"node-sqlite"`. Differences from
better-sqlite3 normalized inside the driver:

- No `.pragma()` helper → implement via `prepare("PRAGMA …").all()`. Mirror
  better-sqlite3's `[{ pragma_name: value }]` row shape so the adapter sees
  identical results.
- `setReadBigInts` exists as a per-statement setter — direct mapping.
- No `loadExtension` — throw `NotImplementedError` from any adapter path that
  needs it; document the gap in `docs/sqlite-driver-parity.md` (created in PR 6).
- Bind handling: node:sqlite uses positional `?` and named `:foo` differently
  from better-sqlite3 — driver normalizes both forms of `SqliteBinds` into
  whatever node:sqlite expects.
- `transaction(fn)` helper absent — already unused; we do explicit
  `BEGIN`/`COMMIT`.
- `iterate()` uses node:sqlite's iterator return; sync today, but the
  interface allows AsyncIterable for future drivers without recompilation.
- Engine guard: throw at registration time on Node < 22.5 (or whatever
  version stabilizes `node:sqlite`); link to the version compatibility note
  in the engine-guard error message.

**Async path validation.** Even though node:sqlite is sync internally, ensure
the adapter→driver call sites all `await` (relying on the lint guard from
#1241). Order discipline: PR M → PR 3 (async lift) → PR 5 (node:sqlite). PR 5
landing before PR 3 means the adapter still wraps everything sync and we'd
never validate the async path against a real driver. If for any reason PR 5
ships first, PR 6's CI matrix MUST run node:sqlite under
`AR_FORCE_ASYNC_DRIVER=1` (a test-only knob the driver wrapper honors by
returning everything wrapped in `Promise.resolve(...)`) so missed awaits
surface deterministically.

LOC: ~250.

### PR 6 — CI matrix + parity tests + docs

- Run the existing sqlite test suite under both drivers via
  `AR_SQLITE_DRIVER=better-sqlite3` and `AR_SQLITE_DRIVER=node-sqlite`.
- Two CI jobs (or one matrixed job). Expect a small allow-list of
  known-different behaviors documented in `docs/sqlite-driver-parity.md`
  (created in this PR).
- Smoke test exercising both drivers in the same process to catch
  global-state leaks.
- Browser-bundle CI test on activesupport: build a minimal entry that
  imports `getSqlite` (no concrete driver) and runs through `esbuild
--platform=browser --bundle`. Failing on `node:fs` resolution is the
  regression signal. Catches anyone re-adding `node:*` imports to the base
  accessor module.
- Public README section on choosing a driver.
- Driver authoring guide pointing at the activesupport interface.

LOC: ~250.

## Order and dependencies

- PR M is independent; can land as soon as TS infrastructure is stable.
- PR 3 depends on PR M (so async lift happens against the activesupport
  interface, not the soon-to-move activerecord one). Also blocks on
  TS-final or the lint guard.
- PR 4 can land any time after PR 3.
- PR 5 depends on PR M (the registry lives in activesupport). It does
  _not_ depend on PR 3 — node:sqlite is sync, same as better-sqlite3, and
  the existing sync wrapping in the adapter still works pre-PR 3. But
  shipping node:sqlite _before_ PR 3 means we never validate the async
  path against a real driver, so order PR M → 3 → 5 in practice.
- PR 6 depends on PR 5.

## Settled decisions

1. **Async everywhere.** Adapter awaits at every driver boundary. Sync drivers
   (better-sqlite3) cost one microtask per call; the flexibility to swap in
   async drivers (sqlite-wasm, expo-sqlite, turso, etc.) is worth it. No
   dual-class fallback.
2. **better-sqlite3 stays the Node default.** Apps that want `node:sqlite` opt
   in via `driver: "node-sqlite"` or `AR_SQLITE_DRIVER=node-sqlite`. No silent
   default switch when `node:sqlite` exits experimental.
3. **Adapter name is `sqlite3`** regardless of driver (Rails parity); `driver`
   is a sub-selector.
4. **Driver-name collisions overwrite with one-time `console.warn`.** Tests
   use `clearSqliteDrivers()` for deterministic state. Per-connection
   statement pools already isolate prepared statements across drivers.
5. **Resolution requires explicit selection when multiple drivers are
   registered** (see Resolution rules above). No "first registered" wins.

## Open questions

1. **Should FileStore / cache pick up the SQLite driver too?** Out of scope
   for this plan, but the activesupport home makes it trivial: a
   `SqliteCacheStore` lives next to `FileStore` and consumes `getSqlite()`
   the same way `FileStore` consumes `getFs()`. Defer until a concrete
   consumer needs it.

2. **Custom function / aggregate registration.** The base interface omits
   `function()` / `aggregate()` because better-sqlite3 and node:sqlite
   diverge in shape and not every driver supports them (WASM ports often
   don't). AR's collation needs (e.g. `BINARY` vs `NOCASE`) are SQL-side,
   not function-side. If we hit a real consumer that needs custom Ruby-style
   `define_method` callbacks, lift through the `driver.raw` escape hatch
   first; lift to interface only if multiple drivers benefit.

3. **`databaseExists?` call site.** Today only `tasks/sqlite_database_tasks.ts`
   needs it (to decide whether `db:create` runs before connecting). The
   interface marks it optional; drivers that can't statelessly answer
   leave it undefined. If task layer drift makes it unused, drop it.
