# CLI: Road to Feature Parity

Goal: `rails-ts` CLI can do everything `rails` CLI does for ActiveRecord workflows --
generate models/migrations, run migrations against a real database, drop into a
console with models loaded, and manage the database lifecycle.

## Current state

The CLI exists at `packages/cli` and has command stubs for most Rails commands.
Generators produce real files. But the database commands are fake -- `db:migrate`
doesn't track state, `db:create`/`db:drop` are no-ops, and the console doesn't
connect to a database.

### What works today

| Command                                                | Status                                           | Notes                                       |
| ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------- |
| `rails-ts new <name>`                                  | Generates project skeleton                       | Supports `--database sqlite/postgres/mysql` |
| `rails-ts generate model`                              | Generates model + migration + test               | Infers `createTable` from name              |
| `rails-ts generate migration`                          | Generates migration file                         | Infers add/remove columns from name         |
| `rails-ts generate controller`                         | Generates controller + test                      |                                             |
| `rails-ts generate scaffold`                           | Generates model + controller + migration + tests |                                             |
| `rails-ts destroy model/controller/migration/scaffold` | Removes generated files                          |                                             |
| `rails-ts server`                                      | Starts dev server                                | Uses `DevServer`                            |
| `rails-ts routes`                                      | Prints route table                               | Requires `src/config/routes.ts`             |
| `rails-ts console`                                     | Opens REPL                                       | Tries to load models from `src/app/models/` |

### What's broken or stubbed

| Command                      | Problem                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `rails-ts db:migrate`        | Doesn't use `MigrationRunner` -- just imports files and calls `.up()`. No `schema_migrations` tracking, reruns everything every time. |
| `rails-ts db:rollback`       | Picks last file alphabetically and calls `.down()`. Doesn't check what's actually applied.                                            |
| `rails-ts db:migrate:status` | Shows all migrations as "up" without checking the database.                                                                           |
| `rails-ts db:create`         | No-op (just prints "Database created.")                                                                                               |
| `rails-ts db:drop`           | No-op (just prints "Database dropped.")                                                                                               |
| `rails-ts db:seed`           | Imports `db/seeds.ts` but no database connection is established first.                                                                |
| `rails-ts console`           | No database connection. Models load but can't query.                                                                                  |

## What needs to be built

### Phase 1: Database config and connection

**The critical missing piece.** Nothing else works without this.

- **`config/database.ts`** (or `.json`/`.yml`) -- Define database connection per
  environment (development, test, production). Equivalent to Rails'
  `config/database.yml`.
  ```ts
  export default {
    development: {
      adapter: "sqlite",
      database: "db/development.sqlite3",
    },
    test: {
      adapter: "sqlite",
      database: "db/test.sqlite3",
    },
    production: {
      adapter: "postgres",
      url: process.env.DATABASE_URL,
    },
  };
  ```
- **`loadDatabaseConfig(env)`** -- Read the config, resolve environment, return
  connection params.
- **`connectAdapter(config)`** -- Instantiate the right adapter
  (SqliteAdapter/PostgresAdapter/MysqlAdapter) from config.
- **`RAILS_TS_ENV` / `NODE_ENV`** -- Environment detection, defaulting to
  "development".

### Phase 2: Wire db:migrate to MigrationRunner

`MigrationRunner` already exists in `activerecord/src/migration-runner.ts` and
handles schema_migrations tracking, pending detection, and ordered rollback.
The CLI just needs to use it.

- **`db:migrate`** -- Load config, connect adapter, discover migration files from
  `db/migrations/`, instantiate `MigrationRunner`, call `.migrate()`.
- **`db:rollback`** -- Same setup, call `.rollback(steps)`. Add `--step N` option.
- **`db:migrate:status`** -- Same setup, call `.status()`, print table.
- **Migration file convention** -- Files must export a class extending `Migration`
  with a `version` property (the timestamp prefix). The generator already produces
  the right shape, just needs the `version` getter.
- **Migration version extraction** -- Parse the timestamp from the filename
  (e.g., `20260318120000-create-users.ts` -> version `"20260318120000"`).

### Phase 3: db:create and db:drop

- **`db:create`** -- For SQLite: create the file. For PG/MySQL: connect to the
  system database and run `CREATE DATABASE`. Needs adapter-specific logic.
- **`db:drop`** -- Reverse of create. Drop the database.
- **`db:reset`** -- `db:drop` + `db:create` + `db:migrate` + `db:seed`.
- **`db:setup`** -- `db:create` + `db:migrate` + `db:seed` (skip if exists).

### Phase 4: Console with database connection

- Load database config and connect before starting REPL.
- Import and register all models from `src/app/models/`.
- Set the adapter on Base so queries work.
- Models should be available as globals in the REPL (e.g., `User.all()`).

### Phase 5: Schema management

- **`db:schema:dump`** -- Dump current schema to `db/schema.ts` (or `.sql`).
  Needs `SchemaDumper` which is partially implemented.
- **`db:schema:load`** -- Load schema from dump file instead of running all
  migrations. Faster for fresh setups.
- **`db:migrate:redo`** -- Rollback + migrate (useful for testing a migration).

### Phase 6: Additional generators

- **`generate migration` improvements** -- Support `AddIndexToUsers name:index`,
  `references` type, `belongs_to` shorthand.
- **`generate model` improvements** -- Support `--no-migration`, `--no-test`,
  association declarations.

## Migration file convention

Generated migrations should look like:

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

The `version` is the timestamp prefix from the filename. `MigrationRunner`
uses it to track which migrations have been applied.

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

## Tracking

Phase 1 (config + connection) unblocks everything else. Without it, the CLI
can generate files but can't talk to a database.
