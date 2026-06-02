# activerecord — prioritized work plan (test:compare 100% + Rails fidelity)

> **Snapshot 2026-06-02 (refreshed).** A prioritized, dependency-sensitive,
> **executable** ordering of the PRs that close `test:compare` to 100% and
> finish Rails-fidelity cleanup. Each story carries our source anchors
> (`file:line`), the Rails source reference, the tests it moves, an LOC
> estimate, dependencies, and an acceptance line.
>
> **2026-06-02 refresh:** Waves 0–1 (Phase A) shipped; Wave 2 shipped; most of
> Wave 3's PG/MySQL type families + 3.1/3.misc shipped. Of the four architectural
> blockers (the canonical numbered list lives in §"The dependency spine"),
> **three of four are satisfied on `main`** — #1 ConnectionHandler (Story 4.1),
> #2 AliasTracker / join-table aliasing (Story 7.2), and #4 global Arel-visitor
> removal (Phase A, Stories 1.1–1.4); **#3, the `type_for_attribute` cast refactor
> (Story 3.PG-enum), is still open and still gating.** Separately, the Wave-7
> infra stories 7.1/7.3 landed and 7.4/7.5 were pre-shipped/no-ops. See per-wave
> headers for the PR list and the remaining follow-ups discovered post-merge.
>
> **Anchor verification status:** Waves 0–3 `file:line` anchors were verified
> against the tree on 2026-06-01. Waves 4–7 anchors are doc-sourced and **to be
> confirmed by the campaign's audit PR** — line numbers drift (e.g. the
> 100-plan's `destroyAssociations` "persistence.ts:1236" is actually `:1313`
> today), so re-`grep` before editing. Never trust a cited line blindly.
>
> Sources: [`activerecord-index.md`](activerecord-index.md),
> [`activerecord-100-plan.md`](activerecord-100-plan.md),
> [`activerecord-gaps.md`](activerecord-gaps.md),
> [`adapter-architecture-cleanup.md`](adapter-architecture-cleanup.md),
> [`activerecord-type-audit.md`](activerecord-type-audit.md), plus the live
> in-tree skip histogram. The 100-plan owns batch detail; this doc owns the
> **order** and the **per-story spec**.
>
> **Goals:** (1) `test:compare` 100%; (2) Rails fidelity.
> `api:compare` is already closed (4969/4969).

## How to read this plan

**Counts are indicative; refresh before starting any story.** The per-file
numbers in `activerecord-100-plan.md` Part 2 are dated **2026-05-18 and are
stale** — e.g. `hash-config` showed 34 pending there but has **0** live
`it.skip` today (shipped since). Authoritative source of truth:

```bash
pnpm test:compare --cached --json --package activerecord     # matched/skipped/missing per file (JSON)
pnpm test:compare --package activerecord --incomplete        # rendered per-file table, complete files hidden
grep -rn "BLOCKED:" packages/activerecord/src --include='*.test.ts' \
  | sed 's/.*BLOCKED: //' | cut -d' ' -f1 | sort | uniq -c | sort -rn   # category histogram
```

**Rails source lives at `vendor/rails/activerecord/`** — `lib/active_record/…`
for implementation, `test/cases/…` for tests. (The 100-plan's
`scripts/api-compare/.rails-source/…` path no longer exists — do not use it.)

**Two work shapes — every test:compare story is one or the other:**

- **un-skip** — an `it.skip(...)` stub already exists with a
  `BLOCKED/ROOT-CAUSE/SCOPE` annotation. Flip it, fix the named cause, commit.
- **port-missing** — Rails has the test, we never wrote it (`missing > 0`, no
  stub). Generate stubs with `pnpm test:stubs` (→
  `scripts/test-compare/generate-stubs.ts`), then write bodies under the
  **exact** Rails name (CLAUDE.md: never rename).

**Ready vs audit-gated.** Stories in Waves 0–3 carry verified line numbers and
are ready to dispatch. The association (285) + relation (199) tail in Wave 7 is
**audit-gated by design**: per the 100-plan methodology the first PR of each
deep cluster is a **read-only `/audit-report`** that produces the sized,
line-numbered slots. Fabricating line numbers for ~480 tests across dozens of
files would be wrong (the staleness above proves why) — the audit is the spec
step, and this plan schedules it explicitly.

**Story template:**

```
### Story <id> — <title>   `[un-skip|port|impl|fidelity]`  ~<LOC>  ·  dep: <ids|none>
- Ours:   <path:line> — <what to change>
- Rails:  vendor/rails/<path:line> — <reference behavior>
- Tests:  <test file> — <which / count> (refresh via test:compare)
- Done:   <acceptance criterion>
```

## Current state

- **api:compare**: 100% — not a goal.
- **test:compare** (cached, 2026-06-02): 6917/7856 passing-matched (**88%**),
  ~932 skipped, 4 misplaced. Up from 6826/7867 (86.8%) / ~1034 skipped on
  2026-06-01: **+91 passing, −102 skipped** across the Wave 0–7-blocker merges.
