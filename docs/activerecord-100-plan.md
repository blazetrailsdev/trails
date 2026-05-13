# ActiveRecord API Parity Plan: 100% closed → post-100% Rails-fidelity stories

**Snapshot 2026-05-12:** `activerecord 4969/4969 methods (100%) | files: 275/275 | inheritance: 209/209 (100%)`. `activemodel 625/625 (100%)` — restored via #1438.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. Each PR targets ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

This doc is the **live work tracker** (in-flight, post-merge followups, story count, guardrails). For per-cluster slot detail (slot descriptions, LOC sizing, audit attribution, overlap notes), see [`activerecord-100-clusters.md`](activerecord-100-clusters.md). For workflow + BLOCKED-annotation vocab + audit conventions, see [`test-compare-100-plan.md`](test-compare-100-plan.md).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`. This doc lists only **open work**.

---

## In flight

_(none — all queued work shipped as of this snapshot)_

`gh pr list --state open` is the live picture. Cluster details for in-flight slots live in [`activerecord-100-clusters.md`](activerecord-100-clusters.md).

---

## Recently closed (P0 wave 1)

- **#1426** Autosave Slot A — Association-object indirection ✅ (foundational; B–F downstream now unblocked)
- **#1427** pg-infinity Slot A — `Float::INFINITY` sentinel unification + 6 unskips ✅ (3 followups in fidelity)
- **#1428** reflection Slot B — 5 unskips (audit oversized) ✅
- **#1429** pg-foreign-table Slot A — 16/17 unskips ✅ (1 deferred, fidelity followup)

**P0 wave 2 + adjacent (just merged):**

- **#1430** pg-virtual-column Slot A — rewrite to mirror Rails + XML relocation ✅
- **#1431** pg-interval Slot A — Rails-aligned test names ✅ (Slot B ~180 LOC still open)
- **#1432** pg-datatype Slot A — 6 fixture-backed + 9 stale deletions ✅ (cluster done)
- **#1433** pg-uuid-residual Slot A — SchemaDumper UUID-PK + 5 unskips ✅ (B+C still open)
- **#1435** mysql-warnings Slot A — full feature port + 9 unskips ✅ (cluster done)
- **#1436** pg-adapter Slot C — Enum OID + defaultFunction + ErrorReporter ✅ (A + E-optional still open)
- **#1437** api:compare → 100% restoration — 4 regressions from #1421/#1423 fixed ✅

**Currently in flight:** _(none)_

**P0 wave 3 + adjacent (just merged):**

- **#1434** Autosave Slot B — collection mutation via `Association.insertRecord` ✅
- **#1438** activemodel api:compare → 100% — yaml-encoder unported + IntegerType.deserialize + inheritance fix ✅
- **#1439** PG connection Slot A — `SQLSubscriber` test helper + 7 logs_name unskips ✅
- **#1440** chore(test) — cap vitest worker count to 4 (prevent local saturation) ✅
- **#1443** SQLite Slot A — `strict_strings_by_default` class config + 3 unskips ✅
- **#1442** MySQL quoting Slot A — instance `quoteString` backslash + static `quoteColumnName`/`quoteTableName` ✅ (standalone-function divergence: see fidelity followup; full consolidation now a 4-phase cluster — Phase 1 + 2 in flight as %281/%282)
- **#1444** PG UUID Slot C — UniquenessValidator UUID-aware case-insensitive bypass ✅ (deviates from Rails — adapter-layer in Rails, validator-layer here; ~30 LOC async-bridge followup)
- **#1445** Serialization Slot B — serialized-column join fixture ✅ (cluster done)
- **#1446** PG connection Slot B — `execQuery prepare:` kwarg + `statement_name` payload ✅
- **#1447** MySQL quoting consolidation Phase 1 — remove `quoterForAdapterName` from `abstract/schema-{definitions,creation}.ts` ✅
- **#1448** MySQL quoting consolidation Phase 2 — 5 call sites routed through `this.quote()` ✅
- **#1449** Column#default lazy-deserialize — dumper-layer deserialize + model-instance cast ✅ (4 model-default unskips; 13 schema-dump tests still fixture-blocked)
- **#1450** MySQL quoting Phase 3 — delete invented helpers + internalize standalone `quoteString` ✅
- **#1451** MySQL quoting Phase 4 — module-mixin conversion for thin delegates ✅ (**cluster closed**)
- **#1453** Query-cache Phase 1 — context-keyed registry + pin wiring + checkout/checkin attachment ✅ (cross-context cache pollution data-safety bug fixed; Phases 2-4 queued)
- **#1452** PG json driver-level cast bypass — per-connection `getTypeParser` override for OIDs 114/3802 ✅ (also fixed a latent pre-existing PG `quote()` E-string backslash bug for inline-quoted string values)

## P0 — spawn-next priority

The rest of the inventory is FIFO-by-audit-delivery. P0 items below get spawned first; pick by file-conflict avoidance when running ≥2 in parallel.

### P0a — Foundational (closed)

- ✅ **Autosave Slot A** — Association-object indirection (#1426). Autosave B–F now spawnable.

### P0b — Audit-verified "impl complete, only test work"

| Slot                    | LOC  | Status                                                       |
| ----------------------- | ---- | ------------------------------------------------------------ |
| pg-foreign-table A      | ~230 | ✅ #1429 (16 un-skips)                                       |
| pg-infinity A           | ~250 | ✅ #1427 (6 un-skips, 3 followups)                           |
| reflection B            | ~120 | ✅ #1428 (5 un-skips, audit oversized)                       |
| **pg-virtual-column A** | ~150 | %260 in flight                                               |
| **pg-interval A**       | ~220 | %261 in flight                                               |
| **pg-datatype A**       | ~220 | open — delete 9 stale + 6 fixture-backed un-skips            |
| **pg-uuid-residual A**  | ~230 | open — SchemaDumper UUID-PK test bodies + annotation cleanup |

**Remaining P0b**: 2 in flight + 2 open. Wave-1 yield: **27 un-skips** across 4 PRs.

---

## Post-merge fidelity followups (~700 LOC, 26 items)

Small Rails-fidelity polish from PR reviews + post-merge findings. Items closed by recent sweeps are summarized at the end.

### Deferred from sweep B (#1422)

- **~50 LOC** — `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block via a module-level `_defaultSqlTimezoneOverride` + `withEnvTimezone(zone, fn)` test helper). Unblocks 2 base.test.ts tests. (#1399)
- **~10 LOC** — `HashAccessor.write` json-branch regression test (path is correct today; needs a defensive test). (#1404)
- **~30 LOC** — Wire `tableOptions()` into `schema-dumper.ts:emitTable`. Requires making the dump loop async; overlaps pg-schema Slot B / Schema Slot E. (#1407)
- **~30 LOC** — `MessageSerializer.encodeIfNeeded` double-base64 fix. **Architectural**: requires `Aes256Gcm` to store raw bytes (not base64 strings) in headers — a _breaking change_ for existing stored ciphertexts. Only ship with a migration path. (#1420)

### Reverted from sweep A (#1421)

- **~5 LOC** — Remove `RangeType.encodeLiteral` pre-serialization workaround. Reverted: still load-bearing — removing it broke `range.test.ts > where by attribute with range` (PG `42883: No operator matches`). Real fix needs BindParam range-quoting (next item). (#1390)
- **~20 LOC** — Fix the BindParam route for range WHERE predicates so range values quote correctly. Unblocks the `RangeType.encodeLiteral` removal. (#1421 followup)
- **~30 LOC** — `validateForeignKey` `!fSchema → public` heuristic. Reverted: the `pg_namespace` join diverged from Rails (which uses `t2.oid::regclass::text` + `search_path`). Original fragility concern remains for non-public-schema FKs on search_path. Needs a different schema-resolution strategy. (#1410)

### From #1411/#1421 post-pr — test residuals

- **~20 LOC** — `reconnect after bad connection on check version` test: pg-npm pool has no single-connection version-stub hook. Needs `_databaseVersionForTest()` setter or injectable version-check hook. (`translate no connection exception to not established` is now confirmed redundant — 57P01 covered by `reconnection_error` fake-pool injection.) (#1411)

### From #1421 post-pr — transactions

- **~50 LOC** — Dirty-tracking for new-record rollback: `topic.changes["title"]` returns `undefined` instead of `[null, "Jeff"]` after rollback. Root cause deeper than sweep A's guard fix — `state.attributes` snapshot in `rememberTransactionRecordState` captures user-written values, so `redetectChanges` produces no diff. Fix: snapshot _DB-original_ values (null for unsaved new records), or add separate DB-original tracking. (#1417)

### From #1421 post-pr — schema dumper

- **~30 LOC** — `SchemaDumper.fkIgnorePattern` configurability vs `ForeignKeyDefinition.isExportNameOnSchemaDump` hardcoded `fk_rails_` pattern. Either (a) make `isExportNameOnSchemaDump` accept the configured pattern, restoring `fkIgnorePattern` functionality; or (b) deprecate `fkIgnorePattern` since FK now owns the decision (Rails-faithful). (#1418/#1407 followup)

### From #1423 post-pr — insert-all polish

- **~30 LOC** — Add `supportsInsertConflictTarget()` to `DatabaseAdapter` interface + impls (true for sqlite≥3.24, pg, mysql≥8). Wire Rails' guard in `_findUniqueIndexFor` so unsupported adapters raise the proper `ArgumentError` rather than falling through to "No unique index found". (#1423)
- **~50 LOC** — Thin `IndexDefinition` value class in `connection-adapters/`. Mutate `this.uniqueBy` to it in constructor (post-await in `_populateUpdatableColumns`). Unlocks `ON CONSTRAINT <name>` for PG. (#1423)
- **~10 LOC** — Add `model.adapter.schemaCacheBound` returning a pool-bound one-arg `indexes(tableName)` form so call sites don't know about the pool. The two-arg signature was the footgun this PR hit. (#1423)

### From #1424 post-pr — PG schema-statements

- **~30 LOC** — Rewire PG mixin chain so `PostgreSQLAdapter#dropTable` delegate can be deleted. Add per-adapter `include(PostgreSQLAdapter, ...)` for PG-specific schema-statements methods. Mirrors Rails' `include PostgreSQL::SchemaStatements`. (#1424)
- **~50 LOC** — Live PG integration test for `dropTable("parent", { force: "cascade" })` end-to-end. Current tests use a fake adapter. (#1424)

### From audit-as-any-method-calls

- **~10–20 LOC** — Verify 2 `bug-suspected` candidates from the as-any audit: `relation.ts:4965` `(this.spawn() as any).asyncBang()` (possible swallowed promise) + `abstract/database-statements.ts:1827` `(relation as any).arel()` (verify sync on every host). If real, surgical fixes. (audit-as-any-method-calls)

### From #1426 post-pr — autosave A

- **~50 LOC** — Preloader → `associationInstanceSet` migration. Update the ~14 map-direct write sites (preloader/association.ts, preloader/batch.ts, relation.ts:2149-2161, 6 sites in associations.ts) to call `record.associationInstanceSet(name, association)`. Once done, `_loadedAssociation` collapses to a one-line Rails-shaped pure read. (#1426)
- **~30 LOC** — Wire `custom_validation_context?` branch into `validateHasOneAssociation` / `validateBelongsToAssociation`. Rails autosave_association.rb:332/346. (#1426)

### From #1427 post-pr — pg infinity

- **~40 LOC** — Arel range-bound serialization for `Float::INFINITY` endpoints. Unblocks 2 remaining `where clause with infinite range` tests. Likely a `QueryAttribute.serialize` / range visitor change. (#1427)
- **~80 LOC** — `InTimeZone` test helper + `time_zone_aware_attributes` integration. Unblocks 1 remaining infinity TZ-aware test. Touches `Base.timeZoneAwareAttributes`, `reset_column_information`, TimeZoneConverter wrapping for sentinel values. (#1427; may need its own slot)
- **~10 LOC** — MySQL `quote()` non-finite handling (`mysql/quoting.ts:177`). Same bareword bug pg had; no MySQL infinity test surfaced it. Preventive. (#1427)
- **~5 LOC cleanup** — `persistence.ts:872-880` isDateInfinity branch now too broad post-sentinel-unification; gate on temporal type-name. (#1427)
- **~5 LOC cleanup** — `temporalToBindString` PG infinity branch may be dead post-PR; trace + delete if confirmed. (#1427)

### From #1428 post-pr — reflection B

- **~30 LOC** — Wire `ensureOptionNotGivenAsClassBang` into ThroughReflection / source-type validation path (defined but never called today). Unblocks `class for source type` test. (#1428)
- **~50 LOC** — `static set primaryKey(null)` semantics + `Edge` fixture; un-skip `association primary key raises when missing primary key` + `active record primary key raises when missing primary key`. (#1428)
- **~15 LOC** — Annotation refresh on 22 remaining `reflection.test.ts` stubs (all carry wrong AggregateReflection/ThroughReflection boilerplate; real causes vary). (#1428)
- **~30 LOC future** — `NullColumn` class so `assert_instance_of NullColumn` Rails asserts can port verbatim. Duck-compatible shape exists; only matters if porting that specific assertion. (#1428)

### From #1429 post-pr — pg foreign-table

- **~30–80 LOC** — Wire `Base.primaryKey` to consult `adapter.primaryKey(tableName)` for tables without explicit PK (foreign tables). Touches `getPrimaryKeyAttr` `?? "id"` sentinel (distinguish "unset" vs "explicitly nil") + `model-schema.ts` PK auto-detection. Affects all models; careful test pass. Un-skips 1 deferred test. (#1429)

### From #1430 post-pr — pg virtual-column

- **~15–30 LOC** — Route `addColumn` through `schemaCreation.accept(AddColumnDefinition)`; fix `visitColumnDefinition` to call `addColumnOptionsBang` instead of `addColumnOptions`. Unblocks `test_non_persisted_column` + `test_change_table` Rails-parity rewrites. (#1430)
- **~30–80 LOC** — Rewire `emitTable` to use connection-adapter `columnSpec` / `prepareColumnOptions`. Unblocks `test_schema_dumping` and adapter-specific column quirks (enum/array). (#1430)
- **~50–100 LOC** — Harmonize `PostgreSQLAdapter.createTable` signature with abstract base; delete `SimpleTableBuilder`. Touches `range.test.ts:297` + `invertible-migration.test.ts:41` callers. Leading comment at `postgresql-adapter.ts:2749` already flags this. (#1430)

### From #1431 post-pr — pg interval

- **~30–80 LOC** — Interval **row-read** deserialization. Wire interval column values through `Interval.castValue` in attribute-set materialization or postgresql/oid result deserialization. Unblocks 2 tests (`interval type`, `interval type cast from numeric`). (#1431)
- **~20 LOC** — `extractValueFromDefault` for interval — route interval defaults through `Interval#typeCastForSchema` in `postgresql/schema-statements.ts` + schema-dumper column-default rendering. Unblocks `schema dump with default value`. (#1431)
- **~30 LOC** — Aggregate result type-cast — wire `typeForAttribute` through aggregate-result coercion in `calculations.ts`. Unblocks `average interval type`. Benefits more than just interval. (#1431)

### From #1432 post-pr — pg datatype

- **~5 LOC** — PG interval binary-format parser: explicit delegation to `pg.types.getTypeParser(1186, "binary")` or document the text-only assumption. (#1432)
- **~10 LOC** — Register **other PG-only types** (`Hstore`, `Jsonb`, `Money`, `Inet`, `Cidr`, `Macaddr`, `Bit`, `BitVarying`, `Xml`, `Point`, `Uuid`) on AM `typeRegistry` the same way `Interval` was registered. Without this, `attribute :col, :hstore` etc. throw `Unknown type` on PG models. Likely unblocks Rails-mirror tests in per-type files. (#1432)
- **~10 LOC** — Lift `columnForAttribute` schema-vs-attribute distinction into JSDoc on `model-schema.ts:493` (Copilot concern). (#1432)

### From #1433 post-pr — pg uuid

- **~20 LOC** — Emit non-PK column `defaultFunction` as `default: () => "fn()"` in `emitTable`, mirroring the PK path. Unblocks function-default round-tripping for all non-PK columns (`gen_random_uuid`, `now`, `CURRENT_TIMESTAMP`). (#1433)
- **~30 LOC** — Make `SchemaDumper.dumpTableSchema(adapter, ...)` instantiate the adapter's `createSchemaDumper()` class rather than the base — lets PG/MySQL/SQLite-specific overrides fire. Then move `primaryKeyTableOptions` to PG subclass per Rails layout. (#1433)
- **~40 LOC** — Harmonize `PostgreSQLAdapter.createTable` callback-first signature with abstract `SchemaStatements.createTable` (options-first + optional fn). Removes `@ts-expect-error TS2416` and lets `default` option flow. (#1433)

### From #1435 post-pr — mysql-warnings

- **~15 LOC** — `SQLWarning.connectionPool` field + plumb `this.pool` through `_handleWarningsOn`; add `error.connectionPool === adapter.pool` assertion to the `:raise` test once `Mysql2Adapter#pool` is stable. (#1435)
- **~30 LOC** — Mirror `_handleWarningsOn` onto `TrilogyAdapter` once Trilogy execute path is live. Driver-row-shape may differ. (#1435)
- **~10 LOC** — Optimization — Rails reads `@raw_connection.warning_count` directly (mysql2 exposes it as a method); the mysql2 npm driver may expose this via `conn.serverStatus` or protocol packet. Avoids one round-trip per non-ignore query. (#1435)
- **~20 LOC** — Fold `_handleWarningsOn` into `AbstractMysqlAdapter._handleWarnings(sql)` driven by an abstract `_currentConn()` accessor once Mysql2 `perform_query` is ported per Rails layout. (#1435)

### From #1436 post-pr — pg-adapter Slot C

- **~50 LOC** — Railtie initializer constructing a default `ErrorReporter`, wiring a basic logger subscriber, calling `setErrorReporter()`. Closes the "Rails.error always exists" gap. (#1436)
- **~60 LOC** — Collapse `splitPgDefault` into `extractValueFromDefault` + `extractDefaultFunction` so parsing lives in the Rails-named instance methods. Update both call sites in `newColumnFromField` (~lines 2671 + 4310). (#1436)
- **~30 LOC** — Apply `:report` dispatch wiring to MySQL/SQLite `db_warnings_action` paths if/when they grow one. Today only PG honors `db_warnings_action`. (#1436)

### From #1452 post-pr — PG json bypass

- **~5 LOC** — Add a model-save round-trip test for TEXT columns with backslash values (e.g. `"a\\b"`) to exercise the Arel **inline-quoting** path (not the bind-param path). The #1452 regression test uses `executeMutation` (bind params) which doesn't touch `quote()`. The expanded scope of #1452 fixed a pre-existing backslash bug in PG `quote()` that had zero test coverage. (#1452)
- **~5 LOC** — `abstractQuote` Symbol branch still doubles backslashes without E-string. Zero practical impact (no Symbol description in AR carries `\`) but inconsistent with the String branch fix in #1452. (#1452)
- **Architectural observation, not a followup** — Rails always uses bind parameters for INSERT/UPDATE values; never inline-quotes via `quote_string`. Our Arel visitor inlines via `quote()`, which is why the E-string fix in #1452 was load-bearing rather than redundant. If we ever wire bind-param extraction (`compileWithBinds`) into the model save path, the PG E-string passthrough becomes a redundant safety net. Note for whoever does that wiring.

### From #1453 post-pr — query-cache Phase 1

- **~30 LOC (Phase 2)** — `_threadQueryCaches` eviction. Map keyed by monotonically-increasing context IDs grows unboundedly in long-lived processes (daemons). Three options: (a) `withExecutionContext` try/finally calls `_cacheConfig.deleteStore(id)`; (b) store the `Store` directly in AsyncLocalStorage instead of a global Map; (c) bounded LRU cap. Decision needed on which fits the `activesupport/async-context-adapter` model. (#1453)
- **~10 LOC (Phase 2)** — `DatabaseConfig.queryCacheMaxSize` wiring. `ConnectionPoolConfiguration` constructor accepts the param but `ConnectionPool` passes no argument (defaults to 100). Thread `dbConfig.queryCacheMaxSize` through `PoolConfig` → `ConnectionPool` constructor. (#1453)
- **~20 LOC (Phase 3)** — `enableQueryCacheBang`/`disableQueryCacheBang` at checkout/checkin. Rails propagates pool-level enable/disable state to connections at checkout; today the pool never calls these. Store's `enabled` flag stays false until user code explicitly enables. (#1453)
- **~20 LOC (Phase 3)** — `withQueryCache(fn)` public API on `ConnectionPool`. Wraps `enableQueryCacheBang` / fn / finally `disableQueryCacheBang + clearQueryCache`. (#1453)
- **~40 LOC (Phase 4)** — `QueryCache.installExecutorHooks` middleware path. Wires `ExecutorHooks` to enable/disable around each request. Requires `ConnectionHandler` wiring (PR 6 prerequisite). Unblocks 6 pool-attachment tests. (#1453)
- **Rails divergences (deliberate, more correct under concurrency)** — `_pinnedCount` integer instead of single-reference `@pinned_connection` (Rails uses thread-local single ref); `_queryCacheVersion` shared across contexts (Rails per-thread). Both are safe-over-strict because our `ConnectionPoolConfiguration` is shared across async contexts where Rails' is per-thread via `IsolatedExecutionState`. Documented for future code archaeology. (#1453)
- **~5 LOC cleanup** — Two redundant `checkoutAndVerify` paths: `ConnectionPoolConfiguration.checkoutAndVerify` (instance method, superseded by direct assigns in `checkout()`/`checkoutAsync()`) and module-level `checkoutAndVerify` (reachable only via `tryToCheckoutNewConnection`, harmless). Decision: remove or wire to canonical path. (#1453)

### From #1449 post-pr — Column#default lazy-deserialize

- **~100–200 LOC (test-infra, not impl)** — Fixture-table infra to unblock the 13 remaining skipped tests (`MysqlDefaultExpressionTest` ×9, `DefaultsTestWithoutTransactionalFixtures` ×2, `PostgresqlDefaultExpressionTest` ×1, `Sqlite3DefaultExpressionTest` ×1). Need a harness mechanism to seed pre-existing fixture tables (`defaults`, `datetime_defaults`, `timestamp_defaults`) analogous to Rails' `fixtures/` directory. Test-infra story, not implementation. (#1449)
- **~30 LOC** — Promote `sqlType` from optional on `Column` (abstract schema-dumper) to the `ColumnInfo` base interface. It's universally present across all three adapters; the optional declaration is a vestige of the partial migration. (#1449)
- **Architectural fix shipped, not a followup** — `Column#default lazy-deserialize` was moved from the deferred Architectural section into shipped scope by #1449. The "broad blast radius" framing was overstated — the fix turned out to be two touch points (`BaseSchemaDumper.schemaDefault` deserialize-through-adapter + `model-schema.applyColumnsHash` cast) with no `Column` / `lookupCastType` / `newColumnFromField` changes needed.

### From #1446/#1447/#1448 post-pr — recent sweep

- **~5 LOC** — `typeCastedBinds` in `abstract/quoting.ts:~490` duplicates the one in `abstract/database-statements.ts` and still uses the old `typeof b.valueForDatabase === "function"` check. Unify to the getter-aware `"valueForDatabase" in b` form. Low risk — different call paths. (#1446)
- **~50–100 LOC (architectural-ish)** — `TableDefinition.toSql()` in `abstract/schema-definitions.ts:~926-1095` still branches on `_adapterName` for type SQL (SERIAL vs BIGINT AUTO_INCREMENT, BYTEA vs BLOB, etc.). Largely redundant with `SchemaCreation.typeToSql()` + `SchemaCreation.visitTableDefinition()` which are more complete. Route through `SchemaCreation.accept()` and delete `toSql()` to complete the polymorphic-dispatch cleanup. (#1447)
- **~15 LOC (Rails divergence, pre-existing)** — `_buildInitSql` in `mysql2-adapter.ts` omits the `NAMES #{encoding} COLLATE #{collation}` prepend that Rails' `configure_connection` (abstract_mysql_adapter.rb:947-951) emits when `@config[:encoding]` is set. `variables.encoding` from `database.yml` is silently ignored. (#1448)
- **CI investigation needed (not sized)** — `Received unexpected commandComplete message from backend` flake fired on a client with `_poolUseCount: 3256`. Pre-existing pg pool teardown race when the pool closes while a server-side response is in transit. Worth dedicated investigation if it recurs. (#1446)

### From #1444 post-pr — PG UUID Slot C

- **~30 LOC (Rails divergence + latent bug)** — `caseInsensitiveComparison` is async on PG (queries `pg_proc`) but `UniquenessValidator.buildRelation` is sync, so #1444 moved the UUID bypass into `buildRelation`. **Concrete consequence:** for any non-string non-UUID column type where `canPerformCaseInsensitiveComparisonFor` returns false (custom types with no `lower()` overload), `buildRelation` currently passes a `Promise` to `base.where()`, throwing `ArgumentError: Unsupported argument type`. UUID is fixed; other types are latent. Fix options: (a) make `buildRelation` async and await; (b) expose a sync `canPerformCaseInsensitiveComparisonForSync` on the adapter seeded with known-false types (citext already cached). (#1444)
- **~10–30 LOC audit** — `typeObj?.type` was caught as a CI bug post-open (`Uuid.type` is a method, not a property — returned the function instead of `"uuid"`). Audit other `.type` reads off type objects across the codebase for the same mistake class. Candidate for fidelity-sweep. (#1444)

### From #1442 post-pr — MySQL quoting Slot A

- **~20 LOC (Rails divergence)** — Standalone module function `quoteString` in `connection-adapters/mysql/quoting.ts:88` still uses SQL-standard `''` doubling. Rails' `MySQL::Quoting#quote_string` (instance) **and** the `quote()` path both use backslash-escape. **Concrete consequence:** `adapter.quote("it's")` returns `'it''s'` (doubling) while `adapter.quoteString("it's")` returns the fixed backslash form — same adapter, two different outputs. Fix: update standalone `quoteString` to backslash-escape, route `quote()` in `abstract-mysql-adapter.ts` through `this.quoteString()` instead of `mysqlQuote()`, update test at `mysql/quoting.test.ts:36`. DDL COMMENT call sites (`abstract-mysql-adapter.ts:578, 1319`) want the full wrapping literal — correct as-is. (#1442)

### From #1434 review — autosave Slot B (Rails divergences, max-cycles deferred)

- **~3 LOC (Rails divergence)** — `base.ts` `save()` captures `prev = _newRecordBeforeSave` and restores in `finally`, but unconditionally overwrites with `wasNewRecord`. Rails' `aroundSaveCollectionAssociation` uses `prev = @new_record_before_save ||= false; @new_record_before_save = !prev && new_record?` — once true, stays true through nested saves. **Concrete consequence:** during re-entrant/nested saves on the same record (e.g. callback chain that re-enters `save` on the parent), the inner autosave dispatch in `_insertCollectionRecord` can incorrectly treat association writes as **updates** (via `record.save(validate:false)`) when the outer scope already marked the parent as new — meaning a fresh insert path (`Association.insertRecord(record, false)` + `setInverseInstance` + counter-cache increment) is skipped. Fix: change `_newRecordBeforeSave = wasNewRecord` to `_newRecordBeforeSave = !prev && wasNewRecord` in `save()`. (#1434 Copilot review #9)
- **~5 LOC** — `HasManyThroughAssociation#insertRecord(record, validate, raise)` doesn't propagate `validate`/`raise` to the join-record save. Join is saved via `joinRecord.save()` with default options. Diverges from target record save (which honors `validate`) and from Rails bang/non-bang behavior. Fix: pass `validate`; use `saveBang` when `raise` is true. (#1434 Copilot review #10)
- **Process note** — #1434 scope drifted mid-review: `HasManyThroughAssociation#insertRecord` override originally out-of-scope, included after maintainer rejected the gating workaround. Honest fix mirrored Rails `has_many_through_association.rb:24-34`. Total size still under budget. Documented in PR body. (#1434)

### From #1439 post-pr — PG connection Slot A

- **~10 LOC** — `statement_name` in `sql.active_record` payload for PG prepared-statement path (`_runQuery` / `execQuery` with `prepare: true`). Unblocks "statement key is logged" test. (#1439)
- **~30 LOC** — `prepare: false` with binds — needs `QueryAttribute`-style bind objects with a `prepare: false` exec path wired through `execQuery`. Unblocks `prepare false with binds` test. (#1439)
- **~3 LOC** — `tableAliasLength()` override on `PostgreSQLAdapter` returning `this.maxIdentifierLength()`. Blocked by base-class sync `number` return — would widen to `Promise<number> | number`. (#1439)
- **Test-infra refactor** — Move `SQLSubscriber` from `adapters/postgresql/test-helper.ts` to a shared location when `adapters/abstract-mysql-adapter/connection.test.ts` is un-skipped (Rails defines it on `ActiveRecord::TestCase`). (#1439)

### From #1443 post-pr — SQLite Slot A

- **~5 LOC** — Add `strict` field to `SqliteOpenConfig` in `activesupport/src/sqlite-adapter.ts`. Documents intent for future drivers (e.g. `node:sqlite`) that expose `sqlite3_db_config`. (#1443)
- **~20 LOC** — better-sqlite3 DQS toggle: when upstream exposes `sqlite3_db_config`, pass `strict` through `Database.Options` in `sqlite-drivers/better-sqlite3.ts:openDatabase`. Then the `configureConnection` pragma block (currently silently ignored) can be removed. (#1443)
- **Known limitation** — `strict_strings_by_default` is a no-op in current driver: better-sqlite3 compiles with `SQLITE_DQS=0`, so DQS is always off and `assert_nothing_raised` (non-strict accepts index on missing column) cannot be exercised. Documented inline. (#1443)

### From #1437 post-pr — api:compare → 100% restoration

- **Process improvement** — `_`-prefix renames on Rails-named methods silently drop them from `api:compare` surface. Consider extending the `rails-private-jsdoc` ESLint rule to flag `_`-prefixed methods whose Rails counterpart is non-underscored. Permanent guardrail against the regression class. (#1437)

### Closed in recent sweeps

- **Closed via fidelity-sweep A (#1421):** `MigrationLike#up/down` adapter arg, `lookupCastTypeFromJoinDependencies` type, PG `as number` casts, schema-qualified FROM regex, `_compileSelectSql`/visitor consolidation, `_mapTimeWithZoneToUtc` helper, `PostgreSQLWithBinds.visitArelNodesCasted` resolveValueForDatabase, `roles.ts` WRITING_ROLE/READING_ROLE wiring, `restoreTransactionRecordState` PK-write guard (partial — see new ~50 LOC item above), `SavepointTransaction`/`RestartParentTransaction` → `TransactionIsolationError`, `ForeignKeyDefinition#isExportNameOnSchemaDump` wired in schema-dumper, `reconnection_error` test, item-count header sync, ~15 others.
- **Closed via fidelity-sweep B (#1422):** tsrange/tstzrange array tests, i18n `record_invalid` namespace, validation test bodies, mixin_test ports, phantom test deletions, `compressIfWorthIt` UTF-8 byte-count.
- **Closed via #1408 / #1423 / #1424:** `_performInsert` block, `_storeAccessorsModules` WeakMap, MySQL non-CT function defaults, `databaseTypeToText` serialized branch + `Serialized.isBinary` delegation, `assertEncryptedAttribute` round-trip (dropped), `InsertAll.uniqueIndexes` async fix (#1423), `SchemaStatements.dropTable` CASCADE PG override (#1424).
- **Closed via #1437 api:compare restoration:** `_findUniqueIndexFor`/`_uniqueIndexes`/`_uniqueByColumns` underscore prefixes dropped (restore Rails surface names); `encodeRange` named export restored in `pg/quoting.ts`.
- **Stale items removed in #1419 review (Copilot caught):** `addUniqueConstraint`/`removeUniqueConstraint` adapter methods (already implemented in PG with passing tests); `caseInsensitiveComparison` async runtime-bug (hypothetical only — base sync + no PG override).

---

## Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous. (#1406)
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage. Plumbing landed in #1406; refresh itself open.
- **~30 LOC** — `postgresql/temporal-type-parsers.ts` still has one eager `import pg from "pg"` (the last per `browser-compat-plan.md`). Move to lazy registry. Blocks browser-bundle smoke tests.

---

## Test:compare audits queued (read-only research)

**Audit queue closed** — every test:compare audit task filed during this initiative has been delivered (see `git log` for the audit-cluster slot citations and triage history). Remaining work is impl-execution against the 14 audit clusters now in `activerecord-100-clusters.md`.

---

## Architectural (deferred; too big for single ~250-LOC slot)

- ~~**Column#default lazy-deserialize broader refactor**~~ — **shipped via #1449.** Fix turned out to be two touch points (`BaseSchemaDumper.schemaDefault` + `model-schema.applyColumnsHash`), not a Column rewrite. 4 of 17 tests unblocked; 13 still fixture-blocked (see fidelity followups).
- ~~**PG `json` driver-level cast bypass**~~ — **shipped via #1452.** ~25 LOC, not the originally-sized 80 — the design pass narrowed it to 2 lines in the existing `getTypeParser` closure. As a bonus, the agent caught and fixed a pre-existing PG `quote()` E-string backslash bug.
- **Connection-pool / per-thread query-cache architecture** (~780 LOC across 4 phases). Phase 1 shipped via #1453 (context-keyed registry + pin wiring). Phases 2-4 queued — see fidelity followups. ~10 actionable test unskips (4 db_config + 6 pool-attachment); other 4 are permanent (GVL/fork/thread skips).

### Other deferred (need wider design)

- `_aliasTracker` real semantics on `JoinDependency#joinConstraints`. (#1386)
- Multirange OID direct lookup via `LEFT JOIN pg_range` — blocked on PG12/13 compat decision. (#1385)
- `encodeRangeLiteral` ↔ `RangeType.encodeLiteral` consolidation into `range.ts` helper. (#1385)

---

## Infra-blocked (not actionable until prereq lands)

- `vi.stubEnv("TZ")` + Temporal test-infra gap.
- Task/Topic fixture models — multiple tests need real models wired to a DB.
- `_queryBySql` opts wiring — pending prepared-statement infrastructure.
- `insertAllBang` / `upsertAll` — separate features.
- HABTM cache invalidation — query-cache Gap 6 depends on HABTM impl.
- `resetColumnInformation` — query-cache Gap 4 depends.

---

## Story count

Cluster details in [`activerecord-100-clusters.md`](activerecord-100-clusters.md).

| Group                                                   | Open | LOC est.            |
| ------------------------------------------------------- | ---- | ------------------- |
| In flight                                               | 0    | —                   |
| Encryption cluster (all 3 slots closed)                 | 0    | —                   |
| Serialization cluster                                   | 1    | ~70                 |
| Relation cluster                                        | 7    | ~1660               |
| Associations-core cluster                               | 5    | ~910                |
| Associations-HABTM cluster                              | 9    | ~1690               |
| Associations has-many-through cluster                   | 5    | ~1280               |
| Associations has-one cluster                            | 4    | ~480                |
| Migration cluster                                       | 6    | ~1210               |
| Connection-pool cluster                                 | 3    | ~640                |
| MySQL active-schema cluster                             | 3    | ~680                |
| MySQL mysql2-adapter cluster                            | 3    | ~700                |
| MySQL warnings cluster (A closed #1435)                 | 0    | —                   |
| MySQL schema cluster                                    | 3    | ~400                |
| MySQL quoting cluster                                   | 1    | ~120                |
| MySQL table-options cluster                             | 2    | ~480                |
| MySQL charset-collation cluster                         | 3    | ~315                |
| MySQL onUpdate followups                                | 2    | ~30                 |
| SQLite adapter cluster                                  | 2    | ~120                |
| PG-adapter cluster (B+C+D closed; A+E open)             | 2    | ~340                |
| PG-schema audit cluster                                 | 3    | ~530                |
| PG infinity cluster (A closed #1427)                    | 0    | —                   |
| PG foreign-table cluster (A closed #1429)               | 0    | —                   |
| PG virtual-column cluster (A closed #1430)              | 1    | ~250                |
| PG datatype cluster (A closed #1432)                    | 0    | —                   |
| PG interval cluster (A closed #1431; B open)            | 1    | ~180                |
| PG UUID residual cluster (A closed #1433)               | 2    | ~330                |
| PG connection cluster                                   | 5    | ~290                |
| PG long-tail cluster                                    | 8    | ~1760               |
| Schema cluster (A+B closed)                             | 7    | ~1390               |
| Transactions cluster (A closed #1417)                   | 3    | ~350                |
| Unknown-triage cluster                                  | 4    | ~640                |
| STI annotation-drift                                    | 1    | ~20                 |
| Associations-autosave cluster (A #1426, B #1434 closed) | 4    | ~940                |
| Associations-reflection cluster (B closed #1428)        | 4    | ~780                |
| NotImplementedError elimination (Phase 2)               | 7    | ~610                |
| `as any` legacy-cast cleanup sweep                      | 1    | ~250                |
| Post-merge fidelity followups                           | 78   | ~1675               |
| Doc-hygiene + infra followups                           | 3    | ~30                 |
| Test:compare audits queued                              | 0    | n/a (all delivered) |
| Architectural deferred                                  | 3    | ~410                |
| Infra-blocked                                           | 6    | n/a                 |

**~109 actionable work-PR slots + 0 queued audits**, ~19.7k LOC. P0 fully shipped (#1426–#1437; ~60 un-skips); audit-encryption / pg-foreign-table / pg-infinity / pg-virtual-column / pg-datatype / pg-uuid-residual / mysql-warnings clusters all closed or in-flight on Slot A. Headline P0 yield: **27 un-skips wave 1 + 33 more wave 2** plus autosave A's foundational unblock for autosave B–F.

The two `as any` audits (delivered 2026-05-12) found **zero new critical bugs** post-#1423 — the optional-chain audit returned `0 bug-suspected` and the method-call audit returned `2 bug-suspected` (folded into post-merge fidelity followups above for surgical verification). The high-leverage opportunity is **Sweep B from audit-as-any-method-calls**: ~250 LOC mechanical removal of 52 legacy-cast-removable instance-method casts on `Base` (`(record as any)._readAttribute`, `.save`, `.destroy`, etc. — TS types already declare these). The optional-chain audit's ~110 `legacy-removable` sites are dependent on the same `Base` host-interface tightening; can be folded into the same sweep or land second.

---

## Permanent guardrails

### Dual-registry watchpoint

When both a `Base.<X>` static field AND a `<x>.ts` module-level `WeakMap`/`Map` exist for the same concern, treat it as a bug. The live API writes one; helpers read the other; silently. PR #1307 closed `Base._storedAttributes` vs `store.ts:_storedAttributes`. Audit:

```bash
grep -rn "new WeakMap<typeof Base\|new Map<.*Base" packages/activerecord/src
```

### Unported-files gate (Step 0 for auditors)

Before proposing implementation slots, every audit MUST consult `scripts/api-compare/unported-files.ts`. If any source in scope appears in `UNPORTED_FILES` (by `pattern` or `testFile`), propose **exclusion**, not implementation. This rule exists because audit-load-async proposed a 4-slot ~640-LOC plan for `FutureResult` / `Promise` / `AsynchronousQueriesTracker` — all three unported. The patch lives in the audit-prompt-template; new audit spawns get the fresh template.

### Test:compare workflow

Test:compare un-skip work uses [`test-compare-100-plan.md`](test-compare-100-plan.md) + `$HOME/github/blazetrailsdev/test-compare-prompt-template.md`. Audits live as task files in `$HOME/.btwhooks/data/github/blazetrailsdev/trails/todo/` and submit via `/audit-report <slug>` — no PR.

### Spawned-agent constraints

The `prompt-agent` skill auto-appends a "do not delegate / do not recursively spawn sub-agents" footer to every prompt it dispatches. Workers do their own work; oversized tasks split via PR-body follow-ups.

### Future infra (deferred)

- ESLint rule for `_`-prefixed params on Rails-mirroring methods.
- `lint:deps` activesupport rule → blocking once missing migrations land.
- api:compare param-name set comparison.
- `deprecator` / `gemVersion` / `version` removed from main bundle barrel (#1317); only via `@blazetrails/activerecord/deprecator` subpath.
