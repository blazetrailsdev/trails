---
title: Active Record Associations
description: Connecting Trails models through foreign keys — belongsTo, hasOne, hasMany, through and join-table associations, polymorphism, single table inheritance, delegated types, and the options that tune them.
---

# Active Record Associations

> **See also:** [Guides index](./index.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [Active Record Migrations](./active-record-migrations.md) ·
> [activerecord package](/packages/activerecord)

An association declares that two models are linked by a foreign key, and
gives each record methods for reaching, building and changing the records on
the other side. This guide covers:

- The six kinds of association and when to pick each one.
- Polymorphic associations and self joins.
- Single table inheritance and delegated types.
- Caching, bi-directional associations, and the most used options.
- Scopes, counter caches, callbacks and extensions on associations.

## Associations Overview

Without associations, deleting an author and their books means two queries
written by hand, and every place that creates a book has to remember to set
`author_id`. Declaring the link once moves that bookkeeping into the model:

```ts
import { Base } from "@blazetrails/activerecord";

class Author extends Base {
  static {
    this.hasMany("books", { dependent: "destroy" });
  }
}

class Book extends Base {
  static {
    this.belongsTo("author");
  }
}
```

Now `author.books.create({ title: "..." })` fills in the foreign key, and
`author.destroy()` destroys the author's books first.

Associations are declared in the model's `static {}` block, by name. A name is
a string, and option keys are camelCase (`foreignKey`, `counterCache`). Every
call that reads the database returns a promise; see
[Trails Idioms](./idioms.md) for why, and for how a model gets typed members
for its associations.

## Types of Associations

### `belongsTo`

`belongsTo` lives on the model whose table holds the foreign key. A book
belongs to an author, so `books` has an `author_id` column:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  static {
    this.belongsTo("author");
  }
}
```

The record gains a reader and writer (`book.author`), `buildAuthor` and
`createAuthor`, `reloadAuthor` and `resetAuthor`, and `authorChanged` /
`authorPreviouslyChanged` to ask whether the target moved. A singular reader
returns the record when it is already loaded and a promise that loads it
otherwise, so `await book.author` works either way.

By default the owner is required: saving a book with no author fails
validation. Pass `optional: true` to allow it.

### `hasOne`

`hasOne` is the other side of a one-to-one link: the foreign key is on the
_other_ table. A supplier has one account, and `accounts` holds
`supplier_id`:

```ts
import { Base } from "@blazetrails/activerecord";

class Supplier extends Base {
  static {
    this.hasOne("account");
  }
}
```

It generates the same builder, creator, reload and reset methods as
`belongsTo`.

### `hasMany`

`hasMany` is one-to-many, with the foreign key on the other table. The name
is plural:

```ts
import { Base } from "@blazetrails/activerecord";

class Author extends Base {
  static {
    this.hasMany("books");
  }
}
```

`author.books` is a collection proxy. It chains like a relation, awaits to
its records, and offers `build`, `create`, `push`, `delete`, `destroy`,
`clear`, `size` and the rest of the collection methods. `author.bookIds`
reads and writes the list of primary keys.

```ts
const recent = await post.comments.where({ flagged: false }).order("created_at");
const comment = await post.comments.create({ body: "First!" });
const count = await post.comments.size();
```

### `hasMany` through

A `through:` association reaches records across a join model. A physician has
many patients through appointments:

```ts
import { Base } from "@blazetrails/activerecord";

class Physician extends Base {
  static {
    this.hasMany("appointments");
    this.hasMany("patients", { through: "appointments" });
  }
}

class Appointment extends Base {
  static {
    this.belongsTo("physician");
    this.belongsTo("patient");
  }
}
```

Adding a patient to `physician.patients` creates the appointment row. The join
model is a full model, so it can carry its own columns and validations.
`through:` also chains across nested `hasMany` associations, and `source:`
names the association on the join model when its name differs.

### `hasOne` through

`hasOne` with `through:` is the one-record version: a supplier has one account
history through its account.

```ts
import { Base } from "@blazetrails/activerecord";

class Supplier extends Base {
  static {
    this.hasOne("account");
    this.hasOne("accountHistory", { through: "account" });
  }
}
```

### `hasAndBelongsToMany`

`hasAndBelongsToMany` links two models through a bare join table with no
model of its own. Assemblies and parts share an `assemblies_parts` table,
which `createJoinTable` builds in a migration:

```ts
import { Base } from "@blazetrails/activerecord";

class Assembly extends Base {
  static {
    this.hasAndBelongsToMany("parts");
  }
}
```

Pass `joinTable` to name the table yourself.

### Choosing Between `belongsTo` and `hasOne`

The foreign key decides. The model whose table holds the column declares
`belongsTo`; the other declares `hasOne`. Ask which record could exist without
the other: an account belongs to a supplier, not the reverse.

### Choosing Between `hasMany` through and `hasAndBelongsToMany`

Prefer `through:` when the link has data of its own (an appointment's time), a
validation, or callbacks, or when you will ever query the join directly.
`hasAndBelongsToMany` suits a pure link with nothing on it.

### Polymorphic Associations

One model can belong to several others through one association. A picture
belongs to an employee or a product; the table holds `imageable_id` and
`imageable_type`:

```ts
import { Base } from "@blazetrails/activerecord";

class Picture extends Base {
  static {
    this.belongsTo("imageable", { polymorphic: true });
  }
}

