# ActiveRecord: Road to 100%

Current state: **60.8%** (5,101 / 8,385 tests). 3,046 skipped, 340 of 342 Rails test files matched.

```bash
pnpm run convention:compare -- --package activerecord
```

## Architecture overview

The core source files and their roles:

| File                   | Role                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `relation.ts`          | Lazy chainable query builder. WHERE, ORDER, JOIN, GROUP, preload, eager load.                                                |
| `base.ts`              | Model class. Persistence (save/create/update/destroy), finders, attribute access, association accessor dispatch.             |
| `associations.ts`      | Association definitions (belongsTo/hasOne/hasMany/HABTM), loaders (loadHasMany, loadBelongsTo, etc.), and `CollectionProxy`. |
| `reflection.ts`        | `AssociationReflection`, `ThroughReflection`, `ColumnReflection`. Metadata about associations and columns.                   |
| `autosave.ts`          | `autosaveAssociations()` — saves dirty/new children when parent saves. `markForDestruction` / `isMarkedForDestruction`.      |
| `nested-attributes.ts` | `acceptsNestedAttributesFor` — assigns nested attrs, processes `_destroy`, wraps save.                                       |
| `schema-dumper.ts`     | `SchemaDumper` — generates migration-like schema output from adapter introspection.                                          |
| `migration.ts`         | Migration DSL: `createTable`, `addColumn`, `addIndex`, etc.                                                                  |
| `migrator.ts`          | `Migrator` — discovers and runs migration files, tracks versions.                                                            |

Association loading flow: `base.ts` accessor -> `loadHasMany`/`loadBelongsTo`/etc. in `associations.ts` -> builds a `Relation` query -> executes via adapter. Collections return `CollectionProxy` wrapping the results.

---

## Phase 1: Core associations (do first — unblocks ~500 tests)

These are sequential — each builds on the previous.

### 1A. CollectionProxy completeness

**What exists:** `CollectionProxy` (associations.ts:996) already has `build`, `create`, `push`, `toArray`, `count`, `size`, `isEmpty`, `delete`, `destroy`, `clear`, `includes`, `first`, `last`, `take`, `many`, `none`, `one`, `exists`, `where`, `firstOrInitialize`, `firstOrCreate`, `find`, `findOrCreateBy`, `pluck`, `pick`. Through operations (`_pushThrough`, `_createThrough`, `_pushHabtm`) exist.

**Done:** Target tracking (`_target`/`_loaded`), proxy caching per record, `build`/`push` append without loading, `load`/`reload`/`reset`, `pluck`/`pick`, `scope()`, callback gating on `_target` mutations. 10 tests unskipped.

**Remaining follow-ups:**

1. **`scope()` for through/HABTM** — Currently throws for these. Needs to build a relation that joins through the intermediate table, or queries in two steps for HABTM.

**Tests unblocked:** associations.test.ts (~30), counter-cache.test.ts (~15), HABTM (~10), HMT (~10)

---

### 1B. Through association operations

**What exists:** `loadHasManyThrough` (associations.ts:660) queries through the join table. `CollectionProxy._pushThrough` creates join records. `_buildThrough` builds target records without FK. `_createThrough` saves target + creates join row.

**What's missing:**

1. **Build/create through with intermediate record attributes** — has-one-through `build` should create both the intermediate and target record. Currently `_buildThrough` only builds the target.

   Rails source: `has_one_through_association.rb#create_through_record`, `through_association.rb`

   **Implementation:** When `build()` is called on a through proxy, also build the intermediate record and wire the FKs. Store both in memory so `save` can persist them in order.

2. **Nested through preload** — `loadHasManyThrough` handles one level of through. For nested (through -> through), it needs to walk the chain. Currently nested through throws `HasManyThroughNestedAssociationsAreReadonly` for writes (correct), but reads should work.

   Rails source: `preloader/through_association.rb`, `preloader.rb`

   **Implementation:** In `loadHasManyThrough`, detect when the through association is itself a through. Recursively load: first resolve the intermediate through, then use those records to load the final target. The preloader in `relation.ts` (`_preloadAssociationsForRecords`, line 3264) also needs this — currently it only handles one level.

