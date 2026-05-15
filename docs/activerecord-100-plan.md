# ActiveRecord API Parity Plan: 100% closed → post-100% Rails-fidelity stories

**Snapshot 2026-05-15:** `activerecord 4950/4958 methods (99.8%) | files: 275/275 | inheritance: 210/210 (100%) | activemodel 621/621 (100%)`. Public surface is closed (100%); the 8 outstanding methods are residual privates.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. Each PR targets ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

This doc is the **live work tracker** (post-merge followups, story count, guardrails). For per-cluster slot detail, see [`activerecord-100-clusters.md`](activerecord-100-clusters.md). For workflow + BLOCKED-annotation vocab + audit conventions, see [`test-compare-100-plan.md`](test-compare-100-plan.md).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`. This doc lists only **open work**.

---

## Post-merge fidelity followups

Small Rails-fidelity polish from PR reviews. Grouped by topic.

### Test infra

- **~20 LOC** — `reconnect after bad connection on check version` test: pg-npm pool has no single-connection version-stub hook. Needs `_databaseVersionForTest()` setter or injectable version-check hook.
- **~50 LOC** — `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block + `withEnvTimezone(zone, fn)` helper). Unblocks 2 base.test.ts tests.
- **~100–150 LOC** — Second named connection pool equivalent to Rails' `ARUnit2Model` (multi-DB test infra). Unblocks `MultiDbMigratorTest` ×7 + `PrimaryClassTest` ×2.

### Schema dumper / table options

- **~30 LOC** — Wire `tableOptions()` into `schema-dumper.ts:emitTable`. Requires making the dump loop async; overlaps pg-schema Slot B / Schema Slot E.
- **~30 LOC** — `SchemaDumper.fkIgnorePattern` configurability vs `ForeignKeyDefinition.isExportNameOnSchemaDump` hardcoded `fk_rails_` pattern. Make `isExportNameOnSchemaDump` accept the configured pattern, or deprecate `fkIgnorePattern` since FK now owns the decision (Rails-faithful).
- **~50–100 LOC** — `TableDefinition.toSql()` (`abstract/schema-definitions.ts:~926-1095`) still branches on `_adapterName` for type SQL. Redundant with `SchemaCreation.typeToSql()` + `SchemaCreation.visitTableDefinition()`. Route through `SchemaCreation.accept()` and delete `toSql()`.

### Transactions

- **~50 LOC** — Dirty-tracking for new-record rollback: `topic.changes["title"]` returns `undefined` instead of `[null, "Jeff"]` after rollback. `state.attributes` snapshot in `rememberTransactionRecordState` captures user-written values, so `redetectChanges` produces no diff. Fix: snapshot DB-original values (null for unsaved new records).

### Insert-all polish

- **~10 LOC** — Add `model.adapter.schemaCacheBound` returning a pool-bound one-arg `indexes(tableName)` form so call sites don't know about the pool.
- **~30 LOC** — Add `supportsInsertConflictTarget()` to `DatabaseAdapter` interface + impls (true for sqlite≥3.24, pg, mysql≥8). Wire Rails' guard in `_findUniqueIndexFor`.
- **~50 LOC** — Thin `IndexDefinition` value class in `connection-adapters/`. Mutate `this.uniqueBy` to it in constructor. Unlocks `ON CONSTRAINT <name>` for PG.

### Range / BindParam

- **~5 LOC** — Remove `RangeType.encodeLiteral` pre-serialization workaround (currently load-bearing; removing it broke `range.test.ts > where by attribute with range` with PG `42883: No operator matches`). Real fix needs BindParam range-quoting (next item).
- **~20 LOC** — Fix the BindParam route for range WHERE predicates so range values quote correctly. Unblocks the `RangeType.encodeLiteral` removal.

### Encryption (architectural)

- **~30 LOC** — `MessageSerializer.encodeIfNeeded` double-base64 fix. Requires `Aes256Gcm` to store raw bytes (not base64) in headers — _breaking change_ for existing stored ciphertexts. Only ship with a migration path.

### FK validation

