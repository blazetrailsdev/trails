# Shared adapter test-suite plan

Plan for running the shared `activerecord` test suite against all three
adapters (sqlite3, postgresql, mysql2) — the way Rails does — instead
of the current setup where shared tests only ever exercise SQLite and
PG/MySQL coverage is limited to adapter-named files.

## Current state (the blocker)

Counts in `packages/activerecord/src/**/*.test.ts` on 2026-05-15:

- **61 files** call `defineSchema` or `establishConnection`.
- **36 files** instantiate `new SQLite3Adapter(...)` literally.
- **41 files** contain a `:memory:` connection-string literal.

The adapter is baked into each test, so there's no axis to vary. PG and
MySQL only see what's under `adapters/postgresql/**`,
`adapters/abstract-mysql-adapter/**`, and
`connection-adapters/*-adapter.test.ts` — a small fraction of the suite.

Rails avoids this by never naming an adapter in shared tests. The
adapter is chosen by `ARCONN` at bootstrap and the same files are run
three times. The Rakefile fans out into `test:sqlite3`,
`test:postgresql`, `test:mysql2`; per-adapter files under
`test/cases/adapters/<name>/**` are only loaded for the matching run
via a `t.test_files` glob — not via `if` branching inside test bodies.

`defineSchema(adapter, schema, opts)` in
`packages/activerecord/src/test-helpers/define-schema.ts` already takes
the adapter as a positional argument and already dispatches type-maps
per `adapter.adapterName`. The infrastructure to vary the adapter is
present; what's missing is a consistent way for tests to construct
"whichever adapter the run is targeting" instead of hard-coding SQLite.

## Design goals

1. Run the same shared test files against sqlite3, postgres, and mysql2.
2. Make capability gates explicit and typed; eliminate the current
   silent "DB not reachable → skip" in CI.
3. Don't regress local dev: `pnpm vitest run foo.test.ts` should still
   Just Work on a laptop with no Postgres.
4. Keep adapter-specific files (PG arrays, MySQL charset, sqlite3
   pragmas) where they are — they shouldn't be forced through the
   shared axis.

## Phase 0 — Validation spike

Before committing to the full PR sequence, a half-day spike answers the
load-bearing assumptions:

1. **`Base.connection` global state.** Many tests mutate global model
   state (`Base.establishConnection`, registered models, type registry).
   Verify that a process running with `TEST_ADAPTER=postgresql` for
   shared tests doesn't conflict with adapter-specific PG tests that
   construct their own adapters in the same Vitest worker.
2. **Per-worker DB lifecycle on PG.** Confirm the
   `setupFiles` + `VITEST_POOL_ID` approach (below) actually isolates
   workers — and measure schema-reset cost so we know whether to commit
   to drop-all-tables or jump straight to transactional fixtures.
3. **5-file canary.** Pick five shared tests covering distinct code
   paths (a model lifecycle test, an attribute coercion test, a query
   test, a transaction test, a connection test), migrate them by hand
   to `newTestAdapter()`, and run them green on PG locally. Anything
   that fails reshapes the Phase 2 codemod scope.

The spike isn't a PR — it's a notebook / scratch branch whose output is
either "plan unchanged" or "plan revised before PR 1."

## Phase 1 — Test-adapter abstraction (the keystone)

Add `packages/activerecord/src/test-helpers/test-adapter.ts`:

```ts
export type TestAdapterName = "sqlite3" | "postgresql" | "mysql2";
export function currentTestAdapter(): TestAdapterName;
export function newTestAdapter(opts?): AbstractAdapter;
export function ifAdapter(name: TestAdapterName, fn: () => void): void;
export function supportsForeignKeys(): boolean;
export function supportsArrays(): boolean;
// ...
```

Selection rule: `process.env.TEST_ADAPTER ?? "sqlite3"`. Connection
strings come from env (`PG_TEST_URL`, `MYSQL_TEST_URL`) with localhost
defaults — the pattern already used in
`packages/activerecord/src/connection-adapters/postgresql-adapter.test.ts`.

Capability gates replace the file-name convention: a test that needs
arrays calls `it.skipIf(!supportsArrays())(...)`. This is the typed
analogue of Rails' `current_adapter?(:PostgreSQLAdapter)`.

