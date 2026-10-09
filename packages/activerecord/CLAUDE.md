# activerecord — Claude guide

Rules that bind only inside `packages/activerecord`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.
The alternatives tried for each decision are in
[docs/claude-md-decision-history.md](../../docs/claude-md-decision-history.md).

## `Relation` is evaluated by an async query (`records`, and the predicates it carries)

Ruby's `Relation` is an Enumerable, and every call that needs the records
themselves reaches them through `records`
(`activerecord/lib/active_record/relation.rb:342-345`), which calls `load`
(`:1179-1186`) and runs the query **synchronously**; an unloaded `size` is
`count(:all)` and an unloaded `empty?` is `!exists?` (`:352-369`), also
synchronous. So a `Relation` is both the query and its result, and a predicate
that needs a second query can run it in place.

In trails the query is `await`ed, and that costs four shapes Rails has no
counterpart for:

- **`applyThenable`** (`relation/thenable.ts`) **/ `stripThenable`**
  (`activesupport/src/strip-thenable.ts`). `await rel` has to evaluate the
  relation, so `Relation.prototype` carries `then` / `catch` / `finally`
  forwarding to `toArray()`. JS unwraps a thenable _returned_ from an `async`
  body, so a builder returning a relation would evaluate it; `stripThenable` is
  the `then`-hiding Proxy view that lets a relation be returned unevaluated
  (and lets `Object#presence` answer one).
- **`DeferredIdsIn` / `DeferredIdsNotIn`**
  (`relation/predicate-builder/deferred-distinct-pk-in.ts`). `RelationHandler#call`
  (`relation/predicate_builder/relation_handler.rb:5-25`), `Relation#excluding`
  and `DisableJoinsAssociationScope#last_scope_chain`
  (`associations/disable_joins_association_scope.rb:22-34`, whose
  `records.pluck(foreign_key)` is a `DeferredPluck`) need ids only a query can
  produce, from synchronous Rails bodies. trails parks an `Arel::Nodes::In` /
  `NotIn` subclass carrying the thunks and
  `Relation#_materializeDeferredDistinctPkPredicates` drains them on the way to
  SQL; the pair exists so `WhereClause#invert` keeps working while the ids are
  unresolved.
- **The synchronous eager builders behind `toSql`** — `Relation#toSql`,
  `_buildEagerOperandManager`, `_applyEagerJoinDependency`,
  `_materializeDeferredDistinctPkPredicates`, and the
  `ConnectionPool#withConnectionSync` call `toSql` runs them through. Rails'
  `Relation#to_sql` (`relation.rb:1210-1221`) returns a String. Two constraints
  keep `toSql(): string` synchronous: `_buildEagerOperandManager` reads the
  synchronous `this._model.primaryKey` (§ "Schema reflection peeks at a warm
  cache"), so an async builder would break `new Post()`; and `toSql` is read
  from sync paths — relation `==` and the query-cache key. A synchronous
  `with_connection` seam can only serve an already-leased connection, which is
  exactly what `withConnectionSync` hands `toSql`. This ratifies the sync
  builders and `toSql`'s sync surface only; the synchronous _lease_ stays under
  the scope boundary of § "Schema reflection peeks at a warm cache".
- **`Relation#[Symbol.asyncIterator]`** (`relation.ts`). Ruby iterates a
  relation with `each` (`relation/delegation.rb:101-104`), which reads
  `records`; `for await (const record of rel)` is that loop in JS. It awaits
  `toArray()` and yields each record, the same evaluation as
  `for (const record of await rel)`. Kept by the repo owner's ruling
  (2026-10-08).

This is a genuine language shortcoming — JS has no synchronous await — and it is
ratified repo-wide here. Those names carry `@noRailsEquivalent PERMANENT`
receipts against this section, and `toSql`'s omitted `apply_join_dependency` /
`with_connection` calls carry `@missingRailsCall … — PERMANENT`; do not
re-derive the decision per call site, and do not file a story to remove them or
to make `toSql` async.

## The pool monitor guards only sections that span an `await` (`ConnectionPool`'s `MonitorMixin`)

Rails' `ConnectionPool` is a monitor (`include MonitorMixin`,
`activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb:217`),
and trails' takes that monitor through ruby-compat's `synchronize`, keyed on
the receiver (`synchronize.call(this, block)` is Ruby's bare `synchronize do`).
A monitor excludes other callers only while its holder is suspended, and a JS
body with no `await` cannot be suspended, so a `synchronize do` whose trails
body is synchronous is already atomic and wrapping it would change only its
return type.

- **Ported onto the monitor**: `checkout`'s pinned branch (`:550-567`, awaits
  `verify!`, nests inside the pinned connection's `lock`, keeps the `:553`
  re-check); `disconnect` (`:454`), `discard!` (`:485`) and
  `clear_reloadable_connections` (`:507`), whose bodies await each connection's
  close; `with_exclusively_acquired_all_connections`, because
  `checkout_for_exclusive_access` (`:802-820`) awaits `checkout` inside the
  monitor as Rails' `attempt_to_checkout_all_existing_connections` (`:753-800`)
  calls it.
