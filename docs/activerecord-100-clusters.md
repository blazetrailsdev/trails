# ActiveRecord post-100% — Cluster details

**Companion to [`activerecord-100-plan.md`](activerecord-100-plan.md).** That doc is the live tracker (in-flight PRs, followups, story count). **This doc holds the per-cluster slot detail** — slot descriptions, LOC sizing, audit attribution, cross-cluster overlap notes.

A "cluster" here is a set of related work-PR slots that share an audit source, a file area, or a Rails-source surface. Each cluster has 1–11 slots; PRs target ~250 LOC each.

When picking a slot to spawn:

1. Check `activerecord-100-plan.md`'s In flight + Story count to see what's already moving and what's queued.
2. Find the matching cluster in this doc for slot details, sequencing, and overlap notes.
3. Read the relevant `audit-*` reference in the slot description; the audit ran with full Rails-source context and its inventory is the source of truth for the gap shape.

Closed slots are pruned as PRs merge — `git log --grep "audit Slot"` is the closed-work record.

---

## Encryption cluster (~250 LOC, Slot C remaining)

Slot A closed in #1405, Slot B closed in #1409. Remaining:

- **Slot C — Lazy previousSchemes + store_accessor + insert/defaults + ciphertext constancy** (~250 LOC). Lazy `previousSchemes` getter invalidated by `Configurable.onConfigure`; `EncryptedTrafficLightWithStoreState` fixture; single-row `Base.insert` wrapper; un-skip 4 tests.

## Serialization cluster (~70 LOC, Slot B remaining)

Slot A closed in #1404. Remaining:

- **Slot B — serialized-column join fixture** (~60–80 LOC, optional). Add fixture-style models to `serialization.test.ts`; un-skip 1 join test.

## Relation cluster (~1660 LOC across 7 slots, from audit-relation)

302 skipped tests across ~14 relation-area files; sub-clusters orthogonal.

1. **Slot A** (~260 LOC) — WhereClause association predicates (core).
2. **Slot B** (~250 LOC) — Polymorphic + CPK predicates in WhereClause.
3. **Slot C** (~220 LOC) — WhereChain `associated` / `missing` branches.
4. **Slot D** (~250 LOC) — Default scope / `all_queries` / unscoped caching invariants.
5. **Slot E** (~220 LOC) — Batches with composite-PK + ordering edge cases.
6. ~~**Slot F** — load_async scheduling~~ **DROPPED.** Auditor missed Step 0; would have built sources unported in #1400. 28 affected tests already permanent-skipped.
7. **Slot G** (~240 LOC) — `PredicateBuilder.registerHandler` + field-ordered-values + calc grouping.
8. **Slot H** (~220 LOC) — Relation misc small-surface bundle.

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

## Associations has-one cluster (~480 LOC across 4 slots, from audit-associations-has-one)

51 skipped (prompt said ~28; actual count is 51 across 3 files). **Most aren't has_one-specific** — downstream of Marshal/I18n/query-cache/scope-unscope/etc. **One real structural gap:** `HasOneThroughAssociation` inherits `replace` from has_one but the through helpers (`createThroughRecord`, `throughAssociation`, `transaction`) in `has-one-through-association.ts` are **never called** — dead code wiring.

1. **Slot A** (~80 LOC) — Wire `HasOneThroughAssociation.replace` through `createThroughRecord`. **Biggest single payoff** (closes ~5–6 skips with one wiring fix). Spawn first.
2. **Slot B** (~120 LOC) — has_one validation surface.
3. **Slot C** (~250 LOC) — Through-loader filters: `source_type` + many + default_scope-on-join.
4. **Slot D** (~30 LOC) — Re-annotate BLOCKED comments away from has_one to their real root causes.

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

## Migration cluster (~1210 LOC across 6 remaining slots, from audit-migration)

Slot A closed in #1410.