`pg` and `mysql2` are already optional peer deps after the BC-3 browser-
compat work, so `newTestAdapter()` can lazy-`import` them; sqlite3-only
users don't pay the install cost.

**Why this first:** every later phase depends on it, and it's
mechanically isolated — no test changes yet.

## Phase 2 — Codemod the shared files

A one-time codemod (ts-morph) rewrites the 36 files that name SQLite
directly:

- `new SQLite3Adapter(":memory:")` → `newTestAdapter()`
- Inline column types that don't exist on PG/MySQL (`BLOB`,
  `INTEGER PRIMARY KEY AUTOINCREMENT` strings) → schema DSL terms or a
  `supportsX()` skip

`defineSchema`'s signature doesn't need to change — it already takes the
adapter positionally and dispatches type maps per
`adapter.adapterName`, so swapping in `newTestAdapter()` is the whole
edit at call sites.

PR-by-PR: ship the codemod + helper in one PR (~200 LOC), then split
the 36 files into ~3 PRs of ~12 files each (well under the 300 LOC
ceiling). Each file is independently revertable.

Robustness win independent of multi-adapter: removing literal
`":memory:"` strings from dozens of places eliminates a class of "test
passed because it ran against the wrong DB" bugs.

## Phase 3 — Per-worker schema/state isolation

`#1092` already gives each Vitest worker its own SQLite file. Extend
that uniformly:

- **sqlite3:** per-worker
  `file:test-w${WORKER_ID}.db?mode=memory&cache=shared` (already
  shipped).
- **postgresql:** per-worker database
  `rails_js_test_w${VITEST_POOL_ID}`. Vitest's `globalSetup` runs
  before workers exist, so the wiring is: a `setupFiles` entry reads
  `process.env.VITEST_POOL_ID`, ensures its DB exists (idempotent
  `CREATE DATABASE IF NOT EXISTS` via a maintenance connection to
  `postgres`), and points `newTestAdapter()` at it. Optional
  `globalTeardown` drops them all at the end. (Per-worker `search_path`
  was considered and rejected: cross-schema FK resolution and pool-
  level session state make it fragile.)
- **mysql2:** per-worker schema, same pattern.

Generalize `test-helpers/drop-all-tables.ts` (sqlite-shaped today) via
the adapter's introspection API (`tables()`,
`dropTable(name, cascade: true)`) — all three adapters already expose
these. Wire it into a shared `beforeEach`.

Concrete failure mode this prevents: two consecutive tests in the same
file both call `defineSchema` for a `users` table with different
columns. With `:memory:`, the second `createTable` fails on PG/MySQL
because the table from the first test is still there. Today this is
invisible — every test gets a fresh sqlite in-memory DB. The drop-all
hook normalizes that for any adapter.

If `DROP TABLE` per test proves slow on PG (rough budget: ~50 ms × N),
switch to transactional fixtures — `beginTransaction` in `beforeEach`,
`rollback` in `afterEach`. Rails uses this by default; our TM already
supports it.

## Phase 4 — CI matrix

`.github/workflows/...` gains a matrix dimension:

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

The connectivity probe stops being a silent-skip: in `newTestAdapter()`,
if `process.env.CI === "true"` and the connection fails, **throw**.
Locally it still skips.