- **~30 LOC** — `validateForeignKey` `!fSchema → public` heuristic. The `pg_namespace` join diverged from Rails (`t2.oid::regclass::text` + `search_path`). Needs different schema-resolution strategy. Fragility concern remains for non-public-schema FKs on search_path.

### PG schema-statements

- **~30 LOC** — Rewire PG mixin chain so `PostgreSQLAdapter#dropTable` delegate can be deleted. Add per-adapter `include(PostgreSQLAdapter, ...)` for PG-specific schema-statements methods. Mirrors Rails' `include PostgreSQL::SchemaStatements`.
- **~50 LOC** — Live PG integration test for `dropTable("parent", { force: "cascade" })` end-to-end. Current tests use a fake adapter.

### Autosave / association polish

- **~30 LOC** — Wire `custom_validation_context?` branch into `validateHasOneAssociation` / `validateBelongsToAssociation`. Rails autosave_association.rb:332/346.
- **~50 LOC** — Preloader → `associationInstanceSet` migration. Update the ~14 map-direct write sites to call `record.associationInstanceSet(name, association)`. `_loadedAssociation` then collapses to a one-line Rails-shaped pure read.

### PG infinity / temporal

- **~5 LOC cleanup** — `persistence.ts:872-880` isDateInfinity branch now too broad post-sentinel-unification; gate on temporal type-name.
- **~5 LOC cleanup** — `temporalToBindString` PG infinity branch may be dead post-PR; trace + delete if confirmed.
- **~10 LOC** — MySQL `quote()` non-finite handling (`mysql/quoting.ts:177`). Same bareword bug pg had; no MySQL infinity test surfaced it. Preventive.
- **~40 LOC** — Arel range-bound serialization for `Float::INFINITY` endpoints. Unblocks 2 remaining `where clause with infinite range` tests.
- **~80 LOC** — `InTimeZone` test helper + `time_zone_aware_attributes` integration. Touches `Base.timeZoneAwareAttributes`, `reset_column_information`, TimeZoneConverter wrapping for sentinel values.

### Reflection followups

- **~15 LOC** — Annotation refresh on 22 remaining `reflection.test.ts` stubs (all carry wrong AggregateReflection/ThroughReflection boilerplate; real causes vary).
- **~30 LOC** — Wire `ensureOptionNotGivenAsClassBang` into ThroughReflection / source-type validation path (defined but never called today). Unblocks `class for source type` test.
- **~30 LOC future** — `NullColumn` class so `assert_instance_of NullColumn` Rails asserts can port verbatim. Duck-compatible shape exists; only matters if porting that specific assertion.
- **~50 LOC** — `static set primaryKey(null)` semantics + `Edge` fixture; un-skip `association primary key raises when missing primary key` + `active record primary key raises when missing primary key`.

### PG types

- **~30–80 LOC** — Wire `Base.primaryKey` to consult `adapter.primaryKey(tableName)` for tables without explicit PK (foreign tables). Touches `getPrimaryKeyAttr` `?? "id"` sentinel + `model-schema.ts` PK auto-detection.
- **~15–30 LOC** — Route `addColumn` through `schemaCreation.accept(AddColumnDefinition)`; fix `visitColumnDefinition` to call `addColumnOptionsBang` instead of `addColumnOptions`. Unblocks `test_non_persisted_column` + `test_change_table` Rails-parity rewrites.
- **~30–80 LOC** — Rewire `emitTable` to use connection-adapter `columnSpec` / `prepareColumnOptions`. Unblocks `test_schema_dumping` and adapter-specific column quirks (enum/array).
- **~50–100 LOC** — Harmonize `PostgreSQLAdapter.createTable` signature with abstract base; delete `SimpleTableBuilder`. Touches `range.test.ts:297` + `invertible-migration.test.ts:41` callers.
- **~20 LOC** — `extractValueFromDefault` for interval — route interval defaults through `Interval#typeCastForSchema` in `postgresql/schema-statements.ts` + schema-dumper column-default rendering. Unblocks `schema dump with default value`.
- **~30 LOC** — Aggregate result type-cast — wire `typeForAttribute` through aggregate-result coercion in `calculations.ts`. Unblocks `average interval type`.
- **~30–80 LOC** — Interval row-read deserialization. Wire interval column values through `Interval.castValue` in attribute-set materialization or postgresql/oid result deserialization.
- **~5 LOC** — PG interval binary-format parser: explicit delegation to `pg.types.getTypeParser(1186, "binary")` or document the text-only assumption.
- **~10 LOC** — Register other PG-only types (`Hstore`, `Jsonb`, `Money`, `Inet`, `Cidr`, `Macaddr`, `Bit`, `BitVarying`, `Xml`, `Point`, `Uuid`) on AM `typeRegistry` the same way `Interval` was registered.
- **~20 LOC** — Emit non-PK column `defaultFunction` as `default: () => "fn()"` in `emitTable`, mirroring the PK path.
- **~30 LOC** — Make `SchemaDumper.dumpTableSchema(adapter, ...)` instantiate the adapter's `createSchemaDumper()` class rather than the base.
- **~40 LOC** — Harmonize `PostgreSQLAdapter.createTable` callback-first signature with abstract `SchemaStatements.createTable` (options-first + optional fn). Removes `@ts-expect-error TS2416`.

