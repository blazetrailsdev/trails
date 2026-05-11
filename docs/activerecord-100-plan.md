# ActiveRecord API Parity Plan: 100% closed → post-100% Rails-fidelity stories

**Snapshot 2026-05-11:** `4969/4969 methods (100%) | files: 275/275 | inheritance: 209/209 (100%) | test:compare ~75.6%`.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by 9 audit clusters plus accumulated fidelity polish. Each PR targets ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

This doc is the **current work tracker** (open slots, in-flight PRs, sized followups). For the workflow itself — audit-first cadence, BLOCKED-annotation vocabulary, unported-files conventions, tier 1→4 ordering — see [`test-compare-100-plan.md`](test-compare-100-plan.md).

Closed work is in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`. This doc lists only **open work**.

---

## Open work-PR bundles

### Encryption cluster (~450 LOC across 2 remaining slots)

Slot A closed in #1405. Remaining:

1. **Slot B — `messageSerializer` per-encrypts() option pass-through** (~200 LOC). Add to `Scheme` options + `_toOptions` + `withContext`; new msgpack fixture; un-skip 3 msgpack tests.
2. **Slot C — Lazy previousSchemes + store_accessor + insert/defaults + ciphertext constancy** (~250 LOC). Lazy `previousSchemes` getter invalidated by `Configurable.onConfigure`; `EncryptedTrafficLightWithStoreState` fixture; single-row `Base.insert` wrapper; un-skip 4 tests.

### Serialization cluster (~70 LOC, Slot B remaining)

Slot A closed in #1404. Remaining:

- **Slot B — serialized-column join fixture** (~60–80 LOC, optional). Add fixture-style models to `serialization.test.ts`; un-skip 1 join test.

### Relation cluster (~1660 LOC across 7 slots, from audit-relation)

302 skipped tests across ~14 relation-area files; sub-clusters orthogonal.

1. **Slot A** (~260 LOC) — WhereClause association predicates (core).
2. **Slot B** (~250 LOC) — Polymorphic + CPK predicates in WhereClause.
3. **Slot C** (~220 LOC) — WhereChain `associated` / `missing` branches.
4. **Slot D** (~250 LOC) — Default scope / `all_queries` / unscoped caching invariants.
5. **Slot E** (~220 LOC) — Batches with composite-PK + ordering edge cases.
6. ~~**Slot F** — load_async scheduling~~ **DROPPED.** Auditor missed Step 0; would have built sources unported in #1400. 28 affected tests already permanent-skipped.
7. **Slot G** (~240 LOC) — `PredicateBuilder.registerHandler` + field-ordered-values + calc grouping.
8. **Slot H** (~220 LOC) — Relation misc small-surface bundle.

### Associations-core cluster (~910 LOC across 5 slots, from audit-associations-core)

49 placeholder stubs in `associations.test.ts` — each needs impl + Rails test-body port.

1. **Slot A** (~240 LOC) — Preloader grouping + LoaderQuery hash stability.
2. **Slot B** (~280 LOC) — Composite-FK association runtime (autosave / nullify / append / preload).
3. **Slot C** (~140 LOC) — Instance-dependent scopes (owner-arity lambdas).
4. **Slot D** (~220 LOC) — Collection-proxy fidelity bundle.
5. **Slot E** (~30 LOC, optional) — Annotation re-keying.

### Migration cluster (~1430 LOC across 7 slots, from audit-migration)

1. **Slot A** (~220 LOC) — Migration-method proxies for PG-only DDL (`enableExtension`/`disableExtension`/`createEnum`/`dropEnum`/`renameEnumValue`/`changeColumnComment`/`changeTableComment`/`addUniqueConstraint`/expression-index reversal). 21 un-skips.
2. **Slot B** (~220 LOC) — `tableNamePrefix`/`tableNameSuffix` on `MigrationContext`/`Migration` + CTAS + `InvalidMigrationTimestampError`. 6 un-skips.
3. **Slot C** (~200 LOC) — Advisory-lock seams + `Migrator#runWithoutLock` filtering + migration-detection-without-schema-table. 8 un-skips.
4. **Slot D** (~250 LOC) — Multi-DB `MigrationContext` factory. 7 un-skips.
5. **Slot E** (~220 LOC) — Filesystem migration discovery + internal-metadata enable/disable toggle + schema-cache invalidation hooks. 8 un-skips.
6. **Slot F** (~180 LOC) — Bulk-alter recorder round-trip + `change-column` test reorg. 6 un-skips.
7. **Slot G** (~140 LOC) — MySQL utf8mb4 init + renameIndex-on-FK adapter parity. 3 un-skips.

### Schema cluster (~2080 LOC across 10 slots + annotation sweep, from audit-schema)

