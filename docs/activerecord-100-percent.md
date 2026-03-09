# ActiveRecord: Road to 100% Test Coverage

Current state: **57.5%** real (3,120 matched / 5,428 total Ruby tests), 2,290 stubs. Raw test stats: ~6,800 passed across ~125 test files.

> **Progress update (2026-03-09, session 3):** Rewrote the test comparison system from a 10k-line manual mapping file to convention-based file matching. Ruby `finder_test.rb` now automatically maps to TS `finder.test.ts` — no manual entries needed for standard names. ~80 overrides handle non-standard cases (e.g. `belongs_to_associations_test.rb` → `belongs-to.test.ts`). Also reorganized tests from 7 monolithic "catch-all" files into ~20 per-feature files matching Rails test structure.
>
> **Previous sessions:** Converted 129 stubs to real tests, added scoped preloading, built `has_many :through` / `has_one :through`, polymorphic association support, extended SQLite adapter, and added 100% name-matched stubs for all 3 database adapter test files.

This document groups the remaining work into feature areas, identifies dependencies, and marks what can be worked on in parallel.

## How coverage is measured

The compare script (`npm run test:compare`) extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized description. File mapping is **convention-based**:

- `finder_test.rb` → `finder.test.ts` (snake_case → kebab-case)
- `spec_request.rb` → `request.test.ts` (rack: strip `spec_` prefix)
- Per-package overrides for non-standard names (e.g. `belongs_to_associations_test.rb` → `belongs-to.test.ts`)

A "stub" is an `it.skip()` that matched a Ruby test name. "Missing" means no TS test exists. The goal is 0 stubs and 0 missing.

Other commands:
- **`npm run api:compare`** — Compares exported class/method signatures against Rails' public API.
- **`npm run test:generate-stubs`** — Generates `it.skip()` stubs for unmatched Rails tests.

Both compare scripts run in CI on every push.

## Database adapters

Tests run against three backends in CI: in-memory (default), PostgreSQL 17, and MariaDB 11. Set `PG_TEST_URL` or `MYSQL_TEST_URL` to run against a real database locally. The `SchemaAdapter` in `test-adapter.ts` auto-creates tables from model attribute definitions so tests don't need manual DDL.

Adapter source lives in `packages/activerecord/src/adapters/`:
- `postgres-adapter.ts` — PostgreSQL via `pg`
- `mysql-adapter.ts` — MySQL/MariaDB via `mysql2`
- SQLite is handled by `better-sqlite3` in the base adapter

## Test file conventions

TS test files mirror the Rails test file structure:

| Rails file | TS file |
|---|---|
| `finder_test.rb` | `finder.test.ts` |
| `associations/has_many_associations_test.rb` | `associations/has-many.test.ts` |
| `validations/uniqueness_validation_test.rb` | `validations/uniqueness.test.ts` |
| `locking_test.rb` | `locking/optimistic.test.ts` + `locking/pessimistic.test.ts` |
| `relation/where_test.rb` | `relation/where.test.ts` |

Tests use `describe("RubyTestClassName", ...)` blocks matching the Ruby test class name (e.g. `describe("FinderTest", ...)`). This allows the compare script to match tests by convention without manual mapping.

## Summary by feature area

