# ActiveRecord: Road to 100% Test Coverage

Current state: **77.9%** name match (4,229 matched / 5,428 total Ruby tests), **13.4%** real (730 non-skip). 3,499 stubs need converting, ~1,199 tests have no TS match at all. Raw test stats: 6,825 passed, 3,588 skipped.

> **Progress update (2026-03-09, session 2):** Reorganized activerecord tests from 4 monolithic files into ~100 focused per-feature test files matching Rails test structure. Converted 16 more SQLite adapter tests (157 passing / 24 skipped). Extended SqliteAdapter with `pragma()`, `readonly` option, and `withPreventedWrites()`. Overall: 14,160 passed / 4,926 skipped across all packages.
>
> **Progress update (2026-03-09):** Converted 129 `it.skip` stubs to real passing tests across the 6 highest-impact files:
>
> - **base.test.ts** — 85 tests implemented: table name guessing, abstract class checks, find/first/last, firstBang/lastBang with RecordNotFound, exists?, findBy, findOrCreateBy, findOrInitializeBy, toParam, where conditions, count, pluck, pick, ids, min/max/sum/avg, order, group, having, offset, limit, distinct, readonly, lock, joins, update/updateBang, destroyBang, becomes, dup, findBySql, scoping/currentScope, default scope with unscoped, named scopes, column names, ignored columns, readonly attributes, inherited attributes, prefixes/suffixes, and more.
> - **counter-cache.test.ts** — 19 tests: incrementCounter, decrementCounter, updateCounters (single/multiple/multi-record), counter cache with belongsTo association create/destroy lifecycle.
> - **relation/where.test.ts** — 9 tests: string conditions, empty hash, nil hash value, array hash value, range conditions, numeric comparisons, not nil conditions.
> - **insert-all.test.ts** — 5 tests: empty array handling, upsert updates, no callback bypass, array immutability.
> - **strict-loading.test.ts** — 5 tests: per-model default, raises on lazy load, enabled on record, toggle, StrictLoadingViolationError.
> - **reflection.test.ts** — 6 tests: hasMany/hasOne/belongsTo reflection, reflection type, all associations, inferred foreign key.
>
> Also added 100% name-matched test stubs for all 3 database adapter test files (SQLite: 181 tests, PostgreSQL: 1,052 tests, MySQL: 216 tests).
>
> **Progress update (2026-03-08, session 3):** Added scoped preloading support — the preloader now applies association `scope` lambdas when loading hasMany, hasOne, and through associations. Converted 10 more tests.
>
> **Progress update (2026-03-08, session 2):** Jumped from 67.7% to 71.9% (+230 tests). Key features: `has_many :through` / `has_one :through`, through-aware CollectionProxy, polymorphic association support (writes, preloading, counter cache, dependent), variadic `whereAssociated`/`whereMissing`, preloader improvements.

This document groups the remaining work into feature areas, identifies dependencies, and marks what can be worked on in parallel.

## How coverage is measured

`npm run test:compare` extracts test names from Rails Ruby source and matches them by description against our TypeScript `it()` / `it.skip()` tests. A "stub" is an `it.skip()` that matched a Ruby test name. "Missing" means no TS test exists at all. The goal is 0 stubs and 0 missing.

## Summary by feature area

| # | Feature Area | Stubs | Real | Key Dependencies | Parallel? |
|---|---|---|---|---|---|
| 1 | Through Associations | ~195 | ~125 | Associations core | **Partial** — basic through works, polymorphic through works, scoped through works, nested through partially |
| 2 | HasMany Associations | ~148 | ~132 | Associations core, fixtures | **Partial** |
| 3 | Eager Loading / Preloading | ~168 | ~82 | Associations (all types), JOINs | **Partial** — through preloading works, scoped preloading works |
| 4 | Base / Persistence / Attributes | ~45 | ~205 | Mostly standalone | **Good** — 85 tests converted this session |
| 5 | Autosave Associations | ~140 | ~95 | Associations (all types) | **Partial** |
| 6 | Association Misc | ~130 | ~90 | Associations core | **Partial** |
| 7 | Join Associations | ~120 | ~85 | Associations core, JOINs | **Partial** |
| 8 | Relation / Where | ~91 | ~59 | Relation core | **Partial** — 9 tests converted this session |
| 9 | Nested Attributes | ~100 | ~120 | Associations (all types), autosave | **Partial** |
| 10 | Migrations / Schema | ~90 | ~75 | Standalone | **Partial** |
| 11 | Serialization / Store / JSON | ~50 | ~115 | Mostly standalone | **Mostly done** |
| 12 | BelongsTo Associations | ~70 | ~80 | Associations core | **Partial** — polymorphic fully works |
| 13 | Inverse Associations | ~60 | ~85 | Associations (all types) | **Partial** |
| 14 | HABTM Associations | ~70 | ~55 | Associations core, join tables | **Partial** |
| 15 | HasOne Associations | ~50 | ~55 | Associations core | **Partial** — has_one :through works |
| 16 | Validations | ~10 | ~95 | Base, associations (for uniqueness) | **Mostly done** |
| 17 | Finders / Calculations | ~24 | ~220 | Relation, JOINs | **Mostly done** |
| 18 | Locking | ~35 | ~35 | Base, transactions | **Partial** |
| 19 | Transactions | ~30 | ~25 | Base | **Partial** |
| 20 | Insert / Upsert | ~25 | ~20 | Base | **Partial** — 5 tests converted this session |
| 21 | Reflection | ~24 | ~41 | Associations | **Mostly done** — 6 tests converted this session |
| 22 | Counter Cache | ~6 | ~39 | BelongsTo, callbacks | **Good** — 19 tests converted this session |
| 23 | Strict Loading | ~15 | ~15 | Associations (all types) | **Partial** — 5 tests converted this session |
| 24 | Primary Keys | ~15 | ~25 | Base | **Mostly done** |
| 25 | DB Adapters (SQLite/PG/MySQL) | ~1,284 | ~165 | Real DB connections | **Stubs complete** — 100% name match |
| 26 | Small areas (<20 each) | ~70 | ~140 | Various | Mixed |
| | **TOTAL** | **~3,499** | **~730** | | |

