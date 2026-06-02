# Adapter-test CI coverage plan (PG + MySQL `adapters/<db>/**`)

**Status:** planning. Supersedes the original "Story I-5 — add a dedicated
`TEST_ADAPTER` job" framing in
[`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md).

**Goal (per owner):** get the `adapters/postgresql/**` and the MySQL adapter
dirs running **green in CI by extending the existing
`postgres-tests` / `mariadb-tests` / `sqlite-tests` jobs** — _not_ by adding a
separate adapter-only job path.

**TL;DR:** wiring the adapter dirs into CI is ~40 LOC and already prototyped
(exploratory branch `tc100-i5-test-compare-100-phase-1-story`, PR #2863). The
real work is the **~38 pre-existing test failures** those dirs surface, which
were never CI-gated. They fall into two big structural buckets — **cross-file
test isolation** (PG) and **MariaDB-vs-MySQL dialect divergence** (MySQL) —
plus a handful of genuine impl/test bugs. This doc inventories every failure,
groups them into ≤500-LOC remediation stories, and orders them so the CI lane
can be turned on green.

---

## 1. Background — why these dirs aren't in CI today

`vitest.config.ts` builds `ADAPTER_SPECIFIC_EXCLUDE` keyed on
`process.env.TEST_ADAPTER` (default `sqlite3`). For any run where
`TEST_ADAPTER` ≠ a given backend, that backend's `adapters/<db>/**` +
`connection-adapters/<db>/**` files are excluded. The three AR CI jobs
(`sqlite-tests`, `postgres-tests`, `mariadb-tests`) **never set
`TEST_ADAPTER`**, so:

- **SQLite adapter dirs DO run** today — default `TEST_ADAPTER=sqlite3` means
  the sqlite3 dirs are _not_ excluded, and `sqlite-tests` exercises them. ✅
- **PG + MySQL adapter dirs do NOT run** in any job — they're excluded
  everywhere. The ~135 adapter-dir tests (and their Phase-3 un-skips) are
  **local-verify-only**.

The exclusion of adapter dirs from the _shared_ run is deliberate
(`vitest.config.ts:17` comment): adapter-specific files construct their own
adapter directly and assume their tables survive a `describe`, while shared
tests routing through `createTestAdapter` + `SchemaAdapter` drop tables. Mixing
them in one vitest process corrupts state. **So the dirs must run in their own
vitest invocation, never interleaved with the shared suite.**

---

## 2. Target architecture — extend the existing jobs

Add a second vitest **step** to the existing `postgres-tests` and
`mariadb-tests` jobs (reusing the same service container, checkout, and
`pnpm build`) — instead of new top-level `*-adapter-tests` jobs. Conceptually:

```yaml
# inside postgres-tests, after the core `pnpm vitest run packages/activerecord` step:
- run: >
    pnpm vitest run
    packages/activerecord/src/adapters/postgresql
    packages/activerecord/src/connection-adapters/postgresql
    packages/activerecord/src/tasks/postgresql-database-tasks.test.ts
  env:
    TEST_ADAPTER: postgresql
    PG_TEST_URL: postgres://postgres:postgres@localhost:5432/rails_js_test
    AR_DB_FORKS: 4
```

and the MySQL mirror inside `mariadb-tests` with `TEST_ADAPTER=mysql2` +
`MYSQL_TEST_URL`. (The exploratory branch implemented these as **separate
jobs** with identical run commands — verified the path filters select exactly
the intended files via `vitest list`. Folding them into the existing jobs is a
trivial relocation; see the prototype diff on PR #2863.)

Why a separate **step** (not folding the dirs into the existing core
`pnpm vitest run packages/activerecord` invocation):

- A separate process avoids the shared-suite table-drop collision above.
- Keeps `AR_DB_FORKS=4` + the PG/MySQL `retry: 2` already configured.
- Reuses the service + build → no extra runner slot vs. a standalone job.

The step must stay **non-blocking** (its own `id` + a `continue-on-error` or a
trailing aggregation) only until the failures below are fixed; once green it is
a hard gate like the rest of the job. **Do not turn the step on as a hard gate
until §4 isolation + §5 bucket fixes land**, or it red-walls every merge.

Decision still open for the owner (see §6): the `mariadb-tests` service is
**MariaDB**, but the MySQL adapter tests encode **MySQL** defaults
(collation, warning text, DDL). Either (a) make the tests dialect-aware, or
(b) add a real `mysql:8` service for the adapter step. This choice gates the
entire MySQL bucket.

---

## 3. Prototype finding (exploratory PR #2863)

Enabling the dirs (separate jobs, blocking) produced **two red jobs**:

- **PostgreSQL Adapter Tests** — ~30 failing assertions across 6 files.
- **MariaDB Adapter Tests** — ~8 failing assertions across 6 files.

Run: `actions/runs/26832246025`. None are caused by the CI wiring; all are
pre-existing test/impl issues the wiring merely exposes. Several PG failures
**pass in isolation** (`pnpm vitest run <one file>`) but fail in the full
4-fork adapter run → cross-file isolation, not logic bugs.

---

## 4. Prerequisite — cross-file test isolation (PG) `[blocker]`

This is the foundational story; most of the PG "schema"/foreign-table/virtual
failures dissolve once it lands. Verified locally: `virtual-column.test.ts`
**passes** alone against a clean `postgres:17`, but fails in CI's combined run.

Symptoms (all PG):

- `error: no schema has been selected to create in` — a file sets a custom
  `search_path` / drops `public` from it and never restores it; a later file
  (or the same file's `createTable`) inherits the broken `search_path`.
- `relation "professors" does not exist` / `relation "public.professors"` —
  `foreign-table.test.ts` rows/tables not visible to the worker that runs them;
  cross-file table-name reuse in a shared per-worker DB.
- `virtual-column.test.ts` stored/virtual columns reporting `isVirtual()=false`
  — schema-cache pollution from a sibling file's `virtual_columns` table.

Fixes to evaluate (pick the minimal that holds):

1. Per-file `search_path` reset in `afterEach`/`afterAll`, and unique
   schema/table names per file (namespace by file).
2. Force-recreate tables with `dropExisting` (the documented per-worker-DB
   collision fix — see the W7 HABTM memory) where files share table names.
3. If isolation proves intractable per-file, run the PG adapter step with
   `--no-file-parallelism` (single fork) — slower but deterministic. Measure
   wall-clock before choosing.

**Done:** the full PG adapter dir set passes in a single 4-fork CI run
(modulo the genuine bugs in §5).

---

## 5. Failure inventory + remediation stories

Each bucket is a candidate ≤500-LOC story. Counts are failing _assertions_
from run `26832246025`. "iso" = expected to resolve via §4.

### PostgreSQL

| #   | Bucket                                                             | Files / tests                                                                                                                                              | Root cause                                                                                                                                                                                 | Likely fix                                                                                                                                                                              |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | **databaseVersion not loaded** (real bug, reproduces in isolation) | `connection-adapters/postgresql/schema-statements.test.ts` — `table options returns empty object`, `…includes comment when set`                            | `tableOptions` → `supportsNativePartitioning` → `databaseVersion` getter throws because the test builds the adapter + `exec()`s without a connect cycle that calls `getDatabaseVersion()`. | Read Rails: PG fetches `postgresql_version` on connect. Either have the schema-introspection path lazily ensure the version, or have the test await a connect/version step. Impl-first. |
| P-2 | **search_path / schema isolation** (iso)                           | `schema.test.ts` `DefaultsUsingMultipleSchemasAndDomainTest` (6), `foreign-table.test.ts` (3), `schema-statements` "no schema selected"                    | §4 search_path leakage                                                                                                                                                                     | §4                                                                                                                                                                                      |
| P-3 | **virtual/stored columns** (iso)                                   | `virtual-column.test.ts` `virtual column`, `stored column`                                                                                                 | §4 schema-cache pollution (passes alone)                                                                                                                                                   | §4; if it persists, schema-cache reset per file                                                                                                                                         |
| P-4 | **schema-dumper: index options**                                   | `schema.test.ts` `SchemaIndexNullsNotDistinctTest` (3), `SchemaIndexNullsOrderTest` (2), `SchemaIndexOpclassTest` (3), `SchemaIndexIncludeColumnsTest` (1) | dump of `nulls_not_distinct` / nulls-order / opclass / include-columns index options — verify real gap vs iso                                                                              | likely tied to Epic 3.3-U `emitTable`→`columnSpec` wiring (see attack-plan); confirm then port                                                                                          |
| P-5 | **schema-dumper: table options**                                   | `schema.test.ts` `SchemaCreateTableOptionsTest` partition/inherited (5), `SchemaTableCommentTest` (1), `SchemaForeignKeyTest` cross-schema (1)             | partition/inheritance/comment table-option dump                                                                                                                                            | same Epic 3.3-U family; confirm                                                                                                                                                         |
| P-6 | **hstore store accessors**                                         | `hstore.test.ts` cast-on-write, store-accessor changes/duplication/saved-changes/with-accessors, schema-dump shorthand (6)                                 | `store_accessor` over hstore returns `undefined` instead of the nested hash; `t.hstore` dump shorthand                                                                                     | real feature: `store`/`store_accessor` on hstore columns. Read `store.rb` + hstore.                                                                                                     |
| P-7 | **change_table column changes**                                    | `change-schema.test.ts` `changing columns`, `changing column null with default`                                                                            | `Unknown definition type: ChangeColumnDefinition` — CommandRecorder / bulk-change path doesn't handle `ChangeColumnDefinition`                                                             | port `ChangeColumnDefinition` handling in the PG bulk-alter / change_table path                                                                                                         |
| P-8 | **network IPv4-mapped IPv6**                                       | `network.test.ts` `invalid network address`                                                                                                                | `expected {address,prefixLength}` to match `::ffff:192.168.0.1`                                                                                                                            | inet/cidr parse of IPv4-mapped IPv6; 1 assertion — verify vs PG version                                                                                                                 |

### MySQL / MariaDB

| #   | Bucket                             | Files / tests                                                                                                                                                        | Root cause                                                                                                                     | Likely fix                                                                                    |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| M-1 | **default collation divergence**   | `charset-collation.test.ts` change-preserves-collation, `schema.test.ts` `schema`, `active-schema.test.ts` `indexes in create`, `case-sensitivity.test.ts` cs/ci (4) | MariaDB default = `utf8mb4_bin`; tests expect MySQL `utf8mb4_unicode_ci` (`expected 'utf8mb4_bin' to be 'utf8mb4_unicode_ci'`) | **§6 decision**: dialect-aware assertions, or pin server collation, or real `mysql:8` service |
| M-2 | **warning message text**           | `warnings.test.ts` `db_warnings_action handles when warning_count does not match` (and one more)                                                                     | curly-quote divergence: MariaDB `‘SHOW W…’` vs MySQL `'SHOW W…'`                                                               | dialect-aware / normalize quotes in assertion                                                 |
| M-3 | **temp-table index DDL**           | `active-schema.test.ts` `indexes in create` (overlaps M-1)                                                                                                           | `CREATE TEMPORARY TABLE \`temp\` (INDEX…)` formatting differs on MariaDB                                                       | dialect-aware DDL expectation                                                                 |
| M-4 | **invalid-charset throw** (unit)   | `connection-adapters/mysql2-adapter.test.ts` `_buildInitSql throws for invalid charset`                                                                              | `expected [Function] to throw` — unit test, no DB; charset validation path differs                                             | read `_buildInitSql`; confirm whether validation should throw                                 |
| M-5 | **bootstrap: Relation not loaded** | 3 assertions: `Error: Relation not loaded. Import relation.ts first.`                                                                                                | import/setup ordering in the adapter step's first file                                                                         | ensure adapter step setup imports `relation.ts` (likely a setup-file ordering fix, small)     |

---

## 6. Open decisions for the owner

1. **MariaDB vs MySQL for the MySQL adapter step.** The M-1..M-3 bucket is
   entirely dialect divergence. Cheapest correct option is usually a real
   `mysql:8` service for the adapter step (the tests are MySQL-authored), but
   that diverges from the existing `mariadb-tests` service. Alternative:
   dialect-aware assertions (more code, but covers both backends). **Pick
   before starting M-1.**
2. **Non-blocking rollout vs. hold.** Until §4 + §5 land, the adapter step must
   not hard-gate. Options: (a) advisory `continue-on-error` step now (lane runs,
   surfaces regressions, doesn't block); (b) keep the dirs out of CI until the
   buckets are green, then turn on as a hard gate in one PR. (a) gives earlier
   signal; (b) avoids a perpetually-yellow job.

---

## 7. Suggested ordering

1. **§4 PG isolation** (blocker; clears P-2, P-3, much of P-5).
2. **P-1** databaseVersion (small, isolated, real bug).
3. **M-5** Relation-not-loaded bootstrap (small).
4. **§6.1 decision**, then **M-1 / M-2 / M-3 / M-4** MySQL dialect cluster.
5. **P-4 / P-5** schema-dumper index/table options (coordinate with Epic 3.3-U).
6. **P-6** hstore store accessors, **P-7** change_table, **P-8** network.
7. **Turn the step into a hard gate** inside `postgres-tests` / `mariadb-tests`
   (the ~40-LOC wiring; relocate from PR #2863's prototype jobs).

---

## 8. Local verification recipe

No per-worktree DB is auto-created. Spin one up and target the dirs:

```sh
# Postgres
docker run -d --name <slug>-pg -e POSTGRES_DB=rails_js_test \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p <port>:5432 postgres:17
TEST_ADAPTER=postgresql PG_TEST_URL="postgres://postgres:postgres@localhost:<port>/rails_js_test" \
  pnpm vitest run packages/activerecord/src/adapters/postgresql \
  packages/activerecord/src/connection-adapters/postgresql

# MariaDB (note §6.1: real behavior may need mysql:8)
docker run -d --name <slug>-my -e MARIADB_DATABASE=rails_js_test \
  -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=yes -p <port>:3306 mariadb:11
TEST_ADAPTER=mysql2 MYSQL_TEST_URL="mysql://root@localhost:<port>/rails_js_test" \
  pnpm vitest run packages/activerecord/src/adapters/abstract-mysql-adapter \
  packages/activerecord/src/adapters/mysql2 \
  packages/activerecord/src/connection-adapters/mysql
```

Run a single file alone first to distinguish a real bug from a §4 isolation
collision (`docker compose` env interpolation was unreliable on this host —
use raw `docker run`).