| # | Feature Area | Stubs | Real | Key Dependencies | Status |
|---|---|---|---|---|---|
| 1 | Through Associations | ~195 | ~125 | Associations core | Partial — basic/polymorphic/scoped through works |
| 2 | HasMany Associations | ~148 | ~132 | Associations core | Partial |
| 3 | Eager Loading / Preloading | ~168 | ~82 | All association types | Partial |
| 4 | Base / Persistence / Attributes | ~45 | ~205 | Standalone | Good |
| 5 | Autosave Associations | ~140 | ~95 | All association types | Partial |
| 6 | Association Misc | ~130 | ~90 | Associations core | Partial |
| 7 | Join Associations | ~120 | ~85 | Associations, JOINs | Partial |
| 8 | Relation / Where | ~91 | ~59 | Relation core | Partial |
| 9 | Nested Attributes | ~100 | ~120 | Autosave | Partial |
| 10 | Migrations / Schema | ~90 | ~75 | Standalone | Partial |
| 11 | Serialization / Store / JSON | ~50 | ~115 | Standalone | Mostly done |
| 12 | BelongsTo Associations | ~70 | ~80 | Associations core | Partial |
| 13 | Inverse Associations | ~60 | ~85 | All association types | Partial |
| 14 | HABTM Associations | ~70 | ~55 | Join tables | Partial |
| 15 | HasOne Associations | ~50 | ~55 | Associations core | Partial |
| 16 | Validations | ~10 | ~95 | Mostly standalone | Mostly done |
| 17 | Finders / Calculations | ~24 | ~220 | Relation, JOINs | Mostly done |
| 18 | Locking | ~35 | ~35 | Transactions | Partial |
| 19 | Transactions | ~30 | ~25 | Base | Partial |
| 20 | Insert / Upsert | ~25 | ~20 | Base | Partial |
| 21 | Reflection | ~24 | ~41 | Associations | Mostly done |
| 22 | Counter Cache | ~6 | ~39 | BelongsTo, callbacks | Good |
| 23 | Strict Loading | ~15 | ~15 | Associations | Partial |
| 24 | Primary Keys | ~15 | ~25 | Base | Mostly done |
| 25 | DB Adapters (SQLite/PG/MySQL) | ~1,284 | ~165 | Real DB connections | Stubs complete |
| 26 | Small areas (<20 each) | ~70 | ~140 | Various | Mixed |

## Dependency graph

```
Base / Persistence / Attributes  ─── standalone
   │
   ├── Relation / Where ─── standalone
   │     └── Finders / Calculations
   │
   ├── Transactions ─── standalone
   │     └── Locking
   │
   ├── Associations Core
   │     ├── HasMany        ─┐
   │     ├── BelongsTo       ─┤
   │     ├── HasOne          ─┤── all parallel
   │     ├── HABTM           ─┤
   │     ├── Join Assoc      ─┤
   │     ├── Inverse         ─┤
   │     ├── Association Misc ┘
   │     │
   │     ├── Through ─── needs has_many + belongs_to
   │     ├── Counter Cache ─── needs belongs_to callbacks
   │     ├── Strict Loading ─── needs associations loading
   │     ├── Autosave ─── needs all association types
   │     │     └── Nested Attributes ─── needs autosave
   │     └── Eager Loading ─── needs all association types + JOINs
   │
   ├── Serialization / Store / JSON ─── standalone
   ├── Migrations / Schema ─── standalone
   ├── Insert / Upsert ─── standalone
   ├── Primary Keys ─── standalone
   ├── Validations ─── mostly standalone
   └── Reflection ─── needs association definitions
```

## Recommended execution order

```
Highest ROI (parallel):
  - STI (Single Table Inheritance) — unlocks ~50+ tests across through, eager, association files
  - Scoped associations — basic done, ~20 remaining (default scopes, unscope, instance-dependent)
  - Nested includes (includes(posts: :comments)) — unlocks ~20+ tests
  - source_type: option for polymorphic through — unlocks ~15+ tests

Medium ROI (parallel):
  - HABTM collection operations (<<, delete, clear) — ~20 tests
  - Remaining eager loading edge cases — ~30 tests
  - Autosave edge cases — ~30 tests
  - Transaction callbacks — ~30 tests

Lower ROI / complex:
  - CPK (composite primary keys) — ~15 tests
  - Pessimistic locking — ~7 tests
  - Multi-database support — a few tests
  - Ruby-only concepts (marshal, YAML) — permanently skip
```

## What "converting a stub" typically involves

1. **Trivial unskips** — feature already works, just change `it.skip` to `it`. (~5-10%)
2. **Inline model setup** — test needs multi-model fixture graph with `MemoryAdapter`. (~30-40%)
3. **Missing feature implementation** — build the feature, then write the test. (~30-40%)
4. **Adapter/SQL limitations** — extend `MemoryAdapter`'s SQL parser. (~10-20%)
5. **Ruby-only concepts** — marshal, YAML, Ruby threading. Mark as permanently skipped. (~5%)

## Tracking progress

Run `npm run test:compare` after each batch of work. The key metric is:

```
activerecord: XX.X% real (NNNN matched, NNNN stub / 5428 total)
```

Target: `activerecord: 100% real (5428 matched, 0 stub / 5428 total)`