2. **Slot B** (~220 LOC) — `tableNamePrefix`/`tableNameSuffix` on `MigrationContext`/`Migration` + CTAS + `InvalidMigrationTimestampError`. 6 un-skips.
3. **Slot C** (~200 LOC) — Advisory-lock seams + `Migrator#runWithoutLock` filtering + migration-detection-without-schema-table. 8 un-skips.
4. **Slot D** (~250 LOC) — Multi-DB `MigrationContext` factory. 7 un-skips.
5. **Slot E** (~220 LOC) — Filesystem migration discovery + internal-metadata enable/disable toggle + schema-cache invalidation hooks. 8 un-skips.
6. **Slot F** (~180 LOC) — Bulk-alter recorder round-trip + `change-column` test reorg. 6 un-skips.
7. **Slot G** (~140 LOC) — MySQL utf8mb4 init + renameIndex-on-FK adapter parity. 3 un-skips.

## Connection-pool cluster (~640 LOC across 3 remaining slots, from audit-connection-pool)

Slot A closed in #1415. 155 actual skipped (estimate revised down from ~209). Single-process / single-handler / single-shard happy paths all work — gaps cluster around multi-DB / sharding.

2. **Slot B** (~250 LOC) — `connects_to` + default writing/reading handlers (config-hash establishment).
3. **Slot C** (~240 LOC) — Shard-selector wiring + `prohibitShardSwapping`.
4. **Slot D** (~180 LOC) — ActiveSupport::Notifications equivalent for pool events. Likely needs a small shim or piggy-back on existing instrumentation infra.

**Gap 8 (process-fork lifecycle) was a phantom** — #1416 found `connection_pool_test.rb` has no fork/PID test; the audit reference pointed at `connection_handler_test.rb` work already handled. No action.

## MySQL active-schema cluster (~680 LOC across 3 remaining slots, from audit-mysql-active-schema)

**Supersedes the previous Schema-cluster Slot G estimate.** Slot A closed in #1413 (SQL-capture test infra + first un-skips). Remaining:

2. **Slot B** (~220 LOC) — MySQL DDL SQL parity (`dropTable` comma form, `createDatabase`/`recreateDatabase`, `indexAlgorithm` validator).
3. **Slot C** (~260 LOC) — `addIndex` MySQL output shape + inline `t.index` in `create_table`.
4. **Slot D** (~200 LOC) — Bulk change-table ALTER coalescing + timestamp tests.

## MySQL mysql2-adapter cluster (~700 LOC across 3 slots, from audit-mysql-mysql2-adapter)

9 BLOCKED tests in `adapters/mysql2/mysql2-adapter.test.ts`. Three slots:

1. **Slot A — `databaseExists` static + `exec_query(prepare:)` + DML-tolerant execQuery** (~220 LOC). Test-only "fake_connection" path that lets `Mysql2Adapter` instantiate without a live driver underpins several tests.
2. **Slot B — Translate-exception depth: timeout + statement-timeout** (~200 LOC). `read_timeout` → `AdapterTimeout`, `ER_FILSORT_ABORT` / `ER_QUERY_TIMEOUT` → `StatementTimeout`.
3. **Slot C — Timezone re-sync + db_warnings_action + test-helper infra** (~280 LOC). `query_options[:database_timezone]` plumbing + `with_db_warnings_action`.

## SQLite adapter cluster (~120 LOC, from audit-adapter-sqlite)

9 BLOCKED tests in `adapters/sqlite3/sqlite3-adapter.test.ts`. Two real slots + 2 unported-list candidates (folded into Unported-list additions in plan):

1. **Slot A — `strict_strings_by_default` class-config knob** (~70 LOC). 3 tests; one Rails feature + 2 variations.
2. **Slot B — `assertLogged` SCHEMA-event parity** (~50 LOC). 2 test-infra gap tests.

## PG infinity cluster (~250 LOC, from audit-pg-infinity)

**Audit finding: feature is already implemented.** The 18-test file is fabricated; Rails' `infinity_test.rb` has only 9 tests. The 9 extra positive/negative splits + "infinity where clause" name are TS-only inventions.

