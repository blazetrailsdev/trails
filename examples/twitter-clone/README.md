# Twitter clone — Express + ActiveRecord

A minimal Twitter/X clone showing how to use
[`@blazetrails/activerecord`](../../packages/activerecord) — the TypeScript
port of Rails' ActiveRecord — inside an [Express](https://expressjs.com/) app.

It exercises the parts of ActiveRecord you reach for first:

- **Migrations** — timestamped files in `db/migrate/`, each a `Migration`
  subclass with a reversible `change()`, run through a Rails-style
  `db:migrate` / `db:rollback` / `db:setup` CLI (`src/cli.ts`).
- **Models** — `class X extends Base` with `belongsTo`, `hasMany`,
  `hasMany … through:` (self-referential follows!), scopes, and validations
  (`src/models/`).
- **Querying** — `findByBang`, `where`, `order`, `includes` (eager loading),
  `limit`, scopes, association proxies (`user.tweets.createBang(...)`), and
  `count`.
- **Error mapping** — `RecordNotFound` → 404, `RecordInvalid` → 422 (`app.ts`).

## Run it

From the repo root the packages must be built once (the example imports the
compiled `dist/`):

```sh
pnpm --filter @blazetrails/activerecord... build
```

Then, from this directory:

```sh
pnpm install          # if you haven't already at the workspace root
pnpm db:setup         # create the database, run migrations, load seeds
pnpm typecheck        # schema-driven type-check via trails-tsc (see below)
pnpm start            # boots the HTTP server on :3000
```

`pnpm smoke` runs the whole flow end-to-end with no HTTP and no setup needed.
It runs as `TRAILS_ENV=test`, which the config below maps to an in-memory DB,
and migrates it from scratch.

### Connection config

All connection settings live in **`config/database.ts`** — the single
source of truth, like Rails' `config/database.yml`. It's keyed by
environment; `TRAILS_ENV` (default `development`) picks the entry, and
`Base.establishConnection()` reads the file with no arguments (see
`src/db.ts`, which contains no config of its own):

```ts
const config = {
  development: { adapter: "sqlite3", database: "db/development.sqlite3", pool: 5 },
  test: { adapter: "sqlite3", database: ":memory:", pool: 1 },
  production: { adapter: "sqlite3", database: "db/production.sqlite3", pool: 5 },
};
export default config;
```

To use Postgres or MySQL, edit this file (e.g.
`{ adapter: "postgresql", database: "twitter", host: "localhost" }`) —
the model code is adapter-agnostic, exactly like Rails.

> We key on `TRAILS_ENV`, not `NODE_ENV`: the JS ecosystem treats `NODE_ENV`
> as a build-time hint, so reusing it to select a database silently picks the
> wrong one in many setups. `NODE_ENV` is honored only as a fallback. This is
> the convention documented in [`packages/activerecord-cli/README.md`](../../packages/activerecord-cli/README.md).

## Database tasks

A small `rails db:*`-style runner (`src/cli.ts`) wraps ActiveRecord's
`Migration` / `MigrationRunner`:

| Command                  | Description                                   |
| ------------------------ | --------------------------------------------- |
| `pnpm db:create`         | Create the database                           |
| `pnpm db:drop`           | Delete the database                           |
| `pnpm db:migrate`        | Run pending migrations, then dump the schema  |
| `pnpm db:rollback [n]`   | Roll back the last `n` migrations (default 1) |
| `pnpm db:migrate:status` | Show each migration's `up`/`down` state       |
| `pnpm db:seed`           | Load `db/seeds.ts`                            |
| `pnpm db:schema:dump`    | Regenerate `db/schema-columns.json`           |
| `pnpm db:setup`          | `create` + `migrate` + `seed`                 |
| `pnpm db:prepare`        | Create if needed, migrate, seed when empty    |
| `pnpm db:reset`          | `drop` + `setup`                              |

Migrations live in `db/migrate/<YYYYMMDDHHMMSS>_<name>.ts`:

