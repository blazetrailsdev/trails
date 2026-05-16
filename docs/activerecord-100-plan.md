# ActiveRecord post-100% — fidelity tracker

**Snapshot 2026-05-16:** `activerecord 4956/4958 methods (100% rounded) | files: 275/275 | inheritance: 210/210 (100%) | activemodel 621/621 (100%)`. Public surface is closed; the 2 outstanding methods are residual privates. test:compare currently at **6568/7885 tests (83.3%)**, 1296 skipped.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. PRs target ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`.

For workflow + BLOCKED-annotation vocab + audit conventions, see [`test-compare-100-plan.md`](test-compare-100-plan.md).

---

## Story count

~99 queued batches, ~17.5k LOC. Batches numbered sequentially; the next-to-ship is the lowest-numbered open batch. test:compare standing at 6568/7885 (83.3%) per snapshot above. GitHub is the source of truth for which batches have PRs in flight — search `feat(activerecord): batch N` in open PRs.

The `as any` legacy-cast cleanup sweep has been **superseded by `docs/activerecord-type-audit.md`** — the type-audit's 4-wave plan covers the same `(record as any)._readAttribute` / `.save` / `.destroy` removals more precisely. The 2 `bug-suspected` candidates remain in batches below for surgical verification.

---

## Queued batches

Bundled work-PR slots ready to spawn. Items removed as batches ship.

### Batch 2 — PG virtual-column emit pipeline (~110 LOC, risk: medium)

**Theme:** One Rails source surface — `postgresql/schema-statements.rb` columnSpec + `schema_dumper.rb#emit_table`. Unblocks test_non_persisted_column, test_change_table, test_schema_dumping.

- ~15–30 LOC — Route `addColumn` through `schemaCreation.accept(AddColumnDefinition)`; fix `visitColumnDefinition` to call `addColumnOptionsBang` instead of `addColumnOptions`.
- ~30–80 LOC — Rewire `emitTable` to use connection-adapter `columnSpec` / `prepareColumnOptions`.
- ~20 LOC — Emit non-PK column `defaultFunction` as `default: () => "fn()"` in `emitTable`, mirroring the PK path.
- ~30 LOC — Make `SchemaDumper.dumpTableSchema(adapter, ...)` instantiate the adapter's `createSchemaDumper()` class rather than the base.

### Batch 3 — PG schema-dump table/partition polish (~80 LOC, risk: low)

