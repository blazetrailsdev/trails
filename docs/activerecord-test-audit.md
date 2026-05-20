# ActiveRecord Test Audit — Aggregate Report

_Generated 2026-05-19 from 228 per-file audit reports._

> **Corrected 2026-05-19 after PR #2032 verified the 163-test deficit for `associations/has-many-through.test.ts` was a stub-file artifact.** Totals below reflect the correction: −163 missing tests, ~−2,900 LOC removed from the associations cluster and top-line counts.

---

## 1. Methodology

Each per-file report records the number of active TS `it()` tests and the number of tests in the corresponding Rails source file. **Missing tests** = `max(0, Rails − TS)`. LOC estimates use:

- **15 LOC per missing test** (one `it()` body with setup).
- **×1.20 overhead** per file for shared fixtures/helpers.
- **Whole-file gaps** (0 active TS tests): `Rails_count × 15 × 1.20`.
- **BLOCKED files** (implementation gap, not test gap): flagged without a LOC estimate; closing them requires feature implementation LOC, not test-writing LOC.
- Files with no Rails counterpart are excluded from the missing-test tally.

---

## 2. Top-line Totals

| Metric                                                      | Count       |
| ----------------------------------------------------------- | ----------- |
| Total audit files                                           | 228         |
| Files with no Rails counterpart                             | 16          |
| Files with gaps (missing > 0)                               | 73          |
| Total missing tests                                         | **648**     |
| Estimated test-writing LOC                                  | **~11,700** |
| BLOCKED files (need impl, not tests)                        | **24**      |
| Clean files (0 missing, not blocked, has Rails counterpart) | **120**     |
| TS-ahead files (TS > Rails test count)                      | **80**      |

---

## 3. By Cluster

| Cluster                         | Files   | Missing tests | Est. LOC    | BLOCKED |
| ------------------------------- | ------- | ------------- | ----------- | ------- |
| associations                    | 25      | 234           | 4,212       | 6       |
| adapters/postgresql             | 56      | 119           | 2,142       | 0       |
| adapters/abstract-mysql-adapter | 24      | 70            | 1,260       | 0       |
| relation                        | 20      | 53            | 954         | 3       |
| adapters/sqlite3                | 14      | 32            | 576         | 1       |
| adapters/mysql2                 | 4       | 31            | 558         | 0       |
| connection-adapters             | 22      | 37            | 666         | 4       |
| validations                     | 9       | 24            | 432         | 0       |
| database-configurations         | 4       | 18            | 324         | 1       |
| coders                          | 2       | 15            | 270         | 1       |
| scoping                         | 3       | 13            | 234         | 0       |
| encryption                      | 28      | 0             | 0           | 3       |
| tasks                           | 4       | 0             | 0           | 1       |
| attribute-methods               | 2       | 0             | 0           | 0       |
| assertions                      | 1       | 0             | 0           | 0       |
| persistence                     | 1       | 1             | 18          | 1       |
| type                            | 7       | 0             | 0           | 0       |
| type-caster                     | 1       | 1             | 18          | 1       |
| **TOTAL**                       | **228** | **648**       | **~11,700** | **24**  |

---

## 4. Top 20 Individual Gaps