```ts
import { Migration } from "@blazetrails/activerecord";

export default class CreateUsers extends Migration {
  async change() {
    await this.createTable("users", (t) => {
      t.string("handle");
      t.string("display_name");
      t.string("bio");
      t.timestamps();
    });
  }
}
```

The 14-digit filename prefix is the version recorded in `schema_migrations`.
`change()` is reversible, so `db:rollback` drops the table automatically.
Like Rails refusing to boot with pending migrations, `pnpm start` exits with
a hint to run `db:migrate` if any migration is unapplied.

## API

| Method & path                        | Description                                      |
| ------------------------------------ | ------------------------------------------------ |
| `POST /users`                        | Create a user (`handle`, `display_name`, `bio?`) |
| `GET  /users/:handle`                | Profile + follower/following counts              |
| `POST /users/:handle/tweets`         | Post a tweet (`body`)                            |
| `GET  /users/:handle/tweets`         | A user's tweets, newest first                    |
| `GET  /users/:handle/timeline`       | Tweets from everyone they follow                 |
| `POST /users/:handle/follow/:target` | Follow another user                              |
| `POST /tweets/:id/like`              | Like a tweet (`handle` in body)                  |

### Example session

```sh
curl -X POST localhost:3000/users -H 'content-type: application/json' \
  -d '{"handle":"alice","display_name":"Alice"}'
curl -X POST localhost:3000/users -H 'content-type: application/json' \
  -d '{"handle":"bob","display_name":"Bob"}'
curl -X POST localhost:3000/users/bob/tweets -H 'content-type: application/json' \
  -d '{"body":"hello from bob"}'
curl -X POST localhost:3000/users/alice/follow/bob
curl localhost:3000/users/alice/timeline
# [{"id":1,"body":"hello from bob","author":"bob","created_at":"..."}]
```

## Zero-declare, schema-driven models via `trails-tsc`

The models in `src/models/` are pure Rails-style static blocks — **no
`declare` fields, no `this.attribute(...)` calls, no `import type { Tweet }`
lines.** Just associations, scopes, and validations:

```ts
export class User extends Base {
  static {
    this.hasMany("tweets", { dependent: "destroy" });
    this.hasMany("following", { through: "activeFollows", source: "followee", className: "User" });
    this.validates("handle", { presence: true });
    this.validatesUniqueness("handle");
  }
}
```

Where do the attributes (`user.handle`, `tweet.body`, `created_at`, …) come
from? The **schema** — exactly like Rails, which reads them from the DB at
boot:

- **Types:** [`trails-tsc`](../../README.md#zero-declare-models--trails-tsc),
  a drop-in `tsc` replacement, reads `db/schema-columns.json` (the
  `--schema` flag in the `typecheck` script) and injects a `declare` member
  per column, plus association proxies (`user.tweets`), scope readers
  (`Tweet.recent()`), and target imports. `pnpm db:migrate` regenerates the
  JSON automatically (or run `pnpm db:schema:dump`), just as Rails rewrites
  `schema.rb` after migrating. In a real app you'd instead run
  `trails-schema-dump --out db/schema-columns.json` against your live DB.
- **Runtime:** `loadModelSchemas()` (in `src/db.ts`) calls `Model.loadSchema()`
  for each model after connecting, reflecting the columns off the live
  database. (Rails does this lazily on first use; we warm it eagerly so the
  first request is ready.)

Plain `tsc` **cannot** type these files — every attribute, association, and
scope comes back as `unknown`. That's the whole point: try
`pnpm exec tsc --noEmit` and watch it fail, then `pnpm typecheck` and watch
`trails-tsc` pass. The runtime (`tsx`) is unaffected either way.

> The activerecord package's `dx-tests/declare-patterns.test-d.ts` documents
> the manual `declare` + `this.attribute` escape hatch, for when you'd rather
> run with a stock `tsc` toolchain instead of `trails-tsc`.
