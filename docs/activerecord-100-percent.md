# ActiveRecord: Road to 100%

Current state: **61.4%** (5,150 / 8,385 tests). 2,997 skipped, 340 of 342 Rails test files matched. API: 7.9% (47/597 classes).

```bash
pnpm run test:compare -- --package activerecord
pnpm run api:compare
```

## How to work on this

Each workstream below is independent — multiple agents can work on different
streams in parallel without conflicts. Pick a stream, work in a worktree,
and submit a PR.

**Before starting**: read the Rails source for the feature you're implementing.
The test names tell you what behavior to implement, but the Rails source tells
you how. Key Rails files:

- `activerecord/lib/active_record/relation/query_methods.rb` — where/joins/group/order
- `activerecord/lib/active_record/associations/` — association loading, preloading
- `activerecord/lib/active_record/autosave_association.rb` — autosave lifecycle
- `activerecord/lib/active_record/transactions.rb` — transaction wrapping
- `activerecord/lib/active_record/connection_adapters/` — adapter internals

**Measuring progress**: run `pnpm run test:compare -- --package activerecord`
to see current skip counts per file.

---

## Workstream 1: Autosave & transactions (39 skipped)

File: `autosave-association.test.ts` — 137 passing, 39 skipped

Remaining work:

- In-memory state revert on transaction rollback (~7 tests) — `rememberTransactionRecordState` / `restoreTransactionRecordState`
- Nested attribute processing inside the save transaction (~5 tests)
- Double-save / inverse callbacks (~4 tests)
- CPK autosave (~3 tests)
- Store in two relations (~3 tests)
- `save!` raising RecordInvalid, callback cancelling (~2 tests)
- `validate: false` at depth (~1 test)
- Various edge cases (~14 tests)

Related: `nested-attributes.test.ts` (106 passing, 19 skipped)

---

## Workstream 2: Query & relation layer (~200 skipped across files)

### 2A. Association-aware `where` (where.test.ts — 27 passing, 35 skipped)

Passing an association name as a key in `where()` should JOIN the association
table and apply conditions there. Handle polymorphic where.

Rails source: `predicate_builder/association_query_handler.rb`

### 2B. Where-chain (where-chain.test.ts — 27 passing, 27 skipped)

`where.associated()` / `where.missing()` with scopes and enum value translation.

### 2C. Async relation loading (load-async.test.ts — 7 passing, 31 skipped)

`loadAsync()` on Relation — kicks off query immediately, access results later.

### 2D. Relation scoping (scoping/relation-scoping.test.ts — 33 passing, 28 skipped)

Joins within scoping blocks, annotation preservation, STI scoping.

### 2E. Strict loading (strict-loading.test.ts — 24 passing, 30 skipped)

`strictLoadingMode: :n_plus_one_only` — only raises on N+1 queries. HABTM strict loading.

### 2F. Reflection (reflection.test.ts — 35 passing, 32 skipped)

Through scope chain, HABTM reflection, `sourceReflection` / `throughReflection` accessors.

---

## Workstream 3: Associations depth (200+ skipped across files)

### 3A. Eager loading (eager.test.ts — 112 passing, 66 skipped)

Polymorphic preloading, nested eager load, strict loading during eager load.

### 3B. Has-many through (has-many-through-associations.test.ts — 128 passing, 38 skipped)

Through source type, nested through, scope on through.

### 3C. HABTM (has-and-belongs-to-many-associations.test.ts — 52 passing, 43 skipped)

Join table operations, eager loading, destroy behavior.

### 3D. Has-one (has-one-associations.test.ts — 64 passing, 28 skipped)

Replace, build, autosave on has_one.

### 3E. Inverse associations (inverse-associations.test.ts — 58 passing, 35 skipped)

Automatic inverse detection, polymorphic inverse, nested inverse.

### 3F. Join model (join-model.test.ts — 63 passing, 41 skipped)

Polymorphic join, conditions on join, eager loading through join.

### 3G. Associations core (associations.test.ts — 273 passing, 51 skipped)

Edge cases across all association types.

---

## Workstream 4: PostgreSQL types & adapter (~220 skipped)

Each type is self-contained. Pattern: create type class with `cast`/`serialize`/`deserialize`, register in PG adapter type map. Requires `PG_TEST_URL` env var.

| Type                    | File                            | Skipped |
| ----------------------- | ------------------------------- | ------- |
| Range                   | `adapters/postgresql/range`     | 36      |
| PG schema introspection | `adapters/postgres-adapter`     | 35      |
| PG adapter internals    | `adapters/postgres-adapter`     | 31      |
| UUID                    | `adapters/postgresql/uuid`      | 29      |
| Geometric               | `adapters/postgresql/geometric` | 28      |
| HStore                  | `adapters/postgresql/hstore`    | 24      |
| Array                   | extend adapter                  | 22      |
| PG connection           | `adapters/postgres-adapter`     | 15      |

---

## Workstream 5: Schema & migrations (~106 skipped)

### 5A. Schema dumper (schema-dumper.test.ts — 8 passing, 59 skipped)

Timestamps, type-specific column options, `force: :cascade`, index dumping, constraints, defaults.

### 5B. Migration completeness (migration.test.ts — 48 passing, 42 skipped)

Advisory locking, version tracking, reversible blocks, `revert`.

### 5C. Migrator (migrator.test.ts — 30 passing, 5 skipped)

Multi-path discovery, version ordering, duplicate detection.

---

## Workstream 6: Insert-all & serialization (~93 skipped)

### 6A. Insert-all (insert-all.test.ts — 28 passing, 45 skipped)

`RETURNING`, automatic timestamps, adapter-specific SQL.

### 6B. Collection cache key (collection-cache-key.test.ts — 30 skipped)

`Relation#cacheKey` / `cacheKeyWithVersion`.

### 6C. Serialized attributes (serialized-attribute.test.ts — 31 passing, 18 skipped)

JSON/YAML coders, default values, dirty tracking.

---

## Workstream 7: Base & core (53 skipped)

File: `base.test.ts` — 133 passing, 53 skipped

Abstract class resolution, table name customization, ignored columns, `computeType`, class hierarchy edge cases.

---

## Workstream 8: Query cache (36 skipped)

File: `query-cache.test.ts` — 31 passing, 36 skipped

Cache invalidation on INSERT/UPDATE/DELETE within transactions.

---

## Lower priority (isolated, can be done anytime)

| Feature                   | Skip | Notes                                             |
| ------------------------- | ---- | ------------------------------------------------- |
| Fixtures                  | 111  | Transactional fixtures, ERB, association fixtures |
| Encryption ORM            | 51   | Wire encryption into attribute read/write         |
| Connection pool           | 41   | Async checkout, reaping, flushing                 |
| Trilogy/MySQL adapter     | 51   | Only if targeting MySQL                           |
| Unsafe raw SQL            | 37   | `disallowRawSql!` allowlist checks                |
| Multiparameter attributes | 37   | Date form params — Rails HTML form concern        |
| Hash/URL config           | 74   | Config resolution edge cases                      |
| Integration tests         | 33   | Cross-cutting — will pass as features land        |

## Quick wins (independent, can be done anytime)

- **`Relation#with` (CTE support)** — relation/with.test.ts has 16 skipped. CTE infrastructure already exists.
- **Instrumentation** — instrumentation.test.ts has 18 skipped.
