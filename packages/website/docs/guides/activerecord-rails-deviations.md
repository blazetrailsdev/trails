---
title: "ActiveRecord: Deviations from Rails"
description: Async finders and persistence, transactions as async functions, AsyncLocalStorage for per-flow state, Proxy-based scope dispatch, pluggable fs/crypto adapters.
---

# ActiveRecord: Deviations from Rails

> **See also:** [Guides index](./index.md) · [Arel deviations](./arel-rails-deviations.md) · [ActiveModel deviations](./activemodel-rails-deviations.md)

ActiveRecord is where JavaScript's async single-threaded model has the
biggest impact. Almost every DB-touching method in Rails is synchronous;
in Trails, almost every DB-touching method is async. This document
catalogs the differences so readers don't have to rediscover them one
test at a time.

Everything in the [ActiveModel deviations](./activemodel-rails-deviations.md)
doc applies here too (mixins, callbacks, attribute methods, etc.). This
doc focuses on what's new or amplified in ActiveRecord.

## 1. Async everywhere DB is touched

This is the single biggest deviation. Rails:

```ruby
user = User.find(1)        # sync
user.name = "Dean"
user.save                  # sync
posts = user.posts.to_a    # sync
```

Trails:

```ts
const user = await User.find(1);
user.name = "Dean";
await user.save();
const posts = await user.posts.toArray();
```

> The examples below import `transaction` from `@blazetrails/activerecord`
> and pass the model class explicitly. Rails' `User.transaction do ... end`
> is a class method; Trails exports a module-level function instead.

Every read and every write is a `Promise`. Concretely:

- **Finders**: `find`, `findBy`, `first`, `last`, `take`, `exists`,
  `count`, `sum`, `minimum`, `maximum`, `pluck`, `ids`, `each`,
  `findEach`, `findInBatches`, `inBatches` — all async. See
  `packages/activerecord/src/relation/finder-methods.ts` and
  `packages/activerecord/src/relation.ts` (`exists`, `findEach`).
- **Relation materialization**: `toArray()` replaces Rails' `to_a`/
  implicit `each`, and is async. Relations are lazy like in Rails, but
  you have to explicitly await the terminal operation.
- **Persistence**: `save`, `saveBang`, `create`, `update`, `updateBang`,
  `destroy`, `destroyBang`, `toggleBang`, `touch`, `updateColumn`,
  `updateColumns`, `incrementBang`, `decrementBang` — all async. See
  `packages/activerecord/src/base.ts` and
  `packages/activerecord/src/persistence.ts`. The Rails bang
  convention (`save!`, `destroy!`) becomes a `Bang` suffix because `!`
  isn't a legal identifier character in JS/TS.
- **Associations**: `user.posts`, `post.author` return relations/
  promises — accessing them is async because loading them is.
- **Schema / connection calls**: every adapter method (`executeQuery`,
  `selectAll`, `insert`, `executeMutation`, `beginTransaction`,
  `commit`, `rollback`) returns `Promise`.

There is no synchronous escape hatch. Browser and Node both expose DB
access through async drivers.

### Practical consequences

- `if (user.valid?)` in Rails becomes `if (record.isValid())` in
  Trails — still synchronous — **but** if any uniqueness validator
  fired, you must `await` its pending promise before trusting
  `record.errors`. `save()` does this for you; manual `isValid()`
  callers don't get it for free. See
  `packages/activerecord/src/validations/uniqueness.ts`.
- Sequencing matters. `user.posts.toArray()` and `user.posts.count()`
  are separate round-trips unless you preload. Accidentally awaiting
  the same relation twice issues two queries.
- Iteration is async: `for await (const record of Model.all().findEach())`
  rather than `Model.find_each do |record| ... end`. `findEach` lives on
  `Relation`, not `Base`, so you start from `.all()` (or any other
  relation-returning call).

## 2. Transactions: function, not block

Rails:

```ruby
User.transaction do
  user.save!
  post.save!
end
```

