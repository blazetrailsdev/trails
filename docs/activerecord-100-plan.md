# ActiveRecord API Parity Plan: 100% closed → post-100% Rails-fidelity stories

**Snapshot 2026-05-12:** `activerecord 4969/4969 methods (100%) | files: 275/275 | inheritance: 209/209 (100%) | activemodel 625/625 (100%)`.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. Each PR targets ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

This doc is the **live work tracker** (post-merge followups, story count, guardrails). For per-cluster slot detail, see [`activerecord-100-clusters.md`](activerecord-100-clusters.md). For workflow + BLOCKED-annotation vocab + audit conventions, see [`test-compare-100-plan.md`](test-compare-100-plan.md).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`. This doc lists only **open work**.

---

## Post-merge fidelity followups (~1675 LOC)

Small Rails-fidelity polish from PR reviews. Subsections group items by topic.

### Deferred from sweep B

- **~50 LOC** — `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block via a module-level `_defaultSqlTimezoneOverride` + `withEnvTimezone(zone, fn)` test helper). Unblocks 2 base.test.ts tests.
- **~10 LOC** — `HashAccessor.write` json-branch regression test (path is correct today; needs a defensive test).
- **~30 LOC** — Wire `tableOptions()` into `schema-dumper.ts:emitTable`. Requires making the dump loop async; overlaps pg-schema Slot B / Schema Slot E.
- **~30 LOC** — `MessageSerializer.encodeIfNeeded` double-base64 fix. **Architectural**: requires `Aes256Gcm` to store raw bytes (not base64 strings) in headers — a _breaking change_ for existing stored ciphertexts. Only ship with a migration path.

### Reverted from sweep A

- **~5 LOC** — Remove `RangeType.encodeLiteral` pre-serialization workaround. Reverted: still load-bearing — removing it broke `range.test.ts > where by attribute with range` (PG `42883: No operator matches`). Real fix needs BindParam range-quoting (next item).
- **~20 LOC** — Fix the BindParam route for range WHERE predicates so range values quote correctly. Unblocks the `RangeType.encodeLiteral` removal.
- **~30 LOC** — `validateForeignKey` `!fSchema → public` heuristic. Reverted: the `pg_namespace` join diverged from Rails (which uses `t2.oid::regclass::text` + `search_path`). Original fragility concern remains for non-public-schema FKs on search_path. Needs a different schema-resolution strategy.

### Test residuals

- **~20 LOC** — `reconnect after bad connection on check version` test: pg-npm pool has no single-connection version-stub hook. Needs `_databaseVersionForTest()` setter or injectable version-check hook. (`translate no connection exception to not established` is now confirmed redundant — 57P01 covered by `reconnection_error` fake-pool injection.)

### Transactions

- **~50 LOC** — Dirty-tracking for new-record rollback: `topic.changes["title"]` returns `undefined` instead of `[null, "Jeff"]` after rollback. Root cause deeper than sweep A's guard fix — `state.attributes` snapshot in `rememberTransactionRecordState` captures user-written values, so `redetectChanges` produces no diff. Fix: snapshot _DB-original_ values (null for unsaved new records), or add separate DB-original tracking.

### Schema dumper

- **~30 LOC** — `SchemaDumper.fkIgnorePattern` configurability vs `ForeignKeyDefinition.isExportNameOnSchemaDump` hardcoded `fk_rails_` pattern. Either (a) make `isExportNameOnSchemaDump` accept the configured pattern, restoring `fkIgnorePattern` functionality; or (b) deprecate `fkIgnorePattern` since FK now owns the decision (Rails-faithful).

### Insert-all polish

- **~30 LOC** — Add `supportsInsertConflictTarget()` to `DatabaseAdapter` interface + impls (true for sqlite≥3.24, pg, mysql≥8). Wire Rails' guard in `_findUniqueIndexFor` so unsupported adapters raise the proper `ArgumentError` rather than falling through to "No unique index found".
- **~50 LOC** — Thin `IndexDefinition` value class in `connection-adapters/`. Mutate `this.uniqueBy` to it in constructor (post-await in `_populateUpdatableColumns`). Unlocks `ON CONSTRAINT <name>` for PG.
- **~10 LOC** — Add `model.adapter.schemaCacheBound` returning a pool-bound one-arg `indexes(tableName)` form so call sites don't know about the pool. The two-arg signature was the footgun this PR hit.

### PG schema-statements

