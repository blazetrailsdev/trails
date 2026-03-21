# ActiveRecord: Road to 100%

Current state: **57%** (4,777 / 8,385 tests). 3,367 skipped, 33 wrong describe, 2 missing files.

## How coverage is measured

`npm run convention:compare -- --package activerecord` matches our test names against the Rails test suite. Coverage goes up as a side effect of implementing features.

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

- **Nested paths**: `eagerLoad("comments.author")` generates correct JOINs but
  attaches children to the base record, not intermediate records. Needs per-level
  grouping in `instantiateFromRows` to properly reconstruct the tree.
- **Composite PK joins**: Composite FK/PK join predicates not yet supported
- **CTE/hints/annotations**: These relation features aren't carried into the eager
  load query yet (WHERE/ORDER/GROUP/HAVING are supported)

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
- Fix 18 wrong-describe tests (move to correct blocks)

#### A6: Counter caches (~31 tests)

**Files:** counter-cache.test.ts (31)

Depends on: A4 (associations)

- `counter_cache: true` on belongs_to
- `increment_counter` / `decrement_counter` / `reset_counters`
- Counter updates on create/destroy/reassignment
- Polymorphic counter caches

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

#### B6: Schema, migrations & database tasks (~214 tests)

**Files:** schema-dumper.test.ts (59), migration.test.ts (42), migrator.test.ts (35), tasks/database-tasks.test.ts (78)

Depends on: PostgreSQL adapter (B8) for PG-specific migration tests

- Schema dumper: force:cascade, prefix/suffix, timestamps, type-specific output
- Migrator: file discovery, version tracking, advisory locking
- Database tasks: create, drop, migrate, schema:dump, schema:load
- Migration version tracking with `schema_migrations` table

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

No dependencies — can run in parallel with everything.

- Range type: contains, overlap, adjacent operators
- HStore: key access, merge, contains
- Array: push, remove, any/all operators
- UUID primary keys
- Schema introspection: columns, indexes, foreign keys
- Connection: reconnection, prepared statements, session variables
- Adapter-specific SQL: RETURNING, EXPLAIN, advisory locks

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

### Wrong describes (33 remaining)

Fix alongside whichever PR touches the relevant file:

- nested-attributes.test.ts (18) — A5
- scoping/relation-scoping.test.ts (1) — A1
- associations/nested-error.test.ts (3) — A5
- PG adapter files (~11 across datatype, virtual-column, utils) — B8

---

## Suggested execution order

**Week 1 priority — parallel tracks:**

- A1 (scoping, 56 tests) then A2 (where, 67) — unlocks everything in workstream A
- B1 (base, 55) + B2 (locking, 25) + B3 (strict loading, 34) — independent, quick wins
- B8 (PG adapter, 300+) — large but independent, chip away continuously

**Week 2 priority:**

- A3 (eager loading, 89) + A4 (associations, 250) — the biggest block
- A6 (counter cache, 31) + A7 (relations, 80)
- B5 (fixtures, 111) + B6 (schema/migrations, 214)

**Final stretch:**

- A5 (autosave/nested, 81)
- B7 (encryption integration, 51) + B10 (insert-all, 45) + B12 (remaining, 100)
- B9 (query cache, 62) + B11 (connections, 160)

## Tracking

```bash
npm run convention:compare -- --package activerecord
```
