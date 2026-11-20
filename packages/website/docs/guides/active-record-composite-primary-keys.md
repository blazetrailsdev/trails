---
title: Composite Primary Keys
description: Tables whose primary key spans several columns in Trails — creating them in a migration, declaring them on a model, finding and querying by them, and associations, forms and fixtures over them.
---

# Composite Primary Keys

> **See also:** [Guides index](./index.md) ·
> [Active Record Migrations](./active-record-migrations.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [activerecord package](/packages/activerecord)

Most tables are identified by one surrogate `id` column. Some are better
identified by a combination: an order line by its order and line number, a
record in a sharded database by its tenant and its id. A composite primary key
makes that combination the table's identity. This guide covers:

- Creating a table with a composite primary key.
- Declaring one on a model and reading the identifier back.
- Finding and querying by the full key.
- Associations whose foreign key spans several columns.
- Forms and fixtures for composite-keyed records.

Use a composite key when the data really is identified that way. Every
association, URL and query has to carry all of its columns, which adds work
compared to a single `id`.

## What are Composite Primary Keys?

A composite primary key is a primary key made of two or more columns. The
database enforces that no two rows share the same combination of values, while
any one column on its own may repeat. Two shops can both have an order `1`;
they cannot both have order `[1, 1]`.

## Schema Migrations

Pass an array of column names as `primaryKey` to `createTable`. The default
`id` column is not added, so every column of the key must be declared in the
block:

```ts
import { Migration } from "@blazetrails/activerecord";

export class CreateProducts extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("products", { primaryKey: ["store_id", "sku"] }, (t) => {
      t.integer("store_id");
      t.string("sku");
      t.text("description");
    });
  }
}
```

The migration statements themselves are covered in the
[Active Record Migrations](./active-record-migrations.md) guide.

## Querying Models

### Using `find`

Once the table exists, Active Record reads the composite key from the schema.
`primaryKey` on the model answers the array of columns, and `id` on a record
answers the array of values, in the same order:

```ts
import { Base } from "@blazetrails/activerecord";

class Product extends Base {
  declare store_id: number;
  declare sku: string;
}

const product = (await Product.find([3, "XYZ12345"])) as Product;
product.id; // => [3, "XYZ12345"]
```

`find` takes the key values as an array. Passing several arrays finds several
records, and an array of arrays does the same:

```ts
import { Base } from "@blazetrails/activerecord";

class Product extends Base {}

const products = await Product.find([1, "ABC98765"], [7, "ZZZ11111"]);
```

### Using `where`

`where` accepts the key's columns as a tuple, mapped to the list of value
tuples to match. In TypeScript the tuple is a `Map` key, since a plain object
cannot be keyed by an array:

```ts
import { Base } from "@blazetrails/activerecord";

class Product extends Base {}

const matches = Product.where(
  new Map([
    [
      ["store_id", "sku"],
      [
        [1, "ABC98765"],
        [7, "ZZZ11111"],
      ],
    ],
  ]),
);
```

#### Conditions with `id`

On a composite-keyed model, `where({ id: … })` means the `id` column, not the
whole primary key. Query by the full key with the tuple form above, or with
`find`.

## Associations between Models with Composite Primary Keys

Associations pick up a composite primary key on the other side, but the
foreign key on this side usually has to be named, because Active Record cannot
guess which columns pair with which. Give `foreignKey` the columns in the same
order as the target's primary key:

```ts
import { Base } from "@blazetrails/activerecord";

class Order extends Base {
  static {
    this.primaryKey = ["shop_id", "id"];
    this.hasMany("books", { foreignKey: ["shop_id", "order_id"] });
  }
}

class Book extends Base {
  static {
    this.belongsTo("order", { foreignKey: ["shop_id", "order_id"] });
  }
}
```

Loading the association builds one condition per column pair, so
`book.order` reads the order whose `shop_id` and `id` match the book's
`shop_id` and `order_id`. When the target's key is not its declared primary
key, pass `primaryKey` alongside `foreignKey` with the matching columns.

## Forms for Composite Primary Key Models

A form for a composite-keyed record is built the same way as any other.
Its URL needs every key value, so the record's `toParam` joins them with the
model's `paramDelimiter`, `"_"` by default (`"3_XYZ12345"`), and a route like
`/products/:id` still receives one segment. In the controller,
`params.extractValue("id")` splits the segment back into the array of values
for `find`:

```ts
import { Base } from "@blazetrails/activerecord";
import { Parameters } from "@blazetrails/actionpack";

class Product extends Base {}
declare const params: Parameters;

const product = await Product.find(params.extractValue("id"));
```

## Composite Key Validations

Uniqueness validations scoped over a composite key work as they do for any
column list: pass the other key columns as `scope`. Note that a validation
cannot guarantee uniqueness under concurrent writes; the primary key
constraint in the database does that.

## Composite Key Fixtures

A fixture row for a composite-keyed table lists each key column as an
ordinary attribute. Fixtures that reference such a row by label generate every
column of the foreign key from the label, so associations between fixture
files work without writing ids by hand. Fixture files may be YAML or `.ts`
modules, as
[packages/activerecord/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/activerecord/CLAUDE.md#fixtures-load-from-ts-modules-as-well-as-yaml-fixturesetfile)
describes.
