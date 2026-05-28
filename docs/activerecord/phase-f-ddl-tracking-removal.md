# Phase F — Delete `recordDdlTracking` (Rails parity)

> **Status (2026-05-27):** F1 (audit + safety-net tests) open. F2–F5 not started.

Rails has neither `onDdl` nor `recordDdlTracking`. DDL side-effects are handled
inline at each schema-mutating method via `schema_cache.clear_data_source_cache!`
(see `vendor/rails/activerecord/lib/active_record/connection_adapters/abstract_mysql_adapter.rb:333-355`).
No generic hook.

Phase F removes the trails-specific DDL tracker and aligns with Rails:

- **F1 (this PR):** Audit + concurrency baseline + schema-cache invalidation
  safety-net tests. `dropTable` and `dropJoinTable` pass today (already
  invalidate). The remaining 7 tests are `.skip`ped until F2 adds the inline
  calls (`createTable`, `renameTable`, `addColumn`, `removeColumn`, `addIndex`,
  `removeIndex`, `changeColumn`).
- **F2:** Inline `schemaCache.clearDataSourceCacheBang()` at each DDL method that
  is missing it; unskip the F1 safety-net tests.
- **F3:** Delete `defineSchema`'s `TestDatabaseAdapter.tables` short-circuit;
  replace with `schemaCache.dataSourceExists()` introspection.
- **F4:** Delete `recordDdlTracking`, `_createdTables`, `_createdColumns`, and
  `ddl-tracker.ts`; delete `TestAdapterFixtures` and `SidecarFixtures` wrappers
  (their only remaining job after E removed TX overrides).
- **F5:** Delete `createTestAdapter()` factory shim; `createSidecarTestAdapter()`
  returns the real adapter directly.

## F1 — Audit findings (verified 2026-05-27)

### 1. E5 state

`_sharedAdapter` is still present in
`packages/activerecord/src/test-adapter.ts` (lines 59–312). E5 has not yet
merged. F1 is safe to land before E5; it is purely additive.

The concurrency-isolation test (`with-transactional-fixtures.test.ts`, describe
"concurrency isolation: two concurrent transaction chains stay independent") is
correctly `.skip`ped with the note "Skipped at E3: AsyncContext filter removed;
pool-backed isolation lands at E5." This is the expected baseline; both tests
pass as skipped.

### 2. Inventory — DDL methods in `abstract/schema-statements.ts`

| Method                | Line | `clearDataSourceCacheBang` called? | Rails parity                                                                                           |
| --------------------- | ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `createTable`         | 87   | No — **F2 gap**                    | Rails calls it in non-force branch (ss.rb:306)                                                         |
| `dropTable`           | 215  | **Yes** (line 226)                 | Rails ss.rb:542 ✓                                                                                      |
| `addColumn`           | 231  | No — **F2 gap**                    | Rails does not inline; schemaCache invalidated by higher-level callers. Low priority — see note below. |
| `removeColumn`        | 242  | No — **F2 gap**                    | Same as addColumn.                                                                                     |
| `renameColumn`        | 256  | No                                 | Rails does not inline either. Not in F2 scope.                                                         |
| `addIndex`            | 262  | No — **F2 gap**                    | Same as addColumn.                                                                                     |
| `removeIndex`         | 275  | No — **F2 gap**                    | Same as addColumn.                                                                                     |
| `changeColumn`        | 298  | No — **F2 gap**                    | Same as addColumn.                                                                                     |
| `renameTable`         | 336  | No — **F2 gap**                    | Rails clears **both** old and new name (ss.rb:—; adapter overrides in PG/MySQL/SQLite)                 |
| `changeColumnDefault` | 383  | No                                 | Rails does not inline. Not in F2 scope.                                                                |
| `changeColumnNull`    | 398  | No                                 | Rails does not inline. Not in F2 scope.                                                                |
| `createJoinTable`     | 605  | No (delegates to `createTable`)    | Covered when F2 fixes `createTable`.                                                                   |
| `dropJoinTable`       | 632  | **Yes** (delegates to `dropTable`) | ✓                                                                                                      |

**Note on addColumn/removeColumn/addIndex/removeIndex/changeColumn:** Rails does
not inline `clear_data_source_cache!` in these methods in the abstract base.
In Rails, the schema cache is connection-local and rebuilt per-request; stale
entries are not a concern the way they are in trails' shared-adapter model where
the cache outlives individual test transactions. Accordingly, the F1 safety-net
tests are marked skipped to signal these gaps; the F2 author should add
`clearDataSourceCacheBang` defensively at each site regardless of Rails parity,
since stale column entries in trails' cache are **not** evicted automatically —
`SchemaCache.columns()` returns the cached `_columns` entry without hitting the
DB if it is already present.

**Note on renameTable:** All three adapter overrides (PG `schema_statements.rb:437-438`,
MySQL `abstract_mysql_adapter.rb:333-334`, SQLite `sqlite3_adapter.rb:332-333`) clear
**both the old and new table name**. F2 must add both calls.

### 3. Adapter-specific overrides

#### PostgreSQL — `postgresql/schema-statements-class.ts`