- **In flight / recently merged**: Waves 0–2, Phase A of Wave 1, the Wave-3
  PG/MySQL type families, and the Wave-7 infra stories (7.1/7.2/7.3, plus
  7.4/7.5 pre-shipped/no-op) all landed 2026-06-01→02. Open work: Wave 1 Phase
  B/C, Wave 3 schema-dumper subtrack + 3.PG-enum (BLOCKER #3, still gating),
  Waves 4.2/4.3/5.2/6, and the Wave 7 campaigns.

### Live skip-annotation histogram (ground truth, 2026-06-02)

```
associations 277 │ relation 178 │ adapter-pg 173 │ schema 112 │ connection-pool 69
adapter-mysql 42 │ fixture 39 │ migration 27 │ transactions 18 │ type 14
unknown 8 │ query-cache 4 │ serialize 3 │ serialization 2 │ nested-attributes 2
adapter-sqlite 2   (+~10 residual 1-off malformed tags: the/needs/STI/SQLite/…)
```

Delta vs 2026-06-01: associations 285→277, relation 199→178, adapter-pg 185→173
(PG type-family un-skips), adapter-mysql 62→42 (MySQL un-skips), schema 119→112,
transactions 32→18 (Story 5.1). GVL is gone (reclassified by Story 0.1); the ~40
malformed bucket dropped to ~10 1-offs (Story 0.2). Note **connection-pool 60→69
and migration 15→27 went UP** — newly-ported stubs landed as skips faster than
they were cleared; those are the next campaigns. (This run is on `main` after
#2811/#2814/#2826 merged.)

## The dependency spine (why this order)

Rule (from the 100-plan): **isolated → integrated**. `associations`/`relation`
touch everything, so closing them early means re-opening them every time a
lower-tier fix lands. The two biggest buckets (285 + 199 ≈ 44% of all skips)
come **last**.

Four hard architectural blockers gate the most downstream work — the critical
path. **As of 2026-06-02, three of four are satisfied:**

1. ✅ **ConnectionHandler P9 port** (was: gates connection-pool 60 + per-thread
   query-cache + multi-db). Story 4.1 was a **no-op** — handler 23/23 +
   merge-and-resolve skips already unblocked on `main`. Waves 4.2/4.3/6 are now
   dep-clear.
2. ✅ **AliasTracker / join-table aliasing** (gates nested-through / eager /
   join-model). Resolved by Story 7.2 (#2808) — routed nested-through INNER
   joins through JoinDependency. **⚠ review fixes did not land in the merge —
   see the ~60 LOC follow-up under Story 7.2.** 1 cross-arg-collision skip
   remains.
3. **`type_for_attribute` cast refactor** (>300 LOC) → gates enum write-casting
   - several relation/type tests. _Lead PR: Story 3.PG-enum — still open._
4. ✅ **Global Arel visitor removal** — Phase A (Stories 1.1–1.4) shipped
   (#2768/#2769/#2774/#2810); zero production `<node>.toSql()` with a connection
   in scope remains. Phase B/C (1.5/1.6, the `syncHandlerVisitor` dance) still
   open but now dep-clear.

**Externally blocked — do NOT schedule:**

- `StandaloneConnection` (`connection-adapters/standalone-connection.test.ts`, 4
  tests) — vendored `connection_pool.rb` has no `StandaloneConnection`; needs a
  Rails source refresh.
- `adapter.ts` deletion / `DatabaseAdapter` removal — Phase G fixtures (deferred).
- `accepts_nested_attributes_for` (`associations/nested-error.test.ts`, 4) — Phase G.

Permanent skips (`load_async`, GVL, Marshal/YAML, rake/dbconsole) are
**reclassified, not implemented** — Story 0.1.

---

## Wave 0 — Free denominator + tracking hygiene ✅ shipped (#2777, #2778)

Both stories landed 2026-06-01:

- **Story 0.1** — reclassify permanent-skips (`load_async`/`FutureResult`, GVL,
  Marshal/YAML, `SimpleDelegator`) into `scripts/api-compare/unported-files.ts`
  — **#2777**. GVL bucket gone from the histogram.
- **Story 0.2** — normalize malformed `BLOCKED:` tags to the canonical
  vocabulary — **#2778**. The ~40 malformed bucket dropped to ~10 1-offs.

**Follow-up bullet (from #2779 finding):** the `resolver.test.ts` "url missing
scheme" divergence is a documented JS-vs-Ruby behavior gap (trails has no
symbols; scheme-less string → env lookup → `AdapterNotSpecified`, pinned by
`connection-handling.test.ts`). Move it from a live `it.skip` into
`unported-files.ts` as a documented divergence (~5 LOC) so it stops counting as
a live skip.

---

## Wave 1 — Fidelity foundation: global Arel visitor removal (de-risks Waves 2–3)

Supersedes #2600. Siblings off `main`, non-overlapping files, **A → B → C**.

- Rails reference (all of Phase A): adapters own their visitor —
  `vendor/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb`
  (`@visitor = arel_visitor`) and compile through it via
  `…/abstract/database_statements.rb:12` (`to_sql(arel)`). Rails has **no**
  process-global visitor. Our analog already exists:
  `connection-adapters/abstract/database-statements.ts` `toSql(arel)`.

### Phase A (Stories 1.1–1.4) ✅ shipped (#2768, #2769, #2774, #2810)

Route all production `<node>.toSql()` callers through the connection's visitor:

- **1.1** — DDL/metadata callers — **#2768** (scope was smaller than estimated:
  only `migration.ts:1921` `createTable` actually remained).
- **1.2** — persistence + base callers — **#2769** (all 6 persistence + 3 base
  sites converted; no `: x.toSql()` fallback remains).
- **1.3** — calculations + statement-cache + insert-all — **#2774**.
- **1.4** — grep-sweep remainder — **#2810**. Done-criteria met: **zero
  production `<arel-node>.toSql()` with a connection in scope remains.**

**Follow-up bullets:**

- (from #2768) latent ~250+ LOC: a genuine `SchemaCreation` port so the adapter
  owns the DDL visitor (Rails `schema_creation.accept(td)`), instead of
  `TableDefinition.toSql()` self-compiling. Only if full DDL-compilation
  fidelity becomes a goal; `schema-statements.ts:164` `createTable` correctly
  stays on `td.toSql()` (a `TableDefinition`, never touched the global visitor).
- (from #2810) the order-array fallback (`query-methods.ts:416,499`) +
  `BoundSqlLiteral` baking (`:1465,1485`) deliberately stay on arel-default
  `ToSql` — a direct `.connection` there can throw `ConnectionNotEstablished` in
  adapter-less join-model contexts. Revisit only if Phase B exposes a
  never-throw connection accessor.

### Story 1.5 — Phase B: drop AR's global-sync sites `[fidelity]` ~30 LOC · dep: 1.4 ✅ (deps satisfied)

- Ours: `base.ts:979` (`setToSqlVisitor(…)` in the `Base.adapter =` setter) —
  delete; `test-setup-ar.ts` reset becomes a no-op.
- Keep: `setToSqlVisitor` + default `ToSql` stay in **arel** (`packages/arel`,
  `nodes/node.ts:33-35` `new _registry.ToSql!().compile(this)`) — arel is
  dialect-agnostic and its tests rely on the default. We only remove AR
  injecting a dialect into it.
- Done: no production path mutates the arel global.

### Story 1.6 — Phase C: delete the `syncHandlerVisitor` test dance `[tests-only]` ~per-grep · dep: 1.5

- Ours: ~635 `syncHandlerVisitor`/`setupHandlerSuite` sites
  (`grep -rn "syncHandlerVisitor\|setupHandlerSuite" packages/activerecord/src`).
  With the global no longer dialect-synced these `beforeEach` calls are dead.
- Done: grep returns zero; full AR suite green in CI.

**Parallel fidelity items (any time, independent files):** DatabaseTasks
**P3-5** — move the `puts` formatting from the CLI into
`tasks/database-tasks.ts` `migrateStatus()` (~911) to match
`vendor/rails/activerecord/lib/active_record/railties/databases.rake` /
`DatabaseTasks#migrate_status` (~302); `inheritance.ts`
`initializeInternalsCallback` JSDoc fix (~2 LOC); type-audit **W1b** variadic
overloads (`relation.ts:~822,941` `as any`).

---

## Wave 2 — Tier 1 isolated un-skips ✅ shipped (#2779, #2784, #2785, #2796)

All four stories landed 2026-06-01. Several files turned out already-ported
(the 2026-05-18 counts were stale — the actual work was un-skipping, not
porting). Per-story status + the post-merge remainders:

### Story 2.1 — DB-config cluster ✅ shipped (#2779)

- `resolver.test.ts` un-skipped 2/3; `hash-config` (was 34) + `url-config` were
  already 100% (0 skip / 0 missing). Test-only.
- **Stale-count correction:** `merge-and-resolve-default-url-config.test.ts` has
  **1** remaining skip, not the 7 the plan claimed (gated on Wave 4 / ConnectionHandler — but 4.1 is a no-op, so this is now dep-clear).
- **Follow-up (separate impl story, NOT a one-liner):** `database-selector.test.ts`
  "preventing writes works in a threaded environment" (BLOCKED: async-isolation).
  `connectedToStack` is a mutable array shallow-copied by
  `IsolatedExecutionState.scope`, so concurrent async tasks bleed `preventWrites`
  across each other. Needs per-scope array instances (Ruby uses thread-local).

### Story 2.2 — forbidden-attributes + view ✅ partially shipped (#2784)

- **forbidden-attributes-protection.test.ts: 13/16** (the story's first half).
  `view.test.ts` (21) was **deferred entirely (0/21)**.
- **Follow-up — "view-a" PR (~200 LOC, feasible now):** `createView`/`dropView`
  not yet in `connection-adapters/abstract/schema-statements.ts` (`views()` +
  `viewExists()` already exist). Ship ~15 feasible tests; leave 6 cross-blocked:
  `does not dump view as table` (×2, **gated on Story 3.4**); `UpdateableViewTest`
  (×4, PG/MySQL-only → needs a second named pool / multi-adapter run).
- **Follow-up — 3 remaining forbidden-attributes skips:** `sti inheritance column`
  needs STI dispatch at `new` wired (`subclassFromAttributes` exists at
  `inheritance.ts:596` but isn't called from the ctor; ~40 LOC + careful
  regression — naïve wiring regressed `inheritance.test.ts`). The 2
  strong-params nested-association cases are **Phase-G** (immediate in-memory
  nested build; `ship-part.ts` also missing `acceptsNestedAttributesFor`).

### Story 2.3 — validations root + i18n ✅ shipped (#2785)

- All three target files at 100%. The convention root
  `packages/activerecord/src/validations.test.ts` was already 21/21 (the plan's
  "~19 missing" claim was stale); work was un-skipping i18n + association-validation.
- **Follow-up (tidy, ~2 tests):** delete the redundant subdir file
  `packages/activerecord/src/validations/validations.test.ts` (not
  test:compare-mapped; duplicates 2 tests in the root file).
- **Deviation (own story if `valid?` fidelity matters):** trails `valid?` does
  NOT run uniqueness synchronously (registered into `_asyncValidations`, run on
  save) — JS can't block on the async DB query.

### Story 2.4 — type cluster + shared InTimeZone helper ✅ shipped (#2796)

- Shipped the reusable `test-helpers/in-time-zone.ts` + two small real fixes;
  un-skipped the type cluster. **BLOCKED:type 20→14**, adapter-pg 201→199. The
  `BLOCKED: type` annotations were stale — `timeZoneAwareAttributes` +
  `TimeZoneConverter` were already wired.
- **Follow-ups now unblocked by the shipped `InTimeZone` helper** (left out to
  keep the PR focused): `date-time-precision.test.ts:139` "formatting datetime …
  when time zone aware"; `adapters/postgresql/infinity.test.ts:117` "assigning
  'infinity' on a datetime column with TZ aware attributes".
- **Follow-up (~medium, fold into Story 3.PG-\* type work):** NaN decimal support
  (`numeric fields with nan`) — `DecimalType` has no NaN representation;
  BigDecimal-NaN sentinel + `'NaN'::numeric` serialization needed.
- **Follow-up (~15 LOC):** give `buildDateTime` (and time/timestamp paths) the
  same `Time`-rollover guard `buildDate` got — needs the datetime overflow tests
  to prove it (none un-skipped yet).

---

## Wave 3 — Tier 2 adapter + schema (largest isolated yield: pg 185 + schema 119 + mysql 62)

After Wave 1 (connection-derived SQL). PG/MySQL type files are independent
siblings; the schema-dumper subtrack is ordered.

### Story 3.1 — KNOWN_DSL_TYPES expansion ✅ shipped (#2794)

- Expanded `schema-dumper.ts` `KNOWN_DSL_TYPES` (+ case-insensitive
  `KNOWN_DSL_TYPES_BY_LOWER` lookup) to cover the PG range/network/timestamptz
  types. One real behavioral fix (`bitVarying` no longer falls through to the
  `enum` catch-all); rest is drift-prevention. Prereq for 3.2/3.3 — now unblocked.
- **Follow-ups (pre-existing skips in `schema-dumper.test.ts`, ~Story 3.2):**
  "schema dump with timestamptz datetime format" (~80 LOC — Rails maps
  timestamptz to `:datetime` with precision); "interval type" + "oid type"
  (~30–50 LOC, still generic `t.column`); PG extension dumping (alphabetic
  order); array/limit/enum dump gaps (float4 limit, array limit, decimal array
  defaults, enum-with-comma).

### Story 3.2 — schema-dumper table/partition/comment polish ✅ shipped (#1458, #1469, #1665)

- **No-op** per `project_story_3_2_schema_dumper_polish_already_done` —
  `tableOptions`/`comment`/`partition` shipped earlier; `SchemaCreateTableOptionsTest`
  5/5 green. Do not re-spawn.

### Story 3.3 — route `emitTable` through the `columnSpec` hook → **re-scoped to Epic 3.3-U** `[impl, architectural]` · dep: 3.1 ✅

- Ours: `connection-adapters/abstract/schema-dumper.ts:33` `columnSpec` / `:53`
  `prepareColumnOptions` are **dead vs live dumps** — `schema-dumper.ts`
  `emitTable` (~943) builds `colspec` inline and never calls them, so every
  adapter's `prepareColumnOptions` override is unreachable (#1723).
- **Re-scoped (not a ~50 LOC wiring).** The abstract/dialect `columnSpec`
  helpers emit Ruby `schema.rb` strings (`precision: nil`, `-> { … }`,
  virtual `type: :integer`, `size: :tiny`) while the live `emitTable` emits
  TypeScript-DSL literals (`precision: null`, `default: () => "…"`). They also
  diverge on the default data-path (`cleanDefault` + `sqlTypeToDsl` extraOpts
  vs `column.*` + `schemaDefault`/`typeCastForSchema`), and `AdapterSchemaSource`
  sets `column.type = col.sqlType` (`"varchar(255)"`), so `schemaType` can't
  resolve the dsl helper. A faithful wire is the **representation-unification
  epic** below, not a single PR.

### Epic 3.3-U — schema-dumper representation unification `[architectural, multi-PR]` · dep: 3.1 ✅

Route live dumps through the Rails-shaped `columnSpec` hook so per-adapter
`prepareColumnOptions` overrides take effect. Split into non-overlapping
sibling PRs (CLAUDE.md heuristic: prep the surface, then privates follow):

- **Story 3.3-U1 — TS-emittable columnSpec helpers + raw colspec formatter ✅ shipped (#2826)**
  `[impl]` ~80 LOC. Made the _abstract base_ dumper helpers emit
  directly-emittable TypeScript-DSL text (`schemaPrecision` datetime-nil
  `"nil"`→`"null"`; `schemaExpression` `-> { … }`→`() => …`), and added a
  Rails-faithful **raw** colspec formatter (`formatColspecRaw`, mirrors Rails
  `format_colspec` — values emitted verbatim, not re-quoted by `formatColspec`).
  `columnSpec` stays unwired (no live-output change); fully unit-verifiable on
  SQLite, no live DB. **Files: `connection-adapters/abstract/schema-dumper.ts`,
  `schema-dumper.ts` + their `*.test.ts` only** (no dialect files → no conflict
  with sibling PG/MySQL agents).
- **Story 3.3-U2 — AdapterSchemaSource resolves dsl-type + raw sqlType**
  `[impl]` ~90 LOC · dep: U1 ✅ (deps satisfied). `AdapterSchemaSource.columns()`
  currently maps `col.sqlType` into `ColumnInfo.type`. Carry the dsl cast type in
  `type` and the raw SQL type in a new `sqlType` field so `schemaType`/`schemaLimit`/
  `schemaPrecision` work on live columns. Convert **all remaining dialect
  Ruby-isms** to TS text + update their unit tests: virtual `type: :sym` /
  `size: :sym` outputs **and** `mysql/schema-dumper.ts` `schemaPrecision`
  datetime-precision-0 `"nil"`→`"null"` (U1 only fixed the abstract base).
- **Story 3.3-U3 — route `emitTable` through `columnSpec`** `[impl]` ~120 LOC ·
  dep: U2. Replace the inline `colspec` block with `columnSpec` /
  `columnSpecForPrimaryKey` + `formatColspecRaw`; reconcile defaults
  (`cleanDefault`→`schemaDefault`), incl. the abstract `columnSpecForPrimaryKey`
  `spec["default"] ??= "nil"` Ruby-ism (explicit-PK-default path) → `"null"`;
  update round-trip snapshots; verify live PG/MySQL in CI (needs
  `TEST_ADAPTER=postgresql`/`mysql2`).
- **U3 still gates:** PG serial dump logic (currently in base `emitTable`, folds
  into PG subclass once U3 lands — #2816 finding); `comment.test.ts` dump-bearing
  tests; `type_to_sql` unmapped-type uppercasing (#2824 finding, RISKY).

### Story 3.4 — SchemaDumpingHelper port + charset-collation dump `[impl + port]` ~165 LOC · dep: 3.3 (Epic 3.3-U / U3)

- Ours: port `SchemaDumpingHelper#dump_table_schema` (live-DB schema-dump →
  string). Then Batch 52: `charset-collation.test.ts` "schema dump includes
  collation" + SQL-fragment unit tests.
- Rails: `test/support/schema_dumping_helper.rb`; `test/cases/adapters/mysql2/
charset_collation_test.rb:79-84`.
- Done: charset-collation + the SchemaDumpingHelper-gated schema un-skips green.

### Story 3.PG-\* — PostgreSQL type families `[un-skip + impl]` — mostly shipped · dep: 3.3 (Epic 3.3-U) for dump-bearing ones

One sibling PR per family. **adapter-pg histogram 185→173.** Per-family status:

| Family                  | Status   | Notes                                                                                                                                                               |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serial` (12)           | ✅ #2816 | 12/12; serial dump logic in base `emitTable`, folds into PG subclass when 3.3-U3 lands                                                                              |
| `array` (8→6)           | ✅ #2813 | un-skipped 2 + fixed insertFixture/truncate execute binds; 6 remain (serialize machinery, DDL exception translation, hstore[], TimeZone registry, timestamp[] usec) |
| `uuid` (3)              | ✅ #2812 | un-skipped disable-joins-through; 3 remain (uuid migration + 2 legacy-migrator dump — migration framework + 3.3)                                                    |
| `money` (3)             | ✅ #2817 | 3/3 via MoneyDecoder OID-790 wiring                                                                                                                                 |
| `bytea` (3→6 skip)      | ✅ #2818 | un-skipped 2 via-to-sql; `serialize` remains (general write-path, see follow-up); 5 trails-invented skips have no Rails counterpart                                 |
| `timestamp` (7)         | ✅ #2822 | un-skipped 4/6; 2 remain (`timestamp migration`, no Rails counterpart + should be deleted; `group by date`, needs fixtures framework)                               |
| `hstore` (9)            | ✅ #2814 | un-skipped 3 DDL; 6 remain (2 permanent YAML/Marshal, 1 no-Rails-counterpart, 1 Wave-8 migration, 2 serialize-coder)                                                |
| `network`/`cidr`/`inet` | ✅ no-op | shipped #1812/#1553; network 8/8 + cidr 3/3, zero skips. Don't re-spawn                                                                                             |
| `range`/`multirange`    | ✅ no-op | shipped #1383 etc.; 46/46, zero skips. Don't re-spawn                                                                                                               |
| `interval`              | ✅ no-op | shipped #1687/#1727; 7 tests, zero skips. Don't re-spawn                                                                                                            |
| `oid` families          | ✅ no-op | entire `postgresql/` tree has zero real skips; no `oid_test.rb` in Rails. Don't re-spawn                                                                            |

**Cross-cutting follow-ups surfaced by these PRs (each its own story):**

- **General serialize write-path (~150–300 LOC)** — wire `Base.serialize` to
  decorate the cast type with `Type::Serialized` (exists at `type/serialized.ts`,
  currently unused) instead of the read-only `readAttribute` monkey-patch in
  `serialize.ts`. Fixes dump-on-write for json/yaml/array/hash/binary at once;
  unblocks bytea `serialize` + the 2 hstore serialize-coder skips (#2818, #2814).
- **General pluck/calculate result type-casting (~80–150 LOC)** — `pluck` casts
  nothing, `sum` only numerically; cast via `Result.columnTypes` (OID-based) per
  Rails `type_cast_pluck_values`/`type_cast_calculated_value` (#2817).
- **Fixture::FixtureError port (~30 LOC)** — `insertFixture` silently ignores
  unknown fixture columns; Rails raises (#2813).
- **CI gap (infra):** `adapters/postgresql/**` is NEVER run by CI (needs
  `TEST_ADAPTER=postgresql` + live PG). All the PG un-skips above were verified
  locally only. Worth a CI lane.

### Story 3.PG-enum — enum write-casting (`type_for_attribute` refactor) `[impl, BLOCKER #3]` >300 LOC, split · dep: none

- Ours: `where({ enumCol: "label" })` value serialization isn't wired through
  the type caster (serialize path shipped #2687; cast path remains). Requires
  the `type_for_attribute` cast refactor — split via `<base>`/`<base>b`.
- Rails: `lib/active_record/enum.rb`, `lib/active_record/model_schema.rb`
  (`type_for_attribute`).
- Tests: `relation` "missing with enum\*" (5), enum where-casting cases.
- Done: string-label enum predicates cast correctly; the 5 relation enum skips green.

### Story 3.MY-\* — MySQL adapter fidelity `[un-skip + impl]` — partially shipped · dep: none

Ours/Rails: `adapters/abstract-mysql-adapter/*` ↔
`test/cases/adapters/abstract_mysql_adapter/*_test.rb`. **adapter-mysql
histogram 62→45.** Per-bundle status:

| Bundle                                  | Status      | Notes                                                                                                                                                                               |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter-prevent-writes` (Audit-M1, 11) | ✅ #2823    | 12/12; guard on `execute`/`executeMutation`/`execQuery`                                                                                                                             |
| `bind-parameter` (6)                    | ✅ #2815    | 10/10; adapter-level coercion (no relation-layer string-quoting at this layer)                                                                                                      |
| `mysql-boolean` (6)                     | ✅ #2820    | 6/6; `resetColumnInformation` now clears table-scoped schema cache for all adapters                                                                                                 |
| `mysql-enum` (3)                        | ⚠ 2/3 #2821 | end-anchored the `unsigned?` regex; 3rd ("enum with attribute") blocked on **general enum label mass-assignment** (writeAttribute bypasses the enum macro setter — NOT a MySQL gap) |
| `case-sensitivity` (7)                  | open        | —                                                                                                                                                                                   |
| B110/B131/B49 column-metadata           | open        | `mysql2-adapter.ts#columns`, `new_column_from_field` parity                                                                                                                         |

**Follow-ups (cross-adapter, from #2823):**

- ~1 LOC: PG `execQuery` override (`postgresql-adapter.ts:732`) is still unguarded
  for prevent-writes — add `checkIfWriteQuery` to match MySQL.
- ~5 LOC: `ReadOnlyError` message diverges from Rails (`"…while in readonly
mode: #{sql}"`); align across PG/SQLite/MySQL.

**Follow-up (from #2796):** MySQL `decimal(N,0)` now reflects as
`DecimalWithoutScale` (precision/scale extraction fix) — may unblock/affect
MySQL decimal expectations; scan when picking up the remaining bundles.

**CI gap:** MySQL adapter tests need `TEST_ADAPTER=mysql2` + live MariaDB (port
13306); CI does not exercise them. `mysql2-adapter.test.ts` "throws for invalid
charset" is a pre-existing failure under MariaDB 11.8 (not introduced by #2823).

### Story 3.misc — generic adapter + comment ✅ partially shipped (#2824) · dep: 3.3 (Epic 3.3-U) for comment

- Un-skipped 4 `adapter_test.rb` tests (`isValidType`/`valid_type?`,
  `tableAliasFor`/`tableAliasLength`); 18→22 matched. **~53 skips remain**,
  clustered:
  - **comment.test.ts (17, deferred)** — `CommentTest` gated on
    `supports_comments?` (false on SQLite); needs live PG/MySQL **plus 3.3-U3's
    columnSpec/dumper hook** for dump-bearing tests.
  - **schema cluster (~6)** — `remove index when name and wrong column name` (×2,
    needs accounts fixture + ArgumentError); exception-translation;
    `type_to_sql for unmapped types` (RISKY — same native-type-unification as 3.3).
  - **fixture cluster (~20)** — needs accounts/posts/subscribers/authors/Event/Book
    fixtures wired into `adapter.test.ts`.
  - **adapter-mysql / adapter-pg / transactions / connection-pool / query-cache**
    clusters — blocked on their respective frameworks / `TEST_ADAPTER`.

---

## Wave 4 — connection-pool / multi-db (gated cluster, 60)

### Story 4.1 — ConnectionHandler P9 port ✅ no-op (already on `main`) `[BLOCKER #1 satisfied]`

- Per `project_story_4_1_connectionhandler_already_done`: handler 23/23 +
  merge-and-resolve skips were **already unblocked on `main`**. The full
  `ConnectionHandler` surface is present; no PR needed. Don't re-spawn.
- This satisfies BLOCKER #1 — Waves 4.2/4.3/6 are now dep-clear.

### Story 4.2 — second named pool (ARUnit2Model) `[impl + un-skip]` ~150 LOC · dep: 4.1 ✅ (deps satisfied)

- Ours: add a second named connection pool to test infra (Rails' `ARUnit2Model`).
- Rails: `test/cases/helper.rb` (`ARUnit2Model`), `multiple_db_test.rb`.
- Unblocks: `MultiDbMigratorTest` ×7, `PrimaryClassTest` ×2,
  `multiple-db.test.ts` (11).

### Story 4.3 — pool/handler file campaign `[un-skip]` ~250 LOC × N · dep: 4.1 ✅ (deps satisfied)

- Ours/Rails: `connection-adapters/connection-handler.test.ts` (11),
  `connection-pool.test.ts` (10), `connection-management.test.ts` (11),
  `connection-swapping-nested.test.ts` (7), `pooled-connections.test.ts` (3),
  handlers-multi-_ ↔ matching `test/cases/connection_adapters/_\_test.rb`.
- 🚫 Skip `standalone-connection.test.ts` (4) — externally blocked.

---

## Wave 5 — Tier 3 transactions + migration (32 + 15)

### Story 5.1 — transaction callbacks + isolation ✅ shipped (#2797)

- Test-only PR: un-skipped 6 Rails-faithful tests (5 in
  `transaction-callbacks.test.ts`, 1 in `transactions.test.ts`) against the
  existing `transactions.ts` impl. **transactions histogram 32→18.** Batch 81
  (new-record rollback dirty-tracking) was already implemented; the 4
  `transaction-isolation.test.ts` "skips" are adapter-capability gates, not
  actionable.
- **Follow-ups (each needs production work, out of 5.1 scope):**
  - **HIGH RISK / own story** — touch → transactional commit/rollback callbacks
    (3 tests): `timestamp.ts` `touch` builds a direct UPDATE, fires only
    after_touch; wiring `withTransactionReturningStatus` risks regressing many
    touch tests.
  - **Needs ordering-flag decision** — after_commit reverse-ordering; our impl
    runs commit callbacks in definition order (pinned by `CallbackOrderTest`);
    `run_after_transaction_callbacks_in_order_defined=false` would conflict.
  - **~focused PR + regression** — Batch 80 (`update()`/`updateBang()` →
    property setters; deliberately uses a raw `writeAttribute` loop today).
  - Plus: `belongs_to touch:true` parent callbacks; before_commit DB-write in
    same tx; deprecated `run_commit_callbacks_on_first_saved_instances_in_transaction`
    flag (2 tests); create-through-association; "call after rollback when commit
    fails" (needs a test-layer commit-monkeypatch hook).
  - 2 instrumentation skips are genuine env gaps (reconnect-with-restore;
    in-memory SQLite can't fail rollback) — left as-is.

### Story 5.2 — migration runner `[un-skip + impl]` ~200 LOC · dep: none

- Ours: `migration.test.ts` (7), `invertible-migration.test.ts` (4); Batch 48
  (CommandRecorder `changeTable` inversion), B132 (`migration.ts:~1908` delegate
  to `adapter.createTableDefinition`), Batch 153 (MockMigration port +
  `test-adapter.ts` raise-on-duplicate gate).
- Rails: `test/cases/migration_test.rb`, `invertible_migration_test.rb`; impl
  `lib/active_record/migration.rb`, `migration/command_recorder.rb`.

---

## Wave 6 — query-cache (gated on Wave 4)

### Story 6.1 — query-cache un-skips `[un-skip + impl]` ~120 LOC · dep: 4.1 ✅ (deps satisfied)

- Ours: `query-cache.test.ts` (live ~25; live mixin shipped #2662/#2672/#2684).
  Remaining is per-thread architecture depending on the pool — Batch 64 wiring
  remainder; `Base.cache`/`uncached` class methods; `QueryCache.run`/`complete`
  - `installExecutorHooks` (Phase 4, was blocked on ConnectionHandler PR 6 →
    unblocked by 4.1).
- Rails: `test/cases/query_cache_test.rb`; impl
  `lib/active_record/connection_adapters/abstract/query_cache.rb`.

---

## Wave 7 — Tier 4 integrated: associations (285) + relation remainder — LAST

Infra PRs first, then per-file campaigns. Each campaign's exact slots come from
a `/audit-report` pass (read-only, no PR) per 100-plan methodology — schedule
the audit as the campaign's first task.

### Association infra (unblocks the campaigns)

#### Story 7.1 — wire `destroyAssociations` ✅ shipped (#2800)

- Wired the empty `destroyAssociations` hook into the destroy flow (mirrors
  Rails ordering: before_destroy → destroy_associations → destroy_row); removed
  the HABTM `beforeDestroy` bridge + `HABTM_DESTROY_INSTALLED` flag.
  `habtm-destroy-order.test.ts` now 4/4. **Unblocks the habtm campaign.**
- **Follow-up (~5 LOC, optional, low priority):** drop the `"delete"` alias in
  favor of `"deleteAll"` only, to match Rails `:delete_all` naming — only worth
  doing inside a broader `:dependent`-naming cleanup, NOT standalone.

#### Story 7.2 — join-table aliasing ✅ shipped (#2808) `[BLOCKER #2 satisfied]`

- Per `project_story_7_2_aliastracker_already_done`: the `AliasTracker` class was
  already on `main`; the real gap was the INNER `joins()` nested-through-source
  resolver. Fixed by routing nested-through INNER joins through `JoinDependency`
  with `InnerJoin` (`constructJoinDependency` joinType + `_namedInnerJoins`);
  un-skipped the 2 named nested-through tests (65/1). **Satisfies BLOCKER #2 —
  unblocks eager / join-model / cascaded-eager / nested-through campaigns.**
- **⚠ HIGHEST-PRIORITY FOLLOW-UP (~60 LOC, #2808 finding): the review fixes did
  NOT land in the merged commit** (merge raced ahead of the review-response
  commit). 5 fixes + a regression test were implemented & verified locally but
  are absent from `main`. They share one root cause — `_namedInnerJoins` is a
  new (4th) join store and several sites that enumerate join stores weren't
  updated:
  1. **(HIGH, user-visible bug)** `relation/merger.ts#mergeJoins` drops
     `_namedInnerJoins` on the immutable `merge()` path.
  2. `or` structural-compat omits `_namedInnerJoins` (`STRUCTURAL_FIELDS` in
     `relation/query-methods.ts`).
  3. `relation.ts#isEmptyScope` omits `_namedInnerJoins`.
  4. `relation.ts#referencesEagerLoadedTables` can't see named-inner-join table
     aliases (spurious eager-load promotion).
  5. (defensive) unbounded recursion guard in `relation.ts#_throughChainHasNestedSource`.
     Open one small follow-up PR with fixes 1–5 + the regression test from a fresh
     branch off updated `main`.
- **Follow-up (~80–150 LOC):** un-skip `"polymorphic has many through joined
different table twice"` (1 remaining cross-arg-collision skip) — different
  shape (two separate `joins()` args colliding on `chefs`); needs a set-level
  collision check.

#### Story 7.3 — composite-FK HMT write (Batch 20) ✅ shipped (#2806)

- Consolidated the has_many ids-writer onto a single Rails-faithful
  `CollectionAssociation#idsWriter` (composite-PK via per-tuple `findBy`,
  simple-PK via one `where`+index_by; raises `RecordNotFound`). `setIds` is now a
  thin delegate. Un-skipped 2 CPK write tests in `autosave-association.test.ts`.
- **Follow-up (unblocked by this PR):** Batch 14 CPK `ids=`/`setIds` sweep — grep
  for remaining CPK ids skips and un-skip those that pass.

#### Story 7.4 — JoinDependency HABTM + whereBang references (Batch 74) ✅ impl pre-shipped `[impl]` · dep: 7.2 ✅ (deps satisfied)

- Per `project_story_7_4_jd_habtm_wherebang_already_done`: impl already on `main`
  (#2521 `_addThroughViaJoinAssociation` + #2608 whereBang references at
  `query-methods.ts:774`). The test-only un-skip lands 2 Rails-mirrored HABTM
  eager tests via canonical fixtures.
- **Follow-up (1 deferred test):** `conditions-on-join-table` blocked by
  `Developer.lastName` virtual-attr SELECT + unregistered `developers` fixtures.

#### Story 7.5 — collection-target dedup / inverse-of (B119) ✅ shipped (#2583 impl + #2811 un-skips)

- Per `project_story_7_5_collection_dedup_already_done`: the inverse-of
  `_replacedOrAddedTargets` WeakSet dedup shipped in **#2583** on the live
  CollectionProxy path (impl was already on `main`). Follow-up **#2811** then
  un-skipped 5 portable `inverse-associations.test.ts` tests against it.
  Remaining skips are other features. **Satisfies the `inverse` campaign's 7.5 dep.**

### Association + relation campaigns (audit-gated)

Each row: schedule `/audit-report <slug>` → triage into ~250-LOC slots → un-skip.
Ours ↔ Rails (`vendor/rails/activerecord/test/cases/<ruby>`). **As of 2026-06-02
all four infra deps (7.1/7.2/7.4-impl/7.5) are satisfied — every "Needs 7.x" row
below is dep-clear and ready to audit** (subject to the 7.2 review-fix follow-up
landing for `merge()`-bearing eager cases):

| Campaign         | Ours                                                        | Rails                                                       | ~skips | Needs                       |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | -----: | --------------------------- |
| eager            | `associations/eager.test.ts`                                | `associations/eager_test.rb`                                |     70 | 7.2 ✅, 7.4 ✅              |
| join-model       | `associations/join-model.test.ts`                           | `associations/join_model_test.rb`                           |     41 | 7.2 ✅; DidYouMean (B1972)  |
| strict-loading   | `strict-loading.test.ts`                                    | `strict_loading_test.rb`                                    |     30 | —                           |
| has-one          | `associations/has-one-associations.test.ts`                 | `associations/has_one_associations_test.rb`                 |     28 | fixture data folded in      |
| relation-scoping | `scoping/relation-scoping.test.ts`                          | `scoping/relation_scoping_test.rb`                          |     28 | STI type-constraint (#1983) |
| inverse          | `associations/inverse-associations.test.ts`                 | `associations/inverse_associations_test.rb`                 |     23 | 7.5 ✅                      |
| habtm            | `associations/has-and-belongs-to-many-associations.test.ts` | `associations/has_and_belongs_to_many_associations_test.rb` |     23 | 7.1 ✅                      |
| where            | `relation/where.test.ts`                                    | `relation/where_test.rb`                                    |     23 | polymorphic fixtures        |
| cascaded-eager   | `associations/cascaded-eager-loading.test.ts`               | `associations/cascaded_eager_loading_test.rb`               |     18 | 7.2 ✅                      |
| has-one-through  | `associations/has-one-through-associations.test.ts`         | `associations/has_one_through_associations_test.rb`         |     16 | —                           |
| nested-through   | `associations/nested-through-associations.test.ts`          | `associations/nested_through_associations_test.rb`          |     12 | 7.2 ✅                      |
| where-chain      | `relation/where-chain.test.ts`                              | `relation/where_chain_test.rb`                              |     12 | join aliasing               |
| callbacks        | `associations/callbacks.test.ts`                            | `associations/callbacks_test.rb`                            |     12 | —                           |
| counter-cache    | `counter-cache.test.ts`                                     | `counter_cache_test.rb`                                     |      5 | Batch 134                   |

**Relation still-blocked (flag, schedule after infra):** `eager_load` toSql +
STI + non-preload (3, assoc track A5); `missing`-with-enum (5, → Story 3.PG-enum

- join aliasing); parameterized join strings R6c (2, design needed).

---

## Net path to 100%

1. **Wave 0** trims the target (reclassify permanent-skips; normalize tags).
2. **Waves 2–3** are the highest mechanical yield (~280 isolated skips) and the
   safest to parallelize across agents.
3. **Three of the four architectural blockers are now satisfied** (#1
   ConnectionHandler/4.1, #2 AliasTracker/7.2, #4 Arel-removal/Wave 1 Phase A);
   **#3 `type_for_attribute` (Story 3.PG-enum) is the last one open.** The
   Wave-7 infra stories (7.1/7.3/7.4/7.5) the campaigns wait on are also done.
4. **Wave 7 campaigns** are the long tail (~300 association+relation skips),
   each opened by a read-only audit, executed last.

## Conventions (CLAUDE.md — apply to every story)

- ≤500 LOC per PR; split via non-overlapping **sibling** branches off `main`
  (`<base>`/`<base>b`/`<base>c`), **not** stacked PRs.
- Use `scripts/start-worktree.sh`; leave the default worktree for the user.
- Open in draft; run `/link <PR#>` after opening; `/post-merge-findings` after merge.
- Never rename Rails-derived test names; run only touched test files locally.
- Refresh counts with `pnpm test:compare --cached --package activerecord` after each merge.