Trails:

```ts
import { transaction } from "@blazetrails/activerecord";

await transaction(User, async (tx) => {
  await user.saveBang();
  await post.saveBang();
});
```

The shape is intentionally close: both pass a body that runs inside a
transaction and rolls back on any thrown error. The differences:

- The body is an **async function**, not a block.
- There's no static `User.transaction`. The module-level `transaction`
  function takes the model class as its first argument so it can find
  the right adapter. An instance-level `record.transaction(fn)` is also
  available (mirrors `ActiveRecord::Base#transaction`, see
  `packages/activerecord/src/base.ts`).
- **Transaction state rides on `AsyncLocalStorage`**, not a thread
  local. Nested `await`s see the correct surrounding transaction
  because the async context propagates automatically. See
  `packages/activerecord/src/transactions.ts` and the async-context
  adapter in `@blazetrails/activesupport`.
- Options (`isolation`, `requiresNew`, `joinable`) are passed as a
  third argument rather than as keyword args.

## 3. Async-context state instead of thread locals

Rails uses `Thread.current` / `ActiveSupport::IsolatedExecutionState`
for per-request state: current transaction, query cache, connection
handler role, `Current` attributes. Node has no threads in the Rails
sense, so Trails uses `AsyncLocalStorage` (with a browser fallback)
wrapped by `@blazetrails/activesupport`'s `getAsyncContext()`.

Current uses:

- **Current transaction** — `packages/activerecord/src/transactions.ts`.
- **Query-prohibit scopes** — `connection-handling.ts` uses an
  `AsyncContext<boolean>` to track `whileDisconnecting` and friends.
- **Current attributes** — `current-attributes.ts` in ActiveSupport.

The behavior matches Rails for any code that stays in a single
async flow. If you spawn unattached work (`setTimeout`, `queueMicrotask`
without `await`), you lose the context the same way Rails loses thread
locals when you spawn a new thread.

## 4. Connection handling: no implicit global

Rails leans on `ActiveRecord::Base.connection` as a near-global. In
Trails, each `Base` subclass holds its own `_connectionHandler`, and
pools are acquired per query rather than checked out per thread.
`establishConnection` / `connectsTo` shape mirrors Rails; the
underlying pool model is different because there are no threads to
pool over. See `packages/activerecord/src/connection-handling.ts`.

## 5. Relation `method_missing` → typed `Proxy`

Rails' `ActiveRecord::Relation` uses `method_missing` to forward
unknown calls to the model class (for named scopes and class-method
delegation). We do the same thing with a `Proxy` wrapper
(`wrapWithScopeProxy` in
`packages/activerecord/src/relation/delegation.ts`). Every relation
returned by `all()`, `where()`, `order()`, etc. is wrapped so that
`User.where({ active: true }).published()` resolves `published`
against the model's registered scopes.

This is one of very few places we reach for `Proxy`. We use it here
because the set of methods is genuinely dynamic (scopes are
user-defined) and TypeScript's structural typing lets consumers
declare the scope signatures on their Relation type.

## 6. Named scopes: stored, not metaprogrammed

`scope("published", (rel) => rel.where({ published: true }))` stores
the function in a `_scopes` Map on the class and defines a static
method that delegates through `all()`. The Relation proxy above picks
the scope up on relation instances. See
`packages/activerecord/src/scoping/named.ts`.

## 7. Enums: explicit `defineProperty`, async bang methods

Rails' `enum status: [:draft, :published]` generates `draft?`,
`published?`, `draft!`, `published!`, and scopes. Trails does the same
but:

- Generation happens in `defineEnum`
  (`packages/activerecord/src/enum.ts`) via `Object.defineProperty`,
  not `define_method`.
- The **bang methods are async** because persisting the change hits
  the DB:

  ```ts
  await post.draftBang(); // Rails: post.draft!
  ```

  `post.isDraft()` and `post.draft()` (setter without persist) stay
  synchronous.