- **Not wrapped**: `connections` (`:443`) and the queue's `synchronize`
  (`connection_pool/queue.rb:80-81`, a bare `block()` in `queue.ts`): no
  `await`, and `connections` is a synchronous reader in Rails. Likewise
  `Engine#app`'s `@app_build_lock` (`railties/lib/rails/engine.rb:448,516-524`):
  trails' `app()` builds with no `await`, so the `Mutex#synchronize`
  double-check is not ported.

This is a genuine language shortcoming, ratified repo-wide here. If one of those
bodies ever gains an `await`, it gains the monitor in the same change.

## Schema reflection peeks at a warm cache (`load_schema!`'s `schema_cache.columns_hash`)

Rails' `ModelSchema#load_schema!`
(`activerecord/lib/active_record/model_schema.rb:587-597`) reads
`schema_cache.columns_hash(table_name)` synchronously, and a cold cache just
runs the reflection query in line. In trails a cold cache needs an `await`ed
query and a warm cache needs nothing, so the divergence is confined to the cold
path and the settled shape splits it the same way:

- **Warming is an explicit async step.** `SchemaCache#columnsHash`,
  `#primaryKeys` and `#dataSourceExists` are the async ports;
  `loadSchemaFromAdapter` (`model-schema.ts`) warms all three inside a
  `withConnection` scope and then enters the single `loadSchemaBang` body.
  `SchemaReflection#loadAllBang` / `BoundSchemaReflection#loadAllBang` warm a
  whole pool up front.
- **A booted app warms before user code runs.** Rails loads schema lazily on
  first touch and its `active_record.define_attribute_methods` initializer
  (`activerecord/lib/active_record/railtie.rb:145-185`) is only an eager
  optimisation that skips development and test (`:154-168`). A synchronous
  trails `new` cannot make the first-touch load, so trailties'
  `active_record.initialize_database` awaits `loadAllBang` (`SchemaCache#add_all`,
  `schema_cache.rb:396-404`) on the pool it just established, in every env but
  test (skipped for the reason `railtie.rb:159-160` gives). Like
  `railtie.rb:175-180`, an `ActiveRecordError` only warns.
- **Synchronous readers peek.** `SchemaCache#getCachedColumnsHash`,
  `#getCachedDataSourceExists`, `#getCachedPrimaryKeys`, `#setColumns` and
  `SchemaReflection#loadedCache` read or seed the memo maps and never query.
- **A cold peek answers `undefined`, never a query.** `loadSchemaFromCacheSync`
  returns `false` and leaves the model unloaded, `cachedTableExists` returns
  `undefined`, and `getPrimaryKey` (`attribute-methods/primary-key.ts`) falls
  through to the `"id"` convention. The one exception is `warmColumnsHashSync`,
  which seeds the cache when the adapter's `columns` itself answers
  synchronously (a fake test adapter); a real adapter's promise is dropped with
  its rejection handled, and the cold answer stands. An empty column set was
  rejected because it makes a cold model silently attribute-less; `undefined`
  keeps it unloaded so the async warm can still load it.

**Scope boundary.** This ratifies the schema-cache PEEK only. It does **not**
bless the synchronous _lease_ a peek may sit behind — `withConnectionSync`
(`reflectionAdapter`, `model-schema.ts`), `acquireConnectionSync`
(`abstract/connection-pool.ts`), or the promise arm in
`abstract/connection-pool/queue.ts`'s internal poll. Those stay CONVERGEABLE and
are owned by their own RFC: a synchronous lease is permanent, and it trips the
`permanent_connection_checkout = :disallowed` flag, which is why
`loadSchemaFromAdapter` wraps its warm in `withConnection`. Nothing here is a
receipt for a new sync lease.

This is a genuine language shortcoming, ratified repo-wide here. The sync
schema-cache readers carry `@noRailsEquivalent PERMANENT` receipts against this
section, and a cold-cache `undefined` at a sync reader is the designed answer,
not a bug to re-derive per call site.

