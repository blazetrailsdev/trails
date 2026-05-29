# Drop `bootstrap-test-handler.ts` → migrate test setup to `DatabaseTasks`

**Status:** Planning. No code yet. Decisions captured below; open questions
tracked at the bottom.

**Goal:** Delete `packages/activerecord/src/test-helpers/bootstrap-test-handler.ts`
and have all test database setup go through `ActiveRecord::Tasks::DatabaseTasks`
(`packages/activerecord/src/tasks/database-tasks.ts`), matching how Rails sets
up test databases (`db:test:prepare` → `reconstruct_from_schema` /
`load_schema`, with `Base.establish_connection` done separately by the test
harness).

## What `bootstrap-test-handler.ts` does today

Two responsibilities, and it is the load-bearing entry point for ~all of the AR suite:

1. `bootstrapTestHandler()` — env-sniffs `PG_TEST_URL` / `MYSQL_TEST_URL`,
   falls back to `sqlite { database: ":memory:", pool: 1 }`, then
   `Base.establishConnection(...)`. Establishes **Base's connection
   handler/pool** (the Phase-D chain: `Base.connection` → handler → pool →
   checkout). Idempotent.
2. `syncHandlerVisitor()` — re-points the global Arel `toSql` visitor at the
   handler's adapter. Must run in `beforeEach` because `test-setup.ts` resets
   the global visitor after every test.

### Consumers

- `test-setup-dy.ts` — the per-worker vitest `setupFile` (wired in
  `vitest.config.ts:166`). Bootstraps, loads `TEST_SCHEMA` via
  `defineSchema`, registers the canonical preload, tears the connection down.
- `setupHandlerSuite()` (`test-helpers/setup-handler-suite.ts`) — called by
  **~130 test files** in `beforeAll` (bootstrap + `pushSkipGlobalReset`) and
  `beforeEach` (`syncHandlerVisitor`).
- Direct importers: `core.test.ts`, `handler-resolved-adapter.test.ts`.

## The core impedance mismatch

`DatabaseTasks` operates on its **own** `_adapterInstance` (set via
`setAdapter`) and a `DatabaseConfigurations` registry. It does **not** today
establish `Base`'s connection handler, and its `loadSchema` reads a **schema
file** (`db/schema.ts` default-exporting `(ctx: MigrationContext) => void`),
not the in-memory `TEST_SCHEMA` object.

So the migration is three distinct swaps, not one:

1. **Connection establishment** — env-sniff → a `DatabaseConfigurations`
   "test" config consumed by both `Base.establishConnection` and
   `DatabaseTasks`.
2. **Schema loading** — `defineSchema(TEST_SCHEMA)` →
   `DatabaseTasks.loadSchema` / `reconstructFromSchema`, which needs
   `TEST_SCHEMA` as a loadable schema file.
3. **Visitor sync** — fold into the establish path (or keep as-is).

## Decisions

- **Schema source: generate a schema file** from `TEST_SCHEMA` and load it
  through the real `DatabaseTasks.loadSchema` path (highest Rails parity;
  genuinely exercises `loadSchema` rather than papering over it).
- **Generation timing: runtime, once per worker.** `test-setup-dy.ts`
  generates the file to a temp path at worker startup from `TEST_SCHEMA`, then
  `loadSchema` reads it. No checked-in artifact, always in sync.
- **PG/MySQL workers: full `reconstructFromSchema`** (purge + create +
  loadSchema) per worker — matches Rails `db:test:prepare` exactly,
  self-healing. (For sqlite `:memory:`, purge/create are effectively no-ops.)
- **Visitor sync: fold into `establishConnection`.** Establishing the
  connection installs the matching Arel visitor; `test-setup.ts` must stop
  resetting it out from under the handler. Removes the `beforeEach`
  `syncHandlerVisitor` dance entirely. NOTE: touches production
  `connection-handling.ts` + `test-setup.ts` — ships as a **prerequisite
  PR 0** before the rest, since it changes behavior beyond test setup.
