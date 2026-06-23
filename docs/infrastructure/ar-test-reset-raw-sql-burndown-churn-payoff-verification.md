# Verification: did the raw-SQL teardown burndown shrink the `dropAllTables` fan-out?

Measurement for story `ar-test-reset-verify-raw-sql-burndown-churn-payoff`
(RFC 0028-ci-cost-optimization). Verifies the churn-payoff premise of PR #3976
(`ar-test-reset-raw-sql-teardown-burndown`). Fact-finding only — no production
code change.

## TL;DR

**The burndown did not shrink the drop-table fan-out. It very slightly grew it.**
Measured over the exact 39-file population PR #3976 touched, the distinct
`DROP TABLE` table count went **252 → 260 (+8)** and total `DROP TABLE` ops went
**6,614 → 6,639 (+25)** after the burndown. **Zero** tables left the drop census;
**8** new ones entered it — the added `DROP TABLE IF EXISTS …` lint-balancer
statements. The audit headline (that these un-torn-down raw `CREATE TABLE`s were
"the bulk of the ~2,600 distinct tables the `dropAllTables` fan-out re-drops
every run") does **not** hold: the tables were already torn down at runtime by
mechanisms the lint rule cannot see statically, so adding explicit teardown
added DDL rather than removing it.

RFC 0028 should re-prioritise toward the DROP-dominance levers
(`batch-drop-all-tables-single-statement`, slot-1 `loadSchema` shape-stability —
see `ar-test-reset-drop-table-churn-audit.md` Path A) and stop treating
raw-SQL teardown burndown as a churn lever. The burndown remains valuable as a
**lint-hygiene / leak-ratchet** measure; it is simply not a CI-cost lever.

## Methodology

Same instrumentation as the original audit: the opt-in `DDL_PROFILE=1` profiler
(`packages/activerecord/src/test-helpers/ddl-profile.ts`, PR #3904), which
monkey-patches the `execute`/`executeMutation` leaf DDL primitives, classifies
each statement by leading keyword, and flushes per-worker `byOp`/`byTable`/`byFile`
JSON aggregates. Distinct-table count is the number of distinct names appearing
as `DROP_TABLE <table>` keys in the merged `byTable` map; total drop ops is the
`DROP_TABLE` entry of the merged `byOp` map.

Because PR #3976 touched **only** these 39 test files, any change to the
full-suite distinct-table count must originate in them. So rather than re-run the
whole 6-worker suite (forbidden locally, and the cross-file leak accumulation
that produces the ~2,600 figure is dominated by paths the burndown never
touched), the measurement isolates the burndown's contribution by profiling the
39-file population in one vitest invocation, twice:

- **after** — `main` at the post-merge state (PR #3976 present).
- **before** — the same 39 files checked out at `b9bcec6aa^` (the parent of the
  burndown merge), with nothing else changed.

Adapter: SQLite (per-worker file/`:memory:` DBs, the cheapest lane; 32 of the 39
files run on it, the 7 PG/MySQL-only files no-op without a server). Both runs:
967 passed / 61 skipped, 32 test files.

Reproduce:

```sh
FILES=$(git show b9bcec6aa --name-only --pretty=format: | grep '\.test\.ts$')
# after
DDL_PROFILE=1 DDL_PROFILE_OUT_DIR=/tmp/ddl/after pnpm vitest run $FILES
# before
git checkout b9bcec6aa^ -- $FILES
DDL_PROFILE=1 DDL_PROFILE_OUT_DIR=/tmp/ddl/before pnpm vitest run $FILES
git checkout HEAD -- $FILES
```

## Results

| Metric                       | before (#3976 parent) | after (`main`) | delta   |
| ---------------------------- | --------------------- | -------------- | ------- |
| distinct `DROP_TABLE` tables | 252                   | 260            | **+8**  |
| total `DROP_TABLE` ops       | 6,614                 | 6,639          | **+25** |

Tables present in the drop census **only after** the burndown (i.e. newly
introduced by its `DROP TABLE IF EXISTS` balancers):

```
sprockets gizmos multi_connection_test_models widgets
test_pool tmp_table shard_connection_test_models shard_connection_test_model_bs
```

Tables present **only before** (i.e. removed from the census by the burndown):

```
(none)
```

## Why the reduction is non-existent (not merely negligible)

The lint rule `require-table-teardown` flags a raw `CREATE TABLE` whose matching
`DROP TABLE` is not **statically** visible by name. But the flagged tables were
already destroyed at runtime by mechanisms the static rule cannot match:

- **Throwaway `:memory:` / temp-file adapters discarded on close** — e.g.
  `transactions.test.ts` opens isolated `:memory:` adapters per test and closes
  them in `afterEach`; the table dies with the connection. PR #3976's added
  `afterEach` drop is, in its own comment, "per-name `IF EXISTS` drops … the
  others are no-ops on a given adapter."
- **`withTransactionalFixtures` rollback** (PG DDL is transactional) — the
  `CREATE TABLE` is rolled back, never committed, so it never reaches the shared
  worker DB that `dropAllTables` enumerates.
- **`DROP SCHEMA … CASCADE`** and dynamic `LIKE 'ex_%'` cleanup sweeps — real
  teardown, just not a statically-named `DROP TABLE`.

None of these tables ever persisted on the shared worker DB at the moment
`dropAllTables` runs, so they were never part of the distinct-table fan-out the
audit attributed to them. Adding a statically-named `DROP TABLE IF EXISTS` does
not remove a pre-existing drop; it **appends a new (mostly no-op) DROP statement**
to the census — hence +8 distinct names and +25 ops rather than a reduction.

## Caveat / scope

This isolates the burndown's own contribution; it is not a fresh full-suite
re-measurement of the absolute ~2,600 / ~86k figures (a 6-worker DDL_PROFILE run
is the forbidden full-suite run, and would re-derive numbers the burndown cannot
have changed in the favourable direction, since it removed zero drops from these
files). The directional conclusion is robust precisely because PR #3976 is
confined to these 39 files: the full-suite distinct-table count **cannot** have
shrunk from the burndown, and the controlled A/B shows it nudged **up**.

## Recommendation for RFC 0028

- **De-list raw-SQL teardown burndown as a CI-cost lever.** Keep it as a
  lint-hygiene/leak-ratchet (it prevents _new_ statically-invisible leaks), but
  do not schedule further burndown work expecting churn payoff.
- **Re-prioritise the DROP-dominance levers** the original audit already
  identified as the real cost (`ar-test-reset-drop-table-churn-audit.md`):
  - Path A — route slot-1 PG/MySQL off per-file `loadSchema`'s unconditional
    246-table `force:"cascade"` replay (`ar-test-reset-shape-stable-impl`,
    ~22k drops/run, the cleanest single win).
  - `batch-drop-all-tables-single-statement` — collapse the wide per-table
    `dropAllTables` fan-out into one statement.
  - per-file reset shape-stability (`repairWorkerSchema` as the drift backstop).
