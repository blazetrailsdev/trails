---
title: Active Record Migrations
description: Evolving a database schema in Trails — writing migrations, the schema statements they call, reversible changes, running and rolling back, and schema dumps.
---

# Active Record Migrations

> **See also:** [Guides index](./index.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [activerecord package](/packages/activerecord)

A migration is a small, versioned class that changes the database schema one
step at a time. Each file records a single change, so the schema can be built
from nothing, moved forward, or stepped back, on any machine. This guide
covers:

- What a migration file looks like and how it is named.
- The schema statements available inside one: tables, columns, indexes,
  references and foreign keys.
- Writing changes that can be undone, with `change`, `reversible` and
  `up` / `down`.
- Running, rolling back and redoing migrations.
- The schema file and why it is committed.

## Migration Overview

Every migration extends `Migration.Current` and overrides one or more of its
async methods. The class below creates a `products` table with two columns and
the usual timestamps:

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateProducts extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("products", (t) => {
      t.string("name");
      t.text("description");
      t.timestamps();
    });
  }
}
```

Running it adds the table. Rolling it back drops the table again, because
`createTable` knows its own inverse. Every schema statement returns a promise,
so each call is awaited in order.

## Generating Migration Files

A migration lives in `db/migrate/`, in a file whose name starts with a UTC
timestamp and continues with the class name underscored, for example
`db/migrate/20261120101500_create_products.ts`. The timestamp is the
migration's version: it decides the order migrations run in and is what the
`schema_migrations` table records once a migration has run.

The generator writes the file and the timestamp for you:

```sh
trails generate migration AddPartNumberToProducts part_number:string
```

A name of the form `AddXxxToYyy` or `RemoveXxxFromYyy` followed by column
definitions produces the matching `addColumn` / `removeColumn` calls. A name
beginning `Create` produces a `createTable`, and `trails generate model`
writes a create-table migration alongside the model. Generated files extend
`Migration.get(<version>)`, pinning the migration to the Active Record version
it was written against; `Migration.Current` is the latest.

## Writing Migrations

### Creating a Table

`createTable` takes the table name, an optional options object and a block
that receives the table definition. A primary key column named `id` is added
unless you pass `id: false`:

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateParts extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("parts", { comment: "Catalogue parts" }, (t) => {
      t.string("part_number", { null: false, limit: 40 });
      t.decimal("price", { precision: 8, scale: 2 });
      t.references("supplier", { foreignKey: true });
      t.timestamps();
    });
  }
}
```

