# @blazetrails/activerecord

The ORM layer of [trails](../../README.md) — a TypeScript port of Ruby on
Rails' [ActiveRecord](https://api.rubyonrails.org/classes/ActiveRecord.html):
persistence, querying, associations, validations, enums, and migrations. It is
the leading package of the monorepo. If you can read the Rails API docs, you
already know how to use this.

The goal has two halves:

- **Rails parity wherever the languages allow it.** Class names, method
  signatures, and behavior are designed to match Rails. Progress isn't measured
  by feel — we port the Rails test suite **test for test** (`test:compare`) and
  match the public API surface method for method (`api:compare`), so behavior is
  pinned to Rails' own tests rather than to our interpretation of them.
- **Rails-quality developer experience where the languages diverge.** Some Ruby
  idioms have no TypeScript equivalent — synchronous DB access, `!`/`?` in
  method names, the `inherited` hook, metaprogrammed attribute readers. Rather
  than drop those features, trails picks the most Rails-faithful, type-safe
  TypeScript shape (e.g. `save!` → `saveBang()`, lazy readers → awaited loaders)
  and documents each divergence. See
  [Behavioral deviations](#behavioral-deviations-from-rails) and the
  [deviations guide](../website/docs/guides/activerecord-rails-deviations.md).

Built on `@blazetrails/arel` (SQL AST) and `@blazetrails/activemodel`
(attributes, validations, callbacks, dirty tracking). This README is the
focused entry point for ActiveRecord; for the project-wide overview, package
list, and design principles see the [root README](../../README.md).

> The single biggest divergence: **JavaScript has no synchronous DB access**, so
> nearly every method that touches the database is `async` and must be
> `await`ed. The deviations below — the `Bang` suffix, async
> singular-association loading, and the sync/async validation split — mostly
> follow from that one fact.

## Install

The runtime package carries no CLI and no driver dependency — you add a driver
and (optionally) the CLI tooling yourself:

```sh
pnpm add @blazetrails/activerecord            # runtime — prod dep
pnpm add -D @blazetrails/activerecord-cli     # the `ar` CLI + trails-tsc — dev dep
pnpm add <driver>                             # one of: better-sqlite3 | pg | mysql2
```

The drivers are optional peer dependencies (`better-sqlite3`, `pg`, `mysql2`,
`expo-sqlite`); install only the one your target needs. `node:sqlite` needs no
package.

## Quickstart

The fastest path is the [`ar` CLI](#the-ar-cli) (the trails counterpart to
Rails' `bin/rails`), which scaffolds a project, generates migrations and
models, and runs migrations:

```sh
ar new myapp --driver better-sqlite3
cd myapp && pnpm install
ar db:create
ar generate:model Post title:string published:boolean
ar db:migrate
ar console            # REPL with Base + every model pre-loaded
```

Prefer wiring it up by hand? Establish a connection, define a model, and go:

```ts
import { Base } from "@blazetrails/activerecord";

// Adapter is selected by name; the adapter subclass bundles its own driver.
await Base.establishConnection({ adapter: "sqlite3", database: "db/dev.sqlite3" });

class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean", { default: false });
    this.belongsTo("author");
    this.hasMany("comments", { dependent: "destroy" });
    this.validates("title", { presence: true });
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}

const post = await Post.createBang({ title: "Hello" }); // save! → createBang
const recent = await Post.published().order("created_at", "desc").limit(10);
```

### Zero-declare models — `trails-tsc`

Hand-writing `this.attribute(...)` for every column is optional. `trails-tsc`
(shipped by `@blazetrails/activerecord-cli`) is a drop-in `tsc` replacement that
reads your dumped schema and each model's class body, then virtualizes the file
at type-check time to inject attribute fields, association proxies, scope
signatures, and enum surfaces — so you never hand-write a `declare`. Dump the
schema once and point your typecheck script at it:

```sh
ar db:schema:dump   # writes db/schema.ts (re-run after each migration, like Rails' schema.rb)
```

```json
{ "scripts": { "typecheck": "trails-tsc --schema db/schema.ts --noEmit" } }
```

See the [root README](../../README.md#zero-declare-models--trails-tsc) for the
full zero-declare story and the `declare`-pattern reference at
[`dx-tests/declare-patterns.test-d.ts`](dx-tests/declare-patterns.test-d.ts).

### Adopting against an existing database

Already have a database (and maybe an existing TypeScript app)? You don't need
`ar new`. Introspect the schema, generate models, and wire `trails-tsc` into
your current build:

1. **Dump the schema.** Point ActiveRecord at your DB (see
   [connection config](#database-adapters) below), then introspect it into a
   committed `db/schema.ts` — re-run after each migration, like Rails'
   `schema.rb`:

   ```sh
   ar db:schema:dump
   ```

2. **Generate models from the schema.** `ar models:dump` emits one
   `class X extends Base` module per table, with `belongsTo` / `hasMany`
   inferred from foreign keys. You own the files afterward (no round-trip
   merge); re-running regenerates.

   ```sh
   ar models:dump --out app/models          # or omit --out to print to stdout
   ar models:dump --only users,posts        # subset; --ignore is the inverse
   ar models:dump --strip-prefix wp_         # drop a table-name prefix/suffix
   ```

3. **Wire `trails-tsc` into your existing tsconfig.** The simplest path is to
   run `ar init` in the project root — it merges the required settings into your
   existing `tsconfig.json` (JSONC-aware, non-destructive; it won't overwrite
   without `--force`). To add them by hand, you need:

   ```jsonc
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "Node16",
       "moduleResolution": "Node16",
       "strict": true,
       "plugins": [{ "name": "@blazetrails/trails-tsc/ts-plugin" }],
     },
     "include": ["app/models/**/*.ts", "db/migrate/**/*.ts"],
   }
   ```

   Then type-check through `trails-tsc` (the schema-aware `tsc` replacement):

   ```sh
   trails-tsc --schema db/schema.ts --noEmit -p tsconfig.json
   ```

   The `plugins` entry is for editor support (autocomplete/hover via tsserver),
   which is still in flight; the command-line `trails-tsc` check works today.

See the [activerecord-cli README](../activerecord-cli/README.md) for the full
flag set and project layout.

## Examples

- **[Twitter clone](../../examples/twitter-clone/)** — a minimal Twitter/X clone
  on Express + better-sqlite3. It exercises the parts of ActiveRecord you reach
  for first: timestamped migrations, models with `belongsTo` / `hasMany` /
  `hasMany … through` (self-referential follows), scopes, validations, eager
  loading with `includes`, association proxies, and error mapping
  (`RecordNotFound` → 404, `RecordInvalid` → 422). Its
  [README](../../examples/twitter-clone/README.md) walks through setup, and
  `pnpm smoke` runs the whole flow end-to-end (in-memory DB, no HTTP).

A Vite example (front-end / SPA integration) is planned.

## Rails patterns translate directly

```ruby
# Ruby / Rails
class Post < ApplicationRecord
  belongs_to :author
  has_many :comments, dependent: :destroy
  validates :title, presence: true
  scope :published, -> { where(published: true) }
  enum status: { draft: 0, published: 1, archived: 2 }
end

Post.published.where("created_at > ?", 1.week.ago).order(created_at: :desc).limit(20)

post = Post.create!(title: "Hello", author: current_user)
post.update!(status: :published)
```

```ts
// TypeScript / trails
import { Base, defineEnum } from "@blazetrails/activerecord";

class Post extends Base {
  static {
    this.belongsTo("author");
    this.hasMany("comments", { dependent: "destroy" });
    this.validates("title", { presence: true });
    this.scope("published", (rel) => rel.where({ published: true }));
    defineEnum(this, "status", { draft: 0, published: 1, archived: 2 });
  }
}

await Post.published().where("created_at > ?", oneWeekAgo).order("created_at", "desc").limit(20); // lazy — await the terminal op

const post = await Post.createBang({ title: "Hello", author: currentUser }); // create!
await post.update({ status: "published" });
```

### Association proxies

`post.comments` (a collection) is an `AssociationProxy<Comment>` — chainable
like a relation, awaitable to the loaded array, and array-shaped once hydrated:

```ts
const post = await Post.find(1);
const recent = await post.comments.where({ flagged: false }).order("created_at").limit(10);
const all = await post.comments; // awaitable → Comment[]
for (const c of post.comments) c.body; // array-shaped once loaded
post.comments.length;
```

Singular associations (`belongsTo` / `hasOne`) behave differently — see
[Async singular-association loading](#2-async-singular-association-loading-belongsto--hasone).

## Behavioral deviations from Rails

ActiveRecord is where JavaScript's single-threaded async model has the biggest
impact: almost every DB-touching method in Rails is synchronous, but in trails
it returns a `Promise`. The deviations below are the ones that most often trip
up someone coming from Rails. The full catalog (transactions as functions,
`AsyncLocalStorage` for per-flow state, Proxy-based scope dispatch, enums,
ranges, numeric types, adapters) lives in the
[ActiveRecord deviations guide](../website/docs/guides/activerecord-rails-deviations.md).

### 1. The `Bang` suffix: `save!` → `saveBang`

`!` is not a legal identifier character in JS/TS, so every Ruby **bang** method
becomes a `Bang` **suffix** in trails. This is one rule in the authoritative,
CI-checked [Ruby → TypeScript naming conventions](../../docs/ruby-ts-conventions.md)
(generated from `scripts/api-compare/conventions.ts`; never hand-edit it).

| Ruby         | trails            | Note                                 |
| ------------ | ----------------- | ------------------------------------ |
| `save!`      | `saveBang()`      | Bang (`!`) → `*Bang` suffix.         |
| `create!`    | `createBang()`    |                                      |
| `update!`    | `updateBang()`    |                                      |
| `destroy!`   | `destroyBang()`   |                                      |
| `valid?`     | `isValid()`       | Predicate (`?`) → `is*` prefix.      |
| `published!` | `publishedBang()` | enum bang setter (async — persists). |

```ts
await post.saveBang(); // Rails: post.save!  — throws on validation failure
await Post.createBang({ title: "x" });
```

Related families that follow the same suffix: `toggleBang`, `incrementBang`,
`decrementBang`, the `validatesUniqueness`/`validatesPresenceOf` declarations,
and the enum bang setters from `defineEnum`/`Base.enum`.

### 2. Async singular-association loading (`belongsTo` / `hasOne`)

In Rails, reading an unloaded `belongs_to`/`has_one` lazily fires a query
**synchronously**. JavaScript can't do a synchronous DB read, so trails splits
the behavior:

- **The sync reader `post.author` does NOT query.** It returns the currently
  loaded or preloaded record, or `null` if the association hasn't been loaded.
  It will never issue a lazy query the way Rails does.
- **To actually load, `await` the per-macro loader** — `loadBelongsTo(name)` /
  `loadHasOne(name)` — or preload up front with `.includes(...)`:

```ts
const post = await Post.find(1);

post.author; // null — not loaded yet (no query)
const author = await post.loadBelongsTo("author"); // queries (or returns cached/preloaded)
post.author; // now the loaded Author

// or preload, so the sync read is safe:
const p = await Post.includes("author").find(1);
p.author; // Author (preloaded)
```

- **Under strict loading, the sync reader throws.** When strict loading is
  enabled on a record (`Post.strictLoadingByDefault = true`,
  `record.strictLoadingBang()`, or globally), accessing an **unloaded** singular
  association via the sync reader throws `StrictLoadingViolationError` instead of
  silently returning `null` — pointing you at `loadBelongsTo`/`loadHasOne` or
  `.includes(...)`. Strict loading is **off by default** (Rails parity). See
  [`src/strict-loading-sync-reader.test.ts`](src/strict-loading-sync-reader.test.ts)
  and the `loadBelongsTo` implementation in [`src/associations.ts`](src/associations.ts).

### 3. `isValid()` is synchronous — but uniqueness/associated are async

`record.isValid()` (Rails' `valid?`) is **synchronous** and returns a boolean.
It runs all the synchronous validators (presence, length, numericality,
absence, format, inclusion/exclusion, …) inline.

But uniqueness and `validates_associated` need a DB round-trip, so they're
**async**: they push a promise onto the record rather than blocking `isValid()`.
That means a manual `isValid()` call returns _before_ those async validators
have finished, so `record.errors` may not yet reflect them.

```ts
if (record.isValid()) { ... }   // sync validators only — uniqueness not yet resolved
```

`save()` / `saveBang()` await the async validators for you — so the simplest
correct pattern is to let `save` do the validating:

```ts
if (await record.save()) {
  // runs sync + async validators, then persists
  // saved
} else {
  record.errors; // fully populated, including uniqueness
}
```

See [`src/validations.ts`](src/validations.ts) (`isValid`) and
[`src/validations/uniqueness.ts`](src/validations/uniqueness.ts) for the exact
split, plus `_runAsyncValidations` in [`src/base.ts`](src/base.ts).

### 4. Async everywhere else the DB is touched

Finders (`find`, `findBy`, `first`, `count`, `pluck`, `exists`, `findEach`…),
relation materialization (`toArray()` for Rails' `to_a`), persistence (`save`,
`update`, `destroy`, `touch`, `updateColumn`…), and every adapter call are all
`async`. Relations stay lazy as in Rails — you just `await` the terminal
operation. Transactions are a module-level **function**, not a block:

```ts
import { transaction } from "@blazetrails/activerecord";

await transaction(Post, async () => {
  await post.saveBang();
  await comment.saveBang();
});
```

Full list and rationale: the
[ActiveRecord deviations guide](../website/docs/guides/activerecord-rails-deviations.md).

## Database adapters

Adapters are selected by **name** in your connection config; the adapter
subclass bundles its own driver, so the config alone picks the backend. Each
adapter is also available as an explicit subpath import from this package's
`exports` map:

| Config name (`adapter:`) | Driver / runtime              | Subpath export                                                            |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------- |
| `sqlite3` (canonical)    | `better-sqlite3`              | `@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js` |
| `node-sqlite`            | Node's built-in `node:sqlite` | `.../connection-adapters/node-sqlite-adapter.js`                          |
| `expo-sqlite`            | `expo-sqlite` (React Native)  | `.../connection-adapters/expo-sqlite-adapter.js`                          |
| `postgresql`             | `pg`                          | `.../connection-adapters/postgresql-adapter.js`                           |
| `mysql2`                 | `mysql2`                      | `.../connection-adapters/mysql2-adapter.js`                               |

Aliases are also registered: `sqlite` → `sqlite3`, `postgres` → `postgresql`,
`mysql` → `mysql2`. There is a dedicated raw `sqlite3-adapter.js` export too;
`better-sqlite3` backs the canonical `sqlite3` name. Register your own with
`ConnectionAdapters.register(name, loader)` (see
[`src/connection-adapters.ts`](src/connection-adapters.ts)).

Choose at connection time:

```ts
await Base.establishConnection({ adapter: "postgresql", url: process.env.DATABASE_URL });
// or, via config/database.ts keyed on TRAILS_ENV when using the `ar` CLI.
```

## The `ar` CLI

`@blazetrails/activerecord-cli` provides the `ar` binary — the trails
counterpart to Rails' `bin/rails` for ActiveRecord workflows. Run
`ar --help`, or `ar <command> --help` for any command's options. The full
command set (with project-layout details and the programmatic API) is in the
[activerecord-cli README](../activerecord-cli/README.md). The highlights:

| Area        | Commands                                                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scaffolding | `ar new <app>`, `ar init`, `ar generate:model`, `ar generate:migration`, `ar generate:manifest`, `ar destroy:model`, `ar destroy:migration`                                                                                  |
| Database    | `ar db:create` / `db:drop` / `db:migrate` / `db:rollback` / `db:migrate:status` / `db:version` / `db:seed` / `db:schema:dump` / `db:schema:load` / `db:setup` / `db:reset` / `db:prepare` / `db:abort_if_pending_migrations` |
| Runtime     | `ar console` (REPL with models pre-loaded), `ar runner <script>`                                                                                                                                                             |
| Tooling     | `ar typecheck` (via `trails-tsc`), `ar models:dump`                                                                                                                                                                          |

> ActiveRecord registers models via Ruby's `inherited` hook + Zeitwerk; ES
> modules have no equivalent, so the CLI maintains a generated barrel
> (`app/models/index.ts`). Run `ar generate:manifest` after adding/removing a
> model, or `--check` in CI to catch drift.

## Contributing & measuring parity

ActiveRecord is built **Rails-port-first**: read the Rails source, implement the
behavior, then unskip the tests that prove it. Tests live next to their source
as `*.test.ts`, named to match the corresponding Rails test so `test:compare`
can match them — **never rename a test to make it pass**.

```sh
pnpm vitest run path/to/file.test.ts   # run an individual file (don't run the whole suite locally)
pnpm api:compare --package activerecord # method-level coverage vs Rails source
pnpm test:compare                       # test-name coverage vs the Rails test suite
pnpm test:types                         # DX typecheck suites (dx-tests/, virtualized-dx-tests/)
pnpm api:conventions                    # regenerate docs/ruby-ts-conventions.md
```

The methodology — implementation-first principles, the `@internal` JSDoc
convention for Rails-private helpers, the module-mixin pattern, and how progress
is measured — is in [CONTRIBUTING.md](../../CONTRIBUTING.md). The canonical
naming rules are in [docs/ruby-ts-conventions.md](../../docs/ruby-ts-conventions.md).
The intentional divergences (and why) are catalogued in the
[ActiveRecord deviations guide](../website/docs/guides/activerecord-rails-deviations.md).

## Further reading

- [Root README](../../README.md) — project overview, package list, design principles.
- [Twitter clone example](../../examples/twitter-clone/) — a runnable Express + ActiveRecord app.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Rails-port methodology and conventions.
- [Ruby → TypeScript conventions](../../docs/ruby-ts-conventions.md) — the authoritative naming rules.
- [activerecord-cli README](../activerecord-cli/README.md) — the `ar` CLI in depth.
- [ActiveRecord deviations](../website/docs/guides/activerecord-rails-deviations.md) · [ActiveModel](../website/docs/guides/activemodel-rails-deviations.md) · [Arel](../website/docs/guides/arel-rails-deviations.md).
- [Rails ActiveRecord API docs](https://api.rubyonrails.org/classes/ActiveRecord.html) — names and signatures are designed to match.

## License

MIT. See [LICENSE](../../LICENSE) and [LICENSES.md](../../LICENSES.md).
