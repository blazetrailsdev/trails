# Connection-pooled test adapter — Rails-parity epic

> **Status (2026-05-22):** Phase A0 spike resolved; Phase B/C shipped
> (#2242/#2245). Phase D sweep in flight (batch 1: #2250/#2253; expect
> 4–8 more batches). Phase E open (gated on D). Phase F open; bundles
> with TM Phase 9b-4 per
> [`activerecord-index.md`](activerecord-index.md).
>
> Future-tense narratives below predate Phase B/C; treat them as design
> reference. Live phase state lives in the index.

Epic to retire `_sharedAdapter` (the module-level singleton currently
shared across every test in a worker) in favor of a connection-pool-
backed test adapter that mirrors Rails' `ConnectionPool#pin_connection!`
pattern. This eliminates the chain-isolation problem that motivates
trails' `AsyncContext`-based TX visibility filter — Rails doesn't need
that filter because each chain naturally owns its connection.

This is a follow-up to the TM unification plan
([`tm-unification-plan.md`](tm-unification-plan.md)). Phase 9b-4 +
the post-Phase-9 path-2 cleanup carry chain-isolation in the
`TestAdapterFixtures` / `SidecarFixtures` wrapper as a temporary
trails-specific patch over the shared-adapter pattern. This epic
removes the underlying need for that patch.

## What Rails does

`ActiveRecord::TestFixtures` in
`vendor/rails/activerecord/lib/active_record/test_fixtures.rb`:

- `setup_fixtures` (line 125) — calls
  `pool.pin_connection!(lock_threads)` for each handler's pool
- `pin_connection!` — locks the pool so every checkout returns the
  _same_ connection for the test's duration
- `lock_threads` parameter — when `true`, also acquires a thread lock
  (single-threaded test). Defaults from `run_in_transaction?` and
  the test's `use_transactional_tests` flag.
- Each pinned connection has its own `TransactionManager`. TX state
  is per-connection.
- `setup_shared_connection_pool` (line 220) — when a replica pool
  exists, points reader pool at the writer pool so test reads in
  uncommitted state see the writer's transaction.
- `unpin_connection!` (line 205) — releases the pin in `teardown_fixtures`.

**Key invariant:** chain isolation is implicit. A chain that didn't
acquire a connection from the pool can't see another chain's TX state
because it has no `ActiveRecord::Base.connection` to query. Ruby's
single-thread-per-worker model means in-process concurrency (the JS
`Promise.all` pattern) isn't a thing — parallel runs come from worker
forking, and each worker has its own pinned connection.

## What trails does today

`packages/activerecord/src/test-adapter.ts`:

- Module-level `_sharedAdapter`: ONE adapter instance per worker,
  created at module load (env-URL-based dispatch to PG/MySQL/SQLite)
- Every `createTestAdapter()` call wraps `_sharedAdapter` in a fresh
  `TestAdapterFixtures` (or `SidecarFixtures` post-path-2)
- Tests share the underlying connection across all their async chains
- `withTransactionalFixtures()` opens a TX wrap per-test; the wrap
  rolls back in `afterEach`
- Chain isolation via `AsyncContext<true>` storage in the wrapper/
  sidecar — explicit patch over the shared connection

**Why we have the patch:** JS `Promise.all` lets two
`Model.transaction { ... }` calls run concurrently in one test against
the shared adapter. Without the filter, branch B's
`currentTransaction()` observes branch A's TM frame as joinable and
bypasses the TM mutex.

**The patch is not Rails-shaped:** Rails has no equivalent because the
chain-shares-connection scenario can't arise — each chain has its own
connection via the pool.

## Target end state