| File                                                      | TS  | Rails | Missing | Est. LOC | Blocker                                                  |
| --------------------------------------------------------- | --- | ----- | ------- | -------- | -------------------------------------------------------- |
| associations/eager.test.ts                                | 133 | 197   | 64      | 1,152    | Preloader batching, poly+conditions, CPK preloading      |
| associations/join-model.test.ts                           | 64  | 102   | 38      | 684      | BLOCKED — polymorphic through join model not implemented |
| relation/load-async.test.ts                               | 0   | 38    | 38      | —        | BLOCKED — Ruby future_result; permanent skip by design   |
| adapters/postgresql/postgresql-rake.md                    | 0   | 37    | 37      | 666      | Rake task infra (DB-level tasks)                         |
| adapters/mysql2/mysql2-rake.md                            | 0   | 26    | 26      | 468      | Rake task infra                                          |
| associations/has-one-associations.test.ts                 | 65  | 88    | 23      | 414      | Marshal/YAML, query cache reload                         |
| associations/cascaded-eager-loading.test.ts               | 8   | 27    | 19      | 342      | Cascaded eager loading depth                             |
| validations/validations.test.ts                           | 2   | 21    | 19      | 342      | —                                                        |
| associations/has-and-belongs-to-many-associations.test.ts | 74  | 92    | 18      | 324      | Group-by queries, namespace resolution                   |
| adapters/sqlite3/sqlite-rake.md                           | 0   | 17    | 17      | 306      | Rake task infra                                          |
| associations/inverse-associations.test.ts                 | 76  | 93    | 17      | 306      | STI inverse, composite FK inversing                      |
| database-configurations/resolver.md                       | 0   | 16    | 16      | 288      | —                                                        |
| associations/has-one-through-associations.test.ts         | 32  | 47    | 15      | 270      | —                                                        |
| coders/yaml-column.test.ts                                | 0   | 15    | 15      | —        | BLOCKED — YAML column coder not implemented              |
| scoping/relation-scoping.test.ts                          | 51  | 64    | 13      | 234      | with_scope/create_with implementation gaps               |
| adapters/abstract-mysql-adapter/adapter-prevent-writes.md | 0   | 12    | 12      | 216      | —                                                        |
| adapters/postgresql/serial.md                             | 0   | 12    | 12      | 216      | —                                                        |
| relation/where-chain.test.ts                              | 43  | 54    | 11      | 198      | missing/associated query methods                         |
| associations/nested-through-associations.test.ts          | 54  | 64    | 10      | 180      | Polymorphic+STI nested through                           |

---

## 5. TS-Ahead Files

These 80 files have more active TS tests than Rails. No additional tests needed; flag for de-duplication review if counts are substantially higher. Selected high-delta files:

| File                                       | TS  | Rails | Ahead |
| ------------------------------------------ | --- | ----- | ----- |
| adapters/postgresql/postgresql-adapter.md  | 148 | 67    | +81   |
| relation/where.test.ts                     | 123 | 62    | +61   |
| scoping/default-scoping.test.ts            | 151 | 96    | +55   |
| adapters/postgresql/range.md               | 93  | 46    | +47   |
| validations/uniqueness-validation.test.ts  | 100 | 55    | +45   |
| scoping/named-scoping.test.ts              | 111 | 73    | +38   |
| associations/has-many-associations.test.ts | 309 | 272   | +37   |
| relation/annotations.test.ts               | 37  | 2     | +35   |
| tasks/database-tasks.test.ts               | 107 | 78    | +29   |
| adapters/postgresql/geometric.md           | 54  | 29    | +25   |

Remaining 70 TS-ahead files are within ±25 tests; most are intentional extensions for edge cases not in Rails' own suite.

---

## 6. No-Rails-Counterpart Files

These 16 files test TS-specific infrastructure or cross-cutting concerns with no single Rails test file equivalent. Est. LOC contribution: 0 (no gaps to close).

**TS-only infra (no equivalent Rails test file exists):**

| File                                                  | TS tests | Category                                      |
| ----------------------------------------------------- | -------- | --------------------------------------------- |
| adapters/sqlite3-adapter.md                           | 49       | Integration test (spans multiple Rails files) |
| connection-adapters/abstract/connection-pool/queue.md | 27       | Internal queue abstraction                    |
| connection-adapters/abstract/database-statements.md   | 77       | Abstract adapter smoke tests                  |
| connection-adapters/abstract/database-limits.md       | 5        | Adapter limits interface                      |
| connection-adapters/abstract/savepoints.md            | 9        | Savepoint semantics                           |
| connection-adapters/abstract/schema-dumper.md         | 8        | Dumper infra                                  |
| connection-adapters/pool-config.md                    | 19       | Pool config TS model                          |
| connection-adapters/pool-manager.md                   | 19       | Pool manager TS model                         |
| connection-adapters/sqlite3/quoting.md                | 54       | SQLite3 quoting specifics                     |
| relation/query-attribute.test.ts                      | 10       | TS query attribute type                       |
| relation/thenable.test.ts                             | 13       | Promise/thenable adaptor                      |
| tasks/mysql-database-tasks.test.ts                    | 7        | MySQL rake-equivalent tasks                   |
| tasks/postgresql-database-tasks.test.ts               | 9        | PG rake-equivalent tasks                      |
| tasks/sqlite-database-tasks.test.ts                   | 12       | SQLite rake-equivalent tasks                  |