## The adapter lock defaults to a monitor, not `NullLock`

Rails' `AbstractAdapter#initialize` ends with `self.lock_thread = nil`
(`activerecord/lib/active_record/connection_adapters/abstract_adapter.rb:157`),
and `lock_thread=` (`:181-191`) maps `nil` to
`ActiveSupport::Concurrency::NullLock`; only a pinned connection gets a real
monitor (`connection_pool.rb:335`). That is safe in Ruby because a lease is per
execution context and a thread runs one statement at a time. In JS one async
context holds many in-flight promises, so `Promise.all([Post.count(),
Post.first()])` hands one adapter to two concurrent statements, and nothing in
the (faithfully keyed) lease registry serializes them.

So trails' `lock` field initializer is `new LoadInterlockAwareMonitor()`
(`abstract-adapter.ts`), where Rails' constructor leaves `NullLock`, and
`setLockThread` stays a faithful port of `lock_thread=` — a caller that passes
`null` still gets `NullLock`; the constructor simply does not make that call.

The same gap reaches the monitor's reentrant arm. Ruby's monitor is owned by a
thread, so a re-entry is always nested in the holder's own call; a `Promise.all`
inside `withinNewTransaction` starts sibling calls that share the holder's
async context. So ruby-compat's `synchronize` (`monitor.ts`) runs each entry
under an owner of its own and serializes re-entries under one holder: a nested
call re-enters at once, siblings take turns. A pinned connection's
`ThreadLoadInterlockAwareMonitor` (`concurrency/load_interlock_aware_monitor.rb:36-68`)
keeps Rails' `@owner` / `@count` / `@mutex` bodies and runs the block through
that same `synchronize` inside Rails' `Thread.handle_interrupt` (`:18-28`). An
uncontended entry runs its block before `synchronize` returns, as a Ruby monitor
does: callers that do not await `lock.synchronize` depend on it. For the same
reason `SQLite3Adapter#disconnectBang` closes the handle under `lock`, where
Rails' `disconnect!` (`sqlite3_adapter.rb:221-226`) closes it after `super`
releases `@lock`.

This is a genuine language shortcoming, ratified repo-wide here. Stories that
serialize adapter access build on the monitor default; none of them is a story
to restore `NullLock`.

## `inherited` is deferred to own-property memo guards (`ModelSchema.inherited`)

Eight modules under `ActiveRecord::Base` define `inherited`, and each runs at
class-definition time, `super` first: `Core` (`activerecord/lib/active_record/core.rb:412-430`),
`AttributeMethods` (`attribute_methods.rb:265-272`), `PrimaryKey`
(`attribute_methods/primary_key.rb:143-150`), `Persistence`
(`persistence.rb:301-307`), `Inheritance` (`inheritance.rb:287-294`),
`ModelSchema` (`model_schema.rb:574-580`), `Reflection` (`reflection.rb:142-147`)
and `Locking::Optimistic` (`locking/optimistic.rb:194-199`). Between them they
reset a subclass's memos to `nil` or a default and seed two things: the
find-by statement cache and the generated modules. JS has no definition-time
hook, and a static read on the child walks the prototype chain to the parent's
value.

**The whole chain is ported as the own-property guard the root CLAUDE.md
ratifies. No link is ported as a method, and nothing dispatches the chain.**
Ruled by the repo owner (2026-10-09), over a single first-read dispatch on
`Base` that would run each ported link in Rails' order: that needs every ivar
below to be an accessor that triggers it, and a reset that runs at first read
clobbers what the class body already wrote.

- **An ivar a link resets** is answered only when it is an own property of the
  class being asked. An inherited value reads as the reset one: `nil`, so the
  memo is rebuilt (`_arelTable`, `_predicateBuilder`, `_inspectionFilter`,
  `_attributeNamesMemo`, `_finderNeedsTypeCondition`, `_queryConstraintsList`,
  and through `ownSchemaMemo` in `model-schema.ts` the schema memos
  `_schemaLoaded`, `_columnsHash`, `_columns`, `_attributesBuilder` and
  `_yamlEncoder`), or the link's default (`_lockingColumn` reads
  `DEFAULT_LOCKING_COLUMN`, `_hasQueryConstraints` and
  `_aliasAttributesMassGenerated` read `false`).
