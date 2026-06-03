# Adapter-test CI coverage plan (PG + MySQL `adapters/<db>/**`)

**Status:** Story I-5 wired in — adapter dirs now run inside the core jobs via
`TEST_ADAPTER`. Supersedes the original "Story I-5 — add a dedicated
`TEST_ADAPTER` job" framing in
[`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md).

**Goal (per owner):** get the live-DB `adapters/postgresql/**` and MySQL adapter
dirs running **green in CI by extending the existing
`postgres-tests` / `mysql-tests` jobs** — _not_ by adding a separate
adapter-only job path. The ~40-LOC wiring is the last step, after the remaining
bucket fixes below land.

**Progress:** the exploratory probe surfaced ~38 pre-existing failures; bucket
fixes have brought that down to **0**. PG (P-9, P-money) and MySQL (M-1a/M-1b)
all resolved. Story I-5 wired in (this PR). CI is the proof — see §4.

---

## 1. Current state

`vitest.config.ts` uses a `TEST_ADAPTER`-keyed `ADAPTER_SPECIFIC_EXCLUDE`
(Rails model). Each backend's adapter dirs run inside the core
`pnpm vitest run packages/activerecord/` invocation when `TEST_ADAPTER` selects
that backend; the other backends' dirs are excluded.

- `TEST_ADAPTER=postgresql` (postgres-tests job) → runs `adapters/postgresql/**`
  and `tasks/postgresql-*.test.ts`; excludes MySQL + sqlite3 adapter dirs.
- `TEST_ADAPTER=mysql2` (mysql-tests job) → runs the MySQL adapter dirs;
  excludes PG + sqlite3 adapter dirs.
- unset / sqlite3 (sqlite-tests job) → runs `adapters/sqlite3/**` and
  `tasks/sqlite-*.test.ts`; excludes PG + MySQL adapter dirs.

The pure-unit `connection-adapters/{postgresql,mysql,sqlite3}/**` subdirs
are **not** in `ADAPTER_SPECIFIC_EXCLUDE` and run on every CI job.

The exploratory branch `tc100-i5-test-compare-100-phase-1-story` (PR #2863,
**do-not-merge, to be closed**) used a `RUN_ADAPTER_DIRS=1` env gate and
separate `*-adapter-tests` jobs as a measurement probe. That approach is
superseded by the `TEST_ADAPTER` model landed here.

---

## 2. Architecture — extend the existing jobs

`TEST_ADAPTER` is set in the `env:` block of the existing
`pnpm vitest run packages/activerecord/` step in each job:

```yaml
# postgres-tests job
- run: pnpm vitest run packages/activerecord/
  env:
    TEST_ADAPTER: postgresql
    PG_TEST_URL: postgres://postgres:postgres@localhost:5432/rails_js_test
    AR_DB_FORKS: 4

# mysql-tests job
- run: pnpm vitest run packages/activerecord/
  env:
    TEST_ADAPTER: mysql2
    MYSQL_TEST_URL: mysql://root@localhost:3306/rails_js_test
    AR_DB_FORKS: 4
```

`vitest.config.ts` reads `TEST_ADAPTER` and excludes the other two backends'
adapter dirs, so the adapter-specific files for the selected backend are
included in the single shared invocation. The existing `AR_DB_FORKS`,
`PG_TEST_URL`/`MYSQL_TEST_URL`, and `retry: 2` settings apply to the whole
run (adapter dirs + shared suite in one process).

The combined run is the key risk versus the probe's separate-process approach:
see the §3 bucket table for the pre-existing failures that were resolved before
this wiring landed. The `postgres-tests` and `mysql-tests` CI jobs for this PR
are the proof that the combined run is clean.

---

## 3. Remaining failures (run `26880196064`)

Counts are de-duplicated vitest "Failed Tests" totals. Re-confirm each bucket
against current `main` before scoping it (the set drifts as fixes land).

### PostgreSQL — 0 failed ✓

| #           | Bucket                            | Files / tests                                                           | Root cause                                                                                                                                | Fix                                                                                                                                            |
| ----------- | --------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~P-9~~     | ~~schema-dumper: type shorthand~~ | ~~`serial.test.ts` (4), `array.test.ts` (1), `bit-string.test.ts` (1)~~ | ~~dumper didn't emit shorthand DSL for serial/bigserial/bitVarying/array~~                                                                | Resolved: `isDefaultPrimaryKey` widened to include `"serial"`.                                                                                 |
| ~~P-money~~ | ~~schema-dumper: money default~~  | ~~`money.test.ts` (1), `schema.test.ts` (1)~~                           | ~~`splitPgDefault` regex `[\w"\s.]+` can't span `::` in multi-cast chains; `(150.55)::numeric::money` was treated as a function default~~ | Resolved: regex changed to `(?:::[\w"\s.]+)+` in `splitPgDefault`; test assertion updated to Rails order (`scale` before `default: "150.55"`). |

### MySQL — 0 failed ✓

M-1a and M-1b resolved. See §4 for next steps.

---

## 4. Story I-5 status

All pre-existing failures resolved; lane wired in via `TEST_ADAPTER` (this PR).

1. ~~**P-9**~~ — resolved.
2. ~~**P-money**~~ — resolved.
3. ~~**M-1a**~~ — resolved.
4. ~~**M-1b**~~ — resolved.
5. ~~**Wire the lane in**~~ — done. `TEST_ADAPTER=postgresql` / `mysql2` set on
   the core `pnpm vitest run packages/activerecord/` steps in each job. The
   combined run (adapter dirs + shared suite, one vitest process) is verified
   by the `postgres-tests` and `mysql-tests` CI jobs on this PR.

---

## 5. Local verification recipe

No per-worktree DB is auto-created. Spin one up, set `TEST_ADAPTER`, and run
the full package (adapter dirs will be included for the selected backend):

```sh
# Postgres — full shared suite + adapters/postgresql/** in one invocation
docker run -d --name <slug>-pg -e POSTGRES_DB=rails_js_test \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p <port>:5432 postgres:17
TEST_ADAPTER=postgresql PG_TEST_URL="postgres://postgres:postgres@localhost:<port>/rails_js_test" \
  AR_DB_FORKS=4 pnpm vitest run packages/activerecord/

# MySQL 8 (matches CI; docker-compose uses the same image)
docker run -d --name <slug>-my -e MYSQL_DATABASE=rails_js_test \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -p <port>:3306 mysql:8
TEST_ADAPTER=mysql2 MYSQL_TEST_URL="mysql://root@localhost:<port>/rails_js_test" \
  AR_DB_FORKS=4 pnpm vitest run packages/activerecord/

# SQLite (adapter dirs run by default when TEST_ADAPTER is unset)
pnpm vitest run packages/activerecord/
```

Run a single adapter file alone first to distinguish a real bug from an
isolation collision:

```sh
TEST_ADAPTER=postgresql PG_TEST_URL="..." \
  pnpm vitest run packages/activerecord/src/adapters/postgresql/schema.test.ts
```