1. **Slot A** (~140 LOC) — SchemaDumper column/argument alignment + `force: :cascade` + create-table options. 5 un-skips.
2. **Slot B** (~180 LOC) — SchemaDumper FK section + ignored-tables + prefix/suffix stripping. 6 un-skips.
3. **Slot C** (~250 LOC) — Index dump metadata. 15 un-skips.
4. **Slot D** (~220 LOC) — Check / exclusion / unique constraints in dumper. 5 un-skips.
5. **Slot E** (~200 LOC) — PG type-specific dump + extensions dumping. 11 un-skips.
6. **Slot F** (~200 LOC) — PG `change_column` type/precision/scale/limit + null/default round-trip + timestamptz. 11 un-skips.
7. **Slot G** (~250 LOC) — MySQL active-schema cluster. 25 un-skips.
8. **Slot H** (~280 LOC) — PG schema authorization + qualified-schema (search_path). 22 un-skips.
9. **Slot I** (~250 LOC, exploratory) — PG partitioning + inheritance introspection in dumper. 6 un-skips.
10. **Slot J** (~120 LOC) — `Schema.define` with `tableNamePrefix` + bulk-change timestamps default + SchemaCache portable bits. 5 un-skips.
11. **Slot K** — Annotation normalization across all 128 BLOCKED annotations. Lands AFTER A–J.

### PG-adapter cluster (~1160 LOC across 4 slots + 1 optional, from audit-pg-postgresql-adapter)

1. **Slot A** (~220 LOC) — `execInsert` returning-disabled fallback + `extractTableRefFromInsertSql` helper. 4 un-skips.
2. **Slot B** (~260 LOC) — `caseInsensitiveComparison` + cache + `_warnedOids` Set + `decodeDates` static flag. 3 un-skips.
3. **Slot C** (~280 LOC) — Enum OID registration + `Column.defaultFunction` arithmetic + ErrorReporter `:report` wiring. 3 un-skips.
4. **Slot D** (~280 LOC) — **Test infra:** `assertQueriesCount` + `secondConnection` + `rawConnection()`. 6 un-skips. **Shared with Transactions Slot D.**
5. **Slot E** (optional, ~120 LOC) — Prepared-statements introspection. 3 un-skips.

### Transactions cluster (~470 LOC across 4 slots + 1 deferred, from audit-transactions)

