# ActiveRecord: Road to 100% Test Coverage

Current state: **61.1%** real (3,318 matched / 5,428 total Ruby tests), 2,092 stubs remaining.

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

### Complete (100% pass rate)

These files have all tests passing with zero stubs:

| File | Tests |
|---|---|
| belongs-to | 153 |
| persistence | 358 |
| calculations + finder-basics | 489 + 213 |
| default-scoping | 145 |
| inheritance | 106 |
| validations (all) | 161 |
| json-serialization | 45 |
| relation (core, or, and, annotations, delete-all, mutation, order) | 179 |
| sti | 38 |
| boolean, dup, errors, explain, suppressor, time-travel | 112 |
| normalized-attribute, secure-password, query-constraints | 46 |

### Near-complete (90%+ pass rate)

| File | Pass rate | Passing | Skipped | What's left |
|---|---|---|---|---|
| has-many | 97% | 307 | 7 | Custom primary key tests |
| merging | 99% | 107 | 1 | Edge case |
| core | 97% | 84 | 2 | Minor |
| relation-scoping | 97% | 70 | 2 | Minor |
| timestamp | 97% | 70 | 2 | Minor |
| named-scoping | 94% | 106 | 6 | Edge cases |
| dirty | 94% | 82 | 5 | Edge cases |
| select | 92% | 37 | 3 | Minor |
| attribute-methods | 91% | 148 | 13 | Mixed |
| migration | 91% | 45 | 4 | DDL edge cases |

### Solid progress (70–90%)

| File | Pass rate | Passing | Skipped | What's left |
|---|---|---|---|---|
| nested-attributes | 88% | 135 | 18 | CPK, association dirty tracking |
| associations (misc) | 88% | 264 | 34 | Various edge cases |
| batches | 87% | 121 | 17 | Edge cases |
| store | 87% | 50 | 7 | Edge cases |
| relations | 86% | 644 | 103 | Complex queries |
| enum | 82% | 146 | 30 | Edge cases |
| finder | 79% | 330 | 83 | Complex finders, joins |
| transactions | 78% | 125 | 34 | Savepoints, nesting |
| callbacks | 74% | 80 | 27 | Around callbacks, ordering |
| base | 71% | 236 | 95 | Misc features |

### Needs work (below 70%)

| File | Pass rate | Passing | Skipped | What's left |
|---|---|---|---|---|
| where | 45% | 63 | 76 | Complex where clauses |
| where-chain | 25% | 30 | 87 | where.not, where.missing, where.associated |
| has-one-habtm | 44% | 179 | 220 | HABTM collection ops, has_one edge cases |
| eager-hmthrough | 45% | 155 | 185 | Eager loading through associations |
| autosave-association | 50% | 119 | 119 | Autosave edge cases |
| counter-cache | 40% | 45 | 67 | Counter cache with associations |
| strict-loading | 37% | 42 | 69 | Strict loading modes |
| insert-all | 37% | 42 | 71 | Bulk insert edge cases |
| reflection | 44% | 44 | 55 | Reflection API |
| reflection-migration | 47% | 40 | 44 | Migration reflection |
| defaults | 40% | 25 | 37 | Default values |
| optimistic locking | 53% | 29 | 25 | Locking edge cases |
| preloader | 37% | 17 | 28 | Preloading edge cases |
| inverse associations | 33–63% | various | various | Inverse association handling |
| pessimistic locking | 16% | 2 | 10 | FOR UPDATE, lock! |

### DB adapter stubs (need real DB connections)

| File | Passing | Skipped |
|---|---|---|
| sqlite-adapter | 157 | 24 |
| postgres-adapter | 57 | 995 |
| mysql-adapter | 32 | 184 |

These are mostly stub placeholders. Converting them requires running against real databases and implementing adapter-specific SQL features.

## Recommended next targets

### Highest ROI (most stubs, most tractable)

1. **relations.test.ts** (103 stubs) — 86% pass rate, good infrastructure
2. **base.test.ts** (95 stubs) — 71% pass rate, broad coverage
3. **where-chain.test.ts** (87 stubs) — where.not/missing/associated chains
4. **finder.test.ts** (83 stubs) — complex finders, joins
5. **where.test.ts** (76 stubs) — complex where clauses

### Medium ROI (association-heavy)

6. **has-one-habtm.test.ts** (220 stubs) — HABTM + has_one, large file
7. **eager-hmthrough.test.ts** (185 stubs) — eager loading through
8. **autosave-association.test.ts** (119 stubs) — autosave edge cases
9. **insert-all.test.ts** (71 stubs) — bulk operations
10. **strict-loading.test.ts** (69 stubs) — strict loading modes
11. **counter-cache.test.ts** (67 stubs) — counter cache with associations

### Lower ROI / complex

- Composite primary keys — scattered across files (~30 tests total)
- Pessimistic locking — needs FOR UPDATE support
- DB adapters — need real DB connections, large stub counts
- Ruby-only concepts (marshal, YAML) — permanently skip

## What "converting a stub" typically involves

1. **Trivial unskips** — feature already works, just change `it.skip` to `it`. (~10%)
2. **Inline model setup** — test needs multi-model fixture graph with MemoryAdapter. (~40%)
3. **Missing feature implementation** — build the feature, then write the test. (~30%)
4. **Adapter/SQL limitations** — extend MemoryAdapter's SQL parser. (~15%)
5. **Ruby-only concepts** — marshal, YAML, Ruby threading. Permanently skip. (~5%)

## Tracking progress

Run `npm run test:compare` after each batch of work. The key metric is:

```
activerecord: XX.X% real (NNNN matched, NNNN stub / 5428 total)
```

Target: `activerecord: 100% real (5428 matched, 0 stub / 5428 total)`
