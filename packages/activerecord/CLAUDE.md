# activerecord — Claude guide

Rules that bind only inside `packages/activerecord`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.

## `Relation` is evaluated by an async query (`records`, and the predicates it carries)

Ruby's `Relation` is an Enumerable, and every call that needs the records
themselves reaches them through `records`
(`activerecord/lib/active_record/relation.rb:342-345`), which calls `load`
(`:1179-1186`) and runs the query **synchronously**. Some terminal calls answer
without materializing anything — an unloaded `size` is `count(:all)` and an
unloaded `empty?` is `!exists?` (`:352-369`) — but those run a query
synchronously too. Nothing in Rails' relation surface is a promise, so a
`Relation` is both the query and its result, and a predicate that needs a
second query to build itself can just run it in place.

In trails the query is `await`ed, and that costs three shapes Rails has no
counterpart for:

- **`applyThenable`** (`relation/thenable.ts`) **/ `stripThenable`**
  (`activesupport/src/strip-thenable.ts`, so `Object#presence` can answer a
  relation unevaluated). `await rel`
  has to evaluate the relation, so `Relation.prototype` carries `then` /
  `catch` / `finally` forwarding to `toArray()`. That makes every `Relation` a
  thenable, which JS then unwraps automatically anywhere one is _returned_ from
  an `async` body — so a builder that returns a relation would evaluate it.
  `stripThenable` is the `then`-hiding Proxy view that lets a relation be
  returned without being run. This is the same language shortcoming
  § "Serialization's dual sync/async hash" ratifies for `serializable_hash`,
  one layer down.
- **`DeferredIdsIn` / `DeferredIdsNotIn`**
  (`relation/predicate-builder/deferred-distinct-pk-in.ts`). Two predicate
  builders need ids that only a query can produce, and both are reached from
  synchronous Rails bodies: `RelationHandler#call`
  (`relation/predicate_builder/relation_handler.rb:5-25`) reads `value.arel`
  after `apply_join_dependency`, and `Relation#excluding`
  (`relation/query_methods.rb`) builds a `NOT IN` over records. Where Rails runs
  that query in line, trails parks an `Arel::Nodes::In` / `NotIn` subclass
  carrying the thunks, and `Relation#_materializeDeferredDistinctPkPredicates`
  drains them on the way to SQL. The pair exists so `invert()` keeps working
  (`WhereClause#invert`) while the ids are still unresolved.
  `DisableJoinsAssociationScope#last_scope_chain`
  (`associations/disable_joins_association_scope.rb:22-34`) is the third site:
  its `record_ids = records.pluck(foreign_key)` is a `DeferredPluck`, which
  `where(key => join_ids)` parks as a `DeferredIdsIn` (over a `Grouping` of
  attributes for a composite key) and which
  `DisableJoinsAssociationRelation#ids` awaits. So `scope` stays synchronous
  and the relation it returns has Rails' one `(klass, key, ids)` mode; the
  plucks run when that relation first reaches SQL, not at scope build.
- **The synchronous eager builders behind `toSql`** — `Relation#toSql`,
  `_buildEagerOperandManager`, `_applyEagerJoinDependency`,
  `_materializeDeferredDistinctPkPredicates` (all `relation.ts`), and the
  `ConnectionPool#withConnectionSync` call `toSql` runs them through. Rails'
  `Relation#to_sql` (`relation.rb:1210-1221`) returns a String: its
  `eager_loading?` arm goes through `apply_join_dependency`, the other through
  `model.with_connection { |conn| conn.unprepared_statement { conn.to_sql(arel) } }`.
  Two independent constraints keep trails' `toSql(): string` synchronous. First,
  `_buildEagerOperandManager` reads `this._model.primaryKey`, a synchronous
  reader because a JS constructor cannot await — the reader § "Schema
  reflection peeks at a warm cache" ratifies — so an async builder would force
  that reader async and break `new Post()`. Second, an async builder turns a
  prominent Rails String API into `Promise<string>`, and `toSql` is also read
  from sync paths that have nothing to do with construction: the relation `==`
  (`other.toSql() === this.toSql()`) and the query-cache key
  (`computeCacheKey`). Nor is a synchronous `with_connection` seam expressible:
  `ConnectionPool#withConnection` is `async`, so a sync seam can only serve an
  already-leased connection — which is exactly the lease `withConnectionSync`
  hands `toSql`. That is the settled shape, not a gap. This ratifies the sync
  builders and `toSql`'s sync surface only; the synchronous _lease_ behind
  `withConnectionSync` stays under § "Schema reflection peeks at a warm
  cache"'s scope boundary.

