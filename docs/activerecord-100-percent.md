# ActiveRecord: Road to 100% Test Coverage

Current state: **62.9%** real (3,413 matched / 5,428 total Ruby tests), 1,997 stubs remaining.

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

### Complete (100% pass rate) — 2,614 tests across 44 files

| File | Tests | | File | Tests |
|---|---|---|---|---|
| calculations | 489 | | or | 47 |
| finder | 413 | | json-serialization | 45 |
| persistence | 358 | | custom-properties | 38 |
| attribute-methods | 161 | | sti | 38 |
| belongs-to | 153 | | validations | 30 |
| default-scoping | 145 | | ordered-options | 28 |
| inheritance | 106 | | delete-all | 28 |
| uniqueness | 95 | | time-travel | 27 |
| annotations | 53 | | relation (core) | 21 |
| migration | 49 | | mutation, dup | 20 each |

Plus 24 smaller files (autosave, boolean, dup, errors, explain, generated-methods, habtm-scoping, has-many-scoping, instrumentation, inverse, length, normalized-attribute, null-relation, numericality, presence, query-constraints, querying-methods-delegation, secure-password, structural-compatibility, suppressor, absence, and, bidirectional-destroy).

### Near-complete (90%+ pass rate)

| File | Passing / Total | Skipped |
|---|---|---|
| relations | 731 / 747 | 16 |
| has-many | 307 / 314 | 7 |
| calculations-finder-basics | 213 / 235 | 22 |
| merging | 107 / 108 | 1 |
| named-scoping | 106 / 112 | 6 |
| core | 84 / 86 | 2 |
| dirty | 82 / 87 | 5 |
| relation-scoping | 70 / 72 | 2 |
| timestamp | 70 / 72 | 2 |
| select | 37 / 40 | 3 |
| inner-join | 28 / 31 | 3 |
| serialization | 20 / 22 | 2 |
| token-for | 17 / 18 | 1 |
| excluding | 15 / 16 | 1 |
| composite-primary-key | 11 / 12 | 1 |

### Solid progress (70–89%)

| File | Passing / Total | Skipped | What's left |
|---|---|---|---|
| associations (misc) | 264 / 298 | 34 | Various edge cases |
| base | 236 / 331 | 95 | Misc features |
| enum | 146 / 176 | 30 | Edge cases |
| nested-attributes | 135 / 153 | 18 | CPK, dirty tracking |
| transactions | 125 / 159 | 34 | Savepoints, nesting |
| batches | 121 / 138 | 17 | Edge cases |
| callbacks | 80 / 107 | 27 | Around callbacks |
| store | 50 / 57 | 7 | Edge cases |
| primary-keys | 50 / 59 | 9 | Non-standard PKs |
| aggregations | 46 / 64 | 18 | Aggregation edge cases |

### Needs work (below 70%)

| File | Passing / Total | Skipped |
|---|---|---|
| has-one-habtm | 179 / 399 | 220 |
| eager-hmthrough | 155 / 340 | 185 |
| autosave-association | 119 / 238 | 119 |
| where-chain | 30 / 117 | 87 |
| insert-all | 42 / 113 | 71 |
| strict-loading | 42 / 111 | 69 |
| counter-cache | 45 / 112 | 67 |
| reflection | 44 / 99 | 55 |
| where | 93 / 139 | 46 |
| reflection-migration | 40 / 84 | 44 |
| serialized-attribute | 52 / 91 | 39 |
| defaults | 25 / 62 | 37 |
| preloader | 17 / 45 | 28 |
| optimistic locking | 29 / 54 | 25 |

Plus ~20 smaller files with 5–20 skips each (inverse associations, transaction-callbacks, signed-id, readonly, etc.).

### DB adapter stubs (need real DB connections)

| File | Passing | Skipped |
|---|---|---|
| sqlite-adapter | 157 | 24 |
| postgres-adapter | 57 | 995 |
| mysql-adapter | 32 | 184 |

## Recommended next targets

### Highest ROI

1. **base.test.ts** (95 stubs, 71%) — broad coverage, good infrastructure
2. **where-chain.test.ts** (87 stubs, 25%) — where.not/missing/associated
3. **insert-all.test.ts** (71 stubs, 37%) — bulk operations
4. **strict-loading.test.ts** (69 stubs, 37%) — strict loading modes
5. **counter-cache.test.ts** (67 stubs, 40%) — counter cache

### Association-heavy (larger effort)

6. **has-one-habtm.test.ts** (220 stubs) — HABTM + has_one
7. **eager-hmthrough.test.ts** (185 stubs) — eager loading through
8. **autosave-association.test.ts** (119 stubs) — autosave edge cases

### Lower ROI / complex

- Composite primary keys — scattered across files (~30 tests total)
- Pessimistic locking — needs FOR UPDATE support
- DB adapters — need real DB connections, large stub counts
- Ruby-only concepts (marshal, YAML) — permanently skip

## Tracking progress

```
npm run test:compare
```

Target: `activerecord: 100% real (5428 matched, 0 stub / 5428 total)`
