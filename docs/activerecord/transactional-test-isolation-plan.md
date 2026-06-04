# Transactional test isolation (Path A — the Rails single-invocation enabler)

**Status:** Phase 1 shipped (PR #2919 — opt-in harness + smoke test).
Prerequisite for running the live-DB `adapters/<db>/**`
dirs in CI the Rails way (one `TEST_ADAPTER=<db>` invocation of the whole AR
suite). See [RFC 0012 (adapter-test-ci)](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0012-adapter-test-ci).

**Owner decision:** commit to Path A (true Rails model) rather than the
pragmatic in-job separate-step workaround.

## 1. Why — the root cause the lane hit

Wiring the adapter dirs into the shared `pnpm vitest run packages/activerecord/`
invocation (PR #2918) failed on 3 PG tests in `adapters/postgresql/schema.test.ts`:

- `data source exists when not on schema search path` / `without schema search
path` — set `search_path` to `public`, expect unqualified `things` invisible;
  got **visible**.
- `dump indexes … multiple schemas in search path` — expected 5 indexes, got `[]`.

**Confirmed mechanism — shared-per-worker-DB object-name collision, NOT a
search_path leak.** `dataSourceExists` resolves unqualified names via
`to_regclass($1)`, which _does_ respect `search_path` correctly. The first test
fails because **`public.things` actually exists** in the shared per-worker DB —
left there by one of the **13 other test files that create a bare `things`
table** (lands in `public`). The index test fails because one of the **6 files
that use `test_schema`** dropped/recreated it, removing schema.test.ts's objects.

The probe was green only because it ran the adapter dirs in a _separate_
process, so far fewer object-creating files shared the DB window. Fold them into
the full suite and the ~19 `things`/`test_schema` files collide.

This is the same class as the documented shared-per-worker-DB flakes
(`posts has no column body`, `items has no column name`, etc.): trails uses
persistent `defineSchema` + `dropExisting` tables in a per-worker DB shared
across every file that runs in that worker, so objects leak across files.
`test-setup-ar.ts`'s `beforeEach` only resets caches + the model registry
(`resetTestAdapterState`) — it does **not** clean DB state between tests.

## 2. How Rails stays pristine: transactional fixtures

Rails runs thousands of tests against one DB in one process and stays clean via
`use_transactional_tests` (default `true`, `test_fixtures.rb`):

- `setup_transactional_fixtures` opens a transaction (savepoint) on a **shared
  connection pool** before each test.
- `teardown_transactional_fixtures` **rolls it back** after — undoing all the
  test's writes (and, on PG, its DDL too, since PG DDL is transactional).
- Tests that need real commits opt out with `use_transactional_tests = false`
  (DDL/schema tests on MySQL, transaction-behavior tests, multi-connection,
  fork/thread).

All queries in a test see the same open transaction because they share one
connection. That's the linchpin.

## 3. Target design in trails

Hook the per-test lifecycle in `test-setup-ar.ts` (which already owns the
`beforeEach` reset):

- **`beforeEach`:** open a transaction / savepoint on the shared test
  connection (`Base.connection`) — primitives already exist on the abstract
  adapter (`beginTransaction`, `createSavepoint`, `rollbackToSavepoint`,
  `releaseSavepoint`).
- **`afterEach`:** roll it back, then run the existing cache/registry reset.
- Keep the per-worker-DB sharding unchanged — transactional isolation is
  per-connection, so each worker's connection rolls back independently.
- An opt-out flag mirroring Rails `use_transactional_tests = false` (e.g. a
  `describeWithoutTransaction` / per-file marker) for the tests that can't use
  it.

The linchpin requirement: a test's queries must run on the **same connection**
that holds the open transaction. Today most core tests go through
`Base.connection` (✓). The risk cases are in §4.

## 4. The hard problems (honest — Path A does NOT trivially solve all of it)

1. **MySQL auto-commits DDL.** `CREATE TABLE` / `CREATE SCHEMA` / `ALTER`
   implicitly commit on MySQL, so a transaction **cannot roll back DDL** there.
   → Transactional isolation cleans **DML** on MySQL but **not** schema objects.
   The MySQL adapter **schema** tests (which do DDL) will still leak objects and
   need a complementary fix: explicit teardown (DROP in afterEach) or per-file
   unique schema/table names. PG DDL _is_ transactional, so PG schema tests roll
   back cleanly. **Consequence: Path A fully unlocks PG single-invocation;
   MySQL single-invocation for schema-DDL tests needs the complementary fix.**

2. **Adapter tests use their own connection.** `adapters/<db>/**` files do
   `new PostgreSQLAdapter(PG_TEST_URL)` — a _separate_ connection, not
   `Base.connection`. A transaction on `Base.connection` won't isolate the
   adapter's own connection. → Options: (a) route adapter tests through the
   shared connection; (b) wrap the adapter-test's own connection in its own
   begin/rollback; (c) keep explicit teardown for adapter-schema files. The
   lane-blocking schema.test.ts is exactly this case.

3. **The leak is cross-file.** schema.test.ts fails because of `public.things`
   left by **other** files. So isolation must be applied **broadly** — every
   file that creates `things`/`test_schema`/etc. must roll back — not just the
   victim. This is the point of doing it systematically, but it means the blast
   radius is the whole suite, not one file.

4. **Tests that test transactions / multi-connection / fork** must opt out
   (savepoints conflict with code under test). Build the opt-out list, mirroring
   Rails' `use_transactional_tests = false` set + our `unported-files.ts`.

## 5. Phased rollout

1. **Harness + opt-in (PG-first).** ✅ PR #2919. `useTransactionalTests()` helper
   wired on `Base.connection`; smoke test proves DML + DDL rollback on PG and
   SQLite. Default OFF; blast radius zero until Phase 2.
2. **Default-on for DML; build the opt-out list.** Flip transactional isolation
   on by default for core (DML) tests; opt out transaction-behavior /
   multi-connection / fork tests. Validate the full PG + sqlite suites stay
   green. This alone should retire the `posts`/`items`/`things` DML flakes.
3. **Adapter-connection routing.** Resolve §4.2 so `adapters/postgresql/**`
   tests roll back (route through shared connection or wrap their own). On PG
   this clears the schema.test.ts collisions.
4. **MySQL schema-DDL complementary fix.** Since MySQL DDL can't roll back, give
   the MySQL adapter-schema files explicit teardown or per-file unique schema
   names (§4.1).
5. **Re-attempt the lane.** Re-key `ADAPTER_SPECIFIC_EXCLUDE` on `TEST_ADAPTER`
   and set it on `postgres-tests`/`mysql-tests` — the combined run should now be
   green. (This is the [adapter-test-ci-coverage-plan](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0012-adapter-test-ci)
   §4 step, unblocked.)

## 6. Risks

- **Blast radius:** every test's isolation changes — heavy CI validation per
  phase; opt-in → default flip is the riskiest moment.
- **Connection routing** (§4.2) is the subtle part; get it wrong and tests
  silently share/leak state.
- **MySQL DDL gap** (§4.1) means Path A is necessary-but-not-sufficient for
  MySQL schema single-invocation — set expectations accordingly.
- **Performance:** savepoint begin/rollback per test is cheap; net likely
  faster than today's DDL-heavy re-`defineSchema` per file.

## 7. Honest bottom line

Path A is the correct, Rails-faithful direction and pays down a whole class of
shared-DB flakes — but it is a multi-phase harness change, and **MySQL's DDL
auto-commit means it fully delivers single-invocation for PG, and for MySQL only
once the schema-DDL tests get complementary teardown.** Recommend executing the
phases in order, each as its own ≤500-LOC PR with full-suite CI validation, and
keeping the [adapter CI lane](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0012-adapter-test-ci) on hold (PR #2863
probe stays the green reference) until Phase 5.
