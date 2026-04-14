---
title: Guides
description: Conceptual guides for Trails — how the TypeScript port relates to Rails, where it deviates, and why.
---

# Guides

Conceptual guides for Trails. The API reference tells you _what_ exists;
these guides tell you _why_ it looks the way it does.

If you're coming from Rails and want the quick translation reference,
start with [**Trails Idioms**](./idioms.md) — the one-page summary of
the naming, async, and options-object conventions every guide uses.

## Rails deviations

Trails mirrors the Rails API as closely as TypeScript allows, but some
things can't (or shouldn't) cross the language gap unchanged. JavaScript
is async and single-threaded. Ruby modules have no direct equivalent.
Ruby symbols, keyword args, and blocks don't exist in TS. We also want
to run in the browser, which Rails does not.

The rest of this page covers the deviations that show up in every
package. The per-package guides cover the ones specific to each:

- [**Arel**](./arel-rails-deviations.md) — the least-deviating package.
  SQL AST building is purely synchronous; deviations are limited to
  naming, symbol branding, and added TypeScript generics.
- [**ActiveModel**](./activemodel-rails-deviations.md) — generated
  attribute methods instead of `method_missing`, async-capable
  callbacks, encapsulated dirty tracking.
- [**ActiveRecord**](./activerecord-rails-deviations.md) — the biggest
  diff. Async propagation through finders, persistence, transactions,
  and enums; `AsyncLocalStorage` instead of thread locals; `Proxy`-based
  scope dispatch; pluggable `fs` and `crypto` adapters.

## Cross-cutting deviations

These apply to every package and are referenced from each per-package
guide. Anchored headings so those links resolve.

### Async propagation {#async-propagation}

Every I/O call in Rails (DB, file system, crypto, HTTP) is synchronous.
Every equivalent in JavaScript is async. That one fact propagates into
finders, persistence, validations, callbacks, transactions, uniqueness
checks, connection management, and even enum bang methods. `isValid()`
stays synchronous for signature parity with Rails, but DB-backed
validators (`uniqueness`) collect `Promise`s on
`record._asyncValidationPromises` for the caller to await.

There is no synchronous escape hatch. Browsers and Node both expose DB
access through async drivers.

### Method casing: snake_case → camelCase {#method-casing}

Every Trails method is the camelCase form of its Rails counterpart:

| Rails                  | Trails                |
| ---------------------- | --------------------- |
| `before_save`          | `beforeSave`          |
| `has_many`             | `hasMany`             |
| `primary_key`          | `primaryKey`          |
| `find_each`            | `findEach`            |
| `previous_changes`     | `previousChanges`     |
| `establish_connection` | `establishConnection` |
| `default_scope`        | `defaultScope`        |

This is systematic across every package and not called out per-method
in the per-package guides.

### Bang methods: `!` → `Bang` suffix {#bang-methods}

Ruby uses `!` on a method name to signal "throws instead of returning
false on failure." `!` isn't a legal identifier character in
JavaScript, so Trails uses a `Bang` suffix:

| Rails        | Trails          |
| ------------ | --------------- |
| `save!`      | `saveBang`      |
| `update!`    | `updateBang`    |
| `destroy!`   | `destroyBang`   |
| `toggle!`    | `toggleBang`    |
| `increment!` | `incrementBang` |
| `decrement!` | `decrementBang` |
| `draft!`     | `draftBang`     |

The non-bang version (`save`, `destroy`) returns `Promise<boolean>` and
doesn't throw on validation/constraint failure, matching Rails. The
bang version throws and returns `Promise<true>` / `Promise<this>`.

