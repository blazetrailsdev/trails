---
title: Active Record Query Interface
description: Reading data with Active Record in Trails — finders, batches, conditions, ordering, grouping, joins, eager loading, scopes, calculations and explain.
---

# Active Record Query Interface

> **See also:** [Guides index](./index.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [activerecord package](/packages/activerecord) · [arel package](/packages/arel)

Active Record builds SQL for you from method chains on a model. This guide
covers:

- Loading one record or many, and walking a large table in batches.
- Filtering with strings, placeholders, hashes, `not`, `or` and `and`.
- Ordering, selecting, limiting, grouping and overriding parts of a query.
- Joining tables and loading associations ahead of time.
- Scopes, dynamic finders, calculations and `explain`.

The examples use this model:

```ts
import { Base } from "@blazetrails/activerecord";

class User extends Base {
  declare firstName: string;
  declare lastName: string;
  declare ordersCount: number;
  declare locked: boolean;

  static {
    this.hasMany("orders");
  }
}
```

## What is the Active Record Query Interface?

Each query method returns a `Relation`. A relation is a description of a query:
nothing is sent to the database until you `await` it, call `toArray()`, or call
a method that needs a result, such as `first` or `count`. Every terminal step is
asynchronous, for the reason set out in
[activerecord's notes on async evaluation](https://github.com/blazetrailsdev/trails/blob/main/packages/activerecord/CLAUDE.md#relation-is-evaluated-by-an-async-query-records-and-the-predicates-it-carries).

## Retrieving Objects from the Database

### Retrieving a Single Object

`find` looks a record up by primary key and raises `RecordNotFound` when there
is no match. Given several keys it returns them all, or raises if any is
missing. `take`, `first` and `last` return one record or `null`; `first` and
`last` order by primary key unless the relation is already ordered.

```ts
const one = await User.find(10);
const many = await User.find([1, 10]);
const any = await User.take();
const oldest = await User.first();
const newest = await User.last();
```

`findBy` returns the first record matching a hash, or `null`. The bang form
raises instead:

```ts
const lifo = await User.findBy({ firstName: "Lifo" });
const sure = await User.findByBang({ firstName: "Lifo" });
```

Bang methods carry a `Bang` suffix because `!` is not legal in a JavaScript
name; see [Trails Idioms](./idioms.md).

### Retrieving Multiple Objects in Batches

Loading a large table at once holds every row in memory. `findEach` reads it in
batches of 1,000 (configurable) and hands each record to your function, or, with
no function, returns an async iterator:

```ts
await User.where({ locked: false }).findEach({ batchSize: 500 }, async (customer: any) => {
  console.log(customer.id);
});

for await (const customer of User.all().findEach({ start: 2000 })) {
  console.log(customer.id);
}
```

`findInBatches` yields each batch as an array, and `inBatches` yields each
batch as a relation. Both accept `start`, `finish`, `batchSize`, `cursor`,
`order` and `errorOnIgnore`, as `findEach` does.

## Conditions

`where` narrows a query. Its argument may be a SQL fragment, a fragment with
placeholders, or a hash.

```ts
User.where("orders_count = '2'");
User.where("orders_count = ?", 2);
User.where("orders_count = ? AND locked = ?", 2, false);
User.where("created_at >= :start", { start: new Date("2026-01-01") });
User.where("first_name LIKE ?", User.sanitizeSqlLike("Li") + "%");
```

Never interpolate user input into the string form; pass it as a placeholder
value so it is quoted.

Hash conditions test equality, ranges and lists. Keys are attribute names; a
nested hash names an associated table:

```ts
User.where({ locked: true });
User.where({ ordersCount: [1, 3, 5] });
User.where({ orders: { status: "shipped" } }).joins("orders");
```

`where.not` negates a condition, and `or` and `and` combine two relations:

```ts
User.where().not({ ordersCount: [1, 3, 5] });
User.where({ lastName: "Smith" }).or(User.where({ ordersCount: [1, 3, 5] }));
User.where({ lastName: "Smith" }).and(User.where({ locked: false }));
```

## Ordering

`order` takes a column name, a hash of column to direction, or several of
either:

```ts
User.order("created_at");
User.order({ createdAt: "desc" });
User.order({ ordersCount: "asc", createdAt: "desc" });
```

## Selecting Specific Fields

By default every column is read. `select` narrows that, and `distinct` drops
duplicate rows. A record loaded with a partial select raises
`MissingAttributeError` when you read a column it does not have.

```ts
User.select("first_name", "last_name");
User.select("last_name").distinct();
```

## Limit and Offset

```ts
User.limit(5);
User.limit(5).offset(30);
```

## Grouping

`group` adds `GROUP BY` and `having` filters the groups. A grouped `count`
returns a `Map` from group key to count:

```ts
const perStatus = await User.joins("orders").group("orders.status").count();
User.select("created_at, sum(orders_count) as total")
  .group("created_at")
  .having("sum(orders_count) > ?", 10);
```

## Overriding Conditions

Each of these rewrites part of an existing relation:

- `unscope("where")` or `unscope({ where: "locked" })` removes a clause.
- `only("order", "where")` keeps the named clauses and drops the rest.
- `reselect`, `reorder`, `rewhere` and `regroup` replace a clause outright.
- `reverseOrder` flips the ordering, falling back to the primary key.

```ts
User.where({ locked: true }).order("last_name").reorder("first_name");
User.where({ locked: true }).rewhere({ locked: false });
User.order("id").reverseOrder();
```

## Null Relation

`none` returns a relation that never queries and always answers empty, so a
method can keep returning something chainable.

```ts
const nobody = await User.none().toArray();
```

## Readonly Objects

A record loaded through `readonly()` raises `ReadOnlyRecord` when saved.

```ts
const frozen = await User.readonly().first();
```

## Locking Records for Update

Optimistic locking is on when the table has a `lock_version` column: a save of
a stale copy raises `StaleObjectError`. Pessimistic locking takes a row lock
with `lock`, inside a transaction:

```ts
await User.transaction(async () => {
  const customer = await User.lock().find(1);
  customer.ordersCount += 1;
  await customer.save();
});
```

## Joining Tables

`joins` takes a SQL fragment or association names, and produces an `INNER JOIN`.
`leftOuterJoins` keeps rows with no match. `where.associated` and
`where.missing` filter on whether an association has a row.

```ts
User.joins("INNER JOIN orders ON orders.user_id = users.id");
User.joins("orders").distinct();
User.leftOuterJoins("orders");
User.where().associated("orders");
User.where().missing("orders");
```

## Eager Loading Associations

Reading an association inside a loop runs one query per record, the N + 1
problem. Load it up front instead:

- `includes` picks a strategy for you.
- `preload` always runs one extra query per association.
- `eagerLoad` always uses a single `LEFT OUTER JOIN`.

```ts
const users = await User.includes("orders").limit(10).toArray();
User.preload("orders");
User.eagerLoad("orders");
```

`strictLoading` makes any lazily loaded association raise, so a missed
`includes` shows up in development:

```ts
const strict = await User.strictLoading().first();
```

## Scopes

A scope is a named, reusable relation. Register it in the model's static block;
it becomes a class method and is chainable on relations and associations.

```ts
import { Base } from "@blazetrails/activerecord";

class Book extends Base {
  declare outOfPrint: boolean;
  declare price: number;

  static {
    this.scope("inPrint", function (this: typeof Book) {
      return this.where({ outOfPrint: false });
    });
    this.scope("costsMoreThan", function (this: typeof Book, amount: number) {
      return this.where("price > ?", amount);
    });
  }
}
```

`defaultScope` applies a scope to every query on the model, and `unscoped`
removes it. Two scopes on the same column are combined with `AND`; `merge`
lets the later one win.

## Enums

An enum attribute adds a scope per value, a predicate and a bang setter per
value; see [Active Record Basics](./active-record-basics.md).

## Method Chaining

Because each step returns a relation, chains read left to right and run once,
at the end:

```ts
const rows = await User.select("users.id, users.last_name")
  .joins("orders")
  .where("orders.created_at > ?", new Date("2026-01-01"))
  .order("users.last_name")
  .toArray();
```

## Find or Build a New Object

`findOrCreateBy` returns the first match or creates one. `findOrCreateByBang`
raises on an invalid record, and `findOrInitializeBy` builds the record without
saving it.

```ts
const andy = await User.findOrCreateBy({ firstName: "Andy" });
const nina = await User.findOrInitializeBy({ firstName: "Nina" });
```

## Finding by SQL

`findBySql` returns records for your own SQL. `pluck` returns column values
without building records, `pick` returns the first row's values, and `ids`
returns primary keys.

```ts
const rows = await User.findBySql("SELECT * FROM users ORDER BY created_at DESC");
const names = await User.pluck("first_name");
const pair = await User.where({ id: 1 }).pick("first_name", "last_name");
const keys = await User.ids();
```

## Existence of Objects

```ts
const any = await User.isExists({ firstName: "Ryan" });
```

## Calculations

`count`, `sum`, `average`, `minimum` and `maximum` run on the model or on any
relation:

```ts
const total = await User.count();
const shipped = await User.where({ locked: false }).count();
const average = await User.average("orders_count");
const most = await User.maximum("orders_count");
const all = await User.sum("orders_count");
```

## Running EXPLAIN

`explain` runs the database's `EXPLAIN` for a relation and returns its report.
Options such as `analyze` are passed through where the adapter supports them.

```ts
const plan = await User.where({ id: 1 }).joins("orders").explain();
```

To build SQL nodes directly, for conditions the hash form cannot express, see
the [arel package](/packages/arel).
