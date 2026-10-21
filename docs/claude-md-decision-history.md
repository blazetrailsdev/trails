# CLAUDE.md decision history

The ratified sections of [CLAUDE.md](../CLAUDE.md) and the package files under
`packages/<pkg>/CLAUDE.md` state each decision and its consequences for a
porter. This file keeps what was cut from them in the 2026-10 prune: the
alternatives that were tried, the measurements, and the PRs that settled each
one. Nothing here changes a rule; it explains how the rule was reached. Headings
match the CLAUDE.md section they belong to.

## Override arity (Ruby does not check it; TypeScript does)

The TS2416 error in full:

```text
TS2416: Property 'fetchTypeMetadata' in type 'SchemaStatements' is not
assignable to the same property in base type 'SchemaStatements'.
  Target signature provides too few arguments. Expected 4 or more, but got 1.
```

Every route around it was tried and each one loses more fidelity than it buys:

- **An overload set** compiles, because TypeScript checks the override against
  the WHOLE list, but the only arrangement that type-checks makes
  `PostgreSQLAdapter` publish a 1-argument signature its body never answers.
- **Optional parameters** on the override (`sqlType?: string`) satisfy the
  arity check by declaring parameters Rails declares as required, and force
  `undefined` narrowing into a body that is otherwise line-for-line.
- **Defaults** on the override are worse still: they invent values Rails has no
  counterpart for.
- **Breaking the inheritance edge** (porting the override as a `this`-typed
  module function, or as a class property) does not help: the check follows any
  inheritance path, `override` keyword or not.

## Call-time constant resolution (Ruby autoload → the zero-import slot)

Deferring the subclass edges instead (a slot per `extends` site) looks smaller
and does not work: nothing then loads the subclass modules at all, so their
self-registration never runs. A `globalThis` seat for top-level constants was
rejected because a `declare global` in a published `.d.ts` puts `Trails` and
`ActionDispatch` in every consumer's global scope. The slots that have since
converged onto namespace seats broke these cycles: `base.ts` importing every
`self == Base` reader; `class SingularAssociation` / `CollectionAssociation
extends Association` reaching `reflection.ts`; `class AssociationRelation
extends Relation`; `V8_0 = Current`; the `schema-statements.ts -> join-table.ts
-> model-schema.ts -> connection-handling.ts -> … -> abstract-adapter.ts` chain;
and `query-cache.ts -> connection-pool.ts -> abstract-adapter.ts`. The
`queryTransformers()`, `disablePreparedStatements()`, `lazilyLoadSchemaCache()`
and `asyncQueryExecutor()` seats left their slot for the `ActiveRecord` module
in `active-record.ts`, which holds the Rails default itself.

## Method visibility is compile-time only

A side table in ruby-compat (`rbModPrivate` / `rbModProtected` recording
`(klass.prototype, mid) → visibility`, read by `basicObjRespondTo` and
`rbFPublicSend`) shipped in #8113 and was removed:

- **Cost on a hot path.** `rbFPublicSend` walked the whole prototype chain a
  second time, with a `WeakMap` lookup per level, before dispatching. Measured
  on the built `ruby-compat` (8-level chain, 2M iterations, best of 5): `rbFSend`
  626 ns/op, `rbFPublicSend` 1,063 ns/op, about 70% over `send`.
  `ActiveModel::AttributeAssignment#_assign_attribute`
  (`attribute_assignment.rb:67-76`) is a `public_send` per mass-assigned
  attribute, so every `new Post({...})` / `update` paid it.
- **Almost nothing used it.** The only production registration was five names on
  `ActionDispatch::Request`.
- **It could not deliver the behaviour.** `topic.title` is a plain property read
  with no caller context, so it cannot raise while `send(:title)` succeeds.
- **Completing it is worse.** Full fidelity means registering every Rails-private
  method at module load and keeping a second source of truth in sync with the TS
  `private` keyword.

## Records are not Proxies (`method_missing`)

#7222 removed `[key: string]: unknown` from `ActiveModel::Model`, which is what
makes `topic.mumbo` a compile-time error. The Proxy cost, measured best-of-5
over 200k iterations on #7208, on every ActiveModel instance:

| trap | operation              | slowdown |
| ---- | ---------------------- | -------- |
| get  | attribute read         | 3.7×     |
| get  | internal `_field` read | 64×      |
| set  | attribute write        | 1.5×     |
| set  | construction           | 1.7×     |

Identity must be the object callers hold, or `errors.base`, `association.owner`,
WeakMap-keyed state and `has_secure_password`'s ivars land on a second object,
so the Proxy would have to be returned from the constructor standing in for
`self`. Tests mirroring the Rails `NoMethodError` arms port the assertions that
do not depend on the hook (e.g. the first four of
`#undefine_attribute_methods undefines alias attribute methods`).

