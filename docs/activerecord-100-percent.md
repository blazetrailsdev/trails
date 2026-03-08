# ActiveRecord: Road to 100% Test Coverage

Current state: **51.4%** (2,792 matched / 5,428 total Ruby tests). 2,635 stubs need converting, 1 test is missing entirely.

This document groups the remaining work into feature areas, identifies dependencies, and marks what can be worked on in parallel.

## How coverage is measured

`npm run test:compare` extracts test names from Rails Ruby source and matches them by description against our TypeScript `it()` / `it.skip()` tests. A "stub" is an `it.skip()` that matched a Ruby test name. "Missing" means no TS test exists at all. The goal is 0 stubs and 0 missing.

## Summary by feature area

| # | Feature Area | Stubs | Key Dependencies | Parallel? |
|---|---|---|---|---|
| 1 | Through Associations | 257 | Associations core | Yes |
| 2 | HasMany Associations | 199 | Associations core, fixtures | Yes |
| 3 | Eager Loading / Preloading | 198 | Associations (all types), JOINs | After 1,2,5 |
| 4 | Base / Persistence / Attributes | 174 | Mostly standalone | Yes |
| 5 | Autosave Associations | 166 | Associations (all types) | After 1,2,6,8 |
| 6 | Association Misc | 158 | Associations core | Yes |
| 7 | Join Associations | 150 | Associations core, JOINs | Yes |
| 8 | Relation / Where | 130 | Relation core | Yes |
| 9 | Nested Attributes | 124 | Associations (all types), autosave | After 5 |
| 10 | Migrations / Schema | 111 | Standalone | Yes |
| 11 | Serialization / Store / JSON | 100 | Mostly standalone | Yes |
| 12 | BelongsTo Associations | 96 | Associations core | Yes |
| 13 | Inverse Associations | 93 | Associations (all types) | Yes |
| 14 | HABTM Associations | 84 | Associations core, join tables | Yes |
| 15 | HasOne Associations | 72 | Associations core | Yes |
| 16 | Validations | 53 | Base, associations (for uniqueness) | Yes |
| 17 | Finders / Calculations | 47 | Relation, JOINs | Yes |
| 18 | Locking | 46 | Base, transactions | After 19 |
| 19 | Transactions | 44 | Base | Yes |
| 20 | Insert / Upsert | 43 | Base | Yes |
| 21 | Reflection | 40 | Associations | Yes |
| 22 | Counter Cache | 39 | BelongsTo, callbacks | After 12 |
| 23 | Strict Loading | 30 | Associations (all types) | Yes |
| 24 | Primary Keys | 24 | Base | Yes |
| 25 | Small areas (<20 each) | 130 | Various | Mixed |
| | **TOTAL** | **2,635** | | |

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

- **BelongsTo** (96 stubs, 58 matched in `belongs_to_associations_test.rb`)
  - Touch propagation, optional/required, polymorphic, counter cache updates, autosave hooks.

- **HasOne** (72 stubs, 21 matched in `has_one_associations_test.rb`)
  - Build/create through has_one, replacement semantics, dependent destroy.

- **HABTM** (84 stubs, 8 matched in `has_and_belongs_to_many_associations_test.rb`)
  - Join table management, collection operations, eager loading through join tables.

- **Join Associations** (150 stubs, 2 matched across inner_join/left_outer_join/join_model)
  - `joins()`, `left_outer_joins()`, join model queries. The 102-stub `join_model_test.rb` has 0 matches — needs a new test file targeting it.

- **Inverse** (93 stubs, 0 matched in `inverse_associations_test.rb`)
  - Automatic and explicit inverse detection, bidirectional identity. Needs a new test file.

- **Association Misc** (158 stubs across callbacks, extensions, required, bidirectional destroy, core associations_test)
  - Mixed bag. `associations_test.rb` (122 stubs) covers cross-cutting association behaviors.

**Phase A2 — Through associations (257 stubs)**

Depends on: HasMany, BelongsTo working well.

- `has_many_through_associations_test.rb` (148 stubs) — the biggest single file
- `has_one_through_associations_test.rb` (46 stubs)
- `nested_through_associations_test.rb` (63 stubs)

The `through` implementation exists (`associations.ts` ~860 lines) but many edge cases are untested.

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

- **Counter Cache** (39 stubs) — needs belongs_to callbacks
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
| Delegated Type | 13 | `delegated_type` macro — not yet implemented |
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

```
Week 1-2 (parallel):
  Stream B: Base / Persistence / Attributes (174)
  Stream C: Relation / Where / Finders (177)
  Stream D: Serialization / Store / JSON (100)
  Stream G: Small standalone areas (~130)
  Stream A1 start: BelongsTo (96), HasOne (72)

Week 3-4 (parallel):
  Stream A1 continue: HasMany (199), HABTM (84), Join (150), Inverse (93)
  Stream A1 continue: Association Misc (158)
  Stream E: Transactions / Locking (90)
  Stream F: Migrations / Schema (111)

Week 5-6:
  Stream A2: Through Associations (257) — blocked on A1
  Stream A6: Counter Cache, Strict Loading, Reflection (109)

Week 7-8:
  Stream A3: Eager Loading (198) — blocked on A1 + A2
  Stream A4: Autosave (166) — blocked on A1

Week 9:
  Stream A5: Nested Attributes (124) — blocked on A4
  Cleanup and final stubs
```

## What "converting a stub" typically involves

Most stubs fall into a few patterns:

1. **Trivial unskips** — the feature already works, the test was just never tried. Change `it.skip` to `it` and it passes. (~5-10% of stubs)

2. **Inline model setup** — the test needs a multi-model fixture graph. Create models with `MemoryAdapter` in `beforeEach`, set up associations, create seed data, run the test. (~30-40% of stubs)

3. **Missing feature implementation** — the underlying feature (e.g., `where.associated`, CTE/WITH, `composed_of`, `delegated_type`) hasn't been built yet. Requires implementing the feature in the source, then writing the test. (~30-40% of stubs)

4. **Adapter/SQL limitations** — the test requires SQL features the `MemoryAdapter` doesn't support (complex JOINs, subqueries, window functions). Requires extending `MemoryAdapter`'s SQL parser or adding the feature. (~10-20% of stubs)

5. **Ruby-only concepts** — marshal round-trip, YAML-specific behavior, Ruby threading. These should be marked as permanently skipped with a comment, or adapted to TypeScript equivalents. (~5% of stubs)

## Files that need creating (no TS match at all)

These Ruby test files have 0 matched TS tests and need new test files:

| Ruby file | Tests | Suggested TS file |
|---|---|---|
| `associations/join_model_test.rb` | 102 | `join-model.test.ts` |
| `associations/inverse_associations_test.rb` | 93 | `inverse-associations.test.ts` |
| `associations/cascaded_eager_loading_test.rb` | 27 | `cascaded-eager-loading.test.ts` |
| `comment_test.rb` | 17 | `comment.test.ts` |
| `relation/with_test.rb` | 16 | `relation-with.test.ts` |

These 255 tests are currently counted under "stubs" in existing files (via coverage-boost.test.ts) but would benefit from dedicated test files once the features are built.

## Tracking progress

Run `npm run test:compare` after each batch of work. The key metric is:

```
activerecord: XX.X% real (NNNN matched, NNNN stub / 5428 total)
```

Target: `activerecord: 100% real (5428 matched, 0 stub / 5428 total)`
