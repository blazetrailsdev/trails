# ActiveRecord: Road to 100% Test Coverage

Current state: **66.3%** real (3,599 matched / 5,428 total Ruby tests), 1,812 stubs remaining.

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

### Complete (100% pass rate) — 322 tests across 20 files

| File | Tests | | File | Tests |
|---|---|---|---|---|
| belongs-to | 153 | | explain | 14 |
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
| enum | 75 / 97 | 22 |
| batches | 86 / 107 | 21 |
| transactions | 80 / 98 | 18 |
| nested-attributes | 78 / 127 | 49 |
| named-scoping | 61 / 73 | 12 |
| inheritance | 65 / 73 | 8 |
| dirty | 50 / 62 | 12 |
| store | 42 / 50 | 8 |
| primary-keys | 41 / 60 | 19 |
| select | 23 / 26 | 3 |
| update-all | 23 / 26 | 3 |

### Needs work (below 70%)

| File | Passing / Total | Skipped |
|---|---|---|
| has-one-habtm (combined) | 209 / 362 | 153 |
| eager | 105 / 197 | 92 |
| autosave-association | 87 / 177 | 90 |
| base | 83 / 186 | 103 |
| has-many-through | 66 / 165 | 99 |
| associations (misc) | 25 / 130 | 105 |
| where | 15 / 62 | 47 |
| counter-cache | 14 / 55 | 41 |
| strict-loading | 14 / 54 | 40 |
| inverse | 52 / 93 | 41 |
| serialized-attribute | 30 / 59 | 29 |
| migration | 19 / 90 | 71 |
| reflection | 24 / 67 | 43 |
| insert-all | 19 / 73 | 54 |
| where-chain | 10 / 54 | 44 |
| transaction-callbacks | 19 / 57 | 38 |
| optimistic locking | 19 / 50 | 31 |
| defaults | 12 / 25 | 13 |

Plus smaller files: signed-id (16/29), callbacks (17/46), aggregations (14/25), sanitize (13/22), cascaded-eager-loading (8/27), readonly (5/14), cache-key (7/12), modules (9/14), touch-later (6/11), association validation (5/10), clone (2/4), extensions (4/12), required (4/7), field-ordered-values (6/10), delegated-type (11/13), token-for (16/18), secure-token (8/9), dup (17/19), schema (12/14), left-outer-join (16/19), serialization (8/9), excluding (8/11).

### DB adapter stubs (need real DB connections)

| File | Passing | Skipped |
|---|---|---|
| sqlite-adapter | 157 | 24 |
| postgres-adapter | 57 | 995 |
| mysql-adapter | 32 | 184 |

## Recommended next targets

### Highest ROI

1. **base.test.ts** (103 stubs, 45%) — broad coverage, good infrastructure
2. **associations.test.ts** (105 stubs, 19%) — misc association edge cases
3. **has-many-through.test.ts** (99 stubs, 40%) — through associations
4. **migration.test.ts** (71 stubs, 21%) — migration edge cases
5. **insert-all.test.ts** (54 stubs, 26%) — bulk operations

### Association-heavy (larger effort)

6. **has-one-habtm.test.ts** (153 stubs) — HABTM + has_one
7. **eager.test.ts** (92 stubs) — eager loading
8. **autosave-association.test.ts** (90 stubs) — autosave edge cases

### Lower ROI / complex

- Composite primary keys — scattered across files
- Pessimistic locking — needs FOR UPDATE support
- DB adapters — need real DB connections, large stub counts
- Ruby-only concepts (marshal, YAML) — permanently skip

## Tracking progress

```
npm run test:compare
```

Target: `activerecord: 100% real (5428 matched, 0 stub / 5428 total)`