**Sequencing:** Depends on Batch 2 (#1726). Spawn after #1726 merges.

- ~30 LOC — Wire `tableOptions()` into `schema-dumper.ts:emitTable`. Requires making the dump loop async.
- ~30 LOC — PG table comment schema dump: forward `adapterTableOpts.comment` in `emitTable`; add `COMMENT ON TABLE` emission after `createTable`.
- ~20 LOC — PARTITION BY schema dump: 2 `BLOCKED: adapter-pg` partition tests in `SchemaCreateTableOptionsTest` flow through the same `fetchTableOptions → options:` path; need `tablePartitionDefinition` wired correctly + test bodies.

### Batch 10 — Reflection Slot A + B + Rails-name parity (~115 LOC, risk: low)

**Theme:** Single Rails source `reflection.rb`.

- ~30 LOC — Wire `ensureOptionNotGivenAsClassBang` into ThroughReflection / source-type validation path.
- ~50 LOC — `static set primaryKey(null)` semantics + `Edge` fixture.
- ~15 LOC — Annotation refresh on 22 remaining `reflection.test.ts` stubs.
- ~5 LOC — `getPrimaryKeyAttr` returns `_primaryKey ?? "id"`, blocking a truly null PK. Rails supports `self.primary_key = nil`.
- ~5 LOC — `UnknownPrimaryKey` message format and no-arg constructor.
- ~10 LOC — `AbstractReflection#checkValidityOfInverseBang` uses `(this as any).inverseName?.()`. Protected accessor would be cleaner.
- ~3 LOC — `joinScope` in `AbstractReflection` throws plain `Error`.

### Batch 14 — Autosave E-series CPK + nested-attributes (~80 LOC, risk: low)

**Theme:** Composite-PK reach into autosave + nested-attributes plumbing.

- ~20 LOC — `queryConstraintsList` returns `ctor.primaryKey` as a string array when `_queryConstraintsList` is unset but `ctor.primaryKey` is composite. Eliminates scalar-fallback workaround in `autosaveHasOne`.
- ~30 LOC — Un-skip CPK `assign ids with belongs to cpk model` + companion: CPK-aware `setIds` (composite ID tuple support).
- ~20 LOC — Populate `nestedAttributesTarget` from `assignNestedAttributes` so `:nested_attributes_order` becomes functional (dead code in `nested-error.ts:48-52`).

### Batch 15 — Autosave polymorphic-inverse (~80 LOC, risk: medium)

**Theme:** 4 polymorphic-inverse tests + auto-detected `inverseOf`.

- ~50–80 LOC — Un-skip 4 polymorphic-inverse tests: polymorphic inverse-of swap detection in `has-one-association.ts` + auto-detected `inverseOf`.

### Batch 16 — Autosave validateAssociations refactor (~190 LOC, risk: medium-high)

**Theme:** Structural collapse of duplicated validation paths.

- ~40 LOC — Remove `!isNewRecord && !changed` short-circuit in `validateAssociations` + add Rails `associated_errors` filter. Unchanged children with cached NestedErrors don't re-propagate today.
- ~150 LOC — Collapse `validateAssociations` and per-reflection `validate*Association` callbacks into a single `add_autosave_association_callbacks` dispatch.

### Batch 17 — Autosave indexed-error I18n (gated, ~80 LOC)

**Gated on:** I18n full-message customize wiring landing first.

- ~80 LOC — Rewrite the two "indexed errors should be properly translated" tests against a real I18n backend.

### Batch 18 — Reflection residual cleanup (~35 LOC, risk: low)

- ~5 LOC — Delete dead `createReflection` in `reflection.ts:1772` (now-stale asymmetry vs `Reflection.create`).
- ~30 LOC — Deeply nested through-association resolution in `CollectionProxy._buildThroughScope` (through-a-through beyond one level). Not exercised by tests today.

Watchpoint: the `_invalidateAssociationIds → assocInstance.reset()` widening fires for every through-association push.

### Batch 19 — Reflection Slot C fixtures (~150 LOC, risk: low)

**Theme:** Hotel/Department/Chef/CakeDesigner/DrinkDesigner fixture + `reflect on missing source association raise exception` un-skip.

- ~150 LOC — Remaining fixture build-out for source-association tests.

3 const_missing/NameError tests → unported-list candidates (Ruby-only).

### Batch 20 — Associations-core composite-FK autosave (~245 LOC, risk: medium-high)

**Theme:** Composite-FK reach into HMT writes + belongs_to autosave registration.

- ~80–120 LOC — Composite-FK has-many-through write support. Drop `Array.isArray(ownerFk) throw` at `collection-proxy.ts:1032-1041` (`_pushThrough`) + `:1267-1271` (`_deleteThroughAllSql`); replace with composite-aware loops.
- ~30–60 LOC — Default-on `belongs_to` autosave callback registration: move `addAutosaveAssociationCallbacks` out of `if (options.autosave)` guard in `builder/belongs-to.ts:56-58`. Risk: every existing belongs_to gains a before_save lambda; needs full test run.
- ~10 LOC — `_autosaveBelongsTo` shape-mismatch behavior: replace `else { throw CompositePrimaryKeyMismatchError }` with Rails-faithful `Array().zip()`.
- ~5 LOC — Extract `_resolveBelongsToForeignKey(assoc)` helper.
- ~30–60 LOC — Unify singular-association accessors in `associations.ts` (~lines 755-805 `loadHasOne`, 1880, 1920 `loadBelongsTo` getters) to consult `owner.association(name).target` when `loaded?` is true, then drop redundant `_preloadedAssociations.set(...)` in `preloader/association.ts#associateRecordsFromUnscoped`.

### Batch 21 — Associations-core queryConstraints + polymorphic (~230 LOC, risk: medium)

**Theme:** queryConstraints reach into polymorphic belongs_to + preload HMT + Relation+composite.

- ~50–80 LOC — Polymorphic belongs_to query_constraints: `loadBelongsTo` polymorphic path must add owner's shared key alongside scalar `parent_id`. Un-skips `polymorphic belongs to uses parent query constraints` at `associations.test.ts:2572`.
- ~80–120 LOC — Preload has-many-through with composite query_constraints. Un-skips `preload has many through association with composite query constraints` at `associations.test.ts:8318`.
- ~30–50 LOC — `AssociationQueryValue` Relation + composite FK: `queries()` array-FK branch still throws when value is a Relation. Gated on `Relation.pluck(primary_key)` with CPK support.
- ~30–50 LOC — `AssociationQueryValue.convertToId` array-PK branch: handle composite `primaryKey` when value is a record instance. Currently throws. Unblocks 2 "querying by whole/single associated records" tests.

### Batch 22 — Associations-core inverseOf wiring (~75 LOC, risk: low)

**Theme:** Auto-inverse population on collection load.

- ~30 LOC — Add `inversable?(record)` check to `AssociationRelation.toArray` + `loadHasMany`'s inverse-wiring loop. Unblocks 2 skipped tests.
- ~40–60 LOC — Extend automatic-inverse wiring to `loadHasMany`/`loadHasOne`/`loadBelongsTo` (currently only honor explicit `options.inverseOf`).
- ~5 LOC — Extract `wireInverseAssociation(child, name, owner)` helper.

### Batch 23 — Preloader-grouping STI + composite (~280 LOC, risk: medium)

**Theme:** Slot A preloader-grouping — 5 STI/through tests + 3 composite-FK preload tests.

- ~80–120 LOC — STI/through `available_records` bundle (5 tests skipped): `sti`, `with through association`, `only some records available with through`, `available records queries when scoped/collection/incomplete`. Needs test bodies + STI lookup fix.
- ~120 LOC — Composite-FK preload bundle (3 tests skipped): `has many association with composite foreign key`, `belongs to ... composite foreign key`, `loaded belongs to ... composite foreign key`, `has many through with composite query constraints`. Loader infra supports `string[]`; needs CPK fixtures.

### Batch 24 — Preloader-grouping miscellaneous (~290 LOC, split if needed)

**Theme:** Slot A preloader-grouping — remaining tests (some larger).

- ~30 LOC — Un-skip `preload groups queries with same sql at second level` once an `extending` association option lands (test body otherwise ready).
- ~60 LOC — Un-skip `preload can group separate levels` with 3-query assertion (impl correct; needs body restored).
- ~40 LOC — Postesque fixture for `does not group same scope different key name` (needs different `joinPrimaryKey`).
- ~150 LOC — `preload can group multi level ping pong through` — large fixture (similar_posts + favorite_authors).

### Batch 25 — Associations-core test-body bundle (~70 LOC, risk: low)

**Theme:** Wired-but-skipped test body ports.

- ~20 LOC (C) — 2 "extensions" test bodies in `eager.test.ts` (extensions + instance dependent scope). Infra in place; needs models + assertions.
- ~30 LOC (B) — "preloads model with query_constraints by explicitly configured fk and pk" test body.
- ~20 LOC (D, gated on query-cache landing) — Update `reload with query cache` test bodies.

### Batch 26 — Associations-core stub upgrades (~125 LOC, risk: low)

**Theme:** Has-many associations test-file cleanup + Relation references infra.

- ~40 LOC (D) — Upgrade remaining size/empty stubs in `has-many-associations.test.ts` (lines ~1691–1791).
- ~5 LOC (A) — Add connection/adapter identity to `LoaderQuery.hashKey()` for multi-DB grouping isolation.
- ~80–120 LOC (C) — Implement `Relation#includes!`/`Relation#references!` infra for Rails-faithful `through_scope` path.

### Batch 28 — HMT Slot E nested-through JoinDependency (~180 LOC, risk: medium)

**Theme:** JoinDependency alias resolution for nested-through; closes 2–3 skipped tests in `nested-through-associations.test.ts`.

- ~80–150 LOC — JoinDependency alias resolution for nested-through. `Author.joins(:nested_through).where("far_table.col" => v)` emits FK on wrong intermediate table; closes tests at lines 1119, 1610, 1689.
- ~40–80 LOC — `sourceType` + user-`scope` on nested-through where `through:` is itself through with polymorphic source. Scope binds to wrong table.
- ~30 LOC — Verify `distinct` propagation on nested-through `loadHasManyThrough`.

### Batch 29 — HMT Slot D + A+B nested-through (~190 LOC, risk: medium)

**Theme:** Test coverage for JoinDependency + `_buildThroughScope` fix for nested-through chaining.

- ~30 LOC — Rails-mirrored test for `Author.joins(:ratings).where("ratings.value": N)` against nested-through chain (verifies JoinDependency, not preloader).
- ~20 LOC — `source_type` polymorphic-with-sourceType variant of nested-through preload test.
- ~10 LOC — `_dataAvailable()` / `runnableLoaders()` in `preloader/through-association.ts` only checks single source preloader layer. For 4+ level chains may emit one extra wasted pass.
- ~30–50 LOC (A) — `foreignKey` option on `has_many :through` is ignored in `ThroughReflection.joinPrimaryKey` (`reflection.ts:1205`). Rails uses `delegate_reflection` exclusively.
- ~30 LOC (B) — Regular (JOIN-based) `djMembersOrdered` / `djMembersDouble` produce wrong/unordered results when chaining `.where()` or `.reorder()`.
- ~80–120 LOC (B) — Fix `CollectionProxy._buildThroughScope()` for nested-through associations (where `through` target is itself a through). Option B (preferred): initialize CollectionProxy seed from `DisableJoinsAssociationScope`.

### Batch 30 — HMT Slot C constructor-form + reset_scope (~210 LOC, risk: medium)

**Theme:** Constructor-form collection writer + HMT insert_record alignment.

- ~80 LOC — Constructor-form collection writer in `_assignAttributes` (`attribute-assignment.ts:27`): detect when a key matches an association name (via `ctor._associations`) and dispatch to `setHasMany`/`setHasOne`/collection writer. Unblocks `new Owner({items: [...]})` Rails pattern.
- ~30 LOC — `association.reset_scope` on owner save. Add a no-op `resetScope()` on Association + invoke from `saveCollectionAssociation` before iterating children.
- ~100 LOC — HMT `insert_record` two-step alignment. Replace `insertHabtmRecord`'s single-row write with Rails' two-step (super.insertRecord → `save_through_record`).

### Batch 31 — HABTM Slot A readonly/validate (~140 LOC, risk: medium)

**Theme:** `readonly: true` + `validate: false` HABTM options.

- ~60 LOC (D) — `readonly: true` HABTM option to mark all loaded records as `ReadOnlyRecord` (raises on `save!`). Un-skips `dynamic find all should respect readonly access`.
- ~80 LOC (D) — `validate: false` on push/create path to suppress validation callbacks on the pushed record. Un-skips `association with validate false does not run associated validation callbacks on create/update`.
- ~10 LOC — Wire `_raiseOnTypeMismatch` into `appendBang` → `_pushThrough` path.
- ~10 LOC — Type guard at top of `isInclude` (`return false unless record instanceof klass`).
- ~30 LOC — `include_in_memory?` through-chain walk for through associations.

### Batch 32 — HABTM Slot B+C cross-cutting scope helper (~95 LOC, risk: low)

**Theme:** `applyAssociationScope` helper + builder-time scope wiring.

- ~20 LOC — `applyAssociationScope(rel, scope, owner)` helper handling arity (0/1/2-arity) + falsy-return fallback. Swap 6 call sites: `loadHabtm`, `loadHasMany`, `loadHasOne`, `loadHasManyThrough` (×3).
- ~50 LOC — `Associations.hasAndBelongsToMany` builder-time `scope` (captured in `habtmOptions` but never reapplied) → wire into the reflection so `loadHabtm` auto-applies.
- ~20 LOC — `insertHabtmRecord` uses `throughModel.insertAll([joinAttrs])` which bypasses validation; Rails' `habtm_writer` uses `record.save(validate: validate)`.
- Sweep — verify `_associationIds` cache invalidation on `destroyAll` and explicit `clear()`.

### Batch 33 — HABTM Slot D options + parent_reflection (~140 LOC, risk: medium)

- ~50 LOC — Wire `defineAutosaveValidationCallbacks` unconditionally on HABTM reflections at declaration time (currently gated by `options.autosave` at `associations.ts:340-343`). Un-skips two `validate: false … callbacks` tests.
- ~30 LOC — Add `parent_reflection` field to MiddleReflection / target hasMany reflection in HABTM builder (Rails `associations.rb:1884, 1905`).
- ~20 LOC — Tighten `habtmOptions → middle hasMany` to Rails' explicit allowlist; drop leakage of `readonly`/`dependent`/`inverseOf`.
- ~40 LOC — Move HABTM `beforeDestroy` into anonymous `destroy_associations` override mixin (Rails-shape).

### Batch 34 — HABTM Slot E preloader polymorphic (~110 LOC, risk: medium)

- ~30–80 LOC — Preloader already-loaded-through + polymorphic-sourceType empty-result gap (`preloader/through-association.ts:56-71`). Reproducer: Hotel → Departments → Chefs → employable[CakeDesigner].
- ~50 LOC — Single-through (non-nested) polymorphic+sourceType test variant covering `AssociationScope` direct JOIN path.
- ~30 LOC — Normalize/unblock 12 `it.skip` stubs in `nested-through-associations.test.ts` tagged `BLOCKED: associations — nested-attributes feature gap`.

### Batch 35 — HABTM Slot F primary_key + through-table (~100 LOC, risk: medium)

- ~20 LOC — Align HABTM `primaryKey` behavior: `loadHabtm`/`habtmOwnerPk` honors `options.primaryKey` but JoinDependency eager-load passes `modelClass.primaryKey`. Rails macro intentionally doesn't forward `:primary_key`. Drop `habtmOwnerPk` primaryKey override.
- ~30 LOC — Real-table-name reuse in `_addThroughAssociation`: mirror collision-check from `addAssociation` (lines 216-217). Affects all through associations.
- ~50 LOC — Schema-qualified HABTM tables (`"schema.table"` → `"schema"."table"`).

### Batch 36 — HABTM Slot G counter-cache (~100 LOC, risk: low)

- ~30 LOC — Apply copy-on-write Set semantics to `_counterCacheColumns` in `belongs-to.ts:78-81` and `counter-cache.ts:222-236`. Parallel STI-inheritance bug.
- ~20 LOC — Write body for `counter-cache.test.ts:1134` (has_many :through counter cache).
- ~50 LOC — Triage 14 other `BLOCKED: associations — counter cache not fully implemented` stubs in `counter-cache.test.ts` (lines 416, 643, 701, 707, 1213, 1381–1493).

### Batch 37 — HABTM Slot H structural (~200 LOC, risk: high)

**Theme:** Wiring `associationForeignKey` + `destroyAssociations` + distinct reflection.

- ~50 LOC — Wire `associationForeignKey` end-to-end through `createHabtmJoinModel` (target FK on right belongs_to) and `_resolveHabtmJoin`/`loadHabtm`. Today hardcoded as `${underscore(singularize(name))}_id`.
- ~30 LOC — Pass `options.foreignKey` into middle reflection options.
- ~80 LOC — Wire `destroyAssociations` stub in `persistence.ts:1221` into the destroy flow. Then refactor HABTM `beforeDestroy` to `destroy_associations` override module.
- ~40 LOC — Produce distinct hasMany-through reflection for public name (Rails' `has_many name, **hm_options`).

### Batch 38 — HABTM Slot I scope_for_create (~40 LOC, risk: low)

- ~40 LOC — Centralize scope_for_create on base `Association#initializeAttributes`: read `scope_for_create`, filter by `record.changedAttributeNamesToSave` minus `skipAssign` keys, `_assignAttributes`. Closes 2 deviations + singular gap.

### Batch 39 — HABTM annotation drift sweep (~tests-only)

**Theme:** Re-tag mis-labeled `BLOCKED: habtm` tests. ~160 of 168 are mis-tagged.

- Re-tag across `has-and-belongs-to-many-associations.test.ts`, `eager.test.ts`, `nested-through-associations.test.ts`, `extension.test.ts`, `inner-join-association.test.ts`, `has-many-associations.test.ts`. Mirror #1641's STI annotation drift workflow.

### Batch 40 — Migration Slot F invertibility (~140 LOC, risk: medium)

- ~20 LOC — `Migration.removeColumns` / `Migration.addColumns` `_recording` guards so they're recorded during `change()` and properly invertible.
- ~80 LOC — 3 BulkAlterTableMigrationsTest PG un-skips: move "changing columns", "changing column null with default", "default functions on columns" to `describeIfPg` in `adapters/postgresql/change-schema.test.ts`.
- ~10 LOC — "updating auto increment" MySQL skip → move to MySQL adapter suite.
- ~30 LOC — `Migration.changeTable` delegate to `CommandRecorder.changeTable` in recording mode.

### Batch 42 — Migration older B/E larger items (~130 LOC, risk: medium)

- ~20 LOC (E) — `MigrationContext.fromPath(dir)` factory wrapping `migrationFiles` + `parseMigrationFilename` + camelize → `MigrationProxy[]`.
- ~30 LOC (B) — CTAS `_introspectColumns` returns name-only; `_columnMeta` stored as `{type:"string"}` for any CREATE TABLE AS column. Wrong type metadata downstream.
- ~30 LOC (E) — `migrationsStatus()` should emit `{status:"up", version, name:"********** NO FILE **********"}` entries for schema_migrations versions absent from `this._migrations`.
- ~50 LOC (B) — Extend prefix/suffix regression coverage to `removeColumn`, `add/removeIndex`, `add/removeForeignKey`, `add/removeCheckConstraint`, `add/removeReference`, `create/dropJoinTable`, `changeColumn*`, `renameIndex`, inspection helpers, comment helpers.

### Batch 43 — Connection-pool Slot C-c (~85 LOC, risk: medium)

- ~50–80 LOC — Wire `adapterFactory` inside `connectsTo` (`connection-handling.ts`) so pools established via `connectsTo` can create real connections.
- 3 "swapping shards in a multi threaded environment" tests → move to `skip-list.ts` (~5 LOC).

### Batch 45 — Connection-pool sync #1473 leak audit (~105 LOC, risk: medium-high)

**Sequencing:** Leak fix is high-blast-radius prerequisite for `checkoutTimeout` opt-in removal.

- ~50 LOC — Audit + fix connection-leak patterns in test suite. `establish-connection.test.ts` and similar call `pool.checkout()` without `pool.checkin()`. Was the root cause of OOM that delayed #1473.
- ~10 LOC — Remove the `options.checkoutTimeout !== undefined` opt-in guard once test-suite leaks are fixed; always use `checkoutAsync`. Rails-correct behavior.
- ~20 LOC — Pattern duplication in `withConnection`: then-detect + cleanup inlined three times.
- ~5 LOC — `buildAsyncExecutor` returns `null` (connection-pool.ts:~986); should be a Promise-bounded semaphore.
- ~20 LOC — `ExecutorHooks.complete()` resolver not wired to `Base.connectionHandler` yet (pending ConnectionHandler PR 6).

### Batch 46 — MySQL schema Slot C ANSI quotes (~45 LOC, risk: medium)

- ~10 LOC — Extend `scripts/test-compare/extract-ts-tests.ts` to parse `it.skipIf(expr)("name", fn)` callable form.
- ~30–50 LOC — `MySQLAnsiQuotesTest` un-skip: adapter-level `setSessionVariable` (or expose `execute("SET SESSION sql_mode='ANSI_QUOTES'")` cleanly) plus a `reconnect!` test hook. Also touches parser/quoting path for double-quoted identifiers under ANSI_QUOTES. Add `lessons_students`/`students` schema for `foreign_keys` test + a `topics` table for `primary_key` test.
- ~5 LOC — `Mysql2Adapter.currentDatabase()` override (currently inherits abstract's empty `""`). Mirrors PG's `postgresql-adapter.ts:4218`.

### Batch 48 — MySQL active-schema Slot D + MariaDB indexes() (~140 LOC, risk: medium)

- ~50 LOC — `CommandRecorder#changeTable` inversion support. Today the Proxy recorder used in the bulk path records DDL calls but doesn't support `inverse_of`.
- ~20 LOC — Verify MariaDB CI passes timestamps tests cleanly post-merge.
- ~30 LOC — Extract MySQL `buildCreateIndexDefinition` pre-flight into a shared helper consumed by both `AbstractMysqlAdapter.buildCreateIndexDefinition` and `MysqlSchemaStatements.addIndex`.
- ~40 LOC — Refactor abstract `SchemaStatements.addIndex` (`abstract/schema-statements.ts:257`) to delegate to `buildCreateIndexDefinition` (Rails' `AbstractAdapter#add_index` does).

### Batch 49 — MySQL active-schema B unsigned + timestamps (~45 LOC, risk: low)

- ~10 LOC — `typeToSql` `unsigned` suffix: append `" unsigned"` when `options.unsigned && type !== "primary_key"`. Unblocks unsigned integer column migrations.
- ~30 LOC — `addTimestamps`/`removeTimestamps` DDL type-check.
- ~5 LOC — Typed capability-delegation helper in `test-adapter.ts` for `supportsIndexesInCreate?.()`-style optional methods.

### Batch 50 — MySQL mysql2-adapter B+C fidelity (~170 LOC, risk: medium)

- ~30 LOC — Wire 4 lock/range/canceled cases into `AbstractMysqlAdapter._translateException`: `ER_LOCK_DEADLOCK`→`Deadlocked`, `ER_LOCK_WAIT_TIMEOUT`→`LockWaitTimeout`, `ER_QUERY_INTERRUPTED`→`QueryCanceled`, `ER_OUT_OF_RANGE`→`RangeError`.
- ~80 LOC — `Mysql2Adapter` `ConnectionError` branch + abstract `when nil → ConnectionNotEstablished`. Verify/add `DatabaseAlreadyExists` for `ER_DB_CREATE_EXISTS`.
- ~30 LOC — Wire `Rails.error.report` for `report` warning action (joint with PG `_flushWarnings`'s `TODO(report)`). Blocked on global ErrorReporter singleton.
- ~20 LOC — Hoist `CLIENT_NOT_CONNECTED_RE` into `isClientNotConnected(e)` predicate.
- ~10 LOC — When `Mysql2Adapter#configureConnection` no-op gets real impl, set `database_timezone`-equivalent state from `getDefaultTimezone()`.

### Batch 51 — MySQL onUpdate optional refactor (~40 LOC, risk: low)

Route `renameColumnForAlter` through `columnFor` like Rails (`abstract_mysql_adapter.rb:863-878`) and extend `newColumnFromField` so `on_update` and compound `DEFAULT_GENERATED on update X` cases keep flowing through. Centralizes function-default logic. Net structural win, no behavior change. Includes ~5 LOC widening of `meta.extra === "DEFAULT_GENERATED"` strict equality to startsWith/regex.

### Batch 52 — MySQL charset-collation residual (~165 LOC, gated on SchemaDumpingHelper)

**Gated on:** `SchemaDumpingHelper#dump_table_schema` port (live-DB schema-dump → string).

- ~15 LOC — Port `schema dump includes collation` test (Rails `charset_collation_test.rb:79-84`) to `charset-collation.test.ts`.
- ~150 LOC — Targeted SQL-fragment unit tests for the 4 #1568 helpers (DROP-vs-SET default fragment, undefined→null normalization at both sites, NULL-backfill UPDATE shape, comment-clearing). `abstract-mysql-adapter.test.ts` is live-DB only.

Adjacent gap: `abstract-mysql-adapter.ts` `buildCreateIndexDefinition` is a stub returning `{}`.

### Batch 53 — PG UUID Slot B associations + UUID FK binding (~250 LOC, risk: medium)

Plus: 1 test references "migration framework" gap — leave skipped with sharpened annotation.

### Batch 54 — PG virtual-column structural (~120 LOC, risk: medium)

- ~10 LOC — `addColumn` virtual + `comment` option: live-PG test that `changeColumnComment` reaches `pg_description` for virtual columns.
- ~10 LOC — Un-skip `schema dumping` test (`adapters/postgresql/virtual-column.test.ts:90`): `schema-dumper.ts:emitTable` bypasses `prepareColumnOptions` for virtual columns so `as`/`stored` never reach output.
- ~30 LOC — `_schemaLoadPromise` STI cascade regression test (`model-schema.ts:512–541`). Promote `_schemaLoadPromise` onto `SchemaHost` proper to remove the cast.
- ~80 LOC — Retire `SimpleTableBuilder` (`postgresql-adapter.ts:5180+`) and unify `addColumn` + `createTable` virtual paths through `schemaCreation.accept(...)` visitor.

PG 18 will need `_pgGeneratedClause` server-version gate for `stored: false` → `VIRTUAL`. Single point of change.

### Batch 55 — PG interval secondary cleanups (~50 LOC, risk: low)

**Not in Batch 5.** Optional / cosmetic.

- ~50 LOC (low priority) — Refactor `SchemaDumper.columns()` to route `col.default` through `col.castType?.typeCastForSchema` when available; drop the `Duration` branch from `cleanDefault`. Auto-handles any future type with lossy `toString()`.
- ~50 LOC (optional) — `splitPgDefault` cast-aware numeric→Duration for `pg_get_expr` bare numerics → verbose-format deserialize. **Note:** "bare numeric" theory may itself be a misdiagnosis (per #1637); verify against PG 17+ first.
- ~5 LOC (cosmetic) — Once `t.interval(...)` DSL helper exists, simplify test regex to single alternative.
- Sweep — remove other BLOCKED comments around the codebase referencing the now-disproven `pg_get_expr returns bare numeric` theory.

### Batch 56 — PG long-tail Slot E+F+H small (~105 LOC, risk: low)

- ~5 LOC (H) — Generalize `PostgreSQLAdapter.nativeType("datetime")` (~line 4066) to delegate to `this.nativeDatabaseTypes()["datetime"]` instead of `=== "timestamptz"` special-case.
- ~10 LOC (E) — `schema load scoped to schemas` un-skip (needs `schema-cache.ts` clear).
- ~20 LOC (E) — `schema dump scoped to schemas` un-skip: `enumTypes()` returns schema-qualified names for non-public schemas.
- ~20 LOC (F) — Wire `type_for_attribute(column).deserialize(value)` for returned column values.
- ~50 LOC (F) — PG-specific `fills auto populated columns on creation` test for single-PK IDENTITY (Rails `persistence_test.rb:87`).

### Batch 57 — PG long-tail pgColumn type sweep (~30 LOC, risk: low)

- ~30 LOC (E) — Audit `pgColumn` usages (`bit`, `bitVarying`, `xml`, `hstore`, `inet`, `cidr`, `macaddr`, `ltree`, `tsvector`, `tsrange`, etc.) for `col.type ≠ SQL type` gap in `toSql()`. Override `toSql()` in `PgTableDefinition` or change `pgColumn` to store SQL type directly.

Notes (folded into this batch as test cleanup):

- 3 stub tests in `cidr.test.ts` (`cidr column`, `cidr type cast`, `cidr invalid`) have no Rails source backing. Find counterparts or delete.
- Possible missing file: `adapters/postgresql/inet.test.ts` mirroring Rails' `inet_test.rb`.
- `type-registry.ts` now maps `inet`/`cidr` → `IPAddr`; any DX type tests asserting `string` need updates.

### Batch 58 — PG long-tail IPv6 canonicalization (~150 LOC, risk: medium)

- ~100–150 LOC (G) — IPv6 canonicalization in `parseIpAddr`: lowercase hex + RFC 5952 compression so `isChanged`/`serialize` match Ruby's `IPAddr#eql?`. Today preserves caller's text; spurious dirty marks possible on manually-constructed IPv6. Inline expander/compressor required (no `node:net` — blocked by browser-compat).

### Batch 59 — PG long-tail returningColumnsForInsert (~150 LOC, risk: medium-high)

- ~150 LOC (F) — Implement `Model._returningColumnsForInsert(connection)` mirroring Rails `model_schema.rb`. Calls `connection.returnValueAfterInsert?(col)` per column (needs `Column#autoPopulated?` + `AbstractAdapter#returnValueAfterInsert?`). Passes explicit `returning:` to `execInsert`. Fixes composite-PK IDENTITY columns not named `id` and handles `DEFAULT gen_random_uuid()`. Today `executeMutation` hardcodes `RETURNING id`. Remove `_performInsert` comment in `base.ts` once landed.

Money slot left 3 BLOCKED tests pointing at generic Relation gaps (`sum`/`pluck` typecast on SQL expressions + `updateAll` BigDecimal serialize). Fold into Relation cluster.

### Batch 60 — PG-adapter execInsert unify (~40 LOC, risk: low)

- ~10 LOC — Promote `_instrumentedQueryOnClient` to a named internal helper and dedupe with `execQuery`'s inner lambda.
- ~30 LOC — Unify `execInsert` paths: abstract default (`abstract/database-statements.ts:1375`) bypasses `sqlForInsert` entirely; a separate standalone `execInsert` function (line 390) does the right thing but isn't wired. Wire it in. Then the PG-specific `pk === false` scaffolding (#1567) can be removed.

### Batch 61 — PG datatype + citext aftermath (~50 LOC, risk: low)

- ~15 LOC — Register remaining Rails-listed PG types: `Bytea` (as `:binary`), `Date`, `DateTime`, `Decimal`, `Enum`, `LegacyPoint`, `Vector`. Verify which actually matter end-user-facing first.
- ~5 LOC — `schema-dumper.ts` spot-check `t.uuid(...)`, `t.cidr(...)`, `t.point(...)` emission round-trips.
- ~10 LOC — SchemaCache null-pool guard audit on `primaryKeys`/`indexes`/`dataSources`/`views`.
- ~10 LOC — Lift `columnForAttribute` schema-vs-attribute distinction into JSDoc on `model-schema.ts:493`.
- ~10 LOC — `delegated_type.test.ts` `touch account` test blocked on UUID PK + polymorphic touch.

### Batch 62 — PG schema-statements mixin + integration (~80 LOC, risk: medium)

- ~30 LOC — Rewire PG mixin chain so `PostgreSQLAdapter#dropTable` delegate can be deleted. Add per-adapter `include(PostgreSQLAdapter, ...)` for PG-specific schema-statements methods. Mirrors Rails' `include PostgreSQL::SchemaStatements`.
- ~50 LOC — Live PG integration test for `dropTable("parent", { force: "cascade" })` end-to-end. Current tests use a fake adapter.

### Batch 63 — PG UUID Slot C uniqueness async (~60 LOC, risk: medium)

- ~30 LOC — `caseInsensitiveComparison` is async on PG (queries `pg_proc`) but `UniquenessValidator.buildRelation` is sync. **Concrete consequence:** for any non-string non-UUID column type where `canPerformCaseInsensitiveComparisonFor` returns false, `buildRelation` currently passes a `Promise` to `base.where()`, throwing `ArgumentError: Unsupported argument type`. UUID is fixed; other types are latent. Fix options: (a) make `buildRelation` async; (b) expose a sync `canPerformCaseInsensitiveComparisonForSync`.
- ~10–30 LOC audit — `typeObj?.type` was caught as a CI bug post-open (`Uuid.type` is a method, not a property). Audit other `.type` reads off type objects across the codebase.

### Batch 64 — PG connection Slot A + D (~63 LOC, mixed risk)

- ~10 LOC — `statement_name` in `sql.active_record` payload for PG prepared-statement path (`_runQuery` / `execQuery` with `prepare: true`). Unblocks "statement key is logged" test.
- ~30 LOC — `prepare: false` with binds — needs `QueryAttribute`-style bind objects with a `prepare: false` exec path wired through `execQuery`. Unblocks `prepare false with binds` test.
- ~3 LOC — `tableAliasLength()` override on `PostgreSQLAdapter` returning `this.maxIdentifierLength()`. Blocked by base-class sync `number` return — would widen to `Promise<number> | number`.
- ~20 LOC — `connection-pool.ts:449,505,522` call `connection.verifyBang()` without `await`. Post-#1464 the PG override is async.
- Test-infra refactor — Move `SQLSubscriber` from `adapters/postgresql/test-helper.ts` to a shared location when `adapters/abstract-mysql-adapter/connection.test.ts` is un-skipped.

### Batch 65 — PG infinity carry-over (~95 LOC, risk: medium)

- ~80 LOC — `InTimeZone` test helper + `Base.timeZoneAwareAttributes` wiring + `TimeZoneConverter` sentinel-aware wrapping + `reset_column_information` lifecycle. Unblocks 1 remaining skipped infinity test (`assigning 'infinity' on a datetime column with TZ aware attributes`).
- ~5 LOC — Trace `temporalToBindString` PG infinity branch dead-or-not; delete if confirmed.
- ~10 LOC — Properly port `WhereClause#invert` so `buildNegated` doesn't need `callNegated` dispatch in handlers. `RangeHandler.callNegated` collapses to `node.invert()`.

### Batch 66 — PG json bypass + foreign-table (~85 LOC, risk: medium)

- ~5 LOC — Add a model-save round-trip test for TEXT columns with backslash values (e.g. `"a\\b"`) to exercise the Arel inline-quoting path. The regression test uses `executeMutation` (bind params) which doesn't touch `quote()`.
- ~5 LOC — `abstractQuote` Symbol branch still doubles backslashes without E-string.
- ~30–80 LOC — Wire `Base.primaryKey` to consult `adapter.primaryKey(tableName)` for tables without explicit PK (foreign tables). Touches `getPrimaryKeyAttr` `?? "id"` sentinel + `model-schema.ts` PK auto-detection. Un-skips 1 deferred test.

### Batch 67 — PG-adapter Slot C error reporter + splitPgDefault (~140 LOC, risk: medium)

- ~50 LOC — Railtie initializer constructing a default `ErrorReporter`, wiring a basic logger subscriber, calling `setErrorReporter()`. Closes the "Rails.error always exists" gap.
- ~60 LOC — Collapse `splitPgDefault` into `extractValueFromDefault` + `extractDefaultFunction` so parsing lives in the Rails-named instance methods. Update both call sites in `newColumnFromField` (~lines 2671 + 4310).
- ~30 LOC — Apply `:report` dispatch wiring to MySQL/SQLite `db_warnings_action` paths if/when they grow one.

### Batch 68 — Relation Slot H inBatches port (~120 LOC, risk: low)

- ~10 LOC — Wire `global_current_scope` into `_performUpdate` and `_destroyRow` in `base.ts`.
- ~30 LOC — `useRanges` range-optimization in `batchOnUnloadedRelation` (emit `WHERE id >= x AND id <= y`).
- ~50 LOC — Port 7 remaining `inBatches` test bodies (Subscriber fixture, PostWithDefaultScope, `assertQueriesMatch`, table-alias path).
- ~30 LOC — Port `find in batches should not error if config overridden` + `should error on config specified to error`.

### Batch 69 — Relation test-body bundle (~155 LOC, risk: low)

- ~30 LOC (E) — Port `find in batches should not error if config overridden` + `should error on config specified to error` test bodies.
- ~50–80 LOC (G) — Un-skip `registering new handlers for joins`: scoped association where-clause expansion should propagate custom handlers into the lambda's evaluation context.
- ~50 LOC (E) — Port 7 remaining test bodies: Subscriber fixture, PostWithDefaultScope, `assertQueriesMatch` infra, table-alias path.
- ~100 LOC (B) — Polymorphic test bodies for 7 wired-but-skipped tests in `where.test.ts` (~lines 1014–1073, 1962). Fixture work, not impl.

### Batch 70 — Relation core gaps bundle A (~110 LOC, risk: low)

- ~5 LOC (C) — Tighten `isPolymorphicClause` parameter type + fallback when `whereValuesHash` is absent.
- ~10 LOC (E) — Add `this.attribute("id", "integer")` to CPK test models to fix `id` hydration; un-skips 2 CPK start/finish tests.
- ~10 LOC (E) — `inBatches` should branch on `this._loaded` and call `_batchOnLoadedRelation`; helper exists, unwired.
- ~10 LOC (E) — `cursor` uniqueness validation: `ensureValidOptionsForBatchingBang` needs schema-cache access for PK/unique-index check.
- ~10 LOC (E) — `inBatches({ load: true })` should set batch order on yielded `batchRel`.
- ~10 LOC (D) — `defaultScopeOverride` detection for static-method form (no test coverage today).
- ~15 LOC (C) — `whereAssociated`/`whereMissing` for composite PKs (currently throws in `_resolveAssociationTarget`).
- ~15 LOC (E) — Implement `remaining` limit cap in `batchOnUnloadedRelation` (pass `limitValue` through).
- ~20 LOC (C) — Enum/scoped association support in `whereAssociated`/`whereMissing` for 10 remaining enum tests.

### Batch 71 — Relation core gaps bundle B (~80 LOC, risk: medium)

- ~20 LOC (D) — Wire `buildDefaultConstraint` into `_deleteRecord`/`_updateRecord` so `allQueries: true` adds WHERE on writes (defined-but-never-called today).
- ~30 LOC (E) — Implement `useRanges` range-optimization (Rails `WHERE id >= x AND id <= y` mode); re-expose the option.
- ~30 LOC (B) — CPK `AssociationQueryValue.queries()` Relation path still throws. Pragmatic deviation: subquery approach (same as non-CPK Relations).

### Batch 72 — Schema Slot I PG partitioning (~25 LOC, risk: low)

- ~5 LOC — Add `supportsNativePartitioning()` skip guard to `partitions.test.ts` tests (mirrors Rails `skip unless database_version >= 100000`).
- ~10 LOC — Drop or align extra `partition table` test in `partitions.test.ts` with Rails `partitions_test.rb` (Rails only has `test_partitions_table_exists`).
- ~10 LOC — Move `commented_table` round-trip into its own describe block.

### Batch 73 — Schema Slot J SchemaCache marshal + lazy (~185 LOC, risk: medium)

- ~30 LOC — Un-skip `marshal dump and load with ignored tables`: wire `ActiveRecord.schemaCacheIgnoredTables` config into `tablesToCache`/`addAll` (Rails `schema_cache.rb:436-438`).
- ~40 LOC — Un-skip `marshal dump and load with gzip` + `yaml dump and load with gzip` (gzip plumbing landed; tests assert Rails serialization shapes — need TS equivalent or rewrite to JSON+gzip).
- ~80 LOC — Un-skip `when lazily load schema cache is set cache is lazily populated when est connection` (needs lazy-load wiring on connection-pool establish).
- ~20 LOC — `yaml loads 5 1 dump` / `yaml loads 5 1 dump without indexes still queries for indexes`: drop as Rails-specific 5.1 YAML, or replicate fixture for JSON path.
- ~15 LOC — Unify `addTimestamps` to route through `addTimestampsForAlter` + single `executeMutation` (currently issues two `addColumn` calls vs Rails' one combined ALTER).

### Batch 74 — Schema Slot H-b includes/where promotion (~60 LOC, risk: medium)

- ~5 LOC — `whereBang` in `query-methods.ts` should call `PredicateBuilder.references(opts)` for hash args (Rails `where!` auto-adds table refs). Unblocks `includes(:assoc).where("assoc.col": val)` auto-promotion without explicit `.references()`.
- ~50 LOC — HABTM support in `JoinDependency.addAssociation` (currently returns null for `"hasAndBelongsToMany"` type). `_addHabtmAssociation` analog to `_addThroughAssociation`. Prereq for Rails-exact `Song.includes(:albums).where(...)` form.
- ~5 LOC — `defaultJoinTableName` in `associations.ts` should derive from `model.tableName` not class name; currently loses schema prefix for `music.songs`-style tables.

### Batch 75 — Schema Slot K annotation normalization (~tests-only)

**Lands AFTER H-b/I/J.** Annotation normalization across all 128 BLOCKED annotations.

Plus `schema change with prepared stmt` remains skipped (needs `adapter.preparedStatements` mode in PG test helper).

### Batch 76 — Schema cross-slot dumper + changeColumn (~95 LOC, risk: medium)

- ~10 LOC (H) — `SchemaDumper.dump(adapter)` static method instantiates base class, not `PgSchemaDumper`. Make `dump(adapter)` dispatch through `adapter.createSchemaDumper()` when available.
- ~15 LOC (F) — Wire `changeColumn` through `changeColumnForAlter` → `SchemaCreation#accept` (Rails routing).
- ~20 LOC (E) — `schema load scoped to schemas` un-skip: needs `schema-cache.ts#clear` invalidation.
- ~50 LOC (E) — `schema dump scoped to schemas` un-skip in enum.test.ts: `enumTypes()` schema-scoped filtering + `with_test_schema` infra.

### Batch 77 — Schema scoped dump deeper (~125-200 LOC, risk: medium)

- ~50–200 LOC (E) — `dumping schemas` / `dump foreign key targeting different schema` / `Active Record basics` (SchemaWithDotsTest) — root-caused to incomplete `schema.ts`. Fold into a schema-dumper-specific slot.

### Batch 78 — Schema-dumper recent batch #1472 (~30 LOC, risk: low)

- ~30 LOC — `MigrationContext.createTable` passes abstract `TableDefinition` to the callback; `t.exclusionConstraint`/`t.uniqueConstraint` aren't callable from schema-file blocks. Rails emits them inline. Fix: instantiate `PgTableDefinition` when `adapterName === "postgres"`, then exclusion/unique constraints can move inline. Closes the Sweep D Item 1 partial-ship.

### Batch 80 — Transactions wTRS + update-setter fidelity (~55 LOC, risk: medium)

- ~10 LOC — Un-skip `test_read_attribute_with_custom_primary_key_after_rollback` + `test_write_attribute_with_custom_primary_key_after_rollback` (same Movie fixture).
- ~10 LOC — Un-skip `restore previously new record after double save`: `_startTransactionState` snapshot is re-taken per wTRS call.
- ~15 LOC — Un-skip `test_assign_custom_primary_key_after_rollback` (Movie create → tx update PK → rollback). Unblocked by wTRS fix.
- ~20 LOC — Deeper `update should rollback on failure!` fidelity: needs `update()` to call property setters (not just `writeAttribute`) so `replyIds: []` collection-clear works inline. Pre-existing: Rails `assign_attributes` calls setters; our writeAttribute loop doesn't.

### Batch 81 — Transactions dirty-tracking new-record rollback (~50 LOC, risk: high)

- ~50 LOC — Dirty-tracking for new-record rollback: `topic.changes["title"]` returns `undefined` instead of `[null, "Jeff"]` after rollback. Root cause deeper than sweep A's guard fix — `state.attributes` snapshot in `rememberTransactionRecordState` captures user-written values, so `redetectChanges` produces no diff. Fix: snapshot _DB-original_ values (null for unsaved new records), or add separate DB-original tracking.

### Batch 86 — Unknown-triage deferred (~230 LOC, risk: medium)

- ~80 LOC — Misc small feature closes.
- ~150 LOC — Timezone-aware attribute methods.

### Batch 87 — STI annotation drift (~20 LOC, tests-only)

audit-STI found **no STI implementation gap**. All 6 `BLOCKED: STI` tests are mis-labeled — real causes are missing fixture scopes, UUID PK + touch on polymorphic delegated_type, and PG `CREATE TABLE … INHERITS` schema-dump. Single tests-only PR re-annotates the 6 tests under correct categories.

### Batch 88 — NIE annotation completion + ESLint extension (~35 LOC, risk: low)

- ~30 LOC — `rails=file:line` annotations on the 30 sites that carry only file paths. Mechanical follow-up; speeds eventual port-real work.
- ~5 LOC — Extend the `blazetrails/nie-requires-annotation` ESLint rule to other Rails-mirroring packages (actionpack, actionview, activemodel, activesupport, arel). None currently has NIE throws.
- Optional — companion warn-rule on `disposition=TODO` so unclassified throws can't sit indefinitely.

Track ongoing port-real progress via `grep "@nie disposition=port-real" packages/activerecord/src/`. 23 sites total; folded into cluster slots (mysql-mysql2-adapter ×4, mysql-charset-collation ×3, pg-long-tail ×3, relation ×3, +10 abstract).

### Batch 89 — Unported-list additions (~30 LOC, tests-only)

Mechanical: add to `scripts/api-compare/unported-files.ts` as `PERMANENT-SKIP`.

- `sqlite3-adapter.test.ts` — `read_uncommitted` cross-connection test (better-sqlite3 single-process model).
- `sqlite3-adapter.test.ts` — `loadExtension` / `supports_extensions` (driver doesn't expose).
- `modules.test.ts` (×7), `mixin.test.ts` (×2), `base.test.ts` (×1) — Ruby `Module#prepend` / `singleton_class` / `Module#ancestors` / constant-path-lookup semantics.

### Batch 90 — AR query-parity datetime precision (~80 LOC, risk: medium)

**Goal:** `Order.where(created_at: oneWeekAgo..now).toSql()` emits second-precision SQL matching Rails' `quoted_date` (no fractional seconds for unscaled DATETIME columns).

**Root cause.** Trails inlines dates from `Quoted` nodes with full precision. Added bind extraction for `compileWithBinds`, but `toSql()` still inlines.

**Options:**

- **Option A (BindParam-first, ~80 LOC):** In `predicate-builder/basic-object-handler.ts` + `range-handler.ts`, wrap Date values in `new Nodes.BindParam(queryAttribute)` instead of `Quoted`. Add a `quotedDateForBind` branch in `visitBindParam` that truncates to seconds. Don't change `visitQuoted` (INSERT precision preserved).
- **Option B (parity-runner side):** `paramSql` + binds comparison would close this in the diff layer without trails code changes.

**Risk:** Medium — touches every WHERE clause in the suite. Files (Option A): `predicate-builder/basic-object-handler.ts`, `predicate-builder/range-handler.ts`, `arel/src/visitors/to-sql.ts#visitBindParam`, plus `scripts/parity/fixtures/ar-01/`, `ar-52/`, `ar-65/`.

### Batch 91 — SQLite Slot A + B (~50 LOC bundled, risk: low)

**Theme:** `sqlite-adapter.ts` strict opt-in + `dataSourceExists()` alignment with `tableExists()` `pragma_table_list` path.

- ~5 LOC — Add `strict` field to `SqliteOpenConfig` in `activesupport/src/sqlite-adapter.ts`.
- ~20 LOC — better-sqlite3 DQS toggle: pass `strict` through `Database.Options` in `sqlite-drivers/better-sqlite3.ts:openDatabase` when upstream exposes `sqlite3_db_config`.
- ~15 LOC — `dataSourceExists()` in `sqlite3-adapter.ts` still uses the old `sqlite_master`-based query; align with `tableExists()` `pragma_table_list` path.
- ~10 LOC — Extract `assertLogged` from `sqlite3-adapter.test.ts` to a shared `packages/activerecord/src/adapters/sqlite3/test-helper.ts`.

Known limitation: `strict_strings_by_default` is a no-op in current driver — better-sqlite3 compiles with `SQLITE_DQS=0`. Document inline.

### Batch 92 — Has-one Slots C+D scope merge + eager (~260 LOC, risk: medium)

- ~100 LOC — `ThroughAssociation#target_scope` chain merge. Rails' override merges each intermediate reflection's `scope_for_association`; our base returns `klass.all()`. Unblocks "has one through with default scope on join model" + 2 custom-select default_scope tests.
- ~50 LOC — Non-preload (JOIN-based) eager loading. Three tests carry `BLOCKED: associations — non-preload (JOIN-based) eager loading not implemented`. General gap.
- ~80 LOC — Scoped has_one_through: WHERE on through model or source via lambda scope. Requires lambda-scope support on through/source reflection + fixture models.
- ~30 LOC — Scope-based association-scope cache invalidation: `_cachedAssociationScope` never invalidated on through-model default-scope change.

### Batch 93 — Test residuals multi-DB infra (~150 LOC, risk: medium)

- ~20 LOC — `reconnect after bad connection on check version` test: pg-npm pool has no single-connection version-stub hook. Needs `_databaseVersionForTest()` setter or injectable version-check hook.
- ~100–150 LOC — Second named connection pool equivalent to Rails' `ARUnit2Model` in the test suite. Unblocks `MultiDbMigratorTest` ×7 (#1531) + `PrimaryClassTest` ×2.

### Batch 94 — Sweep B test-infra (~90 LOC, risk: low)

- ~50 LOC — `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block via a module-level `_defaultSqlTimezoneOverride` + `withEnvTimezone(zone, fn)` test helper). Unblocks 2 base.test.ts tests.
- ~10 LOC — `HashAccessor.write` json-branch regression test (path is correct today; needs a defensive test).
- ~30 LOC — `SchemaDumper.fkIgnorePattern` configurability vs `ForeignKeyDefinition.isExportNameOnSchemaDump` hardcoded `fk_rails_` pattern. Either make `isExportNameOnSchemaDump` accept the configured pattern, or deprecate `fkIgnorePattern`.

### Batch 95 — Sweep A reverts (need re-design, ~55 LOC)

- ~5 LOC — Remove `RangeType.encodeLiteral` pre-serialization workaround. Reverted: still load-bearing — removing it broke `range.test.ts > where by attribute with range`.
- ~20 LOC — Fix the BindParam route for range WHERE predicates so range values quote correctly. Unblocks the `RangeType.encodeLiteral` removal.
- ~30 LOC — `validateForeignKey` `!fSchema → public` heuristic. Reverted: the `pg_namespace` join diverged from Rails (which uses `t2.oid::regclass::text` + `search_path`).

### Batch 96 — Sweep C aftermath (~40 LOC)

- ~30 LOC — `AssociationReflection.isPolymorphic()` returning true when `options.as` is set was DROPPED from Sweep C — implementation broke the `HasOneAssociationPolymorphicThroughError` guard at `reflection.ts:1344`. Audit Rails' actual `polymorphic?` implementation for `has_one :as` and identify which guards need updating before re-applying.
- ~10 LOC — `saveBang` in `persistence.ts` calls `this.save()` with **no arguments**, silently ignoring `{ validate: false }` or any options passed to it. Sweep C's `insertRecord` fix worked around this via `save({ validate }) + raiseValidationError`, but `saveBang`'s option-blindness affects other callers too.

### Batch 97 — Recent sweep TableDefinition + typeCastedBinds (~105 LOC, risk: medium)

- ~5 LOC — `typeCastedBinds` in `abstract/quoting.ts:~490` duplicates the one in `abstract/database-statements.ts` and still uses the old `typeof b.valueForDatabase === "function"` check. Unify to the getter-aware `"valueForDatabase" in b` form.
- ~50–100 LOC — `TableDefinition.toSql()` in `abstract/schema-definitions.ts:~926-1095` still branches on `_adapterName` for type SQL (SERIAL vs BIGINT AUTO_INCREMENT, BYTEA vs BLOB, etc.). Largely redundant with `SchemaCreation.typeToSql()` + `SchemaCreation.visitTableDefinition()`. Route through `SchemaCreation.accept()` and delete `toSql()`.

### Batch 98 — `as any` audit verify (~20 LOC)

- ~10–20 LOC — Verify 2 `bug-suspected` candidates from the as-any audit: `relation.ts:4965` `(this.spawn() as any).asyncBang()` (possible swallowed promise) + `abstract/database-statements.ts:1827` `(relation as any).arel()` (verify sync on every host). If real, surgical fixes.

### Batch 99 — Type-audit W1a aftermath (~70 LOC)

- ~30 LOC — activesupport W1a equivalent: `Function` + `Record<string, any>` sweep + enable `no-unsafe-function-type`. `prepend.ts:PrependMethod = (this: any, super_: Function, ...)` is the high-leverage fix — currently forces `super_ as (...args: any[]) => unknown` casts.
- ~10 LOC cosmetic — `type AnyClass = abstract new (...args: any[]) => any` duplicated in `suppressor.ts`, `no-touching.ts`, `delegation.ts`. Centralize.
- ~30 LOC — `reflection.ts:normalizedReflections` `rawRef as any` cast is the roughest remaining cast. Define a `RawReflection` interface capturing `parentReflection?`.

### Batch 100 — Autosave A preloader migration (~50 LOC, risk: medium)

- ~50 LOC — Preloader → `associationInstanceSet` migration. Update the ~14 map-direct write sites (preloader/association.ts, preloader/batch.ts, relation.ts:2149-2161, 6 sites in associations.ts) to call `record.associationInstanceSet(name, association)`. Once done, `_loadedAssociation` collapses to a one-line Rails-shaped pure read.

### Batch 101 — Query-cache wiring remainder (~60 LOC; Phase 4 blocked)

- ~15 LOC — Wire `Base.cache(&block)` / `Base.uncached(dirties:)` class methods resolving `connectionPool` then delegating to `pool.withQueryCache` / `pool.disableQueryCache`.
- ~40 LOC (Phase 4, blocked on ConnectionHandler PR 6) — `QueryCache.installExecutorHooks` + `QueryCache.run`/`complete`. Unblocks ~6 pool-attachment tests.
- ~5 LOC — `dirtiesQueryCache` on `NullPool` (hardcoded `true` at `connection-pool.ts:121`) — Rails also returns `true` unconditionally, nit.

### Batch 102 — Callbacks remaining (~20 LOC)

- ~20 LOC — Targeted test for a model with only `beforeCommit` callbacks to pin the `hasTransactionalCallbacks` path. PR 7 simplified this to check only `commit`/`rollback` chains; prevent future regression (#1526).

Documented but unfixable: Hyphenated chain names — `beforeMy-save` isn't a valid JS identifier so the object form silently won't dispatch. Same limitation in Rails. `HyphenatedKeyTest` doesn't use the object form.

### Batch 103 — Fixtures HABTM/CPK + enum (~50 LOC)

- ~10 LOC — `Company.status` as a true enum (currently declared `integer`); add `Model.enum("status", { ... })`. Deferred — no test currently relies on enum dispatch.
- ~30–50 LOC — HABTM/CPK join-row support in `defineFixtures`. The `Array.isArray(pk)` early throw at `define-fixtures.ts:163-167` blocks loading `DevelopersProject` CPK fixtures.

### Batch 104 — delegatedType (post-#1719 leftovers) (~25 LOC)

- ~15 LOC — `${role}Class` returns `resolveModel(foreign_type)` (instead of raw string); update existing `delegated class` and `delegated class with custom foreign_type` tests to register classes + assert `toBe(MessageClass)`. Then `${role}Name` mirrors Rails via `${role}Class.modelName.singular`.

### Batch 105 — Arel + activemodel type cleanup (~80 LOC)

- ~30 LOC — Tighten `normalizes()` overload from rest-param `[...string[], fn | Record]` to a discriminated union. Eliminates remaining `as unknown as string[]` casts and rejects invalid runtime calls at compile time.
- ~50 LOC — Extract `ArelConnection` to a dedicated `packages/arel/src/visitors/connection.ts` so `node.ts` can import directly. Replaces the `connection?: never` contravariant workaround in `ToSqlCtor`.

### Batch 106 — Column#default lazy-deserialize (~30 LOC + 100-200 test-infra)

- ~30 LOC — Promote `sqlType` from optional on `Column` (abstract schema-dumper) to the `ColumnInfo` base interface.
- ~100–200 LOC (test-infra, not impl) — Fixture-table infra to unblock 13 remaining skipped tests (`MysqlDefaultExpressionTest` ×9, `DefaultsTestWithoutTransactionalFixtures` ×2, `PostgresqlDefaultExpressionTest` ×1, `Sqlite3DefaultExpressionTest` ×1).

### Batch 107 — MessageSerializer double-base64 (architectural, ~30 LOC)

- ~30 LOC — `MessageSerializer.encodeIfNeeded` double-base64 fix. **Architectural**: requires `Aes256Gcm` to store raw bytes (not base64 strings) in headers — a _breaking change_ for existing stored ciphertexts. Only ship with a migration path.

### Batch 108 — api:compare regression guard (process)

- **Process improvement** — `_`-prefix renames on Rails-named methods silently drop them from `api:compare` surface. Consider extending the `rails-private-jsdoc` ESLint rule to flag `_`-prefixed methods whose Rails counterpart is non-underscored. Permanent guardrail against the regression class.

### Batch 109 — Insert-all annotation sharpening + UnknownAttributeError + bang wrappers (~270 LOC)

Followup from #1741. Combines impl + triage.

- ~10 LOC — Extend `insert-all.ts#verifyAttributes` to reject keys not in `model.attributeNames`, throwing `UnknownAttributeError`. Unblocks `insert-all.test.ts:738` + 2 "clear error message when a column does not exist" tests.
- ~6 LOC — Add `insertAllBang`/`upsertAllBang` class-level wrappers in `querying.ts` mirroring `insertAll`/`upsertAll`.
- ~250 LOC — Sharpen remaining ~60 single-line `BLOCKED:` annotations in `insert-all.test.ts` into BLOCKED/ROOT-CAUSE/SCOPE format. Clusters: timestamps (~15 tests, shared cause: no implicit `created_at`/`updated_at` in `insert-all.ts#mapKeyWithValue`), RETURNING (~4, pg-only), readonly (~3, no `_readonlyAttributes` filter), schema/index (~7).

### Batch 110 — MySQL TableDefinition#toSql → schemaCreation.accept (~150 LOC, risk: medium)

Followup from #1736. **Blocks re-introducing** `AbstractMysqlAdapter.createTableDefinition` override (Batch 47 item 6 reverted because dropping AUTO_INCREMENT broke MariaDB CI).

- ~80–150 LOC — Route `TableDefinition#toSql()` through `schemaCreation.accept(...)` (Arel-style visitor). Today only `addColumn`/`addIndex`/`changeColumn` go through visitor on MySQL; `createTable` still uses abstract toSql() switch that never inspects `options.autoIncrement`. Once toSql goes through `MysqlSchemaCreation`, visitor handles autoIncrement correctly. PG has same shape but `PgTableDefinition`'s abstract toSql() emits `SERIAL PRIMARY KEY` directly so bug doesn't surface there.
- ~5 LOC — Re-add `AbstractMysqlAdapter.createTableDefinition` override (`return new MysqlTableDefinition(name, rest)` with adapter/adapterName stripped) once the above lands. Plumbing already there from `13ed839c4` in #1736.

### Batch 111 — Transactions wTRS double-save snapshot fix (~30 LOC, risk: medium)

Followup from #1742. Currently skipped: `restore previously new record after double save` (`transactions.test.ts:~1167`).

**Research needed first:** In Rails, between save#1 and save#2 inside the same outer user tx (no inner savepoint), is `@_previously_new_record` mutated, or only at commit time? If commit-only, per-call snapshot is fine. If mutated, fix:

- ~30 LOC — Replace closure snapshot in `transactions.ts#withTransactionReturningStatus` with `_restoreTransactionRecordState` reading `_startTransactionState` directly, guarded by level so savepoint rollbacks still target the right state. Alt: only register `afterRollback` hook when `wasOutermostState` (i.e. `!r._startTransactionState` before `remember`); verify nested savepoints still get their own restore.

### Batch 112 — Connection-pool [self] semantics alignment (~45 LOC, risk: medium)

Followup from #1735. Closes the primary-abstract-without-`connectsTo` leak documented inline at `abstract-adapter.ts:735`.

- ~30 LOC — Align `withRoleAndShard`/`connectingTo`/`connectedToMany` to Rails' `[self]` semantics: push `[self]`, resolve `connection_class_for_self` at read time via `klasses.include?(...)`. Update `core.ts#matchesStack` + `AbstractAdapter#isPreventingWrites` to walk at read time too.
- ~10 LOC — `core.ts#matchesStack:336` uses `k.name === "Base"` string match. Switch to `_isActiveRecordBase` own-property marker for consistency once above lands.
- ~5 LOC — Add `connectionSpecificationName` reader test pinning the new "primary class → 'Base'" branch (`connection-handling.ts:~373`).

### Batch 113 — Phase 5 large root files (calculations + persistence) (~350 LOC, split if needed)

Followup from #1734 (Phase 5 root cluster B). Continues the async `freshAdapter` + `defineSchema` pattern.

- ~150 LOC — `calculations.test.ts` (~101 freshAdapter sites, 7596 LOC). Schema map large (Account, Company, Firm + test-local variants).
- ~200 LOC — `persistence.test.ts` (~141 sites, 4789 LOC). Schema surface bigger. May split if test bodies need async upgrades beyond call sites.

### Batch 114 — Phase 5 root attribute-methods cluster (~330 LOC, split if needed)

Followup from #1737. Continue Phase 5 with attribute-methods family.

- ~250 LOC — `attribute-methods.test.ts` (~79 sites, 1872 LOC). Likely splits along inner describes.
- ~150 LOC — `attributes.test.ts` (~58 sites, 835 LOC). Single-PR sized.
- ~80 LOC — `attribute-methods/` subtree (`query.test.ts`, `read.test.ts`, `write.test.ts`, `time-zone-conversion.test.ts`). Bundle as one PR.

### Batch 115 — Phase 5 enum.test.ts (~250 LOC, may split)

Followup from #1737. Largest remaining root offender (#1737 closed the surrounding cluster).

- ~250 LOC — `enum.test.ts` (~77 freshAdapter sites, 2018 LOC).

### Batch 116 — hstore + before-type-cast aliases (~50 LOC, risk: low)

Followup from #1740 (Batch 82).

- ~30 LOC — Port 3 hstore `store_accessor` tests (hstore_test.rb:118/136/157): `test_with_store_accessors`, `test_duplication_with_store_accessors`, `test_changes_with_store_accessors`. `storeAccessor` is implemented; just need bodies. Verify per-accessor dirty aliases (`<accessor>_changed?`, `_was`, `_change`) wired first (+~10 LOC `store.ts` if not).
- ~20 LOC — Per-attribute `<attr>_before_type_cast` alias method generation. Generic `readAttributeBeforeTypeCast(name)` is implemented (`attribute-methods/before-type-cast.ts:21`), but Rails generates per-attribute aliases via `define_method`. Add to `attribute-methods.ts` generation pipeline. Unblocks hstore "cast value on write" + all `<attr>_before_type_cast` tests across types.

### Batch 117 — Migration follow-ups: properTableName + Migration.copy (~130 LOC, risk: low)

Followup from #1733.

- ~10 LOC — `Migration.properTableName` (`migration.ts:1334`) add `name.respond_to?(:table_name)` early-return (Rails `migration.rb:1119-1125`). Add a test that passes a model class.
- ~80–120 LOC — Flesh out `Migration.copy` (`migration.ts:1350`) to honor engine `scope` on `MigrationProxy`: emit `${version}_${name.underscore}.${scope}.rb`, support `on_skip`/`on_copy` callbacks (migration.rb:1066-1108). Today the TS stub just `copyFileSync`s — the `MigrationProxy.scope` field is present-but-unused on the copy path.

### Batch 118 — HMT polymorphic-through composite owner guard (~110 LOC, risk: medium)

Followup from #1732. `collection-proxy.ts` has an `it.skip` documented in #1732.

- ~60 LOC — Polymorphic-through with composite owner PK: require explicit single-column `primaryKey:` option on polymorphic-through; validate in `Reflection` (or `_throughOwnerPolymorphic`) rejecting composite `primaryKey:` with `ConfigurationError`; flip the `it.skip` to a real assertion.
- ~20 LOC — Audit `_throughOwnerCols` `options.queryConstraints` FK branch (`collection-proxy.ts:~1042`) for reachability. Likely dead post-`Reflection` constructor's rewrite to reflection-level `queryConstraints`. Either delete or add a fixture exercising it.
- ~30 LOC — Sweep `has-one-through-association.ts` for analogous composite-PK/FK throws still raising plain `Error`. Align with the `ConfigurationError` HMT now uses.

---

## Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous.
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage.
- **~30 LOC** — `postgresql/temporal-type-parsers.ts` still has one eager `import pg from "pg"` (the last per `browser-compat-plan.md`). Move to lazy registry. Blocks browser-bundle smoke tests.
- **~1 LOC** — `scripts/api-compare/unported-files.ts:480` has a pre-existing `className` type error.
- **Sweep** — Audit `grep "PERMANENT:" scripts/` for tooling missing the `PERMANENT-SKIP:` form (the canonical marker per `docs/test-compare-100-plan.md`).

---

## Architectural (deferred; too big for single ~250-LOC slot)

- **Connection-pool / per-thread query-cache architecture, Phases 2–4** (~120 LOC remaining). ~10 actionable test unskips (4 db_config + 6 pool-attachment); other 4 are permanent (GVL/fork/thread skips).
- `_aliasTracker` real semantics on `JoinDependency#joinConstraints`.
- Multirange OID direct lookup via `LEFT JOIN pg_range` — blocked on PG12/13 compat decision.
- `encodeRangeLiteral` ↔ `RangeType.encodeLiteral` consolidation into `range.ts` helper.

---

## Infra-blocked (not actionable until prereq lands)

- `vi.stubEnv("TZ")` + Temporal test-infra gap.
- Task/Topic fixture models — multiple tests need real models wired to a DB.
- `_queryBySql` opts wiring — pending prepared-statement infrastructure.
- `insertAllBang` / `upsertAll` — separate features.
- HABTM cache invalidation — query-cache Gap 6 depends on HABTM impl.
- `resetColumnInformation` — query-cache Gap 4 depends.

---

## Permanent guardrails

### Dual-registry watchpoint

When both a `Base.<X>` static field AND a `<x>.ts` module-level `WeakMap`/`Map` exist for the same concern, treat it as a bug. The live API writes one; helpers read the other; silently. Audit:

```bash
grep -rn "new WeakMap<typeof Base\|new Map<.*Base" packages/activerecord/src
```

### Unported-files gate (Step 0 for auditors)

Before proposing implementation slots, every audit MUST consult `scripts/api-compare/unported-files.ts`. If any source in scope appears in `UNPORTED_FILES` (by `pattern` or `testFile`), propose **exclusion**, not implementation. The patch lives in the audit-prompt-template.

### Test:compare workflow

Test:compare un-skip work uses [`test-compare-100-plan.md`](test-compare-100-plan.md) + `$HOME/github/blazetrailsdev/test-compare-prompt-template.md`. Audits live as task files in `$HOME/.btwhooks/data/github/blazetrailsdev/trails/todo/` and submit via `/audit-report <slug>` — no PR.

### Spawned-agent constraints

The `prompt-agent` skill auto-appends a "do not delegate / do not recursively spawn sub-agents" footer to every prompt it dispatches. Workers do their own work; oversized tasks split via PR-body follow-ups.

### Future infra (deferred)

- ESLint rule for `_`-prefixed params on Rails-mirroring methods.
- `lint:deps` activesupport rule → blocking once missing migrations land.
- api:compare param-name set comparison.
- `deprecator` / `gemVersion` / `version` removed from main bundle barrel; only via `@blazetrails/activerecord/deprecator` subpath.

---

## See also

- [`test-compare-100-plan.md`](test-compare-100-plan.md) — strategy + workflow + BLOCKED vocab reference.
- [`scripts/api-compare/unported-files.ts`](../scripts/api-compare/unported-files.ts) — canonical not-portable list.
- [`activerecord-type-audit.md`](activerecord-type-audit.md) — supersedes the `as any` legacy-cast cleanup sweep.
