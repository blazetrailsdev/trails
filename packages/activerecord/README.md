# @blazetrails/activerecord

The ORM layer of [trails](../../README.md), a TypeScript port of Rails'
[ActiveRecord](https://api.rubyonrails.org/classes/ActiveRecord.html):
persistence, querying, associations, validations, callbacks, enums,
migrations, schema dump and load, transactions, encryption and fixtures. It is
the most complete package in the repo. Class names, method signatures and
behavior follow Rails, and the Rails ActiveRecord test suite, ported test for
test, is the specification.

It is built on `@blazetrails/arel` (the SQL AST) and `@blazetrails/activemodel`
(attributes, validations, callbacks, dirty tracking).

**The one big difference: JavaScript has no synchronous database access.**
Every method that touches the database is `async` and must be `await`ed.
Relations stay lazy, as in Rails, and you await the terminal call. Most of the
other differences below follow from that.

## Status

As of 2026-09-27 (`main` at `91245b796a`; not regenerated since):

| measure                                      | result              |
| -------------------------------------------- | ------------------- |
| Rails public methods with a TS counterpart   | 4748 / 4888 (97.1%) |
| Rails methods, including private / protected | 6685 / 6721 (99.5%) |
| Rails ActiveRecord test cases ported         | 8501 / 8630 (98.5%) |

Regenerate with `pnpm parity:api --package activerecord --public-only`,
`pnpm parity:api --package activerecord`, and `pnpm parity:test`. CI runs the
suite against SQLite, PostgreSQL and MySQL/MariaDB.

## Install

The packages are not on npm yet. Build them from a checkout and link them into
your project, as the [root README's quickstart](../../README.md#quickstart)
shows. The runtime has no CLI and bundles no driver. You add a driver yourself:

| optional peer    | for                                                |
| ---------------- | -------------------------------------------------- |
| `better-sqlite3` | the `sqlite3` adapter                              |
| `pg`             | `postgresql`                                       |
| `mysql2`         | `mysql2`                                           |
| `libsql`         | `libsql`, `libsql-remote`, `libsql-replica`        |
| `expo-sqlite`    | `expo-sqlite` (React Native)                       |
| none             | `node-sqlite` (Node's built-in `node:sqlite`)      |
| `typescript`     | only the `./type-virtualization/*` subpath (below) |

`typescript` is pinned to `7.1.0-dev.20260920.1`, the build the
type-virtualization engine behind `trails-tsc` was verified against. Nothing in
the runtime imports the compiler.

## Quickstart

With no trailties and no CLI: connect, migrate, define a model, query. This
script ran as shown, on Node 24 with `better-sqlite3`:

```ts
import { Base, Migration } from "@blazetrails/activerecord";

await Base.establishConnection({ adapter: "sqlite3", database: "tmp/standalone.sqlite3" });

class CreateArticles extends Migration {
  async change(): Promise<void> {
    await this.createTable("articles", { force: true }, (t) => {
      t.string("title");
      t.boolean("published", { default: false });
      t.timestamps();
    });
  }
}
await new CreateArticles().migrate("up");

class Article extends Base {
  static {
    this.validates("title", { presence: true });
    this.scope("published", function () {
      return this.where({ published: true });
    });
  }
}

const a = await Article.createBang({ title: "Hello", published: true });
console.log(a.id, a.published); //                                          1 true
console.log(await Article.published().count()); //                          1
console.log((await Article.create({ title: "" })).errors.fullMessages); // [ "Title can't be blank" ]
```

```text
==  CreateArticles: migrating =================================================
-- createTable("articles", {:force=>true})
   -> 0.0330s
==  CreateArticles: migrated (0.0340s) ========================================
```

`Article` declares no attributes. Its columns are reflected from the table the
first time the class queries or creates.

For a project layout with migrations on disk, use
[`ar`](../activerecord-cli/README.md) (standalone) or `trails new` (the full
stack). Both are walked through, with their current gaps, in their READMEs and
the [root quickstart](../../README.md#quickstart).

## Rails patterns translate directly

```ruby
class Post < ApplicationRecord
  belongs_to :author, optional: true
  has_many :comments, dependent: :destroy
  validates :title, presence: true
  scope :published, -> { where(published: true) }
  enum :status, { draft: 0, published: 1, archived: 2 }, prefix: true
end

Post.published.where("created_at > ?", 1.week.ago).order(created_at: :desc).limit(20)
post = Post.create!(title: "Hello", author: current_user)
post.update!(status: :archived)
```

```ts
import { Base } from "@blazetrails/activerecord";
import { Temporal } from "@blazetrails/date";

class Post extends Base {
  static {
    this.belongsTo("author", { optional: true });
    this.hasMany("comments", { dependent: "destroy" });
    this.validates("title", { presence: true });
    this.scope("published", function () {
      return this.where({ published: true });
    });
    this.enum("status", { draft: 0, published: 1, archived: 2 }, { prefix: true });
  }
}

const weekAgo = Temporal.Now.instant().subtract({ hours: 24 * 7 });
await Post.published().where("created_at > ?", weekAgo).order({ created_at: "desc" }).limit(20);
const post = await Post.createBang({ title: "Hello", author: currentUser });
await post.updateBang({ status: "archived" });
```

Three things in that translation are easy to get wrong:

- **A scope body is a `function`, not an arrow.** The relation is `this`, as
  Rails `instance_exec`s the lambda, and the parameters are the scope's own
  arguments. `(rel) => rel.where(...)` receives no relation and throws
  `Cannot read properties of undefined (reading 'where')`.
- **Time values are `Temporal`, not `Date`.** A JS `Date` bind raises
  `TypeError: quote: JS Date is not accepted — use a Temporal type`.
  `@blazetrails/date` re-exports `Temporal`.
- **An enum value and a scope with the same name collide.** The enum's scope
  replaces the earlier one, as in Rails. Hence `prefix: true` above.

The generated [Ruby → TypeScript conventions](../../docs/ruby-ts-conventions.md)
table is the authoritative naming reference (`save!` → `saveBang`, `valid?` →
`isValid`, and the rest).

### Association proxies

`post.comments` is an `AssociationProxy<Comment>`. It is chainable like a
relation, awaitable to its records, and iterable once loaded:

```ts
const post = await Post.find(1);
await post.comments.where({ flagged: false }).order("created_at"); // a query
const all = await post.comments; //                                   loads the target
for (const c of post.comments) c.body; //                             sync, once loaded
post.comments.map((c) => c.id);
await post.comments.size();
```

`length` is Ruby's `length` method, not the JS array property, so use
`await post.comments.size()` for a count.

`post.comments.createBang({...})` reflects `Comment`'s columns first if nothing
has loaded them yet. Before #8197 it raised `UnknownAttributeError` in that
case.

## Behavioral deviations from Rails

The full catalog (transactions as functions, `AsyncLocalStorage` for per-flow
state, Proxy-based scope dispatch, enums, ranges, numeric types, adapters) is
the [ActiveRecord deviations guide](../website/docs/guides/activerecord-rails-deviations.md).
These are the ones people coming from Rails hit first.

### 1. Bang and predicate spellings

`!` and `?` are not legal in JS identifiers. A bang method takes a `Bang`
suffix, and a predicate takes an `is` prefix (or `has`, where the conventions
table says so):

| Ruby         | trails            | Note                                                                |
| ------------ | ----------------- | ------------------------------------------------------------------- |
| `save!`      | `saveBang()`      | raises `RecordInvalid` on validation failure                        |
| `create!`    | `createBang()`    |                                                                     |
| `update!`    | `updateBang()`    |                                                                     |
| `destroy!`   | `destroyBang()`   |                                                                     |
| `valid?`     | `isValid()`       | async, see below                                                    |
| `changed?`   | `isChanged`       | a zero-argument predicate can be a getter                           |
| `published!` | `publishedBang()` | enum bang writer; persists (with a prefix, `statusPublishedBang()`) |

### 2. Singular associations load asynchronously

In Rails, reading an unloaded `belongs_to` / `has_one` fires a query
synchronously. trails cannot, so the reader returns the loaded or preloaded
record synchronously, and a `Promise` that runs the query when it is not
loaded. `await post.author` therefore always works:

```ts
const post = await Post.find(1);
const author = await post.author; // queries, or returns the loaded record
post.author; //                     now the loaded Author

const p = await Post.includes("author").find(1);
p.author; //                        Author, preloaded
```

Under strict loading (off by default), reading an unloaded association raises
`StrictLoadingViolationError`, as in Rails.

### 3. `isValid()` is async

`record.isValid()` returns `Promise<boolean>`. It runs the whole validator
chain, including the database-backed `UniquenessValidator` and
`validates_associated`, before it resolves. So `await record.isValid()` is
`false` on a uniqueness collision before any save, matching Rails' `valid?`.
`save()` and `saveBang()` run the same chain.

### 4. Transactions are functions

```ts
import { transaction } from "@blazetrails/activerecord";

await transaction(Post, async () => {
  await post.saveBang();
  await comment.saveBang();
});
```

## Typed models: `trails-tsc`

`trails-tsc` (shipped by `@blazetrails/activerecord-cli`) is a `tsc`
replacement. It reads `db/schema.ts` and each model's `static {}` block, and
rewrites the model in memory at type-check time, so a model needs no
hand-written `declare` lines:

```sh
ar db:schema:dump                               # writes db/schema.ts from the live database
trails-tsc --schema db/schema.ts --noEmit
```

Verified on 2026-09-28 (`main` at `c19bfc0aee`): attributes are typed from
their columns (`post.title` is `string | null`), and an enum attribute is typed
as its value names (`"archived" | "draft" | "published" | null`). `hasMany`
members are `AssociationProxy<T>`. Scopes and enum predicates, bang writers and
scopes are typed on the class and on `Relation<T>`, so a chain that mixes
enum scopes and named scopes type-checks.

Editor support (a tsserver plugin for model virtualization) is not built yet.
See [docs/infrastructure/virtual-source-files-plan.md](../../docs/infrastructure/virtual-source-files-plan.md).
The `declare`-pattern reference for hand-typed models is
[`dx-tests/declare-patterns.test-d.ts`](dx-tests/declare-patterns.test-d.ts).

### Adopting an existing database

Point a connection at the database, then:

```sh
ar db:schema:dump                        # introspect into db/schema.ts
ar models:dump --out app/models          # one class per table, belongsTo / hasMany from foreign keys
```

`ar models:dump` also takes `--only`, `--ignore`, `--strip-prefix` and
`--strip-suffix`. A table with no primary key is skipped with a comment.
Against the root quickstart's app it printed (excerpt):

```ts
// 4 models, 2 associations from 1 foreign key.
// SKIPPED posts_tags: no primary key (likely a view)

export class Comment extends Base {
  static {
    this.belongsTo("post");
  }
}

export class Post extends Base {
  static {
    this.hasMany("comments");
  }
}
```

## Database adapters

The adapter is picked by name in the connection config. Each adapter loads its
own driver:

| `adapter:`                                  | Driver                        | Subpath export                                                            |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `sqlite3`                                   | `better-sqlite3`              | `@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js` |
| `node-sqlite`                               | Node's built-in `node:sqlite` | `.../connection-adapters/node-sqlite-adapter.js`                          |
| `expo-sqlite`                               | `expo-sqlite` (React Native)  | `.../connection-adapters/expo-sqlite-adapter.js`                          |
| `libsql`, `libsql-remote`, `libsql-replica` | `libsql`                      | `.../connection-adapters/libsql-adapter.js`                               |
| `postgresql`                                | `pg`                          | `.../connection-adapters/postgresql-adapter.js`                           |
| `mysql2`                                    | `mysql2`                      | `.../connection-adapters/mysql2-adapter.js`                               |

A URL config maps the `sqlite:`, `postgres:` and `mysql:` schemes onto those
names (`ActiveRecord.protocolAdapters`). There is also a raw
`sqlite3-adapter.js` subpath. Register your own adapter with
`ConnectionAdapters.register(name, className, path, loader)` (see
[`src/connection-adapters.ts`](src/connection-adapters.ts)).

```ts
await Base.establishConnection({ adapter: "postgresql", url: process.env.DATABASE_URL });
```

## Examples

[examples/twitter-clone](../../examples/twitter-clone/) is a small Express app
with migrations, `belongsTo` / `hasMany` / `hasMany … through`
(self-referential follows), scopes typed on `Relation<T>`, validations, eager
loading and error mapping. `pnpm smoke` runs the whole flow against an
in-memory database (`TRAILS_ENV=test`), and ends with `Smoke test passed ✅`.

## Contributing and measuring parity

Read the Rails source under `vendor/rails/v8.0.2/activerecord/` first, port the
behavior, then port or unskip the Rails tests that prove it. Tests live next to
their source as `*.test.ts`, named after the Rails test so `parity:test` can
match them. Never rename a test to make it pass.

```sh
pnpm vitest run path/to/file.test.ts          # one file; do not run the whole suite locally
pnpm parity:api --package activerecord        # method-level coverage vs the Rails source
pnpm parity:test                              # test-name coverage vs the Rails suite
pnpm test:types                               # the DX type-test suites (dx-tests/)
```

The methodology is in [CONTRIBUTING.md](../../CONTRIBUTING.md) and the rules in
[CLAUDE.md](../../CLAUDE.md). ActiveRecord is "rowless" in the extra-surface
gate: every public name without a Rails counterpart needs a receipt at its
declaration.

## License

MIT. See [LICENSE](../../LICENSE) and [LICENSES.md](../../LICENSES.md).
