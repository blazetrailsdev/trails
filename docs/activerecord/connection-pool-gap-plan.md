# Connection-pool gap plan

162 skipped tests across 23 files. This layer is more fragmented than
associations or relation — the skips span pool lifecycle, multi-DB
switching, middleware, config parsing, adapter retry/reconnect, and query
cache. Many files are entirely stub test suites (every test skipped).

---

## Summary by cluster

This table is the original pre-cleanup landscape. Clusters whose PRs have
since shipped are marked ✓ — their residual edge cases (if any) are tracked
in **Post-merge follow-ups** below. Only **ConnectionManagement middleware**
(P10) and **Standalone connection** (P13) remain open.

| Cluster                                | Tests | Status                                                                           |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------- |
| Adapter retry/reconnect lifecycle      | 18    | ✓ P1/P2/P3 (#2542/#2539/#2553) shipped; `allowRetry` adapter wiring deferred     |
| Database config resolution             | 20    | ✓ P4/P5 (#2529/#2554) shipped; env-var + bare-name URI follow-ups closed (#2603) |
| DatabaseSelector middleware            | 16    | ✓ P11 #2548 shipped (test infra delivered)                                       |
| Query cache (per-context broadcast)    | 14    | ✓ P12 #2534 shipped; minor guard/alias follow-ups                                |
| Pool lifecycle (checkout/checkin/reap) | 12    | ✓ P6/P7 (#2535/#2561) shipped                                                    |
| ConnectionManagement middleware        | 11    | **OPEN** — entire class missing (P10)                                            |
| ConnectionHandler multi-DB             | 11    | ✓ P8 #2530 shipped; re-audit residual handler skips                              |
| Multi-DB switching                     | 11    | ✓ P9 #2547 shipped (`connectedTo` nested role+shard stack)                       |
| Connection swapping nested             | 7     | ✓ P9 #2547 shipped                                                               |
| Adapter leasing                        | 4     | ✓ P14 #2570 shipped (test harness delivered)                                     |
| Standalone connection                  | 4     | **BLOCKED** — class missing (P13; needs Rails source refresh)                    |
| Pooled connections                     | 3     | ✓ P7 #2561 shipped                                                               |

**Not counted here** (attributed to other blockers in same files):
adapter.test.ts also has 22 fixture-blocked, 10 transaction-blocked,
8 schema-blocked tests — those belong to their respective plans.

---

## Track 5: Middleware (unlocks ~27 tests)

### PR P10: `ConnectionManagement` middleware

**Problem:** Entire class missing. Rails' `ConnectionManagement` calls
`ActiveRecord::Base.connection_handler.clear_active_connections!` after
each request to return connections to the pool.

**Files:**

- Create `connection-management.ts`

**Rails ref:** `middleware/database_manager.rb`,
`connection_adapters/abstract/connection_handler.rb` `clear_active_connections!`

**Est:** ~60 LOC

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

P1, P2, P3, P4, P5, P6, P7, P8, P9, P11, P12, P14, P15 shipped. Remaining:

```
P10 (ConnectionManagement middleware — standalone)
P13 (StandaloneConnection — blocked on Rails source refresh)
```

## Recommended priority (remaining)

### Unblocked

| PR  | Tests | Est LOC | Why next                                                            |
| --- | ----- | ------- | ------------------------------------------------------------------- |
| P10 | 11    | ~60     | ConnectionManagement middleware — #2531 closed; needs fresh attempt |

### Blocked

| PR  | Tests | Est LOC | Why                                                    |
| --- | ----- | ------- | ------------------------------------------------------ |
| P13 | 4     | ~40     | StandaloneConnection — blocked on Rails source refresh |

### Recommended parallel lanes (post-shipped)

- **Lane D:** P10 (middleware — re-attempt after #2531 close)

## Post-merge follow-ups

Items surfaced after the shipped batches (#2529, #2530, #2532, #2534, #2535,
#2539, #2542, #2547, #2553, #2554, #2561, #2570; follow-up PRs #2601, #2603, #2610).

### Actionable PR queue

Open `[ ]` items bundled into ≤300-LOC work units, ordered by readiness.
Detail/rationale in the per-PR sections below.

**Ready now:**

- **PF1 — reconnect/verify lifecycle bundle** (~54 LOC). Add
  `enableLazyTransactionsBang()` + `resetTransaction(restore:)` +
  `attemptConfigureConnection()` to `reconnectBang()`; add the
  `_unconfiguredConnection` fast-path to `verifyBang()`; add failure cleanup
  (`_lastActivity = 0`, `_verified = false`) in `reconnectBang()`'s catch.
  Files: abstract adapter (`reconnectBang`/`verifyBang`). Unblocks the
  materialized/unmaterialized tx-restoration tests + "disconnect and recover on
  #configure_connection failure". Source: #2539.
- **PF2 — query-cache config polish** (~35 LOC). Move the guard from
  `enableQueryCacheBang` to `QueryCache.run`; add the `"unlimited"` string alias
  in `DatabaseConfigOptions["queryCache"]` (→ `max_size: null`); add the two
  forked-process / not-connected cache tests to `unported-files.ts`. Files:
  query-cache + `database-configurations.ts` + `unported-files.ts`. Source:
  #2534.
- **PF3 — P10 ConnectionManagement middleware** (~60 LOC). Create
  `connection-management.ts` (Rails clears active connections after each
  request). Open track; #2531 closed, needs a fresh attempt. Unblocks ~11
  tests. Source: Track 5 / P10.
- **PF4 — P4 opaque-URI merge order** (~15 LOC). Split
  `ConnectionUrlResolver#toHash()` so structural fields win for opaque URIs.
  Files: `connection-url-resolver.ts`. Source: #2529.
- **PF5 — connection-handler skip re-audit** (triage, then sized). Re-check the
  11 still-skipped `connection-handler.test.ts` tests now that P9 (nested
  `connectedTo`) shipped — some may already unblock; the rest split by blocker
  (process-fork = permanent, schema-cache = not-yet-impl). Files:
  `connection-handler.test.ts`. Source: #2530, #2547.

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
  `_available` without expiring first (a double-lease bug was fixed in
  `clearReloadableConnections`). Source: #2570.

**From #2539 (P2 lifecycle):**

- [ ] ~30 LOC: add `enableLazyTransactionsBang()` + `resetTransaction(restore:)` + `attemptConfigureConnection()` to `reconnectBang()` — unblocks the materialized/unmaterialized transaction-restoration tests still skipped.
- [ ] ~20 LOC: add `_unconfiguredConnection` fast-path to `verifyBang()` — unblocks "disconnect and recover on #configure_connection failure".
- [ ] ~4 LOC: failure cleanup in `reconnectBang()` (`_lastActivity = 0`, `_verified = false` in catch) — guards against concrete-adapter overrides that `super` then throw.

**From #2529 (P4 URL coercion):**

- [ ] ~15 LOC: opaque-URI merge order — split `ConnectionUrlResolver#toHash()` so structural fields win for opaque URIs (matches Rails exactly).
- Deviation: `replica?` returns `false` instead of Rails' `nil` when the key is absent. Pre-existing.
- [ ] 7 skipped tests in `merge-and-resolve-default-url-config.test.ts` unblock when ConnectionHandler is fully ported (covers P9 scope).

**From #2534 (P12 query cache):**

- [ ] ~20 LOC: move guard from `enableQueryCacheBang` to `QueryCache.run`; requires `run()` to accept pools or a discriminated union. Low priority.
- [ ] ~10 LOC: add `"unlimited"` string alias in `DatabaseConfigOptions["queryCache"]` mapping to `max_size: null`; update `normalizeQueryCacheConfig` and assertions.
- [ ] ~5 LOC: add "query cache with forked processes" + "cache is available when using a not connected connection" to `unported-files.ts` skip list.

**From #2542 (P1 unit-test unskip):**

- No loose ends. 9 `AdapterConnectionTest` tests stay skipped pending `remote_disconnect` (server-level connection kill) — permanent unless integration harness gains that capability.

**From #2535 (P6 pool lifecycle):**

- No loose ends or deviations.

**From #2530 (P8 establishConnection):**

- The 11 pre-existing skipped tests in `connection-handler.test.ts` remained blocked on `connects_to` (now closed by P9), process forking (permanent skips), and schema cache (not yet implemented). Re-audit since P9 shipped.

**From #2547 (P9 nested `connectedTo`):**

- All 7 `ConnectionSwappingNestedTest` cases un-skipped (granular role/shard, combined, `connectedToMany`, `preventWrites` granularity, `ApplicationRecord` preventWrites, class-reload). No regressions in shard-keys/connection-pool/handler suites.
- Follow-up: re-check the 11 still-skipped `connection-handler.test.ts` tests now that nested switching is in place — some may already unblock.

**From #2553 (P3 retryable query classification):** all 4 confirmed bugs from Copilot review #2 fixed in **#2601** — visitor collector reset (`_lastSelectRetryable` capture + FROM fold-in), `findBySql` null-opts crash, `StatementCache` retryable on Query/PartialQuery, widened `execQuery` type. Remaining:

- [ ] ~15-25 LOC (gated on connection-pool track): concrete adapter `execQuery` overrides (`mysql2-adapter.ts`, `postgresql-adapter.ts`) + their per-adapter `database-statements.ts` interface decls still type options as `{prepare?: boolean}` only — they don't accept/forward `allowRetry`. The abstract interface + default impl carry `{prepare?; allowRetry?}` but the default `execQuery` captures `allowRetry` and ignores it (`void options`, `database-statements.ts:1433-1435`) pending pool integration. When the pool track wires `allowRetry` through `execute → withRawConnection`, widen these concrete signatures AND read the flag.
- [ ] ~30-50 LOC (gated on `cachedFindBy` port): `cachedFindBy` (`core.ts:626`) currently bypasses `StatementCache` (reroutes to `findBy`). When ported to actually use `StatementCache.execute`, reconcile with Rails — keep the `Query.retryable` design or switch to caller-passes-`allowRetry` like Rails' `cached_find_by`.
- Architecture note: trails compiles the FROM clause separately from SELECT (string-replace), unlike Rails' single-collector compile. #2601 works around it via `_lastSelectRetryable` + fold-in in `_toSqlWithoutSetOp`; if the SQL builder is ever refactored to one visitor pass, that fold-in becomes unnecessary.

**From #2554 (P5 protocolAdapterMapping):** both follow-ups shipped in **#2603** — `resolver with database uri containing only database name` (bare-name URI → `{ database: <name> }` via a `/^[A-Za-z0-9_-]+$/` carve-out that keeps dots/slashes/`:memory:` on the `{ url }` passthrough) and `separate database env vars` (per-name `PRIMARY_DATABASE_URL`/`ANIMALS_DATABASE_URL` resolution wired into `_buildConfigs`). Remaining:

- [ ] ~20-40 LOC (pre-existing, low priority): `fromEnv()` passes `currentEnv = TRAILS_ENV ?? NODE_ENV ?? defaultEnv` into `_buildConfigs`, but `DatabaseConfig#forCurrentEnv` resolves via `DatabaseConfigurations.defaultEnv`. If `TRAILS_ENV` differs from `defaultEnv`, the build-time guard and `forCurrentEnv` can disagree. No test exercises the mismatch; unify env resolution only if it bites.
- Deviation: the bare-name carve-out is narrower than Rails' `URI::RFC2396_Parser` (which treats ANY scheme-less path as the DB name). Revisit only if a real config surfaces a bare DB name containing a dot.

**From #2561 (P7 pool checkout/checkin):** both follow-ups shipped in **#2610** — generic `:checkout`/`:checkin` callback registry on `AbstractAdapter` (`setCallback`/`_runCallbacks`/`_runCheckoutCallbacks`/`_runCheckinCallbacks`) and pinned-connection checkout aligned with Rails (`verifyBang` awaited on the async path). Remaining:

- [ ] ~15 LOC (only if ever needed): per-class clone-on-write for the callback registry — currently a single shared static on `AbstractAdapter`, which exactly matches Rails (all checkout/checkin callbacks live on AbstractAdapter). Only needed if a concrete adapter ever registers its own.
- Deviation (low risk): the sync `checkout()` pinned branch fire-and-forgets `verifyBang()` (trails' `verifyBang` is async, Rails' `verify!` is sync). Safe today — pinned connections are verified eagerly at pin time and `verifyBang` short-circuits when active; only an edge-case reconnect failure could yield an unhandled rejection.

**From #2570 (P14+P15 bundle):**

- **P13 (StandaloneConnection) NOT shipped — needs Rails source refresh first.** Vendored Rails `connection_adapters/abstract/connection_pool.rb` has no `StandaloneConnection` class; vendored `standalone_connection_test.rb` references a newer Rails. `connection-adapters/standalone-connection.test.ts` remains skipped (4 tests).
- [ ] When Rails source is refreshed: ~40 LOC + unskip 4 tests — implement `StandaloneConnection` as pool stand-in whose `checkin`/`remove` disconnect the wrapped connection.
- `_inUse` vs Rails `@owner` divergence — `_owner` is vestigial. If trails ever adopts real execution-context ownership tracking, `lease`/`expire`/`stealBang` should be revisited.
- `ConnectionPool#clearReloadableConnections` surfaced a double-lease bug fixed by expiring released survivors — worth glancing at other reap/flush paths that re-add to `_available` without expiring first.
