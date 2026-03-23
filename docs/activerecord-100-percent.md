# ActiveRecord: Road to 100%

Current state: **59.7%** (5,005 / 8,385 tests). 3,142 skipped, 0 missing files.

## How coverage is measured

`pnpm run convention:compare -- --package activerecord` matches our test names against the Rails test suite. Coverage goes up as a side effect of implementing features.

## Two workstreams

These run in parallel — they touch different files and have minimal overlap.

---

### Workstream A: Associations, Querying & Relations

**~1,400 skipped tests.** The biggest chunk of remaining work. These features build on each other — order matters.

#### A1: Scoping & default_scope (~56 tests)

**Files:** scoping/relation-scoping.test.ts (53), plus scattered tests in relations.test.ts

Foundation for everything else — many association and querying tests depend on `default_scope`, `unscoped`, and `scoping`. Implement first.

- `default_scope`, `unscoped`, `scoping` block
- Scope merging/chaining on relations
- `all` vs `unscoped` semantics

#### A2: Where clause features (~67 tests)

**Files:** relation/where.test.ts (36), relation/where-chain.test.ts (31)

Depends on: A1 (scoping)

- `where.not`, `where.or`, `where.and`
- Polymorphic `where` (type + id)
- Range conditions, array conditions
- `where.missing`, `where.associated`

#### A3: Eager loading & preloading (~89 tests)

**Files:** associations/eager.test.ts (69+20 missing), associations/nested-through-associations.test.ts (48)

Depends on: A1 (scoping), A2 (where)

The preloader needs scoping and where support to generate correct subqueries. Nested through preloading is the hardest part.

- `includes`, `preload`, `eager_load`
- Nested eager loading (`includes(comments: :author)`)
- Polymorphic eager loading
- Through + nested through preloading