### MySQL warnings

- **~10 LOC** — Optimization — Rails reads `@raw_connection.warning_count` directly; mysql2 npm driver may expose via `conn.serverStatus`. Avoids one round-trip per non-ignore query.
- **~15 LOC** — `SQLWarning.connectionPool` field + plumb `this.pool` through `_handleWarningsOn`; add `error.connectionPool === adapter.pool` assertion to `:raise` test once `Mysql2Adapter#pool` is stable.
- **~20 LOC** — Fold `_handleWarningsOn` into `AbstractMysqlAdapter._handleWarnings(sql)` driven by abstract `_currentConn()` accessor once Mysql2 `perform_query` is ported per Rails layout.
- **~30 LOC** — Mirror `_handleWarningsOn` onto `TrilogyAdapter` once Trilogy execute path is live.

### Query cache (Phases 2-4)

- **~5 LOC cleanup** — Two redundant `checkoutAndVerify` paths in `ConnectionPoolConfiguration` + module-level. Decision: remove or wire to canonical path.
- **~10 LOC (Phase 2)** — `DatabaseConfig.queryCacheMaxSize` wiring. `ConnectionPoolConfiguration` constructor accepts the param but `ConnectionPool` passes no argument.
- **~20 LOC (Phase 3)** — `enableQueryCacheBang`/`disableQueryCacheBang` at checkout/checkin. Rails propagates pool-level state at checkout; today the pool never calls these.
- **~20 LOC (Phase 3)** — `withQueryCache(fn)` public API on `ConnectionPool`.
- **~30 LOC (Phase 2)** — `_threadQueryCaches` eviction. Map grows unboundedly in long-lived processes. Decide: try/finally vs AsyncLocalStorage vs bounded LRU.
- **~40 LOC (Phase 4)** — `QueryCache.installExecutorHooks` middleware path. Wires `ExecutorHooks` to enable/disable around each request. Unblocks 6 pool-attachment tests.

### Column#default

- **~30 LOC** — Promote `sqlType` from optional on `Column` to the `ColumnInfo` base interface. Universally present across all three adapters; optional declaration is a vestige.
- **~100–200 LOC (test-infra)** — Fixture-table infra to unblock 13 remaining default-expression tests across MySQL/PG/SQLite. Need harness to seed pre-existing fixture tables analogous to Rails' `fixtures/`.

### `as any` audit

- **~10–20 LOC** — Verify 2 `bug-suspected` candidates: `relation.ts:4965` `(this.spawn() as any).asyncBang()` (possible swallowed promise) + `abstract/database-statements.ts:1827` `(relation as any).arel()` (verify sync on every host).

### `delegatedType` followups (post-#1583)

#1583 wired `primaryKey` option + UUID FK accessors + `entryableTypes`. Remaining gaps:

