# ActiveRecord post-100% — Cluster details

**Companion to [`activerecord-100-plan.md`](activerecord-100-plan.md).** That doc is the live tracker (in-flight PRs, followups, story count). **This doc holds the per-cluster slot detail** — slot descriptions, LOC sizing, audit attribution, cross-cluster overlap notes.

A "cluster" here is a set of related work-PR slots that share an audit source, a file area, or a Rails-source surface. Each cluster has 1–11 slots; PRs target ~250 LOC each.

When picking a slot to spawn:

1. Check `activerecord-100-plan.md`'s In flight + Story count to see what's already moving and what's queued.
2. Find the matching cluster in this doc for slot details, sequencing, and overlap notes.
3. Read the relevant `audit-*` reference in the slot description; the audit ran with full Rails-source context and its inventory is the source of truth for the gap shape.

---

## Associations-autosave cluster (~940 LOC across 4 remaining slots)

1. **Slot C** (~230 LOC) — Transaction wrapping of autosave chain + `RecordInvalid` raise from saveBang.
2. **Slot D** (~280 LOC) — `Associations::NestedError` propagation + `errors.indexErrors` + i18n full-message.
3. **Slot E** (~220 LOC) — CPK / queryConstraints / polymorphic-inverse / custom-context.
4. **Slot F** (~210 LOC) — Reflection introspection + per-class non-cyclic guard.

## Associations-reflection cluster (~700 LOC across 3 remaining slots, from audit-associations-reflection)

31 empty-stub tests with generic boilerplate annotation. **Impl is fundamentally complete**; gaps are fixture plumbing + test-body writing + 3 fixture-model gaps.

1. **Slot C** (~250 LOC) — Polymorphic HMT fixture (Hotel/Department/Chef/CakeDesigner/DrinkDesigner) + scope-chain tests.
2. **Slot D** (~250 LOC) — Author/Organization essay fixture + dependent tests.
3. **Slot E** (~200 LOC) — Namespace resolution (`MacroReflection#_klass`) + `sourceType`-as-class guard.

3 const_missing/NameError tests → unported-list candidates (Ruby-only language semantics).

## MySQL schema cluster (~200 LOC, Slot C remaining)