JoinDependency (#156) implements Rails-style `eager_load` with `t0_r0` column aliasing
and LEFT OUTER JOINs. Supported features:

- Table aliases on all joined tables (`t1`, `t2`, etc.) to handle same-table joins
- Association scopes applied as additional ON conditions
- LIMIT/OFFSET uses a parent-ID subquery to avoid JOIN fan-out
- Composite PK models fall back to the preload path
- Unsupported associations (polymorphic belongsTo, missing models) fall back to preload

Known limitations:

- **Nested paths**: `eagerLoad("comments.author")` falls back to the preload path.
  Supporting nested JOINs needs per-level grouping in `instantiateFromRows`.
- **Composite PK joins**: Composite FK/PK join predicates not yet supported
  (falls back to preload)
- **CTEs**: Common table expressions aren't carried into the eager load query yet
  (WHERE/ORDER/GROUP/HAVING, optimizer hints, and annotations are supported)

#### A4: Remaining association features (~250 tests)

**Files:** associations.test.ts (71), has-many-through (49), has-one-through (29), has-one (31), inverse (35), join-model (41), HABTM (43)

Depends on: A3 (eager loading), A1 (scoping)

- Through association write protection (readonly enforcement)
- Inverse association detection and setting
- Has-one-through CRUD
- HABTM bidirectional syncing, join table callbacks
- Association scopes and conditions
- `collection_singular_ids=` setter
- Disable-joins through associations (28 tests)

#### A5: Autosave & nested attributes (~81 tests)

**Files:** autosave-association.test.ts (62), nested-attributes.test.ts (19+18 wrong describe)

Depends on: A4 (association features)

- `mark_for_destruction`, `_destroy` in nested attributes
- Validation propagation through nested models
- Autosave with through associations
- `reject_if` / `limit` on nested attributes

#### A6: Counter caches (~28 skipped tests remaining)

**Files:** counter-cache.test.ts (28 skipped of 73 total)

Partially done — basic counter cache create/destroy/reassignment works. Remaining:

- Counter cache with locking integration
- Touch option wired into counter cache callbacks
- Collection replacement with counter update
- Through association counter cache support

#### A7: Relation features (~80 tests)

**Files:** relations.test.ts (16), batches.test.ts (13), load-async.test.ts (31), unsafe-raw-sql.test.ts (37)

Depends on: A1 (scoping), A2 (where)

- `find_each`, `find_in_batches`, `in_batches` with cursor
- `load_async` / async relation loading
- Unsafe raw SQL detection and sanitization
- Remaining relation edge cases

---

### Workstream B: ORM Infrastructure & Adapters

**~1,200 skipped tests.** Database adapters, schema management, and ORM lifecycle features. Many are independent of each other.

#### B1: Base class & attributes (~55 tests)

**Files:** base.test.ts (53), attribute-methods.test.ts (2)

No dependencies — can start immediately.

- Remaining base class edge cases (abstract class, table name customization)
- Attribute method generation edge cases
- `column_for_attribute`, `has_attribute?`

#### B2: Locking (~25 tests)

**Files:** locking.test.ts (25)

No dependencies.

- Optimistic locking (`lock_version` column)
- `StaleObjectError` on conflict
- Pessimistic locking (`lock!`, `with_lock`)

#### B3: Strict loading (~34 tests)

**Files:** strict-loading.test.ts (34)

No dependencies.

- `strict_loading!` on records and relations
- `strict_loading_mode` (:all vs :n_plus_one_only)
- `StrictLoadingViolationError`

#### B4: Reflection (~40 tests)

**Files:** reflection.test.ts (40)

Depends on: A4 (association features) for through reflection tests

- Through reflection, source reflection
- Scope chain on reflections
- `column_for_attribute`, `columns_for_attribute`
- HABTM reflection

#### B5: Fixtures (~111 tests)

**Files:** fixtures.test.ts (111)

Depends on: B2 (locking) for some fixture tests

- Transactional fixtures
- Fixture caching and reloading
- YAML fixture loading with ERB
- Fixture associations and label references

#### B6: Schema, migrations & database tasks (~133 skipped tests remaining)

**Files:** schema-dumper.test.ts (59 skipped), migration.test.ts (43 skipped), migrator.test.ts (5 skipped), tasks/database-tasks.test.ts (26 skipped)

Partially done — Migrator with version tracking, DatabaseTasks.migrate(), and basic schema dumper all work. Remaining:

- Schema dumper: force:cascade, prefix/suffix, type-specific output, foreign key dumping
- Schema dumper: extend TableDefinition to support PG-specific DSL methods
- Schema dumper: cleanDefault bigint precision
- Migration: change_table API, column introspection, reversible operations
- Database tasks: remaining create/drop/schema:load edge cases

#### B7: Encryption integration (~51 tests)

**Files:** encryption/encryptable-record.test.ts (51)

Depends on: B1 (base class) — needs attribute hooks wired into Base

- `encrypts` attribute declaration on Base
- Transparent encrypt/decrypt on read/write
- Deterministic encryption for queryable columns
- `with_encryption_context`, `without_encryption`
- `ignore_case`, `downcase` options

#### B8: PostgreSQL adapter & types (~300+ tests)

**Files:** postgresql-adapter.test.ts (31), schema.test.ts (35), range.test.ts (36), hstore.test.ts (24), array.test.ts (22), connection.test.ts (22), uuid.test.ts (29), plus ~20 smaller files

Partially done — network types, money types, enum DDL, and SQL type mapping implemented. Remaining:

- Range type: contains, overlap, adjacent operators; multirange (PG 14+)
- HStore: key access (`->`, `?`, `@>`, `<@`, `||`, `-`), merge, contains, `akeys()`, `avals()`
- Array: push, remove, any/all operators, array column introspection
- UUID primary keys, `gen_random_uuid()` default
- Schema introspection: columns, indexes, foreign keys, expression indexes
- Connection: reconnection, prepared statements, session variables
- PG-specific collation syntax, extension dumping

#### B9: Query cache & logs (~36+26 tests)

**Files:** query-cache.test.ts (36), query-logs.test.ts (remaining)

No dependencies.

- Cache invalidation on writes
- Cache with different SQL variations
- Query log tags and formatters

#### B10: Insert-all (~45 tests)

**Files:** insert-all.test.ts (45)

Depends on: B8 (PG adapter) for RETURNING and adapter-specific ON CONFLICT

- `insert_all!` with duplicate raising
- `returning` option
- `update_only` with real adapter-specific SET clauses
- Timestamp auto-setting on upsert
- Attribute alias support

#### B11: Connections & config (~160 tests)

**Files:** connection-pool.test.ts (41), connection-adapters/ (various, ~40), database-configurations/ (34), merge-and-resolve (40)

Partially done (#146). Mostly threading/concurrency dependent.

- Connection pool: async waiting, reaping, flushing
- Hash config parsing, URL config resolution
- Multi-database: `connected_to`, role switching, shard routing
- Connection management middleware

#### B12: Remaining features (~100 tests)

**Files:** transactions.test.ts (17), serialized-attribute.test.ts (18+10), store.test.ts (4), multiparameter-attributes.test.ts (37), collection-cache-key.test.ts (30), integration.test.ts (33), enum.test.ts (8), dirty.test.ts (4)

Various smaller features:

- Transaction callbacks: `after_commit`, `after_rollback` ordering
- Serialized attributes with JSON/YAML coders
- Store accessors
- Multiparameter attribute assignment (dates from form params)
- Collection cache key generation
- Enum edge cases

---

## Blocked features by category

Grouped from skip-test comments across all activerecord test files (~3,142 skipped):

### Fixtures (~103 skipped tests)

The single largest blocker. Needs YAML file loading, fixture caching, transactional fixtures, association resolution in fixtures, ERB template support, label replacement (`$LABEL`), and multi-database fixture support.

### Autosave & nested attributes (~15 skipped)

Needs autosave association integration, FK sync, validation propagation, and `mark_for_destruction`.

### Base model integration (~23 skipped)

Many tests need a wired-up Base model with features like `validates_uniqueness_of`, `attribute_for_inspect`, `dup`, dirty tracking, and range/hstore attributes.

### Composite primary keys (~16 skipped)

Needs composite key support in queries, associations, fixtures, and FK resolution.

### Timezone infrastructure (~10 skipped)

Needs timezone-aware datetime handling, `timestamptz`, and time-string parsing.

### Lazy-loading tracking (~7 skipped)

Needs strict loading violation tracking for n+1 detection.

### Thread/concurrency (~7+ skipped)

Needs thread tracking, pin connection, concurrent connections, fiber emulation.

### Callbacks (~7 skipped)

Callbacks not fully implemented — needs `reflectOnAllAssociations` to inspect callback count, `beforeDestroy` halting, and transactional callback deduplication.

### HStore operators (~6+ skipped)

Needs `->`, `?`, `@>`, `<@`, `||`, `-` operators, plus `akeys()`, `avals()`, `skeys()`, `svals()`.

### PG multirange (~6 skipped)

Needs PG 14+ multirange type support.

### Serialize API (~4+ skipped)

Needs `serialize` with JSON/YAML coders, class-based serialization, and `store_accessor`.

### Schema/migration features (~3+ skipped)

Needs schema cache, prefix/suffix filtering, force:cascade, column default tracking.

---

## Tracking

```bash
pnpm run convention:compare -- --package activerecord
```