This is a genuine language shortcoming — JS has no synchronous await — and it is
ratified repo-wide here. Those names carry `@noRailsEquivalent PERMANENT`
receipts against this section, and `toSql`'s omitted `apply_join_dependency` /
`with_connection` calls carry `@missingRailsCall … — PERMANENT`; do not
re-derive the decision per call site, and do not file a story to remove them or
to make `toSql` async.

## The pool monitor guards only sections that span an `await` (`ConnectionPool`'s `MonitorMixin`)

Rails' `ConnectionPool` is a monitor (`include MonitorMixin`,
`activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb:217`),
and trails' takes that monitor through ruby-compat's `synchronize`, which keys
it on the receiver — `synchronize.call(this, block)` is Ruby's bare
`synchronize do` self-call, with no extra member on the class. A monitor
excludes other callers only while its holder is
suspended, and a JS body with no `await` cannot be suspended: nothing else runs
until it returns. So a `synchronize do` whose body is synchronous in trails is
already atomic, and wrapping it would change nothing but its return type.

That is the whole constraint, and it splits Rails' sections in two:

- **Ported onto the monitor**: `checkout`'s pinned branch (`:550-567`), whose body
  awaits `verify!`. It nests inside the pinned connection's `lock` exactly as
  Rails nests it, and keeps the `:553` re-check. `disconnect` (`:454`),
  `discard!` (`:485`) and `clear_reloadable_connections` (`:507`) are on it too:
  their bodies await each connection's `disconnect!` / close, and
  `with_exclusively_acquired_all_connections` is async, because
  `checkout_for_exclusive_access` (`:802-820`) awaits `checkout` inside the
  monitor exactly as Rails' `attempt_to_checkout_all_existing_connections`
  (`:753-800`) calls it.
- **Not wrapped**: `connections` (`:443`) and the queue's `synchronize`
  (`connection_pool/queue.rb:80-81`, a bare `block()` in `queue.ts`). Their
  trails bodies contain no `await`, and `connections` is a synchronous reader in
  Rails, so it could not await the monitor even if it needed to. The same holds
  outside the pool for `Engine#app`'s `@app_build_lock`
  (`railties/lib/rails/engine.rb:448,516-524`): trails' `app()` builds the
  stack with no `await`, so its `@app ||` memo is already a single build and
  the `Mutex#synchronize` double-check is not ported.

This is a genuine language shortcoming, ratified repo-wide here. If one of those
bodies ever gains an `await`, it gains the monitor in the same change.

## Schema reflection peeks at a warm cache (`load_schema!`'s `schema_cache.columns_hash`)

Rails' `ModelSchema#load_schema!`
(`activerecord/lib/active_record/model_schema.rb:587-597`) reads
`schema_cache.columns_hash(table_name)` at `:592` synchronously, and a cold
cache is no special case: the schema cache runs the reflection query in line,
because in Ruby every query is synchronous. So every caller that needs
`columns_hash`, `primary_key` or `table_exists?` can reach the database from a
plain method body.

In trails a cold cache needs a query, and a query is `await`ed. A warm cache
needs nothing. So the divergence is confined to the cold path, and the settled
shape splits it the same way:

