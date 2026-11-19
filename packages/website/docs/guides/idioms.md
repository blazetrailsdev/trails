---
title: Trails Idioms
description: Translation patterns from Rails to Trails — the naming, async, and options-object conventions every Trails guide uses.
---

# Trails Idioms

> **See also:** [Guides index](./index.md) · [Packages and their ratified deviations](/packages/)

A Rails developer opening any Trails guide should recognize the shape
of the code immediately. This page is the translation reference.

## The shape

```ruby
# Ruby / Rails
class Post < ActiveRecord::Base
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
    Post.validates("title", { presence: true, length: { minimum: 3 } });

    Post.beforeSave((record) => {
      record.title = record.title.trim();
    });

    Post.scope("published", function () {
      return this.where({ published: true });
    });
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

`isValid()` returns a `Promise` and the validation chain is awaited, so
DB-backed validators (like `uniqueness`) run inline: `await record.isValid()`
and `save()` both see the same result — there is no separate promise queue
to drain. There is no synchronous escape hatch: every I/O call in
JavaScript is async, so the `await` reaches finders, persistence,
validations, callbacks and transactions alike.

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
// Trails
await Post.transaction(async () => {
  await post.saveBang();
  await comment.saveBang();
});
```

A callback receives the record as its argument, where a Ruby block
reads it as `self`. An `around` callback receives a `proceed` function
to run the inner chain, where Ruby yields.

## Modules become `include()` and `extend()`

Ruby's `include SomeModule` and `extend SomeModule` are the
`include()` and `extend()` functions from `@blazetrails/ruby-compat`,
with `Included<>` / `Extended<>` to type the result. An
`included do ... end` block is a hook keyed by the exported `included`
symbol, run after the module's methods are copied, where Ruby runs the
block. A single method with no module is a `this`-typed function
assigned to the class. `ActiveSupport::Concern` is ported as itself.

## Class bodies use `static {}`

Rails puts class-level configuration in the class body directly.
Trails puts the equivalent in a `static {}` initializer block.
Columns are not declared there: as in Rails, a model reflects its
attributes from the table's schema, and `declare` only types them.

```ts
import { Base } from "@blazetrails/activerecord";

class Post extends Base {
  declare title: string;

  static {
    Post.validates("title", { presence: true });
    Post.beforeSave((record) => {
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

Arel's `users[:id]` is `users.get("id")`, an explicit method where Ruby
defines `[]`.

## Ranges are a class

Ruby `Range` (`1..10`, `1...10`) has no JS equivalent. Use the `Range`
class from `@blazetrails/ruby-compat`.

```ts
import { Range } from "@blazetrails/ruby-compat";

// Rails:  Post.where(views: 100..1000)
Post.where({ views: new Range(100, 1000) });

// Rails:  Post.where(views: 100...1000)   # exclusive end
Post.where({ views: new Range(100, 1000, true) });
```

## Thread locals stay per thread

Rails keeps the current transaction, connection role and
`Current.user` in thread locals through
`ActiveSupport::IsolatedExecutionState`. Trails ports that class, keyed
on ruby-compat's `Thread`. One `Thread` can hold many in-flight
promises, so a block that pushes onto a thread-local stack and pops it
afterwards runs on its own copy (`IsolatedExecutionState.fork`), and a
sibling promise never sees its push.

Every promise is awaited or owned by a `Thread`; work started and
left running would lose both its ordering and its errors.
