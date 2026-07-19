---
title: "ActiveModel: Deviations from Rails"
description: Module mixins via include/extend and Included/Extended, generated attribute methods, async-capable callbacks, encapsulated dirty tracking.
---

# ActiveModel: Deviations from Rails

> **See also:** [Guides index](./index.md) · [Arel deviations](./arel-rails-deviations.md) · [ActiveRecord deviations](./activerecord-rails-deviations.md)

ActiveModel sits between Arel (pure, synchronous) and ActiveRecord (async,
I/O-heavy). Most of its surface is synchronous in both Rails and Trails, but
it's also where the Ruby → TypeScript idiom gap shows up most in the shape
of the API: mixins, callbacks, dirty tracking, attribute method generation,
and serialization.

## Module mixins

ActiveModel is the heaviest user of the `include` / `extend` /
`Included` / `Extended` mixin helpers. The full primer lives in the
guides index: [Module mixins](./index.md#module-mixins). In ActiveModel
specifically, the machinery is applied to wire up
`AttributeMethods`, `Callbacks`, `Validations`, `Dirty`,
`Serialization`, and friends onto `Model` / `Base`.

## Attribute methods: generated, not `method_missing`

Rails' `ActiveModel::AttributeMethods` registers method _patterns_
(`_changed?`, `_was`, `reset_`, etc.) and routes calls through
`method_missing`. We can't do that in TypeScript without blinding the type
checker, so Trails generates the methods at class-definition time and
tracks them in a `_generatedMethods` Set.

- `AttributeMethodPattern` (`packages/activemodel/src/attribute-methods.ts`)
  holds the same prefix/suffix/proxy-target concept as Rails.
- `match()` still exists for the cases where we need to split a method name
  back into its attribute.
- The `[key: string]: unknown` index signature on `Model`
  (`packages/activemodel/src/model.ts:62`) means plain attribute access
  (`user.name`) doesn't need a proxy — it's just a property. The price
  is that TypeScript can't type it without a per-model declaration;
  consumers usually declare their fields explicitly.

Net effect: no `method_missing`, no `Proxy`, no runtime lookup on every
access. Slightly less dynamic than Rails, significantly friendlier to the
type checker.

## Dirty tracking: encapsulated in `DirtyTracker`

Rails scatters `@changed_attributes`, `@previously_changed`, etc. across
instance variables. Trails puts them on a `DirtyTracker` instance held at
`record._dirtyTracker` (`packages/activemodel/src/dirty.ts`). Accessors
like `record.changed`, `record.changes`, `record.previousChanges`
delegate. The public API is the same; the internals are one indirection
away.

## Callbacks: async-capable

Rails callbacks are Ruby blocks; ours are (possibly-async) functions.
The shared rationale and signatures live at
[Block APIs → callback functions](./index.md#block-apis). One ActiveModel-
specific point: `before_save :do_thing` (Rails-style symbol reference
to a method) is accepted as a method-name string or a direct function
— either works. This is the module where `runCallbacks` lives
(`packages/activemodel/src/callbacks.ts`), and because it awaits
each handler, calling it is itself async.

## Validations: async chain

`validates` / `validate` are declared the same as Rails:

```ts
import { Model } from "@blazetrails/activemodel";

class Post extends Model {
  static {
    Post.validates("title", { presence: true, length: { minimum: 3 } });
  }
}
```

The deviation is at the call site, not the declaration: Rails' `valid?`
is synchronous, while trails' `isValid()` / `validate()` return a
`Promise` and the whole validation callback chain is awaited (RFC 0063).
This lets a validator that needs I/O run inline like any other. The
canonical case is `uniqueness` — it has to hit the DB — which lives in
ActiveRecord, not ActiveModel, but ActiveModel is where the machinery
that supports it lives. Because the chain awaits, `isValid()` runs
DB-backed validators before returning and `save()` sees the same result;
there is no separate async-validator queue for callers to drain.

See `packages/activerecord/src/validations/uniqueness.ts` for the
pattern; ActiveModel contributes the validator registration and error
accumulation.

## `withOptions`: one of the few Proxies

ActiveModel uses `Proxy` exactly once, in `Model.withOptions(defaults,
fn)`. Inside `fn`, calls to `validates` are rewritten to merge in the
defaults. This is pure sugar — a one-proxy convenience for a Rails-style
DSL block. See `packages/activemodel/src/model.ts`. Everything else in
ActiveModel is proxy-free.

## Serialization

`serializableHash()` produces the same shape as Rails'
`serializable_hash`. The one deviation: it understands attribute stores
with lazy `fetchValue()`, not just plain `Map`/object. Rails always
materializes attributes eagerly; we don't, because TypeScript makes lazy
stores easy and some of our adapters want them.

See `packages/activemodel/src/serialization.ts`.

## Small, systematic differences

The cross-package conventions — [method casing](./index.md#method-casing),
[symbols/kwargs](./index.md#symbols-kwargs), and [bang methods](./index.md#bang-methods)
— all apply. ActiveModel-specific wrinkles:

- **`try :foo` → `?.`.** TypeScript's optional chaining replaces Ruby's
  safe-navigation helper.
- **Range.** Ruby's `Range` becomes a plain `{ begin, end, excludeEnd }`
  object from `@blazetrails/activesupport`. Relevant to validators like
  `numericality: { within: makeRange(0, 100) }`.

## Summary

| Area              | Rails                              | Trails                                                                                                                 |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Attribute methods | `method_missing` + `define_method` | Generated methods in `_generatedMethods`; index signature for reads                                                    |
| Dirty tracking    | Scattered ivars                    | `DirtyTracker` instance at `_dirtyTracker`                                                                             |
| Callbacks         | Blocks (`before_save do ... end`)  | Async-capable functions; `runCallbacks` is async                                                                       |
| Validations       | Synchronous                        | Async: `valid?`/`validate` return a `Promise`; the callback chain awaits DB-backed validators (e.g. uniqueness) inline |
| DSL sugar         | Block receivers                    | One `Proxy` in `Model.withOptions`                                                                                     |
| Serialization     | Eager map over ivars               | Same API, supports lazy attribute stores                                                                               |

Cross-package deviations (mixins, method casing, bang methods, symbols/
kwargs) live in the [guides index](./).

The rule of thumb: if a thing is synchronous and pure, ActiveModel looks
essentially like Rails. The deviations cluster wherever Ruby used a
language feature (blocks, symbols, `method_missing`) that TypeScript
doesn't have, or where the downstream consumer (ActiveRecord) needs
async support.