3. **`disable_joins` through** — has-many-through-disable-joins-associations.test.ts (28 skip). Load through records in two separate queries instead of a JOIN.

   Rails source: `disable_joins_association_scope.rb`

   **Implementation:** If `disableJoins: true` option is set, load intermediate records first, collect their FKs, then load targets with `WHERE id IN (...)`. Add `disableJoins` to `AssociationOptions`.

**Files to modify:** `associations.ts` (loadHasManyThrough, CollectionProxy.\_buildThrough/\_createThrough), `relation.ts` (preloader)

**Tests unblocked:** nested-through (~46), has-one-through (~29), HMT (~15), disable-joins (~28)

---

### 1C. Autosave propagation

**What exists:** `autosave.ts` has `autosaveAssociations()` called after parent save. It handles hasMany, hasOne, belongsTo, HABTM. `markForDestruction` / `isMarkedForDestruction` exist. Error propagation via `propagateErrors`.

**What's missing:**

1. **Rollback on failure** — Tests like "should rollback destructions if an exception occurred while saving" (autosave-association.test.ts:127). Currently if a child destroy fails mid-way, already-destroyed children aren't rolled back.

   Rails source: `autosave_association.rb` wraps autosave in `save_has_many_records` with transaction.

   **Implementation:** Wrap `autosaveHasMany` and friends in the transaction mechanism from `transactions.ts`. If any child save/destroy fails, roll back all changes in that batch.

