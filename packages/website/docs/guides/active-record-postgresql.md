---
title: Active Record and PostgreSQL
description: Using PostgreSQL-specific features from Active Record in Trails — array, hstore, JSON, range, enum, UUID, network and other column types, index options, full text search and views.
---

# Active Record and PostgreSQL

> **See also:** [Guides index](./index.md) ·
> [Active Record Migrations](./active-record-migrations.md) ·
> [Active Record Query Interface](./active-record-querying.md) ·
> [activerecord package](/packages/activerecord) · [pg package](/packages/pg)

PostgreSQL has column types and schema features that other databases lack.
Active Record's PostgreSQL adapter knows about them, so a model reads and
writes them as ordinary JavaScript values. This guide covers:

- The PostgreSQL column types the adapter maps, and how to declare them.
- Index options, deferrable and exclusion constraints.
- Full text search and database views.

The adapter talks to the server through the `pg` driver, an optional peer you
install alongside `@blazetrails/activerecord`. Set `adapter: "postgresql"` in
`config/database.ts` to use it.

## Datatypes

Each type below is declared in a migration with a method named after it on the
table definition, and is cast to and from a JavaScript value on read and write.

### Bytea

Binary data. A `bytea` attribute reads as a `Uint8Array`.

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateDocuments extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("documents", (t) => {
      t.binary("payload");
    });
  }
}
```

### Array

Any column can be an array of its type with `array: true`. The attribute reads
as a JavaScript array.

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateBooks extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("books", (t) => {
      t.string("title");
      t.string("tags", { array: true });
      t.integer("ratings", { array: true });
    });
    await this.addIndex("books", "tags", { using: "gin" });
  }
}
```

Query an array column with PostgreSQL's array operators:

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {}

const tagged = await Book.where("'fantasy' = ANY (tags)").toArray();
const both = await Book.where("tags @> ARRAY[?]::varchar[]", ["fantasy", "fiction"]).toArray();
```

### Hstore

A flat map of string keys to string values. Enable the extension first; the
attribute reads as a plain object.

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateProfiles extends Migration.Current {
  async change(): Promise<void> {
    await this.enableExtension("hstore");
    await this.createTable("profiles", (t) => {
      t.column("settings", "hstore");
    });
  }
}
```

### JSON and JSONB

`json` stores the document text as given; `jsonb` stores a parsed binary form
that can be indexed. Both read as parsed JavaScript values.

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateEvents extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("events", (t) => {
      t.column("payload", "jsonb");
    });
  }
}
```

```ts
import { Base } from "@blazetrails/activerecord";

class Event extends Base {}

const events = await Event.where("payload->>'kind' = ?", "user_renamed").toArray();
```

### Range Types

`daterange`, `numrange`, `tsrange`, `tstzrange`, `int4range` and `int8range`
columns read as a range value with a beginning, an end, and whether the end is
excluded. Query them with the range operators, such as `@>` for "contains".

### Composite Types

A composite type has no dedicated mapping. Create it with SQL in a migration,
and the column reads as its text form, which you can parse yourself.

### Enumerated Types

A PostgreSQL enum is a named type with a fixed set of labels. Create it, then
use it as a column type. Pair it with the model's `enum` to get scopes and
predicates for each value.

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateArticles extends Migration.Current {
  async change(): Promise<void> {
    await this.createEnum("article_status", ["draft", "published", "archived"]);
    await this.createTable("articles", (t) => {
      t.column("status", "article_status", { default: "draft", null: false });
    });
  }
}
```

```ts
import { Base } from "@blazetrails/activerecord";

class Article extends Base {
  static {
    this.enum("status", { draft: "draft", published: "published", archived: "archived" });
  }
}
```

### UUID

`uuid` columns hold 128-bit identifiers. A table can use one as its primary
key; the server generates the value with `gen_random_uuid()`.

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateRevisions extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("revisions", { id: "uuid" }, (t) => {
      t.string("identifier");
    });
  }
}
```

A foreign key to a UUID table needs `type: "uuid"` on the reference, so the
column type matches the key it points at.

### Bit String Types

`bit` and `bit varying` columns read as strings of `0` and `1`.

### Network Address Types

`inet` and `cidr` hold IPv4 or IPv6 addresses and networks; `macaddr` holds a
hardware address. Each reads as a string in PostgreSQL's canonical form.

### Geometric Types

`point` reads as an `ActiveRecord.Point` with `x` and `y`. The other geometric
types (`line`, `lseg`, `box`, `path`, `polygon`, `circle`) read as their text
form.

### Interval

An `interval` column reads as an ActiveSupport `Duration`, the same object
`days(3)` builds, so it can be added to a time.

## UUID Primary Keys

Pass `--primary-key-type uuid` to the model or migration generator and the
generated `createTable` uses `{ id: "uuid" }`, with `type: "uuid"` on its
references.

## Generated Columns

A stored generated column is computed by the server from other columns:

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateUsers extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("users", (t) => {
      t.string("name");
      t.virtual("nameUpcased", { type: "string", as: "upper(name)", stored: true });
    });
  }
}
```

## Deferrable Foreign Keys

A foreign key can be checked at the end of the transaction rather than at each
statement, which lets two rows that refer to each other be inserted in either
order:

```ts
import { Migration } from "@blazetrails/activerecord";

export class AddAuthorFk extends Migration.Current {
  async change(): Promise<void> {
    await this.addForeignKey("books", "authors", { deferrable: "deferred" });
  }
}
```

## Unique Constraint

`addUniqueConstraint` adds a constraint, not an index, so it can be deferred.

## Exclusion Constraints

An exclusion constraint forbids two rows whose values overlap under an
operator, for example two bookings for one room over intersecting times. Add it
with `addExclusionConstraint` and a constraint expression.

## Full Text Search

Build a `tsvector` from the searched columns, index it with GIN, and match it
with `@@`:

```ts
import { Migration } from "@blazetrails/activerecord";

export class AddSearchIndex extends Migration.Current {
  async change(): Promise<void> {
    await this.addIndex("documents", "to_tsvector('english', title || ' ' || body)", {
      using: "gin",
      name: "documents_idx",
    });
  }
}
```

```ts
import { Base } from "@blazetrails/activerecord";

class Document extends Base {}

const hits = await Document.where(
  "to_tsvector('english', title || ' ' || body) @@ to_tsquery(?)",
  "cat & dog",
).toArray();
```

## Database Views

A view is read through a model like a table. Create it with SQL, and point the
model at it with `tableName`. Writes go through only where PostgreSQL can
update the view.

```ts
import { Base, Migration } from "@blazetrails/activerecord";

export class CreateArticlesView extends Migration.Current {
  async up(): Promise<void> {
    await this.execute(`
      CREATE VIEW published_articles AS
        SELECT * FROM articles WHERE status = 'published'
    `);
  }

  async down(): Promise<void> {
    await this.execute("DROP VIEW published_articles");
  }
}

class PublishedArticle extends Base {
  static {
    this.tableName = "published_articles";
  }
}
```

## Structure Dumps

The TypeScript schema dump cannot express every PostgreSQL object (functions,
triggers, some constraints). Set the schema format to SQL to dump
`db/structure.sql` with `pg_dump` instead.