Slots A+B (#1468) closed. Real behavior gaps + one option drop covered; fixture/test-helper gaps remain.

- **Slot C** (~200 LOC) — MySQL fixture/test-helper infrastructure: `posts`, `key_tests`, `lessons_students`/`topics`/`students` fixtures + subclassing `Base` with qualified `db.table` table_name. Uses the TS-native fixture infra (`defineFixtures`/`useFixtures`).

## PG interval cluster (~180 LOC, Slot B remaining)

- **Slot B** (~180 LOC) — Interval schema-default extraction + AVG aggregate typecast.

## PG long-tail cluster (~1510 LOC across 7 remaining slots, from audit-pg-long-tail)

Slots A (#1498 citext), B (#1508 money), and C (#1515 ltree+tsvector+bit-string) closed. Remaining slots — annotation drift on the 73 PG long-tail BLOCKED tests still points at fictional per-feature OID files; real gaps live in `schema-statements` / `schema-dumper` / `schema-creation` / adapter helpers / `type-map-init`. A few features (composite, geometric beyond Point, tsquery serialize) have no source counterpart at all.

Money slot left 3 BLOCKED tests pointing at generic Relation gaps (not money-specific): `sum`/`pluck` typecast on SQL expressions + `updateAll` BigDecimal serialize. Fold into Relation Slot H or Slot G.

Slot C followups (~50 LOC, bundle with Slot D):

- ~30 LOC — Add tsvector schema-dump test (`test_schema_dump_with_shorthand` in Rails `full_text_test.rb` has no stub).
- ~20 LOC — Split `cleanDefault` raw-PG-expression path from already-deserialized-ORM-value path; the leading-zero `/^-?0\d/` guard added in #1515 is a point fix.
- Note: several bit-string/full-text/ltree test names in #1515 are best-fit fabrications — Rails has no exact counterpart. Acceptable but worth knowing if test:compare drifts.

1. **Slot D** (~280 LOC) — geometric long-tail OIDs.
2. **Slot E** (~280 LOC) — enum schema-dump round-trip.
3. **Slot F** (~150 LOC) — composite Identity fallback.
4. **Slot G** (~200 LOC) — cidr IPAddr value + prefix-aware changed?
5. **Slot H** (~150 LOC) — change-schema timestamptz default.

## PG UUID residual cluster (~250 LOC, Slot B remaining)

- **Slot B** (~250 LOC) — Associations + UUID FK binding.

Plus: 1 test references "migration framework" gap — leave skipped with sharpened annotation.

## MySQL table-options cluster (~480 LOC across 2 slots, from audit-mysql-table-options)

9 tests, **all blocked by two foundational gaps** (not per-test):

1. `AbstractMysqlAdapter.tableOptions(tableName)` is a `{}` stub — must parse `SHOW CREATE TABLE` for `charset` / `collation` / `comment` / residual `options:` string.
2. Base `SchemaDumper.emitTable` never calls `source.tableOptions(table)`; emits TS-DSL `await ctx.createTable(...)` instead of Ruby-mirroring `create_table "name", charset: ..., options: ..., force: :cascade do |t| ...`.

Plus: MySQL `SchemaDumper.tableCollationCache` is never populated; base `createTable` lacks `options`/`charset`/`collation`/composite-`primaryKey`.

1. **Slot A** (~230 LOC) — `tableOptions` parsing + dumper wiring.
2. **Slot B** (~250 LOC) — Ruby-style dump output + composite PK + remaining tests.

## MySQL charset-collation cluster (~315 LOC across 3 slots, from audit-mysql-charset-collation)

7 tests sharing one Rails setup (`create_table :charset_collations, id: { type: :string, collation: "utf8mb4_bin" }`).

1. **Slot A** (~120–180 LOC) — `createTable` `id` hash form `{ type, collation, ... }` + `ColumnOptions.charset` + test ("add column with charset and collation"). Most other gaps already plumbed in `mysql/schema-creation.ts` (CHARACTER SET / COLLATE) and `newColumnFromField` (reads `Collation` from `SHOW FULL FIELDS`).
2. **Slot B** (~150–220 LOC) — MySQL `changeColumn` + `buildChangeColumnDefinition` stubs (both empty today). Includes "preserve existing collation for text→text/string" + `:no_collation` sentinel semantics. Unblocks tests 4–7.
3. **Slot C** (~15 LOC, optional) — BLOCKED annotation cleanup.

## Relation cluster (~1400 LOC across 6 slots + 1 followup, from audit-relation)

302 skipped tests across ~14 relation-area files; sub-clusters orthogonal. Slot A closed (#1511 WhereClause association predicates core — 6 un-skips).

- **Slot A-b followup** (~100 LOC, bundle with Slot B): un-skip 4 remaining custom-PK variants — `where on association with custom primary key with relation`, `with array of base`, `with array of ids`, `performs subselect not two queries`. Wired; just need test bodies. Also delete the dead `setAssociationMap` / `AssociationMapping` / `expandAssociationCondition` early-attempt code in `predicate-builder.ts`. Also note pre-existing gap: `PredicateBuilder.build()` doesn't coerce records to their `.id` like Rails does — `where(author_id: someRecord)` won't work for direct-FK columns.

1. **Slot B** (~250 LOC) — Polymorphic + CPK predicates in WhereClause (`PolymorphicArrayValue` path imported but not wired; CPK `AssociationQueryValue` branch currently throws — needs pluck path for Relations + tuple zip for non-Relation values).
2. **Slot C** (~220 LOC) — WhereChain `associated` / `missing` branches.
3. **Slot D** (~250 LOC) — Default scope / `all_queries` / unscoped caching invariants.
4. **Slot E** (~220 LOC) — Batches with composite-PK + ordering edge cases.
5. ~~**Slot F** — load_async scheduling~~ **DROPPED.** Auditor missed Step 0; would have built sources unported. 28 affected tests already permanent-skipped.
6. **Slot G** (~240 LOC) — `PredicateBuilder.registerHandler` + field-ordered-values + calc grouping.
7. **Slot H** (~220 LOC) — Relation misc small-surface bundle.

## Associations-core cluster (~910 LOC across 5 slots, from audit-associations-core)

49 placeholder stubs in `associations.test.ts` — each needs impl + Rails test-body port.

1. **Slot A** (~240 LOC) — Preloader grouping + LoaderQuery hash stability.
2. **Slot B** (~280 LOC) — Composite-FK association runtime (autosave / nullify / append / preload).
3. **Slot C** (~140 LOC) — Instance-dependent scopes (owner-arity lambdas).
4. **Slot D** (~220 LOC) — Collection-proxy fidelity bundle.
5. **Slot E** (~30 LOC, optional) — Annotation re-keying.

## Associations has-many-through cluster (~1280 LOC across 5 slots, from audit-associations-has-many-through)

33 skipped across 3 files — **all empty placeholders** (no Rails-mirrored bodies transcribed). Production code surface (`has-many-through-association.ts`, `through-association.ts`, `disable-joins-association-scope.ts`) is in good shape; gaps are test-body transcription.

1. **Slot A** (~280 LOC) — Disable-joins skip bodies: custom-FK + scope/merge/preload paths.
2. **Slot B** (~250 LOC) — Disable-joins ordering + double-join order/limit.
3. **Slot C** (~220 LOC) — Autosave-through propagation + Marshal exclusion.
4. **Slot D** (~270 LOC) — Nested-through preloader + STI + joins/includes.
5. **Slot E** (~260 LOC) — Nested-through advanced (distinct/repeated table/polymorphic-with-scope/source-reset/autosave-skip).

Note: audit worktree didn't have `.rails-source/` populated → slots sized by test-name-family inference rather than line-by-line Rails read. Workers picking these up should re-validate against `.rails-source` once spawned.

## Associations-HABTM cluster (~1690 LOC across 9 slots, from audit-associations-habtm)

**Important: ~160 of 168 BLOCKED tests are NOT HABTM-specific** — they exercise general associations machinery (`CollectionProxy` mutation, `*_ids` reader/writer, association scope chain composition, eager loading, polymorphic-through, STI-through, etc.). **Significant overlap with audit-associations-core cluster.** The HABTM builder itself is structurally complete.

1. **Slot A** (~260 LOC) — HABTM CollectionProxy mutation (`<<`, `push`, `delete`, `clear`, `concat`, `replace`) + `AssociationTypeMismatch`.
2. **Slot B** (~140 LOC) — `*_ids` reader/writer + ids cache invalidation.
3. **Slot C** (~250 LOC) — Association scope chain composition for HABTM (where/order/select/group/having/unscope).
4. **Slot D** (~150 LOC) — Association options: `validate:`, `readonly:`, `extend:`.
5. **Slot E** (~280 LOC, biggest payoff) — Polymorphic + STI through.
6. **Slot F** (~200 LOC) — Eager loading through HABTM (`includes`/`preload`/`eager_load`).
7. **Slot G** (~120 LOC) — Counter-cache install on `belongs_to` + through.
8. **Slot H** (~140 LOC, low priority) — HABTM builder polish.
9. **Slot I** (~150 LOC) — `build`/`create` on HABTM with scope-attr inheritance.

**Annotation drift sweep needed first** — ~160 of these are mis-tagged as `BLOCKED: habtm` when the real cause is general-associations machinery.

## Migration cluster (~850 LOC + ~115 LOC followup across 4 remaining slots, from audit-migration)

Slot B closed (#1505 tableNamePrefix/Suffix + CTAS + InvalidMigrationTimestampError, 6 un-skips). Followups bundled below.

- **Slot B followup** (~115 LOC bundled, fold into next migration PR):
  - ~30 LOC — CTAS `_introspectColumns` returns name-only; `_columnMeta` stored with `{type:"string"}` for any CREATE TABLE AS column. Wrong type metadata downstream of any CTAS (schema-dump, `MigrationContext.columns()`).
  - ~20 LOC — Unify `MigrationContext.tableNamePrefix`/`tableNameSuffix` instance fields with the `_arConfig` registry. Currently two sources of truth: instance fields used by `renameTable`, `_arConfig`/`_pt` used by the new `Migration.*` flow.
  - ~10 LOC — Forward `currentDatabase()` (+ advisory-lock helpers) from `SchemaAdapter` to its inner adapter in test-adapter.ts. Unblocks the advisory-lock test from bypassing the wrapper.
  - ~50 LOC — Extend prefix/suffix regression coverage to `removeColumn`, `add/removeIndex`, `add/removeForeignKey`, `add/removeCheckConstraint`, `add/removeReference`, `create/dropJoinTable`, `changeColumn*`, `renameIndex`, inspection helpers, comment helpers.
  - ~5 LOC — `TableDefinition.toSql()` default switch case silently passes unknown column types through. Reject empty/whitespace upfront.
  - Bundle concern: base.ts now has a top-level side-effect import of migration.ts via `registerMigrationArConfig`. Tree-shaking impact for browser bundles is probably nil (Base loads most of migration.ts transitively) but worth re-verifying when the BC plan revisits eager imports.

1. **Slot C** (~200 LOC) — Advisory-lock seams + `Migrator#runWithoutLock` filtering + migration-detection-without-schema-table. 8 un-skips.
2. **Slot D** (~250 LOC) — Multi-DB `MigrationContext` factory. 7 un-skips.
3. **Slot E** (~220 LOC) — Filesystem migration discovery + internal-metadata enable/disable toggle + schema-cache invalidation hooks. 8 un-skips.
4. **Slot F** (~180 LOC) — Bulk-alter recorder round-trip + `change-column` test reorg. 6 un-skips.

## Connection-pool cluster (~640 LOC across 3 remaining slots, from audit-connection-pool)

1. **Slot B** (~250 LOC) — `connects_to` + default writing/reading handlers (config-hash establishment).
2. **Slot C** (~240 LOC) — Shard-selector wiring + `prohibitShardSwapping`.
3. **Slot D** (~180 LOC) — ActiveSupport::Notifications equivalent for pool events. Likely needs a small shim or piggy-back on existing instrumentation infra.

**Gap 8 (process-fork lifecycle) was a phantom** — found `connection_pool_test.rb` has no fork/PID test; the audit reference pointed at `connection_handler_test.rb` work already handled. No action.

## MySQL active-schema cluster (~680 LOC across 3 remaining slots, from audit-mysql-active-schema)

**Supersedes the previous Schema-cluster Slot G estimate.** Slot A closed (SQL-capture test infra + first un-skips). Remaining:

1. **Slot B** (~220 LOC) — MySQL DDL SQL parity (`dropTable` comma form, `createDatabase`/`recreateDatabase`, `indexAlgorithm` validator).
2. **Slot C** (~260 LOC) — `addIndex` MySQL output shape + inline `t.index` in `create_table`.
3. **Slot D** (~200 LOC) — Bulk change-table ALTER coalescing + timestamp tests.

## MySQL mysql2-adapter cluster (~700 LOC across 3 slots, from audit-mysql-mysql2-adapter)

9 BLOCKED tests in `adapters/mysql2/mysql2-adapter.test.ts`. Three slots:

1. **Slot A — `databaseExists` static + `exec_query(prepare:)` + DML-tolerant execQuery** (~220 LOC). Test-only "fake_connection" path that lets `Mysql2Adapter` instantiate without a live driver underpins several tests.
2. **Slot B — Translate-exception depth: timeout + statement-timeout** (~200 LOC). `read_timeout` → `AdapterTimeout`, `ER_FILSORT_ABORT` / `ER_QUERY_TIMEOUT` → `StatementTimeout`.
3. **Slot C — Timezone re-sync + db_warnings_action + test-helper infra** (~280 LOC). `query_options[:database_timezone]` plumbing + `with_db_warnings_action`.

## PG virtual-column cluster (~250 LOC, Slot B remaining)

- **Slot B** (~250 LOC) — Live-PG round-trip harness + un-skip 5 Rails-mirrored tests. `defineSchema`-less `create_table`; `change_table { |t| t.virtual ... }`; `buildFixtureSql` virtual-column filter.

---

## PG-schema audit cluster (~50 LOC followup remaining)

Slots A (#1504 indexes() opclass + nulls order), B (#1458 INHERITS + #1469 comment/partition), and C (#1469 schema-qualified createJoinTable) closed.

- **Slot A followup** (~50 LOC) — `indexes()` `columns` array includes INCLUDE column names (PG11+ stores them in `indkey`); switch to `ix.indnkeyatts` to limit subquery to key columns, fetch INCLUDE separately. Plus the 3 `SchemaIndexNullsNotDistinctTest` tests still skipped because they need the same try/finally + dumpTable scaffolding the un-skipped tests in #1504 got.

Plus: `setSchemaSearchPath` unquoted-`$user` rejection + 5 fixture-model gaps (`Thing1..5`, `Song`/`Album` habtm) — small enough to bundle with the followup.

## Unknown-triage cluster (~640 LOC, from audit-unknown-triage)

Re-categorization of all 89 `BLOCKED: unknown` annotations. **Single foundational annotation-refresh PR** unblocks downstream slot-sizing:

1. **Slot A — Annotation refresh** (~200 LOC, comment-only). Re-tag all 89 annotations into the controlled vocabulary, moving the Ruby-only language-semantics ones (`modules.test.ts` x7, `mixin.test.ts` x2, `base.test.ts` x1 — `Module#prepend`, `singleton_class`, `Module#ancestors`, constant-path lookup) to `PERMANENT-SKIP` form in `unported-files.ts`.
2. **Slot B — `insert-all.test.ts` investigation + un-skip** (~250 LOC). **64 of the 89 have stale "`MemoryAdapter accepts any attrs"` comments** that mislead the audit — there is no `MemoryAdapter`; the test setup uses `SchemaAdapter` wrapping a real driver. `InsertAll` impl is at 100% per. Real work: scrub stale comments (largely done), investigate what's actually skipped, rewrite test bodies to assert against real-adapter behavior.
3. **Slot C — SignedId real-feature gaps** (~140 LOC).
4. **Slot D — Callbacks `afterCommit` refinements** (~50 LOC).
5. **Deferred** — Misc small feature closes (~80 LOC); timezone-aware attribute methods (~150 LOC).

## STI annotation drift (~20 LOC, tests-only)

audit-STI found **no STI implementation gap**. All 6 `BLOCKED: STI` tests are mis-labeled — real causes are missing fixture scopes, UUID PK + touch on polymorphic delegated_type, and PG `CREATE TABLE … INHERITS` schema-dump . Single tests-only PR re-annotates the 6 tests under correct categories.

## Schema cluster (~1050 LOC across 5 remaining slots + annotation sweep, from audit-schema)

Slot D (#1467 check/exclusion/unique constraints) closed.

1. **Slot E** (~200 LOC) — PG type-specific dump + extensions dumping. 11 un-skips.
2. **Slot F** (~200 LOC) — PG `change_column` type/precision/scale/limit + null/default round-trip + timestamptz. 11 un-skips.
3. **Slot H** (~280 LOC) — PG schema authorization + qualified-schema (search_path). 22 un-skips.
4. **Slot I** (~250 LOC, exploratory) — PG partitioning + inheritance introspection in dumper. 6 un-skips.
5. **Slot J** (~120 LOC) — `Schema.define` with `tableNamePrefix` + bulk-change timestamps default + SchemaCache portable bits. 5 un-skips.
6. **Slot K** — Annotation normalization across all 128 BLOCKED annotations. Lands AFTER E–J.

## PG-adapter cluster (~340 LOC across 2 remaining slots)

1. **Slot A** (~220 LOC) — `execInsert` returning-disabled fallback + `extractTableRefFromInsertSql` helper. 4 un-skips.
2. **Slot E** (optional, ~120 LOC) — Prepared-statements introspection. 3 un-skips.

## Transactions cluster (~350 LOC across 3 remaining slots + 1 deferred, from audit-transactions)

1. **Slot B** (~120 LOC) — Fixture-model gaps: `Topic+Reply`, `Movie` (custom PK), `Cpk::Book` (composite PK). 4 un-skips.
2. **Slot C** (~80 LOC) — Test helpers: `open_transactions` probe + callback-raises listener. 2–3 un-skips.
3. **Slot D** — Wire isolation tests through PG-adapter Slot D's `secondConnection` helper. 4–6 un-skips.
4. **Slot E** (deferred) — Autosave + nested_attributes (depends on `accepts_nested_attributes_for`).

## `NotImplementedError` elimination initiative — guardrail shipped (#1523)

**Goal: zero unjustified `NotImplementedError` throws when AR is "done."** PR #1523 annotated every throw site with `// @nie disposition=... rails=... cluster=...` and added the `blazetrails/nie-requires-annotation` ESLint rule. The annotations are now the **source of truth**; the 2026-05-11 audit numbers are superseded.

**Corrected disposition tally (per #1523 per-site verification):** 34 sites total.

- **port-real**: 23 — Rails has a real implementation; ours is a stub.
- **keep-as-strategy-hook**: 11 — Rails also raises (abstract method); we match its behavior. (Up from the original 8; #1523 found Rails has real impls for `rawExecute`, `appendCallbacks`, `lookupCastType`, SQLite3 `arelVisitor`.)
- **remove-from-class**: 0 — none. (Was 7 in the original audit; reclassified after Rails-source verification.)

**Sweeps A–G obsoleted.** The 23 port-real sites are concentrated in clusters that have their own slots — `mysql-mysql2-adapter` (4), `mysql-charset-collation` (3), `pg-long-tail` (3), `relation` (3), plus 10 in abstract/non-cluster files. The port-real work folds into existing cluster slots; no dedicated Sweep PRs needed. Track via `grep "@nie disposition=port-real" packages/activerecord/src/` — the count should decrease as cluster work lands.

**Followups from #1523:**

- ~30 LOC — `rails=file:line` annotations on the 30 sites that carry only file paths (the 4 corrected during verification have line numbers; the rest don't). Mechanical follow-up; speeds eventual port-real work.
- ~5 LOC — Extend the ESLint rule to other Rails-mirroring packages (actionpack, actionview, activemodel, activesupport, arel). None currently has NIE throws; deferred until one shows up.
- Optional — companion warn-rule on `disposition=TODO` so unclassified throws can't sit indefinitely.

## Single-slot items

These don't merit their own multi-slot cluster section.

### MySQL onUpdate followups (~30 LOC, from #1382)

- **`onUpdate` abstract leakage** — lives in abstract `ColumnOptions`/`addColumnOptions`; MySQL-specific option leaking into abstract layer. Move to MySQL override. Low risk in practice.
- **Function-default detection narrowness** — `renameColumnForAlter` regex only covers `CURRENT_TIMESTAMP`. Bundled into small-followup sweep.

### Unported-list additions (~30 LOC bundled, 1 PR)

Mechanical: add these to `scripts/api-compare/unported-files.ts` as `PERMANENT-SKIP`. Each was identified by an audit; none reflect a real feature gap.

- `sqlite3-adapter.test.ts` — `read_uncommitted` cross-connection test (better-sqlite3 single-process model).
- `sqlite3-adapter.test.ts` — `loadExtension` / `supports_extensions` (driver doesn't expose).
- `modules.test.ts` (×7), `mixin.test.ts` (×2), `base.test.ts` (×1) — Ruby `Module#prepend` / `singleton_class` / `Module#ancestors` / constant-path-lookup semantics.

Most of this landed; remainder is the residual cleanup pass.

### AR query-parity residual — datetime precision (ar-01 / ar-52 / ar-65)

One gap tracked in [`scripts/parity/canonical/query-known-gaps.json`](../scripts/parity/canonical/query-known-gaps.json) (four gaps closed/#856/#863/#899).

**Goal:** `Order.where(created_at: oneWeekAgo..now).toSql()` emits second-precision SQL matching Rails' `quoted_date` (no fractional seconds for unscaled DATETIME columns).

**Current behaviour** (when frozen-at has non-zero ms, e.g. `175ms`):

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16.175000' AND '2026-04-25 17:53:16.175000'
```

**Expected (Rails):**

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16' AND '2026-04-25 17:53:16'
```

**Root cause.** Trails inlines dates from `Quoted` nodes with full precision. added bind extraction for `compileWithBinds`, but `toSql()` still inlines. The gap flakes (closes when frozen-at lands on a whole second).

**Options:**

- **Option A (BindParam-first, ~80 LOC):** In `predicate-builder/basic-object-handler.ts` + `range-handler.ts`, wrap Date values in `new Nodes.BindParam(queryAttribute)` instead of `Quoted`. Add a `quotedDateForBind` branch in `visitBindParam` that truncates to seconds. Don't change `visitQuoted` (INSERT precision preserved).
- **Option B (parity-runner side):**'s `paramSql` + binds comparison would close this in the diff layer without trails code changes — runner compares binds as ISO 8601 cross-side.

**Risk:** Medium — touches every WHERE clause in the suite. Must keep INSERT microsecond precision and numeric/string predicates unchanged. Files touched (Option A): `predicate-builder/basic-object-handler.ts`, `predicate-builder/range-handler.ts`, `arel/src/visitors/to-sql.ts#visitBindParam`, plus `scripts/parity/fixtures/ar-01/`, `ar-52/`, `ar-65/`.

---

## See also

- [`activerecord-100-plan.md`](activerecord-100-plan.md) — live tracker: in-flight PRs, post-merge fidelity followups, doc-hygiene, story count, guardrails.
- [`test-compare-100-plan.md`](test-compare-100-plan.md) — strategy + workflow + BLOCKED vocab reference.
- [`scripts/api-compare/unported-files.ts`](../scripts/api-compare/unported-files.ts) — canonical not-portable list.