- **~30 LOC** — Rewire PG mixin chain so `PostgreSQLAdapter#dropTable` delegate can be deleted. Add per-adapter `include(PostgreSQLAdapter, ...)` for PG-specific schema-statements methods. Mirrors Rails' `include PostgreSQL::SchemaStatements`.
- **~50 LOC** — Live PG integration test for `dropTable("parent", { force: "cascade" })` end-to-end. Current tests use a fake adapter.

### `as any` audit

- **~10–20 LOC** — Verify 2 `bug-suspected` candidates from the as-any audit: `relation.ts:4965` `(this.spawn() as any).asyncBang()` (possible swallowed promise) + `abstract/database-statements.ts:1827` `(relation as any).arel()` (verify sync on every host). If real, surgical fixes.

### Autosave A

- **~50 LOC** — Preloader → `associationInstanceSet` migration. Update the ~14 map-direct write sites (preloader/association.ts, preloader/batch.ts, relation.ts:2149-2161, 6 sites in associations.ts) to call `record.associationInstanceSet(name, association)`. Once done, `_loadedAssociation` collapses to a one-line Rails-shaped pure read.
- **~30 LOC** — Wire `custom_validation_context?` branch into `validateHasOneAssociation` / `validateBelongsToAssociation`. Rails autosave_association.rb:332/346.

### PG infinity

- **~40 LOC** — Arel range-bound serialization for `Float::INFINITY` endpoints. Unblocks 2 remaining `where clause with infinite range` tests. Likely a `QueryAttribute.serialize` / range visitor change.
- **~80 LOC** — `InTimeZone` test helper + `time_zone_aware_attributes` integration. Unblocks 1 remaining infinity TZ-aware test. Touches `Base.timeZoneAwareAttributes`, `reset_column_information`, TimeZoneConverter wrapping for sentinel values. (may need its own slot)
- **~10 LOC** — MySQL `quote()` non-finite handling (`mysql/quoting.ts:177`). Same bareword bug pg had; no MySQL infinity test surfaced it. Preventive.
- **~5 LOC cleanup** — `persistence.ts:872-880` isDateInfinity branch now too broad post-sentinel-unification; gate on temporal type-name.
- **~5 LOC cleanup** — `temporalToBindString` PG infinity branch may be dead post-PR; trace + delete if confirmed.

### Reflection B

- **~30 LOC** — Wire `ensureOptionNotGivenAsClassBang` into ThroughReflection / source-type validation path (defined but never called today). Unblocks `class for source type` test.
- **~50 LOC** — `static set primaryKey(null)` semantics + `Edge` fixture; un-skip `association primary key raises when missing primary key` + `active record primary key raises when missing primary key`.
- **~15 LOC** — Annotation refresh on 22 remaining `reflection.test.ts` stubs (all carry wrong AggregateReflection/ThroughReflection boilerplate; real causes vary).
- **~30 LOC future** — `NullColumn` class so `assert_instance_of NullColumn` Rails asserts can port verbatim. Duck-compatible shape exists; only matters if porting that specific assertion.

### PG foreign-table

- **~30–80 LOC** — Wire `Base.primaryKey` to consult `adapter.primaryKey(tableName)` for tables without explicit PK (foreign tables). Touches `getPrimaryKeyAttr` `?? "id"` sentinel (distinguish "unset" vs "explicitly nil") + `model-schema.ts` PK auto-detection. Affects all models; careful test pass. Un-skips 1 deferred test.

### PG virtual-column

- **~15–30 LOC** — Route `addColumn` through `schemaCreation.accept(AddColumnDefinition)`; fix `visitColumnDefinition` to call `addColumnOptionsBang` instead of `addColumnOptions`. Unblocks `test_non_persisted_column` + `test_change_table` Rails-parity rewrites.
- **~30–80 LOC** — Rewire `emitTable` to use connection-adapter `columnSpec` / `prepareColumnOptions`. Unblocks `test_schema_dumping` and adapter-specific column quirks (enum/array).
- **~50–100 LOC** — Harmonize `PostgreSQLAdapter.createTable` signature with abstract base; delete `SimpleTableBuilder`. Touches `range.test.ts:297` + `invertible-migration.test.ts:41` callers. Leading comment at `postgresql-adapter.ts:2749` already flags this.

### PG interval