**Real gap:** date/datetime infinity is stored as `Symbol` sentinels (`DateInfinity`, `DateNegativeInfinity`) while Rails uses `Float::INFINITY` itself. `assert_equal Float::INFINITY, record.date_field` fails value-equality.

**Slot A** (~250 LOC) — Sentinel unification (replace `Symbol` sentinels with `Number.POSITIVE_INFINITY`/`Number.NEGATIVE_INFINITY` for date/datetime types) + prune the 9 fabricated tests + add `PostgresqlInfinity` fixture + `InTimeZone` test helper.

## PG foreign-table cluster (~230 LOC, from audit-pg-foreign-table)

**Audit finding: feature is already complete** (`foreignTables`/`foreignTableExists` + `dataSourceSql(..., type: "FOREIGN TABLE")` branch). 17 BLOCKED tests are empty stubs; their BLOCKED annotation points at `connection-adapters/postgresql/foreign-table.ts` which **does not exist and need not exist**. Rails creates foreign tables via raw `execute("CREATE FOREIGN TABLE ...")` after `postgres_fdw` setup — no schema-statement methods.

**Slot A** (~200–260 LOC) — Port `foreign_table_test.rb` bodies. Pure test work; zero adapter changes.

## PG virtual-column cluster (~400 LOC, from audit-pg-virtual-column)

**Audit finding: feature itself is already implemented.** The 19 BLOCKED tests in `adapters/postgresql/virtual-column.test.ts` are largely fabricated — they don't mirror Rails' `virtual_column_test.rb` (which has only 8 tests). **7 of the 19 tests belong to `xml_test.rb`** and are misplaced in a `PostgresqlXmlTest` describe block.

1. **Slot A — Rewrite TS test file to mirror Rails + buildFixtureSql virtual filter** (~150 LOC). Re-locate the 7 XML tests to a new `pg/xml.test.ts`; rewrite the remaining tests to match the 8 Rails-mirrored ones. Drop fabricated tests.
2. **Slot B — Live-PG round-trip harness + un-skip 5 Rails-mirrored tests** (~250 LOC). `defineSchema`-less `create_table` path; `change_table { |t| t.virtual ... }`; small `buildFixtureSql` virtual-column filter.

Deferred: `test_build_fixture_sql` until fixture feature lands.

## PG-schema audit cluster (~530 LOC across 3 slots, from audit-pg-schema)

26 skips. **Partially overlaps Schema-cluster Slot E** (PG type-specific dump) — sequencing TBD when either is picked up.

1. **Slot A** (~260 LOC) — `indexes()` introspection extensions (opclass / nulls order / nulls-not-distinct / INCLUDE columns) + dumper emit.
2. **Slot B** (~150 LOC) — `SchemaDumper.emitTable` consults `tableOptions()` (so `options: "PARTITION BY …"` / `"INHERITS (…)"` reach the dump) + `dump_table_schema` test helper.
3. **Slot C** (~120 LOC) — `createJoinTable` schema-qualified-name aware.

Plus: `setSchemaSearchPath` unquoted-`$user` rejection + 5 fixture-model gaps (`Thing1..5`, `Song`/`Album` habtm) — small enough to fold into Slot A or B.

## Unknown-triage cluster (~640 LOC, from audit-unknown-triage)

Re-categorization of all 89 `BLOCKED: unknown` annotations. **Single foundational annotation-refresh PR** unblocks downstream slot-sizing:

