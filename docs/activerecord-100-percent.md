# ActiveRecord: Road to 100%

Current state: **61.2%** (5,135 / 8,385 tests). 3,012 skipped, 340 of 342 Rails test files matched.

```bash
pnpm run convention:compare -- --package activerecord
```

## Architecture overview

The core source files and their roles:

| File                   | Role                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `relation.ts`          | Lazy chainable query builder. WHERE, ORDER, JOIN, GROUP, preload, eager load. Accepts Arel nodes in `where()`.    |
| `base.ts`              | Model class. Persistence (save/create/update/destroy), finders, attribute access, association accessor dispatch.  |
| `associations.ts`      | Association definitions (belongsTo/hasOne/hasMany), loaders, `CollectionProxy`, HABTM (via through internally).   |
| `reflection.ts`        | `AssociationReflection`, `ThroughReflection`, `ColumnReflection`. Metadata about associations and columns.        |
| `autosave.ts`          | `autosaveBelongsTo` (before save), `autosaveChildren` (after save), `validateAssociations`, `markForDestruction`. |
| `nested-attributes.ts` | `acceptsNestedAttributesFor` — assigns nested attrs, processes `_destroy`, wraps save.                            |
| `schema-dumper.ts`     | `SchemaDumper` — generates migration-like schema output from adapter introspection.                               |
| `migration.ts`         | Migration DSL: `createTable`, `addColumn`, `addIndex`, etc.                                                       |
| `migrator.ts`          | `Migrator` — discovers and runs migration files, tracks versions.                                                 |

Association loading flow: `base.ts` accessor -> `loadHasMany`/`loadBelongsTo`/etc. in `associations.ts` -> builds a `Relation` query -> executes via adapter. Collections return `CollectionProxy` wrapping the results.

### Raw SQL that should be converted to Arel

`Relation#where` accepts Arel nodes. The following places still construct raw SQL strings:

**relation.ts** — raw SQL in `_whereRawClauses`:

- Relation subquery: `WHERE col IN (SELECT ...)` (line ~167) — use `Attribute.in(subqueryRelation)`
- `whereAssociated`/`whereMissing` (lines ~244, ~284) — build association subqueries with Arel instead of raw SQL strings
- `findEach`/`findInBatches` cursor (lines ~2849-2905) — `pk >= ?` / `pk > ?` conditions should use `Attribute.gteq()`/`Attribute.gt()`

Note: `where("raw sql ?", bind)` from user code is intentional (Rails supports this) and should stay.

---

## Phase 1 remaining follow-ups

Phase 1 (core associations) is complete. These follow-ups remain:

### 1B follow-ups

1. **Nested through edge cases** (12 skipped) — STI on nested through, polymorphic with scope, preload via joins, table referenced multiple times. Requires JoinDependency/table aliasing.

2. **Polymorphic disable_joins** (12 skipped) — ordering, scopes, chained scopes, limits, first. Need in-memory ordering/limiting when `disableJoins` is set.

3. **`disableJoins` becomes meaningful** when we add JOIN-based through loading (currently all through loading is multi-query).

### 1C follow-ups (56 skipped)

1. **Nested attribute processing outside transaction** — `acceptsNestedAttributesFor` wraps `save()` and processes nested attrs AFTER save returns. Nested attribute saves run outside the save transaction. Rails processes nested attributes inside the transaction. Requires moving `processNestedAttributes` into `saveBody`.

2. **In-memory state revert on rollback** (~7 tests) — when save's transaction rolls back, `_newRecord`, PK, and dirty state are already mutated in memory. Rails has `remember_transaction_record_state` / `restore_transaction_record_state`. Needed to unskip "should rollback destructions" tests.

3. **Callback ordering on update** (~2 tests) — verify after_update timing relative to autosave.

4. **Double-save / inverse callbacks** (~4 tests) — saving same child twice, polymorphic inverse_of callback scenarios.

5. **`validate: false` at depth** (~1 test) — `save({ validate: false })` should skip association validation at all nesting levels.

6. **CPK autosave** (~3 tests) — composite primary key autosave.

7. **Store in two relations** (~3 tests) — same record referenced by two associations, saved once.

8. **save! / callback cancelling** (~2 tests) — `save!` raising RecordInvalid, callback returning false stopping save.

9. **Various edge cases** (~35 tests) — error message deduplication, inverse polymorphic changes, etc.

---

## Phase 2: Parallel workstreams (independent)

### Stream A: Query & relation layer (~200 tests)

#### A1. Association-aware `where` (where.test.ts, ~36 skip)

Passing an association name as a key in `where()` should JOIN the association table and apply conditions there. Handle polymorphic where.