- **~30–80 LOC** — Interval **row-read** deserialization. Wire interval column values through `Interval.castValue` in attribute-set materialization or postgresql/oid result deserialization. Unblocks 2 tests (`interval type`, `interval type cast from numeric`).
- **~20 LOC** — `extractValueFromDefault` for interval — route interval defaults through `Interval#typeCastForSchema` in `postgresql/schema-statements.ts` + schema-dumper column-default rendering. Unblocks `schema dump with default value`.
- **~30 LOC** — Aggregate result type-cast — wire `typeForAttribute` through aggregate-result coercion in `calculations.ts`. Unblocks `average interval type`. Benefits more than just interval.

### PG datatype

- **~5 LOC** — PG interval binary-format parser: explicit delegation to `pg.types.getTypeParser(1186, "binary")` or document the text-only assumption.
- **~10 LOC** — Register **other PG-only types** (`Hstore`, `Jsonb`, `Money`, `Inet`, `Cidr`, `Macaddr`, `Bit`, `BitVarying`, `Xml`, `Point`, `Uuid`) on AM `typeRegistry` the same way `Interval` was registered. Without this, `attribute :col, :hstore` etc. throw `Unknown type` on PG models. Likely unblocks Rails-mirror tests in per-type files.
- **~10 LOC** — Lift `columnForAttribute` schema-vs-attribute distinction into JSDoc on `model-schema.ts:493` (Copilot concern).

### PG UUID

- **~20 LOC** — Emit non-PK column `defaultFunction` as `default: () => "fn()"` in `emitTable`, mirroring the PK path. Unblocks function-default round-tripping for all non-PK columns (`gen_random_uuid`, `now`, `CURRENT_TIMESTAMP`).
- **~30 LOC** — Make `SchemaDumper.dumpTableSchema(adapter, ...)` instantiate the adapter's `createSchemaDumper()` class rather than the base — lets PG/MySQL/SQLite-specific overrides fire. Then move `primaryKeyTableOptions` to PG subclass per Rails layout.
- **~40 LOC** — Harmonize `PostgreSQLAdapter.createTable` callback-first signature with abstract `SchemaStatements.createTable` (options-first + optional fn). Removes `@ts-expect-error TS2416` and lets `default` option flow.

### MySQL warnings

- **~15 LOC** — `SQLWarning.connectionPool` field + plumb `this.pool` through `_handleWarningsOn`; add `error.connectionPool === adapter.pool` assertion to the `:raise` test once `Mysql2Adapter#pool` is stable.
- **~30 LOC** — Mirror `_handleWarningsOn` onto `TrilogyAdapter` once Trilogy execute path is live. Driver-row-shape may differ.
- **~10 LOC** — Optimization — Rails reads `@raw_connection.warning_count` directly (mysql2 exposes it as a method); the mysql2 npm driver may expose this via `conn.serverStatus` or protocol packet. Avoids one round-trip per non-ignore query.
- **~20 LOC** — Fold `_handleWarningsOn` into `AbstractMysqlAdapter._handleWarnings(sql)` driven by an abstract `_currentConn()` accessor once Mysql2 `perform_query` is ported per Rails layout.

### PG-adapter Slot C

- **~50 LOC** — Railtie initializer constructing a default `ErrorReporter`, wiring a basic logger subscriber, calling `setErrorReporter()`. Closes the "Rails.error always exists" gap.
- **~60 LOC** — Collapse `splitPgDefault` into `extractValueFromDefault` + `extractDefaultFunction` so parsing lives in the Rails-named instance methods. Update both call sites in `newColumnFromField` (~lines 2671 + 4310).
- **~30 LOC** — Apply `:report` dispatch wiring to MySQL/SQLite `db_warnings_action` paths if/when they grow one. Today only PG honors `db_warnings_action`.

### PG json bypass