**Rails source missing (no test file counterpart located):**

| File                                               | TS tests | Note                                   |
| -------------------------------------------------- | -------- | -------------------------------------- |
| associations/habtm.md                              | 2        | Likely duplicate of habtm-associations |
| database-configurations/connection-url-resolver.md | 12       | TS-specific URL resolver               |

---

## 7. Suggested PR Slicing

Target ~250 LOC per PR (additions + deletions). Groups below are ordered by impact.

| PR                      | Files                                                                                                                                                          | Focus                                                          | Est. LOC | Notes                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| **Assoc-A**             | associations/eager.test.ts, associations/cascaded-eager-loading.test.ts                                                                                        | Eager loading depth, batching, join-based preloading           | ~250     | Fix preloader infrastructure first                                  |
| **Assoc-B**             | associations/has-one-associations.test.ts, associations/inverse-associations.test.ts                                                                           | has-one gaps (23 missing), inverse STI/CPK gaps (17 missing)   | ~240     | Most skips are query-cache or marshal — annotate BLOCKED vs fixable |
| **Assoc-C**             | associations/has-and-belongs-to-many-associations.test.ts, associations/nested-through-associations.test.ts, associations/has-one-through-associations.test.ts | HABTM group-by + namespaces, nested poly through               | ~230     |                                                                     |
| **Adapters-PG-A**       | adapters/postgresql/serial.md, adapters/postgresql/array.md + 3–4 smaller pg files                                                                             | Serial sequences + array gaps                                  | ~250     |                                                                     |
| **Adapters-PG-B**       | adapters/postgresql/postgresql-rake.md, adapters/mysql2/mysql2-rake.md, adapters/sqlite3/sqlite-rake.md                                                        | DB rake tasks (3 files, 80 missing tests)                      | ~250     | Requires rake-task infra in TS; may need impl PR first              |
| **Adapters-MySQL**      | adapters/abstract-mysql-adapter/adapter-prevent-writes.md + 5–6 other abstract-mysql files (70 total missing)                                                  | MySQL write-prevention + case-sensitivity gaps                 | ~250     | case-sensitivity is BLOCKED                                         |
| **Relation-A**          | relation/where-chain.test.ts, scoping/relation-scoping.test.ts, relation/merging.test.ts                                                                       | Where-chain missing/associated, with_scope gaps                | ~220     | Unblock missing/associated methods first                            |
| **Validations**         | validations/validations.test.ts + remaining validations files (24 total missing)                                                                               | Validation edge cases                                          | ~200     | Clean cluster; no known blockers                                    |
| **DB-Config + Coders**  | database-configurations/resolver.md + coders/yaml-column.test.ts (BLOCKED) + other db-config files                                                             | Resolver 16 missing; yaml-column needs impl                    | ~180     | yaml-column needs YAML coder impl first                             |
| **Connection-Adapters** | connection-adapters/\* (37 missing, 4 blocked)                                                                                                                 | Connection swapping nested (BLOCKED), merge/resolve URL config | ~200     | Nested connection swapping needs impl                               |

---

### BLOCKED summary (24 files — need implementation, not test LOC)

| Cluster                         | BLOCKED files | Feature needed                                                     |
| ------------------------------- | ------------- | ------------------------------------------------------------------ |
| associations                    | 6             | Polymorphic through join model, STI inverse dispatch               |
| connection-adapters             | 4             | Nested connection swapping, role/shard context                     |
| encryption                      | 3             | Key rotation edge cases, deterministic context                     |
| relation                        | 3             | load_async (permanent/Ruby-only), missing/associated query methods |
| coders                          | 1             | YAML column coder                                                  |
| database-configurations         | 1             | URL resolver edge cases                                            |
| adapters/abstract-mysql-adapter | 0             | (case-sensitivity counted in main total)                           |
| tasks                           | 1             | Rake infrastructure                                                |
| persistence                     | 1             | Transaction-aware persistence edge                                 |
| scoping                         | 0             | (with_scope countable, not fully blocked)                          |
| type-caster                     | 1             | Type-caster edge case                                              |