- **Warming is an explicit async step.** `SchemaCache#columnsHash`,
  `#primaryKeys` and `#dataSourceExists` are the async ports, and
  `loadSchemaFromAdapter` (`model-schema.ts`) warms all three inside a
  `withConnection` scope and then enters the single `loadSchemaBang` body.
  `SchemaReflection#loadAllBang` / `BoundSchemaReflection#loadAllBang` and
  `SchemaReflection.eagerLoadSchemaCache` warm a whole pool up front.
- **A booted app warms before user code runs.** Rails loads a model's schema
  lazily, on first touch (`activerecord/lib/active_record/model_schema.rb:587-597`);
  its `active_record.define_attribute_methods` initializer
  (`activerecord/lib/active_record/railtie.rb:145-185`) is only an eager
  optimisation, taken only under the guard at `:169`
  (`!check_schema_cache_dump_version && app.config.eager_load && !Rails.env.local?`),
  and skips development and test on purpose (`:154-168`). A synchronous trails `new` cannot make the
  first-touch load, so trailties' `active_record.initialize_database` awaits
  `loadAllBang` — `SchemaCache#add_all` (`schema_cache.rb:396-404`) — on the
  pool it has just established, in every env but test. It runs in development
  and ignores Rails' `eager_load` / `check_schema_cache_dump_version` arms,
  because in trails first touch IS a cold `new` in every env; it skips test for
  the reason `railtie.rb:159-160` gives, that db:test:prepare may still change
  the schema. Like `railtie.rb:175-180`, an `ActiveRecordError` only warns, so
  the app still boots against an unhealthy database; the adapters wrap driver
  failures (a refused PostgreSQL connection is a `DatabaseConnectionError`).
- **Synchronous readers peek.** `SchemaCache#getCachedColumnsHash`,
  `#getCachedDataSourceExists`, `#getCachedPrimaryKeys`, `#setColumns` and
  `SchemaReflection#loadedCache` read or seed the memo maps and never query.
  The warm precondition is that one of the async steps above has already run
  for that table on that pool.
- **A cold peek answers `undefined`, never a query.** Each sync reader treats
  it as "not reflected yet": `loadSchemaFromCacheSync` (`model-schema.ts`)
  returns `false` and leaves the model unloaded, `cachedTableExists` returns
  `undefined` (unknown), and `getPrimaryKey`
  (`attribute-methods/primary-key.ts`) falls through to the `"id"` convention —
  the same answer its `table_exists?` arm gives an absent table. The one exception is `warmColumnsHashSync`, which
  seeds the cache when the adapter's `columns` itself answers synchronously (a
  fake test adapter); a real adapter's promise is dropped with its rejection
  handled, and the cold answer stands.

The alternatives each lose more than they buy:

- **Making every reader async** propagates through `columns_hash`,
  `attribute_types`, `type_for_attribute`, Arel type-casting and
  `Relation#to_sql`, which are synchronous Rails-facing API — the same cascade
  § "Serialization's dual sync/async hash" rejects for `as_json`.
- **Blocking on the query** is not available: JS has no synchronous await.
- **Answering a cold column read with an empty column set** makes a cold model
  silently attribute-less where Rails would have reflected it; `undefined`
  keeps it unloaded so the async warm can still load it.

**Scope boundary.** This ratifies the schema-cache PEEK only. It does **not**
bless the synchronous _lease_ a peek may sit behind — `withConnectionSync`
(`reflectionAdapter`, `model-schema.ts:27-30`), `acquireConnectionSync`
(`abstract/connection-pool.ts`), or the promise arm in
`abstract/connection-pool/queue.ts`'s internal poll. Those stay CONVERGEABLE and are owned by their own RFC: a
synchronous lease is permanent, and it trips the
`permanent_connection_checkout = :disallowed` flag #7781 armed, which is exactly
why `loadSchemaFromAdapter` wraps its warm in `withConnection` (see its JSDoc).
Nothing here is a receipt for a new sync lease.

This is a genuine language shortcoming, ratified repo-wide here. The sync
schema-cache readers carry `@noRailsEquivalent PERMANENT` receipts against this
section, and a cold-cache `undefined` at a sync reader is the designed answer,
not a bug to re-derive per call site.

