# record-spike

The spike for the tasks repo's `ruby-compat-free-record` RFC: one hand-written
model layer on SQLite, with the names and signatures of
`@blazetrails/activerecord`, measured against that package and against the
bare driver. It is a measurement, not a package. Nothing here is published,
and nothing under `packages/` imports it.

Its own modules import no `@blazetrails/*` package, so ruby-compat and
activesupport are both off its import graph. Its test imports
`@blazetrails/activerecord` to compare against.

## What it does

- **Columns come from the database.** `loadSchema` reads `PRAGMA table_info`.
  A model names its table and nothing else.
- **Members are defined at run time, once per class.** One accessor pair per
  column goes on the model's prototype when the schema loads.
- **A record is a row.** A loaded record holds the array the driver returned,
  indexed by column position, with no copy. A value is cast on first read and
  the cast is kept in the same slot. The record takes a copy of the row on its
  first write, and that copy is what dirty tracking compares against.
- **Assignment goes through a table.** `new Post({ title })`, `update` and
  `assignAttributes` look the name up in a per-model map of writers built at
  schema load. Nothing is dispatched by a computed method name.
- **A relation is SQL fragments.** `where`, `order` and `limit` each return a
  new relation holding strings and binds. Compiling is a join. The connection
  keeps one prepared statement per SQL text.
- **`belongsTo` is declared, not inferred.** `className` and `foreignKey` are
  required. The reader answers `Author | null | Promise<Author | null>`, as
  ActiveRecord's does: a loaded association or a null foreign key costs no
  promise.

## Layout

The files are named for the Rails files that hold the same behaviour. Each
exports plain functions that take the record or the class. `base.ts` is the
only class with model methods, and each of its methods is one line that calls
the function.

| File                     | Holds                                                  |
| ------------------------ | ------------------------------------------------------ |
| `base.ts`                | The `Base` class: every public member, written out     |
| `model-schema.ts`        | Reflection from the live database; the model registry  |
| `attribute-methods.ts`   | Accessor definition, read, write, assignment, changes  |
| `persistence.ts`         | `instantiate`, insert, update, delete                  |
| `relation.ts`            | The immutable relation and its SQL                     |
| `associations.ts`        | `belongsTo` reader and writer; preload for `includes`  |
| `connection-handling.ts` | The handle on `better-sqlite3` and its statement cache |
| `type.ts`                | Cast and serialize for integer, text and datetime      |

## Running it

```sh
pnpm vitest run scripts/bench/record-spike
node --expose-gc --import tsx scripts/bench/activerecord-load-records.mts
NODE_OPTIONS="--import tsx" pnpm tsx scripts/boot-graph/measure.mts \
  --entry scripts/bench/record-spike/index.ts --runs 5
```

The bench and the boot graph need a built tree (`pnpm build`).

## Measurements

Node v26.13.0, Linux x64, 12,000 rows of 24 columns on in-memory SQLite,
median of 5 runs after one discarded run. Microseconds per row. Writes run
inside one transaction on every side.

| Measure                       | driver | spike | activerecord | spike / driver | activerecord / driver |
| ----------------------------- | -----: | ----: | -----------: | -------------: | --------------------: |
| load                          |   2.90 |  2.44 |        16.03 |            0.8 |                   5.5 |
| load, then read every column  |   3.95 | 12.21 |        83.12 |            3.1 |                  21.0 |
| find by id                    |   5.20 |  4.49 |       231.85 |            0.9 |                  44.6 |
| belongsTo, unloaded           |   4.92 |  5.39 |       348.07 |            1.1 |                  70.8 |
| load with belongsTo preloaded |   3.57 |  2.91 |        17.39 |            0.8 |                   4.9 |
| insert                        |   3.88 |  8.87 |       607.67 |            2.3 |                 156.6 |
| update one column             |   2.31 |  5.57 |       345.93 |            2.4 |                 149.9 |
| heap bytes retained per row   |    738 |   853 |        1,302 |            1.2 |                   1.8 |

The driver column returns plain row objects and casts nothing, so its
datetime columns stay strings. The host is shared: between runs the absolute
figures moved by up to 60%, and the spike-to-driver ratios stayed between 0.8
and 1.5 for every read but "load, then read every column". Read the ratios to
one significant figure.

Boot, from `scripts/boot-graph/measure.mts`:

| Entry                       | Modules | ruby-compat modules | Median import |
| --------------------------- | ------: | ------------------: | ------------: |
| `record-spike/index.ts`     |      26 |                   0 |         38 ms |
| `@blazetrails/activerecord` |     897 |                 205 |      1,026 ms |

The spike's 26 are 9 of its own, 15 of `better-sqlite3` and 2 of the `tsx`
loader, and its 38 ms includes transpiling its TypeScript on import.
ActiveRecord's figure does not include a driver, which it loads when it
connects.

The cost that stands out in the spike's column is datetime. On this Node,
`Temporal.Instant.from` costs about 0.8 µs and `Instant#toString` about
1.0 µs, and building any `Temporal.Instant` costs about 0.5 µs however it is
parsed. The spike pays that only when a datetime is read:

- **A loaded datetime stays a string until its reader is called.** "load"
  builds no `Temporal` value. "load, then read every column" builds eight per
  row, and that is nearly all of the gap between the two rows.
- **An assigned string already in the database's form stays a string too.**
  `YYYY-MM-DD HH:MM:SS` is bound as it is, so an insert that never reads the
  column back builds no `Temporal` value either. Any other value is cast on
  assignment.
- **A change against `null` is decided without a cast.** The dirty check
  compares raw slots first and casts only when both sides hold a value.

Before the last two, the insert row was 4.3 times the driver.

## Known differences from ActiveRecord

- **`LIMIT` is a literal, not a bind.** ActiveRecord sends
  `… WHERE "posts"."id" = ? LIMIT ?` for `find`. On `better-sqlite3`, a
  primary-key lookup with a bound `LIMIT` took 25 µs, and 2.6 µs with
  `LIMIT 1` written into the text or with no limit at all. The spike writes
  the integer into the SQL. The test rewrites ActiveRecord's trailing
  `LIMIT ?` the same way before comparing; every other statement is compared
  as sent.
- **`limit` takes an integer or a string of digits, and nothing else.**
  ActiveRecord accepts whatever `Integer()` casts. Because the spike writes
  the limit into the SQL text, that check is what keeps other text out of it.
- **A datetime is a `Temporal.Instant`.** ActiveRecord answers
  `TimeWithZone` or `@blazetrails/date`'s `Time`, both of which import
  ruby-compat.
- **`changes` is a plain object**, where ActiveRecord answers a
  `HashWithIndifferentAccess`.
- **No transaction around a save.** ActiveRecord wraps each `save` and
  `destroy` in one.
- **Column defaults are not read.** A new record starts with every column
  `null`.
- **Decimal, float, boolean and blob columns are not cast.** They pass
  through as the driver returns them.

Out of scope altogether: validations, callbacks, transactions, single-table
inheritance, every association but `belongsTo`, table-name inference, and
any database but SQLite.