## Ruby Strings are JS string primitives

The carrier that was considered: a ruby-compat class holding the character
data, with `<<` / `concat` / `replace` / `dup` / `freeze` and `toString` /
`valueOf` / `Symbol.toPrimitive`, returned by `Type::String#cast_value` in
place of the primitive. It was rejected:

- **Blast radius.** Every `:string` / `:text` attribute read in activemodel and
  activerecord comes out of that cast, so every one of them would change type.
  A carrier is an object: `a.title === b.title` compares identity and is false
  for equal content, `typeof` is `"object"`, a `Map` / `Set` / object key no
  longer finds the entry stored under the primitive, and every bind, quote and
  serialize arm that turns on `typeof x === "string"` (197 sites in
  `activemodel/src` and `activerecord/src`, tests excluded) falls through to
  its non-string branch. The same holds for every line of user code that reads
  an attribute, where trails cannot sweep.
- **It still would not be a String.** `title.length`, `title.startsWith(…)`,
  `title[0]` and every other `String.prototype` member would have to be
  re-declared on the carrier or reached through an unwrap at each call site.
- **Cost on the read path.** Measured on Node 24, best of 5 over 2M iterations,
  primitive against a minimal carrier, cast included: `JSON.stringify` 120 →
  235 ns/op (2.0×) and template interpolation 7 → 30 ns/op (4.1×), each paying
  a `toJSON` / `Symbol.toPrimitive` call per value. The cast itself measures
  1.1× only because the benchmark's carrier never escapes; one stored on an
  `Attribute` does, so every string read also allocates.
- **What it would buy** is eight ActiveModel tests.

## Serialization's dual sync/async hash

The rejected alternative, `serializableHash` / `asJson` returning `Promise`
unconditionally the way RFC 0063 made `isValid()` return `Promise<boolean>`,
propagates like this: `asJson` is the recursive dispatcher at
`activesupport/src/core-ext/object/json.ts:256`, standing in for Ruby's
`as_json` method lookup, with ~19 `asJson` definitions feeding it.
`Array.asJson` recurses per element back through that dispatcher (`:125-137`)
and `Enumerable.asJson` delegates to `Array.asJson` (`:85-89`), so any
collection containing a model goes async. `JSONGemEncoder#jsonify`
(`activesupport/src/json/encoding.ts:40`, Rails'
`activesupport/lib/active_support/json/encoding.rb`) recurses through `asJson`
for every nested node, so the encoder goes async; `Encoding#encode`
(`encoding.ts:19`) and its call sites follow, and `to_json` returns a Promise
where Rails' returns a String
(`activesupport/lib/active_support/core_ext/object/json.rb:35-43`). It does not
even buy the simplification: `jsonify` would still need a synchronous path for
the `JSON.stringify` case, so the same sync/async split survives, relocated out
of one contained Proxy and duplicated across every `asJson` definition.

On the `JSON.stringify` path, trails' `toJSON`
(`activesupport/src/core-ext/object/json.ts:47-60`, the port of
`ActiveSupport::ToJsonWithActiveSupportEncoder#to_json`) returns
`this.asJson()` from inside the synchronous call with only the property key, so
there is no `include:` to load and nothing to await. It is a fixable coupling,
not a wall.

## `Relation` is evaluated by an async query

`Relation#toSql` is read from sync paths that have nothing to do with
construction: the relation `==` (`other.toSql() === this.toSql()`) and the
query-cache key (`computeCacheKey`). Rails' `to_sql`'s two arms are the
`eager_loading?` arm through `apply_join_dependency` and the other through
`model.with_connection { |conn| conn.unprepared_statement { conn.to_sql(arel) } }`.

## Schema reflection peeks at a warm cache

The alternatives each lose more than they buy:

- **Making every reader async** propagates through `columns_hash`,
  `attribute_types`, `type_for_attribute`, Arel type-casting and
  `Relation#to_sql`, which are synchronous Rails-facing API, the same cascade
  the serialization section rejects for `as_json`.
- **Blocking on the query** is not available: JS has no synchronous await.
- **Answering a cold column read with an empty column set** makes a cold model
  silently attribute-less where Rails would have reflected it.

The `permanent_connection_checkout = :disallowed` flag was armed by #7781.
Rails' `active_record.define_attribute_methods` initializer is taken only under
the guard at `railtie.rb:169`
(`!check_schema_cache_dump_version && app.config.eager_load && !Rails.env.local?`);
trails' boot-time warm ignores the `eager_load` / `check_schema_cache_dump_version`
arms because in trails first touch IS a cold `new` in every env.

## The adapter lock defaults to a monitor, not `NullLock`

The alternatives were tried:

- **Porting `self.lock_thread = nil` verbatim** reds all three tests named in
  `abstract-adapter-null-lock-breaks-concurrent-async-statements`.
