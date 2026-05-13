# ActiveRecord post-100% — Cluster details

**Companion to [`activerecord-100-plan.md`](activerecord-100-plan.md).** That doc is the live tracker (in-flight PRs, followups, story count). **This doc holds the per-cluster slot detail** — slot descriptions, LOC sizing, audit attribution, cross-cluster overlap notes.

A "cluster" here is a set of related work-PR slots that share an audit source, a file area, or a Rails-source surface. Each cluster has 1–11 slots; PRs target ~250 LOC each.

When picking a slot to spawn:

1. Check `activerecord-100-plan.md`'s In flight + Story count to see what's already moving and what's queued.
2. Find the matching cluster in this doc for slot details, sequencing, and overlap notes.
3. Read the relevant `audit-*` reference in the slot description; the audit ran with full Rails-source context and its inventory is the source of truth for the gap shape.

Closed slots are pruned as PRs merge — `git log --grep "audit Slot"` is the closed-work record.

---

## Associations-autosave cluster (~940 LOC across 4 remaining slots)

Slots A (#1426) + B (#1434) closed.

3. **Slot C** (~230 LOC) — Transaction wrapping of autosave chain + `RecordInvalid` raise from saveBang.
4. **Slot D** (~280 LOC) — `Associations::NestedError` propagation + `errors.indexErrors` + i18n full-message.
5. **Slot E** (~220 LOC) — CPK / queryConstraints / polymorphic-inverse / custom-context.
6. **Slot F** (~210 LOC) — Reflection introspection + per-class non-cyclic guard.

## Associations-reflection cluster (~900 LOC across 5 slots, from audit-associations-reflection)

31 empty-stub tests with generic boilerplate annotation. **Impl is fundamentally complete**; gaps are fixture plumbing + test-body writing + 3 fixture-model gaps.

1. **Slot A** (~80 LOC) — Error-type parity (`UnknownPrimaryKey`, `ConfigurationError` from plain `Error`).
2. **Slot B** (~120 LOC) — Empty-stub bodies for already-implemented features (`columnForAttribute`, `columnsForAttribute` — re-uses existing impl from `attribute-methods.test.ts` / `calculations.test.ts`).
3. **Slot C** (~250 LOC) — Polymorphic HMT fixture (Hotel/Department/Chef/CakeDesigner/DrinkDesigner) + scope-chain tests.
4. **Slot D** (~250 LOC) — Author/Organization essay fixture + dependent tests.
5. **Slot E** (~200 LOC) — Namespace resolution (`MacroReflection#_klass`) + `sourceType`-as-class guard.

3 const_missing/NameError tests → unported-list candidates (Ruby-only language semantics).

## MySQL warnings cluster — **closed via #1435** ✅

Slot A shipped (~240 LOC, 9 unskips, full feature port). Slot B ignore-list delegation rolled into A.

## MySQL schema cluster (~400 LOC across 3 slots, from audit-mysql-schema)

8 tests. One real behavior gap + one option drop + 6 fixture/test-helper gaps.

1. **Slot A** (~120 LOC) — `t.float :foo, limit: N` → `FLOAT(N)` MySQL DDL + `indexes()` retains `using` / `type`.
2. **Slot B** (~80 LOC) — `temporary:` option propagation on `dropTable` + annotation rewrite.
3. **Slot C** (~200 LOC) — MySQL fixture/test-helper infrastructure: `posts`, `key_tests`, `lessons_students`/`topics`/`students` fixtures + subclassing `Base` with qualified `db.table` table_name.

## MySQL quoting cluster — Slot A closed ✅ (consolidation cluster below)

Slot A shipped (#1442): instance `quoteString` backslash + static `quoteColumnName`/`quoteTableName`. The post-merge divergence triggered a follow-on 4-phase cleanup — see "MySQL quoting consolidation cluster" below.

## MySQL quoting consolidation cluster — **closed** ✅

All 4 phases shipped: #1447 (abstract leakage) → #1448 (call-site routing) → #1450 (delete invented helpers) → #1451 (module-mixin conversion). Standalone-vs-instance divergence eliminated.

## PG connection cluster (~130 LOC across 3 remaining slots, from audit-pg-connection)

Slots A (#1439) + B (#1446) closed.

3. **Slot C** (~50 LOC) — PG `resetBang()` override + un-skip 2 reset tests.
4. **Slot D** (~60 LOC) — `verify!` server-side-disconnect recovery + 1 test.
5. **Slot E** (~20 LOC) — `connection options` test rewrite (driver supports `-c geqo=off`; just need adapter constructed with that config).

Could bundle as 2 PRs (A+B ~160 LOC and C+D+E ~130 LOC) given size policy — or keep granular if all 5 land quickly.

## PG datatype cluster — **closed via #1432** ✅

Slot A shipped: 9 stale stubs deleted + 2 fixtures added + 6 fixture-backed un-skips.

## PG interval cluster (~180 LOC, Slot B remaining)

Slot A closed in #1431 (Rails-aligned test names + 6 fabricated deletions + round-trip verification).

- **Slot B** (~180 LOC) — Interval schema-default extraction + AVG aggregate typecast.

## PG long-tail cluster (~1760 LOC across 8 slots, from audit-pg-long-tail)

**73 skipped tests** across 12 PG long-tail files (citext, money, ltree, tsquery, bit-string, geometric, enum, cidr, composite, change-schema-timestamptz, …). **Annotation drift on all 73** — identical generic template points at fictional per-feature OID files. Real gaps live in `schema-statements` / `schema-dumper` / `schema-creation` / adapter helpers / `type-map-init` / schema-definitions DSL. A few features (composite, geometric beyond Point, tsquery serialize) have no source counterpart at all.

1. **Slot A** (~250 LOC) — citext end-to-end.
2. **Slot B** (~200 LOC) — money column metadata + serialize.
3. **Slot C** (~250 LOC) — ltree + tsquery + bit-string write/cast.
4. **Slot D** (~280 LOC) — geometric long-tail OIDs.
5. **Slot E** (~280 LOC) — enum schema-dump round-trip.
6. **Slot F** (~150 LOC) — composite Identity fallback.
7. **Slot G** (~200 LOC) — cidr IPAddr value + prefix-aware changed?
8. **Slot H** (~150 LOC) — change-schema timestamptz default.

## PG UUID residual cluster (~250 LOC, Slot B remaining)

Slots A (#1433) + C (#1444) closed.

2. **Slot B** (~250 LOC) — Associations + UUID FK binding.

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

1. **Slot A** (~120–180 LOC) — `createTable` `id` hash form `{ type, collation, ... }` + `ColumnOptions.charset` + test #3 ("add column with charset and collation"). Most other gaps already plumbed in `mysql/schema-creation.ts` (CHARACTER SET / COLLATE) and `newColumnFromField` (reads `Collation` from `SHOW FULL FIELDS`).
2. **Slot B** (~150–220 LOC) — MySQL `changeColumn` + `buildChangeColumnDefinition` stubs (both empty today). Includes "preserve existing collation for text→text/string" + `:no_collation` sentinel semantics. Unblocks tests 4–7.
3. **Slot C** (~15 LOC, optional) — BLOCKED annotation cleanup.

## Encryption cluster (closed)

All three slots shipped:

- Slot A — Binary-column encryption fixtures (#1405)
- Slot B — `messageSerializer` per-encrypts() option pass-through + msgpack fixture (#1409)
- Slot C — Lazy `previousSchemes` + `store_accessor` + insert/defaults (#1420). One residual: deterministic ciphertext byte-parity with MRI Rails (blocked on `MessageSerializer` double-base64 bug — in post-merge fidelity followups).

## Serialization cluster — **closed** ✅

Slot A (#1404) + Slot B (#1445) shipped.

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

## SQLite adapter cluster (~50 LOC, Slot B remaining)

Slot A closed in #1443 (`strict_strings_by_default` class-config knob + 3 unskips; DQS toggle is a no-op in better-sqlite3 — followups for future driver support).

2. **Slot B — `assertLogged` SCHEMA-event parity** (~50 LOC). 2 test-infra gap tests.

## PG infinity cluster (closed — #1427 shipped 6 unskips; 3 deferred to fidelity followups, ~135 LOC residual)

Original: ~250 LOC, from audit-pg-infinity)

**Audit finding: feature is already implemented.** The 18-test file is fabricated; Rails' `infinity_test.rb` has only 9 tests. The 9 extra positive/negative splits + "infinity where clause" name are TS-only inventions.

**Real gap:** date/datetime infinity is stored as `Symbol` sentinels (`DateInfinity`, `DateNegativeInfinity`) while Rails uses `Float::INFINITY` itself. `assert_equal Float::INFINITY, record.date_field` fails value-equality.

**Slot A** (~250 LOC) — Sentinel unification (replace `Symbol` sentinels with `Number.POSITIVE_INFINITY`/`Number.NEGATIVE_INFINITY` for date/datetime types) + prune the 9 fabricated tests + add `PostgresqlInfinity` fixture + `InTimeZone` test helper.

## PG foreign-table cluster (closed — #1429 shipped 16 unskips; 1 deferred to fidelity followups)

Original: ~230 LOC, from audit-pg-foreign-table)

**Audit finding: feature is already complete** (`foreignTables`/`foreignTableExists` + `dataSourceSql(..., type: "FOREIGN TABLE")` branch). 17 BLOCKED tests are empty stubs; their BLOCKED annotation points at `connection-adapters/postgresql/foreign-table.ts` which **does not exist and need not exist**. Rails creates foreign tables via raw `execute("CREATE FOREIGN TABLE ...")` after `postgres_fdw` setup — no schema-statement methods.

**Slot A** (~200–260 LOC) — Port `foreign_table_test.rb` bodies. Pure test work; zero adapter changes.

## PG virtual-column cluster (~250 LOC, Slot B remaining)

Slot A closed in #1430 (rewrite TS file to mirror Rails + XML relocation).

- **Slot B** (~250 LOC) — Live-PG round-trip harness + un-skip 5 Rails-mirrored tests. `defineSchema`-less `create_table`; `change_table { |t| t.virtual ... }`; `buildFixtureSql` virtual-column filter.

---

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

## Schema cluster (~1390 LOC across 7 remaining slots + annotation sweep, from audit-schema)

Slot A closed in #1407; Slot B closed in #1418; Slot G superseded by MySQL active-schema cluster.

3. **Slot C** (~80–120 LOC, sized down per #1407) — Index dump metadata (partial `where:`, `order:`, `nulls_not_distinct`, expression indices). ~7 un-skips.
4. **Slot D** (~220 LOC) — Check / exclusion / unique constraints in dumper. 5 un-skips.
5. **Slot E** (~200 LOC) — PG type-specific dump + extensions dumping. 11 un-skips.
6. **Slot F** (~200 LOC) — PG `change_column` type/precision/scale/limit + null/default round-trip + timestamptz. 11 un-skips.
7. **Slot H** (~280 LOC) — PG schema authorization + qualified-schema (search_path). 22 un-skips.
8. **Slot I** (~250 LOC, exploratory) — PG partitioning + inheritance introspection in dumper. 6 un-skips.
9. **Slot J** (~120 LOC) — `Schema.define` with `tableNamePrefix` + bulk-change timestamps default + SchemaCache portable bits. 5 un-skips.
10. **Slot K** — Annotation normalization across all 128 BLOCKED annotations. Lands AFTER C–J.

## PG-adapter cluster (~340 LOC across 2 remaining slots)

Slot B closed in #1414; Slot C closed in #1436; Slot D closed in #1411.

1. **Slot A** (~220 LOC) — `execInsert` returning-disabled fallback + `extractTableRefFromInsertSql` helper. 4 un-skips.
2. **Slot E** (optional, ~120 LOC) — Prepared-statements introspection. 3 un-skips.

## Transactions cluster (~350 LOC across 3 remaining slots + 1 deferred, from audit-transactions)

Slot A closed in #1417 (2 followup-LOC bugs surfaced: dirty-tracking clobber + isolation-error-type; both in post-merge fidelity followups).

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