class Employee extends Base {
  static {
    this.hasMany("pictures", { as: "imageable" });
  }
}
```

The type column stores the owner's class name, which Active Record resolves
back to a class when it loads the owner.

### Models with Composite Primary Keys

When the target's primary key spans several columns, `foreignKey` takes an
array. The [Composite Primary Keys](./active-record-composite-primary-keys.md)
guide covers it.

### Self Joins

A model can associate with itself. An employee has many subordinates and
belongs to a manager, both stored in `employees`:

```ts
import { Base } from "@blazetrails/activerecord";

class Employee extends Base {
  static {
    this.hasMany("subordinates", { className: "Employee", foreignKey: "manager_id" });
    this.belongsTo("manager", { className: "Employee", optional: true });
  }
}
```

## Single Table Inheritance (STI)

Several model classes can share one table, told apart by a `type` column.
Subclass a model and Active Record writes the subclass name into `type` on
save, and scopes queries on the subclass to its rows:

```ts
import { Base } from "@blazetrails/activerecord";

class Vehicle extends Base {}
class Car extends Vehicle {}
class Truck extends Vehicle {}

await Car.create({ color: "red" }); // INSERT ... type = 'Car'
await Car.all().toArray(); //         WHERE type = 'Car'
await Vehicle.all().toArray(); //     every row, each built as its own class
```

Set `inheritanceColumn` to use a different column, or to `null` to turn the
behavior off and treat `type` as an ordinary attribute. STI fits classes that
share nearly all their columns; when they diverge, the table fills with
columns that are `NULL` for most rows.

## Delegated Types

Delegated types keep the shared columns on one table and each kind's own
columns on its own table. An `Entry` holds what every entry has, and points at
a `Message` or a `Comment` for the rest:

```ts
import { Base } from "@blazetrails/activerecord";

class Entry extends Base {
  static {
    this.delegatedType("entryable", { types: ["Message", "Comment"] });
  }
}
```

`delegatedType` declares a polymorphic `belongsTo`, plus a scope and a
predicate per type (`Entry.messages()`, `entry.isMessage()`) and a typed
reader (`entry.message`). The types declare `hasOne("entry", { as:
"entryable" })` back.

## Tips, Tricks, and Warnings

### Controlling Association Caching

A loaded association is cached on the record, and later reads reuse it.
`reloadAuthor()` (or `author.books.reload()`) refetches; `resetAuthor()`
drops the cache so the next read loads again.

### Avoiding Name Collisions

An association adds methods to the record, so a name such as `attributes` or
`connection` would replace a built-in. Pick another name.

### Updating the Schema

Associations do not create columns. Add the foreign key, and an index, in a
migration (`t.references("author")`), and create a join table for
`hasAndBelongsToMany`. See [Active Record Migrations](./active-record-migrations.md).

### Controlling Association Scope

Associations look up classes by name relative to the model. When the class is
named differently, pass `className`.

### Bi-directional Associations

When both sides are declared, Active Record usually detects that `book.author`
and `author.books` are inverses, so a loaded author and its loaded books are
the same objects in memory. Detection fails when the association has a scope
or a non-default foreign key; pass `inverseOf` to state the inverse:

```ts
import { Base } from "@blazetrails/activerecord";

class Author extends Base {
  static {
    this.hasMany("books", { inverseOf: "writer" });
  }
}

class Book extends Base {
  static {
    this.belongsTo("writer", { className: "Author", foreignKey: "author_id" });
  }
}
```

## Association References

### Options

The options shared by most associations:

- `className` — the target class name, when the association name does not
  match it.
- `foreignKey` / `primaryKey` — the columns used, when they differ from the
  convention.
- `dependent` — what happens to associated records when the owner is
  destroyed: `"destroy"`, `"delete"`, `"deleteAll"`, `"nullify"`,
  `"restrictWithException"`, `"restrictWithError"` or `"destroyAsync"`.
- `inverseOf` — the association on the target that points back.
- `autosave` — save associated records whenever the owner is saved.
- `validate` — validate associated records when the owner is validated.
- `touch` (`belongsTo`) — update the owner's `updated_at` on save or destroy.
- `optional` (`belongsTo`) — allow a missing owner.
- `strictLoading` — raise instead of lazy-loading the association.

### Scopes

The second argument may be a scope function, run with the target relation as
`this`, which narrows every read:

```ts
import { Base } from "@blazetrails/activerecord";

class Author extends Base {
  static {
    this.hasMany(
      "publishedBooks",
      function () {
        return this.where({ published: true });
      },
      { className: "Book" },
    );
  }
}
```

### Counter Cache

`counterCache: true` on a `belongsTo` keeps a count column on the owner,
`books_count`, up to date as records are created and destroyed, so
`author.books.size()` reads the column instead of running `COUNT(*)`:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  static {
    this.belongsTo("author", { counterCache: true });
  }
}
```

### Callbacks

Collection associations take `beforeAdd`, `afterAdd`, `beforeRemove` and
`afterRemove`. Each is a function, or an array of them, that receives the
owner and the record being added or removed. Raising in a `before` callback
stops the change.

### Extensions

A fourth argument to `hasMany` adds methods to the collection proxy:

```ts
import { Base } from "@blazetrails/activerecord";

class Author extends Base {
  static {
    this.hasMany("books", null, {}, (mod) => {
      mod.findByTitle = function (this: { where(c: object): unknown }, title: string) {
        return this.where({ title });
      };
    });
  }
}
```

The `extend` option takes the same kind of module for reuse across
associations.
