# Adapter-test CI coverage plan (PG + MySQL `adapters/<db>/**`)

**Status:** in progress. Supersedes the original "Story I-5 — add a dedicated
`TEST_ADAPTER` job" framing in
[`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md).

**Goal (per owner):** get the live-DB `adapters/postgresql/**` and MySQL adapter
dirs running **green in CI by extending the existing
`postgres-tests` / `mysql-tests` jobs** — _not_ by adding a separate
adapter-only job path. The ~40-LOC wiring is the last step, after the remaining
bucket fixes below land.

**Progress:** the exploratory probe surfaced ~38 pre-existing failures; bucket
fixes have brought that down to **9** (run `26880196064`): **PG 6** (P-9) +
**MySQL 3** (M-1a/M-1b). Everything else is resolved — this doc tracks only what
remains.

---

## 1. Current state

`vitest.config.ts` (`ADAPTER_SPECIFIC_EXCLUDE`, unconditional since PR #2897)
excludes the live-DB suites from the shared `pnpm vitest run packages/activerecord/`
invocation:

```
adapters/postgresql/**, tasks/postgresql-*.test.ts,
adapters/abstract-mysql-adapter/**, adapters/mysql2/**,
connection-adapters/mysql2-*.test.ts, tasks/mysql-*.test.ts
```

They must not interleave with the shared suite (adapter-specific files build
their own adapter and assume their tables survive a `describe`, while the shared
suite drops tables). The pure-unit `connection-adapters/{postgresql,mysql,sqlite3}/**`
subdirs are **not** excluded and already run on every job. SQLite adapter dirs
also already run (default backend).

The exploratory branch `tc100-i5-test-compare-100-phase-1-story` (PR #2863,
**do-not-merge**) measures the excluded dirs via a `RUN_ADAPTER_DIRS=1` env gate
that drops `ADAPTER_SPECIFIC_EXCLUDE` in a dedicated vitest process, plus two
`*-adapter-tests` jobs (postgres:17 / mysql:8). It is rebased onto `main`
periodically to re-measure. Latest run `26880196064`: **PG 6, MySQL 3** (both
expected-red until the buckets below land).

---

## 2. Target architecture — extend the existing jobs

Add a second vitest **step** to the existing `postgres-tests` and `mysql-tests`
jobs (reusing the same service container, checkout, and `pnpm build`) — instead
of new top-level `*-adapter-tests` jobs. It must (a) run in its **own vitest
process** (never interleaved with the shared suite — see §1), and (b) drop
`ADAPTER_SPECIFIC_EXCLUDE` for that process. The exploratory probe does this
with `RUN_ADAPTER_DIRS=1`; productionizing means either keeping that env gate or
a dedicated config. Conceptually:

```yaml
# inside postgres-tests, after the core `pnpm vitest run packages/activerecord/` step:
- run: >
    pnpm vitest run
    packages/activerecord/src/adapters/postgresql
    packages/activerecord/src/connection-adapters/postgresql
    packages/activerecord/src/tasks/postgresql-database-tasks.test.ts
  env:
    RUN_ADAPTER_DIRS: "1"
    PG_TEST_URL: postgres://postgres:postgres@localhost:5432/rails_js_test
    AR_DB_FORKS: 4
```

The MySQL mirror inside `mysql-tests` uses `MYSQL_TEST_URL` + the filter list
`adapters/abstract-mysql-adapter`, `adapters/mysql2`, `connection-adapters/mysql`,
**and `tasks/mysql-database-tasks.test.ts`**. The `tasks/` file must be listed
explicitly — vitest positional filters are substring matches and no dir prefix
is a substring of `tasks/mysql-…` (the hyphenated `connection-adapters/<db>-*.test.ts`
files _are_ covered, since `connection-adapters/mysql` is a substring of
`connection-adapters/mysql2-adapter.test.ts`). The PG step lists
`tasks/postgresql-database-tasks.test.ts` for the same reason.

Why a separate **step** (not folding the dirs into the core invocation): a
separate process avoids the shared-suite table-drop collision; keeps
`AR_DB_FORKS=4` + the PG/MySQL `retry: 2`; reuses the service + build (no extra
runner slot). Keep it **non-blocking** (`continue-on-error`) until the §3
buckets are green, then flip to a hard gate — see §4.

---

## 3. Remaining failures (run `26880196064`)

Counts are de-duplicated vitest "Failed Tests" totals. Re-confirm each bucket
against current `main` before scoping it (the set drifts as fixes land).

### PostgreSQL — 6 failed

| #   | Bucket                            | Files / tests                                                                                                                                                                 | Root cause                                                                                                                                                                              | Likely fix                                                                                                          |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P-9 | **schema-dumper: type shorthand** | `serial.test.ts` shorthand / not-bigserial / collided-sequence / long-table-name (4), `array.test.ts` `schema dump with shorthand` (1), `bit-string.test.ts` `bit string` (1) | dumper doesn't emit the shorthand DSL (`t.serial`/`t.bigserial`, `t.bitVarying`, array shorthand) — emits the raw `// These are extensions…` fallback instead. All fail **standalone**. | Epic 3.3-U `emitTable`/column-spec family — emit the shorthand for serial/bigserial/bit-varying/array column types. |

### MySQL — 3 failed (mysql:8)

| #    | Bucket                                                                   | Files / tests                                                                                                          | Root cause                                                                                                                                                                                                                                                                                                       | Likely fix                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1a | **charset/collation not propagated by addColumn/changeColumn**           | `charset-collation.test.ts` `change column preserves collation for string to text` (1; the `add column…` case cleared) | `addColumn`/`changeColumn` produce DDL without CHARACTER SET / COLLATE, so the column gets the DB default (`utf8mb4_0900_ai_ci` on mysql:8). The included `addColumn` mixin uses the base `SchemaCreation`, not `MysqlSchemaCreation`, so its CHARACTER SET / COLLATE branches never fire. Not dialect-specific. | Route the included `addColumn`/`changeColumn` mixins through `MysqlSchemaCreation`. ~30–50 LOC.                                                               |
| M-1b | **`isCaseSensitive()` + uniqueness validator LOWER/BINARY path missing** | `case-sensitivity.test.ts` `case insensitive comparison for cs column` + `case sensitive comparison for ci column` (2) | For a `utf8mb4_bin` column with `caseSensitive: false` the uniqueness query should wrap the column in `LOWER()`; for `utf8mb4_general_ci` with `caseSensitive: true` it should use `BINARY`. Both emit a plain WHERE — `isCaseSensitive()` isn't wired into the validator. Not dialect-specific.                 | Implement `isCaseSensitive()` on the MySQL `Column` class (consult `collation`) and wire it into `validates_uniqueness_of` LOWER/BINARY emission. ~30–50 LOC. |

---

## 4. Remaining steps

1. **P-9** — PG schema-dump type shorthand (Epic 3.3-U family).
2. **M-1a** — addColumn/changeColumn charset propagation (~30–50 LOC).
3. **M-1b** — `isCaseSensitive()` + uniqueness LOWER/BINARY wiring (~30–50 LOC).
4. **Wire the lane in** (~40 LOC) — add the adapter-dir step to `postgres-tests`
   / `mysql-tests` (relocate from PR #2863's prototype jobs). Open decision:
   land it **non-blocking** (`continue-on-error`) first for early signal, or
   hold until P-9 + M-1a + M-1b are green and turn it on as a hard gate in one
   PR. Recommend non-blocking once PG is green (P-9), so PG regressions are
   caught while M-1 lands.

---

## 5. Local verification recipe

No per-worktree DB is auto-created. Spin one up, set `RUN_ADAPTER_DIRS=1`, and
target the dirs:

```sh
# Postgres
docker run -d --name <slug>-pg -e POSTGRES_DB=rails_js_test \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p <port>:5432 postgres:17
RUN_ADAPTER_DIRS=1 PG_TEST_URL="postgres://postgres:postgres@localhost:<port>/rails_js_test" \
  pnpm vitest run packages/activerecord/src/adapters/postgresql \
  packages/activerecord/src/connection-adapters/postgresql \
  packages/activerecord/src/tasks/postgresql-database-tasks.test.ts

# MySQL 8 (matches CI; docker-compose uses the same image)
docker run -d --name <slug>-my -e MYSQL_DATABASE=rails_js_test \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -p <port>:3306 mysql:8
RUN_ADAPTER_DIRS=1 MYSQL_TEST_URL="mysql://root@localhost:<port>/rails_js_test" \
  pnpm vitest run packages/activerecord/src/adapters/abstract-mysql-adapter \
  packages/activerecord/src/adapters/mysql2 \
  packages/activerecord/src/connection-adapters/mysql \
  packages/activerecord/src/tasks/mysql-database-tasks.test.ts
```

Run a single file alone first to distinguish a real bug from an isolation
collision (`docker compose` env interpolation was unreliable on this host —
use raw `docker run`).

> **Note:** the `RUN_ADAPTER_DIRS` env gate currently lives only on the
> exploratory branch `tc100-i5-test-compare-100-phase-1-story` (it is not on
> `main` yet). Check that branch out to use the recipe above, or temporarily
> delete the relevant entries from `ADAPTER_SPECIFIC_EXCLUDE` in
> `vitest.config.ts`. Productionizing the gate is part of step 4 in §4.
