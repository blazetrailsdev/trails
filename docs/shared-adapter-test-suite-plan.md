# Shared adapter test-suite plan

Plan for running the shared `activerecord` test suite against all three
adapters (sqlite3, postgresql, mysql2) — the way Rails does — instead
of the current setup where shared tests effectively only exercise SQLite
and PG/MySQL coverage is limited to adapter-named files.

## Current state

Most of the keystone infrastructure already exists:

- `packages/activerecord/src/test-adapter.ts` exports `createTestAdapter()`
  with PG/MySQL/SQLite dispatch on `PG_TEST_URL` / `MYSQL_TEST_URL`, plus
  a `SchemaAdapter` wrapper that lazily creates/drops tables from model
  attribute definitions.
- `packages/activerecord/src/test-setup-worker-db.ts` provisions a
  per-worker DB slot via PG `pg_try_advisory_lock` and MySQL `GET_LOCK`,
  rewriting `PG_TEST_URL` to `rails_js_test_<slot>` per fork.
- `packages/activerecord/src/test-helpers/drop-all-tables.ts` branches on
  `adapter.adapterName` for all three adapters (PG covers
  tables/views/matviews across `current_schemas`; MySQL pins a connection
  and toggles `FOREIGN_KEY_CHECKS=0`).
- 171 activerecord test files call `createTestAdapter`.
- Only ~11 non-adapter-specific files still literally name
  `SQLite3Adapter`: `transactions.test.ts`, `locking.test.ts`,
  `migration.test.ts`, `time-precision.test.ts`, `connection-pool.test.ts`,
  `statement-cache.test.ts`, `transaction-isolation.test.ts`,
  `transaction-instrumentation.test.ts`, `adapter-prevent-writes.test.ts`,
  `date-time-precision.test.ts`, `multi-db-migrator.test.ts`. (Other
  literal `SQLite3Adapter` references live under `adapters/sqlite3/**` and
  `connection-adapters/sqlite3-*` and should stay — they are legitimately
  adapter-specific.)

What's missing: load-path gating, a committed reset strategy
(transactional fixtures), finishing the codemod on those ~11 files, the
CI matrix, and a parity annotation.

## Design goals

1. Run the same shared test files against sqlite3, postgres, and mysql2.
2. Make capability gates explicit and typed; eliminate silent "DB not
   reachable → skip" in CI.
3. Don't regress local dev: `pnpm vitest run foo.test.ts` should still
   Just Work on a laptop with no Postgres.
4. Keep adapter-specific files (PG arrays, MySQL charset, sqlite3 pragmas)
   where they are — they shouldn't be forced through the shared axis.

## Phase 1 — Load-path gating

**Goal:** adapter-specific test files must not load when running the
shared matrix against the wrong adapter, and shared files must not
collide with adapter-specific files in the same worker.

**Why first:** mixing shared-PG and adapter-specific PG tests in the same
Vitest worker breaks the adapter-specific tests today. Repro (single
worker):

```
PG_TEST_URL=... TRAILS_TEST_FORKS=1 pnpm vitest run \
  packages/activerecord/src/core.test.ts \
  packages/activerecord/src/connection-adapters/postgresql-adapter.test.ts
```

Produces 3 failures in `postgresql-adapter.test.ts > Base integration`
with `StatementInvalid: relation "users" does not exist`. The shared file
routes through `SchemaAdapter`, which drops the `users` table at
teardown; the adapter-specific file constructs `new PostgreSQLAdapter(...)`
directly and assumes its own `users` table sticks around. Both point at
the same per-worker DB. No PG matrix leg can be green until this is gated.

**Files touched:**

- `packages/activerecord/vitest.config.ts`

**Impl:**

```ts
exclude: [
  ...(process.env.TEST_ADAPTER !== "postgresql"
    ? ["**/adapters/postgresql/**", "**/postgresql-*.test.ts"]
    : []),
  ...(process.env.TEST_ADAPTER !== "mysql2"
    ? ["**/adapters/abstract-mysql-adapter/**", "**/mysql-*.test.ts"]
    : []),
  ...(process.env.TEST_ADAPTER === "postgresql" || process.env.TEST_ADAPTER === "mysql2"
    ? ["**/adapters/sqlite3/**", "**/sqlite3-*.test.ts"]
    : []),
];
```

**Success:** the cross-file collision repro above passes when
`TEST_ADAPTER=postgresql` excludes `connection-adapters/postgresql-adapter.test.ts`.

**LOC:** ~50.

## Phase 2 — Transactional fixtures as the default reset strategy

**Goal:** wrap each shared test in `BEGIN` / `ROLLBACK` so schema setup
runs once per file and per-test reset is effectively free.

