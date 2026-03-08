# CLI: `rails-ts` Command Line Interface

## Overview

Rails ships a CLI via `railties` that handles project scaffolding, code generation, server management, console access, database tasks, and more. The `rails` command is the primary entry point for working with Rails applications.

This doc specs out the `@rails-ts/cli` package — a TypeScript equivalent of `railties` that provides a `rails-ts` command for creating and managing rails-ts applications.

## Rails CLI commands

The full `rails` CLI is large. Here's what we'd map:

| Rails Command | Priority | Description |
|---|---|---|
| `rails new` | P0 | Generate a new application |
| `rails generate` (g) | P0 | Run code generators (model, controller, migration, scaffold) |
| `rails server` (s) | P0 | Start the dev server |
| `rails console` (c) | P1 | Interactive REPL with app loaded |
| `rails db:migrate` | P0 | Run pending migrations |
| `rails db:rollback` | P1 | Rollback last migration |
| `rails db:seed` | P1 | Run seed file |
| `rails db:create` / `db:drop` | P1 | Create/drop database |
| `rails db:schema:dump` / `load` | P2 | Dump/load schema |
| `rails routes` | P1 | Print route table |
| `rails destroy` (d) | P2 | Undo a generator |
| `rails test` (t) | P2 | Run tests |
| `rails runner` | P2 | Run a script in app context |
| `rails credentials:edit` | P3 | Manage encrypted credentials |
| `rails initializers` | P3 | List initializers |
| `rails middleware` | P3 | List middleware stack |

## Package

**Name:** `@rails-ts/cli`
**Directory:** `packages/cli/`
**Binary:** `rails-ts` (via `package.json` `"bin"` field)

Dependencies: `@rails-ts/activerecord`, `@rails-ts/actionpack`, `@rails-ts/activesupport`, `@rails-ts/rack`

## Stories

### Story 1: Package scaffold and command router

Set up the CLI package with a main entry point that parses argv, dispatches to subcommands, and prints help.

**Files:**
- `packages/cli/package.json` — package manifest with `"bin": { "rails-ts": "./dist/bin.js" }`
- `packages/cli/tsconfig.json`
- `packages/cli/src/bin.ts` — entry point, parses argv
- `packages/cli/src/cli.ts` — command registry and dispatcher
- `packages/cli/src/cli.test.ts` — tests for command routing, help output, unknown commands
- `packages/cli/src/version.ts` — `rails-ts --version`

**Acceptance:**
- `rails-ts --help` prints available commands
- `rails-ts --version` prints version
- Unknown commands print error and help
- `rails-ts` with no args prints help

### Story 2: `rails-ts new` — application generator

Generate a new rails-ts application with a standard directory structure, package.json, tsconfig, and starter files.

**Files:**
- `packages/cli/src/commands/new.ts` — `new` command implementation
- `packages/cli/src/commands/new.test.ts`
- `packages/cli/src/generators/app-generator.ts` — template logic
- `packages/cli/src/generators/app-generator.test.ts`
- `packages/cli/src/generators/templates/` — template files (gitignore, tsconfig, app entry, etc.)

**Generated app structure:**
```
my-app/
  package.json
  tsconfig.json
  src/
    app.ts                    # Application class
    server.ts                 # Dev server entry
    config/
      routes.ts               # Route definitions
      database.ts             # DB config
    app/
      models/
      controllers/
        application-controller.ts
      views/
    db/
      migrations/
      seeds.ts
      schema.ts
  test/
```

**Acceptance:**
- `rails-ts new my-app` creates directory with correct structure
- `rails-ts new my-app --database sqlite` sets up SQLite config (default)
- `rails-ts new my-app --database postgres` sets up PostgreSQL config
- Generated app has correct dependencies in package.json
- `cd my-app && npm install && npm run build` works
- `cd my-app && npm test` runs (empty but passing)

### Story 3: `rails-ts generate model` — model generator

Generate a model file, migration, and test file.

