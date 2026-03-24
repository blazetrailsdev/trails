# CLI: Road to Feature Parity

Goal: `rails-ts` CLI can do everything `rails` CLI does for ActiveRecord workflows --
generate models/migrations, run migrations against a real database, drop into a
console with models loaded, and manage the database lifecycle.

## Current state

The CLI exists at `packages/cli` and has command stubs for most Rails commands.
Generators produce real files. Database commands connect to a real database via
`config/database.ts`, track migration state in `schema_migrations`, and support
migrate, rollback, and status. The console doesn't yet connect to a database.

### What works today

| Command                                                | Status                                           | Notes                                       |
| ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------- |
| `rails-ts new <name>`                                  | Generates project skeleton                       | Supports `--database sqlite/postgres/mysql` |
| `rails-ts generate model`                              | Generates model + migration + test               | Infers `createTable` from name              |
| `rails-ts generate migration`                          | Generates migration file with `version` property | Infers add/remove columns from name         |
| `rails-ts generate controller`                         | Generates controller + test                      |                                             |
| `rails-ts generate scaffold`                           | Generates model + controller + migration + tests |                                             |
| `rails-ts destroy model/controller/migration/scaffold` | Removes generated files                          |                                             |
| `rails-ts server`                                      | Starts dev server                                | Uses `DevServer`                            |
| `rails-ts routes`                                      | Prints route table                               | Requires `src/config/routes.ts`             |
| `rails-ts console`                                     | Opens REPL                                       | Tries to load models from `src/app/models/` |
| `rails-ts db migrate`                                  | Runs pending migrations                          | Tracks state in `schema_migrations`         |
| `rails-ts db migrate --version V`                      | Migrates to a specific version                   |                                             |
| `rails-ts db rollback`                                 | Rolls back last migration                        | Supports `--step N`                         |
| `rails-ts db migrate:status`                           | Shows up/down status per migration               | Reads from `schema_migrations` table        |
| `rails-ts db create`                                   | Creates the database                             | SQLite: creates file; PG/MySQL: CREATE DB   |
| `rails-ts db drop`                                     | Drops the database                               | SQLite: deletes file; PG/MySQL: DROP DB     |
| `rails-ts db seed`                                     | Runs `db/seeds.ts` or `db/seeds.js`              | Establishes DB connection first             |

### What's still needed

| Command                    | Problem                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `rails-ts console`         | No database connection. Models load but can't query.               |
| `rails-ts db reset`        | Not implemented. Should be `drop` + `create` + `migrate` + `seed`. |
| `rails-ts db setup`        | Not implemented. Should be `create` + `migrate` + `seed`.          |
| `rails-ts db schema:dump`  | Not implemented. `SchemaDumper` exists but isn't wired to CLI.     |
| `rails-ts db schema:load`  | Not implemented.                                                   |
| `rails-ts db migrate:redo` | Not implemented. Should be rollback + migrate.                     |

## Architecture

### Database connection

The CLI loads database config and creates adapters through two functions in
`packages/cli/src/database.ts`:

- **`loadDatabaseConfig(env?, cwd?)`** -- Dynamically imports the database
  config from the project root. Searches for `config/database.ts`,
  `config/database.js`, `src/config/database.ts`, or `src/config/database.js`
  (in that order). Both TypeScript and JavaScript configs are supported.
  Resolves environment from `RAILS_TS_ENV` > `NODE_ENV` > `"development"`.
- **`connectAdapter(config)`** -- Creates the right adapter instance based on
  `config.adapter`: `"sqlite3"` -> `SqliteAdapter`, `"postgresql"` ->
  `PostgresAdapter`, `"mysql2"` -> `MysqlAdapter`. Supports both connection
  params and URL-based config.

### Migration discovery

`packages/cli/src/migration-loader.ts` provides `discoverMigrations(dir)`:

- Reads `db/migrations/` and matches `{timestamp}-{name}.ts` or `.js` files
- When both `.ts` and `.js` exist for the same migration, `.ts` wins (source of truth)
- Extracts version from the filename prefix
- Returns `MigrationProxy[]` compatible with the `Migrator` class
- Lazily imports migration files only when actually running them
- `.ts` imports require a TypeScript loader at runtime (e.g., run via `npx tsx`)

### Migration execution

The CLI uses the `Migrator` class from `@rails-ts/activerecord` (not the
simpler `MigrationRunner`). `Migrator` handles:

- State tracking via `schema_migrations` table
- Duplicate version/name detection
- Ordered up/down execution
- Rollback by N steps
- Status reporting (up/down per migration)

## What needs to be built

### Phase 1: Console with database connection

- Load database config and connect before starting REPL.
- Import and register all models from `src/app/models/`.
- Set the adapter on Base so queries work.
- Models should be available as globals in the REPL (e.g., `User.all()`).

### Phase 2: Schema management

- **`db:schema:dump`** -- Dump current schema to `db/schema.ts` (or `.sql`).
  Needs `SchemaDumper` which is partially implemented.
- **`db:schema:load`** -- Load schema from dump file instead of running all
  migrations. Faster for fresh setups.
- **`db:migrate:redo`** -- Rollback + migrate (useful for testing a migration).

### Phase 3: Composite commands

- **`db:reset`** -- `db:drop` + `db:create` + `db:migrate` + `db:seed`.
- **`db:setup`** -- `db:create` + `db:migrate` + `db:seed` (skip if exists).

### Phase 4: Additional generators

- **`generate migration` improvements** -- Support `AddIndexToUsers name:index`,
  `references` type, `belongs_to` shorthand.
- **`generate model` improvements** -- Support `--no-migration`, `--no-test`,
  association declarations.

## Migration file convention

Generated migrations look like:

```ts
import { Migration } from "@rails-ts/activerecord";

export class CreateUsers extends Migration {
  version = "20260318120000";

  async up(): Promise<void> {
    await this.createTable("users", (t) => {
      t.string("name");
      t.string("email");
      t.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.dropTable("users");
  }
}
```

The `version` is the timestamp prefix from the filename. The `Migrator` uses
filename-parsed versions for tracking, so the `version` property is
belt-and-suspenders.

## Database config convention

```
my-app/
  config/
    database.ts        # connection config per environment
  db/
    migrations/        # timestamped migration files
    seeds.ts           # seed data
    schema.ts          # schema dump (auto-generated)
    development.sqlite3  # SQLite database file
```