## Dependency graph

```
Base / Persistence / Attributes (174)  ─── standalone
   │
   ├── Relation / Where (130) ─── standalone
   │     └── Finders / Calculations (47)
   │
   ├── Transactions (44) ─── standalone
   │     └── Locking (46) ─── needs transactions
   │
   ├── Associations Core
   │     ├── HasMany (199)        ─┐
   │     ├── BelongsTo (96)       ─┤
   │     ├── HasOne (72)          ─┤── all parallel
   │     ├── HABTM (84)           ─┤
   │     ├── Join Assoc (150)     ─┤
   │     ├── Inverse (93)         ─┤
   │     ├── Association Misc (158)┘
   │     │
   │     ├── Through (257) ─── needs has_many + belongs_to working
   │     │
   │     ├── Counter Cache (39) ─── needs belongs_to callbacks
   │     │
   │     ├── Strict Loading (30) ─── needs associations loading
   │     │
   │     ├── Autosave (166) ─── needs all association types
   │     │     └── Nested Attributes (124) ─── needs autosave
   │     │
   │     └── Eager Loading (198) ─── needs all association types + JOINs
   │
   ├── Serialization / Store / JSON (100) ─── standalone
   ├── Migrations / Schema (111) ─── standalone
   ├── Insert / Upsert (43) ─── standalone
   ├── Primary Keys (24) ─── standalone
   ├── Validations (53) ─── mostly standalone
   └── Reflection (40) ─── needs association definitions
```

## Workstreams (can run in parallel)

### Stream A: Associations (1,335 stubs — 51% of total)

This is the largest body of work and the critical path. Most stubs depend on having multi-model fixture graphs with working associations.

**Phase A1 — Core association behaviors (parallel, ~695 stubs)**

These can all be worked on simultaneously since they test independent association types:

- **HasMany** (199 stubs, 113 already matched in `has_many_associations_test.rb`)
  - Lots of existing implementation. Most stubs need multi-model fixture setups with callbacks, dependent destroy, counter cache integration, scoping through associations.

- **BelongsTo** (~70 stubs remaining, ~80 matched in `belongs_to_associations_test.rb`)
  - Polymorphic fully works (read/write/preload/counter cache). Remaining: touch propagation, STI, CPK, some edge cases.

- **HasOne** (~50 stubs remaining, ~55 matched in `has_one_associations_test.rb`)
  - `has_one :through` loading and preloading works. Polymorphic `as:` works. Remaining: build/create through, STI, some edge cases.

- **HABTM** (84 stubs, 8 matched in `has_and_belongs_to_many_associations_test.rb`)
  - Join table management, collection operations, eager loading through join tables.

- **Join Associations** (150 stubs, 2 matched across inner_join/left_outer_join/join_model)
  - `joins()`, `left_outer_joins()`, join model queries. The 102-stub `join_model_test.rb` has 0 matches — needs a new test file targeting it.

- **Inverse** (93 stubs, 0 matched in `inverse_associations_test.rb`)
  - Automatic and explicit inverse detection, bidirectional identity. Needs a new test file.

- **Association Misc** (158 stubs across callbacks, extensions, required, bidirectional destroy, core associations_test)
  - Mixed bag. `associations_test.rb` (122 stubs) covers cross-cutting association behaviors.

