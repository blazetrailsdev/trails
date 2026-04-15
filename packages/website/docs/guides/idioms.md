---
title: Trails Idioms
description: Translation patterns from Rails to Trails — the naming, async, and options-object conventions every Trails guide uses.
---

# Trails Idioms

> **See also:** [Guides index](./index.md) · [Rails deviations](./activerecord-rails-deviations.md)

A Rails developer opening any Trails guide should recognize the shape
of the code immediately. This page is the translation reference.

## The shape

```ruby
# Ruby / Rails
class Post < ActiveRecord::Base
  attribute :title, :string
  attribute :published, :boolean, default: false

  validates :title, presence: true, length: { minimum: 3 }

  before_save :normalize_title

  scope :published, -> { where(published: true) }

  def normalize_title
    self.title = title.strip
  end
end

post = Post.create!(title: "Hello")
post.update!(published: true)
published = Post.published.order(:title).to_a
```

```ts
// TypeScript / Trails
import { Base, Relation } from "@blazetrails/activerecord";

class Post extends Base {
  declare title: string;
  declare published: boolean;
  declare static published: () => Relation<Post>;

  static {
    Post.attribute("title", "string");
    Post.attribute("published", "boolean", { default: false });

    Post.validates("title", { presence: true, length: { minimum: 3 } });

    Post.beforeSave((record) => {
      record.title = record.title.trim();
    });

    Post.scope("published", (rel) => rel.where({ published: true }));
  }
}

const post = await Post.createBang({ title: "Hello" });
await post.updateBang({ published: true });
const published = await Post.published().order("title").toArray();
```

Everything below this point is that example broken into its
component conventions, in case something looks unfamiliar.

## Method names are camelCase

Every Trails method is the camelCase form of its Rails counterpart.
No exceptions.

| Rails                  | Trails                |
| ---------------------- | --------------------- |
| `before_save`          | `beforeSave`          |
| `has_many`             | `hasMany`             |
| `primary_key`          | `primaryKey`          |
| `find_each`            | `findEach`            |
| `find_or_create_by`    | `findOrCreateBy`      |
| `previous_changes`     | `previousChanges`     |
| `establish_connection` | `establishConnection` |
| `default_scope`        | `defaultScope`        |

## `!` becomes `Bang`

Ruby uses `!` on a method name to mean "throw on failure instead of
returning false." `!` isn't a legal identifier character in JS, so
Trails uses a `Bang` suffix.

| Rails        | Trails          |
| ------------ | --------------- |
| `save!`      | `saveBang`      |
| `update!`    | `updateBang`    |
| `destroy!`   | `destroyBang`   |
| `create!`    | `createBang`    |
| `toggle!`    | `toggleBang`    |
| `increment!` | `incrementBang` |
| `decrement!` | `decrementBang` |
| `draft!`     | `draftBang`     |

Non-bang versions return `Promise<boolean>` and don't throw on
validation/constraint failure, matching Rails. Bang versions throw
and return `Promise<true>` / `Promise<this>`.

## `?` becomes `is`

Rails predicate methods end in `?`. JS drops that and uses an `is`
prefix.

| Rails         | Trails          |
| ------------- | --------------- |
| `valid?`      | `isValid()`     |
| `persisted?`  | `isPersisted()` |
| `new_record?` | `isNewRecord()` |
| `destroyed?`  | `isDestroyed()` |
| `changed?`    | `isChanged()`   |
| `published?`  | `isPublished()` |

## DB calls are always `await`ed

Every read, write, validation-with-I/O, and transaction returns a
`Promise`. There is no synchronous escape hatch — `save`, `find`,
`create`, `update`, `destroy`, `toArray`, `count`, `exists`, and every
enumeration method (`each`, `findEach`, `findInBatches`) are async.

```ts
// ✗ wrong — `save()` returns Promise<boolean>; this branches on a
//   truthy Promise object, not the result.
if (post.save()) {
  console.log("saved");
}

// ✓ right
if (await post.save()) {
  console.log("saved");
}
```

`isValid()` stays synchronous for signature parity with Rails, but
DB-backed validators (like `uniqueness`) push their promises onto
`record._asyncValidationPromises` — `save()` awaits them for you;
bare `isValid()` callers don't get that for free. See
[Rails deviations: async propagation](./index.md#async-propagation).

## Keyword args become one options object

Ruby keyword arguments become a single options object, always the
last argument.

```ruby
# Rails
Post.where(published: true, archived: false).order(:title)

validates :title, presence: true, length: { minimum: 3 }
```

```ts
// Trails
Post.where({ published: true, archived: false }).order("title");

Post.validates("title", { presence: true, length: { minimum: 3 } });
```

## Symbols become strings

Ruby `:symbol` has no JS equivalent. All options and attribute names
use string literals.

```ruby
# Rails
enum status: { draft: 0, published: 1 }
Post.where(status: :draft)
```

```ts
// Trails
Post.enum("status", { draft: 0, published: 1 });
Post.where({ status: "draft" });
```

## Blocks become async functions

Ruby blocks become (possibly-async) callback functions. Most block
APIs in Rails — `transaction`, `each`, callbacks, `find_each` — map
to functions in Trails.

```ruby
# Rails
Post.transaction do
  post.save!
  comment.save!
end
```

```ts
// Trails — note: module-level function, not a static method
import { transaction } from "@blazetrails/activerecord";

await transaction(Post, async (_tx) => {
  await post.saveBang();
  await comment.saveBang();
});
```

See [Rails deviations: block APIs → callback functions](./index.md#block-apis)
for callback signatures.

## Class bodies use `static {}`

Rails puts class-level configuration in the class body directly.
Trails puts the equivalent in a `static {}` initializer block.

```ts
import { Model } from "@blazetrails/activemodel";

class Post extends Model {
  declare title: string;

  static {
    Post.attribute("title", "string");
    Post.validates("title", { presence: true });
    Post.beforeSave((record: Post) => {
      record.title = record.title.trim();
    });
  }
}
```

The block runs once when the class is first loaded, same as Ruby's
class body.

## Attribute access

Rails exposes attributes as methods; Trails exposes them as
properties. Same dot-shape for reads and writes. The difference
surfaces when you need runtime-typed access for generic code.

| Rails                  | Trails                                |
| ---------------------- | ------------------------------------- |
| `post.title`           | `post.title`                          |
| `post[:title]`         | `post.readAttribute("title")`         |
| `post[:title] = "new"` | `post.writeAttribute("title", "new")` |

## Ranges are plain objects

Ruby `Range` (`1..10`, `1...10`) has no JS equivalent. Use
`makeRange` from `@blazetrails/activesupport`.

```ts
import { makeRange } from "@blazetrails/activesupport";

// Rails:  Post.where(views: 100..1000)
Post.where({ views: makeRange(100, 1000) });

// Rails:  Post.where(views: 100...1000)   # exclusive end
Post.where({ views: makeRange(100, 1000, true) });
```

## Per-async-flow state instead of thread locals

Rails uses thread locals for current transaction, connection role,
`Current.user`. Trails uses `AsyncLocalStorage`, scoped per async
flow.

```ts
import { transaction } from "@blazetrails/activerecord";

declare function somethingThatAlsoHitsTheDb(): Promise<void>;

await transaction(Post, async (_tx) => {
  await post.saveBang(); // inside the transaction

  // A nested await still sees the outer transaction, no threading
  // needed — AsyncLocalStorage propagates across awaits.
  await somethingThatAlsoHitsTheDb();
});
```

Caveat: if you spawn unattached work (`setTimeout`, unawaited
promises), you lose the context — same way Rails loses thread locals
when you spawn a new thread.
