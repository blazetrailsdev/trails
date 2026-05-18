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

### Batch 3 — schema-dumper fidelity sweep (~110 LOC, risk: low) — bundles #144

Two `schema-dumper.ts` round-trip gaps that should land together (the Batch 144 KNOWN_DSL_TYPES expansion is a prerequisite for the partition tests' DSL emission).

- **PG schema-dump table/partition polish (~80 LOC, was Batch 3).** Unblocked by #1726.
  - ~30 LOC — Wire `tableOptions()` into `schema-dumper.ts:emitTable`. Requires making the dump loop async.
  - ~30 LOC — PG table comment schema dump: forward `adapterTableOpts.comment` in `emitTable`; add `COMMENT ON TABLE` emission after `createTable`.
  - ~20 LOC — PARTITION BY schema dump: 2 `BLOCKED: adapter-pg` partition tests in `SchemaCreateTableOptionsTest` flow through the same `fetchTableOptions → options:` path; need `tablePartitionDefinition` wired correctly + test bodies.
- **Schema-dumper KNOWN_DSL_TYPES expansion (~30 LOC, architectural, was Batch 144).** Followup from #1775. Latent CTAS / SchemaDumper round-trip gap. `schema-dumper.ts#sqlTypeToDsl` lowercases input, matches `SQL_TYPE_MAP` first, falls back to `KNOWN_DSL_TYPES` (only 12 entries). `DSL_HELPER_METHODS` entries missing from `KNOWN_DSL_TYPES` don't round-trip: `timestamptz`, `citext`, `jsonb`, `uuid`, `time`, `json`, `hstore`, `ltree`, `tsvector`, `inet`, `macaddr`, `xml`, `money`, `int4range`/`int8range`/`numrange`/`tsrange`/`tstzrange`/`daterange`. Expand `KNOWN_DSL_TYPES` to cover all `DSL_HELPER_METHODS` entries (or add the corresponding SQL types to `SQL_TYPE_MAP`). Should land before further CTAS / schema-dump fidelity work.

### Batch 14 — Autosave E-series CPK + nested-attributes — needs re-scope

**Audit finding (spawn aborted, no PR):** the three items are each materially deeper than the ~80 LOC estimate. Splitting honestly:

- **`queryConstraintsList` workaround removal — DROP from this batch.** Our impl already returns pk as array for base-class CPK models, mirroring Rails. The scalar-fallback at `autosave-association.ts:600-605` exists because `computePrimaryKey` collapses CPK to "id" via `composite_primary_key? ? (pk.includes("id") ? "id" : pk)` — Rails itself does this (`autosave_association.rb:583-586`). Removing without understanding which existing CPK autosave tests rely on it risks regression.
- **CPK `setIds` un-skip — gated on Batch 20.** The Rails test uses `Cpk::Order` (CPK parent) with `has_many :order_agreements`, requiring auto-derived composite FK `[shop_id, order_id]` on the child. We don't auto-derive composite FKs from CPK parents — that's Batch 20's "composite-FK has-many-through write support" (medium-high risk). Re-list under Batch 20 followup.
- **`nestedAttributesTarget` population — its own batch (~150–250 LOC).** The field lives on `CollectionAssociation` (`collection-association.ts:19`) but `CollectionProxy` (user-facing) doesn't expose or hold the association instance. Plumbing requires exposing inner association on the proxy OR moving the field. Additionally, `assignNestedAttributes` doesn't build child records (built lazily in `processNestedAttributes` at save time) — Rails-faithful `:nested_attributes_order` requires rearchitecting nested-attributes to build eagerly.

### Batch 18 — Reflection fidelity sweep (~185 LOC, risk: low–medium) — bundles #96, #99, #118, B21

Five `reflection.ts` (+ adjacent) followups. Bundle as one PR — same file, same mental model.

- **Reflection residual cleanup (~5 LOC, was Batch 18).** Delete dead `createReflection` in `reflection.ts:1772` (now-stale asymmetry vs `Reflection.create`). The "deeply nested through-association resolution in `_buildThroughScope`" item folded into Batch 29 (same code path). Watchpoint: the `_invalidateAssociationIds → assocInstance.reset()` widening fires for every through-association push.
- **Sweep C aftermath (~40 LOC, was Batch 96).** `AssociationReflection.isPolymorphic()` returning true when `options.as` is set was DROPPED from Sweep C — implementation broke the `HasOneAssociationPolymorphicThroughError` guard at `reflection.ts:1344`. Audit Rails' actual `polymorphic?` implementation for `has_one :as` and identify which guards need updating before re-applying.
- **Type-audit W1a aftermath (~70 LOC, was Batch 99).** ~30 LOC activesupport W1a equivalent: `Function` + `Record<string, any>` sweep + enable `no-unsafe-function-type`. `prepend.ts:PrependMethod = (this: any, super_: Function, ...)` is the high-leverage fix — currently forces `super_ as (...args: any[]) => unknown` casts. ~10 LOC cosmetic — `type AnyClass = abstract new (...args: any[]) => any` duplicated in `suppressor.ts`, `no-touching.ts`, `delegation.ts`. Centralize. ~30 LOC — `reflection.ts:normalizedReflections` `rawRef as any` cast is the roughest remaining cast. Define a `RawReflection` interface capturing `parentReflection?`.
- **`_throughOwnerCols` queryConstraints branch audit (~20 LOC, was Batch 118).** Followup from #1792. Item 1 of original B118 (polymorphic composite guard) shipped. Item 3 (has-one-through composite-PK throws) had no matching sites — closed as no-op. Remaining: audit `_throughOwnerCols` `options.queryConstraints` FK branch (collection-proxy.ts ~1080) for reachability. Per #1792 analysis: likely dead post the `Reflection` constructor rewrite. Either delete the branch or add a fixture exercising it.
- **B21 polymorphic CPK + query_constraints FK derivation (~20 LOC, was B21).** Followup from #1862. `deriveFkQueryConstraints` (`reflection.ts:561-602`) array `primaryKey` always hits `undefined` comparisons, throws `ConfigurationError` for composite-table-PK + query_constraints models.

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

### Batch 33 — HABTM Slot D options + parent_reflection (~50 LOC, risk: low)

- ~30 LOC — Add `parent_reflection` field to MiddleReflection / target hasMany reflection in HABTM builder (Rails `associations.rb:1884, 1905`).
- ~20 LOC — Tighten `habtmOptions → middle hasMany` to Rails' explicit allowlist; drop leakage of `readonly`/`dependent`/`inverseOf`.

### Batch 37 — HABTM Slot H structural (~200 LOC, risk: high)

**Theme:** Wiring `associationForeignKey` + `destroyAssociations` + distinct reflection.

- ~50 LOC — Wire `associationForeignKey` end-to-end through `createHabtmJoinModel` (target FK on right belongs_to) and `_resolveHabtmJoin`/`loadHabtm`. Today hardcoded as `${underscore(singularize(name))}_id`.
- ~30 LOC — Pass `options.foreignKey` into middle reflection options.
- ~80 LOC — Wire `destroyAssociations` stub in `persistence.ts:1221` into the destroy flow. Then refactor HABTM `beforeDestroy` to `destroy_associations` override module.
- ~40 LOC — Produce distinct hasMany-through reflection for public name (Rails' `has_many name, **hm_options`).

### Batch 39 — Annotation drift sweep (~tests-only) — bundles #57, #75

Three tests-only annotation-normalization passes. Bundle as one sweep PR — pure test housekeeping, no source risk.

- **HABTM annotation drift sweep (was Batch 39).** Re-tag mis-labeled `BLOCKED: habtm` tests. ~160 of 168 are mis-tagged. Re-tag across `has-and-belongs-to-many-associations.test.ts`, `eager.test.ts`, `nested-through-associations.test.ts`, `extension.test.ts`, `inner-join-association.test.ts`, `has-many-associations.test.ts`. Mirror #1641's STI annotation drift workflow.
- **PG network/cidr test cleanup (was Batch 57).** Pure test cleanup; impl gap (pgColumn semantic types) is folded into Batch 132. 3 stub tests in `cidr.test.ts` (`cidr column`, `cidr type cast`, `cidr invalid`) have no Rails source backing — find counterparts or delete. Possible missing file: `adapters/postgresql/inet.test.ts` mirroring Rails' `inet_test.rb` — likely consolidates with Batch 132's network.test port.
- **Schema Slot K annotation normalization (was Batch 75).** **Lands AFTER H-b/I/J.** Annotation normalization across all 128 BLOCKED annotations. Plus `schema change with prepared stmt` remains skipped (needs `adapter.preparedStatements` mode in PG test helper).

### Batch 45 — `Base.adapter` permanent-checkout → leased (architectural)

**Replaces the original Batch 45 leak-audit framing.** Audit found 3 of 5 items already shipped (checkoutAsync always called from withConnection per #1547; withConnection async/await dedupe per #1547; ExecutorHooks.complete resolver wired in `index.ts:11` via `setConnectionHandlerResolver`). The remaining test-suite leak isn't a sweep — it's structural.

**Root cause.** `Base.adapter` (`base.ts:997-1028`) calls `pool.checkout()` and caches the result on `_adapter` indefinitely. Each model permanently holds one pool connection; no checkin. Every test that touches a model leaks until process exit.

**Scope (needs design pass before sizing):**

- Replace permanent checkout with `withConnection`-style lease, OR
- Wire executor-driven release (use `ExecutorHooks` so connections return to pool when the request/test completes).

**Blast radius:** every model and every test in the AR test suite. Needs its own design pass + careful staged rollout (probably behind a flag, then flip).

**Dropped:** `buildAsyncExecutor` returns `null` at `connection-pool.ts:1061` — comment correctly notes JS single-threaded thread-pool N/A. Real semaphore would be ~30-60 LOC + tests but only matters once `Relation#loadAsync` actually fans out (it currently doesn't). Re-open if loadAsync parallelism lands.

### Batch 48 — MySQL active-schema Slot D residual (~50 LOC, risk: medium)

Most items from prior B48 shipped via #1871. Remaining:

- ~50 LOC — `CommandRecorder#changeTable` inversion support if not already covered by `command-recorder.ts:416` (audit found `_changeTable` bulk path may already invert; verify before opening PR).

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

### Batch 56 — PG long-tail + schema-cache scoped-schema sweep (~200 LOC, risk: low–medium) — bundles #76

PG long-tail Slot E+F+H items + Batch 76's `schema-cache.ts` / `changeColumn` work share the scoped-schema un-skips and benefit from landing together.

- **PG long-tail Slot E+F+H small (~105 LOC, was Batch 56).**
  - ~5 LOC (H) — Generalize `PostgreSQLAdapter.nativeType("datetime")` (~line 4066) to delegate to `this.nativeDatabaseTypes()["datetime"]` instead of `=== "timestamptz"` special-case.
  - ~10 LOC (E) — `schema load scoped to schemas` un-skip (needs `schema-cache.ts` clear).
  - ~20 LOC (E) — `schema dump scoped to schemas` un-skip: `enumTypes()` returns schema-qualified names for non-public schemas.
  - ~20 LOC (F) — Wire `type_for_attribute(column).deserialize(value)` for returned column values.
  - ~50 LOC (F) — PG-specific `fills auto populated columns on creation` test for single-PK IDENTITY (Rails `persistence_test.rb:87`).
- **Schema cross-slot dumper + changeColumn (~95 LOC, risk: medium, was Batch 76).**
  - ~15 LOC (F) — Wire `changeColumn` through `changeColumnForAlter` → `SchemaCreation#accept` (Rails routing).
  - ~20 LOC (E) — `schema load scoped to schemas` un-skip: needs `schema-cache.ts#clear` invalidation. (Overlap with the Batch 56 entry — implement once.)
  - ~50 LOC (E) — `schema dump scoped to schemas` un-skip in enum.test.ts: `enumTypes()` schema-scoped filtering + `with_test_schema` infra. (Overlap with Batch 56 entry — implement once.)

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

### Batch 64 — connection-pool wiring tail (~123 LOC, mixed risk) — bundles #101

Two `connection-pool.ts` followups; landing together avoids touching the same file twice.

- **PG connection Slot A + D (~63 LOC, was Batch 64).**
  - ~3 LOC — `tableAliasLength()` override on `PostgreSQLAdapter` returning `this.maxIdentifierLength()`. Blocked by base-class sync `number` return — would widen to `Promise<number> | number`.
  - ~20 LOC — `connection-pool.ts:449,505,522` call `connection.verifyBang()` without `await`. Post-#1464 the PG override is async.
  - Test-infra refactor — Move `SQLSubscriber` from `adapters/postgresql/test-helper.ts` to a shared location when `adapters/abstract-mysql-adapter/connection.test.ts` is un-skipped.
- **Query-cache wiring remainder (~60 LOC; Phase 4 blocked for part, was Batch 101).**
  - ~15 LOC — Wire `Base.cache(&block)` / `Base.uncached(dirties:)` class methods resolving `connectionPool` then delegating to `pool.withQueryCache` / `pool.disableQueryCache`.
  - ~40 LOC (Phase 4, blocked on ConnectionHandler PR 6) — `QueryCache.installExecutorHooks` + `QueryCache.run`/`complete`. Unblocks ~6 pool-attachment tests.
  - ~5 LOC — `dirtiesQueryCache` on `NullPool` (hardcoded `true` at `connection-pool.ts:121`) — Rails also returns `true` unconditionally, nit.

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

### Batch 74 — Schema Slot H-b includes/where promotion (~60 LOC, risk: medium)

- ~5 LOC — `whereBang` in `query-methods.ts` should call `PredicateBuilder.references(opts)` for hash args (Rails `where!` auto-adds table refs). Unblocks `includes(:assoc).where("assoc.col": val)` auto-promotion without explicit `.references()`.
- ~50 LOC — HABTM support in `JoinDependency.addAssociation` (currently returns null for `"hasAndBelongsToMany"` type). `_addHabtmAssociation` analog to `_addThroughAssociation`. Prereq for Rails-exact `Song.includes(:albums).where(...)` form.
- ~5 LOC — `defaultJoinTableName` in `associations.ts` should derive from `model.tableName` not class name; currently loses schema prefix for `music.songs`-style tables.

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

### Batch 93 — Test residuals multi-DB infra (~150 LOC, risk: medium)

- ~20 LOC — `reconnect after bad connection on check version` test: pg-npm pool has no single-connection version-stub hook. Needs `_databaseVersionForTest()` setter or injectable version-check hook.
- ~100–150 LOC — Second named connection pool equivalent to Rails' `ARUnit2Model` in the test suite. Unblocks `MultiDbMigratorTest` ×7 (#1531) + `PrimaryClassTest` ×2.

### Batch 94 — Audit aftermath bundle (~110 LOC, risk: low) — bundles #98

Two post-audit polish items; bundle to clear both above the no-tiny-PRs floor.

- **Sweep B test-infra (~90 LOC, was Batch 94).** ~50 LOC `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block via a module-level `_defaultSqlTimezoneOverride` + `withEnvTimezone(zone, fn)` test helper). Unblocks 2 base.test.ts tests. ~10 LOC `HashAccessor.write` json-branch regression test (path is correct today; needs a defensive test). ~30 LOC `SchemaDumper.fkIgnorePattern` configurability vs `ForeignKeyDefinition.isExportNameOnSchemaDump` hardcoded `fk_rails_` pattern. Either make `isExportNameOnSchemaDump` accept the configured pattern, or deprecate `fkIgnorePattern`.
- **`as any` audit verify (~20 LOC, was Batch 98).** Verify 2 `bug-suspected` candidates from the as-any audit: `relation.ts:4965` `(this.spawn() as any).asyncBang()` (possible swallowed promise) + `abstract/database-statements.ts:1827` `(relation as any).arel()` (verify sync on every host). If real, surgical fixes.

### Batch 95 — Sweep A reverts (need re-design, ~55 LOC)

- ~5 LOC — Remove `RangeType.encodeLiteral` pre-serialization workaround. Reverted: still load-bearing — removing it broke `range.test.ts > where by attribute with range`.
- ~20 LOC — Fix the BindParam route for range WHERE predicates so range values quote correctly. Unblocks the `RangeType.encodeLiteral` removal.
- ~30 LOC — `validateForeignKey` `!fSchema → public` heuristic. Reverted: the `pg_namespace` join diverged from Rails (which uses `t2.oid::regclass::text` + `search_path`).

### Batch 97 — Recent sweep TableDefinition + typeCastedBinds (~105 LOC, risk: medium)

- ~5 LOC — `typeCastedBinds` in `abstract/quoting.ts:~490` duplicates the one in `abstract/database-statements.ts` and still uses the old `typeof b.valueForDatabase === "function"` check. Unify to the getter-aware `"valueForDatabase" in b` form.
- ~50–100 LOC — `TableDefinition.toSql()` in `abstract/schema-definitions.ts:~926-1095` still branches on `_adapterName` for type SQL (SERIAL vs BIGINT AUTO_INCREMENT, BYTEA vs BLOB, etc.). Largely redundant with `SchemaCreation.typeToSql()` + `SchemaCreation.visitTableDefinition()`. Route through `SchemaCreation.accept()` and delete `toSql()`.

### Batch 100 — Autosave A preloader migration (~20 LOC, risk: low)

- ~20 LOC — Preloader → `associationInstanceSet` migration. ~5 `_preloadedAssociations.set` write sites remain (preloader/association.ts ×2, preloader/batch.ts ×1, relation.ts ×2). Update to call `record.associationInstanceSet(name, association)`; once done, `_loadedAssociation` collapses to a one-line Rails-shaped pure read.

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

### Batch 113b — calculations.test.ts mega-describe defineSchema (~150–250 LOC, risk: medium)

Followup from #1843. The single `describe("CalculationsTest", ...)` block at `calculations.test.ts:~2873` spans ~4200 LOC and still relies on auto-schema. 24 tables involved (`accounts`, `authors`, `conversations`, `orders`, `people`, `posts`, `products`, `rg_*`, `sl*`, `topics`, `users`, `vehicles`). Multiple tables share attribute names with conflicting types (e.g. `status` is `integer` in one subtest, `string` in another) so a single merged `defineSchema` won't work — split into sub-describes by table-set or use per-test `defineSchema` calls. Accounts for ~152 remaining failures in calculations.test.ts under `AR_NO_AUTO_SCHEMA=1`.

### Batch 120 — Virtual-attribute persistence path (~unknown, risk: medium)

Followup from #1749. Two tests currently skipped:

- `model with nonexistent attribute with default value can be saved`
- `attributes not backed by database columns return the default on models loaded from database`

Both silently passed under auto-schema because the DDL created a column from the `attribute()` declaration. Under `AR_NO_AUTO_SCHEMA=1` the real gap surfaces: trails INSERT path writes the non-existent column. Rails treats these as virtual attributes (not persisted, default returned on read). Rails source ref: `vendor/rails/activerecord/test/cases/attributes_test.rb:131, 305`.

- Skip non-DB-backed attributes when building the INSERT column list + when reading back from DB rows. Filter to schema-known columns. Then un-skip the two tests above.

### Batch 123 — Inflector `Human → humans` irregular pin (~5 LOC)

Followup from #1752. Trails' inflector pluralizes `Human → humen` (the `man → men` irregular fires on `-man` suffix). Rails' inflector treats `human → humans` correctly. Add `inflect.irregular("human", "humans")` to `packages/activesupport/src/inflector/inflections.ts` to override the `man → men` fallthrough.

Note for future migrators: until this lands, defineSchema tables for `Human`-modeled fixtures must be named `humen`.

### Batch 125 — Top-level `const adapter = freshAdapter()` audit (~tests-only sweep)

Followup from #1751. Latent bug pattern surfaced: top-level `const adapter = freshAdapter()` inside `describe()` shares one adapter across all tests, no cleanup. Convert to `let` + `beforeEach`.

```
grep -nE "^\s+const adapter = freshAdapter\(\)" packages/activerecord/src/*.test.ts
```

### Batch 130 — enum string-status describe cleanup (~30 LOC, risk: low)

Followup from #1747. Four "string status" Post tests hardcode `tableName = "string_status_posts"`; the table has no Rails analogue and exists only because the file declares `posts.status` as both integer and string in different `it()`s. Collapse by hoisting a `describe("EnumTest with string status", …)` with a single class declaration + rename the model `tableName` consistently, then drop `string_status_posts` from `TEST_SCHEMA`.

### Batch 134 — counter-cache resetCounters fidelity (~120 LOC, risk: low)

Followup from #1769. Distilled from triage annotations on the 7 remaining `resetCounters` skipped tests.

- ~10 LOC — Modular (namespaced) class-name resolution in `resetCounters` target lookup (covers "reset counters with modular association" and "reset counters with modularized and camelized classnames").
- ~10 LOC — Honor `reflection.options.className` in `resetCounters` target resolution ("reset counter with belongs_to which has class_name").
- ~15 LOC — Disambiguate two `belongs_to` to the same target class via reflection name ("reset the right counter if two have the same class_name" / "same foreign key").
- ~10 LOC — Short-circuit UPDATE when `SELECT COUNT(*)` matches stored value ("reset counter skips query for correct counter").
- ~15 LOC — Composite-PK WHERE generation ("reset counters for cpk model").
- ~30 LOC — Through-reflection branch: walk to join model and count via that table ("reset counter of has_many :through association").
- ~15 LOC — Apply reflection scope (`select`, `where`) when composing the COUNT ("reset counter works with select declared on association").

### Batch 136 — inBatches deferred follow-ups (~135 LOC, risk: low)

Followups from #1770.

- ~15 LOC — `useRanges` empty-scope auto-detection: compare `relation.toSql()` against `unscoped.all.toSql()`. Rails uses `(empty_scope && use_ranges != false) || use_ranges`; we only honor explicit `useRanges: true`.
- ~30 LOC — Multi-column lexicographic `useRanges` (extend to call `applyFinishLimit` instead of building flat `gteq.and(lteq)`). Today composite cursors silently fall back to `IN (...)`.
- ~20 LOC — Port `find in batches should ignore the order default scope` (inline `PostWithDefaultScope` with `defaultScope(rel => rel.order("title"))`; assert batch order is by id).
- ~40 LOC — `assertQueriesMatch` test helper (SQL pattern matcher) + port `find in batches should quote batch order` (+ `_with_desc_order`).
- ~30 LOC — `Relation.create` test infra + port `.find_each respects table alias`.

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

---

## B-series followups (post-merge findings track)

Batches identified via `/post-merge-findings` reports — `B<id>` numbers come from the audit's internal IDs, not the sequential `Batch <N>` queue. Listed separately so the numerical-batch queue stays clean. Treat as queued work; bundle with adjacent numerical batches when files overlap.

### Batch B127 — Metal \_performed flag removal (~30 LOC, risk: low)

Followup from #1799. Touch `abstract-controller/base.ts`, `action-controller/base.ts:137,195,228,484,510,532`, `action-controller/api.ts:29,41`; every `markPerformed()` caller must assign `_responseBody` first. `renderToString` snapshots `_status`/`_contentType`/`_headers` — cleaner future path is a `renderToBody`-style helper.

### Batch B119 — collection-proxy inversing dedup (~80 LOC, risk: medium)

Followup from #1801. Unblocks 6 skips at `inverse-associations.test.ts:~168,174,180,186,192,229`. Needs collection-proxy `<<`/`build`/`load` dedup; `replaceOnTarget` (`collection-association.ts:748`) should accept `inversing` param and hold `_replacedOrAddedTargets` WeakSet. Cleanup: `associations.ts:1047` casts `_cachedAssociations.get(assocName)` to `Base[]` unconditionally — add `Array.isArray` guard.

### Batch B110 — MySQL adapter fidelity sweep (~250 LOC, risk: medium) — bundles B131, B49

Three `mysql2-adapter.ts` / `mysql/schema-statements.ts` followups. May split into two PRs (interface polish + columns/defaults) if review burden warrants; otherwise land as one bundle.

- **B110 MySQL adapter interface polish (~90 LOC, was B110).** Followup from #1802. ~20 LOC add `createTableDefinition?` to `DatabaseAdapter` interface (drop `as unknown as {…}` cast at `abstract/schema-statements.ts:153–157`); ~30 LOC memoize `Mysql2Adapter#schemaStatements()` (`mysql2-adapter.ts:916`); ~40 LOC dedup `assertSafeMysqlIdentifier` (currently in `mysql/schema-creation.ts` + `abstract/schema-definitions.ts#toSql:~1148–1166, ~1250–1259`). Wire or delete the unused `mysql/schema-statements.ts:112` free helper.
- **B131 MySQL column metadata + default parsing (~120 LOC, was B131).** Followup from #1811. ~80 LOC port `new_column_from_field` default-function parsing (`CURRENT_TIMESTAMP`, `DEFAULT_GENERATED`, text-default unescape) into `Mysql2Adapter#columns` (`mysql2-adapter.ts:1082`) — share with logic already in `renameColumnForAlter`. ~40 LOC thread `MySQL::TypeMetadata` through `Mysql2Adapter#columns` → `MysqlColumn`; `autoIncrement`/`virtual` become getters off `typeMetadata.extra`; drop three explicit booleans + `__mysql` JSON discriminator in `schema-cache.ts:rehydrateColumn`. (B131 plan also has RecorderTableProxy Proxy rewrite ~60–100 LOC + mysqlQuote ANSI_QUOTES passthrough ~20 LOC still deferred.)
- **B49 MySQL columns helper extraction + bare-keyword defaults (~40 LOC, was B49).** Followup from #1880. ~10 LOC extract `requiresCreateTableInfo(field)` helper from `mysql/schema-statements.ts`, consume from `AbstractMysqlAdapter#columns` — eliminates drift between `newColumnFromField` branching and `needsCreateInfo` heuristic. ~30 LOC mirror bare-keyword function-default detection in `Mysql2Adapter.columns()` via `SHOW CREATE TABLE` for fields hitting broader branch — closes rename-fallback quoting gap (rare path). Larger architectural: ~50 LOC investigate `SchemaAdapter` wrapper forwarding for adapter-level overrides so `supportsBulkAlter` branch can be removed.

### Batch B128 — quoteDefaultExpression column forwarding (~40 LOC, risk: low)

Followup from #1810. `query-cache.ts:444–447` and `test-adapter.ts:1178–1181` `quoteDefaultExpression` delegates drop the `column` arg — forward it so `options.array`/`sqlType` survive. Also wire `schema-ar-models.markPhase5(adapter)` into `schema.test.ts` + `schema-authorization.test.ts`. Do NOT move the `[]`-strip inside `normalizeFormatType` (would silently break OID type-casting).

### Batch B132 — PG IPAddr + migration table-definition delegation (~160 LOC, risk: medium)

Followup from #1812. ~30 LOC fix IPAddr default-value stringification in schema dumps — render `"192.168.1.1"` not `{ address, prefixLength: 32 }`. ~80–120 LOC `migration.ts:1908` constructs abstract `TableDefinition` directly; delegate to `adapter.createTableDefinition` so PG/MySQL shorthand helpers work in migration replay. ~30 LOC `IPAddr` IPv6 IPv4-mapped preservation (`oid/cidr.ts`) — `::ffff:192.168.0.1` currently compresses to `::ffff:c0a8:1`. ~20 LOC pipe `TableDefinition#toSql` default branch through `adapter.typeToSql`.

### Batch B35 — join-dependency / HABTM aliasing sweep (~130 LOC, risk: medium) — bundles B133

Two `join-dependency.ts` followups touching adjacent code paths.

- **B133 polymorphic-source through-reflection (~80 LOC, was B133).** Followup from #1813. ~50 LOC port `ThroughReflection#check_validity!` polymorphic-source branch; collapses `return null` guards at `join-dependency.ts:189–197,738`. ~30 LOC extend `loadHasManyThrough` `sourceType` handling (`associations.ts:1320–1336`) to nested-through with polymorphic source. Rails-431 regression test still missing — gated on the loader fix.
- **B35 schema-qualified HABTM table aliasing (~50 LOC, was B35).** Followup from #1869. Schema-qualified HABTM tables in `_addThroughAssociation` / `addAssociation` in `join-dependency.ts`: dotted table name leaks as single quoted identifier. Extract `quoteSchemaQualified(name)` helper.

### Batch B135 — counter-cache faithful path + test isolation (~50 LOC, risk: medium)

Followup from #1815. ~30 LOC collapse `updateCounterCaches` (`associations.ts`) into the Rails-faithful `_createRecord`/`destroyRow` path (`counter-cache.ts:319–348`); removes touch forwarding at `associations.ts:2099–2107`. Confirm `counter-cache.ts:319–348` is actually dead (no imports into `base.ts`). Test isolation: `counter-cache.test.ts` leaks `Topic` into global `modelRegistry`; add `beforeEach` registry cleanup.

### Batch B70 — Relation CPK through/HABTM finish (~120 LOC, risk: medium)

Followup from #1817. `_resolveThroughJoin` and `_resolveHabtmJoin` not updated for composite-PK — likely still throw. `relation.ts:573–588` fallback path (unregistered model) diverges from registered-model path on composite-FK — unify or document. CPK placeholder tests at `batches.test.ts:1657–1709` are boilerplate-only and need real assertions (can't rename per CLAUDE.md). `batchOnUnloadedRelation` `remaining` limit cap and `inBatches({ load: true })` batch-order wiring both flagged unwired — add regression tests.

### Batch B92 — targetScope SQL fix + async cache invalidation (~180 LOC, risk: high)

Followup from #1819. `targetScope` currently generates broken SQL outside JOIN context (`SELECT "tts_targets".* … WHERE "tts_joins"."active" = TRUE`); dead in 2-step loaders but wiring breaks unless fixed first. Options: (1) strip table-qualifier off intermediate predicates before merging, or (2) gate `targetScope` to JOIN-based eager_load path only. Plus ~15 LOC unmerged Copilot fixes: `super["targetScope"]()` → `super.targetScope()` in `has-one-through-association.ts:32` + `has-many-through-association.ts:35`, try/catch around `chain[i]?.klass`, `Relation#unscope(...)` on intermediate scope before merge. Remaining B92 work: non-preload JOIN-based eager loading (~50 LOC), scoped `has_one_through` lambda scope (~80 LOC), `associationScope` cache invalidation (~30 LOC).

### Batch B73 — SQLite adapter cleanup (~50 LOC, risk: low) — bundles B126

Two adjacent `sqlite3-adapter.ts` followups.

- **B126 pragma_table_list helper + plan correction (~20 LOC, was B126).** Followup from #1807. Plan entry "checkVersion floor 3.37" was wrong — Rails source uses `< "3.8.0"`. `tables()`/`tableExists()` use `pragma_table_list` (requires 3.37+) but `checkVersion` only enforces 3.8.0 — same gap as Rails. Cosmetic: extract shared `pragma_table_list` helper for `tableExists` + `dataSourceExists` (`sqlite3-adapter.ts:1372–1412`).
- **B73 dead SQLite addTimestamps adapter override (~30 LOC, was B73).** Followup from #1833. `Migration#addTimestamps` calls `this.schema.addTimestamps` (base), not `adapter.addTimestamps` — SQLite3Adapter override at `sqlite3-adapter.ts:1084` is dead code from the migration path. Either wire migration through adapter.addTimestamps or delete the override.

### Batch B71 — CPK Arel tuple-IN for AssociationQueryValue (~150 LOC, risk: medium)

Followup from #1831. Per-column IN subqueries instead of tuple-IN for CPK+Relation is broader than Rails (false-positive matches). True tuple-IN via Arel node needed at `association-query-value.ts:48-66`, `predicate-builder.ts:173`, `relation-handler.ts:30-32`.

### Batch B137 — polymorphic-inverse CPK test + setBelongsTo collapse (~50 LOC, risk: low)

Followup from #1826. `inversedFrom` path for polymorphic + composite PK has no direct test (`associations/association.ts:418`). Long-term: `setBelongsTo` in `associations.ts` still duplicates logic from `BelongsToPolymorphicAssociation#replace`; collapse into single dispatch.

### Batch 153 — migration.test test-adapter gate + MockMigration port (~70 LOC, risk: low)

Followup from #1847. `test-adapter.ts:812-814` unconditionally rewrites to `CREATE TABLE IF NOT EXISTS`, blocking raise-on-duplicate tests — gate behind a flag (~30 LOC). `instance based migration up/down` tests currently call `Base.create`/`destroy` instead of `MockMigration` `went_up`/`went_down` lifecycle flags — port proper `MockMigration` (~40 LOC).

### Batch B20 — belongs_to FK + propagateErrors audit (~80 LOC, risk: medium)

Followup from #1852. ~10 LOC defer `reflection?.foreignKey` read in `_resolveBelongsToPrimaryKey` (currently evaluated when unused, may throw for composite-PK + query_constraints models). ~10 LOC fix `_resolveBelongsToForeignKey` gate for `Array.isArray(assoc.options.primaryKey)` length > 1. Architectural: `_autosaveBelongsTo` FK propagation mismatch vs Rails (needs `BelongsToAssociation#_updated` lifetime rework — defer to own PR). Audit `propagateErrors` usage — has_many/has_one/habtm call unconditionally; Rails uses `errors.add(reflection.name)` not child-error merge. `queryConstraintsList` falls back to composite-PK array — wider cleanup item.

### Batch B25 — Relation includes! / references! + CollectionProxy fast paths (~200 LOC, risk: medium)

Followup from #1849. ~5 LOC `LoaderQuery.hashKey()` add connection/adapter identity for multi-DB grouping isolation. ~80–120 LOC `Relation#includes!` / `Relation#references!` infra for Rails-faithful through_scope path. ~40–80 LOC route `CollectionProxy#exists` through `AssociationScope` for `_isThrough` so it emits SQL EXISTS instead of `loadTarget()` + filter (`collection-proxy.ts:1761`). `CollectionProxy#isEmpty` missing `@association_ids` fast-path + `reflection.has_active_cached_counter?` fast-path.

### Batch B17 — Error.fullMessage Rails-fidelity (~60 LOC, risk: low)

Followup from #1858. Three pre-existing gaps in `activemodel/src/error.ts`: (1) no `lookup_ancestors` iteration for STI format inheritance (~20 LOC); (2) extra fallback locale keys vs Rails (~20 LOC); (3) `[\d+]` strip unconditional — Rails only strips inside `i18n_customize_full_message` branch (~20 LOC). Bundle as one cleanup PR.

### Batch B34 — preloader through-assoc scope propagation root cause (~80 LOC, risk: medium)

Followup from #1867. `_alreadyLoadedThroughByOwner` is a symptom workaround; root cause is in `preloader/branch.ts:189-225` / `through-association.ts:171-198`. Investigate scope propagation through nested ThroughAssoc layers. Also single-through non-nested polymorphic+sourceType test variant (~50 LOC). 12 `it.skip` stubs in `nested-through-associations.test.ts` still unimplemented (~30 LOC each).

### Batch B16 — pt 3 customValidationContext + inverse-of lookup (~60 LOC, risk: medium)

Followup from #1876. ~30 LOC thread `customValidationContext` into `associatedRecordsToValidateOrSave` so bypass isn't duplicated across `validateCollectionAssociation` and has-one/belongs-to paths. ~20 LOC align inverse-of lookup in `validateHasOneAssociation` to `record.association(name)` instead of `_loadedAssociation` (may unblock cycle-break test). ~10 LOC add comment to `defineNonCyclicMethod` pinning per-record `_alreadyCalled` map as load-bearing.

### Batch B158 — CollectionProxy delegation + scope-lambda arity standardization (~90 LOC, risk: medium)

Followup from #1878. ~30–60 LOC delegate `CollectionProxy#clear` and `#destroyAll` to underlying `CollectionAssociation`; drop explicit `_invalidateAssociationIds` calls #1878 added. ~10 LOC `CollectionProxy#destroy` has same `_associationIds` staleness gap — invalidation missing after per-record destroy. ~20 LOC standardize scope-lambda arity to `(rel, owner) =>` everywhere; drop 0-vs-1+ branch in `invokeScopeLambda`.

### Batch B164 — Phase 5 belongs-to-associations.test large describe migration (~250 LOC × 5-8 PRs, risk: low)

Followup from #1873. File passes audit but fails `AR_NO_AUTO_SCHEMA=1` — large BelongsToAssociationsTest describe (line 81, ~146 tests, ~3660 LOC) needs `defineSchema` migration. Split into 5–8 cluster PRs at ~250 LOC each.

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