1. **Slot A — Annotation refresh** (~200 LOC, comment-only). Re-tag all 89 annotations into the controlled vocabulary, moving the Ruby-only language-semantics ones (`modules.test.ts` x7, `mixin.test.ts` x2, `base.test.ts` x1 — `Module#prepend`, `singleton_class`, `Module#ancestors`, constant-path lookup) to `PERMANENT-SKIP` form in `unported-files.ts`.
2. **Slot B — `insert-all.test.ts` investigation + un-skip** (~250 LOC). **64 of the 89 have stale "`MemoryAdapter accepts any attrs"` comments** that mislead the audit — there is no `MemoryAdapter`; the test setup uses `SchemaAdapter` wrapping a real driver. `InsertAll` impl is at 100% per #1255. Real work: scrub stale comments (largely done in #1416), investigate what's actually skipped, rewrite test bodies to assert against real-adapter behavior.
3. **Slot C — SignedId real-feature gaps** (~140 LOC).
4. **Slot D — Callbacks `afterCommit` refinements** (~50 LOC).
5. **Deferred** — Misc small feature closes (~80 LOC); timezone-aware attribute methods (~150 LOC).

## STI annotation drift (~20 LOC, tests-only)

audit-STI found **no STI implementation gap**. All 6 `BLOCKED: STI` tests are mis-labeled — real causes are missing fixture scopes, UUID PK + touch on polymorphic delegated_type, and PG `CREATE TABLE … INHERITS` schema-dump (closed by pg-schema Slot B above). Single tests-only PR re-annotates the 6 tests under correct categories.

## Schema cluster (~1540 LOC across 8 remaining slots + annotation sweep, from audit-schema)

Slot A closed in #1407; Slot B in flight as #1418; Slot G superseded by MySQL active-schema cluster.

3. **Slot C** (~80–120 LOC, sized down per #1407) — Index dump metadata (partial `where:`, `order:`, `nulls_not_distinct`, expression indices). ~7 un-skips.
4. **Slot D** (~220 LOC) — Check / exclusion / unique constraints in dumper. 5 un-skips.
5. **Slot E** (~200 LOC) — PG type-specific dump + extensions dumping. 11 un-skips.
6. **Slot F** (~200 LOC) — PG `change_column` type/precision/scale/limit + null/default round-trip + timestamptz. 11 un-skips.
7. **Slot H** (~280 LOC) — PG schema authorization + qualified-schema (search_path). 22 un-skips.
8. **Slot I** (~250 LOC, exploratory) — PG partitioning + inheritance introspection in dumper. 6 un-skips.
9. **Slot J** (~120 LOC) — `Schema.define` with `tableNamePrefix` + bulk-change timestamps default + SchemaCache portable bits. 5 un-skips.
10. **Slot K** — Annotation normalization across all 128 BLOCKED annotations. Lands AFTER C–J.

## PG-adapter cluster (~620 LOC across 3 remaining slots + 1 optional, from audit-pg-postgresql-adapter)

Slot B closed in #1414; Slot D closed in #1411 (as `withSecondAdapter` + SQLSTATE wiring; 3 follow-up residuals in fidelity followups).

1. **Slot A** (~220 LOC) — `execInsert` returning-disabled fallback + `extractTableRefFromInsertSql` helper. 4 un-skips.
2. **Slot C** (~280 LOC) — Enum OID registration + `Column.defaultFunction` arithmetic + ErrorReporter `:report` wiring. 3 un-skips.
3. **Slot E** (optional, ~120 LOC) — Prepared-statements introspection. 3 un-skips.

## Transactions cluster (~350 LOC across 3 remaining slots + 1 deferred, from audit-transactions)

Slot A in flight as #1417.

2. **Slot B** (~120 LOC) — Fixture-model gaps: `Topic+Reply`, `Movie` (custom PK), `Cpk::Book` (composite PK). 4 un-skips.
3. **Slot C** (~80 LOC) — Test helpers: `open_transactions` probe + callback-raises listener. 2–3 un-skips.
4. **Slot D** — Wire isolation tests through PG-adapter Slot D's `secondConnection` helper. 4–6 un-skips.
5. **Slot E** (deferred) — Autosave + nested_attributes (depends on `accepts_nested_attributes_for` post-#1239).

## `NotImplementedError` elimination initiative (~610 LOC across 7 sweeps)

**Goal: zero unjustified `NotImplementedError` throws when AR is "done."** Phase 1 audit (delivered 2026-05-11) found **38 throw sites** across 14 files. Disposition tally:

- **port-real**: 24 (most 1–15 LOC; `buildDefaultScope` is the largest)
- **keep-as-strategy-hook**: 8 (Rails also raises; verify message form matches)
- **remove-from-class**: 7
- **empty-default**: 0 (no Rails `def foo; end` bodies found)
- **delete-stub-and-add-to-unported**: 0 (no throw sites in `UNPORTED_FILES`)

**Phase 2 sweep PRs:**

1. **Sweep A — TableDefinition privates (mysql + postgresql)** (~80 LOC). 6 throws across `connection-adapters/{mysql,postgresql}/schema-definitions.ts`.
2. **Sweep B — Abstract adapter `rawExecute` body + generic-Error normalize** (~120 LOC). Includes the 3 generic `Error("Not implemented")` strings → typed `NotImplementedError`.
3. **Sweep C — Scoping/Default port** (~80 LOC). 3 throws in `scoping/default.ts` including `buildDefaultScope`.
4. **Sweep D — Per-adapter small ports + dead-stub cleanup** (~150 LOC, split if needed).
5. **Sweep E — Mysql2 adapter heavy ports** (~150 LOC).
6. **Sweep F — Remove-from-class stubs** (~30 LOC delete).
7. **Sweep G — Strategy-hooks verification** (0 LOC). 8 throws kept; verify error message matches Rails. No-code change.

**Phase 3 — ESLint rule** banning `throw new NotImplementedError` outside the Sweep G allowlist. Permanent guardrail.

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

Most of this landed in #1416; remainder is the residual cleanup pass.

### AR query-parity residual — datetime precision (ar-01 / ar-52 / ar-65)

One gap tracked in [`scripts/parity/canonical/query-known-gaps.json`](../scripts/parity/canonical/query-known-gaps.json) (four gaps closed in #854/#856/#863/#899).

**Goal:** `Order.where(created_at: oneWeekAgo..now).toSql()` emits second-precision SQL matching Rails' `quoted_date` (no fractional seconds for unscaled DATETIME columns).

**Current behaviour** (when frozen-at has non-zero ms, e.g. `175ms`):

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16.175000' AND '2026-04-25 17:53:16.175000'
```

