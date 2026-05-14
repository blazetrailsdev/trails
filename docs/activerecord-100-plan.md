# ActiveRecord API Parity Plan: 100% closed → post-100% Rails-fidelity stories

**Snapshot 2026-05-14:** `activerecord 4950/4958 methods (99.8%) | files: 275/275 | inheritance: 210/210 (100%) | activemodel 621/621 (100%)`. Public surface is closed (100%); the 8 outstanding methods are residual privates.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. Each PR targets ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

This doc is the **live work tracker** (post-merge followups, story count, guardrails). For per-cluster slot detail, see [`activerecord-100-clusters.md`](activerecord-100-clusters.md). For workflow + BLOCKED-annotation vocab + audit conventions, see [`test-compare-100-plan.md`](test-compare-100-plan.md).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`. This doc lists only **open work**.

---

## Post-merge fidelity followups (~2880 LOC)

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

### PG citext aftermath (#1498)

- **~5 LOC each** — `hstore`, `ltree`, `tsvector`, `inet`, `macaddr`, `xml` are in `SQL_TYPE_MAP` but not in `DSL_HELPER_METHODS`. Same `t.<type>(...)` shorthand gap as citext had. Audit + add each. `hstore.test.ts > schema dump with shorthand` is already BLOCKED on this. (#1498)
- **~30 LOC** — `case insensitive uniqueness` test for citext — no impl gap, just a missing test. Verify `validatesUniqueness({ caseSensitive: false })` + citext column skips `LOWER()`. (#1498)
- **~15 LOC** — `SchemaCache.columns(null, tableName)` null-pool guard. The "case insensitiveness" test had to pre-warm via `adapter.schemaCache.setColumns()` to avoid crashing on null pool. Any future test calling `caseInsensitiveComparison` on a raw adapter hits the same crash. (#1498)
- **Note** — `test_schema_dump_with_shorthand` regex assertion form differs: Rails `%r[t\.citext "cival"]` (no parens) vs our `/t\.citext\("cival"\)/` (TS parens). Functionally equivalent; the regex was updated in the test, not the dumper. (#1498)

### Callbacks PR 3 aftermath (#1499)

- **~5 LOC** — Remove `on?` from `CallbackConditions` in activemodel once PR 4 moves `afterCommit`/`afterRollback`/`afterSaveCommit`/etc. out of `Model`. These methods are the only reason `on?` stays in the interface. (#1499)
- **~10 LOC (PR 4 territory)** — `resolveCallback` in `activemodel/src/callbacks.ts:172` still checks both `before_save` (snake_case) and `beforeSave` (camelCase). Snake_case branch is dead code per CLAUDE.md. Scoped to PR 4 per convergence plan. (#1499)
- **~5 LOC** — `CallbackChain.register` accepts `on:` for commit/rollback events without validating the value (validation moved upstream to AR). Direct `chain.register("after", "commit", fn, { on: "bogus" })` silently stores bogus value. Low risk; PR 4 cleanup. (#1499)
- **Architectural note** — `Model.afterSaveCommit` / `afterCreateCommit` / `afterUpdateCommit` / `afterDestroyCommit` call `this.afterCommit(fn, { on: ... })` which routes through `Base.afterCommit`. These methods arguably belong in AR's `Base`, not `Model` — PR 4 territory. (#1499)

### Callbacks convergence aftermath (#1492–#1526)

- **~30 LOC** — Move `autosaveBelongsTo` inside the `around_save` chain rather than running it as an explicit pre-save check. Rails-fidelity improvement (current ordering diverges when autosave fails); behavior risk for `after_save` firing. (#1526)
- **~20 LOC** — Targeted test for a model with only `beforeCommit` callbacks to pin the `hasTransactionalCallbacks` path. PR 7 simplified this to check only `commit`/`rollback` chains (before_commit entries live in the `commit` chain as "before"-kind callbacks); prevent future regression. (#1526)

### Callbacks PR 1+2 aftermath (#1492 / #1497)

- **~5 LOC** — `skipCallback` with `CallbackObject` on `ClassMethods` interface accepted but no dedicated mixin test was added — covered implicitly by the inheritance-clone test. Add a direct mixin-level test for parity. (#1497)
- **Architectural note** — `resolveCallback` in `activemodel/src/callbacks.ts:172` currently checks both `before_save` snake-case AND `beforeSave` camelCase. PR 3 should decide whether to drop snake-case (camelCase-only per CLAUDE.md) or keep a compatibility shim. (#1497)
- **Hyphenated chain names** — `beforeMy-save` isn't a valid JS identifier so the object form silently won't dispatch. Same limitation in Rails (Ruby `before_my-save` not valid). Document; `HyphenatedKeyTest` doesn't use the object form. (#1497)

### Type-audit W1a aftermath (#1500)

- **~30 LOC** — activesupport W1a equivalent: `Function` + `Record<string, any>` sweep + enable `no-unsafe-function-type`. `prepend.ts:PrependMethod = (this: any, super_: Function, ...)` is the high-leverage fix — currently forces `super_ as (...args: any[]) => unknown` casts in `extended-deterministic-queries.ts` and elsewhere. (#1500)
- **~10 LOC cosmetic** — `type AnyClass = abstract new (...args: any[]) => any` duplicated in `suppressor.ts`, `no-touching.ts`, `delegation.ts`. Centralize in a shared internal types file. (#1500)
- **~30 LOC** — `reflection.ts:normalizedReflections` `rawRef as any` cast is the roughest remaining cast. Define a `RawReflection` interface capturing `parentReflection?` to replace. (#1500)

### Schema-dumper recent batch (Sweep D + #1467/#1468/#1469/#1472)

- **~30 LOC** — `MigrationContext.createTable` passes abstract `TableDefinition` to the callback; `t.exclusionConstraint`/`t.uniqueConstraint` aren't callable from schema-file blocks. Rails emits them inline. Fix: instantiate `PgTableDefinition` when `adapterName === "postgres"`, then exclusion/unique constraints can move inline. Closes the Sweep D Item 1 partial-ship. (#1472)
- **~50 LOC** — Harmonize `PostgreSQLAdapter.createTable` to abstract base's `(name, optionsOrFn?, fn?)` signature. Eliminates `SimpleTableBuilder` limitations + `createJoinTable` `schemaStatements()` detour + `@ts-expect-error TS2416`. Touches `range.test.ts:297` + `invertible-migration.test.ts:41` callers. (#1469)
- **~30 LOC** — Verify `partitions.test.ts` bodies against Rails `partitions_test.rb` once source is available; "partition table" test may be missing the `tables()` does-not-return-partition-child assertion. (#1469)

### MySQL schema (#1468 / #1477)

- **~5 LOC** — `MigrationContext.dropTable` doesn't accept `temporary`. Sweep E wired it on `MysqlSchemaStatements.dropTable`, but `MigrationContext.dropTable` (migration.ts:~570) only accepts `{ ifExists? }` — never forwards `temporary`. End-to-end Migration path still incomplete. (#1477)
- **~30 LOC** — `MysqlSchemaDumper.createSchemaDumper` sets `dumper.connection = this` but doesn't populate `tableCollationCache` or `virtualExpressionCache`. Rails populates these via `information_schema` queries before column iteration. Documented in `mysql/schema-dumper.ts` as gap. (#1477)
- **Generalization note** — `mysql/schema-dumper.ts` `schemaLimit()` hardcodes `limit === 24` for float suppression. If another native default appears, generalize via `nativeDatabaseTypes()[column.type]?.limit` pattern. (#1468)

### Has-one Slots C+D (#1478)

- **~100 LOC** — `ThroughAssociation#target_scope` chain merge. Rails' override merges each intermediate reflection's `scope_for_association` (i.e., the join model's `default_scope`); our base returns `klass.all()`. Unblocks "has one through with default scope on join model" + 2 custom-select default_scope tests. Annotation already points here. (#1478)
- **~50 LOC** — Non-preload (JOIN-based) eager loading. Three tests carry `BLOCKED: associations — non-preload (JOIN-based) eager loading not implemented`. Rails falls back from preload to a single JOIN query when `order:` references joined tables. General gap, not has_one_through-specific. (#1478)
- **~80 LOC** — Scoped has_one_through: WHERE on through model or source via lambda scope. "has one through with conditions eager loading" uses `favorite_club` / `hairy_club`. Requires lambda-scope support on through/source reflection + fixture models. (#1478)
- **~30 LOC** — Scope-based association-scope cache invalidation: `_cachedAssociationScope` never invalidated on through-model default-scope change. Rails resets via `reset_scope`. (#1478)
- **Process note** — `assertQueriesMatch` in `testing/query-assertions.ts` works in tests today; future BLOCKED annotations citing "query count assertions not available" should be revisited rather than accepted at face value. (#1478)

### Fixtures Phase 3a (#1481)

- **~5 LOC** — Wire `executeBatch` from `sqlite3/database-statements.ts` into `SQLite3Adapter` (static assignment pattern). Enables live-adapter integration tests for `defineFixtures`; smoke test in #1481 had to use a mock adapter. (#1481)
- **~5 LOC** — `topics.third` and `topics.fourth` missing `author_name`. Likely `David` per Rails YAML. Low impact today; verify when Phase 2 wiring lands. (#1481)
- **Counter-cache verify** — `topics.first` has `replies_count: 1` hardcoded but 3 Reply-type topics parent to it. Verify against Rails source when Phase 2 wiring exposes `replies_count`-asserting tests. (#1481)
- **Phase 3 scope note** — only 3 posts (`welcome`/`thinking`/`sti_comments`) and 3 comments (`greetings`/`more_greetings`/`does_it_hurt`) shipped. Rails has more for eager-loading/STI tests; absorbed into Phase 3b/5 cluster work. (#1481)
- **Datetime/TZ gap** — `topics` fixtures omit `written_on`/`bonus_time`/`last_read` datetime columns. 2 remaining BLOCKED tests in `base.test.ts:2019,2305` also need `with_env_tz`. Stays BLOCKED. (#1481)

### Fixtures Phase 3c (#1489)

- **~5 LOC** — Add `shared_computers` (string) attribute to `Developer` test model; add `joined_on` (date) attribute to `DevelopersProject` join model. Schema-gap comments in place. (#1489)
- **Note** — Phase 1b HABTM auto-detection (string-label form for join tables matching `a_b` pattern) is implemented but not exercised by Phase 3c data; #1489 used explicit `ref()` calls which are correct but more verbose. Future fixture sets may exercise the auto-form. (#1489)

### Fixtures Phase 3d (#1487)

- **~10 LOC** — Add `rating` (bigint), `description` (string), `account_id` (integer), `status` (integer enum) attributes to `Company` test model when downstream tests need them. Schema gaps documented inline. (#1487)
- **~5 LOC** — Add `transactions_count` (counter cache) + `updated_at` attributes to `Account` test model. (#1487)

### Fixtures audit sweep (#1488)

- **~30 LOC** — `legacy_comments_count` and `tags_count` are schema-gap columns noted in `posts.ts`. Once those attributes are declared in the test Post model, extend fixture data with Rails YAML values (e.g. `welcome.legacy_comments_count: 2`). (#1488)
- **~5 LOC** — `recursive_association_comment` missing `company_id` — schema gap. When Comment model gains the column, wire it. (#1488)
- **Test rename** — `fixtures.test.ts` description `"does_it_hurt is a SpecialComment on sti_comments post"` is stale after #1488 corrected the `post_id` to `thinking`. Custom fixture test (not Rails-mirrored), so renaming is OK. (#1488)

### Connection-pool sync (#1473, external)

- **~50 LOC** — Audit + fix connection-leak patterns in test suite. `establish-connection.test.ts` and similar call `pool.checkout()` without `pool.checkin()`, leaking connections that saturate pools. This was the root cause of the OOM that delayed #1473. Fixing unlocks the next item. (#1473)
- **~10 LOC** — Remove the `options.checkoutTimeout !== undefined` opt-in guard once test-suite leaks are fixed; always use `checkoutAsync`. This is the Rails-correct behavior (always waits up to `checkout_timeout`); current opt-in is a temporary backwards-compat measure for the leaked-pool test suite. (#1473)
- **~20 LOC** — Pattern duplication in `withConnection`: then-detect + cleanup inlined three times (pre-leased, `runWithConn`, async continuation). Shared helper would parameterize the per-path differences. (#1473)
- **~5 LOC** — `buildAsyncExecutor` returns `null` (connection-pool.ts:~986); should be a Promise-bounded semaphore. (#1473)
- **~20 LOC** — `ExecutorHooks.complete()` resolver not wired to `Base.connectionHandler` yet (pending ConnectionHandler PR 6). (#1473)

### Fixtures Phase 3b (#1484)

- **~5 LOC** — Extend `test-fixtures.ts` Author model with `author_address_extra_id` and `owned_essay_id` `attribute()` declarations when Phase 2 integration tests need them. Fixture data is faithful to Rails YAML; the model schema is what's missing. (#1484)
- **~30 LOC** — Extend `bookFixtureData` with enum columns (status, last_read, language, author_visibility, illustrator_visibility, font_size, difficulty, boolean_status, cover) once Book test model gains those `attribute()` declarations. Currently omitted because Book only declares name/author_id/format. (#1484)
- **Note** — Explicit `id` fields from Rails YAML are intentionally omitted because `defineFixtures` always overwrites the PK with `fixtureId(label)`. Cross-refs work via `ref()` so FK resolution is unaffected. (#1484)

### Fixtures Phase 2 (#1480)

- **~5 LOC** — `isTableMissingError` in `use-fixtures.ts` matches `"does not exist"` broadly — could swallow errors about missing functions or sequences. Narrow to relation/table-only matches, following `test-adapter.ts:835-838` pattern. (#1480)
- **Cleanup mode upgrade (~100 LOC Phase 4)** — `useFixtures` `afterEach` uses `DELETE FROM` per-table. Rails uses `disable_referential_integrity` + truncate + restore. Sufficient today; revisit for large fixture sets or speed. (#1480)
- **Note** — `FixtureSet.createFixtures` ts API diverges from Rails (`adapter, Model, fixtures` vs Rails' `(fixtures_directory, fixture_set_names, ...)`). Intentional Phase 2 scope; production-fidelity directory-loading API is N/A in our TS-native model. (#1480)

### Fixtures Phase 1b (#1471)

- **~5 LOC** — Consider exporting `clearTableRegistry` (or per-adapter flush) for test suites reusing an adapter across files. (#1471)
- **Edge note** — `detectHabtmParts` splits on `_` and tries all prefix/suffix splits; `line_items_orders` matches both `line` (not real) and `line_items` (real). Registry check picks the first match — correct, but worth documenting. (#1471)

### Arel + activemodel type cleanup (#1476, unrelated)

- **~30 LOC** — Tighten `normalizes()` overload from rest-param `[...string[], fn | Record]` to a discriminated union. Eliminates remaining `as unknown as string[]` casts and rejects invalid runtime calls at compile time. (#1476)
- **~50 LOC** — Extract `ArelConnection` to a dedicated `packages/arel/src/visitors/connection.ts` so `node.ts` can import directly. Replaces the `connection?: never` contravariant workaround in `ToSqlCtor`. Safe but surprising; cleaner with the extraction. (#1476)

### Sweep C aftermath

- **~30 LOC (deferred, needs Rails audit)** — `AssociationReflection.isPolymorphic()` returning true when `options.as` is set was DROPPED from Sweep C — implementation broke the `HasOneAssociationPolymorphicThroughError` guard at `reflection.ts:1344`. The semantics differ: `options.as` means "this model plays a polymorphic role as the target" (affects FK columns), while `options.polymorphic` on `belongs_to` means "the target type varies." Audit Rails' actual `polymorphic?` implementation for `has_one :as` and identify which guards need updating before re-applying. (#1465)
- **~10 LOC (pre-existing gap discovered)** — `saveBang` in `persistence.ts` calls `this.save()` with **no arguments**, silently ignoring `{ validate: false }` or any options passed to it. Sweep C's `insertRecord` fix worked around this via `save({ validate }) + raiseValidationError`, but `saveBang`'s option-blindness affects other callers too. (#1465)
- **Convention note** — `inverseName()` `@internal`-public visibility pattern survived 5 Copilot review cycles. Per CLAUDE.md this is the correct access-control mechanism for Rails-private methods. Document for future reflection.ts changes. (#1465)

### Migration Slot G

- **~20 LOC** — Implement `AbstractMysqlAdapter#charset()` and `#collation()` (currently return `""`). Should call `showVariable("character_set_database")` / `showVariable("collation_database")`. Needed for `internalStringOptionsForPrimaryKey` and for any code reading `connection.charset` / `connection.collation` directly. (#1466)
- **~30 LOC** — `SchemaMigration.createTable` and `InternalMetadata.createTable` use hardcoded SQL that bypasses `internalStringOptionsForPrimaryKey`. Route through the adapter's `create_table` DSL for full Rails parity. Affects schema-migrations table creation on old MySQL with utf8mb4. (#1466)
- **~15 LOC (Rails divergence)** — `AbstractMysqlAdapter#renameIndex` throws when `supportsRenameIndex()` is false. Rails calls `super` (drops + recreates via `AbstractAdapter`). Modern MySQL ≥ 5.7.6 / MariaDB ≥ 10.5.2 supports rename so this is mostly moot, but Trilogy on older servers would hit it. (#1466)
- **Test gap, not a bug** — no test exercises prefix-length index creation (`length: { col: N }`). Would need live MySQL test. (#1466)

### Fixture replacement Phase 1

- **~5 LOC** — Add validation that `ref(tableName, fixtureName)` resolves to a known fixtureId at call time (helpful error message instead of silent wrong ID). Phase 2 candidate. (#1470)
- **~5 LOC** — Narrow direct-instance detection in `define-fixtures.ts:95` to `val instanceof Base` (currently false-positives on any plain object with an `id` key). Requires changing `import type { Base }` to a value import. (#1470)
- **Architectural note (Phase 2 work)** — Rails loads all fixture sets in a single `insert_fixtures_set` call (one transaction for all tables); our `defineFixtures` issues one call per model class. Phase 2's `useFixtures` wrapper should batch multiple sets into a single transaction. (#1470)
- **Documented divergence** — `fixtureId` uses `charCodeAt(i) & 0xff` instead of Rails' `Zlib.crc32`. Matches for ASCII labels (always the case for fixture identifiers); diverges for non-ASCII. Documented in code. (#1470)

### Reflection Slot A

- **~5 LOC (Rails divergence)** — `getPrimaryKeyAttr` returns `_primaryKey ?? "id"`, blocking a truly null PK. Rails supports `self.primary_key = nil`. The two #1456 unskips currently use `_primaryKey = ""` as a hack; aligning the fallback would let them use the Rails-mirrored setup.
- **~5 LOC** — `UnknownPrimaryKey` message format and no-arg constructor: Rails appends description with `"\n #{description}"`; we join with `". "`. Rails supports `UnknownPrimaryKey.new` with no args (`"Unknown primary key."`); our constructor requires a model. No current call sites need either form, but Rails surface parity.
- **~10 LOC (architectural-ish)** — `AbstractReflection#checkValidityOfInverseBang` uses `(this as any).inverseName?.()` to reach into `AssociationReflection`. A protected accessor would be cleaner long-term. Same `as any` pattern audited elsewhere — fold into the `as any` legacy-cast sweep.
- **~3 LOC** — `joinScope` in `AbstractReflection` still throws plain `Error` for mismatched joinPrimaryKey/joinForeignKey lengths. No typed Rails counterpart found; either invent (`MismatchedForeignKeyError` or similar) or leave as-is and document.

### Has-one Slot A

- **~5 LOC (Rails divergence, destroyed-record reload)** — `createThroughRecord` omits Rails' `if through_record && through_record.destroyed?` guard that reloads the through proxy before continuing. Harmless in most cases but could cause a stale-proxy issue if the through record was destroyed and a new assignment follows immediately without explicit reload. (#1457)
- **~10 LOC (Rails divergence, in-memory build path unreachable)** — When `owner.isNewRecord()` or `!save`, Rails calls `through_proxy.build(attributes)` for in-memory creation. Our `createThroughRecord` mirrors that, but `persistReplace` only invokes it post-save with `save=true`, and our `replace` override skips storing `_pendingReplace` for `save=false`. Net: `member = new Member; member.club = club` (explicit `save=false`) won't build the membership in memory. Practical impact low — rare explicit opt-out. (#1457)
- **~10 LOC** — `ThroughReflection.isPolymorphic()` returns `!!options.polymorphic` but misses the `options.as` path. `has_one :sponsor, as: :sponsorable` is not recognized as polymorphic, so `HasOneAssociationPolymorphicThroughError` never raises for the polymorphic-through guard. (#1457)
- **~5 LOC cleanup** — `throughAssociation()` helper in `has-one-through-association.ts` is unused dead code (only appears in a JSDoc comment). Pre-existing; safe to delete. (#1457)

### PG schema dump (post-#1458)

- **~30 LOC** — PG table comment schema dump: forward `adapterTableOpts.comment` in `emitTable`; add `COMMENT ON TABLE` emission after `createTable` in the PG schema dumper (mirroring Rails' `exec_migration` comment hook). `tableOptions()` already queries it; just not forwarded. (#1458)
- **~20 LOC** — PARTITION BY schema dump: 2 `BLOCKED: adapter-pg` partition tests in `SchemaCreateTableOptionsTest` flow through the same `fetchTableOptions → options:` path; need `tablePartitionDefinition` wired correctly + test bodies. (#1458)
- **~10 LOC** — `delegatedType` accessor naming gap: current implementation generates `entry.message` (returns FK value); Rails generates `entry.message_id` / `entry.uuid_message_uuid` (type-snake + pk-name). The "accessor" test locks in the wrong behavior; fixing requires a separate PR that also updates that test body. (#1458)
- **Note for code archaeology** — `schema-dumper.ts:fetchTableOptions` introduced a sync/async union type novel to this codebase; the `void adapterTableOpts.catch(() => {})` swallow in the sync guard may surprise readers. PG `tableOptions()` queries `tableComment()` on every dumped table even when unused — low overhead, worth noting if dump perf becomes a concern. (#1458)

### Has-one Slot B

- **~20 LOC (latent bug)** — `readAttributeForValidation` fix (`assoc.target != null` guard) added in #1461 applies broadly to ALL association types, not just `has_one`. The same false-positive could affect `belongs_to required: true` and `has_many validate: true` after eager loading via `preloader/association.ts:206 associateRecordsFromUnscoped`. Worth a dedicated test proving `required: true` does NOT spuriously fail post-preload. (#1461)
- **~5 LOC cleanup** — `else if (typeof model.validates === "function")` branch in `HasOne#defineValidations` is dead code (`validatesPresenceOf` is always available on AR models). (#1461)
- **~10 LOC cleanup** — `addAutosaveAssociationCallbacks` in `autosave-association.ts:~901` is defined but never called. `validateAssociations` bulk loop replaces it functionally. Safe to delete. (#1461)

### SQLite Slot B

- **~15 LOC (Rails divergence)** — `dataSourceExists()` in `sqlite3-adapter.ts` still uses the old `sqlite_master`-based query (via `_sqliteMasterFor`), while `tableExists()` was updated to `pragma_table_list` in #1459. Rails' `data_source_exists?` also uses the `data_source_sql` (same `pragma_table_list` path). Align `dataSourceExists()` to match. (#1459)
- **~10 LOC** — Extract `assertLogged` from `sqlite3-adapter.test.ts` to a shared `packages/activerecord/src/adapters/sqlite3/test-helper.ts` (mirroring how PG `test-helper.ts` houses `SQLSubscriber`). Rails defines `assert_logged` on `ActiveRecord::TestCase` so it's available to all adapter tests. (#1459)
- **Known behavior (not a followup)** — `tableExists("sqlite_sequence")` returns false but `tableExists("main.sqlite_sequence")` returns true post-#1459 (different code paths). Acceptable; Rails doesn't support schema-qualified names at all. (#1459)

### Schema Slot C (#1460)

- **~30 LOC (Rails divergence)** — PG `NULLS FIRST`/`NULLS LAST` not parsed by `indexes()`; Rails parses these and includes them in the orders string (`"desc NULLS LAST"`). Pre-existing gap surfaced during #1460.
- **~20 LOC** — PG `INCLUDE (...)` clause (covering indexes) not parsed or emitted. Rails emits `include: [...]`. Pre-existing gap.
- **~40 LOC** — `MigrationContext.createTable()` inline index SQL ignores `where`/`order`/`nullsNotDistinct`/`using` options from `td.indexes` — Copilot raised this 4× in #1460, deferred each time. `_indexes` store reflects options, executed SQL doesn't. Fix: reuse `addIndex` internally or extract the SQL builder.
- **~50 LOC** — Live PG adapter test confirming `idx.where` and `idx.nullsNotDistinct` populated from `indexes()` on a real DB. Per Copilot review #4.
- **Known limitation** — `nullsNotDistinct` SQL only emitted on PG (`adapterName === "postgres"`). SQLite silently ignores. Acceptable.

### PG connection Slot D (#1464)

- **~20 LOC (latent issue)** — `connection-pool.ts:449,505,522` call `connection.verifyBang()` without `await`. Post-#1464 the PG override is async; fixture-connection checkout paths now fire-and-forget the liveness check. Fix: widen `TransactionAwareConnection.verifyBang` to `Promise<void>` and await call sites. Requires `checkout()` / `checkoutAsync()` to absorb the await (broader connection-pool change).
- **Architectural note (pre-existing)** — Rails `verify!` calls `reconnect!(restore_transactions: true)` which replays open transactions. Our `reconnect()` calls `resetTransaction()` but does not restore transaction state. Documented for the eventual transaction-state-restore work.

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
| Migration cluster                         | 5    | ~1070    |
| Connection-pool cluster                   | 3    | ~640     |
| MySQL active-schema cluster               | 3    | ~680     |
| MySQL mysql2-adapter cluster              | 3    | ~700     |
| MySQL schema cluster                      | 1    | ~200     |
| MySQL table-options cluster               | 2    | ~480     |
| MySQL charset-collation cluster           | 3    | ~315     |
| MySQL onUpdate followups                  | 2    | ~30      |
| PG-adapter cluster                        | 2    | ~340     |
| PG-schema audit cluster                   | 1    | ~260     |
| PG virtual-column cluster                 | 1    | ~250     |
| PG interval cluster                       | 1    | ~180     |
| PG UUID residual cluster                  | 2    | ~330     |
| PG long-tail cluster                      | 7    | ~1510    |
| Schema cluster                            | 5    | ~1050    |
| Transactions cluster                      | 3    | ~350     |
| Unknown-triage cluster                    | 4    | ~640     |
| STI annotation-drift                      | 1    | ~20      |
| Associations-autosave cluster             | 4    | ~940     |
| Associations-reflection cluster           | 3    | ~700     |
| NotImplementedError elimination (Phase 2) | 7    | ~610     |
| Post-merge fidelity followups             | 151  | ~2880    |
| Doc-hygiene + infra followups             | 3    | ~30      |
| Architectural deferred                    | 3    | ~410     |
| Infra-blocked                             | 6    | n/a      |

**~90 actionable work-PR slots + 0 queued audits**, ~18.2k LOC across the clusters above.

The `as any` legacy-cast cleanup sweep that previously lived in this table has been **superseded by `docs/activerecord-type-audit.md`** — the type-audit's 4-wave plan covers the same `(record as any)._readAttribute` / `.save` / `.destroy` removals more precisely (Wave 2 host typing + Wave 3 private-state declarations). The 2 `bug-suspected` candidates from the as-any audits remain as fidelity followups above for surgical verification regardless of which sweep ships them.

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