1. **Slot A** (~120 LOC) — Fixture/annotation cleanup, no infra. ~4 un-skips + annotation corrections on 7 isolation tests.
2. **Slot B** (~120 LOC) — Fixture-model gaps: `Topic+Reply`, `Movie` (custom PK), `Cpk::Book` (composite PK). 4 un-skips.
3. **Slot C** (~80 LOC) — Test helpers: `open_transactions` probe + callback-raises listener. 2–3 un-skips.
4. **Slot D** — Wire isolation tests through PG-adapter Slot D's `secondConnection` helper. 4–6 un-skips.
5. **Slot E** (deferred) — Autosave + nested_attributes (depends on `accepts_nested_attributes_for` post-#1239).

### MySQL onUpdate followups (~30 LOC, from #1382)

- **`onUpdate` abstract leakage** — lives in abstract `ColumnOptions`/`addColumnOptions`; MySQL-specific option leaking into abstract layer. Move to MySQL override. Low risk in practice.
- **Function-default detection narrowness** — `renameColumnForAlter` regex only covers `CURRENT_TIMESTAMP`. Bundled into small-followup sweep.

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

### Post-merge fidelity followups (~205 LOC, 18 items)

Small Rails-fidelity polish surfaced via PR reviews + post-merge findings:

- **~15 LOC** — Drop `adapter` arg from `MigrationLike#up/down`; wire `migration.connection` in `DefaultStrategy#exec()`. (#1386)
- **~5 LOC** — Tighten `lookupCastTypeFromJoinDependencies` param to `JoinDependency[]`. (#1386)
- **~5 LOC** — Audit remaining PG query-row callers for `as number` casts → `Number(...)`. (#1385)
- **~3 LOC** — PG schema-qualified FROM regex in `_toSqlWithoutSetOp`. (#1390 review)
- **~20 LOC** — Consolidate `_compileSelectSql` / `_arelVisitor()` / `_compileArelNode` adapter-visitor lookup duplication. (#1390 review)
- **~10 LOC** — Extract shared `_mapTimeWithZoneToUtc` helper in `time-zone-conversion.ts`. (#1395 review)
- **~40 LOC** — 3 deferred tsrange/tstzrange array tests (need `ts_ranges`/`tstz_ranges` array columns). (#1395 deferred)
- **~5 LOC** — Remove `RangeType.encodeLiteral` workaround in `pg/range.ts`. (#1390)
- **~10 LOC** — Audit `PostgreSQLWithBinds.visitArelNodesCasted` — add `resolveValueForDatabase` before `collector.addBind`. (#1390)
- **~5 LOC** — Audit `_performInsert` timestamp block for redundancy. (#1398)
- **~50 LOC** — `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block). Unblocks 2 base.test.ts tests. (#1399)
- **~10 LOC** — i18n minor: `record_invalid` over-populated in `activemodel.errors.messages` namespace. (#1403)
- **~5 LOC** — `_storeAccessorsModules` WeakMap retirement check. (#1404)
- **~10 LOC** — Validate `HashAccessor.write` json-branch JSON-stringify behavior. (#1404)
- **~5 LOC** — MySQL `renameColumnForAlter` extend non-CURRENT_TIMESTAMP function defaults. (#1402)
- **~15 LOC** — `databaseTypeToText` missing `serialized?` branch for layered serialization. (#1405)
- **~10 LOC** — Strengthen `assertEncryptedAttribute` to round-trip via `type.deserialize`. (#1405)
- **~30 LOC** — Validation audit findings: restore Rails test bodies in 2 validation test files. (audit-validation)

### Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous. (#1406)
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage. Plumbing landed in #1406; refresh itself open.
- **~30 LOC** — `postgresql/temporal-type-parsers.ts` still has one eager `import pg from "pg"` (the last per `browser-compat-plan.md`). Move to lazy registry. Blocks browser-bundle smoke tests.

### Test:compare audits queued (read-only research)

25 audit task files queued at `$HOME/.btwhooks/data/github/blazetrailsdev/trails/todo/`. Remaining: 8 PG (virtual-column / infinity / foreign-table / datatype / uuid-residual / interval / connection / long-tail), 7 MySQL (mysql2-adapter / warnings / table-options / schema / quoting / charset-collation / active-schema), 1 SQLite, 4 core (connection-pool / unknown-triage / STI / schema-residual), 6 associations (habtm / has-many-through / has-one / autosave / reflection / extras), plus migration-residual.

---

## Architectural (deferred; sized but too big for ~250 LOC slot)

- **Column#default lazy-deserialize broader refactor** (~50 LOC, #1402 sized). MySQL's `lookupCastType` returns shape-only metadata, so `newColumnFromField` stores raw DB strings. Dumper then emits `"5"` not `5`. Fix: `lookupCastType` returns full type → `Column` stores raw + lazy `deserialize()`. **Blocks ~17 tests in `defaults.test.ts`** (`MysqlDefaultExpressionTest` + siblings). Annotations sharpened in #1402.
- **PG `json` driver-level cast bypass** (~80 LOC). `pg` driver always JSON.parses; string assignments don't round-trip. Needs adapter-level intercept.
- **Connection-pool / per-thread query-cache architecture** (>300 LOC). audit-query-cache Gap 3. Blocks 14 query-cache tests + the `_pinnedConnection` lifecycle from #1372.

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

| Group                         | Open | LOC est.        |
| ----------------------------- | ---- | --------------- |
| In flight                     | 0    | —               |
| Encryption cluster            | 2    | ~450            |
| Serialization cluster         | 1    | ~70             |
| Relation cluster              | 7    | ~1660           |
| Associations-core cluster     | 5    | ~910            |
| Migration cluster             | 7    | ~1430           |
| Schema cluster                | 11   | ~2080           |
| PG-adapter cluster            | 5    | ~1160           |
| Transactions cluster          | 4    | ~470            |
| MySQL onUpdate followups      | 2    | ~30             |
| Post-merge fidelity followups | 18   | ~205            |
| Doc-hygiene + infra followups | 3    | ~30             |
| Test:compare audits queued    | 25   | n/a (read-only) |
| Architectural deferred        | 3    | ~410            |
| Infra-blocked                 | 6    | n/a             |

**66 actionable work-PR slots + 25 queued audits**, ~8910 LOC of open Rails-fidelity work.

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

Test:compare un-skip work uses `docs/test-compare-100-plan.md` + `$HOME/github/blazetrailsdev/test-compare-prompt-template.md`. Audits live as task files in `$HOME/.btwhooks/data/github/blazetrailsdev/trails/todo/` and submit via `/audit-report <slug>` — no PR.

### Spawned-agent constraints

The `prompt-agent` skill auto-appends a "do not delegate / do not recursively spawn sub-agents" footer to every prompt it dispatches. Workers do their own work; oversized tasks split via PR-body follow-ups.

### Future infra (deferred)

- ESLint rule for `_`-prefixed params on Rails-mirroring methods.
- `lint:deps` activesupport rule → blocking once missing migrations land.
- api:compare param-name set comparison.
- `deprecator` / `gemVersion` / `version` removed from main bundle barrel (#1317); only via `@blazetrails/activerecord/deprecator` subpath.