Cost math (honest version): three matrix legs each run the full shared
suite. Wall-clock per leg is comparable to today (the PG/MySQL legs
will be somewhat slower than the SQLite leg because real DB roundtrips
beat in-memory, partially offset by Vitest's intra-job parallelism).
CI minutes go up roughly **3×** (three legs running the work that's
currently one leg). The win isn't speed — it's coverage.

## Phase 5 — Adapter-specific file reclassification + load-path gating

Once shared tests run everywhere, audit `adapters/postgresql/**`,
`adapters/abstract-mysql-adapter/**`, and
`connection-adapters/*-adapter.test.ts`:

- Tests that exercise adapter-only **behavior** (arrays, hstore,
  ranges, OID; MySQL charset/collation; sqlite3 pragmas) stay where
  they are.
- Tests that just happen to live there because of fixture coupling
  move into shared and gate on capability checks.

Load-path gating via `vitest.config.ts`:

```ts
exclude: [
  ...(process.env.TEST_ADAPTER !== "postgresql"
    ? ["**/adapters/postgresql/**", "**/postgresql-*.test.ts"]
    : []),
  ...(process.env.TEST_ADAPTER !== "mysql2"
    ? ["**/adapters/abstract-mysql-adapter/**", "**/mysql-*.test.ts"]
    : []),
];
```

This is the load-path gating Rails does (`t.test_files` glob),
expressed in our world. PG-only files literally aren't loaded on the
MySQL run, so we don't depend on every PG test remembering to
self-skip.

## Phase 6 — `test:compare` annotation

`test:compare` matches our tests to Rails tests by name. Today a Rails
test that runs on all three adapters maps to one TS test that only
runs on SQLite. After this work the mapping is unchanged (still one
TS test per Rails test), but effective coverage rises for any test
whose code path is adapter-divergent.

Add a "covered-on" axis to the compare report so we can see which
Rails tests are still only exercised on SQLite — that's the work
backlog for capability-gate removal.

## Risks & tradeoffs

- **PG/MySQL flake.** Real DBs in CI flake. Mitigation: pinned service-
  container versions; retry on connection-establish, not on test
  bodies.
- **Schema-dialect divergence.** Some shared tests will fail on
  PG/MySQL because the implementation has a gap, not the test. That's
  the point — it surfaces real fidelity issues — but expect a backlog
  of skips on the first green run. Plan to land Phase 2 with
  `it.skipIf(currentTestAdapter() !== "sqlite3")` for files we know
  will fail, then peel skips off one cluster at a time using the
  existing `:BLOCKED:` annotation convention from `normalize-skips.ts`.
- **Local dev friction.** Most contributors won't have Postgres
  running. The `CI=true` branch in the probe keeps `pnpm vitest run`
  painless locally; only CI is strict.
- **Schema-reset cost on PG.** Covered in Phase 3; transactional-
  fixtures fallback is available if the per-test drop overhead is too
  high.
- **Coverage gain is uneven.** Tests that exercise pure
  ActiveRecord/Arel logic (string interpolation, model lifecycle,
  attribute coercion of literals) execute the same code path on all
  three adapters — running them thrice doesn't catch new bugs. The
  real coverage win is for code paths that branch on `adapterName` or
  call into adapter-specific quoting/schema/type code. The
  `test:compare` annotation from Phase 6 quantifies this.

## Suggested PR sequence

| #   | Scope                                                                                 | LOC est. |
| --- | ------------------------------------------------------------------------------------- | -------- |
| 0   | Validation spike (no PR — scratch branch + findings note)                             | —        |
| 1   | `test-adapter.ts` helper + capability gates, no consumers yet                         | ~200     |
| 2   | Codemod script + first 12 files migrated (sqlite still default)                       | ~250     |
| 3–4 | Remaining ~24 files in 2 PRs                                                          | ~250 ea  |
| 5   | Generalize `drop-all-tables` via adapter introspection + per-worker PG/MySQL DB setup | ~250     |
| 6   | CI matrix + strict-on-CI probe                                                        | ~100     |
| 7   | `vitest.config.ts` load-path gating + adapter-file reclassification audit             | ~200     |
| 8   | `test:compare` covered-on annotation                                                  | ~150     |
| 9+  | Peel skips per cluster as fidelity gaps are fixed                                     | rolling  |

PRs 1–6 are infrastructure; #7 onward delivers the coverage gain. The
first real signal arrives at PR 6 — that's when the PG/MySQL legs
first run the shared suite.

## What this gets us

- **Coverage:** every shared test that exercises adapter-divergent code
  paths now runs on all three adapters. The fraction is unknown until
  Phase 6's annotation lands; "3×" is a ceiling, not the realized win.
- **Robustness:** silent-skip → hard-fail in CI; schema-bleed failure
  modes eliminated; "ran on the wrong adapter" class of bug gone.
- **Speed:** wall-clock roughly flat per CI run (parallel matrix legs);
  CI minutes ~3× higher.
- **Fidelity signal:** every cluster of failures-on-PG-but-not-SQLite
  is a real implementation gap surfaced for free.
