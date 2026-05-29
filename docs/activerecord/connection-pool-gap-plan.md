# Connection-pool gap plan

Open work in the connection-pool layer: **P13** (StandaloneConnection, blocked
on a Rails source refresh). Residual edge cases from the already-built clusters
are tracked under **Post-merge follow-ups** below. (P10 ConnectionManagement
middleware shipped in #2653.)

---

## Remaining open clusters

| Cluster               | Tests | Status                                                        |
| --------------------- | ----- | ------------------------------------------------------------- |
| Standalone connection | 4     | **BLOCKED** — class missing (P13; needs Rails source refresh) |

Residual edge cases from the other clusters are tracked under **Post-merge
follow-ups** below. `adapter.test.ts` also carries 22 fixture-blocked, 10
transaction-blocked, and 8 schema-blocked tests — those belong to their
respective plans, not this one.

---

## Track 7: Small standalone classes (unlocks ~8 tests)

### PR P13: `StandaloneConnection` class

**Problem:** Class doesn't exist. Rails' `StandaloneConnection` wraps a
raw connection without pool checkout — `throwAway!` disconnects without
checkin, `close` returns to pool.

**Files:**

- Create `connection-adapters/standalone-connection.ts`

**Rails ref:** A newer Rails' `connection_adapters/abstract/connection_pool.rb`
`StandaloneConnection` inner class (plus its `standalone_connection_test.rb`).
NOT present in the currently vendored Rails — confirm against `vendor/rails`
after the refresh.

**Note:** deferred — the vendored Rails snapshot has no `StandaloneConnection`
class yet, and the vendored `standalone_connection_test.rb` references a newer
Rails (see post-merge follow-ups from #2570). Needs a Rails source refresh
before implementation.

**Est:** ~40 LOC

---

## Dependency graph

Remaining:

```
P13 (StandaloneConnection — blocked on Rails source refresh)
```

## Recommended priority (remaining)

### Blocked

| PR  | Tests | Est LOC | Why                                                    |
| --- | ----- | ------- | ------------------------------------------------------ |
| P13 | 4     | ~40     | StandaloneConnection — blocked on Rails source refresh |

## Post-merge follow-ups

Forward-looking items needing follow-up work, grouped into PR-sized work units.

### Actionable PR queue

Open `[ ]` items bundled into ≤300-LOC work units, ordered by readiness.
Detail/rationale in the per-PR sections below.

**Ready now:**

- **PF5 — connection-handler skip re-audit** (triage, then sized). Re-check the
  11 still-skipped `connection-handler.test.ts` tests now that nested
  `connectedTo` switching is in place — some may already unblock; the rest split
  by blocker (process-fork = permanent, schema-cache = not-yet-impl). Files:
  `connection-handler.test.ts`. Source: #2530, #2547.

**Round-4 follow-ups (named, PR-sized):**

### follow-up: PG reconnect! loop inheritance + raw-connection initialize (~60–100 LOC)

Files: `connection-adapters/postgresql-adapter.ts`,
`connection-adapters/abstract-adapter.ts`. Source: #2646. The base
`reconnectBang` retry loop (connection_retries / retry_deadline / backoff) +
raw-connection ownership shipped in #2646; MySQL2 inherits it via a raw
`reconnect()` override. **PostgreSQL still keeps its own `reconnectBang`
override** (zero behavior change) and does NOT yet get the retry loop, blocked
on two things: (a) `PostgreSQLAdapter#configureConnection(client)` takes an
explicit client while the base lifecycle calls `configureConnection()` argless —
needs a configure-with-no-client-tolerant (lazy-configure-on-next-acquire) path;
(b) `PostgreSQLAdapter#reconnect()` calls `this.resetTransaction()` itself (a
trails-ism — Rails' private PG `reconnect` does NOT reset the tx), which would
clobber the base lifecycle's restore-aware `resetTransaction`. Move the tx reset
out of `reconnect()` and audit its direct callers
(`_doAcquire`/exec error paths/`verifyBang`) first.

### follow-up: deprecated raw-connection initialize overload (~larger)

Source: #2646. Port the deprecated raw-connection `initialize` overload
(`abstract_adapter.rb:141`) that stashes a pre-opened connection in
`@unconfigured_connection` — the only production writer of
`_unconfiguredConnection`; until it lands the `verifyBang` fast-path is
test-only. Trails' base constructor takes no config argument and config flows in
separately, so this is a constructor restructure across PG/MySQL2. Also gates
the skipped `AdapterConnectionTest` integration tests (additionally gated on a
non-`:memory:` adapter with raw-connection reopen — Rails gates the suite
`unless in_memory_db?`).

**Gated / deferred (external blocker or design decision):**

- **Adapter `allowRetry` forwarding** (~15–25 LOC; gated on pool track) —
  concrete `execQuery` overrides (`mysql2`/`postgresql`) must accept + forward
  `allowRetry` once `execute → withRawConnection` threads it. Source: #2601.
- **`cachedFindBy` StatementCache reconcile** (~30–50 LOC; gated on porting
  `cachedFindBy` off its current `findBy` bypass). Source: #2601.
- **Env-resolution unify** (~20–40 LOC, low priority) — `fromEnv()` `currentEnv`
  vs `forCurrentEnv` `defaultEnv` can disagree when `TRAILS_ENV != defaultEnv`.
  Source: #2603.
- **Per-class callback registry** (~15 LOC; only if a concrete adapter ever
  registers its own checkout/checkin callback). Source: #2610.
- **P13 StandaloneConnection** (~40 LOC + 4 tests; blocked on a Rails source
  refresh — the class isn't in the vendored snapshot). Source: #2570.
- **Reap/flush expire audit** — glance at other paths that re-add to
  `_available` without expiring first (the same shape that caused a double-lease
  in `clearReloadableConnections`). Source: #2570.

**From #2539 (P2 lifecycle):**

- Pre-existing: `SQLite3Adapter` does not override `reconnectBang()` (Rails'
  SQLite3Adapter defines a private `reconnect` that close+reopens the driver) —
  base `reconnectBang` only runs the lifecycle, so sqlite "reconnect" is
  incomplete. Follow-up only if sqlite reconnect fidelity is needed. (The
  materialized/unmaterialized integration tests stay skipped — see the _PG
  reconnect! loop inheritance_ / _raw-connection initialize overload_ follow-ups
  above.) Source: #2539, #2646.

**From #2653 (PF3 ConnectionManagement middleware):**

- 2 tests kept skipped, both blocked on un-ported infra: "connections are
  cleared even if inside a non-joinable transaction" needs
  `pinConnectionBang`/`unpinConnectionBang` (Phase 6 pin_connection blocker);
  "cancel asynchronous queries if an exception is raised" needs async queries
  (`select_all async:`) / FutureResult in the abstract adapter.
- Deviation: vendored Rails no longer has a standalone `ConnectionManagement`
  class (replaced by executor hooks + the `clear_active_connections`
  initializer). #2653 reconstructed the historical class + `BodyProxy` shape
  because PF3 mandated it and the test names map to it — so `connection-management.ts`
  has NO Rails counterpart in api:compare. When an `Executor` is eventually
  ported, the middleware's clear step could delegate to `ExecutorHooks.complete()`
  and drop the ~6 lines of duplicated release-unless-open-joinable-txn rule.

**From #2654 (PF2 query-cache guard move):**

- [ ] ~10–20 LOC (low priority): remove the block-form `enableQueryCache`
      `_queryCacheMaxSize === null` early-return for full `enable_query_cache`
      fidelity; resolve the maxSize-0-vs-nil modeling difference at the same time
      (trails maps config-false to Store maxSize 0; Rails maps to nil/unbounded
      and gates via `QueryCache.run`, but `Base.cache {}` bypasses that gate).
- [ ] ~5 LOC (when global handler iteration is wired): add a zero-arg `run()`
      overload iterating `connection_handler.each_connection_pool` to fully
      mirror Rails' arg-less `QueryCache.run`.
- [ ] ~10 LOC (when pool-based executor wiring lands): extend `complete()` to
      accept pool targets symmetrically with `run()` (currently only handles the
      adapter path).

**From #2640 (bootstrap PR 0 — establishConnection installs Arel visitor):**

- Cross-test behavior change: `test-setup.ts` (deleted) used to reset the global
  Arel visitor after every test in both the `activerecord` and `other` vitest
  projects. A dialect visitor set by one test now persists. If any arel/other
  test starts failing with unexpected dialect SQL, `installAdapterVisitor`
  (`connection-handling.ts`) and its eager-checkout / error-swallowing boundary
  are the first place to look. (Wider bootstrap→DatabaseTasks sequencing lives
  in `docs/activerecord/bootstrap-to-databasetasks-plan.md`, not this doc.)

**From #2636 (SqliteDriver.restoreFromPath backup primitive):**

- Test-infra spike, no connection-pool behavior change. Key finding already in
  memory (`project_better_sqlite3_no_uri_shared_cache`): better-sqlite3 does NOT
  set `SQLITE_OPEN_URI`, so `file:…?mode=memory&cache=shared` opens as a literal
  on-disk file. Sized follow-ups: ~30 LOC enable `SQLITE_OPEN_URI` in the
  better-sqlite3 open path (if the binding allows) to make shared-cache
  `:memory:` genuinely in-memory; ~10 LOC gitignore/clean the stray
  `file:…?mode=memory&cache=shared` artifacts the current fallback leaves in cwd;
  node:sqlite `restoreFromPath` is implemented but UNVERIFIED (needs a Node 22.5+
  CI lane).

**From #2529 (P4 URL coercion):**

- Deviation: `replica?` returns `false` instead of Rails' `nil` when the key is absent. Pre-existing.
- [ ] 7 skipped tests in `merge-and-resolve-default-url-config.test.ts` unblock when ConnectionHandler is fully ported (covers P9 scope).

**From #2534 (P12 query cache):**

- [ ] decide whether to port "cache is available when using a not connected connection" (not present in the ported suite). Note: there is no `test/unported-files.ts` — unported notes are inline `it.skip` in `query-cache.test.ts`, where "query cache with forked processes" already lives.

**From #2542 (P1 unit-test unskip):**

- 9 `AdapterConnectionTest` tests stay skipped pending `remote_disconnect` (server-level connection kill) — permanent unless the integration harness gains that capability.

**From #2530 (P8 establishConnection):**

- Re-audit the 11 still-skipped `connection-handler.test.ts` tests: split by blocker — `connects_to` (now available), process forking (permanent skips), schema cache (not yet implemented).

**From #2553 (P3 retryable query classification):**

- [ ] ~15-25 LOC (gated on connection-pool track): concrete adapter `execQuery` overrides (`mysql2-adapter.ts`, `postgresql-adapter.ts`) + their per-adapter `database-statements.ts` interface decls still type options as `{prepare?: boolean}` only — they don't accept/forward `allowRetry`. The abstract interface + default impl carry `{prepare?; allowRetry?}` but the default `execQuery` captures `allowRetry` and ignores it (`void options`, `database-statements.ts:1433-1435`) pending pool integration. When the pool track wires `allowRetry` through `execute → withRawConnection`, widen these concrete signatures AND read the flag.
- [ ] ~30-50 LOC (gated on `cachedFindBy` port): `cachedFindBy` (`core.ts:626`) currently bypasses `StatementCache` (reroutes to `findBy`). When ported to actually use `StatementCache.execute`, reconcile with Rails — keep the `Query.retryable` design or switch to caller-passes-`allowRetry` like Rails' `cached_find_by`.
- Architecture note: trails compiles the FROM clause separately from SELECT (string-replace), unlike Rails' single-collector compile. A `_lastSelectRetryable` + fold-in in `_toSqlWithoutSetOp` works around it; if the SQL builder is ever refactored to one visitor pass, that fold-in becomes unnecessary.

**From #2554 (P5 protocolAdapterMapping):**

- [ ] ~20-40 LOC (pre-existing, low priority): `fromEnv()` passes `currentEnv = TRAILS_ENV ?? NODE_ENV ?? defaultEnv` into `_buildConfigs`, but `DatabaseConfig#forCurrentEnv` resolves via `DatabaseConfigurations.defaultEnv`. If `TRAILS_ENV` differs from `defaultEnv`, the build-time guard and `forCurrentEnv` can disagree. No test exercises the mismatch; unify env resolution only if it bites.
- Deviation: the bare-name carve-out is narrower than Rails' `URI::RFC2396_Parser` (which treats ANY scheme-less path as the DB name). Revisit only if a real config surfaces a bare DB name containing a dot.

**From #2561 (P7 pool checkout/checkin):**

- [ ] ~15 LOC (only if ever needed): per-class clone-on-write for the callback registry — currently a single shared static on `AbstractAdapter`, which exactly matches Rails (all checkout/checkin callbacks live on AbstractAdapter). Only needed if a concrete adapter ever registers its own.
- Deviation (low risk): the sync `checkout()` pinned branch fire-and-forgets `verifyBang()` (trails' `verifyBang` is async, Rails' `verify!` is sync). Safe today — pinned connections are verified eagerly at pin time and `verifyBang` short-circuits when active; only an edge-case reconnect failure could yield an unhandled rejection.

**From #2570 (P14+P15 bundle):**

- [ ] **P13 (StandaloneConnection)** — blocked on a Rails source refresh: vendored Rails `connection_adapters/abstract/connection_pool.rb` has no `StandaloneConnection` class and the vendored `standalone_connection_test.rb` references a newer Rails. Once refreshed: ~40 LOC + unskip 4 tests — implement `StandaloneConnection` as a pool stand-in whose `checkin`/`remove` disconnect the wrapped connection. (`connection-adapters/standalone-connection.test.ts` currently skipped, 4 tests.)
- `_inUse` vs Rails `@owner` divergence — `_owner` is vestigial. If trails ever adopts real execution-context ownership tracking, `lease`/`expire`/`stealBang` should be revisited.
- Reap/flush expire audit — glance at other paths that re-add to `_available` without expiring first (the `clearReloadableConnections` path needed released survivors expired to avoid a double-lease).