**Phase A2 — Through associations (~200 stubs remaining)**

Depends on: HasMany, BelongsTo working well. Core through loading is now implemented.

What works:
- `has_many :through` loading via `loadHasManyThrough` — handles `belongs_to` source (FK on join record) and `has_many` source (FK on target)
- `has_one :through` loading via `loadHasOneThrough` — resolves through `has_one`, `belongs_to`, and `has_many` intermediaries
- Through-aware `CollectionProxy` — `push` creates join records, `delete` destroys them
- Through preloading (both `has_many :through` and `has_one :through`)
- Polymorphic through associations (`as:` on the through association)
- Source name resolution (tries singular and plural)

What's still missing:
- STI + through combinations
- Nested through (through a through)
- `source_type:` option for polymorphic through
- Default scopes on through models
- Instance-dependent scopes
- Counter cache through
- Custom primary keys on through

Remaining stubs are spread across:
- `has_many_through_associations_test.rb` (~120 stubs)
- `has_one_through_associations_test.rb` (~30 stubs)
- `nested_through_associations_test.rb` (~50 stubs)

**Phase A3 — Eager Loading / Preloading (198 stubs)**

Depends on: All association types working.

- `eager_test.rb` (171 stubs) — second largest file
- `cascaded_eager_loading_test.rb` (27 stubs) — no matches at all

Requires `includes()` / `preload()` / `eager_load()` to work with all association types including through and polymorphic.

**Phase A4 — Autosave (166 stubs)**

Depends on: All association types.

- `autosave_association_test.rb` (166 stubs, 11 matched)
- Existing `autosave.ts` is 215 lines. The stubs span ~20 different describe blocks covering has_many, has_one, belongs_to autosave, destroy cascading, validation propagation.

**Phase A5 — Nested Attributes (124 stubs)**

Depends on: Autosave.

- `nested_attributes_test.rb` (114 stubs) + `nested_attributes_with_callbacks_test.rb` (10 stubs)
- `nested-attributes.ts` exists at 173 lines but most test scenarios need autosave + full association lifecycle.

**Phase A6 — Supporting association features (parallel, ~132 stubs)**

Can be worked on independently once core associations work:

- **Counter Cache** (~25 stubs remaining) — basic and polymorphic counter cache work. Remaining: custom counter columns, reassignment counter updates.
- **Strict Loading** (30 stubs) — needs association lazy-loading detection
- **Reflection** (40 stubs) — needs association macro definitions
- **Association Callbacks/Extensions** (included in Misc above)

### Stream B: Base / Persistence / Attributes (174 stubs)

Standalone — no association dependencies. Can start immediately.

- `base_test.rb` (91 stubs, 94 matched) — marshaling, cloning, readonly attributes, connection handling, type casting edge cases
- `persistence_test.rb` (20 stubs, 141 matched) — already well-covered, remaining stubs are edge cases
- `attribute_methods_test.rb` (7 stubs, 126 matched) — nearly complete
- `attributes_test.rb` (25 stubs, 13 matched) — custom attribute types, decoration
- `defaults_test.rb` (16 stubs, 9 matched) — default value expressions
- `normalized_attribute_test.rb` (14 stubs, 1 matched) — `normalizes` API

### Stream C: Relation / Where / Finders (177 stubs)

Mostly standalone. Can start immediately.

- `relation/where_chain_test.rb` (40 stubs) — `where.not`, `where.missing`, `where.associated`
- `relation/where_test.rb` (40 stubs) — polymorphic where, through associations, type casting
- `relation/with_test.rb` (16 stubs, 0 matched) — CTE / `WITH` support, needs new test file
- `relations_test.rb` (16 stubs, 265 matched) — nearly complete
- `calculations_test.rb` (15 stubs, 218 matched) — mostly done
- `finder_test.rb` (32 stubs, 229 matched) — mostly done, remaining need JOINs/eager loading
- `scoping/relation_scoping_test.rb` (10 stubs) — scope merging edge cases
- Small files: `null_relation`, `delegation`, `delete_all`, `field_ordered_values`, `where_clause`, `relation_test` (~6 stubs combined)

### Stream D: Serialization / Store / JSON (100 stubs)

Standalone. Can start immediately.

- `serialized_attribute_test.rb` (50 stubs, 9 matched) — YAML serialization (may need custom coder), JSON column type, mutability tracking
- `store_test.rb` (28 stubs, 22 matched) — store accessors, nested stores, prefix/suffix
- `json_serialization_test.rb` (22 stubs, 1 matched) — `as_json` / `to_json` with includes, methods, only/except

### Stream E: Transactions / Locking (90 stubs)

Sequential dependency: Transactions first, then Locking.