## The adapter lock defaults to a monitor, not `NullLock`

Rails' `AbstractAdapter#initialize` ends with `self.lock_thread = nil`
(`activerecord/lib/active_record/connection_adapters/abstract_adapter.rb:157`),
and `lock_thread=` (`:181-191`) maps `nil` to
`ActiveSupport::Concurrency::NullLock`. Only a pinned connection gets a real
monitor (`connection_pool.rb:335`). That is safe in Ruby because the pool leases
a connection per execution context
(`@leases[ActiveSupport::IsolatedExecutionState.context]`,
`connection_pool.rb:710-712`), and a thread runs one statement at a time: the
concurrency unit and the serialization unit are the same object.

In JS they are not. trails' lease registry is keyed the same way
(`connectionLease`, `abstract/connection-pool.ts`, over `IsolatedExecutionState.context()`),
faithfully — but one async context can hold many in-flight promises, so
`Promise.all([Post.count(), Post.first()])` hands one adapter to two concurrent
statements. Nothing in the lease model serializes them.

The alternatives were tried:

- **Porting `self.lock_thread = nil` verbatim** reds all three tests named in
  `abstract-adapter-null-lock-breaks-concurrent-async-statements`.
- **An adapter-local statement queue** (SQLite's former `_statementLock`,
  since retired onto `withRawConnection`) does not cover it: it wrapped only
  `performQuery`, not `withRawConnection`'s `connectBang` (three concurrent
  opens) nor the post-`rawExecute` `_lastInsertRowid` read, and it existed on
  one adapter only.
- **Leasing per promise** has no Ruby counterpart and no JS hook to key on.

So trails' `lock` field initializer is `new LoadInterlockAwareMonitor()`
(`abstract-adapter.ts`), where Rails' constructor leaves `NullLock`, and
`setLockThread` itself stays a faithful port of `lock_thread=` — a caller that
passes `null` still gets `NullLock`. The constructor simply does not make that
call.

The same gap reaches the monitor's reentrant arm. Ruby's monitor is owned by a
thread, so a re-entry is always nested in the holder's own call; a
`Promise.all` inside `withinNewTransaction` starts sibling calls that share
the holder's async context. So ruby-compat's `synchronize` (`monitor.ts`) runs
each entry under an owner of its own and serializes re-entries under one
holder: a nested call re-enters at once, siblings take turns. A pinned
connection's `ThreadLoadInterlockAwareMonitor`
(`concurrency/load_interlock_aware_monitor.rb:36-68`) keeps Rails' `@owner` /
`@count` / `@mutex` bodies, which exclude another `Thread`, and its prepended
`synchronize` runs the block through that same ruby-compat `synchronize`
inside Rails' `Thread.handle_interrupt(EXCEPTION_IMMEDIATE, &block)`
(`:18-28`), so the owning thread's sibling promises still take turns. An
uncontended entry runs its block before `synchronize` returns, as a Ruby
monitor does: callers that do not await `lock.synchronize` depend on it. For the same
reason `SQLite3Adapter#disconnectBang` closes the handle under `lock`, where
Rails' `disconnect!` (`sqlite3_adapter.rb:221-226`) closes it after `super`
releases `@lock`: a statement can be in flight on the adapter from the same
async context, which a Ruby thread never is.