- **An adapter-local statement queue** (SQLite's former statement lock, since
  retired onto `withRawConnection`) does not cover it: it wrapped only
  `performQuery`, not `withRawConnection`'s `connectBang` (three concurrent
  opens) nor the post-`rawExecute` `_lastInsertRowid` read, and it existed on
  one adapter only.
- **Leasing per promise** has no Ruby counterpart and no JS hook to key on.

## `inherited` is deferred to own-property memo guards

The alternatives lose:

- **A lazy reset at the child's first schema read** would clobber memos written
  to the child before that read (`applyColumnsHash`, attribute declarations),
  which Rails' definition-time reset runs ahead of by construction.
- **A decorator or explicit registration step** on every model (`@model class
Post`, `Post.register()`) would fire at the right moment, but it is invented
  surface imposed at a Rails-facing API on every trails user.

## A create path awaits its block before saving

The alternatives lose:

- **Passing the block straight through**, as Rails does, is the race the section
  describes: the block's query can land after the INSERT, and its writes after
  the record is persisted.
- **Awaiting inside the build** would make `new` / `build` async, and a JS
  constructor cannot await.

## Thor commands register through an explicit `methodAdded`

The alternatives lose:

- **Scanning the prototype** at first `commands` read cannot interleave with
  `desc`: every method exists before any `static {}` runs, so the pending
  `@usage` / `@desc` would attach to the wrong method, and `Thor::Group`'s
  definition order (`group.rb:263-266`) and `invoke_from_option`'s
  declaration-point command would be lost.
- **`desc(name, usage, description)`**, naming the command, changes a
  Rails-facing arity, and `desc for:` already means "amend an existing command".
- **A decorator per command** (`@desc("zoo", "zoo around") zoo() {}`) replaces
  Thor's DSL with one no Rails generator body is written in.
- **Treating an unregistered public method as an implicit non-command** leaves
  nothing to tell a forgotten command from a helper.
- **A registration step per class** (`MyScript.register()`) for `inherited` is
  invented surface on every Thor class.

## Thor dispatch is async

The alternatives lose:

- **Keeping the synchronous `fs` path** breaks the website's generators, which
  run over an in-memory fs reachable only through the async adapter.
- **A synchronous stdin read** blocks the event loop under a running `run`, and
  no browser adapter can serve one.
- **A synchronous `invoke_all` that drops the promises** runs a generator's
  steps interleaved, and loses each step's exception.

## `ActiveRecord::Promise` is the native promise