- **~5 LOC** — `entryableName` returns plain string; Rails returns `ActiveSupport::StringInquirer` so `entry.entryable_name.message?` works.
- **~20 LOC** — Scope name and singular accessor for namespaced types use raw `snakeName` with slashes (`"admin/messages"` — invalid JS property name). Rails uses `type.tableize.tr("/","_")` = `"admin_messages"`.
- **~30 LOC** — `entry.message` accessor returns the FK value instead of the associated record. Fix requires the `belongs_to` association accessor to be callable by name.
- **~30 LOC** — `build${Role}` role-level builder is missing. Rails defines `build_entryable(*params)` reading current type, constantizing, calling `.new`.
- Pre-existing snake-case naming deviation — Rails generates `entry.message?` / `entry.comment?` per type; we generate `isMessage()` / `isComment()`. Document or generate both.

### Callbacks remaining

- **~20 LOC** — Targeted test for a model with only `beforeCommit` callbacks to pin the `hasTransactionalCallbacks` path. PR 7 simplified this to check only `commit`/`rollback` chains.
- **Documented but unfixable**: Hyphenated chain names — `beforeMy-save` isn't a valid JS identifier so the object form silently won't dispatch. Same limitation in Rails.

### Type-audit residuals

- **~10 LOC cosmetic** — `type AnyClass = abstract new (...args: any[]) => any` duplicated in `suppressor.ts`, `no-touching.ts`, `delegation.ts`. Centralize in a shared internal types file.
- **~30 LOC** — activesupport W1a equivalent: `Function` + `Record<string, any>` sweep + enable `no-unsafe-function-type`. `prepend.ts:PrependMethod = (this: any, super_: Function, ...)` is the high-leverage fix.
- **~30 LOC** — `reflection.ts:normalizedReflections` `rawRef as any` cast is the roughest remaining cast. Define a `RawReflection` interface capturing `parentReflection?` to replace.

### MySQL quoting divergence

- **~20 LOC** — Standalone `quoteString` in `mysql/quoting.ts:88` still uses SQL-standard `''` doubling. Rails uses backslash-escape. Same adapter produces two different outputs (`quote()` vs `quoteString()`). Fix: update standalone `quoteString` to backslash-escape, route `quote()` through `this.quoteString()`.

### Autosave Slot B residuals

- **~3 LOC** — `base.ts save()` unconditionally overwrites `_newRecordBeforeSave = wasNewRecord`. Rails uses `prev = @new_record_before_save ||= false; @new_record_before_save = !prev && new_record?` — once true, stays true through nested saves. Inner autosave dispatch can incorrectly treat association writes as updates when outer scope already marked parent as new.
- **~5 LOC** — `HasManyThroughAssociation#insertRecord(record, validate, raise)` doesn't propagate `validate`/`raise` to the join-record save.

### PG connection / SQLite small items

- **~3 LOC** — `tableAliasLength()` override on `PostgreSQLAdapter` returning `this.maxIdentifierLength()`. Blocked by base-class sync `number` return.
- **~5 LOC** — Add `strict` field to `SqliteOpenConfig` in `activesupport/src/sqlite-adapter.ts`. Documents intent for future drivers that expose `sqlite3_db_config`.
- **~10 LOC** — `statement_name` in `sql.active_record` payload for PG prepared-statement path. Unblocks "statement key is logged" test.
- **~20 LOC** — better-sqlite3 DQS toggle when upstream exposes `sqlite3_db_config`. Then `configureConnection` pragma block (silently ignored today) can be removed.
- **~30 LOC** — `prepare: false` with binds — needs `QueryAttribute`-style bind objects with a `prepare: false` exec path wired through `execQuery`. Unblocks `prepare false with binds` test.

### api:compare regression guard

- **Process improvement** — `_`-prefix renames on Rails-named methods silently drop them from `api:compare` surface. Extend the `rails-private-jsdoc` ESLint rule to flag `_`-prefixed methods whose Rails counterpart is non-underscored. Permanent guardrail.

---

## Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous.
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage.
- **~30 LOC** — `postgresql/temporal-type-parsers.ts` still has one eager `import pg from "pg"` (the last per `browser-compat-plan.md`). Move to lazy registry. Blocks browser-bundle smoke tests.

---

## Architectural (deferred; too big for single ~250-LOC slot)

- **Connection-pool / per-thread query-cache architecture, Phases 2–4** (~120 LOC remaining). See fidelity followups. ~10 actionable test unskips; other 4 are permanent (GVL/fork/thread skips).

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

