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
- The only caller of `Store.computeIfAbsent` (the actual cache lookup) is inside
  the wrapper, `query-cache.ts` (`this.cache.computeIfAbsent(...)`).
- The mixin's `lookupSqlCache` / `cacheSql` (bundled into the `QueryCache`
  mixin const in `connection-adapters/abstract/query-cache.ts`) have **no
  callers**. The live `selectAll` delegates straight to the database with no
  cache consultation.

**Net: query caching is non-functional in the live path.** The mixin replaced
the wrapper's plumbing (checkout, pool config, enable/disable surface) but not
its behavior. The 54 behavioral tests in `query-cache.test.ts` that map to
Rails `query_cache_test.rb` pass _only because they run against the wrapper_.

## Parity entanglement (do not regress)

- **api:compare** — `query_cache.rb` (`ActiveRecord::QueryCache`) scores 5/5 on
  `query-cache.ts`. Three methods (`run`/`complete`/`installExecutorHooks`) are
  on the `QueryCache` class; **`cache`/`uncached` are on the `QueryCacheAdapter`
  wrapper** (`cache` property + `uncached` method). Deleting the wrapper without
  relocating these drops `query_cache.rb` to 3/5.
- **test:compare** — `query_cache_test.rb` → `query-cache.test.ts` at 54 OK / 13
  skipped. Test names are matched verbatim; they cannot be renamed or dropped,
  only migrated.

## Rails references

- `vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/query_cache.rb`
  — the mixin (`Store`, `compute_if_absent`, `dirties_query_cache`,
  `ConnectionPoolConfiguration`). `select_all` consults `@query_cache` here.
- `vendor/rails/activerecord/lib/active_record/query_cache.rb` —
  `ActiveRecord::QueryCache` middleware: `cache`/`uncached` ClassMethods operate
  on `connection_pool` (not an adapter); `self.run`/`self.complete(pools)`
  iterate pools.
- `vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb`
  — `select_all` → cache lookup/store; this is the missing wiring.

## Phased path

Sibling PRs, each off `main`, non-overlapping files where possible. **Phase 1
must land and be proven before Phase 3** (test migration depends on the mixin
actually caching).

### Phase 1 — wire the mixin cache into the live query path (feature)

The real missing piece. Make `selectAll` / `exec_query` on the mixin adapter
consult `this.queryCache` via `compute_if_absent` when enabled, and have write
statements dirty the cache, mirroring `database_statements.rb` +
`query_cache.rb`'s `dirties_query_cache`. Prove with the subset of
`query_cache_test.rb` cases that assert cache hits, run against the **mixin**
adapter (newly unskipped or duplicated under their verbatim names).

Files: `connection-adapters/abstract/database-statements.ts`,
`connection-adapters/abstract/query-cache.ts`, `connection-adapters/abstract-adapter.ts`.

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

- Migrate the 54 `query_cache_test.rb`-matched tests in `query-cache.test.ts`
  from `new QueryCacheAdapter(inner)` to the mixin adapter, **names verbatim**.
  The wrapper-only tests with no Rails counterpart (`forwards Quoting methods to
inner adapter`, the Quoting-forwarder fallback tests) are deleted with the
  wrapper.
- Delete `QueryCacheAdapter` + its private-only helpers (`castBinds`,
  `getCurrentUserTransaction`, `cacheKey`).
- Drop the `QueryCacheAdapter` export from `index.ts` (public API removal — no
  Rails counterpart; note in PR body).
- Collapse the two `adapter.inner` walks — `relation.ts` `resolveAdapterMatcher`
  helper and `relation/query-methods.ts` — to a **direct static lookup**
  (`adapter.constructor.columnNameMatcher?.() ?? abstractColumnNameMatcher()`),
  matching Rails' `model.adapter_class.column_name_matcher`. This also obsoletes
  the abandoned column-matcher dedup follow-up in `relation-gap-plan.md`.
- Remove the stale `QueryCacheAdapter` comment in `relation.ts`.

## Notes

- The column-matcher dedup (originally a standalone ~30 LOC follow-up, PR #2639,
  closed) is **subsumed by Phase 3**: once there is no wrapper, there is no
  `.inner` chain to walk, so both matcher resolvers collapse to one-line direct
  lookups and the shared helper is unnecessary. Do not reopen it standalone.
