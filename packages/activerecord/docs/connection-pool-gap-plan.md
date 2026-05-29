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

| Cluster                                | Tests | Status                                                                       |
| -------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| Adapter retry/reconnect lifecycle      | 18    | ✓ P1/P2/P3 (#2542/#2539/#2553) shipped; `allowRetry` adapter wiring deferred |
| Database config resolution             | 20    | ✓ P4/P5 (#2529/#2554) shipped; env-var + scheme-less URI follow-ups          |
| DatabaseSelector middleware            | 16    | ✓ P11 #2548 shipped (test infra delivered)                                   |
| Query cache (per-context broadcast)    | 14    | ✓ P12 #2534 shipped; minor guard/alias follow-ups                            |
| Pool lifecycle (checkout/checkin/reap) | 12    | ✓ P6/P7 (#2535/#2561) shipped                                                |
| ConnectionManagement middleware        | 11    | **OPEN** — entire class missing (P10)                                        |
| ConnectionHandler multi-DB             | 11    | ✓ P8 #2530 shipped; re-audit residual handler skips                          |
| Multi-DB switching                     | 11    | ✓ P9 #2547 shipped (`connectedTo` nested role+shard stack)                   |
| Connection swapping nested             | 7     | ✓ P9 #2547 shipped                                                           |
| Adapter leasing                        | 4     | ✓ P14 #2570 shipped (test harness delivered)                                 |
| Standalone connection                  | 4     | **BLOCKED** — class missing (P13; needs Rails source refresh)                |
| Pooled connections                     | 3     | ✓ P7 #2561 shipped                                                           |

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
#2539, #2542, #2547, and #2553, #2554, #2561, #2570).

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

**From #2553 (P3 retryable query classification):** 4 confirmed bugs surfaced by Copilot review #2 (not fixed before merge):

- [ ] ~15 LOC: visitor collector reset in `relation.ts toArray()`. `allowRetry` is read from `v.collector.retryable` after `_toSql()`, but `_toSqlWithoutSetOp` can call `sv.compile(raw)` a second time for `from(ArelNode)` paths. Fix: capture retryable inside `_compileSelectSql` via private `_lastSelectRetryable`, read in `toArray()`.
- [ ] ~3 LOC: `findBySql` null-opts crash — `findBySql(sql, binds, undefined, block)` causes `resolvedOpts.allowRetry` to throw. Fix: `typeof opts === 'function' ? {} : (opts ?? {})`.
- [ ] ~10 LOC: `StatementCache.create()` never sets `retryable` on Query/PartialQuery. In `cacheableQuery` (database-statements.ts) extract `collector.retryable` after compilation, pass as `retryable:` to `StatementCache.query()`/`partialQuery()`.
- [ ] ~5 LOC: widen `execQuery(options?)` type to `{prepare?: boolean; allowRetry?: boolean}` in `adapter.ts` + `abstract-adapter.ts`.
- Deferred (connection-pool track): wire `allowRetry` through `execute` → `withRawConnection` in real adapters (sqlite3, mysql2, pg) — needs pool integration. `QueryCacheAdapter.selectAll` from `query-cache.ts` needs separate assessment.

**From #2554 (P5 protocolAdapterMapping):**

- [ ] ~30-60 LOC: unskip `resolver with database uri containing only database name`. Rails' URI parser turns a bare scheme-less `"foo"` into `{ database: "foo" }`, overriding config's database. Our `buildUrlHash` passes scheme-less strings through as `{ url }` to preserve SQLite `:memory:`/bare-path behavior. Needs dedicated reconcile in `connection-url-resolver.ts` / `url-config.ts buildUrlHash`.
- [ ] ~50-100 LOC: unskip `separate database env vars`. Requires per-name env var resolution (`PRIMARY_DATABASE_URL` / `ANIMALS_DATABASE_URL`) in `database-configurations.ts`.

**From #2561 (P7 pool checkout/checkin):**

- [ ] ~40 LOC: implement generic `:checkout`/`:checkin` callback registry on the adapter (only if a future feature needs custom callbacks).
- [ ] ~15 LOC: align pinned-connection checkout branch with Rails — unconditional `verify!`, drop `checkoutAndVerify`/cache call on pinned. Bundle into future pool PR.

**From #2570 (P14+P15 bundle):**

- **P13 (StandaloneConnection) NOT shipped — needs Rails source refresh first.** Vendored Rails `connection_adapters/abstract/connection_pool.rb` has no `StandaloneConnection` class; vendored `standalone_connection_test.rb` references a newer Rails. `connection-adapters/standalone-connection.test.ts` remains skipped (4 tests).
- [ ] When Rails source is refreshed: ~40 LOC + unskip 4 tests — implement `StandaloneConnection` as pool stand-in whose `checkin`/`remove` disconnect the wrapped connection.
- `_inUse` vs Rails `@owner` divergence — `_owner` is vestigial. If trails ever adopts real execution-context ownership tracking, `lease`/`expire`/`stealBang` should be revisited.
- `ConnectionPool#clearReloadableConnections` surfaced a double-lease bug fixed by expiring released survivors — worth glancing at other reap/flush paths that re-add to `_available` without expiring first.