Rails source: `relation/query_methods.rb#build_where_clause`, `predicate_builder/association_query_handler.rb`

#### A2. Tuple syntax for `where` (where.test.ts, ~6 skip)

`where([:id, :name] => [[1, "a"], [2, "b"]])` generating `WHERE (id, name) IN (...)`.

#### A3. Where-chain scopes and enums (where-chain.test.ts, ~27 skip)

`where.associated()` / `where.missing()` with scopes and enum value translation.

#### A4. Async relation loading (load-async.test.ts, ~31 skip)

`loadAsync()` on Relation — kicks off query immediately, access results later.

#### A5. Relation scoping completeness (scoping/relation-scoping.test.ts, ~29 skip)

Joins within scoping blocks, annotation preservation, STI scoping.

#### A6. Strict loading N+1 mode (strict-loading.test.ts, ~30 skip)

`strictLoadingMode: :n_plus_one_only` — only raises on N+1 queries. Aggregation bypass. HABTM strict loading.

#### A7. Reflection completeness (reflection.test.ts, ~32 skip)

Through scope chain, HABTM reflection, `sourceReflection` / `throughReflection` accessors.

---

### Stream B: PostgreSQL types & adapter (~220 tests)

Each type is self-contained. Pattern: create type class with `cast`/`serialize`/`deserialize`, register in PG adapter type map.

| Type                                   | File                                        | Skip count |
| -------------------------------------- | ------------------------------------------- | ---------- |
| Range                                  | `adapters/postgresql/pg-range.ts` (exists)  | 36         |
| Geometric (point, line, polygon, etc.) | `adapters/postgresql/geometric.ts` (exists) | 28         |
| UUID                                   | `adapters/postgresql/uuid.ts` (exists)      | 29         |
| HStore                                 | `adapters/postgresql/hstore.ts` (exists)    | 24         |
| Array                                  | extend adapter                              | 22         |
| PG adapter internals                   | `adapters/postgres-adapter.ts`              | 31         |
| PG schema introspection                | `adapters/postgres-adapter.ts`              | 35         |
| PG connection                          | `adapters/postgres-adapter.ts`              | 15         |

---

### Stream C: Schema & migrations (~140 tests)

#### C1. Schema dumper (~59 skip)

Timestamps, type-specific column options, `force: :cascade`, index dumping, constraints, defaults.

#### C2. Migration completeness (~42 skip)

Advisory locking, version tracking, reversible blocks, `revert`.

#### C3. Migrator file discovery (~5 skip)

Multi-path discovery, version ordering, duplicate detection.

---

### Stream D: Insert-all & serialization (~90 tests)

#### D1. Insert-all enhancements (~45 skip)

`RETURNING`, automatic timestamps, adapter-specific SQL.

#### D2. Collection cache key (~30 skip)

`Relation#cacheKey` / `cacheKeyWithVersion`.

#### D3. Serialized attributes (~18 skip)

JSON/YAML coders, default values, dirty tracking.

---

## Phase 3: Specialized features (isolated, lower priority)

| Feature         | Skip | Notes                                                                 |
| --------------- | ---- | --------------------------------------------------------------------- |
| Fixtures        | 111  | Transactional fixtures, ERB, association fixtures.                    |
| Database tasks  | 78   | Create/drop/migrate/schema rake-equivalent tasks.                     |
| Encryption ORM  | 51   | Wire encryption into attribute read/write. Encrypted finders.         |
| Connection pool | 41   | Async checkout, reaping, flushing.                                    |
| Base edge cases | 53   | Abstract class resolution, table name customization, ignored columns. |
| Query cache     | 36   | Cache invalidation on INSERT/UPDATE/DELETE within transactions.       |

## Phase 4: Adapter & niche (lowest priority)

| Feature                   | Skip | Notes                                                 |
| ------------------------- | ---- | ----------------------------------------------------- |
| Trilogy/MySQL adapter     | 51   | Only if targeting MySQL.                              |
| Multiparameter attributes | 37   | Date form params — Rails HTML form concern.           |
| PG/Trilogy rake tasks     | 63   | Adapter-specific create/drop/migrate.                 |
| Unsafe raw SQL            | 37   | `disallowRawSql!` allowlist checks.                   |
| Hash/URL config           | 74   | Config resolution edge cases.                         |
| Integration tests         | 33   | Cross-cutting — will pass naturally as features land. |

## Quick wins (independent, can be done anytime)

- **`Relation#with` (CTE support)** — relation/with.test.ts has 16 missing tests. CTE infrastructure already exists.
- **`SecurePassword`** — secure-password.test.ts has 10 missing tests.
- **Instrumentation** — instrumentation.test.ts has 18 missing tests.
