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

### PR P1: `withRawConnection` retry behavior refinement

**Problem:** `withRawConnection` (`abstract-adapter.ts:1541–1601`) already
implements `allowRetry`, `connectionRetries`, `retryDeadline`, reconnect
handling, and retryable-error checks. The skeleton is complete. The skipped
tests cover specific behavioral gaps on top of this:

- Default `allowRetry: false` must surface `ConnectionFailed` (not swallow)
- `retryDeadline` expiration must throw `ConnectionFailed` explicitly
- Idempotent SELECT auto-retry needs integration with `finder-methods.ts`
  marking idempotent queries as `allowRetry: true`
- Non-retryable execute raises `ConnectionFailed`; _next_ idempotent query
  must trigger reconnect (the "reconnect on next use" pattern)

**Files:**

- `connection-adapters/abstract-adapter.ts:1541–1601` — tighten error
  surfacing and deadline expiration behavior
- `relation/finder-methods.ts` — propagate `allowRetry: true` on idempotent finds

**Rails ref:** `abstract_adapter.rb` `with_raw_connection` error handling

**Est:** ~100 LOC

---

### PR P2: `verify!` / `reconnect!` / `active?` / `clean!` lifecycle

**Problem:** Adapter lifecycle methods are partially stubbed:

- `verify!` doesn't reconnect on failure
- `reconnect!` after remote disconnect path incomplete
- `active?` doesn't detect remote disconnection
- `clean!` should skip verify on recently-used connection and surface
  `AdapterError`; `@last_activity` backdating not implemented
- `quoteString` must not trigger verify; subsequent query should reconnect
- `configureConnection` failure recovery via `pool.new_connection` missing

**Files:**

- `connection-adapters/abstract-adapter.ts` — multiple methods

**Rails ref:** `abstract_adapter.rb` `verify!`, `reconnect!`, `active?`,
`clean!`, `configure_connection`

**Est:** ~120 LOC

---

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

### PR P4: URL boolean coercion + env-var `DATABASE_URL`

**Problem:** `DatabaseConfigurations` resolver doesn't coerce URL params
(`"true"` → `true` for 4 boolean keys: `prepared_statements`, `advisory_locks`,
`checkout_timeout`, `schema_cache_path`). `DATABASE_URL` env-var fallback
for unconfigured environments not implemented. SQLite edge-case URL
parsing (relative paths, `?mode=memory`) incomplete.

**Files:**

- `database-configurations/connection-url-resolver.ts` — URL param coercion
- `database-configurations.ts` — env-var `DATABASE_URL` fallback

**Rails ref:** `database_configurations.rb`,
`database_configurations/connection_url_resolver.rb`

**Est:** ~100 LOC

---

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

### PR P6: `removeConnectionForThread` + reap/disconnect

**Problem:** Pool doesn't implement `removeConnectionForThread` (remove a
connection from the thread-local checkout map without returning it to the
pool). Schema-cache and visitor aren't set on checkout. Reaper cycle
doesn't call `flush` on idle connections.

**Files:**

- `connection-adapters/abstract/connection-pool.ts` — `removeConnectionForThread`,
  checkout hook, reaper flush

**Rails ref:** `connection_pool.rb` `remove`, `flush`, `reap`

**Est:** ~100 LOC

---

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

## Track 4: ConnectionHandler + multi-DB (unlocks ~22 tests)

### PR P8: `establishConnection` role validation + handler edge cases

**Problem:** `ConnectionHandler` already implements `removeConnectionPool`
(`connection-handler.ts:185–195`) and wraps raw hash configs into
`HashConfig` in `establishConnection` (lines 88–129). The 11 skipped
tests cover specific edge cases:

- Role name validation on `establishConnection` (reject invalid roles)
- Pool-config-override path when re-establishing with different config
- `connectedTo` multi-DB role lookup failures (role not found → clear error)
- Handler clearing (`clearAllConnections!`, `flushIdleConnections!`) edge cases

**Files:**

- `connection-adapters/abstract/connection-handler.ts:88–129` —
  `establishConnection` role validation branch

**Rails ref:** `connection_handler.rb` `establish_connection` (role validation),
`clear_all_connections!`

**Est:** ~60 LOC

---

### PR P9: `connectedTo` nested role+shard switching

**Problem:** `connectedTo` (from `connection-handling.ts`) doesn't support
nested calls with different role+shard combinations. `preventWrites`
granularity per-role is missing. Class-reload hook for connection swapping
not implemented. 7 connection-swapping-nested tests depend on correct
stack push/pop.