- `transactions_test.rb` (1 stub, 97 matched) — essentially done
- `transaction_callbacks_test.rb` (43 stubs) — `after_commit`, `after_rollback`, callback ordering
- `locking_test.rb` (45 stubs) — optimistic locking edge cases, `with_lock`, retry logic
- `custom_locking_test.rb` (1 stub) — custom lock column

### Stream F: Migrations / Schema (111 stubs)

Standalone. Can start immediately — but note that many migration tests are inherently about DDL execution against real databases, so they may need adapter-level work.

- `migration_test.rb` (70 stubs, 20 matched) — column operations, index management, table operations
- `invertible_migration_test.rb` (27 stubs) — reversible migrations
- `active_record_schema_test.rb` (14 stubs) — `ActiveRecord::Schema.define`

### Stream G: Small areas (parallel, ~130 stubs)

Each area is self-contained and small:

| Area | Stubs | Notes |
|---|---|---|
| Validations (uniqueness) | 53 | Needs DB-level unique constraint support |
| Insert / Upsert | 43 | `insertAll`/`upsertAll` edge cases |
| Primary Keys | 24 | Composite keys, custom PK types |
| Comment / Annotation | 17 | SQL comment annotations — new test file needed |
| Explain | 14 | `explain` output formatting — new test file needed |
| Modules | 14 | Namespaced models — new test file needed |
| Delegated Type | ~5 | `delegated_type` macro — implemented, most tests passing |
| SignedId | 13 | Edge cases (12 stubs, 16 matched) |
| Touch / TouchLater | 11 | Deferred touch, coalescing |
| Serialization | 9 | `ActiveModel::Serialization` edge cases |
| Aggregations | 9 | `composed_of` — value objects |
| ReadOnly | 7 | Readonly records/relations |
| Inheritance / STI | 7 | Edge cases (66 already matched) |
| Sanitize | 6 | SQL sanitization edge cases |
| Cache Key | 5 | `cache_key` / `cache_version` |
| Callbacks | 5 | Lifecycle callback edge cases |
| Enum | 5 | Edge cases (92 already matched) |
| Default Scoping | 5 | Edge cases (91 already matched) |
| Other small | ~13 | HABTM destroy order, inherited, suppressor, batches, token_for, secure_token, timestamp, named_scoping |

## Recommended execution order

Most foundations are now in place. The remaining work is mostly converting fixture-dependent tests (355 in coverage-boost.test.ts alone) and implementing a few missing features.

```
Highest ROI (parallel):
  - STI (Single Table Inheritance) — unlocks ~50+ tests across through, eager, and association files
  - Scoped associations — basic scoped loading/preloading done, ~20 remaining (default scopes, unscope, instance-dependent scopes)
  - Nested includes (includes(posts: :comments)) — unlocks ~20+ tests
  - source_type: option for polymorphic through — unlocks ~15+ tests
  - Fixture-dependent test conversion — 355 stubs in coverage-boost.test.ts

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

Most stubs fall into a few patterns:

1. **Trivial unskips** — the feature already works, the test was just never tried. Change `it.skip` to `it` and it passes. (~5-10% of stubs)

2. **Inline model setup** — the test needs a multi-model fixture graph. Create models with `MemoryAdapter` in `beforeEach`, set up associations, create seed data, run the test. (~30-40% of stubs)

3. **Missing feature implementation** — the underlying feature (e.g., `where.associated`, CTE/WITH, `composed_of`, `delegated_type`) hasn't been built yet. Requires implementing the feature in the source, then writing the test. (~30-40% of stubs)

4. **Adapter/SQL limitations** — the test requires SQL features the `MemoryAdapter` doesn't support (complex JOINs, subqueries, window functions). Requires extending `MemoryAdapter`'s SQL parser or adding the feature. (~10-20% of stubs)

5. **Ruby-only concepts** — marshal round-trip, YAML-specific behavior, Ruby threading. These should be marked as permanently skipped with a comment, or adapted to TypeScript equivalents. (~5% of stubs)

## Files that may benefit from dedicated test files

Most Ruby test files now have TS matches via `coverage-boost.test.ts` or dedicated test files. A few areas might benefit from their own files:

| Ruby file | Remaining stubs | Notes |
|---|---|---|
| `associations/cascaded_eager_loading_test.rb` | ~27 | Nested includes, could be split from eager-hmthrough |
| `relation/with_test.rb` | ~16 | CTE / `WITH` support, not yet implemented |
| `comment_test.rb` | ~17 | SQL comment annotations |

## Tracking progress

Run `npm run test:compare` after each batch of work. The key metric is:

```
activerecord: XX.X% real (NNNN matched, NNNN stub / 5428 total)
```

Target: `activerecord: 100% real (5428 matched, 0 stub / 5428 total)`
