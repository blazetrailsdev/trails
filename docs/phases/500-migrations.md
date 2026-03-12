# Phase 500: Migrations

**Goal**: Flesh out the schema migration system.

## Current state (5/118)

### Already working

- Basic `createTable` with column definitions
- Column types: string, integer, boolean, text, float, decimal, datetime, date
- `exec` for raw SQL
- `MigrationRunner` for running migrations in order

### Missing / incomplete

### Schema definition

- `change_table` — modify existing tables
- `add_column`, `remove_column`, `rename_column`, `change_column`
- `add_index`, `remove_index`
- `add_reference` / `add_belongs_to`
- `add_foreign_key`, `remove_foreign_key`
- `add_timestamps`, `remove_timestamps`

### Column options

- `null: false`, `default:`, `limit:`, `precision:`, `scale:`
- `index: true`, `unique: true`
- `comment:`
- `array: true` (PostgreSQL)

### Table options

- `primary_key:` override
- `id: false` for join tables
- `timestamps: true` (auto-add created_at/updated_at)
- `comment:`

### Migration features

- Reversible migrations (`change` with auto-reverse)
- `up` / `down` explicit methods
- `reversible` block
- Migration versioning and `schema_migrations` table
- `db:migrate`, `db:rollback` semantics

### Key files

- `packages/activerecord/src/migration.ts`
- `packages/activerecord/src/migration-runner.ts`
- Ruby reference: `migration_test.rb`, `migration/*.rb`