This is a genuine language shortcoming, ratified repo-wide here. Stories that
serialize adapter access (retiring SQLite's statement lock onto
`withRawConnection`, the server-version barrier, `FutureResult`'s mutex) build
on the monitor default; none of them is a story to restore `NullLock`.

## `inherited` is deferred to own-property memo guards (`ModelSchema.inherited`)

§ "Module mixins" says only `inherited` has no JS equivalent and its semantics
"have to be deferred some other way". For `ModelSchema` this is that way.
Rails' `ModelSchema.inherited`
(`activerecord/lib/active_record/model_schema.rb:574-580`) runs at
class-definition time and gives the child a fresh load-schema monitor, calls
`reload_schema_from_cache(false)` — a non-recursive reset of the child's
schema memos — and clears `@ignored_columns`. So a subclass never observes its
parent's `@columns_hash`, `@schema_loaded` or attribute builder.

JS has no hook that fires when `class Child extends Parent` is evaluated, and a
static field read on the child walks the prototype chain to the parent's memo.
**The settled deferral is the own-property guard**: `ownSchemaMemo`
(`model-schema.ts`) answers a memo only when it is an own property of the class
being asked (`Object.prototype.hasOwnProperty.call(host, key)`), so an inherited
memo reads as unset — the observable state `inherited`'s reset leaves behind —
without anything running at definition time. `_schemaLoaded`, `_columnsHash`,
`_columns`, `_attributesBuilder` and `_yamlEncoder` are all read through it.

The alternatives lose:

- **A lazy reset at the child's first schema read** would clobber memos written
  to the child _before_ that read — `applyColumnsHash`, attribute declarations —
  which Rails' definition-time reset runs ahead of by construction.
- **A decorator or explicit registration step** on every model (`@model class
Post`, `Post.register()`) would fire at the right moment, but it is invented
  surface imposed at a Rails-facing API on every trails user.

This is a genuine language shortcoming, ratified repo-wide here. An own-property
memo guard in `model-schema.ts` is the port of `inherited`, not a deviation to
retire, and there is no story to port `inherited` as a hook.

## A create path awaits its block before saving (`create`'s `&block`)

Rails' create paths yield the caller's block synchronously while building the
record and save only afterwards: `Persistence::ClassMethods#create` /
`create!` (`activerecord/lib/active_record/persistence.rb:33-58`) call
`new(attributes, &block)` before `save`,
`CollectionAssociation#_create_record`
(`associations/collection_association.rb:353-373`) calls
`build_record(attributes, &block)` before opening `transaction`, and
`SingularAssociation#_create_record` (`associations/singular_association.rb:67-73`)
calls it before `record.save`. So a block that queries — `assert_equal 5,
Client.count` inside `first_or_create`
(`test/cases/associations/has_many_associations_test.rb:2727-2745`) — sees the
pre-INSERT state, and a block that assigns sees its writes saved.

In trails a block that does I/O returns a promise, and the build it runs inside
is synchronous (a constructor, or `build_record`), so the promise escapes it.
Left un-awaited, the block races the save: its query can land after the
INSERT, and its writes after the record is persisted. **The settled shape is
the captured-and-awaited block**: each async create path wraps the block to
capture its return value (`yielded = block(record)`) and `await`s it after the
build and before the save. That is `create` / `createBang` in `persistence.ts`,
`CollectionAssociation#_createRecord` and `SingularAssociation#_createRecord`.
Each of these types its
block `(record) => void | Promise<void>`.
`Relation#create` reaches the first through `currentScopeRestoringBlock`, which
returns the block's value as `relation.rb:1344-1350` does.

The alternatives lose:

- **Passing the block straight through**, as Rails does, is the race above.
- **Awaiting inside the build** would make `new` / `build` async, and a JS
  constructor cannot await — the same wall § "Schema reflection peeks at a warm
  cache" records for `new Post()`.

The synchronous builders (`new`, `build`) do not await: they have nothing to
order a promise against. This is a genuine language shortcoming — JS has no
synchronous await — ratified repo-wide here. This section is the
wrapper's receipt: the wrapper raises no call or argument row, so no JSDoc tag
applies.

## Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)

Rails ships a second MySQL adapter over [Trilogy](https://github.com/trilogy-libraries/trilogy),
a C client library with Ruby bindings: `activerecord/lib/active_record/connection_adapters/trilogy_adapter.rb`
and `activerecord/lib/active_record/connection_adapters/trilogy/`.

**Trilogy has no Node client and trails will not port it.** There is no npm
package wrapping the C library, and nothing to wrap it with: a TrilogyAdapter
built on the `mysql2` npm driver would be a second `Mysql2Adapter` under a
Rails name that means "not mysql2", which is a worse divergence than the
absent file. MySQL goes through `Mysql2Adapter`, as it already does.

As a consequence:

- `trilogy_adapter.rb` and `adapters/trilogy/` stay in
  `scripts/parity/unported-files/unscoped.ts`, and their rows are **permanent** —
  not a burndown row, and not covered by the
  "a documented deviation is debt" rule above. The same holds for
  `trilogy_adapter_test.rb`.
- Out of scope means the adapter, not the name. Rails registers
  `register_task(/trilogy/, "ActiveRecord::Tasks::MySQLDatabaseTasks")`
  (`activerecord/lib/active_record/tasks/database_tasks.rb:79`), and so does
  trails: a body or test that only routes the `"trilogy"` adapter string never
  reaches a client, and is ported in full.
- A Rails body or test that needs a live Trilogy connection — one branching on
  `current_adapter?(:TrilogyAdapter)`, or rescuing a `Trilogy::` error class —
  ports its mysql2 arm and drops the trilogy one. Dropping an adapter arm is normally the bug
  `project_rails_test_adapter_conditional_dropped_in_port` records; this is the
  one adapter where it is correct.
- There is no story to port it. Do not file one, do not claim one, and do not
  un-exclude the files to "measure" them — the exclusion is the answer.

This is an ecosystem gap rather than a TypeScript language shortcoming, and it is
ratified repo-wide here. A new instance is not a new decision to argue.

## `ActiveRecord::Promise` is the native promise (`promise.rb`, `Promise::Complete`)

Rails' `ActiveRecord::Promise` (`activerecord/lib/active_record/promise.rb`) is
a `BasicObject` over a thread-backed `FutureResult`: `value` (`:20-29`) blocks
the caller until the query completes, and `then` (`:36-38`) composes a block
onto it. `Promise::Complete` (`:63-81`) is the same surface over a value that
is already there, which is what the `async_*` readers hand back when there is
no query to wait for: `calculate`'s `none` arms
(`relation/calculations.rb:224,227`), `pluck` (`:294,303`), `pick` (`:355`) and
`ids` (`:382`) on a loaded relation, `StatementCache#execute`'s
`Promise.wrap([])` (`statement_cache.rb:155`), and `FutureResult#then`
(`future_result.rb:22,82`).

**The native JS promise is the port of `ActiveRecord::Promise`.** `promise.rb`
is not ported and stays in `scripts/parity/unported-files/unscoped.ts`. Every
`async_*` reader returns a native promise, and so does the reader it wraps.

A complete port was written and dropped on the maintainer's decision
(2026-10-01), for these reasons:

- **`value` cannot be ported.** It blocks until the query completes, and JS has
  no synchronous await. What is left of the class is `then`, `pending?` and
  `inspect` over a value only an `await` can reach.
- **JS unwraps it.** `FutureResult#then` (`future-result.ts`) is a native
  thenable, so a JS promise resolving to a `FutureResult` unwraps it. And an
  `async function` unwraps any thenable it returns, so `pluck`, `pick` and
  `calculate` cannot hand back a promise object of their own: the caller
  receives a native promise whatever the body returns.
- **There is nothing to tell apart.** In Rails `pluck` answers an Array and
  `async_pluck` a Promise. In trails both are awaited (§ "`Relation` is
  evaluated by an async query"), so `@async ? Promise::Complete.new(result) :
result` has one arm.

As a consequence:

- A Rails `Promise.new`, `Promise::Complete.new` or `Promise.wrap` call is
  omitted and the value returned as it is. It needs no receipt: the parity
  extractor drops those sites by receiver, as it drops `Proc.new`
  (`native_promise_call?`, `scripts/api-compare/extract-ruby-api.rb`), so
  neither call gate asks for them. Do not write `@missingRailsCall new` or
  `@missingRailsCall wrap` for one.
- An arm that does something else is kept: `StatementCache#execute` keeps its
  `async:` kwarg and dispatches to `async_find_by_sql`
  (`statement_cache.rb:149-153`).
- A conditional whose arms differ only in the wrap collapses to its value:
  `async ? Promise.wrap([]) : []` in that method's `rescue ::RangeError`
  (`:155`) is `return []`, and `@async ? Promise::Complete.new(result) : result`
  is `return result`.
- `Promise#pending?`, `#value` and `#inspect` have no counterpart. A Rails test
  asserting on one ports the assertions that await the value and drops the
  rest, citing this section.

This is a genuine language shortcoming, ratified repo-wide here. There is no
story to port `ActiveRecord::Promise` or `Promise::Complete`, and a new instance
is not a new decision to argue.

## Call-time constant resolution (activerecord)

The activerecord inventory for root CLAUDE.md § "Call-time constant
resolution":

- `activerecord/src/namespaces.ts` — not a slot: the `ActiveRecord`,
  `ActiveRecord::Associations`, `ActiveRecord::ConnectionAdapters` and
  `ActiveRecord::Encryption` namespace objects, extended with
  `ActiveSupport::Autoload` exactly like arel's (RFC 0151). Autoloaded there,
  mirroring `active_record.rb:43-112`, `associations.rb:15,29-41` and
  `encryption.rb:14`: `ActiveRecord.Base`, `.Encryption`, `.Associations` and
  `.ConnectionAdapters` (each seated by the module defining it — encryption.ts,
  associations.ts, connection-adapters.ts),
  `.ConnectionHandling` (`DEFAULT_ENV`, `connection_handling.rb:7`),
  `.ModelSchema` (`derive_join_table_name`, `migration/join_table.rb:12`),
  `.Fixture` (Rails has no `autoload :Fixture`: it is defined in `active_record/fixtures.rb`,
  which `active_record.rb:54`'s `autoload :FixtureSet` loads; its `Fixture::FixtureError`
  (`fixtures.rb:809`) is raised at
  `abstract/database_statements.rb:615`), and `.Relation`, `.AssociationRelation` and
  `.DisableJoinsAssociationRelation`, which `Delegation.delegated_classes` reads
  (`relation/delegation.rb:7-15`); the six
  concrete association ctors `AssociationReflection#association_class` returns
  (`reflection.rb:889-923`), `Associations.CollectionProxy` and
  `Associations.DisableJoinsAssociationScope` (`associations/association.rb:107-115`);
  `Encryption.Configurable`, which encryption.ts `extend`s onto `Encryption`
  itself with `Contexts`, as `encryption.rb:47-48` does `include Configurable` /
  `include Contexts`, so readers spell `Encryption.config.x` and
  `Encryption.withoutEncryption(...)`; `Encryption.Cipher`, itself `extend`ed
  with `Autoload` for `Cipher.Aes256Gcm` (`encryption.rb:39-45`), which
  `Encryption.eagerLoadBang` loads after `super` (`encryption.rb:50-54`);
  `ConnectionAdapters.ConnectionPool`
  (`connection_adapters.rb:107-110`, read by `abstract/query_cache.rb:100` for
  `ConnectionPool::WeakThreadKeyMap`), and `ConnectionAdapters.register` /
  `.resolve`, the module's singleton methods (`connection_adapters.rb:22-50`,
  read by `database_config.rb:17`), seated by connection-adapters.ts;
  `ActiveRecord.Migration` (`active_record.rb:60`). `Migration.Compatibility`
  (`migration.rb:573`, read at `:629-631` and `schema.rb:72`) is autoloaded on
  the `Migration` class itself, which migration.ts `extend`s with `Autoload`,
  and seated by compatibility.ts. `CommandRecorder`, `JoinTable`, `ExecutionStrategy` and
  `DefaultStrategy` (`migration.rb:572-576`) are autoloaded beside it and seated
  by migration.ts, which imports all four; command-recorder.ts reads
  `ActiveRecord.IrreversibleMigration` (seated by migration.ts) at call time, so
  it takes no edge back into migration.ts. `Encryption` autoloads the whole
  `encryption.rb:10-35` `eager_autoload` list, each seated by its defining module. `ActiveRecord` registers
  itself with `constantize`, which walks each further segment through the
  constant seated on its namespace, as `Object.const_get` does
  (`inflector/methods.rb:289-291`). `ActiveRecord.Point`
  (`postgresql/oid/point.rb:4`) is required, not autoloaded, and is seated with
  no `autoload` call. The cycles they break are the ones the deleted slots broke:
  `base.ts` importing every `self == Base` reader; `class SingularAssociation` /
  `CollectionAssociation extends Association` reaching `reflection.ts`; `class
AssociationRelation extends Relation`; `V8_0 = Current`; and
  `schema-statements.ts -> join-table.ts -> model-schema.ts ->
connection-handling.ts -> … -> abstract-adapter.ts`, whose module-scope
  `include(AbstractAdapter, SchemaStatements)` reads `SchemaStatements` in TDZ,
  and `query-cache.ts -> connection-pool.ts -> abstract-adapter.ts`, whose
  `include(AbstractAdapter, QueryCacheMixin)` reads `QueryCacheMixin` in TDZ.
  `connection-adapters/abstract-adapter.ts` reads `ActiveRecord.Base?.logger ?? null` in the constructor
  (`abstract_adapter.rb:132,140`). That read on a standalone adapter's own
  path is one of the two guarded autoload reads, falling back to the value Rails'
  autoloaded `active_record.rb` would hold. The other is
  `connection-adapters/abstract/query-cache.ts`'s `dirties_query_cache` arm,
  `ActiveRecord.Base?.connectionHandler` (`abstract/query_cache.rb:24-25`,
  `connection_handling.rb:258-262`), which a standalone adapter's `execute`
  reaches. An
  adapter is a standalone public entry point, constructed and queried with no
  model layer loaded at all (the whole `sqlite-drivers` lane), so an unseated
  `Base` there is not a load-order bug but a legitimate configuration. A read
  is added to this exception only when that lane is shown to reach it. A seat that
  has moved onto the `ActiveRecord` module (`active-record.ts`) needs no guard:
  the module is a plain import, and it holds the Rails default
  itself — which is how `queryTransformers()` in `preprocessQuery`,
  `disablePreparedStatements()` in the adapter constructor,
  `lazilyLoadSchemaCache()` in `ConnectionPool#new_connection`, and
  `asyncQueryExecutor()` in `abstract-adapter.ts` and
  `ConnectionPool#build_async_executor` left the slot.
  Every `ActiveRecord` singleton config seat (`active_record.rb:182-491`'s
  `singleton_class.attr_*` block) and its `def self.` methods live on the
  `ActiveRecord` module in `active-record.ts`, where `parity:api` records them
  against `active_record.rb` itself, and `Base` holds none of them.
- `activerecord/src/reflection-slot.ts` — the `Reflection` module, read by
  `associations/builder/association.ts` for `Builder::Association.create_reflection`
  (`associations/builder/association.rb:40-51` names `ActiveRecord::Reflection.create`
  at call time). The cycle is `builder/singular-association.ts ->
builder/association.ts -> reflection.ts -> associations.ts -> builder/has-one.ts`,
  whose `class HasOne extends SingularAssociation` reads `SingularAssociation` in
  TDZ when a builder is the entry module.
- `activerecord/src/tasks/database-tasks-slot.ts` — `DatabaseTasks`, read by
  `migration.ts` for `ActiveRecord::Tasks::DatabaseTasks`
  (`migration.rb:151-183,696,750,1037-1041,1361-1365`). `database-tasks.ts`
  imports `migration.ts` and `connection-handling.ts`, so a plain import back
  re-enters the `schema-statements.ts -> migration/command-recorder.ts ->
migration.ts` cycle `ActiveRecord.ConnectionHandling` breaks.
