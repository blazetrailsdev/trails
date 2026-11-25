# Twitter clone — an API-only trails app

A minimal Twitter/X clone laid out as `trails new twitter-clone --api --minimal`
generates it: `bin/trails`, `config/`, and `app/models` + `app/controllers`
loaded by Zeitwerk, run on Node's native type stripping (no `tsx`, no build
step before boot).

It exercises the parts of trails you reach for first:

- **Migrations** — timestamped files in `db/migrate/`, each a
  `Migration.get(8.0)` subclass with a reversible `change()`, run by
  `bin/trails db:migrate` / `db:rollback` / `db:setup`.
- **Models** — `class X extends ApplicationRecord` with `belongsTo`,
  `hasMany`, `hasMany … through:` (self-referential follows), scopes and
  validations (`app/models/`).
- **Controllers and routes** — `ActionController::API` controllers
  (`app/controllers/`) behind nested `resources` (`config/routes.ts`).
- **Error mapping** — `rescueFrom` in `ApplicationController`:
  `RecordNotFound` → 404, `RecordInvalid` → 422, `RecordNotUnique` → 409,
  malformed JSON → 400.

## Run it

Build the workspace once from the repo root (`pnpm build`). Then, from this
directory:

```sh
bin/trails db:setup     # create the database, load the schema, seed it
bin/trails server       # or `pnpm dev`; serves on :3000
pnpm test               # vitest: model smoke + HTTP integration tests
pnpm build              # schema-driven type-check via trails-tsc
```

Connection settings live in `config/database.ts`, keyed by environment;
`TRAILS_ENV` (default `development`) picks the entry. Each environment is a
SQLite file under `storage/`.

### Deploy

```sh
pnpm install --frozen-lockfile
bin/trails build        # write the Zeitwerk autoload manifests to .trails/autoload
TRAILS_ENV=production bin/trails db:prepare
TRAILS_ENV=production bin/trails server
```

An API-only app has no asset pipeline, so there is no `assets:precompile`
step, exactly as the generated `--api` Dockerfile omits it.

## Database tasks

| Command                        | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `bin/trails db:create`         | Create the database                          |
| `bin/trails db:drop`           | Delete the database                          |
| `bin/trails db:migrate`        | Run pending migrations, dump `db/schema.ts`  |
| `bin/trails db:rollback`       | Roll back the last migration (`STEP=n`)      |
| `bin/trails db:migrate:status` | Show each migration's `up`/`down` state      |
| `bin/trails db:seed`           | Load `db/seeds.ts`                           |
| `bin/trails db:setup`          | `create` + `schema:load` + `seed`            |
| `bin/trails db:prepare`        | Create if needed, migrate, seed when created |
| `bin/trails db:reset`          | `drop` + `setup`                             |

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
| `GET  /up`                           | Health check                                     |

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

The models are Rails-style static blocks with no `declare` fields and no
`this.attribute(...)` calls. Their attributes come from the schema:

- **Types:** [`trails-tsc`](../../README.md#zero-declare-models--trails-tsc)
  reads `db/schema.ts` (the `--schema` flag in the `build` script) and injects
  a `declare` member per column, plus association proxies and scope readers.
  `bin/trails db:migrate` rewrites `db/schema.ts`; commit it, as Rails
  apps commit `schema.rb`.
- **Runtime:** the columns are reflected from the live database, as Rails
  does.

Plain `tsc` cannot type these files; `pnpm build` can. The runtime is
unaffected either way.
