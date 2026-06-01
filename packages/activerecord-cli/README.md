# @blazetrails/activerecord-cli

The trails counterpart to Rails' `bin/rails` CLI for ActiveRecord workflows.
Owns `ar init` / `ar new` / `ar generate:*` / `ar destroy:*` / `ar db:*` /
`ar console` / `ar runner` / `ar typecheck` / `ar schema:dump` / `ar models:dump`.
It is the tooling layer on top of `@blazetrails/activerecord`; the runtime
package carries no CLI dependency.

## Install

```sh
pnpm add -D @blazetrails/activerecord-cli   # tooling — dev dep
pnpm add @blazetrails/activerecord          # runtime — prod dep
pnpm add <driver>                           # one of: better-sqlite3 | pg | mysql2
```

`activerecord-cli` is a devDependency. `activerecord` is a runtime dependency.
Driver packages follow the same split (dev for SQLite in-memory testing, prod
for PG/MySQL server targets is the common pattern).

## Quickstart

```sh
ar new myapp --driver better-sqlite3
cd myapp
pnpm install
ar db:create
ar generate:migration AddUsers name:string email:string
# edit db/migrate/<ts>_add_users.ts
ar db:migrate
ar console
```

## Project layout

`ar init` (and `ar new`, which wraps it) writes:

| Path                  | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `config/database.ts`  | Connection config keyed by `TRAILS_ENV`                     |
| `db/migrate/`         | Timestamped migration files                                 |
| `db/seeds.ts`         | Seed data loaded by `ar db:seed`                            |
| `db/schema.ts`        | Schema snapshot written by `ar schema:dump`                 |
| `app/models/base.ts`  | Project `Base` subclass with `establishConnection()`        |
| `app/models/index.ts` | Generated manifest — re-exported model classes              |
| `db.ts`               | Two-line bootstrap: `establishConnection` + manifest import |
| `tsconfig.json`       | AR-required compiler settings (merged if one exists)        |
| `.gitignore`          | Ignores `node_modules/`, `dist/`, SQLite files              |

**`TRAILS_ENV`** (not `NODE_ENV`): the JS ecosystem treats `NODE_ENV` as a
build-time hint, so reusing it to select a database silently picks the wrong
environment in many setups. `ar` resolves `TRAILS_ENV → NODE_ENV → "development"`.

## Commands

### Scaffolding

| Command                                      | Description                                          |
| -------------------------------------------- | ---------------------------------------------------- |
| `ar new <app-name>`                          | Create directory + scaffold (does not run install)   |
| `ar init`                                    | Scaffold into the current directory                  |
| `ar generate:migration <Name> [field:type…]` | Emit `db/migrate/<ts>_<snake>.ts`                    |
| `ar generate:model <Name> [field:type…]`     | Emit model + create migration                        |
| `ar generate:manifest`                       | Scan `app/models/` and rewrite `app/models/index.ts` |
| `ar destroy:migration <Name>`                | Delete the matching migration file                   |
| `ar destroy:model <Name>`                    | Delete model + its create migration                  |

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

| Command                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| `ar typecheck`         | Type-check models via `trails-tsc`                               |
| `ar schema:dump`       | Dump current schema via `trails-schema-dump`                     |
| `ar models:dump`       | Dump model metadata via `trails-models-dump`                     |
| `ar generate:manifest` | Regenerate `app/models/index.ts` (also listed under Scaffolding) |

Pass `--help` to any command for its full option set.

## Registration: the generated manifest

Rails uses Zeitwerk + Ruby's `inherited` hook to auto-register model classes at
load time. TypeScript has no equivalent hook for ES modules. The solution is a
generated barrel:

```ts
// app/models/index.ts  (generated — do not edit by hand)
export { User } from "./user.js";
export { Post } from "./post.js";
export { Comment } from "./comment.js";
```

Importing this file as a side-effect registers every model with ActiveRecord's
inheritance tracker. `ar generate:manifest` keeps it current whenever you add
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

The two-line bootstrap every project puts in `db.ts`:

```ts
import Base from "./app/models/base.js";
import "./app/models/index.js"; // side-effect: registers all models

await Base.establishConnection();
```

`establishConnection()` reads `config/database.ts`, picks the entry for
`TRAILS_ENV` (falling back to `NODE_ENV`, then `"development"`), and opens the
connection pool. The manifest import must happen before any AR query so models
are registered in the inheritance tracker.

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

- **Lazy async reflection (`ensureSchemaLoaded`).** The query and persistence
  path awaits a one-shot schema-load gate, so most consumers do not need to
  call `loadSchema()` explicitly. Residual edge: accessing attributes on `new
Model()` before any query has fired will find an empty attribute set. This is
  accepted — the common path is always query-first.

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

- **Driver selection at scaffold time.** `--driver` writes the correct adapter
  key into `config/database.ts` and the correct devDependency into
  `package.json` so `pnpm install` pulls the right native module.

## Testing

The package has unit tests co-located with source files (`*.test.ts`) and
end-to-end suites under `src/__e2e__/` covering the happy path for each
supported driver:

- `src/__e2e__/sqlite-happy-path.test.ts`
- `src/__e2e__/postgres-happy-path.test.ts`
- `src/__e2e__/mysql-happy-path.test.ts`

E2E suites exercise `ar init → ar db:migrate → ar db:version` against a real
database in a temp directory. They run in CI under the `activerecord-cli` job
matrix (sqlite / postgres / mysql).

## Versioning / stability

Pre-release. Command names, option flags, and programmatic API surface are
still evolving. No backwards-compatibility promises before 1.0.