Column and table names are database identifiers, so they keep their
snake_case spelling; option keys are camelCase (`foreignKey`, not
`foreign_key`), following the [casing rule](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#fidelity-is-the-job).

### Creating a Join Table

`createJoinTable` builds the table a `hasAndBelongsToMany` association reads,
named from the two tables in lexical order:

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateJoinTableProductsCategories extends Migration.Current {
  async change(): Promise<void> {
    await this.createJoinTable("products", "categories");
  }
}
```

### Changing Tables and Columns

`addColumn`, `removeColumn`, `renameColumn` and `changeColumn` alter one
column at a time. `changeColumnDefault` and `changeColumnNull` change a single
property and remain reversible when you give both the old and new values:

```ts
import { Migration } from "@blazetrails/activerecord";

export class TidyProducts extends Migration.Current {
  async change(): Promise<void> {
    await this.addColumn("products", "part_number", "string");
    await this.addIndex("products", "part_number", { unique: true });
    await this.renameColumn("products", "description", "summary");
    await this.changeColumnDefault("products", "summary", { from: null, to: "" });
    await this.changeColumnNull("products", "name", false);
  }
}
```

### References and Foreign Keys

`addReference` adds a `<name>_id` column and its index. With
`foreignKey: true` it also adds the constraint. `addForeignKey` adds a
constraint between existing columns:

```ts
import { Migration } from "@blazetrails/activerecord";

export class AddAuthorToArticles extends Migration.Current {
  async change(): Promise<void> {
    await this.addReference("articles", "author", { foreignKey: true });
    await this.addForeignKey("comments", "articles");
  }
}
```

### Composite Primary Keys

Pass an array as `primaryKey` and `id: false` is implied; see the
[Composite Primary Keys](./active-record-composite-primary-keys.md) guide for
the model side.

### Executing SQL

When no schema statement fits, `execute` runs SQL as written. Plain SQL is not
reversible on its own, so pair it with `reversible` or `up` / `down`.

## Reversible Changes

### Using the `change` Method

Inside `change`, Active Record records each call and plays the inverses back
in reverse order on rollback. That works for statements whose inverse can be
derived from their arguments: `createTable`, `addColumn`, `addIndex`,
`addReference`, `renameColumn` and the like. `removeColumn` is reversible only
when it is given the column's type.

### Using `reversible`

`reversible` hands its block a direction helper. Code passed to `up` runs when
migrating forward and code passed to `down` runs on rollback:

```ts
import { Migration } from "@blazetrails/activerecord";

export class AddPriceCheck extends Migration.Current {
  async change(): Promise<void> {
    await this.reversible(async (dir) => {
      dir.up(async () => {
        await this.execute("ALTER TABLE products ADD CONSTRAINT price_check CHECK (price > 0)");
      });
      dir.down(async () => {
        await this.execute("ALTER TABLE products DROP CONSTRAINT price_check");
      });
    });
  }
}
```

### Using the `up` / `down` Methods

A migration may instead define `up` and `down` explicitly. `down` should undo
`up` in the opposite order. A change that cannot be undone throws
`IrreversibleMigration` from `down`, which stops the rollback with an error
rather than leaving the schema half-reverted:

```ts
import { IrreversibleMigration, Migration } from "@blazetrails/activerecord";

export class DropLegacyNotes extends Migration.Current {
  async up(): Promise<void> {
    await this.dropTable("legacy_notes");
  }

  async down(): Promise<void> {
    throw new IrreversibleMigration();
  }
}
```

### Reverting Previous Migrations

`revert` runs a block, or a whole earlier migration class, backwards. It lets
a new migration undo an old one without repeating it in reverse by hand.

## Running Migrations

| Command                            | What it does                                                   |
| ---------------------------------- | -------------------------------------------------------------- |
| `trails db:migrate`                | Runs every pending migration's `change` or `up`, oldest first. |
| `trails db:rollback`               | Reverts the latest migration. `STEP=3` reverts three.          |
| `trails db:migrate:redo`           | Rolls back and migrates again.                                 |
| `trails db:migrate VERSION=…`      | Migrates up or down until the given version is the latest run. |
| `trails db:migrate:up VERSION=…`   | Runs one migration's `up`.                                     |
| `trails db:migrate:down VERSION=…` | Runs one migration's `down`.                                   |
| `trails db:setup` / `db:prepare`   | Creates the database and loads the schema (and seeds).         |
| `trails db:reset`                  | Drops the database and sets it up again from the schema file.  |

Set `TRAILS_ENV` to run against another environment, for example
`TRAILS_ENV=test trails db:migrate`.

On adapters that support transactional DDL (PostgreSQL and SQLite), each
migration runs inside a transaction, so a failure leaves the schema as it was.

### Changing the Output of Running Migrations

`say` prints a line under the migration's heading, and `suppressMessages`
silences the statements run inside its block:

```ts
import { Migration } from "@blazetrails/activerecord";

export class BackfillSlugs extends Migration.Current {
  async up(): Promise<void> {
    this.say("Backfilling product slugs");
    await this.suppressMessages(async () => {
      await this.addColumn("products", "slug", "string");
    });
  }
}
```

## Schema Dumping

After migrating, the current schema is written to `db/schema.ts`. It is the
authoritative description of the database: `db:setup` and `db:reset` load it
directly instead of replaying every migration, which is faster and does not
depend on old migrations still running cleanly. Commit it alongside the
migrations that produced it.

The dump is a TypeScript module rather than Ruby; its statements read like the
migrations above. Where a dumped call carries trailing options they are
wrapped in braces, as
[packages/activerecord/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/activerecord/CLAUDE.md#a-dumped-statement-wraps-its-trailing-options-in-braces-schemadumpers-partsjoin-)
records. Database features the dumper cannot express belong in the
`structure.sql` format instead.

## Old Migrations

Migration files are loaded with `Kernel#load` semantics, each re-evaluated
when it runs
([packages/activerecord/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/activerecord/CLAUDE.md#a-migration-file-is-loaded-by-kernelload-migrationproxyload_migration)).
Once a schema file captures their effect, old migrations can be deleted; a
fresh database is built from the schema, not from history.

## Data Migrations

A migration can change rows as well as structure, but keep data changes small
and avoid using your application's model classes there, since a model may
change shape after the migration is written. Larger backfills are better run
as a separate task.
