# trails

trails is a re-implementation of Ruby on Rails in TypeScript. Each package
ports one Rails gem (or one gem Rails depends on), file for file and method for
method. Class names, method names, argument order and error messages follow the
Ruby source, translated by a fixed set of naming rules. Progress is measured by
running Rails' own test suite, ported test for test, and by matching the Rails
public API method by method.

The full Rails scaffold pipeline runs on it. `trails new` generates an app,
`generate scaffold` writes the model, migration, controller, views, route and
tests, `db:migrate` builds the table, and `trails server` serves working CRUD
pages: Rails' scaffold views in the generated layout, forms with CSRF
protection, flash notices, validation errors, and view reloading in
development. The model is typed from the schema by `trails-tsc`, and the
scaffold's functional tests, ported from Rails' templates, pass. The
[quickstart](#quickstart) walks through all of it.

It is pre-release. Nothing is published to npm yet, so you run it from a
checkout of this repository.

- [Quickstart](#quickstart), verified end to end on 2026-10-14
- [Models: the ActiveRecord surface](#models-the-activerecord-surface)
- [Typed models with `trails-tsc`](#typed-models-with-trails-tsc)
- [Packages](#packages)
- [Status and parity snapshot](#status-and-parity-snapshot)
- [Requirements](#requirements)
- [Development](#development)
- [Contributing](#contributing)

## Quickstart

Every command and every output block in this section was run on 2026-10-14
against `main` at `b8bcadc150`, on Linux with Node 24.16.0 and SQLite, with
`TRAILS_ENV` and `NODE_ENV` unset. No step needs a workaround.

### 1. Build the framework from a checkout

Use **Node 24** or later; the workspace's `engines` field enforces it at
`pnpm install`.

```sh
git clone https://github.com/blazetrailsdev/trails.git
cd trails
corepack enable
pnpm install
pnpm build            # tsc --build over the workspace, ~10s
export TRAILS=$PWD
```

### 2. Generate an application

```sh
cd ..
node $TRAILS/packages/trailties/bin/trails.js new blog --skip-install --skip-git
cd blog
```

```text
Creating new trails application: blog

      create  package.json
      create  tsconfig.json
      ...
      create  config/routes.ts
      create  config/database.ts
      create  app/controllers/application-controller.ts
      create  app/models/application-record.ts
      create  app/views/layouts/application.html.tse
      ...
  Done! cd blog && trails server
```

The generated `package.json` asks for `@blazetrails/*` packages from the npm
registry, where they do not exist yet. Point them at your checkout with pnpm
overrides, then install:

```sh
{
  echo "overrides:"
  for p in $TRAILS/packages/*; do
    echo "  \"$(node -p "require('$p/package.json').name")\": \"link:$p\""
  done
  printf 'allowBuilds:\n  better-sqlite3: true\n  esbuild: true\n'
} > pnpm-workspace.yaml
pnpm install
```

### 3. Scaffold a resource and migrate

```sh
bin/trails generate scaffold Post title:string body:text
```

```text
      invoke  active_record
      create  db/migrate/20261014154434_create_posts.ts
      create  app/models/post.ts
      invoke  test_unit
      create  test/models/post.test.ts
      create  test/fixtures/posts.yml
      invoke  resource_route
       route  this.resources("posts");
      invoke  scaffold_controller
      create  app/controllers/posts-controller.ts
      create  app/views/posts
      create  app/views/posts/index.html.tse
      create  app/views/posts/edit.html.tse
      create  app/views/posts/show.html.tse
      create  app/views/posts/new.html.tse
      create  app/views/posts/_form.html.tse
      create  app/views/posts/_post.html.tse
      create  test/controllers/posts-controller.test.ts
      create  app/helpers/posts-helper.ts
      invoke  resource_route
```

```sh
pnpm db:migrate
```

```text
== 20261014154434 CreatePosts: migrating ======================================
-- createTable("posts")
   -> 0.0082s
== 20261014154434 CreatePosts: migrated (0.0112s) =============================
```

The migration subclasses `Migration.get(8.0)`, Rails' `ActiveRecord::Migration[8.0]`,
and the migrate writes
`db/schema.ts` from the live database, as Rails writes `schema.rb`:

```ts
// db/migrate/20261014154434_create_posts.ts
import { Migration } from "@blazetrails/activerecord";

export class CreatePosts extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("posts", (t) => {
      t.string("title");
      t.text("body");
      t.timestamps();
    });
  }
}
```

### 4. Query from a script

The model the generator wrote is a bare class. Its attributes come from the
table.

```ts
// app/models/post.ts (generated)
import { ApplicationRecord } from "./application-record.js";

export class Post extends ApplicationRecord {}
```

```ts
// script/hello.ts
import "../config/environment.js";
import { Post } from "../app/models/post.js";

const post = await Post.create({ title: "Hello", body: "First post" });
console.log(post.id, post.isPersisted());

console.log(await Post.count());
console.log((await Post.where({ title: "Hello" }).first())?.body);
console.log(Post.where({ title: "Hello" }).order("created_at").limit(10).toSql());
```

```sh
npx tsx script/hello.ts
```

```text
1 true
1
First post
SELECT "posts".* FROM "posts" WHERE "posts"."title" = 'Hello' ORDER BY created_at LIMIT 10
```

```sh
bin/trails routes
```

```text
            Prefix Verb   URI Pattern               Controller#Action
             posts GET    /posts(.:format)          posts#index
                   POST   /posts(.:format)          posts#create
          new_post GET    /posts/new(.:format)      posts#new
         edit_post GET    /posts/:id/edit(.:format) posts#edit
              post GET    /posts/:id(.:format)      posts#show
                   PATCH  /posts/:id(.:format)      posts#update
                   PUT    /posts/:id(.:format)      posts#update
                   DELETE /posts/:id(.:format)      posts#destroy
rails_health_check GET    /up(.:format)             rails/health#show
```

The console loads every model before it prompts:

```sh
bin/trails console
```

```text
trails> const p = await Post.first()
undefined
trails> p.title
'Hello'
trails> await Post.where({ title: "Hello" }).count()
1
```

### 5. Serve it

The scaffold is a complete CRUD resource: a controller with `index` through
`destroy`, a `setPost` before-action and `postParams()` over `params.expect`,
and views ported from Rails' scaffold templates.

```sh
bin/trails server -p 3927   # the default port is 3000; this run used 3927
```

```text
=> Trails application starting in development on http://localhost:3927
=> Vite dev server with HMR enabled
=> Ctrl+C to stop
```

Open `http://localhost:3927/posts` and the scaffold works as it does in Rails:

- `/posts`, `/posts/:id`, `/posts/new` and `/posts/:id/edit` render Rails'
  scaffold views inside the generated layout, titled from `contentFor("title")`.
- The forms carry an authenticity token. Create redirects `302` to the new
  post, update and destroy redirect `303 See Other`, and each shows its
  `notice` once.
- Add `this.validates("title", { presence: true })` to `Post`, restart the
  server, and an empty title re-renders the form with `422`,
  "1 error prohibited this post from being saved", and `field_with_errors`
  around the field.
- A non-GET request without a valid token answers
  `422 ActionController::InvalidAuthenticityToken`.
- Edits to a view show on the next request. Edits to a model need a restart:
  trails has no autoloader.

`GET /posts`, with the development-mode `<!-- BEGIN … -->` / `<!-- END … -->`
template comments and blank lines stripped:

```text
<!DOCTYPE html>
<html>
  <head>
    <title>Posts</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <link rel="icon" href="/icon.png" type="image/png">
    <link rel="icon" href="/icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/icon.png">
    <link rel="stylesheet" href="/assets/stylesheets/application.css" />
  </head>
  <body>
    <p style="color: green"></p>
<h1>Posts</h1>
<div id="posts">
    <div id="post_1">
  <p>
    <strong>Title:</strong>
    Hello
  </p>
  <p>
    <strong>Body:</strong>
    First post
  </p>
</div>
    <p>
      <a href="/posts/1">Show this post</a>
    </p>
</div>
<a href="/posts/new">New post</a>
  </body>
</html>
```

### 6. Type-check with `trails-tsc`

`pnpm build` runs `trails-tsc --schema db/schema.ts`, the schema-aware `tsc`.
The model is typed from the schema with no `declare` lines. This file:

```ts
const post = await Post.find(1);
const n: number = post.title;
```

fails the build with:

```text
app/models/check.ts(4,7): error TS2322: Type 'string | null' is not assignable to type 'number'.
  Type 'null' is not assignable to type 'number'.
```

The build also passes after `generate scaffold`.

### 7. Run the tests

```sh
pnpm test
```

The scaffold's controller test is a port of Rails' `functional_test.rb.tt`:
it drives `index`, `new`, `create`, `show`, `edit`, `update` and `destroy`
through `ActionDispatch::IntegrationTest` against the generated
`test/fixtures/posts.yml`. The model test is Rails' `the truth` placeholder, a
`todo`.

```text
 Test Files  1 passed | 1 skipped (2)
      Tests  7 passed | 1 todo (8)
```

## Models: the ActiveRecord surface

A Rails model and its trails port, side by side. The TypeScript below ran
against SQLite in the app above, with `authors`, `comments`, `tags` and a
`posts_tags` join table added by migrations. The output shown is what it
printed.

```ruby
class Post < ApplicationRecord
  belongs_to :author, optional: true
  has_many :comments, dependent: :destroy
  has_and_belongs_to_many :tags

  validates :title, presence: true
  validates :slug, uniqueness: true

  scope :published, -> { where(published: true) }
  scope :authored_by, ->(author) { where(author: author) }

  enum :status, { draft: 0, published: 1, archived: 2 }, prefix: true
end
```

```ts
import { ApplicationRecord } from "./application-record.js";
import type { Author } from "./author.js";

export class Post extends ApplicationRecord {
  static {
    this.belongsTo("author", { optional: true });
    this.hasMany("comments", { dependent: "destroy" });
    this.hasAndBelongsToMany("tags");

    this.validates("title", { presence: true });
    this.validates("slug", { uniqueness: true });

    this.scope("published", function () {
      return this.where({ published: true });
    });
    this.scope("authoredBy", function (author: Author) {
      return this.where({ author });
    });

    this.enum("status", { draft: 0, published: 1, archived: 2 }, { prefix: true });
  }
}
```

A scope body is a `function`, not an arrow function. The relation is `this`,
as Rails `instance_exec`s the lambda, and the arguments are the scope's
own. An arrow `(rel) => rel.where(...)` receives no relation and throws.

The enum carries `prefix: true` because without it, the enum's own `published`
scope (`status = 1`) replaces the `published` scope declared above it
(`published = 1`). Rails does the same, with a warning in the log.

```ts
const dean = await Author.createBang({ name: "Dean" });
const ruby = await Tag.createBang({ name: "ruby" });

const post = await Post.createBang({
  title: "Hello",
  slug: "hello",
  author: dean,
  published: true,
});
await post.comments.createBang({ body: "First!", flagged: false });
await post.comments.createBang({ body: "spam", flagged: true });
await post.tags.push(ruby);

await post.statusPublishedBang(); // enum bang writer: persists
post.status; //                      "published"

const posts = await Post.published()
  .authoredBy(dean)
  .includes("comments", "tags")
  .order({ created_at: "desc" })
  .limit(20);
posts[0].tags.map((t) => t.name); // [ 'ruby' ]

Post.published().authoredBy(dean).order({ created_at: "desc" }).limit(20).toSql();
// SELECT "posts".* FROM "posts" WHERE "posts"."published" = 1 AND "posts"."author_id" = 1
//   ORDER BY "posts"."created_at" DESC LIMIT 20

Post.statuses; //                               { draft: 0, published: 1, archived: 2 }
await Post.where({ status: "published" }).count(); // 1
await Post.statusArchived().count(); //             0

try {
  await Post.createBang({ title: "", slug: "hello" });
} catch (e) {
  // RecordInvalid: Validation failed: Title can't be blank, Slug has already been taken
}
const dup = new Post({ title: "Again", slug: "hello" });
await dup.isValid(); //    false, after running the uniqueness SELECT
dup.errors.fullMessages; // [ 'Slug has already been taken' ]
```

A model's columns are reflected from the database the first time it is queried
or created, through the class or through an association. `post.comments.createBang(...)`
above is the first thing to touch `Comment` in that process.

### Association proxies

`post.comments` is chainable like a relation, awaitable to its records, and
iterable once loaded:

```ts
const post = await Post.find(1);

await post.comments.where({ flagged: false }).order("created_at"); // [ Comment 'First!' ]
const all = await post.comments; //                                   2 records; loads the target
for (const c of post.comments) c.body; //                             'First!', 'spam'
post.comments.map((c) => c.id); //                                    [ 1, 2 ]
post.comments[0]?.body; //                                            'First!'
await post.comments.size(); //                                        2
```

`length` is a method (Ruby's `length`), not the JS array property, so use
`await post.comments.size()` for a count.

A singular association (`belongsTo` / `hasOne`) returns the loaded record
synchronously when it is loaded or preloaded (`includes("author")`), and a
promise that loads it otherwise, so `await post.author` always works.

### Async, bangs and predicates

JavaScript has no synchronous database access, so every method that touches
the database is `async`. Relations stay lazy, and you `await` the terminal call
(`first`, `count`, `toArray()`, or the relation itself). The naming rules come
from one generated table,
[docs/ruby-ts-conventions.md](docs/ruby-ts-conventions.md), which is also what
`parity:api` matches on.

| Ruby / Rails               | trails                                         |
| -------------------------- | ---------------------------------------------- |
| `save!`, `create!`         | `saveBang()`, `createBang()`                   |
| `valid?`                   | `await isValid()`: runs DB-backed validators   |
| `changed?`, `persisted?`   | `isChanged` (getter), `isPersisted()`          |
| `model[:title]`            | `model.readAttribute("title")`                 |
| `model[:title] = "x"`      | `model.writeAttribute("title", "x")`           |
| `relation.to_a`            | `await relation.toArray()`                     |
| `Post.transaction { ... }` | `await transaction(Post, async () => { ... })` |
| `arel_table[:id]`          | `table.get("id")`                              |
| `Time` / `Date` values     | `Temporal` types from `@blazetrails/date`      |

Date and time values are `Temporal` objects, not JS `Date`. A JS `Date` passed
as a bind raises `TypeError: quote: JS Date is not accepted — use a Temporal
type`. So write:

```ts
import { Temporal } from "@blazetrails/date";

Post.where("created_at > ?", Temporal.Instant.from("2020-01-01T00:00:00Z")).toSql();
// SELECT "posts".* FROM "posts" WHERE (created_at > '2020-01-01 00:00:00')
```

The longer guide is [Trails Idioms](packages/website/docs/guides/idioms.md).
The places where trails diverges from Rails on purpose, and why, are catalogued
per package: [ActiveRecord](packages/website/docs/guides/activerecord-rails-deviations.md)
· [ActiveModel](packages/website/docs/guides/activemodel-rails-deviations.md)
· [Arel](packages/website/docs/guides/arel-rails-deviations.md).

### Database adapters

The adapter is picked by name in `config/database.ts`. Each one loads its own
driver, which you install yourself:

| `adapter:`                                  | Driver                        |
| ------------------------------------------- | ----------------------------- |
| `sqlite3`                                   | `better-sqlite3`              |
| `node-sqlite`                               | Node's built-in `node:sqlite` |
| `expo-sqlite`                               | `expo-sqlite` (React Native)  |
| `libsql`, `libsql-remote`, `libsql-replica` | `libsql`                      |
| `postgresql`                                | `pg`                          |
| `mysql2`                                    | `mysql2`                      |

A URL config maps the `sqlite:`, `postgres:` and `mysql:` schemes onto those
names (`ActiveRecord.protocolAdapters`). CI runs the ActiveRecord suite against
SQLite, PostgreSQL and MySQL/MariaDB. The quickstart above was verified on
SQLite only.

## Typed models with `trails-tsc`

`trails-tsc` ships in `@blazetrails/activerecord-cli`. It is a `tsc`
replacement that reads `db/schema.ts` and each model's `static {}` block, and
rewrites the model file in memory at type-check time. Attribute types come from
the schema, and association, scope and enum members come from the class body.
So a model needs no hand-written `declare` lines. A generated app's `build`
script already uses it (see [step 6](#6-type-check-with-trails-tsc)).

What the schema-driven typing covers today, checked against the app above:

- **Attributes** are typed from the column: `post.title` is `string | null`,
  and `post.created_at` is a Temporal instant/date-time.
- **Associations**: `post.comments` is an `AssociationProxy<Comment>`, and
  `post.author` is `Author | null | Promise<Author | null>`.
- **Scopes** are typed on the class and on `Relation<T>`: `Post.published()`
  is a `Relation<Post>`, and so is `Post.published().authoredBy(x)`.
- **Enums**: the attribute is typed as its value names
  (`post.status` is `"archived" | "draft" | "published" | null`). The
  predicates, bang writers and scopes are typed too (`isStatusDraft()`,
  `statusPublishedBang()`, `Post.statusArchived()`), and enum scopes chain
  with other scopes.

The `trails-tsc` language-service plugin in the generated `tsconfig.json` covers
`.tse` views only. Editor support for model virtualization is tracked in
[docs/infrastructure/virtual-source-files-plan.md](docs/infrastructure/virtual-source-files-plan.md).

Outside a trailties app, dump the schema from a live database with
`ar db:schema:dump`, then point `trails-tsc --schema db/schema.ts` at it. See
[packages/activerecord-cli](packages/activerecord-cli/README.md).

## Packages

Every package under `packages/`. "Rails source" names the upstream it ports.
The parity figures are in the [next section](#status-and-parity-snapshot).

| Package                         | Rails source                       | What it is, and how usable it is today                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@blazetrails/activerecord`     | `activerecord`                     | The ORM: persistence, querying, associations, validations, callbacks, enums, migrations, schema dumping, transactions, encryption, fixtures. SQLite, PostgreSQL and MySQL adapters. The most complete package, and the one to evaluate first.                                                                                                     |
| `@blazetrails/activemodel`      | `activemodel`                      | Attributes and type casting, validations, callbacks, dirty tracking, errors, naming, serialization, `has_secure_password`. Near-complete.                                                                                                                                                                                                         |
| `@blazetrails/arel`             | `activerecord/lib/arel`            | The SQL AST, managers and per-dialect visitors that ActiveRecord builds its queries with. Near-complete. Class names drive visitor dispatch, so do not minify them.                                                                                                                                                                               |
| `@blazetrails/activesupport`    | `activesupport`                    | Inflector, core extensions, `HashWithIndifferentAccess`, callbacks, concerns, notifications, caching, message verifiers and encryptors, time zones, `Duration`, JSON, testing helpers. Broad and mostly complete.                                                                                                                                 |
| `@blazetrails/activerecord-cli` | the `rails db:*` tasks, standalone | The `ar` CLI for using ActiveRecord without trailties: `ar new`, `generate:model` / `migration`, `db:*`, `console`, `runner`, `models:dump`, plus the `trails-tsc` binary. Works.                                                                                                                                                                 |
| `@blazetrails/actionpack`       | `actionpack`                       | ActionDispatch (routing and Journey, request/response, middleware, cookies, sessions, CSP, integration testing) and ActionController (Metal, Base, API, parameters, rendering, filters, rescue). Runs the full scaffold request cycle: routing, sessions, flash, CSRF protection and strong parameters. Coverage is in the parity snapshot below. |
| `@blazetrails/actionview`       | `actionview`                       | Template lookup and rendering, layouts, partials, and helpers (tag, URL, form, asset, text, number, date, sanitize). Templates are TSE, the trails analogue of ERB. Renders Rails' scaffold views, including `formWith` and its form builder. Coverage is in the parity snapshot below.                                                           |
| `@blazetrails/trailties`        | `railties`                         | The `trails` CLI (`new`, `generate`, `server`, `db`, `routes`, `console`, `credentials`), application boot and initializers, engines, generators, the Vite-backed dev server. Generates and serves a complete scaffolded app.                                                                                                                     |
| `@blazetrails/rack`             | `rack` gem                         | Rack: the request/response interface, `Builder`, and the standard middleware. Nearly complete.                                                                                                                                                                                                                                                    |
| `@blazetrails/rack-session`     | `rack-session` gem                 | `Rack::Session::Abstract::Persisted` / `PersistedSecure` / `SessionId` and the in-memory `Pool` store, which ActionDispatch's session stores build on. The cookie store and encryptor are not ported.                                                                                                                                             |
| `@blazetrails/rack-test`        | `rack-test` gem                    | `Rack::Test::Session`, cookie jar, uploaded files and multipart, used by integration tests. Nearly complete.                                                                                                                                                                                                                                      |
| `@blazetrails/globalid`         | `globalid` gem                     | `GlobalID`, `SignedGlobalID` and the locator. Nearly complete.                                                                                                                                                                                                                                                                                    |
| `@blazetrails/i18n`             | `i18n` gem                         | `I18n` config, simple and fallback backends, interpolation, pluralization and exceptions. The whole gem test suite is ported.                                                                                                                                                                                                                     |
| `@blazetrails/date`             | `date` gem                         | Ruby's `Date` / `DateTime`, built on Temporal (`@js-temporal/polyfill`). Re-exports `Temporal`, which is how trails represents time values. The ported date gem tests all pass.                                                                                                                                                                   |
| `@blazetrails/did-you-mean`     | `did_you_mean` gem                 | `SpellChecker` with Jaro-Winkler and Levenshtein distances, for "Did you mean?" error suggestions. The parts trails uses are complete.                                                                                                                                                                                                            |
| `@blazetrails/bcrypt`           | `bcrypt` gem                       | `BCrypt::Password` and `BCrypt::Engine`, behind ActiveModel's `has_secure_password`.                                                                                                                                                                                                                                                              |
| `@blazetrails/msgpack`          | `msgpack` gem                      | `MessagePack` packer, unpacker, factory and extension types, used by ActiveSupport's message serializers and ActiveRecord.                                                                                                                                                                                                                        |
| `@blazetrails/activejob`        | `activejob`                        | A start: `ActiveJob::Base`, version and deprecator only. No queue adapters or job execution yet.                                                                                                                                                                                                                                                  |
| `@blazetrails/ruby-compat`      | Ruby core / stdlib                 | Ruby primitives that Rails calls and does not define (`Range`, `Rational`, `Enumerator`, `String#succ`, `Hash#fetch` semantics, `Kernel#respond_to?`, monitors, `method_missing` proxies). A leaf package; see its [README](packages/ruby-compat/README.md).                                                                                      |
| `@blazetrails/tse-compiler`     | `erubi` gem                        | The TSE (Trails Server Embedded) template compiler: lexer, parser and JS emitter with source maps. Used by actionview and the view build.                                                                                                                                                                                                         |
| `@blazetrails/trails-tsc`       | none                               | A TypeScript 5.9 compiler wrapper with a plugin host. Today it builds and type-checks `.tse` views (`trails-tsc-views`) and provides the views language-service plugin. The model `trails-tsc` binary lives in `activerecord-cli`.                                                                                                                |
| `@blazetrails/html-sanitizer`   | `rails-html-sanitizer` gem         | `FullSanitizer`, `LinkSanitizer` and `SafeListSanitizer`, over `sanitize-html`. Small, and nothing in the workspace depends on it yet.                                                                                                                                                                                                            |
| `@blazetrails/nokogiri`         | `nokogiri` gem (XML SAX only)      | The slice of Nokogiri's XML SAX parser that ActiveSupport's `XmlMini` needs, over `libxml2-wasm`. Small.                                                                                                                                                                                                                                          |
| `@blazetrails/website`          | none                               | Private. The project website and docs site (SvelteKit + VitePress), including the guides linked above. Not a library.                                                                                                                                                                                                                             |

## Status and parity snapshot

**As of 2026-10-14, `main` at `bff6cb85f6`.** To regenerate from a checkout:

```sh
pnpm parity:api --public-only   # "Public API" column: Rails public methods with a TS counterpart
pnpm parity:api                  # "All methods" column: public + protected + private
pnpm parity:test                 # "Rails tests" column: Rails test cases matched by a ported test
```

`parity:api` matches each Ruby method in the vendored Rails source
(`vendor/rails/v8.0.2`, plus the vendored gems) to a TypeScript method by name,
under the rules in [docs/ruby-ts-conventions.md](docs/ruby-ts-conventions.md).
`parity:test` matches each Rails test case to a ported test of the same name. A
matched test passes in CI or is counted as skipped.

| Package (parity row)                               | Public API            | All methods           | Rails tests           |
| -------------------------------------------------- | --------------------- | --------------------- | --------------------- |
| activerecord                                       | 5010 / 5119 (97.9%)   | 6980 / 6980 (100%)    | 8883 / 8900 (99.8%)   |
| activemodel                                        | 625 / 627 (99.7%)     | 821 / 821 (100%)      | 1037 / 1037 (100%)    |
| arel                                               | 783 / 784 (99.9%)     | 1052 / 1052 (100%)    | 739 / 739 (100%)      |
| activesupport                                      | 1659 / 1800 (92.2%)   | 2039 / 2187 (93.2%)   | 2995 / 3343 (89.6%)   |
| actionpack: ActionDispatch                         | 1243 / 1376 (90.3%)   | 1740 / 1801 (96.6%)   | 1279 / 1724 (74.2%)   |
| actionpack: ActionController                       | 545 / 604 (90.2%)     | 800 / 803 (99.6%)     | 1768 / 1949 (90.7%)   |
| actionpack: AbstractController                     | 97 / 114 (85.1%)      | 132 / 132 (100%)      | 52 / 52 (100%)        |
| actionview                                         | 904 / 1136 (79.6%)    | 1215 / 1482 (82.0%)   | 728 / 2579 (28.2%)    |
| trailties (railties)                               | 601 / 1221 (49.2%)    | 789 / 1660 (47.5%)    | 223 / 2419 (9.2%)     |
| rack                                               | 454 / 509 (89.2%)     | 539 / 584 (92.3%)     | 773 / 870 (88.9%)     |
| rack-session                                       | 50 / 60 (83.3%)       | 69 / 98 (70.4%)       | 58 / 124 (46.8%)      |
| rack-test                                          | 61 / 87 (70.1%)       | 105 / 108 (97.2%)     | 229 / 234 (97.9%)     |
| globalid                                           | 60 / 62 (96.8%)       | 89 / 91 (97.8%)       | 131 / 138 (94.9%)     |
| i18n                                               | 197 / 200 (98.5%)     | 287 / 289 (99.3%)     | 307 / 307 (100%)      |
| did-you-mean                                       | 6 / 6 (100%)          | 8 / 8 (100%)          | 6 / 6 (100%)          |
| date                                               | n/a (C extension)     | n/a                   | 137 / 137 (100%)      |
| bcrypt                                             | 16 / 16 (100%)        | 18 / 18 (100%)        | 39 / 39 (100%)        |
| msgpack                                            | 31 / 33 (93.9%)       | 34 / 34 (100%)        | 140 / 356 (39.3%)     |
| activejob                                          | 5 / 269 (1.9%)        | 5 / 369 (1.4%)        | 0 / 396 (0%)          |
| ruby-compat                                        | n/a (not a gem)       | n/a                   | 20 / 503 (4.0%)       |
| **Data layer** (activerecord + activemodel + arel) | 6418 / 6530 (98.3%)   | 8853 / 8853 (100%)    | 10659 / 10676 (99.8%) |
| **Overall**                                        | 12940 / 14852 (87.1%) | 17482 / 19511 (89.6%) | 19923 / 26643 (74.8%) |

The Overall row also counts the ported `thor`, `pg`, `mysql2` and `sqlite3`
gem rows, which `parity:api` reports separately. The activerecord row also counts the ported `sqlite3` gem internals the SQLite
adapter uses (229 / 298 public). Test support has its own row
(`activerecord-test-support`, 41 / 56 public).

Read the columns this way. API coverage says a method with the Rails name
exists. The fidelity gates in [CONTRIBUTING.md](CONTRIBUTING.md#measuring-progress)
(call sets, call arguments, parameter names, arity) say how closely its body
follows the Rails body. Test coverage is the better signal of what works. By
that measure the data layer, ActionController, Rack, i18n, globalid and date
are close to done, and ActionView and trailties are where most of the remaining
work is.

What the prose above means in practice:

- **ActiveRecord / ActiveModel / Arel.** Use them. Querying, associations
  (including `has_many :through`, HABTM, polymorphic and composite keys),
  validations, callbacks, enums, migrations, schema dump/load, transactions,
  encryption and fixtures are ported, with Rails' test suite as the
  specification. The deliberate differences are that everything touching the
  database is async, and that time values are Temporal.
- **Standalone ActiveRecord** (`ar`, no web stack) works for create / migrate /
  status / schema dump / runner / console / models dump.
- **Full stack** (`trails new`): generates an app that type-checks, then boots,
  migrates, routes, runs a console, renders TSE views with layouts, and serves
  from Vite in development. `generate scaffold` produces a working CRUD
  resource with passing tests, as the quickstart shows. A real app will still
  hit unported ActionView helpers and ActionController modules.

## Requirements

- **Node >= 24**, enforced by `engines`. The repo and a generated app pin
  `24.16.0` in `.node-version`.
- **pnpm**, through `corepack enable`. The repo pins `pnpm@12.3.4`.
- **TypeScript 7.1** for the workspace, pinned to the exact nightly
  `7.1.0-dev.20260920.1` that CI builds with. The pin moves to 7.1 stable when
  it ships (scheduled 2026-11-24). The packages that touch the compiler API use
  `typescript/unstable/*`, which carries no semver guarantee, so their ranges
  are the exact build they were verified against:

| package                         | `typescript`                                    | why                                                                                                               |
| ------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@blazetrails/trailties`        | optional peer, `7.1.0-dev.20260920.1`           | `./template-builder/testing`'s `parseTs()` uses `API#transpileModule`.                                            |
| `@blazetrails/activerecord-cli` | dependency, `7.1.0-dev.20260920.1`              | the `trails-tsc` typecheck bin runs on the 7.1 API.                                                               |
| `@blazetrails/trails-tsc`       | dependency, `typescript-5@npm:typescript@5.9.3` | it drives a programmatic `--build` and hosts a language-service plugin, neither of which TypeScript 7 offers yet. |

For `trailties` the peer is optional. Its runtime does not need the compiler,
only the subpath named above does. `trails-tsc`'s 5.9.3 is an
alias, so it never collides with a project's own `typescript`. Both retire when
TypeScript 7 ships a programmatic build API (RFC `0125-typescript-7-ground-floor`
in the tasks repo).

## Development

```sh
corepack enable
pnpm install
pnpm build                                   # tsc --build, ~10s cold
pnpm vitest run path/to/file.test.ts         # run the files you touched
```

Do not run the whole suite locally. CI runs it on every push, across all three
databases.

### Database backends

`ARCONN` picks the backend, naming a connection exactly as Rails'
`test/config.yml` does. Connection details come from separate environment
variables.

| Backend          | How to run locally                         | Connection settings                     |
| ---------------- | ------------------------------------------ | --------------------------------------- |
| SQLite (default) | `pnpm vitest run <file>`                   | (none)                                  |
| PostgreSQL       | `ARCONN=postgresql pnpm vitest run <file>` | `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` |
| MySQL/MariaDB    | `ARCONN=mysql2 pnpm vitest run <file>`     | `MYSQL_HOST` `MYSQL_PORT` `MYSQL_SOCK`  |

These are the keys Rails interpolates
(`vendor/rails/v8.0.2/activerecord/test/config.example.yml:12-20`), plus the
`PG*` set its `postgresql:` entries leave to libpq
(`config.example.yml:74-81`). Each has a working default (`localhost` and the
stock port), so a local server on default ports needs only `ARCONN`.
`ARCONN=sqlite3_mem` selects the pure `:memory:` lane.

The credential and database name are fixed, as in Rails: the harness connects
as `username: rails` with no password (`config.example.yml:4,24`) to
`activerecord_unittest` (`test/support/config.rb:28-34`). `docker compose up`
provisions that user for both PostgreSQL and MySQL, on `tmpfs` like the CI
service containers. The one addition with no Rails counterpart is
`AR_DB_SLOT`: trails runs parallel vitest workers and gives each an
`_N`-suffixed copy of the database.

## Contributing

trails is a port, and the bar is "would a Rails developer recognize this as the
same method", not "do the tests pass". The rules, the naming table and the
gates that enforce them are in:

- [CONTRIBUTING.md](CONTRIBUTING.md): working principles, the `@internal`
  convention, and how progress is measured.
- [CLAUDE.md](CLAUDE.md): the full rulebook (fidelity, deviation registers,
  the pre-PR gate sequence, and the language-shortcoming decisions ratified
  repo-wide).
- [docs/ruby-ts-conventions.md](docs/ruby-ts-conventions.md): the generated
  Ruby → TypeScript naming rules.

Work is tracked as RFCs and stories in the separate `tasks` repository. Pick
work with `pnpm tasks ready`, not from docs. The Rails source every port is
checked against is vendored at `vendor/rails/v8.0.2/` by `pnpm vendor:fetch`.

## Disclaimer

Trails is not affiliated with, endorsed by, or connected to Ruby on Rails or
the Rails Core team. Rails is an inspiration and a guiding light for this
project's API design, but Rails and its trademarks belong to their respective
owners.

## License

- Source code is licensed under the [MIT License](LICENSE).
- Hand-written documentation prose under `packages/website/docs/guides/` is
  licensed under [Creative Commons Attribution 4.0 International](LICENSE-docs)
  (CC BY 4.0). Code examples embedded in documentation remain MIT.

See [LICENSES.md](LICENSES.md) for the full split and rationale.
