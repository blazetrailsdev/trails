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
real work is the pre-existing test failures those dirs surface, which were
never CI-gated — **~38 at the prototype, down to 21 today** (PG 15 + MariaDB 6,
run `26840617668`) as bucket-fixes land on `main`. They fell into two
structural buckets — **cross-file test isolation** (PG, now **resolved**, §4)
and **MariaDB-vs-MySQL dialect divergence** (MySQL, all 6 remaining MariaDB
failures) — plus genuine impl/feature gaps (PG schema-dump shorthand, hstore
store accessors, virtual-column `createTable`, network). This doc inventories
every failure, groups them into ≤500-LOC remediation stories (§5), tracks
progress (§3), and orders the remaining work (§7) so the CI lane can be turned
on green.

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
`MYSQL_TEST_URL`, whose filter list is
`adapters/abstract-mysql-adapter`, `adapters/mysql2`,
`connection-adapters/mysql`, **and `tasks/mysql-database-tasks.test.ts`**.
The `tasks/` file must be listed explicitly: vitest positional filters are
substring matches, and none of the dir prefixes is a substring of
`tasks/mysql-…` (the hyphenated `connection-adapters/<db>-*.test.ts` files
_are_ covered, since `connection-adapters/mysql` is a substring of
`connection-adapters/mysql2-adapter.test.ts`). The PG step lists
`tasks/postgresql-database-tasks.test.ts` for the same reason. (The
exploratory branch implemented these as **separate jobs** — its MariaDB job
already included the `tasks/mysql` file — and verified the filters select
exactly the intended files via `vitest list`. Folding them into the existing
jobs is a trivial relocation; see the prototype diff on PR #2863.)

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

## 3. Prototype finding (exploratory PR #2863) + progress

Enabling the dirs (separate jobs, blocking) produced two red jobs. None are
caused by the CI wiring; all are pre-existing test/impl issues the wiring
merely exposes. The exploratory branch is rebased onto `main` periodically to
re-measure as bucket-fixes land — the backlog is shrinking on its own:

| Run (rebased onto `main`)                     | PostgreSQL | MariaDB | What moved                                  |
| --------------------------------------------- | ---------- | ------- | ------------------------------------------- |
| `26832246025` (prototype)                     | ~30        | ~8      | baseline                                    |
| _(inferred — no single run)_ §4+3.3-U+visitor | 15         | 7       | P-2/P-4/P-5 (search_path), P-1, P-7 cleared |
| `26840617668` (current)                       | **15**     | **6**   | M-5 cleared (#2879 — `Relation` preload)    |

The middle row is an **inferred** intermediate state (the net of fixes that
landed between the two measured runs), not a single rebase run — don't look for
it in CI history. Only the prototype and current rows correspond to real runs.

**Current (run `26840617668`):**

- **PostgreSQL — 15 failed:** P-3 virtual-column (2), P-6 hstore (6), P-8
  network (1), P-9 schema-dump shorthand — `serial` (4), `array` (1),
  `bit-string` (1). All reproduce **standalone** (the isolation buckets are
  gone), so these are genuine impl/feature gaps.
- **MariaDB — 6 failed:** the dialect cluster only, spanning M-1 collation
  (`charset-collation`, `case-sensitivity`), M-2 warnings, M-3 temp-table DDL
  (`active-schema`), and M-4 `_buildInitSql` throw (`mysql2-adapter`). Gated on
  the §6.1 MariaDB-vs-`mysql:8` decision.

Counts are de-duplicated vitest "Failed Tests" totals (the raw logs inflate
~3× via `retry: 2`). Re-run after any adapter-relevant merge.

---

## 4. Prerequisite — cross-file test isolation (PG) `[blocker]` — **DONE**

This is the foundational story; most of the PG "schema"/foreign-table failures
dissolve once it lands. **Shipped** (search_path restore + `dropExisting`);
re-confirmed against current `main` — the symptom breakdown below is what
actually reproduced, which diverged from the original prototype-run guesses.

Symptoms (all PG) and what they actually were:

- `error: no schema has been selected to create in` — **confirmed search_path
  leak**, but _within_ `schema.test.ts`, not across files. `SchemaTest`
  mutated the shared connection's `search_path` to schemas it later dropped in
  teardown and never restored it, so every later unqualified `CREATE TABLE`
  (in sibling describes — `DefaultsUsing…`, and the schema-dumper describes that
  §5 mis-filed as P-4/P-5) failed. Because the PG connection is shared per
  worker, the leak would also poison sibling adapter files in the same worker.
  **Fix:** capture the default `search_path` in `beforeAll` and restore it in a
  top-level `afterEach` (mirrors Rails `schema_test.rb`). Resolves P-2, **P-4,
  and P-5** (all of which passed standalone — they were never schema-dumper
  gaps). Audited the other search_path mutators: `enum.test.ts` uses txn-scoped
  `SET LOCAL`, `schema-statements.test.ts` uses its own closed adapter, and
  `schema-authorization.test.ts` already `RESET`s — so `schema.test.ts` was the
  sole leaker.
- `relation "professors" does not exist` — **NOT cross-file table reuse.**
  `foreign-table.test.ts` passed every test _alone_ but failed the 2nd+ write
  test in-sequence: `afterEach` drops `professors`, but the next `beforeEach`'s
  `defineSchema({professors})` hit the signature-cache fast-path and skipped
  recreation (the documented per-worker-DB collision — W7 HABTM memory).
  **Fix:** `defineSchema(…, { dropExisting: true })`. (The local-only
  `could not connect to server "foreign_server"` is a docker port-mapping
  artifact: the loopback FDW dials the URL's host:port, which must be reachable
  from inside the PG container. In CI `localhost:5432` loopbacks fine; locally
  use the container's bridge IP, not the mapped host port.)
- `virtual-column.test.ts` `isVirtual()=false` — **NOT isolation; a genuine
  `createTable` impl gap.** Reproduces standalone on a clean DB: `createTable`
  emits DDL via `TableDefinition#toSql()` (schema-definitions.ts), which has no
  `GENERATED ALWAYS AS (…) STORED` branch, so `attgenerated` comes back empty.
  (The `change table` test passes because `addColumn` routes through
  `SchemaCreation.accept` → PG `addColumnOptionsBang`, which _does_ emit the
  generated clause.) **Out of scope for this isolation story** — reclassified as
  a §5 genuine bug (see P-3). Fix belongs in a separate impl PR: route
  `createTable` through `SchemaCreation`, or teach `toSql()` the generated
  clause.

**Done:** `schema.test.ts` 74/74 and `foreign-table.test.ts` 9/9 green, both
standalone and co-run single-fork; the only residual failures in the combined
PG dir run are the 2 virtual-column assertions (P-3, genuine).

---

## 5. Failure inventory + remediation stories

Each bucket is a candidate ≤500-LOC story. Status reflects run
**`26840617668`** (current); original counts were from prototype run
`26832246025`. The set **drifts as unrelated fixes land on `main`** — re-confirm
each bucket before scoping it (P-1/P-7/M-5 are worked examples: all resolved by
fixes that landed after the prototype). "iso" = was a §4 isolation artifact.

### PostgreSQL

| #   | Bucket                                                              | Files / tests                                                                                                                                                                       | Root cause                                                                                                                                                                                                                                                                                                                              | Likely fix                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | **databaseVersion not loaded** — **RESOLVED on `main`**             | `connection-adapters/postgresql/schema-statements.test.ts` — `table options returns empty object`, `…includes comment when set`                                                     | `tableOptions` → `supportsNativePartitioning` → `databaseVersion` getter threw because the test built the adapter + `exec()`d without a connect cycle that called `getDatabaseVersion()`.                                                                                                                                               | Fixed: no longer failing as of run `26840617668` (the schema-introspection path now lazily ensures the version, mirroring Rails' lazy+memoized `pool.server_version(self)` → `get_database_version`). No further work.                                                       |
| P-2 | **search_path / schema isolation** (iso) — **DONE §4**              | `schema.test.ts` `DefaultsUsingMultipleSchemasAndDomainTest` (6), `foreign-table.test.ts` (3)                                                                                       | search_path leak in `schema.test.ts` (within-file + cross-file via shared conn); foreign-table `defineSchema` cache-skip                                                                                                                                                                                                                | §4 — search_path restore in `afterEach` + `dropExisting: true`. **Shipped.**                                                                                                                                                                                                 |
| P-3 | **virtual/stored columns** — **genuine `createTable` bug, NOT iso** | `virtual-column.test.ts` `virtual column`, `stored column`                                                                                                                          | `createTable` → `TableDefinition#toSql()` never emits `GENERATED ALWAYS AS (…) STORED`, so generated columns are created as plain columns (`attgenerated=''`). Reproduces standalone on a clean DB. `addColumn`/`changeTable` route through `SchemaCreation` and work.                                                                  | **Separate impl PR.** Route `createTable` through `SchemaCreation`, or add the generated-clause branch to `toSql()`. Mirror `PostgreSQL::SchemaCreation#add_column_options!`.                                                                                                |
| P-4 | **schema-dumper: index options** — **RESOLVED by §4 (was iso)**     | `schema.test.ts` `SchemaIndexNullsNotDistinctTest` (3), `SchemaIndexNullsOrderTest` (2), `SchemaIndexOpclassTest` (3), `SchemaIndexIncludeColumnsTest` (1)                          | NOT a schema-dumper gap — all pass standalone; only failed because `SchemaTest`'s leaked search_path broke their unqualified `CREATE TABLE`.                                                                                                                                                                                            | resolved by the §4 search_path restore; no Epic 3.3-U work needed                                                                                                                                                                                                            |
| P-5 | **schema-dumper: table options** — **RESOLVED by §4 (was iso)**     | `schema.test.ts` `SchemaCreateTableOptionsTest` partition/inherited (5), `SchemaTableCommentTest` (1), `SchemaForeignKeyTest` cross-schema (1)                                      | same as P-4 — search_path pollution, not a dump gap; pass standalone                                                                                                                                                                                                                                                                    | resolved by the §4 search_path restore                                                                                                                                                                                                                                       |
| P-6 | **hstore store accessors**                                          | `hstore.test.ts` cast-on-write, store-accessor changes/duplication/saved-changes/with-accessors, schema-dump shorthand (6)                                                          | `store_accessor` over hstore returns `undefined` instead of the nested hash; `t.hstore` dump shorthand                                                                                                                                                                                                                                  | real feature: `store`/`store_accessor` on hstore columns. Read `store.rb` + hstore.                                                                                                                                                                                          |
| P-7 | **change_table column changes** — **RESOLVED on `main`**            | `change-schema.test.ts` `changing columns`, `changing column null with default`                                                                                                     | Prototype run hit `Unknown definition type: ChangeColumnDefinition`, but that base predated the fix. The visitor exists on `main` (`connection-adapters/postgresql/schema-creation.ts:232` `accept()` → `visitChangeColumnDefinition`); `change-schema.test.ts` passes 16/16 in isolation and is not in the run-`26840617668` failures. | None — confirmed resolved. Was never a missing-visitor bug. **Re-confirmed 2026-06-02:** 16/16 isolated + 16/16 in combined full-dir run (postgres:17 local). Not among the 36 combined failures; other failures are genuine impl gaps (P-3/P-6/P-9) or isolation artifacts. |
| P-8 | **network IPv4-mapped IPv6** — **RESOLVED (#2881)**                 | `network.test.ts` `invalid network address`                                                                                                                                         | `canonicalizeIpv6` converted IPv4-tailed IPv6 (`::ffff:192.168.0.1`) to all-hex notation; PG and Ruby's `IPAddr#to_s` use mixed notation for IPv4-mapped addresses.                                                                                                                                                                     | Fixed in #2881: preserve the IPv4 tail; apply RFC 5952 only to the 6-group hex prefix, reattach tail. Also normalizes pure-hex IPv4-mapped inputs. Updated stale `oid/cidr.test.ts` assertion.                                                                               |
| P-9 | **schema-dumper: type shorthand** (genuine, found during §4)        | `serial.test.ts` schema-dump shorthand/not-bigserial/collided-sequence/long-table-name (4), `array.test.ts` `schema dump with shorthand` (1), `bit-string.test.ts` `bit string` (1) | dumper doesn't emit the shorthand DSL (`t.serial`/`t.bigserial`, `t.bitVarying`, array shorthand). All fail **standalone** (not iso). Surfaced by the §4 single-fork validation; not in the prototype inventory.                                                                                                                        | same Epic 3.3-U `emitTable`/column-spec family as P-4/P-5's original (mis)diagnosis — but these are real dumper gaps. Confirm + port.                                                                                                                                        |

### MySQL / MariaDB

| #   | Bucket                                                    | Files / tests                                                                                                                                                        | Root cause                                                                                                                     | Likely fix                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | **default collation divergence**                          | `charset-collation.test.ts` change-preserves-collation, `schema.test.ts` `schema`, `active-schema.test.ts` `indexes in create`, `case-sensitivity.test.ts` cs/ci (4) | MariaDB default = `utf8mb4_bin`; tests expect MySQL `utf8mb4_unicode_ci` (`expected 'utf8mb4_bin' to be 'utf8mb4_unicode_ci'`) | **§6 decision**: dialect-aware assertions, or pin server collation, or real `mysql:8` service                                                                                                                                                                               |
| M-2 | **warning message text**                                  | `warnings.test.ts` `db_warnings_action handles when warning_count does not match` (and one more)                                                                     | curly-quote divergence: MariaDB `‘SHOW W…’` vs MySQL `'SHOW W…'`                                                               | dialect-aware / normalize quotes in assertion                                                                                                                                                                                                                               |
| M-3 | **temp-table index DDL**                                  | `active-schema.test.ts` `indexes in create` (overlaps M-1)                                                                                                           | `CREATE TEMPORARY TABLE \`temp\` (INDEX…)` formatting differs on MariaDB                                                       | dialect-aware DDL expectation                                                                                                                                                                                                                                               |
| M-4 | **invalid-charset throw** (unit)                          | `connection-adapters/mysql2-adapter.test.ts` `_buildInitSql throws for invalid charset`                                                                              | `expected [Function] to throw` — unit test, no DB; charset validation path differs                                             | read `_buildInitSql`; confirm whether validation should throw                                                                                                                                                                                                               |
| M-5 | **bootstrap: Relation not loaded** — **RESOLVED (#2879)** | `Error: Relation not loaded. Import relation.ts first.` (also poisoned `schema.test.ts`)                                                                             | import/setup ordering in the adapter step's first file                                                                         | Fixed in #2879 — `test-setup-dy.ts` preloads `Relation`. 0 occurrences as of run `26840617668`. **Net MariaDB 7 → 6 (−1):** of the 3 M-5 assertion failures, 2 overlapped tests already failing for M-1/M-3 reasons (incl. `schema.test.ts`), leaving only 1 unique to M-5. |

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

1. **§4 PG isolation** (blocker) — **DONE.** Cleared P-2, **P-4, P-5**.
   Reclassified P-3 (virtual-column) as a genuine `createTable` bug, not iso.
2. ~~**P-1** databaseVersion~~ — **DONE** (resolved on `main`).
3. ~~**M-5** Relation-not-loaded bootstrap~~ — **DONE** (#2879).
4. ~~**P-7** change_table~~ — **DONE** (visitor already on `main`).
5. **§6.1 decision**, then **M-1 / M-2 / M-3 / M-4** MySQL dialect cluster (all 6
   remaining MariaDB failures).
6. **P-9** schema-dump type shorthand (serial/array/bit-string — Epic 3.3-U family).
7. ~~**P-8** network IPv4-mapped IPv6~~ — **DONE** (#2881).
8. **P-3** virtual-column `createTable` generated-clause, **P-6** hstore store
   accessors, **P-9** schema-dump type shorthand.
9. **Turn the step into a hard gate** inside `postgres-tests` / `mariadb-tests`
   (the ~40-LOC wiring; relocate from PR #2863's prototype jobs). Remaining
   before this: PG **14** (P-3, P-6, P-9), MariaDB **6** (M-1..M-4).

---

## 8. Local verification recipe

No per-worktree DB is auto-created. Spin one up and target the dirs:

```sh
# Postgres
docker run -d --name <slug>-pg -e POSTGRES_DB=rails_js_test \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p <port>:5432 postgres:17
TEST_ADAPTER=postgresql PG_TEST_URL="postgres://postgres:postgres@localhost:<port>/rails_js_test" \
  pnpm vitest run packages/activerecord/src/adapters/postgresql \
  packages/activerecord/src/connection-adapters/postgresql \
  packages/activerecord/src/tasks/postgresql-database-tasks.test.ts

# MariaDB (note §6.1: real behavior may need mysql:8)
docker run -d --name <slug>-my -e MARIADB_DATABASE=rails_js_test \
  -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=yes -p <port>:3306 mariadb:11
TEST_ADAPTER=mysql2 MYSQL_TEST_URL="mysql://root@localhost:<port>/rails_js_test" \
  pnpm vitest run packages/activerecord/src/adapters/abstract-mysql-adapter \
  packages/activerecord/src/adapters/mysql2 \
  packages/activerecord/src/connection-adapters/mysql \
  packages/activerecord/src/tasks/mysql-database-tasks.test.ts
```

Run a single file alone first to distinguish a real bug from a §4 isolation
collision (`docker compose` env interpolation was unreliable on this host —
use raw `docker run`).
