# ActiveRecord API Parity Plan: 100% closed → post-100% Rails-fidelity stories

**Snapshot 2026-05-10 (post-#1391):** `4969/4969 methods (100%) | files: 275/275 | inheritance: 209/209 (100%) | test:compare ~5999/7930 (75.6%)`. Class 1 dead-annotation normalization landed (#1391, ~152 BLOCKED → PERMANENT-SKIP across 14 fully-excluded test files).

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work. Each PR targets ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280). Per-commit splits within each bundle.

---

## In flight

| PR    | Pane | Story                                                                                                                                  |
| ----- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| #1398 | %181 | Timestamp gating fidelity — `recordTimestamps` guard + `_performUpdate updated_on` + dead `_createRecord` cleanup (~30 LOC) — **open** |
| #1399 | %182 | "preserving time objects" inline Topic seed — unskip 5 base.test.ts tests (~50 LOC) — **open**                                         |

---

## Audit reports delivered (triaged into slots below)

- **`audit-validation`** (2026-05-11) — 2 tests, ~30 LOC slot (see followups).
- **`audit-encryption`** (2026-05-11) — 10 tests, 3 slots, ~670 LOC.
- **`audit-i18n`** (2026-05-11) — 11 tests, 1 slot, ~200 LOC.
- **`audit-serialization`** (2026-05-11) — 5 tests, 2 slots, ~310 LOC.
- **`audit-migration`** (2026-05-11) — ~87 tests, 7 slots A–G, ~1430 LOC. See "Migration cluster" below.
- **`audit-schema`** (2026-05-11) — ~128 tests, 10 slots A–J + K annotation sweep, ~2080 LOC. See "Schema cluster" below.
- **`audit-pg-postgresql-adapter`** (2026-05-11) — 25 tests, 4 slots + 1 optional, ~1160 LOC. See "PG-adapter cluster" below.
- **`audit-transactions`** (2026-05-11) — 19 tests, 4 slots + 1 deferred, ~470 LOC. See "Transactions cluster" below.
- **`audit-load-async`** (closed) — proposed Slots A–D contradicted unported sources. Resolved via `load_async_test.rb` full exclusion (#1400).

**Cross-audit overlap:** PG-adapter Slot D + Transactions Slot D both need `secondConnection` test helper + `assertQueriesCount`. Land in PG-adapter Slot D; Transactions Slot D reuses.

---

## Recently merged

`#1371`–`#1384`: TypeMap.aliasType, query-cache fidelity sweep, L-3a/b/c+d, May 8 newly-surfaced bundle, TimeZoneConverter.equals + alias dirty + hollow type stubs, Enum bundle, TransactionManager wiring, TimeWithZone wire, dirty null + test-adapter deserialize, TM currentTransaction migration, Bundle D / #1382 MySQL onUpdate, pg/range cluster finish, TZ test fill-in batch 1.

`#1385`–`#1391`: Bundle C-followups + G (multirange ORM + Enum), Bundle E (transaction/test-infra polish), TZ batch 2 (#1387), load-async exclusion alignment (#1389), Class 1 dead-BLOCKED normalization (#1391, ~152 annotations).

`#1388`, `#1392`–`#1394`: attributeWas auto-timestamp baseline + datetime isChanged (#1388), `ExcludedFile` className filter + load-async thread-pool class exclusions (#1392, denominator −12), typed `SchemaAdapter.innerAdapter` (#1393), `defineSchema` datetime default support + 2 base.test.ts unskips (#1394).

`#1390`, `#1395`–`#1397`: Bundle F — `_arelVisitor` in toSql + `Migration#connectionPool` type (#1390), TimeZoneConversion predicate fix for tsrange/tstzrange (#1395, unblocked 6 range tests), Class 3 — testFile additions for source-only exclusions + orphan BLOCKED cleanup (#1396), Class 2 — per-test BLOCKED normalization in mixed-status test files (#1397, 37 annotations).

---

## Open work-PR bundles

### Load-async residual (reconciled — supersedes audit-load-async Slots A–D)

The audit-load-async deliverable proposed building `FutureResult` / `AsynchronousQueriesTracker` / `Promise` classes in TS. **Those source files are already excluded from api:compare** (`promise.rb`: "native Promise covers #then"; `future_result.rb`: "collapses to the Promise returned by adapter's async exec"; `asynchronous_queries_tracker.rb`: "no equivalent in single-threaded event-loop JS"). Building TS replicas contradicts those exclusions; Slots A/B from the audit are dropped.

What remains, given the exclusions:

- **#1389** normalized 11 dead BLOCKEDs in `asynchronous-queries.test.ts` + per-test excluded 8 thread-pool tests.
- **#1392** added className filter; `LoadAsyncMultiThreadPoolExecutorTest` + `LoadAsyncMixedThreadPoolExecutorTest` (12 tests) excluded.
- Remaining live counterparts: `LoadAsyncTest` (~17) + `LoadAsyncNullExecutorTest` (~10) — exercise the public `Relation#loadAsync` API.

Open question (one decision, then one small slot):

1. **Path A — fully exclude `load_async_test.rb`** (`testFile` addition to existing `promise.rb`/`future_result.rb` entries, or a new entry). The whole concept maps to JS Promise; there's no scheduler to test. ~10 LOC.
2. **Path B — thin `loadAsync()` wrapper** returning a Promise-shaped object with `.value`/`.scheduled`/`.canceled?` + `AsynchronousQueryInsideTransactionError`. No FutureResult, no tracker, no thread-pool — just enough surface to mirror the Rails-test names while collapsing to `Promise.resolve(toArray())`. ~50 LOC + annotation refresh on the ~27 residual tests.

Either way: one slot, not four. Decide on Path A vs B before spawning.

### Encryption cluster (~670 LOC across 3 slots, from audit-encryption)

1. **Slot A — Binary-column encryption fixtures + tests** (~220 LOC). 4 new test-helper factories + 3 test un-skips (`binary data can be encrypted` x2 + `serialized binary data can be encrypted`); schema-fixture additions for `logo` binary column. Foundational; B depends.
2. **Slot B — `messageSerializer` per-encrypts() option pass-through** (~200 LOC). Add to `Scheme` options + `_toOptions` + `withContext`; new msgpack fixture; un-skip 3 msgpack tests. Depends on Slot A.
3. **Slot C — Lazy previousSchemes + store_accessor + insert/defaults + ciphertext constancy** (~250 LOC). Lazy `previousSchemes` getter invalidated by `Configurable.onConfigure`; `EncryptedTrafficLightWithStoreState` fixture; single-row `Base.insert` wrapper; un-skip 4 tests. Three independent wiring fixes — splittable if one explodes.

### i18n cluster (~200 LOC, from audit-i18n)

**Slot A — i18n validation + `RecordInvalid` localization** (~180–230 LOC). `RecordInvalid` constructor uses `I18n.t("activerecord.errors.messages.record_invalid", ...)` with defaultValue fallback; new `I18n.withLocale(locale, fn)` block helper on activemodel `i18n.ts`; rewrite `i18n-generate-message-validation.test.ts` with inline Topic + `I18n.storeTranslations`. Unblocks 11 tests.

### Serialization cluster (~310 LOC across 2 slots, from audit-serialization)

1. **Slot A — `storeAccessor` super-chain + HWIA coercion** (~250 LOC). Install accessors on a dedicated prototype-chain module-class (mirrors Rails' `Module.new { include ... }` pattern); HWIA coercion in `writeStoreAttribute`; `storeAccessor` ConfigurationError on non-serializable/non-structured columns. Un-skip 4 store.test.ts tests.
2. **Slot B — serialized-column join fixture** (~60–80 LOC, optional). Add fixture-style models to `serialization.test.ts`; un-skip 1 join test. Standalone.

### Migration cluster (~1430 LOC across 7 slots, from audit-migration)

1. **Slot A** (~220 LOC) — Migration-method proxies for PG-only DDL (`enableExtension`/`disableExtension`/`createEnum`/`dropEnum`/`renameEnumValue`/`changeColumnComment`/`changeTableComment`/`addUniqueConstraint`/expression-index reversal). 21 un-skips.
2. **Slot B** (~220 LOC) — `tableNamePrefix`/`tableNameSuffix` on `MigrationContext`/`Migration` + CTAS (`create_table … as: <query>`) + `InvalidMigrationTimestampError` for future dates. 6 un-skips.
3. **Slot C** (~200 LOC) — Advisory-lock seams (`generateMigratorAdvisoryLockId`, lock-unavailable/fails-to-release) + `Migrator#runWithoutLock` filtering + migration-detection-without-schema-table. 8 un-skips.
4. **Slot D** (~250 LOC) — Multi-DB `MigrationContext` factory. 7 un-skips.
5. **Slot E** (~220 LOC) — Filesystem migration discovery (subdirectory walk + numeric ordering) + internal-metadata enable/disable toggle + schema-cache invalidation hooks. 8 un-skips.
6. **Slot F** (~180 LOC) — Bulk-alter recorder round-trip + `change-column` test reorg. 6 un-skips.
7. **Slot G** (~140 LOC) — MySQL utf8mb4 init + renameIndex-on-FK adapter parity. 3 un-skips.

### Schema cluster (~2080 LOC across 10 slots + annotation sweep, from audit-schema)

1. **Slot A** (~140 LOC) — SchemaDumper column/argument alignment + `force: :cascade` + create-table options. 5 un-skips.
2. **Slot B** (~180 LOC) — SchemaDumper FK section + ignored-tables + prefix/suffix stripping. 6 un-skips.
3. **Slot C** (~250 LOC) — Index dump metadata (partial WHERE, sort order, length, type, nulls-not-distinct, included columns, expression, opclass). 15 un-skips.
4. **Slot D** (~220 LOC) — Check / exclusion / unique constraints in dumper. 5 un-skips.
5. **Slot E** (~200 LOC) — PG type-specific dump (array limit, decimal precision, interval, oid, float4, enum, infinity, timestamptz) + PG extensions dumping. 11 un-skips.
6. **Slot F** (~200 LOC) — PG `change_column` type/precision/scale/limit + null/default round-trip + timestamptz mapping. 11 un-skips.
7. **Slot G** (~250 LOC) — MySQL active-schema cluster (`drop_table[s]`, `create_database` options, ANSI quotes, utf8mb4 bootstrap, index rename on FK). 25 un-skips.
8. **Slot H** (~280 LOC) — PG schema authorization (SET ROLE/SESSION AUTHORIZATION) + qualified-schema (search_path) support. 22 un-skips.
9. **Slot I** (~250 LOC, exploratory) — PG partitioning + inheritance introspection in dumper. 6 un-skips.
10. **Slot J** (~120 LOC) — `Schema.define` with `tableNamePrefix` + bulk-change timestamps default + SchemaCache portable bits. 5 un-skips.
11. **Slot K** — Annotation normalization across all 128 BLOCKED annotations in schema-mirror files. Lands AFTER A–J.

### PG-adapter cluster (~1160 LOC across 4 slots + 1 optional, from audit-pg-postgresql-adapter)

1. **Slot A** (~220 LOC) — `execInsert` returning-disabled fallback + `extractTableRefFromInsertSql` helper. 4 un-skips.
2. **Slot B** (~260 LOC) — `caseInsensitiveComparison` + cache + `_warnedOids` Set + `PostgreSQLAdapter.decodeDates` static flag. 3 un-skips.
3. **Slot C** (~280 LOC) — Enum OID registration in TypeMapInitializer + `Column.defaultFunction` for arithmetic exprs + ErrorReporter global `:report` wiring. 3 un-skips.
4. **Slot D** (~280 LOC) — **Test infra:** `assertQueriesCount` + `secondConnection` helper + `rawConnection()` accessor. 6 un-skips. **Shared with Transactions Slot D.**
5. **Slot E** (optional, ~120 LOC) — Prepared-statements introspection (`pg_prepared_statements`). 3 un-skips.

### Transactions cluster (~470 LOC across 4 slots + 1 deferred, from audit-transactions)

1. **Slot A** (~120 LOC) — Fixture/annotation cleanup, no infra. ~4 un-skips + annotation corrections on 7 isolation tests. Verifies which "blocked" already pass post-#1348/#1354/#1358.
2. **Slot B** (~120 LOC) — Fixture-model gaps: `Topic+Reply` (`dependent: :destroy`), `Movie` (custom PK), `Cpk::Book` (composite PK). 4 un-skips.
3. **Slot C** (~80 LOC) — Test helpers: `open_transactions` probe + callback-raises listener. 2–3 un-skips.
4. **Slot D** (~150 LOC) — Multi-connection isolation harness. **Subsumed by PG-adapter Slot D**; this slot becomes "wire isolation tests to the shared helper." 4–6 un-skips.
5. **Slot E** (deferred) — Autosave + nested_attributes (depends on `accepts_nested_attributes_for` post-#1239).

### MySQL onUpdate followups (~30 LOC, from #1382)

- **`onUpdate` abstract leakage** — lives in `ColumnOptions` (abstract) and emits `ON UPDATE <expr>` in `addColumnOptions` (abstract). MySQL-specific option leaking into abstract; architecturally PG/SQLite shouldn't see it. Move to a MySQL-specific schema-creation override or guard. Low risk in practice (no PG/SQLite migration ever sets it).
- **Function-default detection narrowness** — `renameColumnForAlter` regex `/^CURRENT_TIMESTAMP(\([0-6]?\))?$/i` only handles CURRENT_TIMESTAMP. `NOW()`, `CURRENT_DATE`, `UUID()` etc. would pass through as quoted literals. In practice these don't appear with `on update` Extra, so not currently an issue.

### Post-merge followups (triaged from #1385–#1391)

**Sized work-PR candidates:**

- **~15 LOC**: Drop `adapter` arg from `MigrationLike#up/down`; wire `migration.connection` in `DefaultStrategy#exec()` matching Rails `Migration#connection`. (#1386 followup)
- **~5 LOC**: Tighten `lookupCastTypeFromJoinDependencies` `joinDependencies` param to `JoinDependency[]` after upgrading `calculations.test.ts` stubs. (#1386 followup)
- **~5 LOC**: Audit other PG query-row callers (`.oid`, `.fmod`, `.rngsubtype`, `.typbasetype`, `.typelem`) for `as number` TypeScript-only casts; replace with `Number(...)`. (#1385 followup)
- **~3 LOC**: PG schema-qualified FROM regex — `_toSqlWithoutSetOp` now handles `"table"` and `` `table` ``; doesn't handle `"schema"."table"`. (#1390 review followup)
- **~20 LOC**: Consolidate `_compileSelectSql` / `_arelVisitor()` / `_compileArelNode` adapter-visitor lookup duplication in `relation.ts`. (#1390 review followup)
- **~10 LOC**: 3 deferred tsrange/tstzrange tests — `timezone array awareness tzrange`, `timezone array awareness tsrange` (need `tstz_ranges`/`ts_ranges` array columns), `timezone awareness tsrange preserve usec`. (#1395 deferred)
- **~10 LOC**: Extract shared `_mapTimeWithZoneToUtc` helper in `time-zone-conversion.ts` — `serialize` and `serializeCastValue` duplicate Range/Array branches. (#1395 review followup)
- **~30 LOC**: Validation audit findings — restore Rails test body for `validate uniqueness with scope invalid syntax` (~10 LOC, no impl change — `uniqueness.ts:49–56` already throws correctly); restore Rails test body + has_many fixture for `validates_associated_with_create_context` (~20 LOC, may bounce to associations slot if CollectionProxy#create needs wiring). Annotation drift in both test files needs sharpening regardless. (audit-validation, 2026-05-11)

**Deferred (need infra or wider design):**

- `_aliasTracker` real semantics on `JoinDependency#joinConstraints` — flagged with `@todo`. (#1386)
- Multirange OID direct lookup via `LEFT JOIN pg_range` (rngmultitypid) — blocked on PG12/13 compat decision. (#1385)
- `encodeRangeLiteral` ↔ `RangeType.encodeLiteral` consolidation into `range.ts` helper. (#1385)

### Test:compare audits queued (read-only research)

36 audit task files queued at `/home/dean/.btwhooks/data/github/blazetrailsdev/trails/todo/`. Already submitted: `audit-type` (closed via #1376/#1377), `audit-query-cache` (closed via #1372), `audit-load-async` (delivered, see slots above). Remaining Tier 1 audits ready to spawn: `audit-i18n`, `audit-validation`, `audit-encryption`, `audit-serialization`.

---

## Architectural (deferred; sized but too big for ~250 LOC slot)

- **Column#default lazy-deserialize broader refactor** (~30 LOC). #1353 closed the array case; broader parity needs Rails-style "store raw default + lazy-deserialize on access" via Column-class refactor. Could fold into a `column.ts` touch; not standalone-worthy.
- **PG `json` driver-level cast bypass** (~80 LOC). `pg` driver always JSON.parses; string assignments don't round-trip on PG. Needs adapter-level intercept of PG's json parsing.
- **Connection-pool / per-thread query-cache architecture** (>300 LOC). audit-query-cache Gap 3. Blocks 14 query-cache tests + the `_pinnedConnection` lifecycle from #1372.

---

## Infra-blocked (not actionable until prereq lands)

- `vi.stubEnv("TZ")` + Temporal test-infra gap.
- Task/Topic fixture models — multiple tests need real models wired to a DB.
- `_queryBySql` opts wiring — pending prepared-statement infrastructure.
- `insertAllBang` / `upsertAll` — separate features; query-cache Gap 5 depends.
- HABTM cache invalidation — query-cache Gap 6 depends on HABTM impl.
- `resetColumnInformation` — query-cache Gap 4 depends.

---

## Story count

| Group                                           | Open | LOC est.        |
| ----------------------------------------------- | ---- | --------------- |
| In flight (#1399, %188, %189, %194, %195, %196) | 6    | ~880            |
| Encryption cluster (audit, Slot A in flight)    | 2    | ~450            |
| i18n cluster (audit, Slot A in flight)          | 0    | —               |
| Serialization cluster (audit, Slot A in flight) | 1    | ~70             |
| Migration cluster (audit)                       | 7    | ~1430           |
| Schema cluster (audit)                          | 11   | ~2080           |
| PG-adapter cluster (audit)                      | 5    | ~1160           |
| Transactions cluster (audit)                    | 4    | ~470            |
| Post-merge followups                            | 7    | ~70             |
| MySQL onUpdate followups                        | 2    | ~30             |
| Test:compare audits queued                      | 33   | n/a (read-only) |
| Architectural deferred                          | 3    | ~410            |
| Infra-blocked                                   | 6    | n/a             |

After Slots A–D land, load-async becomes the largest closed cluster in the post-100% effort. Audits will surface more slots as they run.

---

## Permanent guardrails

### Dual-registry watchpoint

When both a `Base.<X>` static field AND a `<x>.ts` module-level `WeakMap`/`Map` exist for the same concern, treat it as a bug. The live API writes one; helpers read the other; silently. PR #1307 closed `Base._storedAttributes` vs `store.ts:_storedAttributes`. Audit:

```bash
grep -rn "new WeakMap<typeof Base\|new Map<.*Base" packages/activerecord/src
```

### Test:compare workflow

Test:compare un-skip work uses `docs/test-compare-100-plan.md` + `/home/dean/github/blazetrailsdev/test-compare-prompt-template.md`. Audits live as task files in `/home/dean/.btwhooks/data/github/blazetrailsdev/trails/todo/` and submit via `/audit-report <slug>` — no PR.

### Spawned-agent constraints

The `prompt-agent` skill now auto-appends a "do not delegate / do not recursively spawn sub-agents" footer to every prompt it dispatches. Workers do their own work; oversized tasks split via PR-body follow-ups, not via secondary spawn calls.

### Future infra (deferred)

- ESLint rule for `_`-prefixed params on Rails-mirroring methods.
- `lint:deps` activesupport rule → blocking once missing migrations land.
- api:compare param-name set comparison.
- `deprecator` / `gemVersion` / `version` removed from main bundle barrel (#1317); only via `@blazetrails/activerecord/deprecator` subpath.
