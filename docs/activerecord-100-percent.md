# ActiveRecord: Road to 100% Test Coverage

Current state: **64.2%** real (3,706 matched / 5,771 total Ruby tests), 1,945 stubs remaining.

## How coverage is measured

The compare script (`npm run test:compare`) extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized description. File mapping is **convention-based**:

- `finder_test.rb` → `finder.test.ts` (snake_case → kebab-case)
- Per-package overrides for non-standard names (e.g. `belongs_to_associations_test.rb` → `belongs-to.test.ts`)

A "stub" is an `it.skip()` that matched a Ruby test name. The goal is 0 stubs.

Other commands:
- **`npm run api:compare`** — Compares exported class/method signatures against Rails' public API.
- **`npm run test:generate-stubs`** — Generates `it.skip()` stubs for unmatched Rails tests.

## Database adapters

Tests run against three backends in CI: in-memory (default), PostgreSQL 17, and MariaDB 11. Set `PG_TEST_URL` or `MYSQL_TEST_URL` to run against a real database locally. The `SchemaAdapter` in `test-adapter.ts` auto-creates tables from model attribute definitions so tests don't need manual DDL.

## Test file conventions

TS test files mirror the Rails test file structure:

| Rails file | TS file |
|---|---|
| `finder_test.rb` | `finder.test.ts` |
| `associations/has_many_associations_test.rb` | `associations/has-many.test.ts` |
| `validations/uniqueness_validation_test.rb` | `validations/uniqueness.test.ts` |
| `locking_test.rb` | `locking/optimistic.test.ts` + `locking/pessimistic.test.ts` |
| `relation/where_test.rb` | `relation/where.test.ts` |

Tests use `describe("RubyTestClassName", ...)` blocks matching the Ruby test class name.

## Current status by test file

### Complete (100% pass rate) — 274 tests across 27 files

| File | Tests | | File | Tests |
|---|---|---|---|---|
| sqlite-adapter (combined) | 104 | | explain | 14 |
| custom-properties | 38 | | numericality | 14 |
| json-serialization | 23 | | nested-attributes | 10 |
| mutation | 21 | | presence | 8 |
| suppressor | 6 | | boolean | 5 |
| absence | 5 | | length | 5 |
| order | 4 | | structural-compatibility | 4 |
| bidirectional-destroy | 3 | | and | 3 |
| annotations | 2 | | inheritance | 2 |
| custom | 1 | | errors | 1 |

### Near-complete (90%+ pass rate)

| File | Passing / Total | Skipped |
|---|---|---|
| has-many | 306 / 311 | 5 |
| calculations | 211 / 233 | 22 |
| belongs-to | 153 / 153 | 0 |
| attribute-methods | 126 / 133 | 7 |
| default-scoping | 88 / 96 | 8 |
| relation-scoping | 62 / 64 | 2 |
| uniqueness | 54 / 55 | 1 |
| timestamp | 39 / 40 | 1 |
| merging | 32 / 33 | 1 |
| inner-join | 28 / 31 | 3 |
| or | 26 / 27 | 1 |
| core | 22 / 24 | 2 |
| validations | 20 / 21 | 1 |
| normalized-attribute | 14 / 15 | 1 |
| delete-all | 12 / 13 | 1 |

### Solid progress (70–89%)

| File | Passing / Total | Skipped |
|---|---|---|
| relations | 234 / 279 | 45 |
| finder | 221 / 260 | 39 |
| persistence | 123 / 153 | 30 |
| batches | 86 / 107 | 21 |
| transactions | 80 / 98 | 18 |
| enum | 75 / 97 | 22 |
| inheritance | 65 / 73 | 8 |
| named-scoping | 61 / 73 | 12 |
| dirty | 50 / 62 | 12 |
| store | 42 / 50 | 8 |
| select | 23 / 26 | 3 |
| update-all | 23 / 26 | 3 |
| left-outer-join | 16 / 19 | 3 |
| dup | 17 / 19 | 2 |
| token-for | 16 / 18 | 2 |
| schema | 12 / 14 | 2 |
| delegated-type | 11 / 13 | 2 |

Plus smaller files: excluding (8/11), finder (8/9), secure-token (8/9), serialization (8/9), nested-attributes (3/4).

### Needs work (below 70%)

| File | Passing / Total | Skipped |
|---|---|---|
| associations (misc) | 25 / 130 | 105 |
| base | 83 / 186 | 103 |
| has-many-through | 66 / 165 | 99 |
| eager | 105 / 197 | 92 |
| autosave-association | 87 / 177 | 90 |
| migration | 19 / 90 | 71 |
| has-one-habtm (combined) | 162 / 397 | 225 |
| insert-all | 19 / 73 | 54 |
| relation | 1 / 51 | 50 |
| nested-attributes | 78 / 127 | 49 |
| where | 15 / 62 | 47 |
| where-chain | 10 / 54 | 44 |
| reflection | 24 / 67 | 43 |
| inverse | 52 / 93 | 41 |
| counter-cache | 14 / 55 | 41 |
| strict-loading | 14 / 54 | 40 |
| transaction-callbacks | 19 / 57 | 38 |
| serialized-attribute | 30 / 59 | 29 |
| optimistic locking | 19 / 50 | 31 |

Plus smaller files: cascaded-eager-loading (8/27), primary-keys (41/60), signed-id (16/29), defaults (12/25), callbacks (17/46), aggregations (14/25), invertible (18/28), sanitize (13/22), readonly (5/14), modules (9/14), cache-key (7/12), touch-later (6/11), association validation (5/10), field-ordered-values (6/10), extensions (4/12), required (4/7), clone (2/4), habtm (0/4), comment (0/17), where-clause (0/21), with (0/16), null-relation (6/9), querying-methods-delegation (2/3), reload-cache (0/1).

### DB adapter tests

| File | Matched | Skipped (null) | Stubs |
|---|---|---|---|
| sqlite-adapter | 104 | 23 | 0 |
| mysql-adapter | 1 | 0 | 183 |

MySQL adapter stubs need real DB connections. PostgreSQL adapter tests are still excluded from comparison.

## Recommended next targets

### Highest ROI

1. **associations.test.ts** (105 stubs, 19%) — misc association edge cases
2. **base.test.ts** (103 stubs, 45%) — broad coverage, good infrastructure
3. **has-many-through.test.ts** (99 stubs, 40%) — through associations
4. **eager.test.ts** (92 stubs, 53%) — eager loading
5. **autosave-association.test.ts** (90 stubs, 49%) — autosave edge cases

### Medium effort

6. **migration.test.ts** (71 stubs, 21%) — migration edge cases
7. **insert-all.test.ts** (54 stubs, 26%) — bulk operations
8. **relation.test.ts** (50 stubs, 2%) — core relation methods
9. **nested-attributes.test.ts** (49 stubs, 61%) — CPK, dirty tracking
10. **where.test.ts** (47 stubs, 24%) — where clause conditions

### Association-heavy (larger effort)

- **has-one-habtm.test.ts** (225 stubs combined) — HABTM + has_one across multiple Ruby files
- **where-chain.test.ts** (44 stubs) — where.not/missing/associated
- **counter-cache.test.ts** (41 stubs) — counter cache
- **strict-loading.test.ts** (40 stubs) — strict loading modes

### Lower ROI / complex

- Composite primary keys — scattered across files
- Pessimistic locking — needs FOR UPDATE support
- MySQL adapter — needs real DB connection (183 stubs)
- Ruby-only concepts (marshal, YAML) — permanently skip

## Tracking progress

```
npm run test:compare
```

Target: `activerecord: 100% real (5771 matched, 0 stub / 5771 total)`