**Why:** measured on PG (50 iters, two tables, seed + two `SELECT
count(*)`):

| Strategy                                    | Per-iter |
| ------------------------------------------- | -------- |
| `dropAllTables` + recreate + seed + queries | 27.0 ms  |
| `dropAllTables` + recreate (no body)        | 18.6 ms  |
| `BEGIN` / seed / queries / `ROLLBACK`       | 1.8 ms   |

That is ~15× on PG; sqlite3 and mysql2 inherit the same wrap. On a
~5000-test suite this is the difference between ~95 s and ~9 s of pure
reset overhead.

**Files touched:**

- `packages/activerecord/src/test-helpers/with-transactional-fixtures.ts` (new)
- A shared `setupFiles` entry wiring `beforeEach`/`afterEach`
- `packages/activerecord/src/test-helpers/drop-all-tables.ts` (keep — debug helper + `globalSetup` initial sweep)

**Impl:**

- `beforeEach`: `adapter.beginTransaction()`.
- `afterEach`: `adapter.rollback()`.
- Tests that need committed DDL (multi-connection visibility, schema
  introspection mid-transaction) opt out via an explicit hook.
- `dropAllTables` remains for the debug helper role and as the
  `globalSetup` "start clean" sweep.

**Success:** all currently-passing shared tests stay green on sqlite3;
PG canary files (see Phase 3) measurably faster end-to-end.

**LOC:** ~150.

**After Phase 1.**

## Phase 3 — Finish the codemod on the ~11 holdout files

**Goal:** convert the remaining `new SQLite3Adapter(":memory:")` call
sites to `createTestAdapter()` and address the three concrete failures
the canary surfaced.

**Files touched:** the ~11 files listed under "Current state."

**Impl:**

1. **Mechanical codemod (ts-morph):**
   - `new SQLite3Adapter(...)` → `createTestAdapter()`.
   - Remove orphaned `SQLite3Adapter` imports.
   - Must handle **partially-migrated** files (e.g. `transactions.test.ts`
     already imports `createTestAdapter` but also constructs
     `new SQLite3Adapter(...)` inline via `makeSQLiteTopic()`). Don't
     bail when the import is already present.

2. **`transactions.test.ts` partial migration.** Replace the inline
   `new SQLite3Adapter(...)` constructors in helpers like
   `makeSQLiteTopic()` with `createTestAdapter()`. Under PG today this
   file yields 20 failures (`RecordNotUnique` on `pg_type_typname_nsp_index`,
   `relation "posts" already exists`) because every test races the same
   shared `posts` table on the per-worker DB. The Phase 2 txn wrap fixes
   the bleed once the constructors are migrated.

3. **`batches.test.ts` PG ORDER BY fidelity.** 13 failures on PG of the
   form `expected 0 / 1 / 2 to be N`. `find_in_batches` and friends rely
   on insertion-order iteration; PG with no `ORDER BY` is undefined. Fix
   the **implementation** to insert an implicit PK order — that's what
   Rails does — not the tests. Lives in
   `packages/activerecord/src/relation/batches.ts` (and any caller paths
   that bypass it). File as a separate task on the activerecord side if
   too large to fold in; do not paper over with `order(:id)` in test
   bodies.

4. **`core.test.ts` PG edge-case skip.** Single failure: `find by cache
does not duplicate entries` (cache-key collision under PG SERIAL ids).
   Annotate with `it.skipIf(currentTestAdapter() === "postgresql")` and
   a `:BLOCKED:` note pointing at the cache-key issue.

5. **Add `globalSetup` DB creation.** The advisory-lock infra in
   `test-setup-worker-db.ts` assumes slot DBs already exist. Add an
   idempotent `CREATE DATABASE IF NOT EXISTS rails_js_test_N` loop in
   `globalSetup` (or a one-shot `pnpm db:test:create` task invoked from
   CI). Without this, the first PG matrix run fails with "database does
   not exist."

6. **Round out the helper surface.** `createTestAdapter` exists; add the
   thin helpers the rest of the plan assumes if not present:
   `currentTestAdapter()`, `ifAdapter(name, fn)`, `supportsForeignKeys()`,
   `supportsArrays()`, and the strict-on-CI probe (`throw` instead of
   skip when `process.env.CI === "true"` and connection fails).

**Success:**

- All ~11 files pass on sqlite3 unchanged.
- `transactions.test.ts` and the `transactions.test.ts` repro from the
  canary pass on PG.
- `batches.test.ts` passes on PG after the implementation fix.
- `core.test.ts`'s single PG failure is annotated and skipped on PG.

**LOC:** codemod + helper additions ~250; batches impl fix and txn
opt-outs may push toward another ~200 — split if needed (codemod first,
batches as a follow-up).

