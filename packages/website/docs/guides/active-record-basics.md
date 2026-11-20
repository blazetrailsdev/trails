---
title: Active Record Basics
description: The model layer of a Trails application — what Active Record is, its naming and schema conventions, defining models, and creating, reading, updating and deleting records.
---

# Active Record Basics

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [activerecord package](/packages/activerecord) ·
> [Active Record Callbacks](./active-record-callbacks.md) ·
> [Active Model Basics](./active-model-basics.md)

Active Record is the part of Trails that turns database rows into objects you
can work with. This guide walks through:

- The pattern Active Record is named after, and why an ORM helps.
- The conventions that let a model find its table and columns without setup.
- How to define a model, and how to override the conventions when you must.
- The four basic operations: create, read, update and delete.

## What is Active Record?

Active Record is the **M** in MVC. It holds the data your application cares
about and the rules that apply to it, and it knows how to load and store that
data.

### The Active Record Pattern

The name comes from a pattern in which one object stands for one row of a
table. The object carries the row's values and also the behaviour that acts on
them, including the code that writes the row back. There is no separate
"repository" object you hand your records to: a record saves itself.

### Object Relational Mapping

An object relational mapper sits between your classes and a relational
database. You call methods; it writes the SQL. That keeps the bulk of an
application free of hand-written queries and lets the same code run against
SQLite, PostgreSQL or MariaDB.

### Active Record as an ORM Framework

On top of mapping rows to objects, Active Record gives every model:

- Associations between models (`hasMany`, `belongsTo`).
- Inheritance hierarchies through single-table inheritance.
- Validations that run before anything is written.
- Callbacks around each step of a record's life.
- Query methods that build SQL lazily and run it when awaited.

## Convention over Configuration

A model needs almost no configuration, because Active Record guesses the table
and columns from the class name. If you follow the conventions, the guess is
right.

### Naming Conventions

The class name is singular and CamelCase; the table name is its plural in
snake_case. The pluralization rules are the same inflector Rails uses, from
[activesupport](/packages/activesupport).

| Model class    | Table            |
| -------------- | ---------------- |
| `Article`      | `articles`       |
| `LineItem`     | `line_items`     |
| `Person`       | `people`         |
| `ProductOwner` | `product_owners` |

Table and column names stay snake_case because they are database names. Only
the code identifiers Trails exposes are camelCase, as
[Trails Idioms](./idioms.md) explains.

### Schema Conventions

A few column names carry meaning:

- **`id`** is the primary key, an auto-incrementing integer unless a migration
  says otherwise.
- **`<model>_id`**, such as `article_id`, is a foreign key that a `belongsTo`
  association reads.
- **`created_at`** and **`updated_at`** are filled in on create and update.
- **`lock_version`** turns on optimistic locking.
- **`type`** stores the class name for single-table inheritance.

## Creating Active Record Models

A model is a class that extends `ApplicationRecord`, which itself extends
`Base`. The generator writes both, together with a migration:

```sh
pnpm trails generate model book title:string author:string
```

Attributes come from the table, so the class body does not list them. A
`declare` line only tells TypeScript the attribute's type; it creates nothing
at run time:

```ts
import { Base } from "@blazetrails/activerecord";

class ApplicationRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

class Book extends ApplicationRecord {
  declare title: string;
  declare author: string;
}

const book = new Book({ title: "Kindred", author: "Octavia Butler" });
book.title;
```

Class-level configuration goes in a `static {}` block, which runs once when the
class is defined, just as a Ruby class body does.

### Overriding the Naming Conventions

When a table predates your application, set its name and key directly:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  static {
    this.tableName = "legacy_books";
    this.primaryKey = "book_code";
  }
}
```

### Creating Namespaced Models

A model inside a namespace takes a prefix on its table. Setting
`tableNamePrefix` on the namespace's base class gives every model in it the
same prefix:

```ts
import { Base } from "@blazetrails/activerecord";

class BookRecord extends Base {
  static {
    this.abstractClass = true;
    this.tableNamePrefix = "book_";
  }
}

class Order extends BookRecord {}
```

`Order` reads from `book_orders`.

## CRUD: Reading and Writing Data

Every operation that reaches the database returns a promise, so each one below
is awaited. Why trails awaits where Rails does not is set out in
[activerecord's `CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/packages/activerecord/CLAUDE.md#relation-is-evaluated-by-an-async-query-records-and-the-predicates-it-carries).

### Create

`create` builds a record and saves it in one step. `new` builds one without
saving, so you can set more attributes first:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  declare title: string;
  declare author: string;
}

const saved = await Book.create({ title: "Parable of the Sower", author: "Octavia Butler" });

const draft = new Book();
draft.title = "Wild Seed";
draft.author = "Octavia Butler";
await draft.save();
```

The bang forms raise instead of returning `false` when a validation fails.
Ruby's `!` is not a legal identifier character, so they are spelled with a
`Bang` suffix: `createBang`, `saveBang`, `updateBang`.

### Read

Finder methods load records. `find` raises `RecordNotFound` for a missing key;
`findBy` returns `null`:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  declare title: string;
  declare author: string;
}

const all = await Book.all().toArray();
const first = await Book.first();
const one = await Book.find(42);
const kindred = await Book.findBy({ title: "Kindred" });
const byAuthor = await Book.where({ author: "Octavia Butler" }).order("title").toArray();
```

`where` and `order` return a `Relation`. Nothing runs until it is awaited or
turned into an array, so you can keep chaining.

### Update

Change attributes and save, or do both at once with `update`:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  declare title: string;
}

const book = await Book.find(42);
book.title = "Kindred: A Graphic Novel Adaptation";
await book.save();

await book.update({ title: "Kindred" });

await Book.where({ title: "Untitled" }).updateAll({ title: "Draft" });
```

`updateAll` writes one SQL `UPDATE` and skips validations and callbacks.

### Delete

`destroy` removes a record and runs its callbacks. On a relation,
`destroyAll` loads each record and destroys it; `deleteAll` sends one
`DELETE` and skips callbacks:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  declare title: string;
}

const book = await Book.find(42);
await book.destroy();

await Book.destroyBy({ title: "Draft" });
await Book.where({ title: "Untitled" }).deleteAll();
```

## Validations

Validations check a record before it is written. `save` returns `false` and
fills `errors` when one fails:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  declare title: string;

  static {
    this.validates("title", { presence: true });
  }
}

const book = new Book();
await book.save();
book.errors.fullMessages;
```

Validation runs inside the awaited `save`, and `isValid()` is awaited too,
because a uniqueness check queries the database. The full list of validators
is in the [activemodel package](/packages/activemodel) page.

## Callbacks

Callbacks run code at a fixed point in a record's life, such as just before it
is saved. They have [their own guide](./active-record-callbacks.md).

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  declare title: string;

  static {
    this.beforeSave((record) => {
      record.title = record.title.trim();
    });
  }
}
```

## Migrations

Migrations change the schema in versioned steps that every environment
replays in order. They are TypeScript classes, run with
`pnpm trails db:migrate`:

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateBooks extends Migration {
  async change(): Promise<void> {
    await this.createTable("books", (t) => {
      t.string("title");
      t.string("author");
      t.timestamps();
    });
  }
}
```

## Associations

Associations connect models through foreign keys. A book can belong to an
author, and an author can have many books:

```ts
import { Base } from "@blazetrails/activerecord";

class Author extends Base {
  static {
    this.hasMany("books");
  }
}

class Book extends Base {
  static {
    this.belongsTo("author");
  }
}
```
