# ActiveRecord — residual gaps (consolidated)

> **Snapshot 2026-06-01.** Consolidates the five formerly-separate gap plans
> (associations, relation, connection-pool, database-tasks, query-cache).
> Each of those tracks is **substantially complete** — the items below are the
> residual long-tail: mostly **blocked** (on a Rails source refresh, on another
> track, or architectural) plus a handful of small unblocked follow-ups.
> Phase ordering lives in [`activerecord-index.md`](activerecord-index.md).
>
> History for any item: `git log --follow -- docs/activerecord/<old-doc>.md`
> (the five source docs were merged here and deleted).

## Unblocked — actionable now

These are the only items below that can be picked up without waiting on an
external blocker. Small; bundle toward the 300-LOC ceiling.

- **DatabaseTasks P3-5** — `migrateStatus` stdout fidelity (~20 LOC).
  **Mostly addressed:** the formatted up/down table shipped at the
  `activerecord-cli` layer (`ar db:migrate:status`, #2743). Residual
  Rails-fidelity gap: Rails prints from `DatabaseTasks.migrate_status` itself
  (`database_tasks.rb:302` — `puts "database: …"`, header, `puts` per
  `migrations_status` row), whereas trails' `DatabaseTasks.migrateStatus()`
  (`tasks/database-tasks.ts:911`) still only returns the structured array and
  the formatting lives in the CLI. To match Rails exactly, move/duplicate the
  `puts` formatting into `DatabaseTasks.migrateStatus()`. Test: "migrate status
  table". Lower priority now that the user-facing table exists.
- **Associations** — `~2 LOC`: fix the stale `inheritance.ts`
  `initializeInternalsCallback` JSDoc.
- **Associations Track 9** (~10 scattered single-test gaps, ~10–40 LOC each):
  counter-cache in-memory updates after create/push/empty (`has-many-associations.test.ts`, 3),
  `readonly` check on save (`belongs-to-associations.test.ts`, 1),
  `belongsToRequiredByDefault` config (`required.test.ts`, 1),
  Arel join node in left outer join (`left-outer-join-association.test.ts`, 3),
  inner-join edge cases (`inner-join-association.test.ts`, 2).

## Blocked — external dependency

- **Connection-pool P13 — `StandaloneConnection`** (~40 LOC + 4 tests).
  Blocked on a Rails source refresh: vendored
  `connection_adapters/abstract/connection_pool.rb` has no `StandaloneConnection`
  class and the vendored `standalone_connection_test.rb` references a newer
  Rails. Once refreshed: implement `StandaloneConnection` as a pool stand-in
  whose `checkin`/`remove` disconnect the wrapped connection; unskip the 4
  tests in `connection-adapters/standalone-connection.test.ts`.
- **Associations D2 — has_one fixture bodies** (~24 tests, ~200 LOC). Blocked
  on Phase G fixture adoption — the has_one impl is largely complete; tests
  lack data. See [`fixtures-adoption-inventory.md`](fixtures-adoption-inventory.md).
- **Associations — nested-attributes error semantics** (`nested-error.test.ts`,
  4 tests). Blocked on `accepts_nested_attributes_for` (Phase G).

## Blocked — gated on another in-repo track

- **Relation / connection-pool — query cache (per-thread architecture)**
  (~14–27 tests). The live mixin cache is wired (#2662/#2672/#2684); the
  remaining skips are per-thread-cache architecture that depends on the
  connection-pool track. See the query-cache section below.
- **Relation — `eager_load` toSql + STI + non-preload** (3 tests). Blocked on
  the associations track (A5).
- **Relation — `missing with enum*`** (5 tests). Blocked on join
  table-aliasing (large, separate track) — the `missing`/`associated`
  WhereChain joins `reading_listing` without alias support.
- **Relation — enum write-casting from string labels** (separate gap).
  `where({ enumCol: "label" })` value serialization is not wired through the
  type caster. Serialize path shipped (#2687); the cast path is the remaining
  > 300-LOC `type_for_attribute` refactor.
- **Connection-pool follow-ups (gated):**
  - `~5 LOC` (when global handler iteration is wired): zero-arg `run()`.
  - `~10 LOC` (when pool-based executor wiring lands): extend `complete()`.
  - `~15-25 LOC` (gated on pool track): concrete adapter `execQuery` overrides
    (`mysql2-adapter.ts`, `postgresql-adapter.ts`) + per-adapter
    `database-statements.ts` decls accept/forward `allowRetry` (the default
    impl captures and ignores it pending pool integration).
  - `~30-50 LOC` (gated on `cachedFindBy` port): make `cachedFindBy`
    (`core.ts:626`) use `StatementCache.execute`; reconcile `Query.retryable`
    vs Rails' caller-passes-`allowRetry`.
  - 7 skipped tests in `merge-and-resolve-default-url-config.test.ts` unblock
    when `ConnectionHandler` is fully ported (P9 scope).

## Architectural — needs a design decision (not a clean PR yet)

- **Associations — unify the two collection stores** (large).
- **Associations — `join_middle_table_alias`** — `Project.includes(:developers_projects)`
  eager-loads the auto-generated HABTM join model directly; blocked on two
  middle-HABTM infra gaps.
- **Associations — HABTM-into-polymorphic-source joins + scope** — unblocks
  `has many through` polymorphic-source cases.
- **Associations — `default_scope` query-method injection** — unblocks
  `joins and includes from default_scope`.
- **Associations — shared-source preload reset** — unblocks `through
association preload` reuse.
- **Associations — nested HMT autosave exclusion + new-record HMT readers.**
- **Associations — self-referential `belongsTo`-source push** (~50–150 LOC).
- **Associations — HMT `scope()` is not join-aware** (~15 LOC; direct-FK on
  target).
- **Relation R6c — parameterized join strings** (2 tests, ~40 LOC). Deferred;
  design needed.

## Permanent-skip (no JS equivalent — not actionable)

- **Relation — `load_async` / `FutureResult`** (28 tests) — Ruby thread pool.
- **Relation — query cache GVL/fork** (6), **`SimpleDelegator where`** (2) —
  Ruby-only.
- **Associations — Marshal tests** (`extension.test.ts` 2, plus ~18 scattered
  marshal/Ruby-only across the layer).

## activerecord-cli follow-ups

Post-merge findings from the ar-cli PR series (#2703–#2757). None are regressions;
all are small unblocked improvements or Rails-fidelity gaps.

### Unblocked — small (≤30 LOC each)

- **Generator name validation** (~10 LOC). `generate:migration` and
  `generate:model` do not reject names with characters outside `[a-zA-Z0-9_]`.
  Rails' `validate_file_name!` (`activerecord/lib/rails/generators/active_record/migration/migration_generator.rb:65`,
  invoked at line 16) raises on illegal names. Also: field names or model names with hyphens/leading digits
  produce uncompilable output — no guard. (#2717 finding)
- **`ManifestResult.path` JSDoc** (~1 LOC). JSDoc says "absolute path" but
  `generateManifest(modelsDir)` returns `join(modelsDir, "index.ts")` — relative
  when a direct library caller passes a relative `modelsDir`. Fix: resolve inside
  `generateManifest`, or soften the JSDoc. CLI is unaffected (always resolves
  against `cwd` first). (`packages/activerecord-cli/src/generate-manifest.ts`,
  #2705 finding)
- **`ar console` / `ar runner` empty-config error** (~30 LOC). Neither command
  errors when `configsFor()` returns an empty array for the requested
  environment. `db:*` commands do error. Fix: add the same guard for Rails
  fidelity. (`console.ts`, `runner.ts`, #2736 finding)
- **E2E shared helpers** (~30–50 LOC). The three E2E suites
  (`sqlite-happy-path`, `postgres-happy-path`, `mysql-happy-path`) each
  copy a tmp-dir scaffold + `DatabaseTasks` teardown block inline. Extract into
  `src/__e2e__/helpers.ts`. No behavior change. (#2752 finding)
- **`ar init` `--driver node-sqlite`** (~5 LOC). `ar new` supports
  `--driver node-sqlite`; `ar init` always scaffolds `better-sqlite3` config.
  Low priority — `ar new` covers the new-project case. (#2741 finding)

### Tracked elsewhere (do not duplicate)

- **DatabaseTasks P3-5** (`migrateStatus` stdout) — already in "Unblocked" above.
- **Global Arel visitor removal** — tracked in `adapter-architecture-cleanup.md`.

## Query-cache mixin — COMPLETE (#2662, #2672, #2684)

All three phases of the former `query-cache-mixin-plan.md` shipped: the live
mixin cache is wired into the query path (Phase 1, #2662), the pool-based
`ActiveRecord::QueryCache` class exists (Phase 2, #2672), and the legacy
`QueryCacheAdapter` wrapper was deleted with `run`/`complete` simplified to
pool-only (Phase 3, #2684). Residual `[ ]` items are the gated
connection-pool follow-ups listed above. **Do not reopen the wrapper.**

## DatabaseTasks — Phase 2/3 COMPLETE except P3-5

Phase 1 (#2704–#2723) removed the `_adapterInstance`/`setAdapter` bypass and
hit 100% api:compare on tasks files. Phase 2 (P2-1…P2-8) shipped (#2729–#2737);
Phase 3 P3-1/P3-2 (#2738) and P3-4 SCOPE filtering (#2740) shipped; the
`migrate:status` table shipped at the CLI layer (#2743). Only the **P3-5**
Rails-fidelity residual (move the `puts` into `DatabaseTasks.migrateStatus()`
itself, listed under "Unblocked" above) remains.