**Expected (Rails):**

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16' AND '2026-04-25 17:53:16'
```

**Root cause.** Trails inlines dates from `Quoted` nodes with full precision. PR #845 added bind extraction for `compileWithBinds`, but `toSql()` still inlines. The gap flakes (closes when frozen-at lands on a whole second).

**Options:**

- **Option A (BindParam-first, ~80 LOC):** In `predicate-builder/basic-object-handler.ts` + `range-handler.ts`, wrap Date values in `new Nodes.BindParam(queryAttribute)` instead of `Quoted`. Add a `quotedDateForBind` branch in `visitBindParam` that truncates to seconds. Don't change `visitQuoted` (INSERT precision preserved).
- **Option B (parity-runner side):** PR #850's `paramSql` + binds comparison would close this in the diff layer without trails code changes — runner compares binds as ISO 8601 cross-side.

**Risk:** Medium — touches every WHERE clause in the suite. Must keep INSERT microsecond precision and numeric/string predicates unchanged. Files touched (Option A): `predicate-builder/basic-object-handler.ts`, `predicate-builder/range-handler.ts`, `arel/src/visitors/to-sql.ts#visitBindParam`, plus `scripts/parity/fixtures/ar-01/`, `ar-52/`, `ar-65/`.

---

## See also

- [`activerecord-100-plan.md`](activerecord-100-plan.md) — live tracker: in-flight PRs, post-merge fidelity followups, doc-hygiene, story count, guardrails.
- [`test-compare-100-plan.md`](test-compare-100-plan.md) — strategy + workflow + BLOCKED vocab reference.
- [`scripts/api-compare/unported-files.ts`](../scripts/api-compare/unported-files.ts) — canonical not-portable list.
