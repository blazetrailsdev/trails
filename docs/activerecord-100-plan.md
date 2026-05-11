# ActiveRecord API Parity Plan: 100% closed → post-100% Rails-fidelity stories

**Snapshot 2026-05-11:** `4969/4969 methods (100%) | files: 275/275 | inheritance: 209/209 (100%) | test:compare ~75.6%`.

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. Each PR targets ~250 LOC (CLAUDE.md hard ceiling 300; range 220–280).

This doc is the **live work tracker** (in-flight, post-merge followups, story count, guardrails). For per-cluster slot detail (slot descriptions, LOC sizing, audit attribution, overlap notes), see [`activerecord-100-clusters.md`](activerecord-100-clusters.md). For workflow + BLOCKED-annotation vocab + audit conventions, see [`test-compare-100-plan.md`](test-compare-100-plan.md).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`. This doc lists only **open work**.

---

## In flight

`gh pr list --state open` is the live picture. Cluster details for in-flight slots live in [`activerecord-100-clusters.md`](activerecord-100-clusters.md).

| PR    | Story                                                                                  |
| ----- | -------------------------------------------------------------------------------------- |
| #1417 | Transactions Slot A — fixture/annotation cleanup (~120 LOC)                            |
| #1418 | Schema Slot B — FK section + ignored-tables + prefix/suffix (~150 LOC)                 |
| %227  | Encryption Slot C — lazy previousSchemes + store_accessor + insert/defaults (~250 LOC) |

Other panes from this session have either delivered audit reports (triaged into clusters above) or moved their work into the PRs listed.

---

## Post-merge fidelity followups (~270 LOC, 16 items)

> Triage hygiene: two items removed from earlier session triage as stale (Copilot #1419 review caught them): `addUniqueConstraint`/`removeUniqueConstraint` are already implemented in PG with passing tests (#1410 post-pr was outdated); `caseInsensitiveComparison` async runtime-bug is hypothetical — sync-base + no PG override means the call site at `uniqueness.ts:300` safely gets `null` today. Both will be addressed by PG-adapter cluster Slot C's actual scope.

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
- **~50 LOC** — `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block). Unblocks 2 base.test.ts tests. (#1399)
- **~10 LOC** — i18n minor: `record_invalid` over-populated in `activemodel.errors.messages` namespace. (#1403)
- **~10 LOC** — Validate `HashAccessor.write` json-branch JSON-stringify behavior. (#1404)
- **~30 LOC** — Validation audit findings: restore Rails test bodies in 2 validation test files. (audit-validation)
- **~30 LOC** — `validateForeignKey` on `PostgreSQLAdapter`: replace `!fSchema → public` heuristic with `pg_namespace` join for the referenced table in `foreignKeys()` SQL. (#1410 followup)
- **~30 LOC** — `Base.writingRole`/`Base.readingRole` not wired into `currentRole` / `preventWrites`. Extract to new `packages/activerecord/src/roles.ts` constants module to avoid core↔connection-handling circular import. (#1415 followup)
- **~30 LOC** — `mixin_test.rb` "many updates" + "create turned off" un-skips. Blocked only on fixture wiring: `defineSchema` mixins table + `vi.useFakeTimers` for `travel 5.minutes`. (#1416 followup)
- **~5 LOC** — Delete 3 phantom `it.skip` tests with no Rails counterpart: 2 in `modules.test.ts`, 1 in `base.test.ts`. (#1416 followup)
- **~5 LOC** — `SchemaStatements.dropTable` CASCADE: refactor inline `adapterName === "postgres"` check to a PG-specific override. (#1407 followup)
- **~30 LOC** — Wire `tableOptions()` into `schema-dumper.ts:emitTable` so MySQL charset/collation/engine + PG schema options land in the dump. May overlap pg-schema Slot B / Schema Slot E. (#1407 followup)
- **~10 LOC** — `compressIfWorthIt` in `encryptor.ts` uses UTF-8 byte count; for Latin-1 binary payloads, compression threshold fires earlier than Rails. Round-trip correct but threshold drift. (#1409 followup)
- **~5 LOC** — `reconnection_error` test residual: needs `vi.spyOn` on `pg.Pool` constructor. (#1411 followup)
- **~20 LOC** — `translate no connection exception to not established` test residual: needs `pg_terminate_backend` from second connection. (#1411 followup)
- **~10 LOC** — `reconnect after bad connection on check version` test residual: needs proxy returning malformed server_version response. (#1411 followup)

**Closed via #1408:** `_performInsert` block, `_storeAccessorsModules` WeakMap, MySQL non-CT function defaults, `databaseTypeToText` serialized branch + `Serialized.isBinary` delegation, `assertEncryptedAttribute` round-trip.

---

## Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous. (#1406)
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage. Plumbing landed in #1406; refresh itself open.
- **~30 LOC** — `postgresql/temporal-type-parsers.ts` still has one eager `import pg from "pg"` (the last per `browser-compat-plan.md`). Move to lazy registry. Blocks browser-bundle smoke tests.

---

## Test:compare audits queued (read-only research)

**12 audit task files queued** at `$HOME/.btwhooks/data/github/blazetrailsdev/trails/todo/`. Remaining buckets: PG (datatype / uuid-residual / interval / connection / long-tail), MySQL (warnings / table-options / schema / quoting / charset-collation), 2 associations (autosave / reflection / extras), plus migration-residual.

---

## Architectural (deferred; too big for single ~250-LOC slot)

- **Column#default lazy-deserialize broader refactor** (~50 LOC, #1402 sized). MySQL's `lookupCastType` returns shape-only metadata, so `newColumnFromField` stores raw DB strings. Dumper then emits `"5"` not `5`. Fix: `lookupCastType` returns full type → `Column` stores raw + lazy `deserialize()`. **Blocks ~17 tests in `defaults.test.ts`**.
- **PG `json` driver-level cast bypass** (~80 LOC). `pg` driver always JSON.parses; string assignments don't round-trip. Needs adapter-level intercept.
- **Connection-pool / per-thread query-cache architecture** (>300 LOC). audit-query-cache Gap 3. Blocks 14 query-cache tests + `_pinnedConnection` lifecycle.

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

| Group                                     | Open | LOC est.        |
| ----------------------------------------- | ---- | --------------- |
| In flight (#1417, #1418, %227)            | 3    | —               |
| Encryption cluster (C in flight as %227)  | 0    | —               |
| Serialization cluster                     | 1    | ~70             |
| Relation cluster                          | 7    | ~1660           |
| Associations-core cluster                 | 5    | ~910            |
| Associations-HABTM cluster                | 9    | ~1690           |
| Associations has-many-through cluster     | 5    | ~1280           |
| Associations has-one cluster              | 4    | ~480            |
| Migration cluster                         | 6    | ~1210           |
| Connection-pool cluster                   | 3    | ~640            |
| MySQL active-schema cluster               | 3    | ~680            |
| MySQL mysql2-adapter cluster              | 3    | ~700            |
| SQLite adapter cluster                    | 2    | ~120            |
| PG infinity cluster                       | 1    | ~250            |
| PG foreign-table cluster                  | 1    | ~230            |
| PG virtual-column cluster                 | 2    | ~400            |
| PG-schema audit cluster                   | 3    | ~530            |
| Unknown-triage cluster                    | 4    | ~640            |
| STI annotation-drift                      | 1    | ~20             |
| Schema cluster (A closed; B in flight)    | 8    | ~1540           |
| PG-adapter cluster                        | 3    | ~620            |
| Transactions cluster (A in flight)        | 3    | ~350            |
| MySQL onUpdate followups                  | 2    | ~30             |
| NotImplementedError elimination (Phase 2) | 7    | ~610            |
| Post-merge fidelity followups             | 16   | ~270            |
| Doc-hygiene + infra followups             | 3    | ~30             |
| Test:compare audits queued                | 12   | n/a (read-only) |
| Architectural deferred                    | 3    | ~410            |
| Infra-blocked                             | 6    | n/a             |

**90 actionable work-PR slots + 12 queued audits**, ~14.7k LOC of open Rails-fidelity work. (Associations clusters overlap — real net is ~12k LOC after dedup.)

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