Predicate methods (Rails' `name?`, `published?`) drop the `?` and
typically use an `is` prefix: `isPublished()`, `isDraft()`,
`isPersisted()`, `isNewRecord()`.

### Module mixins: `include` / `extend` / `Included` / `Extended` {#module-mixins}

Ruby modules (`include SomeConcern`, `extend OtherConcern`, with
`included do ... end` / `extended do ... end` hooks) are the
most-used metaprogramming feature in Rails. TypeScript has no
equivalent, so `@blazetrails/activesupport` ships a set of helpers that
get as close as the language allows.

- **`include(Klass, mod)`** copies instance methods from `mod` onto
  `Klass.prototype`. Skips methods already on the prototype. If the
  module exports a function keyed by the `included` `Symbol`, it runs
  that hook with the class as its argument. See
  `packages/activesupport/src/include.ts`.
- **`extend(Klass, mod)`** is the class-method equivalent. Copies onto
  the class itself and runs the `extended` `Symbol` hook.
- **`Included<Mod>` / `Extended<Mod>`** are type helpers that translate
  a module's `this`-typed functions into the method signatures the
  class will have after mixing. They give consumers the typing they'd
  otherwise lose.

Differences vs Ruby:

- Hooks use `Symbol.for("@blazetrails/activesupport:included")` rather
  than a magic method name. Symbol-based hooks play nicer with
  TypeScript tooling than stringly-typed method lookup.
- Mixing happens once at class-declaration time in TS, rather than
  at `include` time inside the class body as in Ruby. Net effect is
  the same.

For single methods rather than whole modules, the pattern is
`this`-typed functions assigned directly to a class. See
[`CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md)
for the spelling; examples live across `attribute-methods.ts`,
`validations.ts`, `callbacks.ts`, and many more. ActiveSupport also
has `concern.ts` (a port of `ActiveSupport::Concern`) for cases where
we really want the Rails shape; `Included<>` usually does the job.

### Symbols, keyword args, options objects {#symbols-kwargs}

Ruby has `:symbol` literals, keyword arguments, and implicit blocks.
JavaScript has none of those. Systematically:

| Rails                                  | Trails                                       |
| -------------------------------------- | -------------------------------------------- |
| `validates :name, presence: true`      | `validates("name", { presence: true })`      |
| `where(name: "dean", active: true)`    | `where({ name: "dean", active: true })`      |
| `has_many :posts, dependent: :destroy` | `hasMany("posts", { dependent: "destroy" })` |
| `:draft`, `:published`                 | `"draft"`, `"published"`                     |

Ruby symbols become strings. Keyword args become a single options
object. This is systematic and not called out per-API.

### Block APIs → callback functions {#block-apis}

Rails leans heavily on blocks (`Post.transaction do ... end`,
`posts.each { |p| ... }`, `before_save { |record| ... }`). JS has no
blocks, so these become callback functions — and because almost every
such callback ends up touching I/O, they're typed to accept both sync
and async functions:

```ts
type CallbackFn = (record: AnyRecord) => void | boolean | Promise<void | boolean>;
type AroundCallbackFn = (
  record: AnyRecord,
  proceed: () => void | Promise<void>,
) => void | Promise<void>;
```

The record is passed in explicitly (Ruby callbacks get it via `self`).
`around` callbacks receive a `proceed` thunk to invoke the inner chain,
rather than a block with Ruby's `yield`. Returning `false` from a
`before` callback halts the chain, matching Rails. See
`packages/activemodel/src/callbacks.ts`.

### Browser support via adapters {#adapters}

Rails reaches for `File`, `FileUtils`, `OpenSSL`, `SecureRandom`
directly. That is fine on servers and impossible in browsers.
`@blazetrails/activesupport` ships two adapters consumed by the rest
of the stack:

- **`FsAdapter`** (`fs-adapter.ts`) — `readFileSync`, `writeFileSync`,
  `existsSync`, `mkdirSync`, etc. Auto-registers `node:fs` + `node:path`
  at runtime when available; a browser host registers an in-memory or
  OPFS-backed implementation. Callers use `getFs()`.
- **`CryptoAdapter`** (`crypto-adapter.ts`) — `randomBytes`,
  `randomUUID`, `createHash`, `createHmac`, `createCipheriv`,
  `pbkdf2Sync`, `timingSafeEqual`. Auto-registers a Node-crypto wrapper;
  browsers register a `window.crypto`-based adapter. Callers use
  `getCrypto()`.

Signed IDs, message verifiers, schema cache persistence, and migration
file I/O all route through these. More adapters are likely as browser
surface area grows.

## Where to go next

- [**API reference**](/api/@blazetrails/arel/README) — generated from the
  source, one page per module per package.
- [**GitHub**](https://github.com/blazetrailsdev/trails) — source, issues,
  contribution notes.