**Files:**
- `packages/cli/src/commands/generate.ts` — `generate` dispatcher
- `packages/cli/src/commands/generate.test.ts`
- `packages/cli/src/generators/model-generator.ts`
- `packages/cli/src/generators/model-generator.test.ts`

**Acceptance:**
- `rails-ts generate model User name:string email:string age:integer` creates:
  - `src/app/models/user.ts` — `User` class extending `Base` with typed attributes
  - `db/migrations/YYYYMMDDHHMMSS-create-users.ts` — migration with `createTable`
  - `test/models/user.test.ts` — test stub
- Column types map correctly: `string`, `integer`, `float`, `boolean`, `date`, `datetime`, `text`, `decimal`
- `rails-ts g model` works as shorthand

### Story 4: `rails-ts generate migration` — migration generator

Generate a standalone migration file.

**Files:**
- `packages/cli/src/generators/migration-generator.ts`
- `packages/cli/src/generators/migration-generator.test.ts`

**Acceptance:**
- `rails-ts generate migration AddEmailToUsers email:string` creates a timestamped migration file
- Infers `addColumn` from "Add*To*" naming pattern
- Infers `removeColumn` from "Remove*From*" naming pattern
- Infers `createTable` from "Create*" naming pattern
- Plain names generate an empty migration body

### Story 5: `rails-ts generate controller` — controller generator

Generate a controller with actions and route stubs.

**Files:**
- `packages/cli/src/generators/controller-generator.ts`
- `packages/cli/src/generators/controller-generator.test.ts`

**Acceptance:**
- `rails-ts generate controller Posts index show create` creates:
  - `src/app/controllers/posts-controller.ts` — controller class with action methods
  - `test/controllers/posts-controller.test.ts` — test stub
  - Appends route entries to `src/config/routes.ts`

### Story 6: `rails-ts generate scaffold` — full resource generator

Combines model + controller + routes for a complete CRUD resource.

**Files:**
- `packages/cli/src/generators/scaffold-generator.ts`
- `packages/cli/src/generators/scaffold-generator.test.ts`

**Acceptance:**
- `rails-ts generate scaffold Post title:string body:text published:boolean` creates model, migration, controller (with index/show/create/update/destroy), routes, and tests
- Generated controller has working CRUD actions

### Story 7: `rails-ts server` — development server

Start a dev server that loads the application and serves requests through the middleware stack and router.

**Files:**
- `packages/cli/src/commands/server.ts`
- `packages/cli/src/commands/server.test.ts`
- `packages/cli/src/server/dev-server.ts` — HTTP server using Node's `http` module + Rack middleware
- `packages/cli/src/server/dev-server.test.ts`

**Acceptance:**
- `rails-ts server` starts on port 3000 (configurable with `-p`)
- Requests flow through Rack middleware stack -> ActionDispatch router -> controller
- Console output shows request log (method, path, status, duration)
- File changes trigger reload (basic: restart process; stretch: hot reload)

### Story 8: `rails-ts db:migrate` — database migrations

Run pending migrations against the configured database.

**Files:**
- `packages/cli/src/commands/db.ts` — `db:*` subcommand dispatcher
- `packages/cli/src/commands/db.test.ts`

**Acceptance:**
- `rails-ts db:migrate` runs pending migrations in order
- `rails-ts db:rollback` reverts last migration
- `rails-ts db:migrate:status` shows migration status
- `rails-ts db:seed` runs `db/seeds.ts`
- `rails-ts db:create` / `rails-ts db:drop` manage the database
- Migration state tracked in `schema_migrations` table

### Story 9: `rails-ts routes` — route listing

Print the application's route table.

**Files:**
- `packages/cli/src/commands/routes.ts`
- `packages/cli/src/commands/routes.test.ts`