## 8. Ranges: plain object

Ruby's `Range` (`1..10`, `1...10`, `Date.new(..)..Date.new(..)`) has
no JS equivalent, so ActiveSupport exposes a plain typed object
`{ begin, end, excludeEnd }` and helper functions. `where({ age:
makeRange(18, 65) })` lowers to the right SQL via Arel. Rails passes
real `Range` instances; we pass this struct.

See `packages/activesupport/src/range-ext.ts`.

## 9. Numeric types

JavaScript has only `number` and `bigint`. Rails distinguishes
`Integer`, `Float`, `BigDecimal`. Trails maps them as:

- `Integer` → `number` (or `bigint` where 64-bit IDs demand it).
- `Float`, `Decimal` → `number` (full `BigDecimal` arithmetic is not
  attempted — this is a known lossy area; specific columns that need
  exact decimal math will need a Decimal type later).
- `Date`, `DateTime`, `Time` → JS `Date`.

If this matters for your use case, treat the column as a string and
parse it yourself. We intentionally don't ship a half-implemented
`BigDecimal`.

## 10. Adapters (beyond the DB): `fs` and `crypto`

See [Browser support via adapters](./index.md#adapters) for the shared
`FsAdapter` / `CryptoAdapter` primer. ActiveRecord is the heaviest
consumer: signed IDs, message verifiers, schema cache persistence, and
migration file I/O all route through `getFs()` / `getCrypto()` so they
keep working in the browser.

## 11. Callbacks: async all the way down

See [Block APIs → callback functions](./index.md#block-apis) for the shared
callback story. Worth emphasizing in ActiveRecord specifically: because
callbacks here commonly need to hit the DB (`beforeSave` cascading to
related records, etc.), they are almost always async. Always `await`
them when composing manually; `save()` / `destroy()` / etc. do it for
you.

## 12. Naming, bang methods, keyword args, symbols

All cross-package — see the index for
[method casing](./index.md#method-casing), [bang methods](./index.md#bang-methods),
and [symbols/kwargs](./index.md#symbols-kwargs). Every ActiveRecord API
follows them.

## 13. Typing runtime-attached members with `declare`

Rails defines attributes/associations/scopes/enums dynamically, so a
Ruby author just writes `post.title`, `post.author`, `Post.published`
and everything works. In TypeScript, the same calls are attached at
runtime (via `this.attribute`, `this.hasMany`, `this.scope`, `this.enum`)
but the type system only sees them if you opt in with a `declare`:

```ts
import {
  Base,
  CollectionProxy,
  AssociationProxy,
  Relation,
  association,
  defineEnum,
} from "@blazetrails/activerecord";

class Author extends Base {}
class Comment extends Base {}

class Post extends Base {
  declare title: string; // attribute
  declare featured: boolean; // attribute (backs the named scope below)
  declare status: number; // enum is stored as an integer; defineEnum
  //                        does not override the accessor (unlike Base.enum)
  declare author: Author | null; // belongsTo reader (synchronous —
  //                                returns the currently loaded record
  //                                or null; use `post.loadBelongsTo("author")`
  //                                for an explicit async load — returns
  //                                the cached/preloaded value if present,
  //                                otherwise runs a query)
  declare comments: AssociationProxy<Comment>;
  // hasMany reader — chainable (`.where(...)`), awaitable
  // (`await post.comments` → `Comment[]`), and array-shaped over the
  // loaded target (`for...of`, `.length`, `.map`, `[0]`). Same object
  // as what `association(post, "comments")` returns. Collections have
  // no explicit loader — `await post.comments` IS the load.
  declare loadBelongsTo: (name: "author") => Promise<Author | null>;
  // Per-macro singular-association loaders. The virtualizer aggregates
  // all belongsTo calls into a single `declare loadBelongsTo: ...`
  // intersection and all hasOne calls into `declare loadHasOne: ...`.
  // Method-name-matches-macro means calling the wrong one for a given
  // association is a TS error (the other method doesn't include that
  // name in its overload set).
  declare isDraft: () => boolean; // enum predicate
  declare draft: () => void; // enum in-memory setter (defineEnum only)
  declare draftBang: () => Promise<void>; // async (defineEnum only): sets
  //                                         in-memory; if persisted, calls
  //                                         updateColumn — bypasses
  //                                         validations/callbacks
  declare static draft: () => Relation<Post>; // enum class scope
  declare static published: () => Relation<Post>; // enum class scope
  declare static notDraft: () => Relation<Post>; // enum `not*` scope (defineEnum only)
  declare static featured: () => Relation<Post>; // named scope (distinct from the enum above)

  static {
    this.attribute("title", "string");
    this.attribute("featured", "boolean", { default: false });
    this.attribute("status", "integer"); // defineEnum only attaches methods;
    //                                       the underlying column still needs an attribute
    this.belongsTo("author");
    this.hasMany("comments");
    // defineEnum (above, section 7) gives the full surface: plain setter,
    // async bang, and not* scope. Use `this.enum(...)` instead for the
    // simpler Base.enum surface (no plain setter, sync bang returning
    // `this`, no not* scopes).
    defineEnum(this, "status", { draft: 0, published: 1 });
    // Named scope — use a name that doesn't collide with an enum value above.
    this.scope("featured", (rel) => rel.where({ featured: true }));
  }
}
```

Without a matching `declare`:

- **Instance access** (`record.title`, `post.comments`) type-checks via
  `Model`'s `[key: string]: unknown` index signature and resolves to
  `unknown`.
- **Static access** (`Post.published`, enum class scopes like
  `Post.draft`) is a `Property 'published' does not exist on type 'typeof Post'`
  error — the class has no index signature. Always pair `this.scope(...)`,
  `this.enum(...)`, or `defineEnum(...)` with a matching `declare static`.

The compiled reference for every supported pattern lives in
`packages/activerecord/dx-tests/declare-patterns.test-d.ts`.

Don't redeclare `id` — `Base#id` is an accessor typed as
`PrimaryKeyValue`, and TS forbids overriding an accessor with a
differently-typed property. Narrow at the use site: `record.id as number`.

## Summary

| Area                     | Rails                                   | Trails                                            |
| ------------------------ | --------------------------------------- | ------------------------------------------------- |
| Finders / reads          | Sync                                    | Async (`await` required)                          |
| Persistence              | Sync                                    | Async                                             |
| Relation iteration       | `to_a`, `each` (sync)                   | `toArray()`, `for await`                          |
| Transactions             | `transaction do ... end`                | `await transaction(async (tx) => { ... })`        |
| Per-flow state           | `Thread.current`                        | `AsyncLocalStorage` via `getAsyncContext()`       |
| Connection pool          | Thread-checkout model                   | Per-handler pools, per-query acquisition          |
| Relation method dispatch | `method_missing`                        | `Proxy` wrapper (`wrapWithScopeProxy`)            |
| Scopes                   | Generated via `define_singleton_method` | `_scopes` Map + delegation                        |
| Enum bang methods        | Sync                                    | Async (`draftBang()` hits DB)                     |
| Ranges                   | `Range`                                 | Plain `{ begin, end, excludeEnd }`                |
| Numerics                 | `Integer`/`Float`/`BigDecimal`          | `number`/`bigint` only                            |
| File / crypto access     | Direct stdlib                           | Pluggable adapters for browser support            |
| Callbacks                | Ruby blocks                             | Async functions                                   |
| Uniqueness validation    | Sync DB hit                             | Async, coordinated via `_asyncValidationPromises` |

If something in Rails surprises you with its absence here, the most
common cause is: "it was synchronous in Ruby and the JavaScript
equivalent is async, so the signature changed." The second most
common is: "Ruby had a language feature (symbol, block, Range,
`method_missing`) and TypeScript doesn't, so we expressed the same
idea differently."