A complete port was written, reviewed twice, and dropped on the maintainer's
decision (trails#8342, 2026-10-01). The reasons:

- **`value` cannot be ported.** It blocks until the query completes, and JS has
  no synchronous await. What is left of the class is `then`, `pending?` and
  `inspect` over a value only an `await` can reach.
- **JS unwraps it.** `FutureResult#then` (`future-result.ts`) is a native
  thenable, so a JS promise resolving to a `FutureResult` unwraps it. And an
  `async function` unwraps any thenable it returns, so `pluck`, `pick` and
  `calculate` cannot hand back a promise object of their own.
- **There is nothing to tell apart.** In Rails `pluck` answers an Array and
  `async_pluck` a Promise. In trails both are awaited, so
  `@async ? Promise::Complete.new(result) : result` has one arm.

The `Promise::Complete` sites in Rails: `calculate`'s `none` arms
(`relation/calculations.rb:224,227`), `pluck` (`:294,303`), `pick` (`:355`) and
`ids` (`:382`) on a loaded relation, `StatementCache#execute`'s
`Promise.wrap([])` (`statement_cache.rb:155`), and `FutureResult#then`
(`future_result.rb:22,82`).

## An action's name is its method's name

trails#8573 briefly made `action_name` the Rails (underscored) spelling and
mapped it to the method; the repo owner reversed it. The reasoning: an
application names its own methods and should not have to name them in a
spelling they do not have, and two spellings for one action with a conversion
between them somewhere was the alternative.

## A record is built with `new Klass` only

A static `new` beside the constructor was tried on trails#8659 and rejected by
the repo owner. Both variants were built on that PR: one where the bare `new`
skipped the abstract check and the STI dispatch, and one where the constructor
re-entered the static method through a marker and ran twice.

## Trilogy is out of scope

Decided by the repo owner on trails#8579 (2026-10-06); the
`activerecord-port-trilogy-adapter` story is closed, not blocked.

## An adapter file is loaded by an awaited step

Ratified by the repo owner on 2026-10-08. Three alternatives were measured
first. An async `resolve` makes `adapter_class` a promise under its synchronous
readers (`quoted_table_name`, `quoted_primary_key`, `disallow_raw_sql!`).
Importing every built-in adapter eagerly fails for an application that installs
one driver, since `postgresql-adapter.ts` imports `pg` and `mysql2-adapter.ts`
imports `mysql2/promise`. Moving each driver import into the adapter's
`connect` would make the built-ins importable but leaves a third-party adapter
registered by path unloadable, and drops `resolve`'s two `LoadError` arms.

## Ruby idioms that do not translate literally: Hash calls on a plain object

RFC 0129 put the hash helpers (`hasKey`, `hashDelete`, `mergeBang`, `eachPair`,
`hashAref`, `hashAset`) on every option-hash site on purpose. `key?` and
`has_key?` had sat in `NO_JS_CALL_FORM`, because `in` was "a shape the gate
cannot tell from a dropped guard", and a helper call gave the call gate a
callee to see. RFC 0190 § "What the helpers are" (tasks repo,
`rfcs/0190-native-js-hash-forms/README.md`) measured that on 2026-10-10 at
trails `ddd629745a`: lines calling each helper name in `packages/*/src/**/*.ts`
with `hash.ts` excluded, which came to about 336 helper call sites in source
once member calls on ported classes were taken out.

The repo owner ruled on 2026-10-10: "I don't want things to use hash or
hashwithindifferentaccess unless specific features are necessary." RFC 0190
then taught the TS extractor to mark each native form (`@in`, `@delete`,
`@assign`, `@spread`, `@entries`) with its receiver's name, and the comparator
to credit the Ruby call only where the body carries the form on the receiver
Rails names. That receiver match is what an exemption could not give: a dropped
`options.key?(:public)` still flags.

Putting the names in `NO_JS_CALL_FORM` was rejected for that reason. A native
form for `fetch` was rejected because `h.k ?? d` replaces a stored `nil`.
`in` for every key was rejected because it walks the prototype chain, which is
why a computed key is `Object.hasOwn`. By the same count, 76 of the 94
`hashDelete` call lines use the removed value and 18 are a bare statement, so
the helper stays there, and the RFC reports that residual instead of promising
zero helper calls.

## A translation lookup is synchronous; the load is an awaited step

Ratified by the repo owner on 2026-10-21, after `i18n-backend-cache`
(RFC 0193) was filed to port `I18n::Backend::Cache` and twice failed to find a
shape.

The blocker is that `I18n.translate` is synchronous in Ruby while every
`ActiveSupport::Cache` store's `read` / `write` is async
(`packages/activesupport/src/cache/store.ts:250`, `:352`), so `Cache#_fetch`
(`vendor/i18n/v1.14.8/lib/i18n/backend/cache.rb:93-99`) has no port that keeps
both halves.

**Prewarm and peek was ruled out on 2026-10-20.** The design seated an
in-process copy of the store's `i18n/<namespace>/` entries behind an awaited
warm, answered `_fetch`'s `read` from the copy, and started the store `write`
without awaiting it. Two differences from Rails were accepted in the story and
rejected by the owner: an entry another process wrote after the warm is not
seen, and a failed store write cannot reach the `translate` caller. It is also
the invented lazy machinery the owner has pushed back on elsewhere.

**An async `translate` was measured and rejected on 2026-10-21.** The call was
resolved mechanically — every `I18n.translate` / `t` / `localize` / `l` site in
`packages/*/src/**/*.ts` outside i18n and outside tests, with each site's
enclosing member — and came to 31 sites in 26 members across actionpack,
actionview, activemodel, activerecord and activesupport. Every one of those
members is synchronous, two of them (`activemodel/validations.ts:339`,
`activerecord/validations.ts:29`) are constructors, which cannot await at all,
and two more (`Error#message`, `#full_message`) are getters. So the change
would not make i18n async; it would make ActiveModel's error messages and
ActiveSupport's string helpers async, where Rails returns a String. CLAUDE.md
§ "Serialization's dual sync/async hash" had already refused that trade in the
same direction for `as_json`.

**A dual-shape return was rejected as impossible, not merely costly.**
`thenableHash` works because a Hash can be a Proxy; a Proxy cannot be a string
primitive, so a thenable translation breaks `` `Name ${error.message}` `` and
`error.message.length`.

What made the sync answer cheap is that trails had already put the asynchrony
at the load: `setLoadPath`, `reloadBang` and `eagerLoadBang` are async
(`packages/i18n/src/i18n.ts:127`, `:139`, `:144`), converged there by
`i18n-async-reload-chain` and `i18n-backend-async-read-path` under RFC 0074,
against Ruby's lazy `init_translations unless initialized?` inside
`Backend::Simple#lookup`
(`vendor/i18n/v1.14.8/lib/i18n/backend/simple.rb:93-94`). i18n reports 100% on
methods, files, inheritance, arity and params and 307/307 tests on that split.

Settled by trails#9180, which also records why the parked
`translate caching backend` test keeps an empty body: the Rails body names
`I18n::Backend::Cache`, so a kept body would not type-check.