| Method      | Line | `clearDataSourceCacheBang`? | Notes                           |
| ----------- | ---- | --------------------------- | ------------------------------- |
| `dropTable` | 5    | **Yes** (line 13)           | Full override, mirrors abstract |

#### MySQL — `mysql2-adapter.ts`

| Method      | Line | `clearDataSourceCacheBang`? | Notes                    |
| ----------- | ---- | --------------------------- | ------------------------ |
| `dropTable` | 903  | **Yes** (line 913)          | Handles `TEMPORARY` flag |

#### MySQL base — `abstract-mysql-adapter.ts`

| Method                | Line | `clearDataSourceCacheBang`? | Notes                                    |
| --------------------- | ---- | --------------------------- | ---------------------------------------- |
| `renameTable`         | 564  | No                          | **No-op stub** — no SQL, no invalidation |
| `addIndex`            | 796  | No                          | Full override, no invalidation           |
| `changeColumn`        | 741  | No                          | Full override, no invalidation           |
| `changeColumnDefault` | 620  | No                          | Full override, no invalidation           |
| `changeColumnNull`    | 701  | No                          | Full override, no invalidation           |

**Note:** The `renameTable` stub at line 564 is a known gap — MySQL rename
requires cross-table copy. F2 should add `clearDataSourceCacheBang` for both old
and new name once the body is implemented.

#### SQLite — `sqlite3-adapter.ts`

| Method          | Line | `clearDataSourceCacheBang`?                    | Notes                                                                                                                      |
| --------------- | ---- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `renameTable`   | 985  | **Partial** — calls `this.schemaCache.clear()` | Full clear, not targeted; F2 should normalize to `clearDataSourceCacheBang(oldName)` + `clearDataSourceCacheBang(newName)` |
| `addColumn`     | 992  | No                                             | Override for SQLite dialect; no invalidation                                                                               |
| `removeColumn`  | 1008 | No                                             | Override (uses `alterTable`); no invalidation                                                                              |
| `removeColumns` | 1014 | No                                             | Override; no invalidation                                                                                                  |

### 4. `TestDatabaseAdapter.tables` getter consumers

`test-adapter.ts:414` exposes `get tables(): Set<string>` backed by
`getCreatedTables()` (the DDL tracker). It is consumed in one non-test location:

- `packages/activerecord/src/test-helpers/define-schema.ts:503` — checks
  `(adapter as { tables?: unknown }).tables` to invalidate stale cache entries
  when an external `resetTestAdapterState` dropped tables out of the shared
  adapter.

**Decision for F3:** Delete the `TestDatabaseAdapter.tables` getter. Replace the
`define-schema.ts:503` consumer with `schemaCache.dataSourceExists(pool, name)`
introspection (compare set of known table names against cache). This eliminates
the tracker dependency from the schema-load fast-path.

### 5. DDL inside `it()` bodies — snapshot/restore strategy for F4

`packages/activerecord/src/date-time-precision.test.ts` applies DDL
(`createTable`, `addColumn`) inside `it()` bodies directly against the adapter's
schema context (`ctx`). It does not use `withTransactionalFixtures`.

`packages/activerecord/src/active-record-schema.test.ts` similarly applies
`schema.createTable()` inside `it()` bodies.

These files manage their own teardown (via `force: true` on subsequent creates,
or explicit cleanup). They do not depend on the DDL snapshot/restore mechanism in
`withTransactionalFixtures`.

**F4 strategy:** Replace `withTransactionalFixtures`'s snapshot/restore of
`_createdTables`/`_createdColumns` with `schemaCache.clear()` in the afterEach
rollback path (matching Rails: rolling back the TX implicitly removes DDL that ran
inside it; `schemaCache.clear()` drops the now-stale entries). Files that apply
DDL inside `it()` without `withTransactionalFixtures` are unaffected.

### 6. Double-invalidation analysis

F2 will add `clearDataSourceCacheBang` inline at DDL methods. The three adapters
that already have it for `dropTable` (abstract base, PG, MySQL) will call it
again after F2 if the base-class and override both carry the call. To avoid
double-invalidation:

- **Abstract base `dropTable`**: already correct; the three adapter overrides
  each also call it. After F2, if F2 only adds calls to methods not already
  covered, no duplication occurs. Audit per-method before adding each call.
- **SQLite `renameTable`**: currently calls `schemaCache.clear()` (full wipe);
  F2 should replace this with `clearDataSourceCacheBang(oldName)` +
  `clearDataSourceCacheBang(newName)` for precision.

## Phase F sub-phase checklist

- [x] **F1** — Audit + concurrency baseline + safety-net tests (#TBD)
- [ ] **F2** — Inline `clearDataSourceCacheBang` at missing DDL sites; unskip
      safety-net tests
- [ ] **F3** — Delete `TestDatabaseAdapter.tables` getter; migrate
      `define-schema.ts:503` consumer to `schemaCache` introspection
- [ ] **F4** — Delete `recordDdlTracking` / `_createdTables` / `_createdColumns`
      / `ddl-tracker.ts`; delete `TestAdapterFixtures` and `SidecarFixtures`
- [ ] **F5** — Delete `createTestAdapter()` shim; return real adapter directly