**After Phases 1 and 2.**

## Phase 4 — CI matrix

**Goal:** actually run the shared suite against PG and MySQL in CI.

**Files touched:** `.github/workflows/*.yml`.

**Impl:**

```yaml
strategy:
  matrix:
    adapter: [sqlite3, postgresql, mysql2]
services:
  postgres: { image: postgres:16, ... } # only on the postgresql leg
  mysql: { image: mysql:8, ... } # only on the mysql2 leg
env:
  TEST_ADAPTER: ${{ matrix.adapter }}
```

`createTestAdapter()` throws (does not skip) when `process.env.CI ===
"true"` and the connection fails — silent-skip is the failure mode we're
eliminating.

**Cost:** wall-clock per leg is comparable to today (real DB roundtrips
are slower than in-memory sqlite3, partially offset by Vitest parallelism
and the Phase 2 txn savings). CI minutes go up roughly **3×**. The win
is coverage, not speed.

**Success:** all three matrix legs green on a representative PR.

**LOC:** ~100.

**After Phase 3.**

## Phase 5 — `test:compare` covered-on annotation

**Goal:** surface which Rails tests have run against which adapter so the
"covered on PG/MySQL" axis becomes a parity number we can track.

**Files touched:** `scripts/api-compare/` (the `test:compare` side
specifically — likely `scripts/api-compare/compare.ts` and the report
formatter).

**Impl:** emit a per-test `covered_on: [sqlite3, postgresql, mysql2]`
field in the report, derived from which matrix legs ran each file
(`TEST_ADAPTER` + the load-path exclude rules). Rails tests still map
1:1 to TS tests by name; what changes is visibility of effective
coverage.

**Success:** report includes a "covered on" column; backlog of
sqlite3-only tests is enumerable.

**LOC:** ~150.

**After Phase 4** (no signal until the matrix is producing per-leg
results).

## Phase 6+ — Peel skips per cluster

Rolling work: each cluster of failures-on-PG-but-not-SQLite (and the
mirror on MySQL) is a real fidelity gap. Address one cluster at a time
using the existing `:BLOCKED:` annotation convention from
`normalize-skips.ts`. Not part of the infra arc.

## Risks and unknowns

- **PG/MySQL flake in CI.** Real service containers flake. Mitigate with
  pinned image versions; retry on connection-establish only, never on
  test bodies.
- **Schema-dialect divergence backlog.** First green run on PG/MySQL will
  surface a long tail of fidelity gaps (the `core.test.ts` cache-key
  case is representative). Land Phase 3 with capability-gate skips for
  known-failing files, then peel.
- **MySQL canary unexercised.** The spike covered PG only. Expect the
  same `batches.test.ts` ordering gap on MySQL and possibly a different
  `transactions.test.ts` partial-migration story. Re-run the 5-file
  canary on MySQL before opening the Phase 4 PR.
- **Coverage gain is uneven.** Tests exercising pure AR/Arel logic
  execute the same code path on all three adapters; running them thrice
  catches nothing new. The real win is for code paths that branch on
  `adapterName` or call into adapter-specific quoting/schema/type code.
  The Phase 5 annotation quantifies this.

## Suggested PR sequence

| #   | Title                                                  | Scope                                                                                                                                        | LOC     | Depends on |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- |
| 1   | `vitest.config.ts` load-path gating                    | exclude rules for adapter-specific files based on `TEST_ADAPTER`                                                                             | ~50     | —          |
| 2   | Transactional fixtures default                         | `with-transactional-fixtures.ts` + shared `setupFiles` wire-up; `dropAllTables` retained as debug helper                                     | ~150    | PR 1       |
| 3   | Codemod ~11 holdout files + helper surface             | ts-morph codemod handling partial migrations; add `currentTestAdapter`/`ifAdapter`/`supportsX`/strict-on-CI probe; `globalSetup` DB creation | ~250    | PR 2       |
| 4   | `batches.ts` implicit PK ordering                      | impl fix for `find_in_batches` and friends so PG/MySQL match insertion order Rails-style                                                     | ~150    | PR 3       |
| 5   | `transactions.test.ts` + `core.test.ts` PG annotations | finish migrating inline constructors; annotate the cache-key PG skip                                                                         | ~50     | PR 3       |
| 6   | CI matrix (sqlite3, postgresql, mysql2)                | `.github/workflows/*.yml` matrix + services; strict-on-CI probe behavior                                                                     | ~100    | PRs 1–5    |
| 7   | `test:compare` covered-on annotation                   | report a per-test adapter coverage axis                                                                                                      | ~150    | PR 6       |
| 8+  | Peel skips per cluster                                 | rolling work as fidelity gaps are closed                                                                                                     | rolling | PR 7       |