| Group                                     | Open slots / status      | LOC est. |
| ----------------------------------------- | ------------------------ | -------- |
| Associations-autosave cluster             | followups only           | ~480     |
| Associations-reflection cluster           | 1 (C residual)           | ~150     |
| Associations-core cluster                 | 1 (E)                    | ~140     |
| Associations has-many-through cluster     | 3 (C, D, E)              | ~750     |
| Associations-HABTM cluster                | 9 (A–I)                  | ~1690    |
| Relation cluster                          | 1 (H)                    | ~220     |
| Migration cluster                         | 2 (D, F in flight #1598) | ~430     |
| Connection-pool cluster                   | followups only           | ~320     |
| Schema cluster                            | 4 (H-b, I, J, K)         | ~870     |
| MySQL active-schema cluster               | 3 (B, C, D)              | ~680     |
| MySQL mysql2-adapter cluster              | 3 (A, B, C)              | ~700     |
| MySQL schema cluster                      | 1 (C)                    | ~200     |
| MySQL table-options cluster               | followups only           | ~100     |
| MySQL charset-collation cluster           | Slot A in flight #1591   | ~135     |
| PG-adapter cluster                        | 1 (E optional)           | ~120     |
| PG-schema audit cluster                   | followups only           | ~50      |
| PG virtual-column cluster                 | 1 (B in flight #1594)    | ~250     |
| PG interval cluster                       | followup only            | ~50      |
| PG UUID residual cluster                  | 1 (B)                    | ~250     |
| PG long-tail cluster                      | followups only           | ~390     |
| Transactions cluster                      | 1 (D); E deferred        | ~80      |
| Unknown-triage cluster                    | 4 (A–D)                  | ~640     |
| STI annotation-drift                      | 1 (tests-only PR)        | ~20      |
| NotImplementedError elimination (Phase 2) | 7                        | ~610     |
| Post-merge fidelity followups             | ~70 items                | ~2200    |
| Doc-hygiene + infra followups             | 3                        | ~30      |
| Architectural deferred                    | 3                        | ~410     |
| Infra-blocked                             | 6                        | n/a      |

**~45 actionable work-PR slots**, **~12.5k LOC** across the clusters above. Down from ~90 slots / ~18.2k LOC at start of session.

The `as any` legacy-cast cleanup sweep is **superseded by `docs/activerecord-type-audit.md`** — the 4-wave plan covers the same removals more precisely. 2 `bug-suspected` candidates remain in fidelity followups above.

---

## Permanent guardrails

### Dual-registry watchpoint

When both a `Base.<X>` static field AND a `<x>.ts` module-level `WeakMap`/`Map` exist for the same concern, treat it as a bug. Closed: `Base._storedAttributes` vs `store.ts:_storedAttributes`. Audit:

```bash
grep -rn "new WeakMap<typeof Base\|new Map<.*Base" packages/activerecord/src
```

### Unported-files gate (Step 0 for auditors)

Before proposing implementation slots, every audit MUST consult `scripts/api-compare/unported-files.ts`. If any source in scope appears in `UNPORTED_FILES` (by `pattern` or `testFile`), propose **exclusion**, not implementation.

### Test:compare workflow

Test:compare un-skip work uses [`test-compare-100-plan.md`](test-compare-100-plan.md) + `$HOME/github/blazetrailsdev/test-compare-prompt-template.md`. Audits live as task files in `$HOME/.btwhooks/data/github/blazetrailsdev/trails/todo/` and submit via `/audit-report <slug>` — no PR.

### Spawned-agent constraints

The `prompt-agent` skill auto-appends a "do not delegate / do not recursively spawn sub-agents" footer to every prompt it dispatches. Workers do their own work; oversized tasks split via PR-body follow-ups.

### Future infra (deferred)

- ESLint rule for `_`-prefixed params on Rails-mirroring methods.
- `lint:deps` activesupport rule → blocking once missing migrations land.
- api:compare param-name set comparison.
- `deprecator` / `gemVersion` / `version` removed from main bundle barrel; only via `@blazetrails/activerecord/deprecator` subpath.