- **An ivar a link leaves alone when it is set** (`@filter_attributes ||= nil`,
  `@generated_association_methods ||= nil`) is the same own-property read, and
  the reader's own Rails body does the rest: `filter_attributes` asks the
  superclass (`core.rb:349-355`).
- **What a link seeds is seeded at the subclass's first read.**
  `cachedFindByStatement` calls `initializeFindByCache` when the class has no
  own `_findByStatementCache`, and `generatedAttributeMethods`
  (`attribute-methods.ts`) calls `initializeGeneratedModules` when it has no own
  `_generatedAttributeMethods`. That reader is the one seed site:
  `generatedAssociationMethods` and encryption's
  `overrideAccessorsToPreserveOriginal` call it first, so the attribute module
  is included before the association one, as `attribute_methods.rb:42-50`
  orders them. `set_base_class` is seeded the same
  way by `baseClass`, and `_typeCandidatesCache` by its reader.
- **A parent is seeded by its own first read, not by its child's.** Rails runs
  each class's links once, in definition order. Here a leaf read before its
  parent seeds only the leaf, and the parent's later read does not disturb it.
  `core.trails.test.ts` covers a three-level hierarchy read leaf first.
- **`Reflection`'s `@__reflections`** is a `WeakMap` keyed by the class
  (`reflection.ts`), which is per-class without a guard.

One thing Rails does at definition time has no counterpart: `Core`'s loop that
re-initializes every ancestor's find-by cache up to the base class
(`core.rb:417-423`) never runs, so a parent keeps its cached statements when a
subclass is defined.

The guard is the port of `inherited`, not a deviation to retire. Where the arms
report flags a guarded read or a first-read seed in one of these readers, it
carries `@inventedArm … — PERMANENT` against this section. `PrimaryKey`'s `_primaryKey`
is still read through the prototype chain, which is debt, tracked by
`primary-key-reset-is-read-through-the-prototype-chain`.

## A model is seated by `registerModel` (the `class` keyword's constant and its `inherited`)

A Ruby `class Foo < ActiveRecord::Base` does two things at the `class` keyword.
It binds the constant `Foo`, which is what `compute_type`
(`activerecord/lib/active_record/inheritance.rb:242-268`) and `constantize`
later resolve a `class_name:` or a stored STI / polymorphic type against. And
it makes `Foo` a subclass of its parent as Ruby sees it: `inherited`
(`inheritance.rb:287-294`) fires, and `Foo` is in the parent's
`Class#subclasses`, which `DescendantsTracker` reads.