- **~5 LOC** — Add a model-save round-trip test for TEXT columns with backslash values (e.g. `"a\\b"`) to exercise the Arel **inline-quoting** path (not the bind-param path). The regression test uses `executeMutation` (bind params) which doesn't touch `quote()`. The expanded scope of fixed a pre-existing backslash bug in PG `quote()` that had zero test coverage.
- **~5 LOC** — `abstractQuote` Symbol branch still doubles backslashes without E-string. Zero practical impact (no Symbol description in AR carries `\`) but inconsistent with the String branch fix.

### Query-cache Phases 2–4

- **~30 LOC (Phase 2)** — `_threadQueryCaches` eviction. Map keyed by monotonically-increasing context IDs grows unboundedly in long-lived processes (daemons). Three options: (a) `withExecutionContext` try/finally calls `_cacheConfig.deleteStore(id)`; (b) store the `Store` directly in AsyncLocalStorage instead of a global Map; (c) bounded LRU cap. Decision needed on which fits the `activesupport/async-context-adapter` model.
- **~10 LOC (Phase 2)** — `DatabaseConfig.queryCacheMaxSize` wiring. `ConnectionPoolConfiguration` constructor accepts the param but `ConnectionPool` passes no argument (defaults to 100). Thread `dbConfig.queryCacheMaxSize` through `PoolConfig` → `ConnectionPool` constructor.
- **~20 LOC (Phase 3)** — `enableQueryCacheBang`/`disableQueryCacheBang` at checkout/checkin. Rails propagates pool-level enable/disable state to connections at checkout; today the pool never calls these. Store's `enabled` flag stays false until user code explicitly enables.
- **~20 LOC (Phase 3)** — `withQueryCache(fn)` public API on `ConnectionPool`. Wraps `enableQueryCacheBang` / fn / finally `disableQueryCacheBang + clearQueryCache`.
- **~40 LOC (Phase 4)** — `QueryCache.installExecutorHooks` middleware path. Wires `ExecutorHooks` to enable/disable around each request. Requires `ConnectionHandler` wiring (PR 6 prerequisite). Unblocks 6 pool-attachment tests.
- **~5 LOC cleanup** — Two redundant `checkoutAndVerify` paths: `ConnectionPoolConfiguration.checkoutAndVerify` (instance method, superseded by direct assigns in `checkout()`/`checkoutAsync()`) and module-level `checkoutAndVerify` (reachable only via `tryToCheckoutNewConnection`, harmless). Decision: remove or wire to canonical path.

### Column#default lazy-deserialize

- **~100–200 LOC (test-infra, not impl)** — Fixture-table infra to unblock the 13 remaining skipped tests (`MysqlDefaultExpressionTest` ×9, `DefaultsTestWithoutTransactionalFixtures` ×2, `PostgresqlDefaultExpressionTest` ×1, `Sqlite3DefaultExpressionTest` ×1). Need a harness mechanism to seed pre-existing fixture tables (`defaults`, `datetime_defaults`, `timestamp_defaults`) analogous to Rails' `fixtures/` directory. Test-infra story, not implementation.
- **~30 LOC** — Promote `sqlType` from optional on `Column` (abstract schema-dumper) to the `ColumnInfo` base interface. It's universally present across all three adapters; the optional declaration is a vestige of the partial migration.

### Recent sweep

- **~5 LOC** — `typeCastedBinds` in `abstract/quoting.ts:~490` duplicates the one in `abstract/database-statements.ts` and still uses the old `typeof b.valueForDatabase === "function"` check. Unify to the getter-aware `"valueForDatabase" in b` form. Low risk — different call paths.
- **~50–100 LOC (architectural-ish)** — `TableDefinition.toSql()` in `abstract/schema-definitions.ts:~926-1095` still branches on `_adapterName` for type SQL (SERIAL vs BIGINT AUTO_INCREMENT, BYTEA vs BLOB, etc.). Largely redundant with `SchemaCreation.typeToSql()` + `SchemaCreation.visitTableDefinition()` which are more complete. Route through `SchemaCreation.accept()` and delete `toSql()` to complete the polymorphic-dispatch cleanup.
- **~15 LOC (Rails divergence, pre-existing)** — `_buildInitSql` in `mysql2-adapter.ts` omits the `NAMES #{encoding} COLLATE #{collation}` prepend that Rails' `configure_connection` (abstract_mysql_adapter.rb:947-951) emits when `@config[:encoding]` is set. `variables.encoding` from `database.yml` is silently ignored.
- **CI investigation needed (not sized)** — `Received unexpected commandComplete message from backend` flake fired on a client with `_poolUseCount: 3256`. Pre-existing pg pool teardown race when the pool closes while a server-side response is in transit. Worth dedicated investigation if it recurs.

### PG UUID Slot C

- **~30 LOC (Rails divergence + latent bug)** — `caseInsensitiveComparison` is async on PG (queries `pg_proc`) but `UniquenessValidator.buildRelation` is sync, so moved the UUID bypass into `buildRelation`. **Concrete consequence:** for any non-string non-UUID column type where `canPerformCaseInsensitiveComparisonFor` returns false (custom types with no `lower()` overload), `buildRelation` currently passes a `Promise` to `base.where()`, throwing `ArgumentError: Unsupported argument type`. UUID is fixed; other types are latent. Fix options: (a) make `buildRelation` async and await; (b) expose a sync `canPerformCaseInsensitiveComparisonForSync` on the adapter seeded with known-false types (citext already cached).
- **~10–30 LOC audit** — `typeObj?.type` was caught as a CI bug post-open (`Uuid.type` is a method, not a property — returned the function instead of `"uuid"`). Audit other `.type` reads off type objects across the codebase for the same mistake class. Candidate for fidelity-sweep.

### MySQL quoting

- **~20 LOC (Rails divergence)** — Standalone module function `quoteString` in `connection-adapters/mysql/quoting.ts:88` still uses SQL-standard `''` doubling. Rails' `MySQL::Quoting#quote_string` (instance) **and** the `quote()` path both use backslash-escape. **Concrete consequence:** `adapter.quote("it's")` returns `'it''s'` (doubling) while `adapter.quoteString("it's")` returns the fixed backslash form — same adapter, two different outputs. Fix: update standalone `quoteString` to backslash-escape, route `quote()` in `abstract-mysql-adapter.ts` through `this.quoteString()` instead of `mysqlQuote()`, update test at `mysql/quoting.test.ts:36`. DDL COMMENT call sites (`abstract-mysql-adapter.ts:578, 1319`) want the full wrapping literal — correct as-is.

### Autosave Slot B

- **~3 LOC (Rails divergence)** — `base.ts` `save()` captures `prev = _newRecordBeforeSave` and restores in `finally`, but unconditionally overwrites with `wasNewRecord`. Rails' `aroundSaveCollectionAssociation` uses `prev = @new_record_before_save ||= false; @new_record_before_save = !prev && new_record?` — once true, stays true through nested saves. **Concrete consequence:** during re-entrant/nested saves on the same record (e.g. callback chain that re-enters `save` on the parent), the inner autosave dispatch in `_insertCollectionRecord` can incorrectly treat association writes as **updates** (via `record.save(validate:false)`) when the outer scope already marked the parent as new — meaning a fresh insert path (`Association.insertRecord(record, false)` + `setInverseInstance` + counter-cache increment) is skipped. Fix: change `_newRecordBeforeSave = wasNewRecord` to `_newRecordBeforeSave = !prev && wasNewRecord` in `save()`.
- **~5 LOC** — `HasManyThroughAssociation#insertRecord(record, validate, raise)` doesn't propagate `validate`/`raise` to the join-record save. Join is saved via `joinRecord.save()` with default options. Diverges from target record save (which honors `validate`) and from Rails bang/non-bang behavior. Fix: pass `validate`; use `saveBang` when `raise` is true.

### PG connection Slot A

- **~10 LOC** — `statement_name` in `sql.active_record` payload for PG prepared-statement path (`_runQuery` / `execQuery` with `prepare: true`). Unblocks "statement key is logged" test.
- **~30 LOC** — `prepare: false` with binds — needs `QueryAttribute`-style bind objects with a `prepare: false` exec path wired through `execQuery`. Unblocks `prepare false with binds` test.
- **~3 LOC** — `tableAliasLength()` override on `PostgreSQLAdapter` returning `this.maxIdentifierLength()`. Blocked by base-class sync `number` return — would widen to `Promise<number> | number`.
- **Test-infra refactor** — Move `SQLSubscriber` from `adapters/postgresql/test-helper.ts` to a shared location when `adapters/abstract-mysql-adapter/connection.test.ts` is un-skipped (Rails defines it on `ActiveRecord::TestCase`).

### SQLite Slot A

- **~5 LOC** — Add `strict` field to `SqliteOpenConfig` in `activesupport/src/sqlite-adapter.ts`. Documents intent for future drivers (e.g. `node:sqlite`) that expose `sqlite3_db_config`.
- **~20 LOC** — better-sqlite3 DQS toggle: when upstream exposes `sqlite3_db_config`, pass `strict` through `Database.Options` in `sqlite-drivers/better-sqlite3.ts:openDatabase`. Then the `configureConnection` pragma block (currently silently ignored) can be removed.
- **Known limitation** — `strict_strings_by_default` is a no-op in current driver: better-sqlite3 compiles with `SQLITE_DQS=0`, so DQS is always off and `assert_nothing_raised` (non-strict accepts index on missing column) cannot be exercised. Documented inline.

### api:compare regression guard

- **Process improvement** — `_`-prefix renames on Rails-named methods silently drop them from `api:compare` surface. Consider extending the `rails-private-jsdoc` ESLint rule to flag `_`-prefixed methods whose Rails counterpart is non-underscored. Permanent guardrail against the regression class.

---

## Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous.
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage.
- **~30 LOC** — `postgresql/temporal-type-parsers.ts` still has one eager `import pg from "pg"` (the last per `browser-compat-plan.md`). Move to lazy registry. Blocks browser-bundle smoke tests.

---

## Architectural (deferred; too big for single ~250-LOC slot)

- **Connection-pool / per-thread query-cache architecture, Phases 2–4** (~120 LOC remaining). See fidelity followups. ~10 actionable test unskips (4 db_config + 6 pool-attachment); other 4 are permanent (GVL/fork/thread skips).

### Other deferred (need wider design)

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

## Story count

Cluster details in [`activerecord-100-clusters.md`](activerecord-100-clusters.md).

| Group                                     | Open | LOC est. |
| ----------------------------------------- | ---- | -------- |
| Relation cluster                          | 7    | ~1660    |
| Associations-core cluster                 | 5    | ~910     |
| Associations-HABTM cluster                | 9    | ~1690    |
| Associations has-many-through cluster     | 5    | ~1280    |
| Associations has-one cluster              | 4    | ~480     |
| Migration cluster                         | 6    | ~1210    |
| Connection-pool cluster                   | 3    | ~640     |
| MySQL active-schema cluster               | 3    | ~680     |
| MySQL mysql2-adapter cluster              | 3    | ~700     |
| MySQL schema cluster                      | 3    | ~400     |
| MySQL table-options cluster               | 2    | ~480     |
| MySQL charset-collation cluster           | 3    | ~315     |
| MySQL onUpdate followups                  | 2    | ~30      |
| SQLite adapter cluster                    | 1    | ~50      |
| PG-adapter cluster                        | 2    | ~340     |
| PG-schema audit cluster                   | 3    | ~530     |
| PG virtual-column cluster                 | 1    | ~250     |
| PG interval cluster                       | 1    | ~180     |
| PG UUID residual cluster                  | 2    | ~330     |
| PG connection cluster                     | 3    | ~130     |
| PG long-tail cluster                      | 8    | ~1760    |
| Schema cluster                            | 7    | ~1390    |
| Transactions cluster                      | 3    | ~350     |
| Unknown-triage cluster                    | 4    | ~640     |
| STI annotation-drift                      | 1    | ~20      |
| Associations-autosave cluster             | 4    | ~940     |
| Associations-reflection cluster           | 4    | ~780     |
| NotImplementedError elimination (Phase 2) | 7    | ~610     |
| `as any` legacy-cast cleanup sweep        | 1    | ~250     |
| Post-merge fidelity followups             | 78   | ~1675    |
| Doc-hygiene + infra followups             | 3    | ~30      |
| Architectural deferred                    | 3    | ~410     |
| Infra-blocked                             | 6    | n/a      |

**~107 actionable work-PR slots + 0 queued audits**, ~19.5k LOC across the clusters above.

The two `as any` audits (delivered 2026-05-12) found **zero new critical bugs** — the optional-chain audit returned `0 bug-suspected` and the method-call audit returned `2 bug-suspected` (folded into post-merge fidelity followups above for surgical verification). The high-leverage opportunity is **Sweep B from audit-as-any-method-calls**: ~250 LOC mechanical removal of 52 legacy-cast-removable instance-method casts on `Base` (`(record as any)._readAttribute`, `.save`, `.destroy`, etc. — TS types already declare these). The optional-chain audit's ~110 `legacy-removable` sites are dependent on the same `Base` host-interface tightening; can be folded into the same sweep or land second.

---

## Permanent guardrails

### Dual-registry watchpoint

When both a `Base.<X>` static field AND a `<x>.ts` module-level `WeakMap`/`Map` exist for the same concern, treat it as a bug. The live API writes one; helpers read the other; silently. closed `Base._storedAttributes` vs `store.ts:_storedAttributes`. Audit:

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
- `deprecator` / `gemVersion` / `version` removed from main bundle barrel; only via `@blazetrails/activerecord/deprecator` subpath.