2. **Validation propagation without autosave** — Rails validates associated records even without `autosave: true` if the records are new or marked for destruction. Currently we only process associations with `autosave: true`.

   Rails source: `autosave_association.rb#validate_single_association`, `#validate_collection_association`

   **Implementation:** In `autosaveAssociations`, also validate (but don't save) associations that don't have `autosave: true` but have new/changed records. Add validation errors to parent if invalid.

3. **Callback ordering** — "callbacks firing order on create/update/save" (autosave-association.test.ts:814-838). Autosave callbacks should fire in a specific order relative to the parent's save callbacks.

   Rails source: `autosave_association.rb` registers callbacks via `before_save`, `after_create`, `after_update`.

   **Implementation:** Hook autosave into the callback chain in `base.ts` save flow. Currently `autosaveAssociations` is called after save — it may need to be split into before-save (for belongsTo that need FK set before parent INSERT) and after-save (for hasMany that need parent PK).

4. **`validate: false` bypass** — "should allow to bypass validations on associated models at any depth" (autosave-association.test.ts:967).

**Files to modify:** `autosave.ts`, `base.ts` (save flow)

**Tests unblocked:** autosave (~40), nested-attributes (~10)

---

## Phase 2: Parallel workstreams (independent, all benefit from Phase 1)

### Stream A: Query & relation layer (~200 tests)

These can be done in any order within the stream.

#### A1. Association-aware `where` (where.test.ts, ~36 skip)

**What exists:** `where()` in `relation.ts` handles hash conditions, raw SQL, named binds, ranges, arrays, NULL. It builds SQL from conditions.

**What's missing:** Passing an association name as a key in `where()` should JOIN the association table and apply conditions there.

Rails source: `relation/query_methods.rb#build_where_clause`, `predicate_builder/association_query_handler.rb`

**Implementation:**

- In `Relation.where()`, when a key matches an association name on the model, resolve it via `_associations`
- Build a JOIN to the association's target table
- Rewrite the conditions to reference the joined table's columns
- Handle polymorphic where: `where(commentable: post)` should set both `commentable_id` and `commentable_type`

**Files:** `relation.ts` (where method, ~line 92)

#### A2. Tuple syntax for `where` (where.test.ts, ~6 skip)

"where with tuple syntax" — `where([:id, :name] => [[1, "a"], [2, "b"]])` generating `WHERE (id, name) IN ((1, 'a'), (2, 'b'))`.

Rails source: `predicate_builder.rb#expand_from_hash` handles array keys.

**Implementation:** In `where()`, detect when a key is an array. Generate `(col1, col2) IN (...)` SQL.

#### A3. Where-chain scopes and enums (where-chain.test.ts, ~27 skip)

**What exists:** `where.associated()` and `where.missing()` exist in relation.ts.

**What's missing:** These need to work with scopes applied to the association, and with enum values (translating enum labels to their integer values).

**Files:** `relation.ts`

#### A4. Async relation loading (load-async.test.ts, ~31 skip)

**What's missing:** `loadAsync()` on Relation — returns a Promise-like that starts the query immediately but lets you access results later. `scheduled?` checks if it's in-flight.

Rails source: `relation.rb#load_async`, `future_result.rb`

**Implementation:**

- Add `loadAsync()` to `Relation` — kicks off `_exec_queries` without awaiting, stores the Promise
- `toArray()` / iteration awaits the stored Promise if present
- `scheduled` getter returns true while the Promise is pending
- Integrate with query cache

**Files:** `relation.ts`

#### A5. Relation scoping completeness (scoping/relation-scoping.test.ts, ~29 skip)

**What's missing:** Joins within scoping blocks, annotation preservation, STI scoping.

**Files:** `scoping/` directory, `relation.ts`

#### A6. Strict loading N+1 mode (strict-loading.test.ts, ~30 skip)

**What exists:** `_strictLoading` flag on records, `StrictLoadingViolationError` thrown on lazy load.

**What's missing:** `strictLoadingMode: :n_plus_one_only` — only raises on lazy loads that happen after initial load (i.e., N+1 queries). Aggregation methods (`count`, `sum`) should bypass strict loading. HABTM strict loading.

Rails source: `core.rb#strict_loading!`, checks in association loaders

**Implementation:** Add `_strictLoadingMode` to Base. In association loaders, check if this is the first load or a subsequent one.

#### A7. Reflection completeness (reflection.test.ts, ~32 skip)

**What exists:** `AssociationReflection`, `ThroughReflection`, basic `reflectOnAssociation` / `reflectOnAllAssociations`.

**What's missing:** Through scope chain (chaining scopes from each link in a through), HABTM reflection details, `sourceReflection`, `throughReflection` accessors on ThroughReflection.

Rails source: `reflection.rb` — `ThroughReflection#source_reflection`, `#through_reflection`, `#scope_chain`

**Implementation:** Add `sourceReflection` and `throughReflection` getters to `ThroughReflection` that look up the reflections on the intermediate model. Add `scopeChain` that collects scopes from each link.

**Files:** `reflection.ts`

---

### Stream B: PostgreSQL types & adapter (~220 tests)

Each type is self-contained. They primarily involve adding type classes to the adapter and handling serialization/deserialization.

**Pattern for each type:**

1. Read Rails source in `activerecord/lib/active_record/connection_adapters/postgresql/oid/`
2. Create a type class that handles `cast`, `serialize`, `deserialize`
3. Register it in the PG adapter's type map
4. The test file already exists — unskip tests as they pass

**What exists:** `pg-range.ts` and `hstore.ts` under `adapters/postgresql/`. The PG adapter is in `adapters/postgres-adapter.ts`.

| Type                                   | File to create/extend                       | Rails source                        | Skip count |
| -------------------------------------- | ------------------------------------------- | ----------------------------------- | ---------- |
| Range                                  | `adapters/postgresql/pg-range.ts` (exists)  | `oid/range.rb`                      | 36         |
| Geometric (point, line, polygon, etc.) | `adapters/postgresql/geometric.ts` (exists) | `oid/point.rb`, `oid/line.rb`, etc. | 28         |
| UUID                                   | `adapters/postgresql/uuid.ts` (exists)      | `oid/uuid.rb`                       | 29         |
| HStore                                 | `adapters/postgresql/hstore.ts` (exists)    | `oid/hstore.rb`                     | 24         |
| Array                                  | extend adapter                              | `oid/array.rb`, `array_parser.rb`   | 22         |
| PG adapter internals                   | `adapters/postgres-adapter.ts`              | `postgresql_adapter.rb`             | 31         |
| PG schema introspection                | `adapters/postgres-adapter.ts`              | `postgresql/schema_statements.rb`   | 35         |
| PG connection                          | `adapters/postgres-adapter.ts`              | `postgresql_adapter.rb`             | 15         |

---

### Stream C: Schema & migrations (~140 tests)

#### C1. Schema dumper (schema-dumper.test.ts, ~59 skip)

**What exists:** `SchemaDumper` class in `schema-dumper.ts`. Basic structure.

**What's missing:** Most of the actual dumping logic — timestamps columns, type-specific column options (limit, precision, scale), `force: :cascade`, index dumping (partial, sort order, expression), check constraints, unique constraints, default values, comment support.

Rails source: `schema_dumper.rb`, `schema_statements.rb`

**Implementation:** The dumper needs to introspect the adapter's schema info (tables, columns, indexes, constraints) and output them as migration DSL calls. Each column type needs specific option handling.

**Files:** `schema-dumper.ts`

#### C2. Migration completeness (migration.test.ts, ~42 skip)

**What's missing:** Advisory locking during migrations, `up`/`down` version tracking edge cases, reversible migration blocks, `revert` inside migrations.

Rails source: `migration.rb`, `migrator.rb`

**Files:** `migration.ts`, `migrator.ts`

#### C3. Migrator file discovery (migrator.test.ts, ~5 skip)

**What's missing:** Multi-path migration discovery, version ordering, duplicate detection.

**Files:** `migrator.ts`

---

### Stream D: Insert-all & serialization (~90 tests)

#### D1. Insert-all enhancements (insert-all.test.ts, ~45 skip)

**What's missing:** `RETURNING` clause support, automatic `created_at`/`updated_at` timestamps on insert_all, adapter-specific SQL generation (PG vs SQLite vs MySQL).

Rails source: `insert_all.rb`, `inserts.rb`

**Files:** `base.ts` (insertAll/upsertAll methods), adapter files

#### D2. Collection cache key (collection-cache-key.test.ts, ~30 skip)

**What's missing:** `Relation#cacheKey` / `cacheKeyWithVersion` — generates a cache key from the relation's SQL and the max updated_at.

Rails source: `relation.rb#cache_key`, `#cache_key_with_version`

**Implementation:** Add `cacheKey()` to Relation that runs `SELECT COUNT(*), MAX(updated_at) FROM (...)` and formats as `model_name/query-count-timestamp`.

**Files:** `relation.ts`

#### D3. Serialized attributes (serialized-attribute.test.ts, ~18 skip)

**What exists:** `serialize.ts` has basic serialization support.

**What's missing:** Edge cases around JSON/YAML coders, default values, dirty tracking with serialized attributes.

**Files:** `serialize.ts`

---

## Phase 3: Specialized features (isolated, lower priority)

These don't unblock other features. Each is a self-contained project.

| Feature         | Skip | Key files                         | Rails source                       | Notes                                                                        |
| --------------- | ---- | --------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Fixtures        | 111  | `fixtures.ts`, `test-fixtures.ts` | `fixtures.rb`, `fixture_set.rb`    | Transactional fixtures, ERB, association fixtures. Large but self-contained. |
| Database tasks  | 78   | `tasks/database-tasks.ts`         | `tasks/database_tasks.rb`          | Create/drop/migrate/schema rake-equivalent tasks. Adapter-specific.          |
| Encryption ORM  | 51   | `encryption.ts`, `encryption/`    | `encryption/encryptable_record.rb` | Wire encryption into attribute read/write. Encrypted finders.                |
| Connection pool | 41   | `connection-pool.ts`              | `connection_pool.rb`               | Async checkout, reaping, flushing. Needs concurrency primitives.             |
| Base edge cases | 53   | `base.ts`                         | `base.rb`, `core.rb`               | Abstract class resolution, table name customization, ignored columns.        |
| Query cache     | 36   | `query-cache.ts`                  | `query_cache.rb`                   | Cache invalidation on INSERT/UPDATE/DELETE within transactions.              |

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

These are small features that unblock tests without depending on the above:

- **`Relation#with` (CTE support)** — relation/with.test.ts has 16 missing tests. CTE infrastructure (`_ctes` array) already exists in `relation.ts` — just needs the SQL generation wired up.
- **`SecurePassword`** — secure-password.test.ts has 10 missing tests. `secure-password.ts` exists.
- **Instrumentation** — instrumentation.test.ts has 18 missing tests. Event subscription for query notifications.
