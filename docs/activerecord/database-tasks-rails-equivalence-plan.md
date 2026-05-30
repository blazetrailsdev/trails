# DatabaseTasks → Rails equivalence (split plan)

Goal: bring `packages/activerecord/src/tasks/` to full fidelity with
`ActiveRecord::Tasks::DatabaseTasks`, culminating in removal of the
`_adapterInstance` / `setAdapter` bypass so connections resolve through
`Base.connectionHandler` + pool exactly as Rails does.

## Context / why this is now feasible

The historical blocker — "SQLite `:memory:` + pool 1 + handler re-entry
deadlocks `loadSchema`" (PR #2268, Phase D-0) — is **resolved**. Probed
2026-05-30: re-entrant `Base.withConnection` under `:memory:`+`pool:1` (pinned
and unpinned) returns the pinned/sticky connection with no deadlock, because
`connection-pool.ts` now resolves a per-AsyncLocalStorage-context pinned
connection (`_resolvePinnedConnection`) before a fresh checkout. So routing
`migrate`/`loadSchema` through `migrationConnectionPool().withConnection` is
safe and no core-pool change is required.

## Review findings (grades)

- `database-tasks.ts` fidelity: **A−**. Adapter usage: **C+** (the bypass).
- Behavioral gaps vs Rails: `migrate` skips `initialize_database` +
  `schema_cache.clear!` (#9); `migrate_all` lacks single-primary fast path
  (#10); `prepare_all` lacks version-sort + post-migrate dump + per-config
  `seeds?` (#12); `reconstruct_from_schema` skips the `schema_up_to_date?`
  truncate fast path + `SKIP_TEST_DATABASE_TRUNCATE` (#13);
  `create_all`/`drop_all` re-`establish_connection` semantics (#8);
  `check_target_version` error-message shape (#14).
- `_resolveAdapter(config)` ignores its config arg → multi-db `migrate`
  targets the wrong DB (#2).
- Several Rails-`private` methods exposed public without `@internal` (#15).

## Blast radius

- `setAdapter`: 32 sites (17 in `database-tasks.test.ts`, 3 in subclasses,
  8 in trailties `commands/db.ts`, plus the def + error messages).
- `migrationConnection`: 11 sites (subclasses + trailties).

## PR sequence (sibling branches off `main`, shipped sequentially)

Each PR is green on its own; the bypass shim is removed only in the final PR.

1. **`db-tasks-conn-core`** — `database-tasks.ts` only. **(this PR / shipped)**
   Add `_migrationAdapter()`: shim-first (returns `_adapterInstance` when set,
   so all current callers stay green) with a `Base` connection-pool fallback
   (`connectionPool().leaseConnection()`, leasing on demand; `ConnectionNotDefined`
   → null for the shim era; real lease errors propagate). Route the async
   migration/schema methods (`migrate` via `_resolveAdapter`, `dumpSchema`,
   `loadSchema`, `migrateStatus`, `schemaUpToDate`, `_stampSchemaSha1`,
   `_appendSchemaInformation`) through it. `@internal` on the new helper.
   No caller changes → green.

   **Explicitly NOT in this PR (deferred, see below):** `withTemporaryPool`,
   making the _sync_ `migrationConnection()` pool-derived (blocked by the
   `base → connection-handler → pool-config → database-tasks` import cycle —
   needs the subclasses to move to async access first), and the #2 multi-db
   `migrate` fix (real per-config pool routing breaks the shim-based migrate
   tests, so it lands with the test migration).

2. **`db-tasks-behavior`** — `database-tasks.ts` (sequential after #1, same
   file). Behavioral gaps #8/#9/#10/#12/#13/#14.

3. **`db-tasks-subclasses`** — `sqlite|postgresql|mysql-database-tasks.ts`.
   Replace `connectAdapter`/`connectAdmin`/`withAdmin` with
   `Base.establishConnection`/`leaseConnection`; drop the `:memory:` reuse
   hack. Stop calling `setAdapter`. Convert `migrationConnection()` to async /
   make it pool-derived now that callers no longer need it sync.

4. **`db-tasks-tests`** — `database-tasks.test.ts`. Migrate 17 `setAdapter`
   sites to `bootstrapTestHandler()` / handler establish. Land the #2 multi-db
   `migrate` fix (per-config pool routing) here, where the shim-based migrate
   tests are rewritten to use a real pool.

5. **`db-tasks-with-temporary-pool`** — add faithful `withTemporaryPool(config,
fn)` (handler `establishConnection({clobber})` + restore via
   `connectionDbConfig`) and route `withTemporaryConnection` /
   `withTemporaryPoolForEach` through it. Sequenced after the test migration so
   the establish/restore behavior change lands against pool-based tests.

6. **`trailties-db-handler`** — trailties `commands/db.ts`, `database.ts`,
   `db.test.ts`. Populate `DatabaseTasks.databaseConfiguration` and resolve
   adapters via the pool instead of `setAdapter`/`migrationConnection`.

7. **`db-tasks-drop-shim`** — delete `_adapterInstance`/`setAdapter`/
   `_resolveAdapter`/`_connectFor`. Only safe once 3–6 have merged.

## Hard floor (stays as documented substitution, not a gap)

- `schema_format :ruby` → `ts`/`js` (no Ruby `load`).
- `class_for_adapter` `constantize`, `OpenSSL::Digest`, `mattr_accessor`.
- `migrate_status`/`check_schema_file` return/throw instead of
  `Kernel.abort`/`puts` (better DX; not chased).