- **Schema loading is worker-level only.** `DatabaseTasks` loads the full
  `TEST_SCHEMA` once per worker; `setupHandlerSuite()` just establishes/pins.
  Assumes every test file's tables are covered by the canonical `TEST_SCHEMA`
  (true post-fixture-port). Per-file `defineSchema` calls remain harmless
  cache-hit no-ops, swept out in Phase 5.
- **Canonical-preload machinery stays through the migration.** The
  `setCanonicalSchemaPreload` / `restoreCanonicalSchemaSignatures` dance in
  `define-schema.ts` keeps per-file `defineSchema` no-op; removal deferred to
  Phase 5, not bundled into PR 2.

## Phased plan

**Phase 0 — schema-file generator.** Walk `TEST_SCHEMA` and emit a module
whose default export drives `MigrationContext.createTable(...)` calls.
Lives next to `test-schema.ts`. (Format/timing TBD.)

**Phase 1 — test `DatabaseConfigurations`.** A `test-database-config.ts` that
builds the "test"-env config from `PG_TEST_URL` / `MYSQL_TEST_URL` /
sqlite-memory (moving the env-sniff out of bootstrap). Wire
`DatabaseTasks.databaseConfiguration` + `setAdapter`.

**Phase 2 — rework `test-setup-dy.ts`.** Establish Base from the Phase-1
config, then `DatabaseTasks.reconstructFromSchema(config)` (or bare
`loadSchema`) using the Phase-0 file. Preserve `setCanonicalSchemaPreload`
so per-file `defineSchema` calls remain cache-hit no-ops during transition.
Re-verify the SQLite `:memory: pool:1` loadSchema deadlock workaround.

**Phase 3 — rewrite `setupHandlerSuite()` internals.** Single-file change:
call the new establish-from-config helper instead of `bootstrapTestHandler`;
keep `syncHandlerVisitor`. The ~130 consumer files are untouched.

**Phase 4 — delete `bootstrap-test-handler.ts`.** Migrate the 2 direct
importers, then remove the file.

**Phase 5 — cleanup (separate follow-up).** Re-evaluate the canonical-preload
signature machinery in `define-schema.ts` once everything loads via
`DatabaseTasks`.

## PR sequencing (≤300 LOC each, off `main`, non-overlapping files)

- **PR 0** — visitor-on-establish: make `establishConnection` install the
  matching Arel visitor, stop `test-setup.ts` resetting it. Prod + test
  change, shipped/green before anything else. Removes the `beforeEach` sync.
- **PR 1** — Phase 0+1: new files only + smoke test. No consumer changes.
- **PR 2** — Phase 2+3: `test-setup-dy.ts` + `setup-handler-suite.ts` rewrite.
  Riskiest; full-suite CI is the proof. Keep `bootstrap-test-handler.ts` as
  fallback.
- **PR 3** — Phase 4: migrate 2 importers + delete the file.

## Risk controls

- **Spike the sqlite `:memory: pool:1` path before PR 2.** This is the
  default local path for most contributors, and it's exactly where the pool
  epic D-0 `loadSchema` deadlock bites. `reconstructFromSchema` adds
  purge+create on top. Throwaway spike running `reconstructFromSchema`
  against sqlite `:memory: pool:1` must come back clean before PR 2 work
  starts. (Workaround on record: explicit `this.attribute()`.)
- **Prove `DatabaseTasks` is doing the real load (not silent fallback):**
  1. Throwaway run with `setCanonicalSchemaPreload` stubbed to a no-op, so
     per-file `defineSchema` would actually hit the DB — if the suite still
     passes, the worker-level `DatabaseTasks` load is genuinely populating the
     schema.
  2. Permanent: a worker-startup assertion that key `TEST_SCHEMA` tables
     exist after `loadSchema`, before any test runs.

## Open questions (remaining)

- Exact temp-path/format for the runtime-generated schema file (one per
  worker — must not collide across parallel forks; key off the worker id /
  `AR_DB_FORKS` slot).
- Does `reconstructFromSchema`'s `purge` need a registered task handler for
  every adapter in the test matrix, or is the sqlite no-op path enough for
  PR 2's first cut?
