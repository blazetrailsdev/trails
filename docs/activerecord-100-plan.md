# ActiveRecord post-100% — fidelity tracker

**Snapshot 2026-05-16:** `activerecord 4956/4958 methods (100% rounded) | files: 275/275 | inheritance: 210/210 (100%) | activemodel 621/621 (100%)`. Public surface is closed; the 2 outstanding methods are residual privates. test:compare currently at **6568/7885 tests (83.3%)**, 1296 skipped.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. PRs target ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`.

For workflow + BLOCKED-annotation vocab + audit conventions, see [`test-compare-100-plan.md`](test-compare-100-plan.md).

---

## Story count

~98 queued batches (some lettered sub-batches: 28b, 86a/b, 121a/b/c, 122a/b, 129a/b/c), ~16k LOC. Batches numbered sequentially; the next-to-ship is the lowest-numbered open batch. test:compare standing at 6568/7885 (83.3%) per snapshot above. GitHub is the source of truth for which batches have PRs in flight — search `feat(activerecord): batch N` in open PRs.

The `as any` legacy-cast cleanup sweep has been **superseded by `docs/activerecord-type-audit.md`** — the type-audit's 4-wave plan covers the same `(record as any)._readAttribute` / `.save` / `.destroy` removals more precisely. The 2 `bug-suspected` candidates remain in batches below for surgical verification.

---

## Queued batches

Bundled work-PR slots ready to spawn. Items removed as batches ship.

### Batch 3 — PG schema-dump table/partition polish (~80 LOC, risk: low)

Unblocked by #1726 (the prior PG addColumn-through-schemaCreation slot, merged).

- ~30 LOC — Wire `tableOptions()` into `schema-dumper.ts:emitTable`. Requires making the dump loop async.
- ~30 LOC — PG table comment schema dump: forward `adapterTableOpts.comment` in `emitTable`; add `COMMENT ON TABLE` emission after `createTable`.
- ~20 LOC — PARTITION BY schema dump: 2 `BLOCKED: adapter-pg` partition tests in `SchemaCreateTableOptionsTest` flow through the same `fetchTableOptions → options:` path; need `tablePartitionDefinition` wired correctly + test bodies.

### Batch 14 — Autosave E-series CPK + nested-attributes — needs re-scope

**Audit finding (spawn aborted, no PR):** the three items are each materially deeper than the ~80 LOC estimate. Splitting honestly:

- **`queryConstraintsList` workaround removal — DROP from this batch.** Our impl already returns pk as array for base-class CPK models, mirroring Rails. The scalar-fallback at `autosave-association.ts:600-605` exists because `computePrimaryKey` collapses CPK to "id" via `composite_primary_key? ? (pk.includes("id") ? "id" : pk)` — Rails itself does this (`autosave_association.rb:583-586`). Removing without understanding which existing CPK autosave tests rely on it risks regression.
- **CPK `setIds` un-skip — gated on Batch 20.** The Rails test uses `Cpk::Order` (CPK parent) with `has_many :order_agreements`, requiring auto-derived composite FK `[shop_id, order_id]` on the child. We don't auto-derive composite FKs from CPK parents — that's Batch 20's "composite-FK has-many-through write support" (medium-high risk). Re-list under Batch 20 followup.
- **`nestedAttributesTarget` population — its own batch (~150–250 LOC).** The field lives on `CollectionAssociation` (`collection-association.ts:19`) but `CollectionProxy` (user-facing) doesn't expose or hold the association instance. Plumbing requires exposing inner association on the proxy OR moving the field. Additionally, `assignNestedAttributes` doesn't build child records (built lazily in `processNestedAttributes` at save time) — Rails-faithful `:nested_attributes_order` requires rearchitecting nested-attributes to build eagerly.

### Batch 16 — Autosave validateAssociations refactor (~190 LOC, risk: medium-high)

**Theme:** Structural collapse of duplicated validation paths.

- ~40 LOC — Remove `!isNewRecord && !changed` short-circuit in `validateAssociations` + add Rails `associated_errors` filter. Unchanged children with cached NestedErrors don't re-propagate today.
- ~150 LOC — Collapse `validateAssociations` and per-reflection `validate*Association` callbacks into a single `add_autosave_association_callbacks` dispatch.

### Batch 17 — Autosave indexed-error I18n (gated, ~80 LOC)

**Gated on:** I18n full-message customize wiring landing first.

- ~80 LOC — Rewrite the two "indexed errors should be properly translated" tests against a real I18n backend.

### Batch 18 — Reflection residual cleanup (~35 LOC, risk: low)

- ~5 LOC — Delete dead `createReflection` in `reflection.ts:1772` (now-stale asymmetry vs `Reflection.create`).

The "deeply nested through-association resolution in `_buildThroughScope`" item folded into Batch 29 (same code path).

Watchpoint: the `_invalidateAssociationIds → assocInstance.reset()` widening fires for every through-association push.

### Batch 20 — Associations-core composite-FK autosave (~245 LOC, risk: medium-high)

**Theme:** Composite-FK reach into HMT writes + belongs_to autosave registration.

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

### Batch 24 — Preloader-grouping miscellaneous (~290 LOC, split if needed)

**Theme:** Slot A preloader-grouping — remaining tests (some larger).

- ~30 LOC — Un-skip `preload groups queries with same sql at second level` once an `extending` association option lands (test body otherwise ready).
- ~60 LOC — Un-skip `preload can group separate levels` with 3-query assertion (impl correct; needs body restored).
- ~40 LOC — Postesque fixture for `does not group same scope different key name` (needs different `joinPrimaryKey`).
- ~150 LOC — `preload can group multi level ping pong through` — large fixture (similar_posts + favorite_authors).

### Batch 25 — Associations-core test-body bundle + stub upgrades (~195 LOC, risk: low)

**Theme:** Wired-but-skipped test body ports + has-many-associations cleanup + Relation references infra. Bundled to hit the ~250 LOC PR target.

- ~30 LOC (B) — "preloads model with query_constraints by explicitly configured fk and pk" test body (verify not yet shipped — grep found no match).
- ~20 LOC (D, gated on query-cache landing) — Update `reload with query cache` test bodies.
- ~40 LOC (D) — Upgrade remaining size/empty stubs in `has-many-associations.test.ts` (lines ~1691–1791).
- ~5 LOC (A) — Add connection/adapter identity to `LoaderQuery.hashKey()` for multi-DB grouping isolation.
- ~80–120 LOC (C) — Implement `Relation#includes!`/`Relation#references!` infra for Rails-faithful `through_scope` path.

### Batch 28b — JoinDependency AliasTracker port (~280 LOC, risk: medium)

Followup from #1768 (28a closed: polymorphic source_type shipped). The remaining JoinDependency-alias tests are at `nested-through-associations.test.ts:1211` ("a table referenced multiple times" — Rails 437) and `:1217` ("scope on polymorphic reflection" — Rails 453); both still skipped pending Rails-canonical alias naming.