**Files:**

- `connection-handling.ts` — `connectedTo`, `connectedToMany`
- `connection-adapters/abstract/connection-handler.ts` — shard switching

**Rails ref:** `connection_handling.rb` `connected_to`,
`connected_to_many`, `prohibit_shard_swapping`

**Est:** ~150 LOC

**Unlocks:** 11 tests in `multiple-db.test.ts` + 7 in
`connection-swapping-nested.test.ts`

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

## Track 6: Query cache per-context (unlocks ~14 tests)

### PR P12: `enableQueryCacheBang` broadcast + pool init from dbConfig

**Problem:** Two concrete pieces:

1. `ConnectionPool#enableQueryCacheBang()` / `disableQueryCacheBang()`
   broadcast to all checked-out connections — not implemented
2. Pool constructor doesn't read `dbConfig.queryCache` to set initial
   cache state

Also missing: `AsyncLocalStorage`-based per-context cache isolation
(so concurrent requests don't share cache state).

**Files:**

- `connection-adapters/abstract/connection-pool.ts` — add broadcast methods,
  read `dbConfig.queryCache` in constructor
- New or existing async-context integration file

**Rails ref:** `connection_pool.rb` `enable_query_cache!`,
`disable_query_cache!`

**Est:** ~100 LOC

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

```
P1 → P3 (retry classification needs retry knob)
P6 → P7 (pooled connections needs lifecycle)
P8 → P9 (multi-DB switching needs handler basics)
P8 → P11 (DatabaseSelector tests need handler)

P2, P4, P5, P10, P12, P13, P14, P15 — all standalone
```

## Recommended priority

Ordered by: (1) no unsatisfied dependencies, (2) tests unlocked per LOC,
(3) downstream unlock potential.

### Tier 1 — high leverage, no dependencies (start here)

| PR  | Tests | Est LOC | Why first                                                         |
| --- | ----- | ------- | ----------------------------------------------------------------- |
| P4  | 20    | ~100    | Highest unlock; config resolution is foundational for all pools   |
| P8  | 11    | ~80     | Gates P9 (18 tests) + P11 (16 tests) = 34 downstream tests        |
| P1  | 12    | ~150    | Retry/reconnect is user-visible reliability; gates P3             |
| P10 | 11    | ~60     | ConnectionManagement middleware — best tests-per-LOC in this tier |

### Tier 2 — gated on Tier 1, or moderate standalone

| PR  | Tests | Est LOC | Depends on | Why                                                   |
| --- | ----- | ------- | ---------- | ----------------------------------------------------- |
| P9  | 18    | ~150    | P8         | Multi-DB + nested switching — largest gated PR        |
| P12 | 14    | ~100    | —          | Query cache per-context; also unblocks relation tests |
| P2  | 6     | ~120    | —          | Adapter lifecycle — correctness fix                   |
| P6  | 9     | ~100    | —          | Pool lifecycle; gates P7                              |
| P5  | 7     | ~60     | —          | Config edge cases — can bundle with P4                |

### Tier 3 — gated on Tier 2 or low leverage

| PR  | Tests | Est LOC | Depends on | Why                                                 |
| --- | ----- | ------- | ---------- | --------------------------------------------------- |
| P11 | 16    | ~200    | P8         | DatabaseSelector test bodies — high LOC, tests only |
| P3  | 6     | ~60     | P1         | Retryable query classification                      |
| P7  | 3     | ~80     | P6         | Pooled connection checkout/checkin                  |
| P13 | 4     | ~40     | —          | StandaloneConnection — small, clean scope           |
| P14 | 4     | ~60     | —          | Adapter leasing test bodies                         |
| P15 | 2     | ~30     | —          | Prepared statements toggle — smallest PR            |

### Recommended parallel lanes

- **Lane A:** P8 → P9 → P11 (handler → multi-DB → DatabaseSelector)
- **Lane B:** P1 → P3 (retry knob → retryable classification)
- **Lane C:** P4 + P5 (config resolution — can be one PR)
- **Lane D:** P10 + P12 (middleware + query cache — no overlap)
- **Lane E:** P6 → P7 (pool lifecycle → pooled connections)

**Coverage:** 162 tests total.

- **Actionable:** ~143 tests across 15 PRs
- **Permanently skipped:** ~6 tests (GVL/fork — Ruby threads)
- **Cross-blocker:** ~13 tests also blocked on fixtures/schema/transactions
  (see those respective plans when they exist)