**Acceptance:**
- `rails-ts routes` prints formatted route table (verb, path, controller#action, name)
- `rails-ts routes -g pattern` greps routes
- Output matches Rails `rake routes` format

### Story 10: `rails-ts console` — interactive REPL

Start an interactive TypeScript REPL with the application loaded.

**Files:**
- `packages/cli/src/commands/console.ts`
- `packages/cli/src/commands/console.test.ts`

**Acceptance:**
- `rails-ts console` starts a REPL
- Models are available (e.g., `await User.findBy({ name: "dean" })`)
- Database connection is established
- `.exit` or Ctrl+D exits

### Story 11: `rails-ts destroy` — undo generators

Remove files created by a generator.

**Files:**
- `packages/cli/src/commands/destroy.ts`
- `packages/cli/src/commands/destroy.test.ts`

**Acceptance:**
- `rails-ts destroy model User` removes model, migration, and test files
- Only removes files that the generator would have created
- Prints what was removed

## Compare script integration

### Test compare

The `test:compare` pipeline needs to include railties tests.

**Changes to `scripts/test-compare/fetch-rails-tests.sh`:**
```bash
git sparse-checkout add \
  railties/test
```

**Changes to `scripts/test-compare/extract-ruby-tests.rb`:**
```ruby
PACKAGE_TEST_DIRS = {
  # ... existing entries ...
  "cli" => File.join(RAILS_DIR, "railties", "test"),
}
```

Add filtering to scope to the relevant test files (generators, commands):
```ruby
# For cli package, only include generator and command tests
when "cli"
  next unless relative_path.match?(/generators\/|commands\//)
```

**Changes to `scripts/test-compare/extract-ts-tests.ts`:**
```typescript
cli: [
  "packages/cli/src/cli.test.ts",
  "packages/cli/src/commands/new.test.ts",
  "packages/cli/src/commands/generate.test.ts",
  "packages/cli/src/commands/server.test.ts",
  "packages/cli/src/commands/db.test.ts",
  "packages/cli/src/commands/routes.test.ts",
  "packages/cli/src/commands/console.test.ts",
  "packages/cli/src/commands/destroy.test.ts",
  "packages/cli/src/generators/app-generator.test.ts",
  "packages/cli/src/generators/model-generator.test.ts",
  "packages/cli/src/generators/migration-generator.test.ts",
  "packages/cli/src/generators/controller-generator.test.ts",
  "packages/cli/src/generators/scaffold-generator.test.ts",
  "packages/cli/src/server/dev-server.test.ts",
],
```

**Changes to `scripts/test-compare/test-naming-map.ts`:**

Add a `cli` section to `TEST_FILE_MAP` mapping railties test files to our test files:
```typescript
cli: {
  "generators/app_generator_test.rb": [
    { file: "app-generator.test.ts", describeBlock: "AppGenerator" },
  ],
  "generators/model_generator_test.rb": [
    { file: "model-generator.test.ts", describeBlock: "ModelGenerator" },
  ],
  "generators/migration_generator_test.rb": [
    { file: "migration-generator.test.ts", describeBlock: "MigrationGenerator" },
  ],
  "generators/controller_generator_test.rb": [
    { file: "controller-generator.test.ts", describeBlock: "ControllerGenerator" },
  ],
  "generators/scaffold_generator_test.rb": [
    { file: "scaffold-generator.test.ts", describeBlock: "ScaffoldGenerator" },
  ],
  "commands/server_test.rb": [
    { file: "server.test.ts", describeBlock: "ServerCommand" },
  ],
  "commands/routes_test.rb": [
    { file: "routes.test.ts", describeBlock: "RoutesCommand" },
  ],
  "commands/console_test.rb": [
    { file: "console.test.ts", describeBlock: "ConsoleCommand" },
  ],
  "commands/dbconsole_test.rb": [
    { file: "db.test.ts", describeBlock: "DbCommand" },
  ],
  "commands/destroy_test.rb": [
    { file: "destroy.test.ts", describeBlock: "DestroyCommand" },
  ],
},
```

### API compare

The `api:compare` pipeline should also track railties classes.

**Changes to `scripts/api-compare/fetch-rails.sh`:**
```bash
git sparse-checkout set \
  # ... existing entries ...
  railties/lib/rails
```

**Changes to `scripts/api-compare/naming-map.ts`:**

Add CLI class mappings to `CLASS_MAP`:
```typescript
// CLI / Railties
"Rails::Generators::AppGenerator": "cli:AppGenerator",
"Rails::Generators::ModelGenerator": "cli:ModelGenerator",
"Rails::Generators::MigrationGenerator": "cli:MigrationGenerator",
"Rails::Generators::ControllerGenerator": "cli:ControllerGenerator",
"Rails::Generators::ScaffoldGenerator": "cli:ScaffoldGenerator",
"Rails::Command::ServerCommand": "cli:ServerCommand",
"Rails::Command::RoutesCommand": "cli:RoutesCommand",
"Rails::Command::ConsoleCommand": "cli:ConsoleCommand",
"Rails::Command::DbConsoleCommand": "cli:DbCommand",
"Rails::Command::DestroyCommand": "cli:DestroyCommand",
```

## Implementation order

1. **Story 1** — Package scaffold, command router. Gets `cli` into the monorepo build and establishes the test pattern.
2. **Story 4** — Migration generator. Lightest generator, only produces one file. Good proving ground.
3. **Story 3** — Model generator. Builds on migration generator, adds model + test output.
4. **Story 8** — `db:migrate`. Makes generated migrations actually runnable. Ties into existing `@rails-ts/activerecord` migration runner.
5. **Story 2** — `rails-ts new`. The big one — app generator. Depends on knowing what a "correct" app structure looks like (informed by stories 3-4).
6. **Story 5** — Controller generator.
7. **Story 6** — Scaffold generator. Combines model + controller.
8. **Story 7** — Dev server. Ties Rack + ActionDispatch + ActionController together.
9. **Story 9** — Route listing. Uses existing route inspector.
10. **Story 10** — Console. Node REPL integration.
11. **Story 11** — Destroy. Reverse of generators.

Then integrate into the compare scripts (fetch railties source, extract tests, add mappings) and measure coverage.

## Key design decisions

**TypeScript-native, not a Rails port.** The CLI should feel natural for TypeScript developers. Generated code uses TypeScript idioms (imports, async/await, typed attributes). Project structure uses TypeScript conventions (tsconfig.json, src/ directory). But command names and behavior should match Rails closely enough that Rails developers feel at home.

**Generators produce idiomatic TypeScript.** A generated model should look like:
```typescript
import { Base } from "@rails-ts/activerecord";

export class User extends Base {
  static {
    this.attribute("name", "string");
    this.attribute("email", "string");
    this.attribute("age", "integer");
  }
}
```

Not a transliteration of Ruby.

**Use Node's built-in HTTP server.** The dev server wraps `node:http` and feeds requests through the Rack middleware stack. No Express, Koa, or Fastify dependency.

**Migration timestamps use Rails format.** `YYYYMMDDHHMMSS` prefix, matching Rails exactly, so migration ordering is consistent.

## Rails test files to target

Key railties test files to match against (from `railties/test/`):

| Rails test file | Est. tests | Maps to |
|---|---|---|
| `generators/app_generator_test.rb` | ~80 | `app-generator.test.ts` |
| `generators/model_generator_test.rb` | ~25 | `model-generator.test.ts` |
| `generators/migration_generator_test.rb` | ~20 | `migration-generator.test.ts` |
| `generators/controller_generator_test.rb` | ~20 | `controller-generator.test.ts` |
| `generators/scaffold_generator_test.rb` | ~30 | `scaffold-generator.test.ts` |
| `commands/server_test.rb` | ~15 | `server.test.ts` |
| `commands/routes_test.rb` | ~15 | `routes.test.ts` |
| `commands/console_test.rb` | ~10 | `console.test.ts` |
| `commands/dbconsole_test.rb` | ~10 | `db.test.ts` |
| `commands/destroy_test.rb` | ~10 | `destroy.test.ts` |
| **Total** | **~235** | |

These test counts are estimates — the actual numbers will be known once we add railties to the `fetch-rails-tests.sh` sparse checkout and run the extractor.
