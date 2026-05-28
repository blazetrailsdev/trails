# Connection-pool gap plan

162 skipped tests across 23 files. This layer is more fragmented than
associations or relation — the skips span pool lifecycle, multi-DB
switching, middleware, config parsing, adapter retry/reconnect, and query
cache. Many files are entirely stub test suites (every test skipped).

---

## Summary by cluster

| Cluster                                | Tests | Status                                                   |
| -------------------------------------- | ----- | -------------------------------------------------------- |
| Adapter retry/reconnect lifecycle      | 18    | `withRawConnection`, `verify!`, `clean!`, `active?` gaps |
| Database config resolution             | 20    | URL coercion, env-var `DATABASE_URL`, edge cases         |
| DatabaseSelector middleware            | 16    | Source exists; test infra missing                        |
| Query cache (per-context broadcast)    | 14    | `enableQueryCacheBang` broadcast + AsyncLocalStorage     |
| Pool lifecycle (checkout/checkin/reap) | 12    | `removeConnectionForThread`, schema-cache on checkout    |
| ConnectionManagement middleware        | 11    | Entire class missing                                     |
| ConnectionHandler multi-DB             | 11    | Role validation, handler clearing edge cases             |
| Multi-DB switching                     | 11    | `connectedTo` nested role+shard stack                    |
| Connection swapping nested             | 7     | Nested switch verification                               |
| Adapter leasing                        | 4     | Test harness gap (impl exists)                           |
| Standalone connection                  | 4     | Entire class missing                                     |
| Pooled connections                     | 3     | Checkout/checkin semantics                               |

**Not counted here** (attributed to other blockers in same files):
adapter.test.ts also has 22 fixture-blocked, 10 transaction-blocked,
8 schema-blocked tests — those belong to their respective plans.

---

## Track 1: Adapter retry & reconnect (unlocks ~18 tests)

### PR P3: Retryable query classification

**Problem:** `find`/`findBy` with known attrs should be marked retryable
on `ConnectionFailed`. Raw-SQL `where`/`select`/`findBy` and Arel
`NamedFunction` in WHERE must NOT be marked retryable.

**Files:**

- `relation/finder-methods.ts` — retryable flag on find/findBy
- `relation/query-methods.ts` — non-retryable flag on raw SQL paths

**Rails ref:** `finder_methods.rb`, `query_methods.rb` — `allow_retry`
propagation

**Depends on:** PR P1 (retry knob must exist first)

**Est:** ~60 LOC

---

## Track 2: Database config resolution (unlocks ~20 tests)

### PR P5: `protocolAdapterMapping` setter + merge-and-resolve edge cases

**Problem:** `protocolAdapterMapping` is read-only; Rails allows
`ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver.protocol_adapter_mapping = { ... }`
for custom protocols. Merge-and-resolve config tests (7 tests) hit edge
cases in config merging when both `url:` and inline keys are present.

**Files:**

- `database-configurations/connection-url-resolver.ts` — add setter
- `database-configurations.ts` — merge logic

**Rails ref:** `connection_url_resolver.rb` `protocol_adapter_mapping=`

**Est:** ~60 LOC

---

## Track 3: Pool lifecycle (unlocks ~15 tests)

### PR P7: Pooled connection checkout/checkin semantics

**Problem:** 3 tests in `pooled-connections.test.ts` — pool checkout
exhaustion (`checkout_timeout`), checkin re-use, and verify-on-checkout
are incomplete.

**Files:**

- `connection-adapters/abstract/connection-pool.ts` — `checkout`, `checkin`

**Rails ref:** `connection_pool.rb` `checkout`, `checkin`

**Depends on:** PR P6

**Est:** ~80 LOC

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

### PR P11: DatabaseSelector test infrastructure

**Problem:** `DatabaseSelector` source exists (~230 LOC across middleware
files) and appears substantially complete. All 16 tests are skipped with
generic BLOCKED comments — the blocker is test infrastructure: no mock
session/resolver setup, no request/response cycle simulation.

**Files:**

- `database-selector.test.ts` — write test bodies
- May need lightweight request/response mock

**Depends on:** PR P8 (multi-DB handler must work for role switching)

**Est:** ~200 LOC (test bodies only)

---

## Track 7: Small standalone classes (unlocks ~8 tests)

### PR P13: `StandaloneConnection` class

**Problem:** Class doesn't exist. Rails' `StandaloneConnection` wraps a
raw connection without pool checkout — `throwAway!` disconnects without
checkin, `close` returns to pool.

**Files:**

- Create `connection-adapters/standalone-connection.ts`

**Rails ref:** `connection_adapters/abstract/connection_pool.rb`
`StandaloneConnection` inner class

**Est:** ~40 LOC

---

### PR P14: Adapter leasing test harness

**Problem:** `lease`/`expire`/`inUse`/`close` are implemented in
`abstract-adapter.ts`. The 4 tests are skipped because the test file
lacks a proper pool+handler setup to exercise leasing through the pool.

**Files:**

- `connection-adapters/adapter-leasing.test.ts` — write test bodies

**Est:** ~60 LOC (test bodies only)

---

### PR P15: `preparedStatements` global toggle

**Problem:** No `ActiveRecord.disablePreparedStatements` global toggle
to override per-config `prepared_statements: true` on
`(re-)establishConnection`.

**Files:**

- `connection-adapters/abstract-adapter.ts` — `preparedStatements`
  getter/setter
- `connection-handling.ts` — `establishConnection` reads global toggle

**Rails ref:** `abstract_adapter.rb` `prepared_statements`,
`connection_handling.rb`

**Est:** ~30 LOC

---

## Dependency graph

P1, P2, P4, P6, P8, P9, P12 shipped. Remaining:

```
P6 ✓ → P7 (pooled connections needs lifecycle)
P8 ✓ → P11 (DatabaseSelector tests need handler)
P1 ✓ → P3 (retry classification needs retry knob)

P5, P10, P13, P14, P15 — all standalone
```

## Recommended priority (remaining)

### Unblocked (Tier 1/2 dependencies satisfied)

| PR  | Tests | Est LOC | Why next                                                            |
| --- | ----- | ------- | ------------------------------------------------------------------- |
| P10 | 11    | ~60     | ConnectionManagement middleware — #2531 closed; needs fresh attempt |
| P3  | 6     | ~60     | Retryable query classification (P1 ✓)                               |
| P5  | 7     | ~60     | Config edge cases — adjacent to former P4 area                      |
| P7  | 3     | ~80     | Pooled connection checkout/checkin (P6 ✓)                           |

### Standalone / lower leverage

| PR  | Tests | Est LOC | Why                                                        |
| --- | ----- | ------- | ---------------------------------------------------------- |
| P11 | 16    | ~200    | DatabaseSelector test bodies — high LOC, tests only (P8 ✓) |
| P13 | 4     | ~40     | StandaloneConnection — small, clean scope                  |
| P14 | 4     | ~60     | Adapter leasing test bodies                                |
| P15 | 2     | ~30     | Prepared statements toggle — smallest PR                   |

### Recommended parallel lanes (post-shipped)

- **Lane A:** P11 (DatabaseSelector — handler ready via P8/P9)
- **Lane B:** P3 (retryable classification)
- **Lane C:** P5 (config edge cases)
- **Lane D:** P10 (middleware — re-attempt after #2531 close)
- **Lane E:** P7 (pooled connections)

## Post-merge follow-ups

Items surfaced after the shipped batch (#2529, #2530, #2532, #2534, #2535, #2539, #2542, #2547).

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