`createTestAdapter()` checks out a fresh connection from a
connection-pool-backed factory (or pins one per worker, matching
Rails' `pin_connection!`). Each test holds its connection for the
test's duration; the underlying SQLite/PG/MySQL driver isolates that
connection's TX state from any other chain.

After this lands:

- The `AsyncContext`-based TX visibility filter in `SidecarFixtures`
  is **unnecessary** — `currentTransaction()`/`inTransaction`/
  `openTransactions` can return the inner adapter's state directly
- The `_manualTxDepth` counter is **unnecessary** — there's no shared
  state across chains to filter
- `SidecarFixtures` shrinks to just DDL tracking
- `Promise.all` concurrent test transactions either: (a) share the
  pinned connection and serialize via the connection's queue (matches
  Rails' single-thread invariant), or (b) get separate pool checkouts
  (matches Rails' multi-thread test config)

## Interaction with the fixtures port

The fixtures port ([`fixtures-port-plan.md`](fixtures-port-plan.md)) is
running in parallel and reshapes the test-data substrate trails uses.
Key intersections:

1. **Schema location.** Fixtures-port PR 0.5a–h moves the canonical
   schema from per-test `defineSchema()` calls to a single
   `packages/activerecord/src/test-helpers/test-schema.ts`, wired into
   `setup-adapter-suite.ts` once per worker. This actually aligns
   with the pool epic — Rails' pinned-connection model also loads
   schema once per worker; each pinned connection sees the same
   schema. Under the pool, the connection-pool factory's
   initialization should load `test-schema.ts` once and tests check
   out connections that already have it.

2. **`useFixtures` and test-data loading.** Fixtures-port PR 8 (proof-
   of-concept conversion) demonstrates the post-port test shape:

   ```ts
   const { authors } = useFixtures({ authors: [Author, authorFixtureData] });
   // test body uses authors("david")
   ```

   Under the pool, two strategies:
   - **(a) Load fixtures once per worker into the shared DB state,
     each test's TX-wrap sees them and ROLLBACKs only its own
     changes.** Matches Rails' transactional fixtures. Requires the
     pool to _pin_ one connection per test (so the TX-wrap can roll
     back without losing fixture data) and the worker's fixture-load
     phase to happen BEFORE any test pins.
   - **(b) Reload fixtures per-test on each new pool checkout.** Slow.
     Don't do this.

   Strategy (a) is the Rails-matching choice. It also fits the pool
   epic's Phase B / Phase C — `withTransactionalFixtures` pins for
   the test's duration, fixtures load before any pin, all tests see
   the same shared fixture data and roll back their own writes.

3. **Phase 6 transactional-fixtures invariant carries over.** The
   Phase 6 hoist (`beforeAll(defineSchema)` + `withTransactionalFixtures`)
   establishes "schema and data are stable across tests in a file;
   tests' writes roll back." Under the pool with fixture-loading at
   worker init, the invariant strengthens to "schema and fixture data
   are stable across all tests in the worker." Even better.

4. **Sequencing.** The fixtures port and the pool epic can run
   independently but interact at the seams:
   - **If the pool epic lands first:** the fixtures port's PR 0.5a–h
     schema lands into a pool-aware `setup-adapter-suite.ts`. PR 8
     proof-of-concept can demonstrate `useFixtures` under the pool.
   - **If the fixtures port lands first:** the pool epic absorbs the
     existing `setup-adapter-suite.ts` schema-load and adapts it to
     pool initialization. The `useFixtures` callsites continue
     working because they don't care about how the adapter was
     obtained — only that it has the schema.

   Either order is workable. Probably the fixtures port lands first
   (it's already in flight, multiple sub-PRs merged) and the pool
   epic adapts to it.

5. **`fixtures-compare` script unaffected.** That script reads files
   only, no DB. The pool epic doesn't touch its surface.

6. **What the pool epic does NOT change about fixtures.** Rails ids
   (Decision 1 of the fixtures plan), `ref()` resolver, ERB →
   `adapterName(adapter)` helper, the typed `useFixtures` accessors —
   none of these depend on whether the underlying adapter is shared
   or pooled. They're loader-layer concerns above the adapter layer.

## What we'd give up

- **Per-test fixture-fresh schema** would re-introspect on every test
  unless schema setup is shared across tests in a worker (Rails does
  this — one schema load per worker, shared across all tests via the
  pinned connection)
- **In-memory SQLite singleton speed** — currently `_sharedAdapter`
  for SQLite is `:memory:`, which is fast because there's no
  cross-process connection. A pool of `:memory:` SQLites would need
  per-connection schema setup (`:memory:` can't be shared between
  connections by definition — each `:memory:` URL is a separate DB).
  Options:
  - **Per-worker shared file-backed SQLite** for tests, then connection
    pool against it. Slower (file I/O) but matches Rails.
  - **Per-test fresh `:memory:` SQLite** with full schema rebuild each
    time. Defeats the Phase 6 hoist work.
  - **Keep `:memory:` singleton for SQLite, pool for PG/MySQL.**
    Pragmatic but the chain-isolation patch stays for SQLite only.

The SQLite question is the main wrinkle. PG/MySQL pool fine.

## Phased plan

### Phase A — Audit shared-adapter dependencies (~50 LOC docs)

Inventory:

1. Tests that explicitly rely on `_sharedAdapter` singleton semantics
   (e.g. set state in one `it()` and read it in another — fragile
   pattern, should be rare)
2. Tests that rely on cross-test schema persistence (Phase 6's
   `beforeAll(defineSchema)` pattern — this MUST be preserved)
3. Performance baseline: current per-test wall-clock; what we'd lose
   under per-test fresh-connection vs per-test pool-checkout

Output: an audit doc with the inventory + perf numbers. No code.

### Phase B — Add a connection-pool factory alongside the singleton (~150 LOC)

Add `createPooledTestAdapter()` returning a real adapter from a
managed pool. Existing `createTestAdapter()` keeps its singleton
behavior. Tests opt in.

Pool semantics:

- For PG/MySQL: a real `connectionPool` (the trails equivalent of
  Rails' `ConnectionPool`). Each test checks out, runs, returns.
- For SQLite: open question (see "What we'd give up"). Default to
  per-worker shared-file SQLite for now; revisit.
- Pin-per-test mode: `withPooledFixtures(test, options)` opens a
  TX wrap on the pinned connection, rolls back in teardown.
  Matches `pin_connection!(lock_threads: true)`.

### Phase C — Migrate `withTransactionalFixtures` to use the pool (~100 LOC)

When a test uses `withTransactionalFixtures(() => adapter)`, the
helper checks out a connection, pins it, runs the test wrap on it.
After teardown, the connection returns to the pool.

`SidecarFixtures` (or whatever post-path-2 fixtures handle exists)
loses the `_txLockStorage`/`_manualTxDepth` mechanisms — they're no
longer needed because chain isolation is implicit in the pinned
connection. The fixtures handle keeps only DDL tracking.

### Phase D — Migrate the rest of the test suite (~200-400 LOC)

Sweep every test file that uses `createTestAdapter()` to use the
pooled factory. Most files don't care — they just need a working
adapter. Files that exercised singleton semantics (Phase A audit's
inventory) need explicit migration.

### Phase E — Delete `_sharedAdapter`, `AsyncContext` filter, manual TX depth

Final cleanup. After all tests are on the pool:

- Delete `_sharedAdapter` module state
- Delete `_txLockStorage`/`_txLockHeld`/`_txVisible` from
  `SidecarFixtures`
- Delete `_manualTxDepth` and the `commit`/`rollback`/`beginTransaction`
  override on `SidecarFixtures` (or delete the sidecar entirely if
  DDL tracking can also move — see "DDL tracking" below)
- Update the TM unification plan to retract the "trails patch over
  shared adapter" framing

### Phase F (optional) — Move DDL tracking onto `AbstractAdapter`

`recordDdlTracking` currently lives in the sidecar's
`executeMutation`/`exec`. With the pool in place, the right home is
an `onDdl?` hook on `AbstractAdapter` that `defineSchema` registers.
The sidecar can then be deleted entirely, and `createTestAdapter()`
returns the real adapter directly — full Rails parity.

## Sequencing

A → B → (C in parallel with start of D) → D → E → F

Total scope: ~600-800 LOC across multiple PRs over multiple weeks.
Each phase is independently shippable. Phase A doesn't ship code.

## Risks

1. **SQLite `:memory:` model** — see "What we'd give up." The
   pragmatic short-term answer is "keep singleton for SQLite, pool
   for PG/MySQL" but that means the AsyncContext filter stays for
   SQLite tests. Defensible if SQLite is the local-dev default and
   PG/MariaDB are CI-only; tests that exercise concurrency must run
   on PG/MariaDB anyway.

2. **Phase 6 transactional-fixture invariants** — the per-test BEGIN/
   ROLLBACK wrap currently uses the singleton's TX state. Moving to
   pinned connections preserves the semantics but requires the pool
   to actually pin (no random checkouts during the test). Verify the
   trails `connectionPool` supports pinning before committing to
   Phase B.

3. **Performance** — per-test connection checkout adds latency. PG
   keepalive helps, but a large suite could feel slower. Measure in
   Phase A.

4. **CI worker config** — trails' AR test workers (`--poolOptions.
forks.singleFork=true` for SQLite local, `--poolOptions.forks.
forks=4` for PG/MariaDB CI) interact with connection limits.
   Pool size needs sizing per CI worker count.

## Resolved investigation notes

### Pool already supports pinning

`packages/activerecord/src/connection-adapters/abstract/connection-pool.ts:499-540`
implements `pinConnectionBang(_lockThread = false)` /
`unpinConnectionBang()` mirroring Rails' `pin_connection!` /
`unpin_connection!` directly:

- Per-async-context keyed map (`_pinnedConnections`) so each chain
  gets its own pin
- Depth counter for nested pin calls
- Lazy connection acquire (uses leased if available, else
  `_acquireConnection()`)
- Auto-begins `joinable: false, _lazy: false` transaction on pin
- Auto-rolls back on unpin
- Returns `clean: boolean` matching Rails' "still-clean?" check

Tested in `connection-pool.test.ts:703-779` (6+ cases). Phase B is
wiring `createTestAdapter()` through the existing pool, NOT building
the pin infrastructure.

### The pool is already the production path

`pool-config.ts:158` (`new ConnectionPool(this)`),
`abstract-adapter.ts:1691` (`this.pool`), and `Base.connectionPool`
(`base.ts:1131`) confirm the pool is production. **Tests today
bypass the pool via `_sharedAdapter` — the bypass IS the Rails
deviation.** The epic reframes from "build a pool" to "stop
bypassing the pool in tests."

### `_sharedAdapter` external footprint

None. Fully encapsulated in `test-adapter.ts`. 436 files reference
`createTestAdapter`/`TestAdapterFixtures`/`TestDatabaseAdapter` — but
the singleton itself has zero external consumers. The factory's
return shape is the only stable surface; we can change the
underlying mechanism without touching consumers.

### Replicas

trails has no reader pool. Rails' `setup_shared_connection_pool`
(which redirects reader pools at writer pools for transactional
fixture visibility) has no parallel concern. Out of scope confirmed.

## Resolved decisions

### Per-test execution context: custom Vitest runner

Q: How does the test infrastructure wrap each test body in
`withExecutionContext()` so the pool's per-async-context pin map
isolates per-test?

A: **Custom Vitest runner.** Vitest exposes `VitestTestRunner` as an
extensible class; the trails-specific subclass overrides `runTask`
to wrap each test body:

```ts
// scripts/vitest-runner-with-execution-context.ts
class TrailsTestRunner extends VitestTestRunner {
  override async runTask(task) {
    return withExecutionContext(() => super.runTask(task));
  }
}
```

Wired via `vitest.config.ts` (and per-package configs). Zero per-test-file changes. All test bodies run in fresh execution
contexts; `executionContextId()` returns a distinct id per test;
`pool.pinConnectionBang()` keys pins per-test naturally.

Trade-offs considered and rejected:

- **`test.extend()` re-export from `test-helpers/it.ts`** — works but
  requires importing the custom `it` in every test file (~436 sweep
  edits). Defer to a follow-up if the runner approach has issues.
- **`globalThis.it` monkey-patch in `test-setup-ar.ts`** — fragile,
  doesn't catch `import { it } from "vitest"` callers.

### SQLite: `file::memory:?cache=shared` — SPIKE FIRST

Q: The pool model needs N connections to the same database. SQLite's
`:memory:` is per-connection. Three candidates: shared-cache memory,
hybrid (singleton SQLite + pool PG/MySQL), file-backed.

A: **All drivers go through the pool. Shared-cache-blocked drivers
use pool size 1.**

Phase A0 spike result (corrected 2026-05-22 — see
[[project_sqlite_shared_cache_spike]] + [[project_expo_sqlite_no_pool]]):

- **`node:sqlite` (Node 22+ built-in):** full shared-cache support.
  Multi-connection pool works.
- **`better-sqlite3` (legacy npm driver):** `SQLITE_OMIT_SHARED_CACHE`
  is compiled in (`deps/defines.gypi:34`). No flag, env var, or
  runtime path enables it. Every connection would be a private
  in-memory DB.
- **`expo-sqlite` (React Native):** JS API doesn't expose URI mode +
  iOS SQLite has `SQLITE_OMIT_SHARED_CACHE` compiled in.

**Resolution: pool size 1 for shared-cache-blocked drivers.** "Shared
cache" means "shared between connections" — if the pool has only one
connection, the requirement doesn't arise. The single connection's
schema, transactions, and state ARE the DB state for the test's
duration. `pinConnectionBang(false)` pins that single connection;
`Promise.all` branches serialize through the pool's lease queue;
`adapter.pool` is non-null so schema-cache lazy-load works.

**Phase D driver → pool config:**

| Driver           | Pool size                 | Source                   |
| ---------------- | ------------------------- | ------------------------ |
| `node:sqlite`    | 5 (default, configurable) | Existing `dbConfig.pool` |
| `better-sqlite3` | 1 (forced)                | Shared-cache blocker     |
| `expo-sqlite`    | 1 (forced)                | Shared-cache blocker     |
| PG, MySQL        | 5 (default, configurable) | Existing `dbConfig.pool` |

Pool size defaults to 5 (matches Rails — see
`database-config.ts:158`). Configurable via existing
`dbConfig.pool` / `dbConfig.maxThreads` surface (URL query param,
hash config, etc.). For shared-cache-blocked drivers, the factory
forces 1 regardless of caller config since multi-connection wouldn't
work.

CI tuning: if PG/MySQL CI runners hit `max_connections` limits, drop
`pool` lower (e.g. 2) via env var or per-worker config. The existing
sizing knobs already handle this.

**One factory for all drivers.** `createPooledTestAdapter()` reads
the active driver and sets `maxConnections` in the `PoolConfig`. Test
code never branches on driver — the pool API is uniform. No
`SidecarFixtures` AsyncContext patch needed for any driver (pool's
lease queue handles serialization; pin handles per-test TX wrap).

This is better than the originally-considered "singleton fallback"
approach because it collapses two factories into one and eliminates
driver-specific consumer code.

**The decision is contingent on a spike that proves the driver layer
actually supports shared-cache.** trails has `isSharedCache()` as a
URI detector (`sqlite3-adapter.ts:830`) but I did not find driver-
side handling in `packages/activesupport/src/sqlite-drivers/better-sqlite3.ts` or
`packages/activesupport/src/sqlite-drivers/node-sqlite.ts`. Both
drivers may already pass the URI to SQLite verbatim and let SQLite
resolve cache semantics — or they may need a config flag. Unknown.

**Spike (~50 LOC, no merge):** open a throwaway branch, write a
self-contained smoke test that:

1. Opens N connections to `file::memory:?cache=shared` via the
   `better-sqlite3` driver
2. Connection 1 runs `CREATE TABLE t (id INTEGER); INSERT INTO t
VALUES (1)`
3. Connection 2 runs `SELECT * FROM t` — expects to see the row
4. Connection 2 runs `BEGIN; INSERT INTO t VALUES (2); ROLLBACK`
5. Connection 1 runs `SELECT count(*) FROM t` — expects 1 (the
   rollback isolated)
6. Repeat for `node-sqlite`

If both drivers pass: option (a) confirmed; proceed with the pool
epic targeting `file::memory:?cache=shared`. If either driver fails:
fall back to option (b) (hybrid — singleton SQLite + pool
PG/MySQL) or fix the driver as a prerequisite PR.

The spike is Phase A0 — runs before any other phase work commits.
Discard the spike branch after the answer is recorded; capture the
finding in this doc.

### `createTestAdapter()` wires through `PoolConfig`/`ConnectionHandler`

Q: Two paths to hook tests into the pool: direct instantiation
(synthetic `PoolConfig` constructed inline) vs going through the
production `PoolConfig` / `ConnectionHandler` resolution path.

A: **Through `PoolConfig`/`ConnectionHandler`.** This is **exactly
how Rails does it.**

Rails reference — `vendor/rails/activerecord/lib/active_record/test_fixtures.rb:172-184`:

```ruby
def setup_transactional_fixtures
  setup_shared_connection_pool

  @fixture_connection_pools = ActiveRecord::Base.connection_handler.connection_pool_list(:writing)
  @fixture_connection_pools.each do |pool|
    pool.pin_connection!(lock_threads)
    pool.lease_connection
  end
  ...
end
```

trails parity confirmed:

- `ActiveRecord::Base.connection_handler` → trails `Base.connectionHandler`
- `connection_pool_list(:writing)` → trails
  `ConnectionHandler#connectionPoolList(role)` at
  `connection-adapters/abstract/connection-handler.ts:60`. Test
  coverage at `connection-handlers-multi-db.test.ts:202` confirms
  role filtering works.
- `pool.pin_connection!(lock_threads)` → trails
  `pool.pinConnectionBang(lockThread)` at
  `connection-adapters/abstract/connection-pool.ts:499`
- `pool.lease_connection` → trails pool lease API (already present;
  invoked internally by `pinConnectionBang` when no leased
  connection exists)

Phase B implementation:

1. `createTestAdapter()` constructs a `PoolConfig` from the env-URL-
   derived `dbConfig`
2. Registers it with a fresh `ConnectionHandler` (or reuses a shared
   handler per worker — TBD in Phase A)
3. Calls `handler.connectionPoolList("writing")` to get the writing
   pool(s)
4. For each pool, calls `pinConnectionBang(lockThread)` (default
   `lockThread = false` matches Rails' default)
5. The pinned pool's leased connection IS the test's adapter

This is byte-for-byte Rails parity at the wiring level. The
singleton bypass that exists today (`_sharedAdapter`) literally
short-circuits this entire chain.

## Cross-references

- [`tm-unification-plan.md`](tm-unification-plan.md) — Phase 9b + post-
  Phase-9 cleanup paths 1/2. The TX-visibility patch this epic
  retires is documented there.
- [`fixtures-port-plan.md`](fixtures-port-plan.md) — the parallel
  effort that moves schema and fixture data out of per-test setup
  into a canonical loader. See "Interaction with the fixtures port"
  above for sequencing and seam analysis.
- `vendor/rails/activerecord/lib/active_record/test_fixtures.rb` — the
  reference implementation. Key lines:
  - 108 `run_in_transaction?`
  - 125 `setup_fixtures` (`pin_connection!` call site)
  - 178 `pool.pin_connection!(lock_threads)`
  - 205 `unpin_connection!`
  - 220 `setup_shared_connection_pool`
- `vendor/rails/activerecord/lib/active_record/connection_adapters/connection_pool.rb`
  — `pin_connection!` / `unpin_connection!` implementation
