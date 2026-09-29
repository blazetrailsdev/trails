# @blazetrails/activerecord-cli

The `ar` CLI, for using `@blazetrails/activerecord` without the rest of trails.
It plays the part of the `rails db:*` / `rails generate` tasks for a
standalone ActiveRecord project: `ar new` / `ar init` / `ar generate:*` /
`ar destroy:*` / `ar db:*` / `ar console` / `ar runner` / `ar typecheck` /
`ar models:dump`. It also ships the `trails-tsc` binary, the schema-aware `tsc`
that types models from `db/schema.ts`.

It is the tooling layer on top of `@blazetrails/activerecord`. The runtime
package carries no CLI dependency. A full trails application (`trails new`)
does not need this package's commands. It uses `bin/trails db ...` and
`bin/trails generate ...`, and takes only `trails-tsc` from here.

## Install

None of the `@blazetrails/*` packages is on npm yet. Build them from a checkout
and link them into your project, as the
[root README's quickstart](../../README.md#quickstart) shows. Once published,
the split will be:

```sh
pnpm add -D @blazetrails/activerecord-cli   # tooling: dev dependency
pnpm add @blazetrails/activerecord          # runtime: prod dependency
pnpm add <driver>                           # one of: better-sqlite3 | pg | mysql2
```

## Quickstart

Verified on 2026-09-28 (`main` at `45a00eb2aa`, Node 24.16.0, SQLite), with
the packages linked from a checkout, and with no `TRAILS_ENV` or `NODE_ENV`
set:

```sh
ar new shop --driver better-sqlite3
cd shop
pnpm install
npx ar db:create
npx ar generate:model Product name:string price:integer
pnpm migrate
npx ar db:migrate:status
npx ar generate:manifest
npx ar db:schema:dump
```

```text
Created database '.../shop/db/development.sqlite3'
  create  .../shop/app/models/product.ts
  create  .../shop/db/migrate/20260928195115_create_products.ts
== 20260928195115 CreateProducts: migrating ===================================
-- createTable("products")
   -> 0.0100s
== 20260928195115 CreateProducts: migrated (0.0110s) ==========================
database: .../shop/db/development.sqlite3
 Status   Migration ID    Migration Name
--------------------------------------------------
   up     20260928195115  Create products
  write   .../shop/app/models/index.ts
Dumped schema to .../shop/db/schema.ts
```

Commands that load app code (`console`, `runner`, `db:migrate`, `db:seed`)
must run under the `tsx` loader, because models import each other with `.js`
specifiers. The generated `package.json` scripts do this: `pnpm migrate`,
`pnpm seed`, `pnpm console`, `pnpm runner <script.ts>`, or `pnpm ar <command>`
for any other command.

```ts
// try-runner.ts
import { Product } from "./app/models/index.js";

const p = await Product.createBang({ name: "Gadget", price: 7 });
console.log(p.id, await Product.count(), Product.where({ price: 7 }).toSql());
```

```sh
pnpm runner try-runner.ts
```

```text
1 1 SELECT "products".* FROM "products" WHERE "products"."price" = 7
```

For code that runs outside `ar` (a server, a worker), the generated `db.ts`
exports `connect()`, described under [Bootstrap](#bootstrap). One known gap:
it needs `TRAILS_ENV` set. With it unset, `connect()` resolves `default_env`
instead of `development`, because unlike the `ar` commands it does not default
`TRAILS_ENV` (story `generated-db-ts-connect-resolves-default-env`).

`ar typecheck` runs `trails-tsc`, but a fresh project fails it: the project
has no `@types/node`, so `import.meta.dirname` in `db.ts` does not type-check
(story `ar-new-project-fails-its-own-typecheck`).

## Project layout

`ar new <name>` creates the directory and runs `ar init` in it. `ar init`
writes:

| Path                  | Purpose                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `package.json`        | `ar` / `migrate` / `seed` / `console` / `runner` scripts (through `tsx`), the driver dependency |
| `tsconfig.json`       | AR-required compiler settings (merged if one exists)                                            |
| `config/database.ts`  | Connection config keyed by environment, like Rails' `config/database.yml`                       |
| `db/migrate/`         | Timestamped migration files                                                                     |
| `db/seeds.ts`         | Seed data loaded by `ar db:seed`                                                                |
| `app/models/index.ts` | Generated manifest that registers every model class                                             |
| `db.ts`               | A `connect()` helper for code that runs outside `ar`                                            |
| `.gitignore`          | Ignores `node_modules/`, `dist/`, SQLite files                                                  |

`ar db:schema:dump` later writes `db/schema.ts`, and `ar generate:model` writes
`app/models/<name>.ts`.

**`TRAILS_ENV`, not `NODE_ENV`.** The JS ecosystem treats `NODE_ENV` as a
build-time hint, so reusing it to select a database silently picks the wrong
environment in many setups. `ar` reads `TRAILS_ENV` first, then `NODE_ENV`,
then falls back to `development`.

## Commands

### Scaffolding

| Command                                      | Description                                                |
| -------------------------------------------- | ---------------------------------------------------------- |
| `ar new <app-name>`                          | Create directory + scaffold (does not run install)         |
| `ar init`                                    | Scaffold into the current directory                        |
| `ar generate:migration <Name> [field:type…]` | Emit `db/migrate/<ts>_<snake>.ts`                          |
| `ar generate:model <Name> [field:type…]`     | Emit model (with a `declare` per field) + create migration |
| `ar generate:manifest`                       | Scan `app/models/` and rewrite `app/models/index.ts`       |
| `ar destroy:migration <Name>`                | Delete the matching migration file                         |
| `ar destroy:model <Name>`                    | Delete model + its create migration                        |

### Database

| Command                             | Description                                           |
| ----------------------------------- | ----------------------------------------------------- |
| `ar db:create`                      | Create the database for the current `TRAILS_ENV`      |
| `ar db:drop`                        | Drop the database (production-protected)              |
| `ar db:migrate`                     | Run pending migrations                                |
| `ar db:rollback`                    | Roll back the last migration (`--step N` for N)       |
| `ar db:migrate:status`              | Show up/down status for each migration                |
| `ar db:version`                     | Print the current schema version                      |
| `ar db:seed`                        | Run `db/seeds.ts`                                     |
| `ar db:schema:dump`                 | Dump the current database schema to `db/schema.ts`    |
| `ar db:schema:load`                 | Load `db/schema.ts` into the database                 |
| `ar db:setup`                       | `db:create` + `db:schema:load` + `db:seed`            |
| `ar db:reset`                       | `db:drop` + `db:setup`                                |
| `ar db:prepare`                     | Idempotent setup — create if missing, migrate, seed   |
| `ar db:abort_if_pending_migrations` | Exit 1 if any migration is pending (pre-deploy check) |

### Runtime

| Command              | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| `ar console`         | REPL with `Base` + all models pre-loaded (prompt: `trails> `) |
| `ar runner <script>` | Run a script with models registered and connection open       |

### Tooling

| Command                | Description                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ar typecheck`         | Type-check models via `trails-tsc`                                                                                                                                              |
| `ar models:dump`       | Emit one model class per table in `db/schema.ts`, with `belongsTo` / `hasMany` from foreign keys. `--schema`, `--out`, `--only`, `--ignore`, `--strip-prefix`, `--strip-suffix` |
| `ar generate:manifest` | Regenerate `app/models/index.ts` (also listed under Scaffolding)                                                                                                                |

Pass `--help` to any command for its full option set.

## Registration: the generated manifest

Rails uses Zeitwerk + Ruby's `inherited` hook to auto-register model classes at
load time. TypeScript has no equivalent hook for ES modules. The solution is a
generated barrel:

```ts
// app/models/index.ts, as `ar generate:manifest` wrote it for the quickstart
// AUTO-GENERATED by @blazetrails/activerecord-cli. Do not edit by hand.
// Re-run `ar generate:manifest` (or `ar init`) to update.
import { registerModel } from "@blazetrails/activerecord";
import { Product } from "./product.js";

export const models = [Product] as const;
for (const m of models) registerModel(m);

export { Product };
```

Importing this file registers every model with ActiveRecord, so that
string class names in associations (`className:`, `through:`) resolve. `ar generate:manifest` keeps it current whenever you add
or remove a model file. Run it after any model change, or in CI with `--check`
to catch drift:

```sh
ar generate:manifest --check   # exits 1 if index.ts is out of date
```

The optional ESLint rule `blazetrails/manifest-complete` enforces the same
check at lint time.

## Programmatic API

```ts
import {
  init, // scaffold a project directory
  scanModels, // scan a directory for model exports
  renderManifest, // render an index.ts string from ModelEntry[]
  buildManifest, // scan + render in one step
  generateManifest, // scan + render + write to disk
  run, // dispatch an argv array (the CLI entry point)
  checkPendingMigrations, // resolve pending migrations for the current env
} from "@blazetrails/activerecord-cli";
```

**`checkPendingMigrations(cwd?: string): Promise<MigrationProxy[]>`**

Loads `config/database.ts` and the migration registry from `cwd` (defaults to
`process.cwd()`), connects to the primary database, and returns the list of
migrations that have not yet been applied. Returns `[]` when all migrations are
up to date. Suitable for pre-request or pre-deploy checks without shelling out
to `ar db:abort_if_pending_migrations`.

```ts
import { checkPendingMigrations } from "@blazetrails/activerecord-cli";

const pending = await checkPendingMigrations();
if (pending.length > 0) {
  throw new Error(`${pending.length} pending migrations — run ar db:migrate`);
}
```

## Bootstrap

`ar init` writes a `db.ts` with a `connect()` helper:

```ts
import { Base, DatabaseTasks } from "@blazetrails/activerecord";
import { loadDatabaseConfig } from "@blazetrails/activerecord-cli";
import { models } from "./app/models/index.js";

let connected = false;

export async function connect(): Promise<void> {
  if (connected) return;
  await loadDatabaseConfig(import.meta.dirname);
  await Base.establishConnection(`:${DatabaseTasks.env}`);
  await Promise.all(models.map((m) => m.loadSchema()));
  connected = true;
}
```

`loadDatabaseConfig` reads `config/database.ts` into `Base.configurations`, the
way Rails' railtie loads `config/database.yml`, and resolves `DatabaseTasks.env`:
`TRAILS_ENV` (or `NODE_ENV`), or `"development"` when neither is set, which is
`Rails.env`'s default. `establishConnection` with that env name raises
`AdapterNotSpecified` when the config has no entry for it. A bare
`Base.establishConnection()` resolves `DEFAULT_ENV` instead, which is
`default_env` when both vars are unset, as in Rails. In the quickstart project,
with `TRAILS_ENV` and `NODE_ENV` unset, this script printed `2`:

```ts
import { connect } from "./db.js";
import { Product } from "./app/models/index.js";

await connect();
await Product.createBang({ name: "Widget", price: 5 });
console.log(await Product.count());
```

## Architecture / design choices

- **Generated manifest, not autoload.** ES module loading is static and
  asynchronous — there is no reliable runtime hook equivalent to Ruby's
  `inherited`. A generated barrel is deterministic, tree-shakeable, and
  auditable via `--check`.

- **`TRAILS_ENV`, not `NODE_ENV`.** `NODE_ENV` is a build-time optimization
  flag in the JS ecosystem (tree-shaking, minification). Using it to pick a
  database connection silently selects the wrong environment when bundlers or
  test runners override it. `TRAILS_ENV` is explicit and unambiguous.

- **Runtime / tooling split.** `@blazetrails/activerecord` is a pure runtime
  package with no CLI dependency. `@blazetrails/activerecord-cli` owns all
  tooling (codegen, schema introspection, REPL, type-checker delegation). This
  split prevents the CLI and its dependencies (TypeScript compiler API, node
  readline, etc.) from landing in production bundles.

- **Lazy async reflection (`ensureSchemaLoaded`).** The class-level query and
  persistence paths await a one-shot schema-load gate, so most consumers do not
  need to call `loadSchema()` explicitly. Association creates reflect their
  target the same way. One edge remains, and it is accepted: attributes on
  `new Model()` before any query has fired read an empty attribute set, since
  the common path is query-first.

- **`_abstractClass` as per-class own-property.** Rails sets
  `self.abstract_class = true` on the declaring class, not on a shared
  prototype. The TS port mirrors this with a static own-property so subclasses
  do not inherit the flag — Rails parity.

- **`ar new` does not run `pnpm install` or `git init`.** These are
  side-effects the user controls. The command prints the next-step commands
  instead of running them.

- **`ar init` merges `tsconfig.json`, never overwrites.** Required compiler
  settings are merged JSONC-aware; conflicting keys are preserved and reported
  as warnings. Pass `--force` to overwrite.

- **`db:abort_if_pending_migrations` for deploy gates.** Designed as a
  zero-dependency pre-deploy health check — connects, checks, prints, exits.
  No application server needs to be running.

- **Driver selection at scaffold time.** `--driver` writes the adapter key
  into `config/database.ts` and the driver into `package.json`'s
  `dependencies`, so `pnpm install` pulls the right native module.

## Testing

The package has unit tests co-located with source files (`*.test.ts`) and
end-to-end suites under `src/__e2e__/` covering the happy path for each
supported driver:

- `src/__e2e__/sqlite-happy-path.test.ts`
- `src/__e2e__/postgres-happy-path.test.ts`
- `src/__e2e__/mysql-happy-path.test.ts`

E2E suites exercise `ar init → ar db:migrate → ar db:version` against a real
database in a temp directory, and CI runs them against SQLite, PostgreSQL and
MySQL. The SQLite suite also runs `db:create` → `db:migrate` with `TRAILS_ENV`
and `NODE_ENV` unset, to pin the `development` default.

## Versioning / stability

Pre-release. Command names, option flags, and programmatic API surface are
still evolving. No backwards-compatibility promises before 1.0.
