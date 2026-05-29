# Query-cache mixin plan — wire the live cache, retire the wrapper

## The finding (why this plan exists)

trails has **two** query-cache implementations, and the live one does not
actually cache:

| Concern                   | `QueryCacheAdapter` wrapper (`query-cache.ts`) | `QueryCache` mixin (`AbstractAdapter`) |
| ------------------------- | ---------------------------------------------- | -------------------------------------- |
| enable/disable/clear API  | yes                                            | yes                                    |
| pool checkout wiring      | **no** (never instantiated in the live path)   | yes (`checkoutAndVerify`)              |
| **caches SELECT results** | **yes — the only working impl**                | **no — helpers have zero callers**     |

Verification:

- `new QueryCacheAdapter(...)` appears only in `query-cache.test.ts`. The pool's
  `checkout` → `checkoutAndVerify` returns the **raw** mixin adapter, unwrapped
  (`connection-adapters/abstract/connection-pool.ts`).
- The only **reachable** caller of `Store.computeIfAbsent` (the actual cache
  lookup) is inside the wrapper, `query-cache.ts` (`this.cache.computeIfAbsent(...)`).
  The mixin's `cacheSql` also calls `computeIfAbsent`
  (`connection-adapters/abstract/query-cache.ts`), but `cacheSql` itself is
  unwired (see next point), so that call path is never entered.
- The mixin's `lookupSqlCache` / `cacheSql` (bundled into the `QueryCache`
  mixin const in `connection-adapters/abstract/query-cache.ts`) have **no
  callers**. The live `selectAll` delegates straight to the database with no
  cache consultation.

**Net: query caching is non-functional in the live path.** The mixin replaced
the wrapper's plumbing (checkout, pool config, enable/disable surface) but not
its behavior. The behavioral tests in `query-cache.test.ts` that map to Rails
`query_cache_test.rb` pass _only because they run against the wrapper_.

## Parity entanglement (do not regress)

- **api:compare** — `query_cache.rb` (`ActiveRecord::QueryCache`) scores 5/5 on
  `query-cache.ts`. Three methods (`run`/`complete`/`installExecutorHooks`) are
  on the `QueryCache` class; **`cache`/`uncached` are on the `QueryCacheAdapter`
  wrapper** (`cache` property + `uncached` method). Deleting the wrapper without
  relocating these drops `query_cache.rb` to 3/5.
- **test:compare** — `query_cache_test.rb` → `query-cache.test.ts`. Use the
  **live** `pnpm test:compare` output as the baseline for migration scope (at
  time of writing: 54 OK / 13 skipped). Note the snapshot in
  `activerecord-test-compare-100.md` is stale (dated 2026-05-18) and disagrees;
  trust the tool, not the snapshot. Test names are matched verbatim; they cannot
  be renamed or dropped, only migrated.

## Rails references

- `vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/query_cache.rb`
  — the mixin (`Store`, `compute_if_absent`, `dirties_query_cache`,
  `ConnectionPoolConfiguration`). **This is where the cache wiring lives**: the
  module **overrides `select_all`** (line 236) to call
  `lookup_sql_cache(sql, ...) || super` / `cache_sql(sql, ...) { super }`. The
  override is the missing piece in trails.
- `vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb`
  — provides the **base** `select_all` (line 69) that the `query_cache.rb`
  override wraps via `super`. Not edited for caching; it stays the uncached path.
- `vendor/rails/activerecord/lib/active_record/query_cache.rb` —
  `ActiveRecord::QueryCache` middleware: `cache`/`uncached` ClassMethods operate
  on `connection_pool` (not an adapter); `self.run`/`self.complete(pools)`
  iterate pools.

## Phased path

Sibling PRs, each off `main`, non-overlapping files where possible. **Phase 1
must land and be proven before Phase 3** (test migration depends on the mixin
actually caching).

### Phase 1 — wire the mixin cache into the live query path (feature)

The real missing piece. Mirror Rails exactly: the `QueryCache` module
**overrides `select_all`** (`query_cache.rb:236`) to call
`lookup_sql_cache(sql, ...) || super` on a cache hit and
`cache_sql(sql, ...) { super }` otherwise — i.e. the override wraps the base
`select_all` from `database_statements.rb` via `super`, it does **not** edit the
base method. Port this as a `selectAll` override in the `QueryCache` mixin
(`abstract/query-cache.ts`) that delegates to the adapter's base `selectAll`
(`abstract/database-statements.ts`) for the uncached path, and have write
statements dirty the cache via `dirties_query_cache`. The `lookupSqlCache` /
`cacheSql` helpers already exist there with no callers — this wiring is what
invokes them. Prove with the subset of `query_cache_test.rb` cases that assert
cache hits, run against the **mixin** adapter (newly unskipped or duplicated
under their verbatim names).

Files: `connection-adapters/abstract/query-cache.ts` (the `selectAll` override +
existing helpers), `connection-adapters/abstract-adapter.ts` (mixin wiring);
the base `selectAll` in `connection-adapters/abstract/database-statements.ts`
stays untouched (the override calls it via `super`/delegation).

### Phase 2 — pool-based `ActiveRecord::QueryCache` (refactor, parity-preserving)

Relocate `cache`/`uncached` off the wrapper onto the `QueryCache` class as
pool-based static methods matching Rails' `ActiveRecord::QueryCache::ClassMethods`
(operate on `connection_pool`). Make `run`/`complete` pool-based too (Rails
iterates pools, not adapters). Keeps `query_cache.rb` at 5/5 while removing the
wrapper dependency from these methods. Also resolves connection-pool-gap-plan
**PF2** ("move guard from `enableQueryCacheBang` to `QueryCache.run`; requires
`run()` to accept pools").

Files: `query-cache.ts` (+ its tests for these methods).

### Phase 3 — migrate tests, delete the wrapper, simplify `.inner` walks (cleanup)

- Migrate the `query_cache_test.rb`-matched tests in `query-cache.test.ts`
  from `new QueryCacheAdapter(inner)` to the mixin adapter, **names verbatim**.
  The wrapper-only tests with no Rails counterpart (`forwards Quoting methods to
inner adapter`, the Quoting-forwarder fallback tests) are deleted with the
  wrapper.
- Delete `QueryCacheAdapter` + its private-only helpers (`castBinds`,
  `getCurrentUserTransaction`, `cacheKey`).
- Drop the `QueryCacheAdapter` export from `index.ts` (public API removal — no
  Rails counterpart; note in PR body).
- Collapse the `adapter.inner` walks to a **direct static lookup**
  (`adapter.constructor.columnNameMatcher?.() ?? abstractColumnNameMatcher()`),
  matching Rails' `model.adapter_class.column_name_matcher`. The walk lives in
  three resolvers: `resolveColumnNameMatcher` and `resolveColumnNameWithOrderMatcher`
  in `relation.ts`, and `resolveOrderMatcher` in `relation/query-methods.ts`
  (which walks `adapter = adapter.inner`). (Note: `resolveAdapterMatcher` was a
  shared helper introduced only in the closed PR #2639 — it is **not** on main;
  these three are the real symbols.) This also obsoletes the abandoned
  column-matcher dedup follow-up in `relation-gap-plan.md`.
- Remove the stale `QueryCacheAdapter` comment in `relation.ts`.

## Notes

- The column-matcher dedup (originally a standalone ~30 LOC follow-up, PR #2639,
  closed) is **subsumed by Phase 3**: once there is no wrapper, there is no
  `.inner` chain to walk, so the matcher resolvers collapse to one-line direct
  lookups and the shared helper is unnecessary. Do not reopen it standalone.
