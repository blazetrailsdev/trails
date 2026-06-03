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
fixes have brought that down to **0**. PG (P-9, P-money) and MySQL (M-1a/M-1b)
all resolved. Everything else is resolved — this doc tracks only what remains.

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
    packages/activerecord/src/tasks/postgresql-database-tasks.test.ts
  env:
    RUN_ADAPTER_DIRS: "1"
    PG_TEST_URL: postgres://postgres:postgres@localhost:5432/rails_js_test
    AR_DB_FORKS: 4
```

The PG step lists only the two **excluded** targets (`adapters/postgresql/**`
and `tasks/postgresql-database-tasks.test.ts`) — `connection-adapters/postgresql/**`
and the top-level `postgresql-adapter*.test.ts` files are **not** in
`ADAPTER_SPECIFIC_EXCLUDE`, so they already run in the shared suite; adding them
here would just double-run them.

The MySQL mirror inside `mysql-tests` uses `MYSQL_TEST_URL` + the filter list
`adapters/abstract-mysql-adapter`, `adapters/mysql2`, `connection-adapters/mysql`,
**and `tasks/mysql-database-tasks.test.ts`**. Two MySQL-specific subtleties: the
`tasks/` file must be listed explicitly (vitest positional filters are substring
matches and no dir prefix is a substring of `tasks/mysql-…`); and
`connection-adapters/mysql` **is** needed here — unlike the PG side — because it
is the substring that catches the excluded `connection-adapters/mysql2-adapter.test.ts`
(PG has no equivalently-excluded top-level connection-adapter file).

Why a separate **step** (not folding the dirs into the core invocation): a
separate process avoids the shared-suite table-drop collision; keeps
`AR_DB_FORKS=4` + the PG/MySQL `retry: 2`; reuses the service + build (no extra
runner slot). Keep it **non-blocking** (`continue-on-error`) until the §3
buckets are green, then flip to a hard gate — see §4.

---

## 3. Remaining failures (run `26880196064`)

Counts are de-duplicated vitest "Failed Tests" totals. Re-confirm each bucket
against current `main` before scoping it (the set drifts as fixes land).

### PostgreSQL — 0 failed ✓

| #           | Bucket                            | Files / tests                                                           | Root cause                                                                                                                                | Fix                                                                                                                                            |
| ----------- | --------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~P-9~~     | ~~schema-dumper: type shorthand~~ | ~~`serial.test.ts` (4), `array.test.ts` (1), `bit-string.test.ts` (1)~~ | ~~dumper didn't emit shorthand DSL for serial/bigserial/bitVarying/array~~                                                                | Resolved: `isDefaultPrimaryKey` widened to include `"serial"`; `RUN_ADAPTER_DIRS` gate on main.                                                |
| ~~P-money~~ | ~~schema-dumper: money default~~  | ~~`money.test.ts` (1), `schema.test.ts` (1)~~                           | ~~`splitPgDefault` regex `[\w"\s.]+` can't span `::` in multi-cast chains; `(150.55)::numeric::money` was treated as a function default~~ | Resolved: regex changed to `(?:::[\w"\s.]+)+` in `splitPgDefault`; test assertion updated to Rails order (`scale` before `default: "150.55"`). |

### MySQL — 0 failed ✓

M-1a and M-1b resolved. See §4 for next steps.

---

## 4. Remaining steps

1. ~~**P-9**~~ — resolved.
2. ~~**P-money**~~ — resolved.
3. ~~**M-1a**~~ — resolved.
4. ~~**M-1b**~~ — resolved.
5. **Wire the lane in** (~40 LOC) — add the adapter-dir step to `postgres-tests`
   / `mysql-tests` (relocate from PR #2863's prototype jobs). The `RUN_ADAPTER_DIRS`
   gate is now on `main`. Recommend hard gate for PG (P-9 + P-money both green).

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