A JS `class Foo extends Base {}` does neither. It binds a module-scope
identifier, seats nothing a `rbConstGet` / `computeType` lookup can find, and
fires no hook. trails has no autoloader to seat it either (root CLAUDE.md
§ "Trails has no autoloader"), and no `inherited` (§ "`inherited` is deferred
to own-property memo guards" above).

**`registerModel` (`associations.ts`) is the port of that pair.** One call
seats the constant and registers the subclass:

- `registerModel(Foo)` seats `Foo` under its JS name, and under its `rbModName`
  when a namespace gives it a different one. `registerModel("Name", Foo)` seats
  it under the name given. `registerModel([Foo, Bar])` is one call per model.
- Every form then registers the model with its `rbClassSuperclass` through
  `DescendantsTracker.registerSubclass`, for every model, a direct child of
  `Base` included, as Ruby does for every subclass. `Base` itself registers
  nothing: Rails' `Base` has no model superclass
  (`activerecord/lib/active_record/base.rb:282`), where trails' extends
  ActiveModel's `Model`.

`registerModel` is the interface application and test code uses to define a
model, and its call sites in the test suite are correct as written. There is no
separate one-argument `registerSubclass`: activesupport's two-argument
`registerSubclass(parent, child)` is the port of
`DescendantsTracker.register_subclass`, and the callers that have a parent and a
child in hand (`attributes.ts`, activemodel's `attribute-registration.ts`) keep
calling it.

`registerConstant` (ruby-compat) stays the general seat for a constant that is
not a model, the namespace module a model sits in included: a namespaced model
is `registerModel(rbModConstSet(Sharded, "Blog", this))`, as
`test-helpers/models/sharded/*.ts` do.

This is a genuine language shortcoming, ratified here by the repo owner
(2026-10-09). The ruling is recorded in the tasks-repo story
`register-model-wrapper-is-deleted-tests-seat-constants` (RFC 0180), under
"Direction change (Dean, 2026-10-09)" and "Register always, as `inherited`
does". `registerModel` carries `@noRailsEquivalent PERMANENT` against
this section; there is no story to delete it or to rewrite its callers to
`registerConstant`.

## A create path awaits its block before saving (`create`'s `&block`)

Rails' create paths yield the caller's block synchronously while building the
record and save only afterwards: `Persistence::ClassMethods#create` / `create!`
(`activerecord/lib/active_record/persistence.rb:33-58`) call
`new(attributes, &block)` before `save`, `CollectionAssociation#_create_record`
(`associations/collection_association.rb:353-373`) calls `build_record` before
opening `transaction`, and `SingularAssociation#_create_record`
(`associations/singular_association.rb:67-73`) calls it before `record.save`.
So a block that queries sees the pre-INSERT state
(`has_many_associations_test.rb:2727-2745`), and a block that assigns sees its
writes saved.

In trails a block that does I/O returns a promise, and the build it runs inside
is synchronous, so the promise escapes it and races the save. **The settled
shape is the captured-and-awaited block**: each async create path captures the
block's return value (`yielded = block(record)`) and `await`s it after the
build and before the save — `create` / `createBang` in `persistence.ts`,
`CollectionAssociation#_createRecord` and `SingularAssociation#_createRecord`,
each typing its block `(record) => void | Promise<void>`. `Relation#create`
reaches the first through `currentScopeRestoringBlock`, which returns the
block's value as `relation.rb:1344-1350` does. The synchronous builders (`new`,
`build`) do not await: they have nothing to order a promise against, and a JS
constructor cannot await.

This is a genuine language shortcoming — JS has no synchronous await — ratified
repo-wide here. This section is the wrapper's receipt: the wrapper raises no
call or argument row, so no JSDoc tag applies.

## Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)

Rails ships a second MySQL adapter over [Trilogy](https://github.com/trilogy-libraries/trilogy),
a C client library with Ruby bindings. **Trilogy has no Node client and trails
will not port it**: a TrilogyAdapter built on the `mysql2` npm driver would be a
second `Mysql2Adapter` under a Rails name that means "not mysql2". MySQL goes
through `Mysql2Adapter`.

- `trilogy_adapter.rb`, `adapters/trilogy/` and `trilogy_adapter_test.rb` stay
  in `scripts/parity/unported-files/unscoped.ts`, and their rows are
  **permanent** — not a burndown row, and not covered by the "a documented
  deviation is debt" rule.
- Out of scope means the adapter, not the name: `register_task(/trilogy/, ...)`
  (`activerecord/lib/active_record/tasks/database_tasks.rb:79`) and anything
  that only routes the `"trilogy"` adapter string is ported in full.
- A Rails body or test that needs a live Trilogy connection — branching on
  `current_adapter?(:TrilogyAdapter)`, or rescuing a `Trilogy::` error — ports
  its mysql2 arm and drops the trilogy one; this is the one adapter where
  dropping an adapter arm is correct.
- There is no story to port it. Do not file one, claim one, or un-exclude the
  files to "measure" them.

This is an ecosystem gap rather than a TypeScript language shortcoming, and it
is ratified repo-wide here (repo owner, trails#8579).

## `ActiveRecord::Promise` is the native promise (`promise.rb`, `Promise::Complete`)

Rails' `ActiveRecord::Promise` (`activerecord/lib/active_record/promise.rb`) is
a `BasicObject` over a thread-backed `FutureResult` whose `value` (`:20-29`)
blocks until the query completes; `Promise::Complete` (`:63-81`) is the same
surface over a value already there, returned by the `async_*` readers when
there is no query to wait for. **The native JS promise is the port.**
`promise.rb` is not ported and stays in `scripts/parity/unported-files/unscoped.ts`;
every `async_*` reader returns a native promise, and so does the reader it
wraps. A complete port was written and dropped on the maintainer's decision
(2026-10-01): `value` cannot be ported, an `async function` unwraps any
thenable it returns, and with both `pluck` and `async_pluck` awaited there is
nothing left to tell apart.

As a consequence:

- A Rails `Promise.new`, `Promise::Complete.new` or `Promise.wrap` call is
  omitted and the value returned as it is. It needs no receipt: the parity
  extractor drops those sites by receiver (`native_promise_call?`,
  `scripts/api-compare/extract-ruby-api.rb`). Do not write
  `@missingRailsCall new` or `@missingRailsCall wrap` for one.
- An arm that does something else is kept: `StatementCache#execute` keeps its
  `async:` kwarg and dispatches to `async_find_by_sql`
  (`statement_cache.rb:149-153`).
- A conditional whose arms differ only in the wrap collapses to its value:
  `async ? Promise.wrap([]) : []` is `return []`.
- `Promise#pending?`, `#value` and `#inspect` have no counterpart. A Rails test
  asserting on one ports the assertions that await the value and drops the
  rest, citing this section.

This is a genuine language shortcoming, ratified repo-wide here. There is no
story to port `ActiveRecord::Promise` or `Promise::Complete`.

## Adapter facts are prewarmed and peeked (`lookup_cast_type`, `max_identifier_length`, `quote_string`)

Some synchronous Rails bodies ask the adapter a question only the server can
answer, and ask it in line:

- `PostgreSQL::Quoting#lookup_cast_type`
  (`activerecord/lib/active_record/connection_adapters/postgresql/quoting.rb:195-197`)
  is `super(query_value("SELECT #{quote(sql_type)}::regtype::oid", "SCHEMA").to_i)`,
  reached from the String-returning `quote_default_expression`
  (`abstract/quoting.rb:157-164`).
- `PostgreSQLAdapter#max_identifier_length` (`postgresql_adapter.rb:620-622`)
  memoizes `query_value("SHOW max_identifier_length", "SCHEMA")`. It is
  PostgreSQL's `table_alias_length`, which `JoinDependency#initialize` reads
  inside the synchronous eager builders § "`Relation` is evaluated by an async
  query" ratifies.
- `quote_string` (`postgresql/quoting.rb:127-131`,
  `abstract_mysql_adapter.rb:695-699`) escapes through
  `with_raw_connection { |connection| connection.escape(s) }`. It is reached
  from `Quoting#quote`, Sanitization and the Arel visitor behind `to_sql`.
- `InsertAll#primary_keys` (`insert_all.rb:61-63`) reads
  `@model.schema_cache.primary_keys(model.table_name)`, and
  `InsertAll#initialize` reads it and `supports_insert_returning?` (`:39`).

- `PostgreSQL::Quoting#lookup_cast_type_from_column`
  (`postgresql/quoting.rb:189-192`) runs `verify! if type_map.nil?`, which
  connects and loads the type map before the lookup.
- `AbstractMysqlAdapter#mismatched_foreign_key`
  (`abstract_mysql_adapter.rb:1001-1015`), reached from `translate_exception`
  (`:832-835`), merges `mismatched_foreign_key_details` into the error, and
  that reads the referenced primary-key column through `column_for` (`:995`).

In trails each answer is a query or a connection round-trip, and those are
awaited. The settled shape is the one § "Schema reflection peeks at a warm
cache" records for the schema cache: **an explicit async step warms the fact,
and the synchronous body peeks at the warmed value.**

- `warmMaxIdentifierLength` runs the `SHOW`, and `maxIdentifierLength` reads the
  memo, answering PostgreSQL's default of 63 while it is cold.
- The PostgreSQL type map and its regtype OIDs are warmed when the connection is
  configured and by `reloadTypeMap`. `lookupCastType` reads them, and a type
  created after the warm-up resolves to `ValueType` where Rails returns the
  registered type.
- `quoteString` escapes in process. PostgreSQL doubles the quote; MySQL reads
  the warmed `NO_BACKSLASH_ESCAPES` state to choose between doubling the quote
  and backslash escaping, which is the arm `connection.escape` takes inside the
  client library.
- `InsertAll` awaits its facts before construction, and `primaryKeys` returns
  the warmed list.

- `lookupCastTypeFromColumn` keeps Rails' line and cannot await it. On a cold
  type map it starts `verifyBang` and the lookup raises `TypeError` off the
  unset map. That `TypeError` is the error the caller sees, where Rails raises
  `ConnectionNotEstablished` from `verify!`: the started verify has not
  settled when the lookup runs, so its failure cannot be the one raised. The
  started promise carries a handler that drops its rejection, so a failed
  connect is not also an unhandled rejection. A caller that can reach it on a
  connection nothing has verified warms first: `buildFixtureSql` awaits
  `verifyBang` when the type map is unset, and that await is where the
  connection error surfaces.
- `mismatchedForeignKey` has no fact to warm, because the table and column are
  only known once the failed statement is in hand. It is the one member here
  that answers a value or a promise of it: the `sql` arm returns a promise of
  the `MismatchedForeignKey`, and the `query_parser` arm returns the error
  itself, whose `setQuery` awaits the details. Both are reached only through
  `translateExceptionClass` and `log`, which await.

The alternative is making the callers async, which is the cascade through
`quote`, the Arel visitor and `to_sql` that § "`Relation` is evaluated by an
async query" rejects.

This is a genuine language shortcoming, ratified repo-wide here. The omitted
`query_value`, `quote`, `with_raw_connection` and `table_name` calls carry
`@missingRailsCall … — PERMANENT`, `warmMaxIdentifierLength` carries
`@noRailsEquivalent PERMANENT`, and MySQL's escape-state arm carries
`@inventedArm if — PERMANENT`, `buildFixtureSql`'s warm step carries
`@inventedArm if` / `verifyBang — PERMANENT`, and `mismatchedForeignKey`'s
promise arm carries `@inventedArm then — PERMANENT`, all against this section.
A new instance is not a new decision to argue.

## Fixtures load from `.ts` modules as well as YAML (`FixtureSet::File`)

Rails reads a fixture file through `FixtureSet::File#raw_rows`
(`activerecord/lib/active_record/fixture_set/file.rb:51-53`), which is
`ActiveSupport::ConfigurationFile.parse` over YAML. trails also accepts a
fixture as a `.ts` module registered through `File.registerModule`, and the
canonical test fixtures ship that way.

The registry stays. A YAML-free ActiveRecord boot is a requirement (RFC 0170),
and with the registry gone npm `yaml` would be the only fixture path.
`File.registerModule` and `File.modules` carry `@noRailsEquivalent PERMANENT`
against this section, and there is no story to convert the fixtures to `.yml`.

## Call-time constant resolution (activerecord)

The activerecord inventory for root CLAUDE.md § "Call-time constant
resolution". `activerecord/src/namespaces.ts` holds the `ActiveRecord`,
`ActiveRecord::Associations`, `ActiveRecord::ConnectionAdapters` and
`ActiveRecord::Encryption` namespace objects, extended with
`ActiveSupport::Autoload` like arel's, mirroring `active_record.rb:43-112`,
`associations.rb:15,29-41` and `encryption.rb:10-35`. Each constant is seated
by the module that defines it:

- `ActiveRecord.Base`, `.Encryption`, `.Associations`, `.ConnectionAdapters`,
  `.ConnectionHandling` (`DEFAULT_ENV`), `.ModelSchema` (`derive_join_table_name`),
  `.Reflection` (`create`, read by `Builder::Association.create_reflection`,
  `associations/builder/association.rb:40-51`), `.Migration`, `.Relation`, `.AssociationRelation` and
  `.DisableJoinsAssociationRelation` (read by `Delegation.delegated_classes`,
  `relation/delegation.rb:7-15`), and `.Fixture` (Rails has no
  `autoload :Fixture`; it is defined in `fixtures.rb`, loaded through
  `autoload :FixtureSet`, and its `FixtureError` is raised at
  `abstract/database_statements.rb:615`). `ActiveRecord.Point`
  (`postgresql/oid/point.rb:4`) is required, not autoloaded, and is seated
  with no `autoload` call.
- `Associations`: the six concrete association ctors
  `AssociationReflection#association_class` returns (`reflection.rb:889-923`),
  `CollectionProxy` and `DisableJoinsAssociationScope`
  (`associations/association.rb:107-115`).
- `Encryption`: the whole `encryption.rb:10-35` `eager_autoload` list;
  `Configurable` and `Contexts` are `extend`ed onto `Encryption` itself as
  `encryption.rb:47-48` includes them, so readers spell `Encryption.config.x`;
  `Cipher` is itself `extend`ed with `Autoload` for `Cipher.Aes256Gcm`.
- `ConnectionAdapters`: `ConnectionPool` (read by `abstract/query_cache.rb:100`)
  and the module's singleton `register` / `resolve`
  (`connection_adapters.rb:22-50`, read by `database_config.rb:17`).
- `Migration` is `extend`ed with `Autoload` for `Compatibility`
  (`migration.rb:573`), `CommandRecorder`, `JoinTable`, `ExecutionStrategy` and
  `DefaultStrategy` (`:572-576`); command-recorder.ts reads
  `ActiveRecord.IrreversibleMigration` at call time, so it takes no edge back
  into migration.ts.
- `ActiveRecord` registers itself with `constantize`, which walks each further
  segment through the constant seated on its namespace, as `Object.const_get`
  does (`inflector/methods.rb:289-291`).

The cycles these seats break: `base.ts` importing every `self == Base` reader;
`class SingularAssociation` / `CollectionAssociation extends Association`
reaching `reflection.ts`; `builder/singular-association.ts ->
builder/association.ts -> reflection.ts -> associations.ts -> builder/has-one.ts`,
whose `class HasOne extends SingularAssociation` reads `SingularAssociation` in
TDZ when a builder is the entry module; `class AssociationRelation extends Relation`;
`V8_0 = Current`; `schema-statements.ts -> join-table.ts -> model-schema.ts ->
connection-handling.ts -> … -> abstract-adapter.ts`, whose module-scope
`include(AbstractAdapter, SchemaStatements)` reads `SchemaStatements` in TDZ;
and `query-cache.ts -> connection-pool.ts -> abstract-adapter.ts`, whose
`include(AbstractAdapter, QueryCacheMixin)` reads `QueryCacheMixin` in TDZ.

**The two guarded reads.** `abstract-adapter.ts` reads
`ActiveRecord.Base?.logger ?? null` in the constructor (`abstract_adapter.rb:132,140`)
and `abstract/query-cache.ts`'s `dirties_query_cache` arm reads
`ActiveRecord.Base?.connectionHandler` (`abstract/query_cache.rb:24-25`). An
adapter is a standalone public entry point, constructed and queried with no
model layer loaded (the `sqlite-drivers` lane), so an unseated `Base` there is a
legitimate configuration, not a load-order bug. A read is added to this
exception only when that lane is shown to reach it. A seat on the
`ActiveRecord` module itself (`active-record.ts`, where every
`active_record.rb:182-491` singleton config seat lives and `parity:api` records
it; `Base` holds none of them) needs no guard: the module is a plain import and
holds the Rails default.

The one remaining zero-import slot, and the cycle it breaks:

- `activerecord/src/tasks/database-tasks-slot.ts` — `DatabaseTasks`, read by
  `migration.ts` for `ActiveRecord::Tasks::DatabaseTasks`
  (`migration.rb:151-183,696,750,1037-1041,1361-1365`). `database-tasks.ts`
  imports `migration.ts` and `connection-handling.ts`, so a plain import back
  re-enters the `schema-statements.ts -> migration/command-recorder.ts ->
migration.ts` cycle `ActiveRecord.ConnectionHandling` breaks.

## An adapter file is loaded by an awaited step (`ConnectionAdapters.resolve`'s `require`)

Rails loads an adapter inside `ConnectionAdapters.resolve`: a synchronous
`require path_to_adapter` under a `rescue LoadError`
(`activerecord/lib/active_record/connection_adapters.rb:42-56`). `resolve` is
reached synchronously through `DatabaseConfig#adapter_class`
(`database_configurations/database_config.rb:17-19`) by `quoted_table_name`
(`model_schema.rb:286`), `quoted_primary_key`
(`attribute_methods/primary_key.rb:92`) and `disallow_raw_sql!`
(`sanitization.rb:183`), so it cannot be a promise.

ESM has no synchronous load of a module named by a path: `import()` is the
only one, and it is async. The built-in adapter modules cannot be imported
eagerly instead, because `postgresql-adapter.ts` imports `pg` and
`mysql2-adapter.ts` imports `mysql2/promise`, optional peers an application
installs one of.

**The `require` is `ConnectionAdapters.load(adapterName)`, an awaited step that
runs before `resolve`.** As a consequence:

- `load` awaits the `import()` of the registered path, through
  `ConnectionAdapters.loadPath` for a built-in. It holds a failure in the
  module-private `loadErrors`, and `resolve` raises it as Rails' two
  `LoadError` messages, at Rails' raise site.
- `resolve` is otherwise `connection_adapters.rb:26-66`: same guards, same
  order, same messages.
- `ConnectionHandler#resolvePoolConfig` calls `load` before `validate!`
  (`connection_adapters/abstract/connection_handler.rb:275-280`). It is the one
  step every `establish_connection` already awaits, so `DatabaseConfig#validate!`
  stays Rails' body. Code that builds a `PoolConfig` without a handler
  (`support/template-global-setup.ts`) calls `load` itself.
- An adapter registered by a third party is loaded the same way. Outside the
  handler, the template setup and the per-worker test database setup
  (`test-setup-worker-db.ts`), the only callers are tests that build a
  `DatabaseConfig` by hand, and no other `require` is ported as an awaited step
  on the strength of this section.

This is a genuine language shortcoming, ratified here by the repo owner
(2026-10-08). `load` carries `@noRailsEquivalent PERMANENT` and
`resolvePoolConfig` carries `@inventedArm load — PERMANENT` against this
section. There is no story to remove the step.
