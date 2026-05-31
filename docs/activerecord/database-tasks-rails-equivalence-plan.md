# DatabaseTasks Rails equivalence — Phase 2

Phase 1 (7 PRs, #2704–#2723) is complete: the `_adapterInstance`/`setAdapter`
bypass shim is removed; all tasks files are at 100% api:compare parity. This
doc tracks the residual behavioral gaps and minor clean-ups surfaced during
Phase 1 post-merge audits.

Historical Phase 1 sequence: see `git log --oneline | grep db-tasks` or
`git log --follow -- docs/activerecord/database-tasks-rails-equivalence-plan.md`.

## Phase 2 stories

### P2-1 — `migrate` missing `initialize_database` call (~30 LOC) ✅ shipped

**Source:** PR #2706 post-merge findings.

Rails calls `initialize_database(migration_connection_pool.db_config)` at the
top of `migrate` unless `skip_initialize` is set (and callers like `migrateAll`
pass `skipInitialize: true`). Our `migrate` omits this entirely.

Fix: add `skipInitialize` param + `initialize_database(migration_connection_pool.db_config)`
call inside `migrate`; pass `skipInitialize: true` from `migrateAll`.

Files: `tasks/database-tasks.ts`.

---

### P2-2 — `createAll` missing re-establish_connection (~10 LOC) ✅ shipped

**Source:** PR #2706 post-merge findings.

Rails `create_all` captures the current `migration_connection.pool.db_config`
before iterating and calls `migration_class.establish_connection(db_config)`
after all creates, restoring the pool to the original config. Our `createAll`
skips this, leaving the handler pointing at whatever config was last created.
(`drop_all` in Rails does not re-establish — only `create_all` does.)

Files: `tasks/database-tasks.ts`.

---

### P2-3 — `dbConfigsWithVersions` / `prepareAll` / `migrateAll` behavioral fidelity (~60 LOC) ✅ shipped

**Source:** PR #2706 post-merge findings; verified against Rails source.

Three interrelated gaps:

1. **`dbConfigsWithVersions`** groups by `envName` instead of querying
   `pool.migration_context.pending_migration_versions` per config as Rails does.
   Rails returns a `version → db_configs[]` map; ours returns an `envName → configs[]`
   map. This is foundational — `prepareAll` and `migrateAll` both depend on it.

2. **`migrateAll`** calls `initialize_database` before iterating (Rails does
   `db_configs.each { |c| initialize_database(c) }` before the single-primary
   fast path or the version-sorted loop). Our implementation skips this entirely
   and should pass `skipInitialize: true` to `migrate` once P2-1 lands.

3. **`prepareAll`** differs from Rails in structure: Rails calls
   `initialize_database` (not `create`) per config, then iterates
   `db_configs_with_versions(environment).sort` inside
   `each_current_environment`, calling `with_temporary_pool(db_config) { migrate(version) }`
   for each version/config pair, then runs a post-migrate `dump_schema` pass
   when `dumpSchemaAfterMigration` is set. Our `prepareAll` uses `create` + `migrateAll`.

Fix these three together once P2-1 (`skipInitialize`) is in place.

Files: `tasks/database-tasks.ts`.

---

### P2-4 — `withTemporaryPoolForEach` missing `name:` filter param (~10 LOC) ✅ shipped

**Source:** PR #2718 post-merge findings.

Rails `with_temporary_pool_for_each(name:)` accepts a `name:` keyword to
filter to a single named DB config. We have no equivalent parameter.

Files: `tasks/database-tasks.ts`.

---

### P2-5 — SQLite path normalization in `withTemporaryPool` (~10 LOC) ✅ shipped

**Source:** PR #2723 post-merge findings.

`withTemporaryPool` passes `config.configuration` (raw hash) to
`Base.establishConnection` without resolving relative SQLite paths against
`DatabaseTasks.root`. Pre-existing across all callers (`migrateAll`,
`reconstructFromSchema`, etc.); only `checkProtectedEnvironmentsBang` previously
escaped via the removed `_connectFor` shim.

Fix: normalize SQLite `database` path at `withTemporaryPool` entry (or at the
`SQLiteDatabaseTasks` / config-loading layer) using `DatabaseTasks.root`.
Low practical impact but breaks the Rails invariant that `root` governs
relative DB paths.

Files: `tasks/database-tasks.ts` (or `tasks/sqlite-database-tasks.ts`).

---

### ~~P2-6 — `migrationConnection()` order-dependency registration hook (~20 LOC)~~ ✅ shipped (#2734)

**Source:** PR #2723 post-merge findings.

`migrationConnection()` returns null if called before any async DatabaseTasks
method has had a chance to capture `_baseClass`. Root cause: `base.ts` cannot be
statically top-level-imported from `database-tasks.ts` due to a real ESM
circular dependency (`base → connection-handler → pool-config → database-tasks`).

Proper fix: add a registration hook (e.g. `DatabaseTasks._registerBase(Base)`)
that `base.ts` calls at module init time (via a side-effect import in
`model.ts`), eliminating the order dependency without a top-level import cycle.

Files: `tasks/database-tasks.ts`, `base.ts` (or `model.ts`).

---

### ~~P2-7 — MySQL `socket`→`socketPath` remapping relocation (~10 LOC)~~ ✅ shipped (#2734)

**Source:** PR #2710 post-merge findings.

`MySQLDatabaseTasks.establishConnection()` remaps `socket` → `socketPath` inline
as a workaround. This conversion belongs in `buildAdapterArg` (config layer) or
the `Mysql2Adapter` constructor so all callers benefit.

Files: `tasks/mysql-database-tasks.ts`, and wherever `buildAdapterArg` /
`Mysql2Adapter` constructor lives.

---

### ~~P2-8 — 14 remaining skipped tests in `database-tasks.test.ts`~~ ✅ shipped

**Source:** PR #2713 post-merge findings.

Audit complete. 5 tests unskipped (2 schema-cache tests + 3 schemaDumpPath tests);
9 remain skipped as P3 follow-ups below. The `schemaDumpPath` implementation was
updated to delegate to `config.schemaDump()`, which also fixed the `schemaDump: false`
nil-return gap and the `schema_dump: "custom/path"` directory-creation paths.

Files: `tasks/database-tasks.ts`, `tasks/database-tasks.test.ts`.

---

## Phase 3 follow-up stories

These 9 skips remain after P2-8 audit. Each has a clear scope.

### P3-1 — `checkProtectedEnvironmentsBang` NoEnvironmentInSchemaError path

**Source:** "raises an error if no migrations have been made" test.

When `schema_migrations` has rows but `ar_internal_metadata` table is absent,
Rails raises `NoEnvironmentInSchemaError`. Our `checkProtectedEnvironmentsBang`
reads `migrator.lastStoredEnvironment()` which returns null when the table
doesn't exist — no error thrown. Requires:

1. `Migrator.lastStoredEnvironment()` (or a new helper) to detect the "migrations
   present but no env stamped" state.
2. `checkProtectedEnvironmentsBang` to throw `NoEnvironmentInSchemaError` in that case.

~30 LOC. Rails: `test/cases/tasks/database_tasks_test.rb:122`.

### P3-2 — `createCurrent` re-establishes connection post-create

**Source:** "establishes connection for the given environments" (two-tier + three-tier).

Rails `create_current` calls `ActiveRecord::Base.establish_connection(env)` after
creating so the caller's pool is re-pointed to the env's primary. Our `createCurrent`
doesn't do this. ~20 LOC addition to `createCurrent`.

Rails: `test/cases/tasks/database_tasks_test.rb:586, 703`.

### P3-3 — Multi-db `checkProtectedEnvironmentsBang` integration test

**Source:** "with multiple databases" test.

Needs two real SQLite file DBs, each stamped with `internal_metadata` env, then
verifying the protected-env check fires correctly across both. Primarily a test
authoring task (the implementation is likely already correct). ~50 LOC test.

Rails: `test/cases/tasks/database_tasks_test.rb:155`.

### P3-4 — SCOPE env variable migration filtering

**Source:** "migrate using scope and verbose mode" (×3 tests).

`ENV["SCOPE"]` filters which migrations run (only those whose filename contains
the scope string). Not implemented in `Migrator` or `DatabaseTasks.migrate`.
~30 LOC in `Migrator` + `DatabaseTasks` + scope migration fixtures.

Rails: `test/cases/tasks/database_tasks_test.rb:1105–1158`.

### P3-5 — `migrateStatus` stdout output

**Source:** "migrate status table" test.

Rails' `migrate_status` prints a formatted table to stdout (database name header +
up/down rows per migration). Our `migrateStatus()` returns structured data with no
output. ~30 LOC stdout-printing wrapper or `displayMigrateStatus` helper.

Rails: `test/cases/tasks/database_tasks_test.rb:1169`.

### P3-6 — Symbol env name in `checkProtectedEnvironmentsBang` (N/A)

**Source:** "raises an error when called with protected environment which name is a symbol".

TypeScript has no `Symbol` type for string env names; Ruby-specific coercion behavior
has no TS equivalent. Permanently inapplicable — keep skipped indefinitely.

Rails: `test/cases/tasks/database_tasks_test.rb:98`.

---

## Bundling guidance

P2-1 must land first (adds `skipInitialize` which P2-3 depends on), but at
~30 + ~10 + ~60 LOC the three stories total well under 300 LOC and can ship
as a single PR. P2-1 + P2-2 + P2-3 are thematically cohesive (`migrate`/
`createAll`/`prepareAll`/`migrateAll`/`dbConfigsWithVersions` behavioral
fidelity) — bundle all three together.
P2-4 + P2-5 are small and can be bundled together. P2-6 and P2-7 are
independent cleanups that can go separately or bundled with any of the above.
P2-8 is a follow-up audit, not its own story — attach to whichever PR closes
the last behavioral gap it depends on.