Adjacent to Batch 133 (other nested-through fidelity items from #1768). The adapter-aware quoting item there could land first to clean up the string-concat predicates this batch will inherit.

- ~80 LOC — Port test fixtures (`similar_posts`, `ordered_posts`) currently missing from our test file; port Rails test bodies verbatim.
- ~200 LOC — Port `AliasTracker` (Rails `activerecord/lib/active_record/associations/alias_tracker.rb`) so `_addThroughAssociation` emits Rails-canonical alias names (`taggings_authors_join`, etc.) when the same table appears multiple times in a nested-through join. Risk: 30+ currently-passing nested-through join tests must stay green.

### Batch 29 — HMT Slot D + A+B nested-through (~190 LOC, risk: medium)

**Theme:** Test coverage for JoinDependency + `_buildThroughScope` fix for nested-through chaining.

- ~30 LOC — Rails-mirrored test for `Author.joins(:ratings).where("ratings.value": N)` against nested-through chain (verifies JoinDependency, not preloader).
- ~20 LOC — `source_type` polymorphic-with-sourceType variant of nested-through preload test.
- ~10 LOC — `_dataAvailable()` / `runnableLoaders()` in `preloader/through-association.ts` only checks single source preloader layer. For 4+ level chains may emit one extra wasted pass.
- ~30 LOC (B) — Regular (JOIN-based) `djMembersOrdered` / `djMembersDouble` produce wrong/unordered results when chaining `.where()` or `.reorder()`.
- ~80–120 LOC (B) — Fix `CollectionProxy._buildThroughScope()` for nested-through associations (where `through` target is itself a through). Option B (preferred): initialize CollectionProxy seed from `DisableJoinsAssociationScope`.

### Batch 32 — HABTM Slot B+C cross-cutting scope helper (~95 LOC, risk: low)

**Theme:** `applyAssociationScope` helper + builder-time scope wiring.

- ~20 LOC — `applyAssociationScope(rel, scope, owner)` helper handling arity (0/1/2-arity) + falsy-return fallback. Swap 6 call sites: `loadHabtm`, `loadHasMany`, `loadHasOne`, `loadHasManyThrough` (×3).
- ~50 LOC — `Associations.hasAndBelongsToMany` builder-time `scope` (captured in `habtmOptions` but never reapplied) → wire into the reflection so `loadHabtm` auto-applies.
- ~20 LOC — `insertHabtmRecord` uses `throughModel.insertAll([joinAttrs])` which bypasses validation; Rails' `habtm_writer` uses `record.save(validate: validate)`.
- Sweep — verify `_associationIds` cache invalidation on `destroyAll` and explicit `clear()`.

### Batch 33 — HABTM Slot D options + parent_reflection (~50 LOC, risk: low)

- ~30 LOC — Add `parent_reflection` field to MiddleReflection / target hasMany reflection in HABTM builder (Rails `associations.rb:1884, 1905`).
- ~20 LOC — Tighten `habtmOptions → middle hasMany` to Rails' explicit allowlist; drop leakage of `readonly`/`dependent`/`inverseOf`.

### Batch 34 — HABTM Slot E preloader polymorphic (~110 LOC, risk: medium)

- ~30–80 LOC — Preloader already-loaded-through + polymorphic-sourceType empty-result gap (`preloader/through-association.ts:56-71`). Reproducer: Hotel → Departments → Chefs → employable[CakeDesigner].
- ~50 LOC — Single-through (non-nested) polymorphic+sourceType test variant covering `AssociationScope` direct JOIN path.
- ~30 LOC — Normalize/unblock 12 `it.skip` stubs in `nested-through-associations.test.ts` tagged `BLOCKED: associations — nested-attributes feature gap`.

### Batch 35 — HABTM Slot F primary_key + through-table (~100 LOC, risk: medium)

- ~20 LOC — Align HABTM `primaryKey` behavior: `loadHabtm`/`habtmOwnerPk` honors `options.primaryKey` but JoinDependency eager-load passes `modelClass.primaryKey`. Rails macro intentionally doesn't forward `:primary_key`. Drop `habtmOwnerPk` primaryKey override.
- ~30 LOC — Real-table-name reuse in `_addThroughAssociation`: mirror collision-check from `addAssociation` (lines 216-217). Affects all through associations.
- ~50 LOC — Schema-qualified HABTM tables (`"schema.table"` → `"schema"."table"`).

### Batch 37 — HABTM Slot H structural (~200 LOC, risk: high)

**Theme:** Wiring `associationForeignKey` + `destroyAssociations` + distinct reflection.

- ~50 LOC — Wire `associationForeignKey` end-to-end through `createHabtmJoinModel` (target FK on right belongs_to) and `_resolveHabtmJoin`/`loadHabtm`. Today hardcoded as `${underscore(singularize(name))}_id`.
- ~30 LOC — Pass `options.foreignKey` into middle reflection options.
- ~80 LOC — Wire `destroyAssociations` stub in `persistence.ts:1221` into the destroy flow. Then refactor HABTM `beforeDestroy` to `destroy_associations` override module.
- ~40 LOC — Produce distinct hasMany-through reflection for public name (Rails' `has_many name, **hm_options`).

### Batch 39 — HABTM annotation drift sweep (~tests-only)

**Theme:** Re-tag mis-labeled `BLOCKED: habtm` tests. ~160 of 168 are mis-tagged.

- Re-tag across `has-and-belongs-to-many-associations.test.ts`, `eager.test.ts`, `nested-through-associations.test.ts`, `extension.test.ts`, `inner-join-association.test.ts`, `has-many-associations.test.ts`. Mirror #1641's STI annotation drift workflow.

### Batch 45 — `Base.adapter` permanent-checkout → leased (architectural)

**Replaces the original Batch 45 leak-audit framing.** Audit found 3 of 5 items already shipped (checkoutAsync always called from withConnection per #1547; withConnection async/await dedupe per #1547; ExecutorHooks.complete resolver wired in `index.ts:11` via `setConnectionHandlerResolver`). The remaining test-suite leak isn't a sweep — it's structural.

**Root cause.** `Base.adapter` (`base.ts:997-1028`) calls `pool.checkout()` and caches the result on `_adapter` indefinitely. Each model permanently holds one pool connection; no checkin. Every test that touches a model leaks until process exit.

**Scope (needs design pass before sizing):**

- Replace permanent checkout with `withConnection`-style lease, OR
- Wire executor-driven release (use `ExecutorHooks` so connections return to pool when the request/test completes).

**Blast radius:** every model and every test in the AR test suite. Needs its own design pass + careful staged rollout (probably behind a flag, then flip).

**Dropped:** `buildAsyncExecutor` returns `null` at `connection-pool.ts:1061` — comment correctly notes JS single-threaded thread-pool N/A. Real semaphore would be ~30-60 LOC + tests but only matters once `Relation#loadAsync` actually fans out (it currently doesn't). Re-open if loadAsync parallelism lands.

### Batch 48 — MySQL active-schema Slot D + MariaDB indexes() (~140 LOC, risk: medium)

- ~50 LOC — `CommandRecorder#changeTable` inversion support. Today the Proxy recorder used in the bulk path records DDL calls but doesn't support `inverse_of`.
- ~20 LOC — Verify MariaDB CI passes timestamps tests cleanly post-merge.
- ~30 LOC — Extract MySQL `buildCreateIndexDefinition` pre-flight into a shared helper consumed by both `AbstractMysqlAdapter.buildCreateIndexDefinition` and `MysqlSchemaStatements.addIndex`.
- ~40 LOC — Refactor abstract `SchemaStatements.addIndex` (`abstract/schema-statements.ts:257`) to delegate to `buildCreateIndexDefinition` (Rails' `AbstractAdapter#add_index` does).

### Batch 49 — MySQL active-schema small-items bundle (~85 LOC, risk: low)

Bundle of two former tiny batches (B49 unsigned/timestamps + B51 onUpdate refactor) to hit the 200+ LOC PR target.

- ~10 LOC — `typeToSql` `unsigned` suffix: append `" unsigned"` when `options.unsigned && type !== "primary_key"`. Unblocks unsigned integer column migrations.
- ~30 LOC — `addTimestamps`/`removeTimestamps` DDL type-check.
- ~5 LOC — Typed capability-delegation helper in `test-adapter.ts` for `supportsIndexesInCreate?.()`-style optional methods.
- ~40 LOC — Route `renameColumnForAlter` through `columnFor` like Rails (`abstract_mysql_adapter.rb:863-878`) and extend `newColumnFromField` so `on_update` and compound `DEFAULT_GENERATED on update X` cases keep flowing through. Centralizes function-default logic. Includes ~5 LOC widening of `meta.extra === "DEFAULT_GENERATED"` strict equality to startsWith/regex.

### Batch 50 — MySQL mysql2-adapter B+C fidelity (~170 LOC, risk: medium)

- ~80 LOC — `Mysql2Adapter` `ConnectionError` branch + abstract `when nil → ConnectionNotEstablished`. Verify/add `DatabaseAlreadyExists` for `ER_DB_CREATE_EXISTS`.
- ~30 LOC — Wire `Rails.error.report` for `report` warning action at both `_flushWarnings` sites (mysql2-adapter.ts:1684 + postgresql-adapter.ts:1165). Blocked on global ErrorReporter singleton.

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

### Batch 57 — PG network/cidr test cleanup (~tests-only)

Pure test cleanup; impl gap (pgColumn semantic types) is folded into Batch 132.

- 3 stub tests in `cidr.test.ts` (`cidr column`, `cidr type cast`, `cidr invalid`) have no Rails source backing. Find counterparts or delete.
- Possible missing file: `adapters/postgresql/inet.test.ts` mirroring Rails' `inet_test.rb` — likely consolidates with Batch 132's network.test port.

### Batch 59 — Relation typecast on SQL expressions (~unknown, low priority)

Carry-over from PG money slot: 3 BLOCKED tests pointing at generic Relation gaps — `sum`/`pluck` typecast on SQL expressions + `updateAll` BigDecimal serialize. Fold into a Relation cluster when picked up.

### Batch 60 — PG-adapter execInsert + datatype bundle (~140 LOC, risk: low)

Bundle of former B60 (execInsert unify) + B61 (datatype/citext aftermath) + B62 live-integration test to hit the PR target. PG mixin chain piece already shipped (`schemaStatements()` override + `dropTable` delegation in place).

- ~10 LOC — Promote `_instrumentedQueryOnClient` to a named internal helper and dedupe with `execQuery`'s inner lambda.
- ~30 LOC — Unify `execInsert` paths: abstract default (`abstract/database-statements.ts:1375`) bypasses `sqlForInsert` entirely; a separate standalone `execInsert` function (line 390) does the right thing but isn't wired. Wire it in. Then the PG-specific `pk === false` scaffolding (#1567) can be removed.
- ~15 LOC — Register remaining Rails-listed PG types: `Decimal`, `Enum`, `LegacyPoint`, `Vector` (verify which actually matter end-user-facing first — `Date`, `Bytea` already in `type-map-init.ts`).
- ~5 LOC — `schema-dumper.ts` spot-check `t.uuid(...)`, `t.cidr(...)`, `t.point(...)` emission round-trips.
- ~10 LOC — SchemaCache null-pool guard audit on `primaryKeys`/`indexes`/`dataSources`/`views`.
- ~10 LOC — Lift `columnForAttribute` schema-vs-attribute distinction into JSDoc on `model-schema.ts:493`.
- ~10 LOC — `delegated_type.test.ts` `touch account` test blocked on UUID PK + polymorphic touch.
- ~50 LOC — Live PG integration test for `dropTable("parent", { force: "cascade" })` end-to-end. Current tests use a fake adapter.

### Batch 63 — PG UUID Slot C uniqueness async (~60 LOC, risk: medium)

- ~30 LOC — `caseInsensitiveComparison` is async on PG (queries `pg_proc`) but `UniquenessValidator.buildRelation` is sync. **Concrete consequence:** for any non-string non-UUID column type where `canPerformCaseInsensitiveComparisonFor` returns false, `buildRelation` currently passes a `Promise` to `base.where()`, throwing `ArgumentError: Unsupported argument type`. UUID is fixed; other types are latent. Fix options: (a) make `buildRelation` async; (b) expose a sync `canPerformCaseInsensitiveComparisonForSync`.
- ~10–30 LOC audit — `typeObj?.type` was caught as a CI bug post-open (`Uuid.type` is a method, not a property). Audit other `.type` reads off type objects across the codebase.

### Batch 64 — PG connection Slot A + D (~63 LOC, mixed risk)

- ~3 LOC — `tableAliasLength()` override on `PostgreSQLAdapter` returning `this.maxIdentifierLength()`. Blocked by base-class sync `number` return — would widen to `Promise<number> | number`.
- ~20 LOC — `connection-pool.ts:449,505,522` call `connection.verifyBang()` without `await`. Post-#1464 the PG override is async.
- Test-infra refactor — Move `SQLSubscriber` from `adapters/postgresql/test-helper.ts` to a shared location when `adapters/abstract-mysql-adapter/connection.test.ts` is un-skipped.

### Batch 65 — PG infinity carry-over (~95 LOC, risk: medium)

- ~80 LOC — `InTimeZone` test helper + `Base.timeZoneAwareAttributes` wiring + `TimeZoneConverter` sentinel-aware wrapping + `reset_column_information` lifecycle. Unblocks 1 remaining skipped infinity test (`assigning 'infinity' on a datetime column with TZ aware attributes`). **Shares the InTimeZone helper with Batch 86a — bundle into whichever ships first.**
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

### Batch 69 — Relation test-body bundle (~155 LOC, risk: low)

- ~50–80 LOC (G) — Un-skip `registering new handlers for joins`: scoped association where-clause expansion should propagate custom handlers into the lambda's evaluation context.
- ~100 LOC (B) — Polymorphic test bodies for 7 wired-but-skipped tests in `where.test.ts` (~lines 1014–1073, 1962). Fixture work, not impl.

inBatches deferred test ports (PostWithDefaultScope, `assertQueriesMatch` infra, table-alias path) → Batch 136.

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

- ~30 LOC (B) — CPK `AssociationQueryValue.queries()` Relation path still throws. Pragmatic deviation: subquery approach (same as non-CPK Relations).

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

- ~15 LOC (F) — Wire `changeColumn` through `changeColumnForAlter` → `SchemaCreation#accept` (Rails routing).
- ~20 LOC (E) — `schema load scoped to schemas` un-skip: needs `schema-cache.ts#clear` invalidation.
- ~50 LOC (E) — `schema dump scoped to schemas` un-skip in enum.test.ts: `enumTypes()` schema-scoped filtering + `with_test_schema` infra.

### Batch 77 — Schema scoped dump deeper (~125-200 LOC, risk: medium)

- ~50–200 LOC (E) — `dumping schemas` / `dump foreign key targeting different schema` / `Active Record basics` (SchemaWithDotsTest) — root-caused to incomplete `schema.ts`. Fold into a schema-dumper-specific slot.

### Batch 78 — Schema-dumper recent batch #1472 (~30 LOC, risk: low)

- ~30 LOC — `MigrationContext.createTable` passes abstract `TableDefinition` to the callback; `t.exclusionConstraint`/`t.uniqueConstraint` aren't callable from schema-file blocks. Rails emits them inline. Fix: instantiate `PgTableDefinition` when `adapterName === "postgres"`, then exclusion/unique constraints can move inline. Closes the Sweep D Item 1 partial-ship.

### Batch 80 — Transactions update-setter fidelity (~20 LOC, risk: medium)

- ~20 LOC — Deeper `update should rollback on failure!` fidelity: needs `update()` to call property setters (not just `writeAttribute`) so `replyIds: []` collection-clear works inline. Pre-existing: Rails `assign_attributes` calls setters; our writeAttribute loop doesn't.

### Batch 81 — Transactions dirty-tracking new-record rollback (~50 LOC, risk: high)

- ~50 LOC — Dirty-tracking for new-record rollback: `topic.changes["title"]` returns `undefined` instead of `[null, "Jeff"]` after rollback. Root cause deeper than sweep A's guard fix — `state.attributes` snapshot in `rememberTransactionRecordState` captures user-written values, so `redetectChanges` produces no diff. Fix: snapshot _DB-original_ values (null for unsaved new records), or add separate DB-original tracking.

### Batch 86a — Timezone-aware attribute methods (~150 LOC, risk: medium)

Closes the `BLOCKED: type` cluster in `attribute-methods.test.ts:908,912` ("time attributes are retrieved in the current time zone", "setting time zone-aware attribute in other time zone") plus PG `timestamp.test.ts:140,149` ("timestamp with zone values with/without rails time zone support"). Shares the `InTimeZone` test helper + `TimeZoneConverter` sentinel-aware wrapping with Batch 65 — coordinate so only one batch ports the helper.

- `Base.timeZoneAwareAttributes` wiring on read path (currently `date-time-precision.test.ts:134` notes "not yet wired").
- `TimeZoneConverter` integration with `serialize`/`deserialize` round-trip.
- `reset_column_information` lifecycle (test helper to flip `timeZoneAwareAttributes` mid-test).

### Batch 86b — Unknown-triage deferred misc (~80 LOC)

Catch-all for the BLOCKED:unknown stubs surfaced by `audit-unknown-blocked` that didn't fit a dedicated cluster. Re-audit before picking up — likely splits further once concrete tests are named.

### Batch 90 — AR query-parity datetime precision (~80 LOC, risk: medium)

**Goal:** `Order.where(created_at: oneWeekAgo..now).toSql()` emits second-precision SQL matching Rails' `quoted_date` (no fractional seconds for unscaled DATETIME columns).

**Root cause.** Trails inlines dates from `Quoted` nodes with full precision. Added bind extraction for `compileWithBinds`, but `toSql()` still inlines.

**Options:**

- **Option A (BindParam-first, ~80 LOC):** In `predicate-builder/basic-object-handler.ts` + `range-handler.ts`, wrap Date values in `new Nodes.BindParam(queryAttribute)` instead of `Quoted`. Add a `quotedDateForBind` branch in `visitBindParam` that truncates to seconds. Don't change `visitQuoted` (INSERT precision preserved).
- **Option B (parity-runner side):** `paramSql` + binds comparison would close this in the diff layer without trails code changes.

**Risk:** Medium — touches every WHERE clause in the suite. Files (Option A): `predicate-builder/basic-object-handler.ts`, `predicate-builder/range-handler.ts`, `arel/src/visitors/to-sql.ts#visitBindParam`, plus `scripts/parity/fixtures/ar-01/`, `ar-52/`, `ar-65/`.

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

### Batch 97 — Recent sweep TableDefinition + typeCastedBinds (~105 LOC, risk: medium)

- ~5 LOC — `typeCastedBinds` in `abstract/quoting.ts:~490` duplicates the one in `abstract/database-statements.ts` and still uses the old `typeof b.valueForDatabase === "function"` check. Unify to the getter-aware `"valueForDatabase" in b` form.
- ~50–100 LOC — `TableDefinition.toSql()` in `abstract/schema-definitions.ts:~926-1095` still branches on `_adapterName` for type SQL (SERIAL vs BIGINT AUTO_INCREMENT, BYTEA vs BLOB, etc.). Largely redundant with `SchemaCreation.typeToSql()` + `SchemaCreation.visitTableDefinition()`. Route through `SchemaCreation.accept()` and delete `toSql()`.

### Batch 98 — `as any` audit verify (~20 LOC)

- ~10–20 LOC — Verify 2 `bug-suspected` candidates from the as-any audit: `relation.ts:4965` `(this.spawn() as any).asyncBang()` (possible swallowed promise) + `abstract/database-statements.ts:1827` `(relation as any).arel()` (verify sync on every host). If real, surgical fixes.

### Batch 99 — Type-audit W1a aftermath (~70 LOC)

- ~30 LOC — activesupport W1a equivalent: `Function` + `Record<string, any>` sweep + enable `no-unsafe-function-type`. `prepend.ts:PrependMethod = (this: any, super_: Function, ...)` is the high-leverage fix — currently forces `super_ as (...args: any[]) => unknown` casts.
- ~10 LOC cosmetic — `type AnyClass = abstract new (...args: any[]) => any` duplicated in `suppressor.ts`, `no-touching.ts`, `delegation.ts`. Centralize.
- ~30 LOC — `reflection.ts:normalizedReflections` `rawRef as any` cast is the roughest remaining cast. Define a `RawReflection` interface capturing `parentReflection?`.

### Batch 100 — Autosave A preloader migration (~20 LOC, risk: low)

- ~20 LOC — Preloader → `associationInstanceSet` migration. ~5 `_preloadedAssociations.set` write sites remain (preloader/association.ts ×2, preloader/batch.ts ×1, relation.ts ×2). Update to call `record.associationInstanceSet(name, association)`; once done, `_loadedAssociation` collapses to a one-line Rails-shaped pure read.

### Batch 101 — Query-cache wiring remainder (~60 LOC; Phase 4 blocked)

- ~15 LOC — Wire `Base.cache(&block)` / `Base.uncached(dirties:)` class methods resolving `connectionPool` then delegating to `pool.withQueryCache` / `pool.disableQueryCache`.
- ~40 LOC (Phase 4, blocked on ConnectionHandler PR 6) — `QueryCache.installExecutorHooks` + `QueryCache.run`/`complete`. Unblocks ~6 pool-attachment tests.
- ~5 LOC — `dirtiesQueryCache` on `NullPool` (hardcoded `true` at `connection-pool.ts:121`) — Rails also returns `true` unconditionally, nit.

### Batch 103 — Fixtures HABTM/CPK + enum (~50 LOC)

- ~10 LOC — `Company.status` as a true enum (currently declared `integer`); add `Model.enum("status", { ... })`. Deferred — no test currently relies on enum dispatch.
- ~30–50 LOC — HABTM/CPK join-row support in `defineFixtures`. The `Array.isArray(pk)` early throw at `define-fixtures.ts:163-167` blocks loading `DevelopersProject` CPK fixtures.

### Batch 104 — delegatedType (post-#1719 leftovers) (~25 LOC)

- ~15 LOC — `${role}Class` returns `resolveModel(foreign_type)` (instead of raw string); update existing `delegated class` and `delegated class with custom foreign_type` tests to register classes + assert `toBe(MessageClass)`. Then `${role}Name` mirrors Rails via `${role}Class.modelName.singular`.

### Batch 105 — Arel + activemodel type cleanup (~80 LOC)

- ~30 LOC — Tighten `normalizes()` overload from rest-param `[...string[], fn | Record]` to a discriminated union. Eliminates remaining `as unknown as string[]` casts and rejects invalid runtime calls at compile time.

### Batch 106 — Column#default lazy-deserialize (~30 LOC + 100-200 test-infra)

- ~30 LOC — Promote `sqlType` from optional on `Column` (abstract schema-dumper) to the `ColumnInfo` base interface.
- ~100–200 LOC (test-infra, not impl) — Fixture-table infra to unblock 13 remaining skipped tests (`MysqlDefaultExpressionTest` ×9, `DefaultsTestWithoutTransactionalFixtures` ×2, `PostgresqlDefaultExpressionTest` ×1, `Sqlite3DefaultExpressionTest` ×1).

### Batch 107 — MessageSerializer double-base64 (architectural, ~30 LOC)

- ~30 LOC — `MessageSerializer.encodeIfNeeded` double-base64 fix. **Architectural**: requires `Aes256Gcm` to store raw bytes (not base64 strings) in headers — a _breaking change_ for existing stored ciphertexts. Only ship with a migration path.

### Batch 108 — api:compare regression guard (process)

- **Process improvement** — `_`-prefix renames on Rails-named methods silently drop them from `api:compare` surface. Consider extending the `rails-private-jsdoc` ESLint rule to flag `_`-prefixed methods whose Rails counterpart is non-underscored. Permanent guardrail against the regression class.

### Batch 110 — MySQL TableDefinition#toSql → schemaCreation.accept (~150 LOC, risk: medium)

Followup from #1736. **Blocks re-introducing** `AbstractMysqlAdapter.createTableDefinition` override (Batch 47 item 6 reverted because dropping AUTO_INCREMENT broke MariaDB CI).

- ~80–150 LOC — Route `TableDefinition#toSql()` through `schemaCreation.accept(...)` (Arel-style visitor). Today only `addColumn`/`addIndex`/`changeColumn` go through visitor on MySQL; `createTable` still uses abstract toSql() switch that never inspects `options.autoIncrement`. Once toSql goes through `MysqlSchemaCreation`, visitor handles autoIncrement correctly. PG has same shape but `PgTableDefinition`'s abstract toSql() emits `SERIAL PRIMARY KEY` directly so bug doesn't surface there.
- ~5 LOC — Re-add `AbstractMysqlAdapter.createTableDefinition` override (`return new MysqlTableDefinition(name, rest)` with adapter/adapterName stripped) once the above lands. Plumbing already there from `13ed839c4` in #1736.

### Batch 113 — Phase 5 calculations.test.ts remainder (~150 LOC)

Followup from #1734 + #1748. ~19 `freshAdapter` sites left after #1748; finish the residual describes. persistence.test.ts work is in 121a/b/c — don't duplicate.

### Batch 114 — Phase 5 attributes.test.ts (~150 LOC)

Followup from #1737. `attributes.test.ts` ~58 freshAdapter sites, 835 LOC. Single-PR sized. `attribute-methods.test.ts` is in Batch 124 — don't duplicate. The `attribute-methods/{query,read,write,time-zone-conversion}.test.ts` subtree is already green under `AR_NO_AUTO_SCHEMA=1` per #1749 finding (audit-script false positive — see Batch 129c).

### Batch 118 — `_throughOwnerCols` queryConstraints branch audit (~20 LOC, risk: low)

Followup from #1792. Item 1 of original B118 (polymorphic composite guard) shipped. Item 3 (has-one-through composite-PK throws) had no matching sites — closed as no-op. Remaining:

- ~20 LOC — Audit `_throughOwnerCols` `options.queryConstraints` FK branch (collection-proxy.ts ~1080) for reachability. Per #1792 analysis: likely dead post the `Reflection` constructor rewrite (reflection.ts:505-510 rejects the option; reflection.ts:512-514 converts `Array.isArray(foreignKey)` into internal `queryConstraints` on a copied opts, so `AssociationDefinition.options.queryConstraints` remains undefined). Either delete the branch or add a fixture exercising it.

### Batch 119 — `has_many_inversing` config + collection-target dedup (~210 LOC, risk: medium)

Closes 6 still-skipped inverse-associations tests sharing the same root cause.

- ~30 LOC — Port `has_many_inversing` config + plumb into `BelongsToReflection`/`HasManyReflection.canFindInverseOfAutomatically`. Retightens the "should not try to set inverse instances when the inverse is a has many" semantics (currently relies on explicit `foreignKey:` to suppress auto-detect — fragile).
- ~80–150 LOC — Collection-target dedup so `setHasMany`/`build`/`<<` on a loaded collection don't double-push when the inverse fires `replace_on_target` (Rails' `@replaced_or_added_targets` set in `collection_association.rb:457`). Unblocks 4 of 6 remaining skipped tests.
- ~10 LOC — Apply `_wireInverseAssociation` helper to `setBelongsTo`/`setHasOne`/`setHasMany` (`associations.ts:2113-2117, 2165-2169, 2215-2219`); currently still inline `_cachedAssociations` writes.

Pre-existing Rails-divergence carryover from #1745: `matches_foreign_key?` reverse-FK branch omitted (collection-only today; needed if `inversable?` reused for belongs_to scope chains). `invertible_for?` static gate folded into runtime check (Rails calls both).

### Batch 120 — Virtual-attribute persistence path (~unknown, risk: medium)

Followup from #1749. Two tests currently skipped:

- `model with nonexistent attribute with default value can be saved`
- `attributes not backed by database columns return the default on models loaded from database`

Both silently passed under auto-schema because the DDL created a column from the `attribute()` declaration. Under `AR_NO_AUTO_SCHEMA=1` the real gap surfaces: trails INSERT path writes the non-existent column. Rails treats these as virtual attributes (not persisted, default returned on read). Rails source ref: `vendor/rails/activerecord/test/cases/attributes_test.rb:131, 305`.

- Skip non-DB-backed attributes when building the INSERT column list + when reading back from DB rows. Filter to schema-known columns. Then un-skip the two tests above.

### Batch 121a/b/c — Phase 5 persistence.test.ts remainder (~600 LOC across 3 PRs)

Followup from #1751. 22 of ~29 PersistenceTest describes still on auto-schema path. File fails `AR_NO_AUTO_SCHEMA=1` until done. Splitter heuristic: bundle by table-set, not line range — share a beforeEach when describes share `items`/`users`/`posts` schemas.

- **121a — cluster A (~200 LOC).** Describes at lines ~545, 725, 978-tail, 1144. The 725 describe is the biggest single block (~250 LOC, lots of inline `createTestAdapter()` per test, `tableName = "posts"|"cb_posts"|"special_posts"|"count_posts"|"count_posts2"|"ts_posts"`).
- **121b — cluster B (~200 LOC).** Describes at ~2358, 2453, 2662, 2682, 2724, 2744, 2777 — mostly `Item`/`User` with `_tableName` overrides.
- **121c — cluster C (~200 LOC).** Describes at ~3393, 3501, 3557, 3662, 3866, 3911, 3995, 4115, 4197 plus trailing inline-`adp` blocks (~4684, 4714, 4729). Post + status/lock_version + composite-PK `order_items` + query-constraints models.

### Batch 122a — Phase 5 AutomaticInverseFindingTests (~250 LOC, standalone)

Followup from #1752. Single describe at `inverse-associations.test.ts:~782` (420 LOC of source). Large because it touches many fixture tables: men, faces, interests, weird_faces, man_as, custom_faces, man_bs, works, bosses, cards, decks, chips, boards, ratings, comments, posts, taggables, taggable_parents, auto_poly_tags, auto_poly_posts.

### Batch 122b — Phase 5 inverse-associations small describes (~250 LOC)

Followup from #1752. Bundle the 5 small describes:

- `InversePolymorphicBelongsToTests` (~1204, 155 LOC)
- `InverseCachedPathTests` (~1361, 76 LOC)
- `InverseAssociationTests` (~1439, 107 LOC)
- `inverse_of` (~1548, 63 LOC)
- `InverseHasOneTests` (~1613, ~150 LOC)

### Batch 123 — Inflector `Human → humans` irregular pin (~5 LOC)

Followup from #1752. Trails' inflector pluralizes `Human → humen` (the `man → men` irregular fires on `-man` suffix). Rails' inflector treats `human → humans` correctly. Add `inflect.irregular("human", "humans")` to `packages/activesupport/src/inflector/inflections.ts` to override the `man → men` fallthrough.

Note for future migrators: until this lands, defineSchema tables for `Human`-modeled fixtures must be named `humen`.

### Batch 124 — Phase 5 attribute-methods.test.ts (~250 LOC, may split)

Followup from #1749. Deferred from the attribute-methods cluster bundle: 1872 LOC, ~79 freshAdapter sites, 61 failures under `AR_NO_AUTO_SCHEMA=1` referencing `posts`, `topics`, `items`, `people` with diverse attribute sets (title/body/published/count/active/score/name/Title/status/occurred_at/breed/starts_on/created_at/author_name/...). Enumerating the schema is the bulk of the work.

Note from #1749: `attribute-methods/{query,read,write,time-zone-conversion}.test.ts` already pass under `AR_NO_AUTO_SCHEMA=1` (in-memory only, no DB writes). No migration needed.

### Batch 125 — Top-level `const adapter = freshAdapter()` audit (~tests-only sweep)

Followup from #1751. Latent bug pattern surfaced: top-level `const adapter = freshAdapter()` inside `describe()` shares one adapter across all tests, no cleanup. Convert to `let` + `beforeEach`.

```
grep -nE "^\s+const adapter = freshAdapter\(\)" packages/activerecord/src/*.test.ts
```

### Batch 126 — SQLite strict + checkVersion floor (~110 LOC, risk: low)

Followup from #1743.

- ~30 LOC — node-sqlite `strict` round-trip test coverage (gated on a CI lane with Node 22.10+ `node:sqlite`). Assert `SELECT "missing_col"` throws under `strict: true` and silently returns the literal under `strict: false`.
- ~20 LOC — Adapter→driver `strict` forwarding test: fake `SqliteDriver` whose `openSync()` captures config; assert `SQLite3Adapter.strictStringsByDefault = true` (no per-connection override) yields `strict: true`.
- ~50–80 LOC — Decide `checkVersion()` floor. Preferred: raise to 3.37 (matches Rails) and drop the `sqlite_master` fallback in `tables()` / `dumpStructure()` (~20 LOC removed). Alternative: keep 3.8 floor + add `sqlite_master` fallbacks at pragma_table_list call sites.
- ~10 LOC — Cross-link `SqliteOpenConfig.strict` docstring to the per-table STRICT mechanism once it lands.
- Cosmetic — Extract shared `pragma_table_list` lookup helper (with optional schema scope) shared by `tableExists` + `dataSourceExists`.

### Batch 127 — actionpack benchmark + Metal cleanup (~210 LOC, risk: low)

Followups from #1744 + #1757.

- ~80 LOC — Extract shared `benchmark()` helper to `activesupport`; switch both `AbstractController::Logger` and `ActiveRecord::Base` to use it. Removes the divergent duplicates.
- ~80 LOC — Port `build_middleware` on `ActionController::MiddlewareStack`: extend local `Middleware` with `actions`/`strategy`/`valid?(action)`, refactor `MiddlewareStack#build` to consult `valid?`. Closes `metal.rb` to 100%.
- ~20 LOC — Rewrite `head()` to set `_responseBody = ""` directly; delete `_performed` flag and `markPerformed` helper (mirrors Rails' `head.rb`).
- ~30 LOC — Collapse `_body` / `_responseBody` to a single field on `Metal`; route `body` getter/setter through `_responseBody`. Removes the two-write commit in `dispatch()`.

Deferred: `configAccessor()` helper that mirrors Rails' `class_attribute` inheritable semantics (~120 LOC). Defer until a caller needs instance-method semantics; `applyAssetPaths`/`applyLogger` markers suffice for now.

### Batch 128 — PG defineSchema test-infra + array-default (~290 LOC, may split)

Followup from #1753.

- ~30 LOC — `quoteDefaultExpression` (`connection-adapters/postgresql/quoting.ts:193`) array-default serialization: route JS array through `OID::Array.serialize` before `quote()`. Unblocks `array.test.ts > default`, `default strings`, `change column with array`. Pre-existing on `main`.
- ~250 LOC — PG adapter cluster B Phase 5 migration: `json.test.ts`, `uuid.test.ts`, `hstore.test.ts`, `interval.test.ts`, `range.test.ts`, `infinity.test.ts`, `virtual-column.test.ts`, `explain.test.ts` + `schema-ar-models.ts` helper. `json`/`uuid` get real `defineSchema`; others get `{}` placeholder markers until PG-only types are expressible.
- ~10 LOC — `scripts/audit-define-schema.ts` comment/string strip ordering: strip line/block comments BEFORE strings so apostrophes inside `//` comments don't open fake strings that swallow subsequent `defineSchema(` calls.

### Batch 129a — Phase 5 batches.test.ts (~250–350 LOC, standalone)

Followup from #1756. 2083 LOC source, 90 failures under `AR_NO_AUTO_SCHEMA=1`. Schema enumeration (`posts`, `subscribers`, `subscriptions`, …) fills most of the budget.

### Batch 129b — Phase 5 counter-cache.test.ts (~250–350 LOC, standalone)

Followup from #1756. 2208 LOC source, 85 failures under `AR_NO_AUTO_SCHEMA=1`. Same shape as 129a.

### Batch 129c — audit-define-schema heuristic (~10 LOC, tests-only)

Followup from #1756. `annotate.test.ts` + `attribute-methods/{query,read,write,time-zone-conversion}.test.ts` are already green under `AR_NO_AUTO_SCHEMA=1` but the audit script flags them. Either add a no-op `defineSchema(adapter, {})` marker, or refine `scripts/audit-define-schema.ts` to skip files whose only adapter use is `toSql()` / pure in-memory model construction.

### Batch 130 — enum string-status describe cleanup (~30 LOC, risk: low)

Followup from #1747. Four "string status" Post tests hardcode `tableName = "string_status_posts"`; the table has no Rails analogue and exists only because the file declares `posts.status` as both integer and string in different `it()`s. Collapse by hoisting a `describe("EnumTest with string status", …)` with a single class declaration + rename the model `tableName` consistently, then drop `string_status_posts` from `TEST_SCHEMA`.

### Batch 131 — MySQL adapter post-merge cleanups (~180 LOC, risk: medium)

Followups from #1759 + #1777.

- ~20 LOC — Extend `Mysql2Adapter#columns` SELECT to include `extra` and pass `autoIncrement: extra === "auto_increment"` into the `Column` constructor (mirrors `abstract-mysql-adapter.ts:1515`). Then simplify `adapters/abstract-mysql-adapter/bulk-alter.test.ts` to read `Column#autoIncrement` directly instead of querying `information_schema`.
- ~60–100 LOC — Replace `RecorderTableProxy` (`migration/command-recorder.ts:641`) hand-enumerated method list with a `Proxy`-based `method_missing` that records any DDL method call. Predicates like `columnExists`/`indexExists` should still delegate to a real `Table` for read-through. Mirrors the bulk-path Proxy at `schema-statements.ts:666`.
- ~30–50 LOC — Adapter-level `setSessionVariable(name, value)` on `AbstractMysqlAdapter` (cheaper alternative to the `variables:` pool-init pattern used in #1777). Lets the ANSI_QUOTES test mirror Rails' `execute("SET SESSION ...")` shape more literally.
- ~20 LOC — Optional: rewrite `mysqlQuote` to keep `"…"` intact when `@@SESSION.sql_mode` includes `ANSI_QUOTES`. Closes the ANSI-quotes coverage gap (today our builders pre-rewrite `"foo" → ``foo``` unconditionally).

### Batch 132 — PG pgColumn semantic types + network.test port (~120 LOC, risk: low)

Followup from #1761.

- ~30 LOC — Switch `pgColumn` (`connection-adapters/postgresql/schema-definitions.ts:519`) to pass semantic type strings (`"cidr"`, `"inet"`, `"hstore"`, `"macaddr"`, `"ltree"`, `"tsvector"`, `"xml"`, `"money"`, `"oid"`, range types) and drop explicit `sqlType` for types already in `nativeDatabaseTypes`. Keep explicit `sqlType` only for `serial`/`bigserial` (not native) and `bit`/`bitVarying` (need uppercase + `(limit)` formatting). Unblocks the network_test port.
- ~80 LOC — Port `vendor/rails/activerecord/test/cases/adapters/postgresql/network_test.rb` as `adapters/postgresql/network.test.ts`: `cidr_column`, `inet_column`, `macaddr_column`, `network_types`, `invalid_network_address`, `schema_dump_with_shorthand`, `cidr_change_prefix`, `mac_address_change_case_does_not_mark_dirty`.
- ~10 LOC — DX type test audit: `type-registry.ts` now maps `inet`/`cidr` → `IPAddr`. Flip any tests in `packages/activerecord/{dx-tests,virtualized-dx-tests}` asserting `string` for inet/cidr columns to `IPAddr`.

### Batch 133 — JoinDependency nested-through fidelity (~190 LOC, risk: medium)

Followups from #1768. Adjacent to Batch 28b (the larger AliasTracker port).

- ~80 LOC — Adapter-aware quoting in `JoinDependency`: thread the source-model's adapter into the constructor, replace the three string-concat predicates (polymorphic source_type + 2 STI types at `:214`, `:449`) with `adapter.quote(...)`.
- ~50 LOC — Port `ThroughReflection#check_validity!` polymorphic-source-needs-source_type branch. Wire into reflection construction so misconfigured associations fail at definition time with `HasManyThroughAssociationPolymorphicSourceError`. Once landed, the `return null` guards in `_resolveThroughJoin` + `_addThroughAssociation` become dead.
- ~30 LOC — `loadHasManyThrough` (`associations.ts:1320-1336`): extend `sourceType` handling to nested-through where the inner through is itself through with polymorphic source. Currently dropped.
- ~30 LOC — Regression-pin test for `distinct` propagation through `loadHasManyThrough` (port Rails 431 `test_distinct_has_many_through_a_has_many_through_association_on_through_reflection`). Already works end-to-end; pure test.

### Batch 134 — counter-cache resetCounters fidelity (~120 LOC, risk: low)

Followup from #1769. Distilled from triage annotations on the 7 remaining `resetCounters` skipped tests.

- ~10 LOC — Modular (namespaced) class-name resolution in `resetCounters` target lookup (covers "reset counters with modular association" and "reset counters with modularized and camelized classnames").
- ~10 LOC — Honor `reflection.options.className` in `resetCounters` target resolution ("reset counter with belongs_to which has class_name").
- ~15 LOC — Disambiguate two `belongs_to` to the same target class via reflection name ("reset the right counter if two have the same class_name" / "same foreign key").
- ~10 LOC — Short-circuit UPDATE when `SELECT COUNT(*)` matches stored value ("reset counter skips query for correct counter").
- ~15 LOC — Composite-PK WHERE generation ("reset counters for cpk model").
- ~30 LOC — Through-reflection branch: walk to join model and count via that table ("reset counter of has_many :through association").
- ~15 LOC — Apply reflection scope (`select`, `where`) when composing the COUNT ("reset counter works with select declared on association").

### Batch 135 — counter-cache touch: + pendingCounterCache (~55 LOC, risk: low)

Followup from #1769.

- ~30 LOC — Wire `belongs_to(touch:)` through `updateCounters` / `increment` / `decrement` callbacks (covers two `touch:` skipped tests at `counter-cache.test.ts:700, 706`).
- ~10 LOC — `touch:` branch in `resetCounters` that forces UPDATE ("reset counter performs query for correct counter with touch: true").
- ~15 LOC — `pendingCounterCache` deferred resolution edge case: eager column auto-derivation runs against unloaded target ("counter cache on unloaded association class works"). Fix in `associations/builder/belongs-to.ts` + `counter-cache.ts`.
- Test-only — port Rails' Thread-parallel "concurrent inserts" test to `Promise.all` style. Pure infra.
- Cosmetic — `_counterCacheColumns` is a `Set<string>` in trails vs `Array` in Rails; semantically equivalent for membership but iteration order differs. Pre-existing divergence; small isolated fidelity PR (~10 LOC) if it ever bites.

### Batch 136 — inBatches deferred follow-ups (~135 LOC, risk: low)

Followups from #1770.

- ~15 LOC — `useRanges` empty-scope auto-detection: compare `relation.toSql()` against `unscoped.all.toSql()`. Rails uses `(empty_scope && use_ranges != false) || use_ranges`; we only honor explicit `useRanges: true`.
- ~30 LOC — Multi-column lexicographic `useRanges` (extend to call `applyFinishLimit` instead of building flat `gteq.and(lteq)`). Today composite cursors silently fall back to `IN (...)`.
- ~20 LOC — Port `find in batches should ignore the order default scope` (inline `PostWithDefaultScope` with `defaultScope(rel => rel.order("title"))`; assert batch order is by id).
- ~40 LOC — `assertQueriesMatch` test helper (SQL pattern matcher) + port `find in batches should quote batch order` (+ `_with_desc_order`).
- ~30 LOC — `Relation.create` test infra + port `.find_each respects table alias`.

### Batch 137 — polymorphic-inverse follow-ups (~180 LOC, risk: medium)

Followups from #1773.

- ~30 LOC — Implement `Base.polymorphicClassFor(name)` (Rails' `ActiveRecord::Inheritance#polymorphic_class_for`) so the registry-fallback chain in `isInversePolymorphicAssociationChanged` collapses to a single strict lookup.
- ~50 LOC — Auto-detect `inverseOf` for polymorphic `hasOne` (Rails `Reflection#automatic_inverse_of`). Today callers must pass `inverseOf:` explicitly.
- ~80 LOC — Un-skip `inverse-associations.test.ts:1393, :1399` (polymorphic inverse-name validation: "trying to set polymorphic inverses that dont exist…"). Needs polymorphic inverse-name validation hook.
- ~20 LOC — `BelongsToPolymorphicAssociation` overrides for `foreignKeyNames` / `associationPrimaryKeys` to absorb the unresolved-klass workaround currently sitting on the non-polymorphic parent (`belongs-to-association.ts:277`).

### Batch 138 — connectsTo polish + Person fixture (~50 LOC, risk: low)

Followups from #1776.

- ~20 LOC — Fold the SQLite + URL-passthrough branches of `establishWithConfig` into `buildAdapterArg` so both entry points share a single normalizer.
- ~30 LOC — Fixtures-style `Person` test model (or expand existing) so the un-skipped `establishing a connection in connected_to block uses current role and shard` test loads seeded rows and exercises `Person.first` like Rails does. Closes the shape gap (currently creates `people` inline).

### Batch 139 — insert-all option-surface + verifyAttributes via schemaCache (~190 LOC, risk: medium)

Followups from #1786.

- ~30 LOC — Thread `returning` / `recordTimestamps` through non-bang `Relation#insertAll` / `#insert` / `#upsertAll` / `#upsert` (and forward in `querying.ts`). Closes the bang/non-bang option-surface divergence (Rails accepts both kwargs on bang AND non-bang at `relation.rb:723, 765, 790, 910`).
- ~50–80 LOC — Switch `insert-all.ts#verifyAttributes` allowlist from `attributeNames()` to `schemaCache.columnsHash` lookup. Requires making constructor async (schema-cache reads are async) or pre-fetching in `InsertAll.execute`. Removes the `known.size === 0` soft-fail and matches Rails exactly.
- ~150 LOC (tests-only) — Sharpen remaining single-line `BLOCKED:` annotations in `insert-all.test.ts` (STI cluster, hasManyThrough, table-name-with-database, MySQL `VALUES()` raw SQL, type-cast+serialize consistency) into BLOCKED/ROOT-CAUSE/SCOPE format. Follow-on to #1786's first pass.

### Batch 140 — scope_for_create + CollectionProxy refactor (~150 LOC, risk: medium)

Followups from #1782.

- ~30 LOC — Drop redundant `{...this.scopeForCreate(), ...attrs}` pre-merges in `AssociationRelation#build/create/createBang` (association-relation.ts:62, :82, :105). Centralized application in base now covers them.
- ~40 LOC — Composite-FK / `queryConstraints` handling in `CollectionProxy._buildRaw` (collection-proxy.ts:660-666). Pre-existing on `main`. `[foreignKey as string]` stringifies arrays into `"a,b"`; should zip FK columns with PK components like `push()` does. Also falls back to `options.queryConstraints`.
- ~80 LOC — Move `CollectionProxy` off direct construction onto a real `Association` instance so `_applyScopeForCreate` collapses to the base helper. Eliminates the two-implementations risk (proxy's local `skipAssign` computation vs base's rich reflection).
- Rails-divergence note worth a ticket: CollectionProxy STI peek (`scope.type` selecting subclass before `new`) deviates from Rails' `Association#build_record` which constructs base class first. Probably a real Rails bug — file upstream.

### Batch 141 — Batch 37 prerequisite: destroyAssociations wiring (~40 LOC, risk: low)

Followup from #1781. Blocks the larger Batch 37 work.

- ~30 LOC — Wire `destroyAssociations` (no-op stub at `persistence.ts:1236`) into the standard `destroy()` flow. Then delete the `beforeDestroy` bridge install + `HABTM_DESTROY_INSTALLED` flag from `has-and-belongs-to-many.ts:241-254` (translation-layer hack from #1781).
- ~10 LOC — Switch HABTM `handleDependency()` to explicit `deleteAll("deleteAll")` to match Rails' strategy, decoupling join cleanup from the middle's `dependent:` option.

### Batch 142 — HMT composite-PK guards + typed errors (~50 LOC, risk: low)

Followups from #1774.

- ~10 LOC — `habtmOwnerPk`-style composite-PK guard in `buildHabtmThroughRecord`: throw `ConfigurationError` instead of producing undefined join FKs when `ownerPk` resolves to an array.
- ~15 LOC — Convert plain `Error` throws in `buildHabtmThroughRecord` to typed `ConfigurationError` / `HasManyThroughAssociationNotFoundError` (aligns with `associations/errors.ts`).
- ~20 LOC (conditional) — `@through_records` per-target cache in `HasManyThroughAssociation` (Rails' `compare_by_identity` hash). Only worth doing if double-build patterns surface in practice — `concat([x, x])` would create two join rows where Rails reuses one.
- ~5 LOC — Drop `validate:` propagation in `saveThroughRecord` to align with Rails' unconditional `save!` (only if a parity-test failure surfaces).

### Batch 143 — Migration introspection + Ruby-parity small items (~10 LOC, bundle with other migration work)

Followups from #1775. Tiny — bundle with future migration/schema-dump work per "no tiny PRs".

- ~3 LOC — PG `numeric(p)` no-scale: skip scale in `_introspectColumns` when `numeric_scale === 0` AND raw type has no comma (avoids dumping as `decimal(p, 0)`).
- ~5 LOC — PG `interval(p)` precision: `_normalizeIntrospectedType` doesn't map `interval`; add `interval → {type:"interval", precision}` and include in the dtPrec propagation conditional.
- ~2 LOC — `migrationsStatus` sort regex `/^\s*(-?\d+)/` accepts `-` but not `+`. Use `/^\s*([+-]?\d+)/` then `BigInt` for Ruby `String#to_i` parity.
- ~1 LOC — `smallserial` integer-byte miss: add `smallserial: 2` to `intByteLimit` (PG `smallserial` is backed by `int2`).

### Batch 145 — BeforeTypeCast alias sweep + ForDatabase test + naming polish (~75 LOC, risk: low)

Followups from #1790. Per-attr `<attr>BeforeTypeCast` getter generation shipped; the followups close adjacent gaps.

- ~30–50 LOC — Sweep other `<attr>_before_type_cast` tests across types (decimal/datetime/integer/json/array) currently skipped with "BTC alias not generated" root-cause. Grep `it.skip.*before.type.cast`; un-skip and port bodies.
- ~10 LOC — Wire `<attr>ForDatabase` aliases into a test to lock in the contract (currently only `<attr>BeforeTypeCast` is exercised via "cast value on write").
- ~15 LOC — Decide whether `savedChangeTo<X>Values` (predicate-vs-values disambiguation needed because TS method names can't carry `?`) should be the standard across all generated dirty methods. If yes, audit + rename for consistency; if no, document the divergence.
- Doc-hygiene: Move `it.skip("yaml round trip with store accessors")` in `hstore.test.ts` to the permanent-skips list (Ruby YAML/Marshal, no Node.js equivalent).

### Batch 144 — Schema-dumper KNOWN_DSL_TYPES expansion (~30 LOC, architectural)

Followup from #1775. Latent CTAS / SchemaDumper round-trip gap.

`schema-dumper.ts#sqlTypeToDsl` lowercases input, matches `SQL_TYPE_MAP` first, falls back to `KNOWN_DSL_TYPES` (only 12 entries). `DSL_HELPER_METHODS` entries missing from `KNOWN_DSL_TYPES` don't round-trip: `timestamptz`, `citext`, `jsonb`, `uuid`, `time`, `json`, `hstore`, `ltree`, `tsvector`, `inet`, `macaddr`, `xml`, `money`, `int4range`/`int8range`/`numrange`/`tsrange`/`tstzrange`/`daterange`. Expand `KNOWN_DSL_TYPES` to cover all `DSL_HELPER_METHODS` entries (or add the corresponding SQL types to `SQL_TYPE_MAP`). Should land before further CTAS / schema-dump fidelity work.

---

## Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous.
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage.
- **~5 LOC** — Triage `vendor/rails/activerecord/test/cases/mixin_test.rb` (4 tests: `test_update`, `test_create`, `test_many_updates`, `test_create_turned_off`). #1772 added 2 entries to `unported-files.ts` under the Ruby-module-semantics theme, but these tests actually exercise the `Mixin` AR model's timestamps + `lft_will_change!` — fixture-blocked (no `mixins` fixture / `lft` column in trails). Re-classify with the correct reason, or open a port slot if the timestamp tests are in-scope.
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
