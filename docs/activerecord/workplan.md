# activerecord — per-story specs (test:compare 100% + Rails fidelity)

> **⚠ Ordering moved (2026-06-02 reconcile).** Sequencing, the complete skip
> inventory, the CI-lane analysis, and the per-file table now live in
> **[`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md)** —
> that doc is authoritative for **what order to do things in**. **This doc is now
> the per-story SPEC source**: source anchors (`file:line`), Rails references,
> tests moved, LOC estimates, dependencies, acceptance lines. Pick the phase/
> story in the attack plan, then come here for the spec. The wave→phase crosswalk
> below maps the two.
>
> **Snapshot 2026-06-02 (open work only).** Lists **only unfinished work** —
> shipped stories/waves are removed entirely (not tombstoned), so the spawn-loop
> only sees pickable items.
>
> **One architectural blocker is still open and gating:** the
> `type_for_attribute` cast refactor (Story 3.PG-enum → attack-plan **I-2**).
> Note `typeForAttribute` itself exists (`enum.ts:78`); the gap is the
> where/predicate-builder cast path. ConnectionHandler, AliasTracker / join-table
> aliasing, and global Arel-visitor removal are satisfied on `main`.
>
> **Anchor verification status:** Waves 0–3 `file:line` anchors were verified
> against the tree on 2026-06-01. Waves 4–7 anchors are doc-sourced — line
> numbers drift, so re-`grep` before editing. Never trust a cited line blindly.
>
> Sources: [`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md)
> (ordering + inventory), [`activerecord-index.md`](activerecord-index.md),
> [`activerecord-100-plan.md`](activerecord-100-plan.md),
> [`activerecord-gaps.md`](activerecord-gaps.md),
> [`adapter-architecture-cleanup.md`](adapter-architecture-cleanup.md),
> [`activerecord-type-audit.md`](activerecord-type-audit.md).
>
> **Goals:** (1) `test:compare` 100%; (2) Rails fidelity.
> `api:compare` is already closed (4969/4969).

## Wave → phase crosswalk

The attack plan's phases supersede these waves for ordering. Each wave's stories
keep their specs below; find them by this map:

| This doc (wave/story)                                                      | Attack-plan phase / story                                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Wave 0 (resolver divergence)                                               | Phase 0 — H-3 (reclassify)                                                                    |
| Wave 1 (Arel-visitor tail, DatabaseTasks P3-5, type W1b)                   | Phase 2 — F-8 + fidelity follow-ups                                                           |
| Wave 2 (Tier-1 follow-ups: view-a, forbidden-attrs, TZ-aware, NaN decimal) | Phase 2 — F-6/F-8                                                                             |
| Wave 3 Epic 3.3-U2/U3 (schema-dumper)                                      | Phase 1 — **I-1**                                                                             |
| Wave 3 Story 3.PG-enum (type_for_attribute)                                | Phase 1 — **I-2**                                                                             |
| Wave 3 serialize / pluck-cast cross-cutting                                | Phase 1 — **I-3 / I-4**                                                                       |
| Wave 3 Story 3.4 / 3.PG-\* / 3.MY-\*                                       | Phase 3 — adapter type-families (needs **I-5** for CI)                                        |
| Wave 3 Story 3.misc (adapter_test fixtures)                                | Phase 2 — **F-7**                                                                             |
| Wave 4 Story 4.3 (pool campaign)                                           | Phase 2 — **F-2**                                                                             |
| Wave 5 Story 5.2 (migration runner)                                        | Phase 2 — **F-3**                                                                             |
| Wave 5 Story 5.1 follow-ups (transactions)                                 | Phase 2 — **F-4**                                                                             |
| Wave 6 Story 6.1 (query-cache)                                             | Phase 2 — **F-5**                                                                             |
| Wave 7 (associations + relation)                                           | Phase 4 — integrated tail (LAST)                                                              |
| —                                                                          | Phase 0 — H-1/H-2 (misplaced/missing); Phase 1 — I-5 (CI job); Phase 2 — F-1 (insert_all, 41) |

## How to read this plan

**Counts are indicative; refresh before starting any story.** The per-file
numbers in `activerecord-100-plan.md` Part 2 are dated **2026-05-18 and are
stale**. Authoritative source of truth:

```bash
pnpm test:compare --cached --json --package activerecord     # matched/skipped/missing per file (JSON)
pnpm test:compare --package activerecord --incomplete        # rendered per-file table, complete files hidden
grep -rn "BLOCKED:" packages/activerecord/src --include='*.test.ts' \
  | sed 's/.*BLOCKED: //' | cut -d' ' -f1 | sort | uniq -c | sort -rn   # category histogram
```

**Rails source lives at `vendor/rails/activerecord/`** — `lib/active_record/…`
for implementation, `test/cases/…` for tests.

**Two work shapes — every test:compare story is one or the other:**

- **un-skip** — an `it.skip(...)` stub already exists with a
  `BLOCKED/ROOT-CAUSE/SCOPE` annotation. Flip it, fix the named cause, commit.
- **port-missing** — Rails has the test, we never wrote it (`missing > 0`, no
  stub). Generate stubs with `pnpm test:stubs` (→
  `scripts/test-compare/generate-stubs.ts`), then write bodies under the
  **exact** Rails name (CLAUDE.md: never rename).

**Ready vs audit-gated.** Stories in Waves 0–3 carry verified line numbers and
are ready to dispatch. The association + relation tail in Wave 7 is
**audit-gated by design**: per the 100-plan methodology the first PR of each
deep cluster is a **read-only `/audit-report`** that produces the sized,
line-numbered slots.

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
- **test:compare** (cached, 2026-06-02): **6959/7856 (88.6%)**, **890 skipped**,
  3 missing, 15 wrong-describe, 4 misplaced. (Authoritative per-file counts +
  histogram now live in the attack plan §1 / Appendix A — refresh there.)

## Ordering & the dependency spine → see the attack plan

The "why this order" reasoning (isolated→integrated; biggest buckets last; the
CI-lane analysis) now lives in
[`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md) §2. This doc
no longer duplicates it. Two items kept here because they're spec-level facts:

**Externally blocked — do NOT schedule:**

- `StandaloneConnection` (`connection-adapters/standalone-connection.test.ts`, 4
  tests) — vendored `connection_pool.rb` has no `StandaloneConnection`; needs a
  Rails source refresh.
- `adapter.ts` deletion / `DatabaseAdapter` removal — Phase G fixtures (deferred).
- `accepts_nested_attributes_for` (`associations/nested-error.test.ts`, 4) — Phase G.

**Permanent skips** (`load_async`, GVL, Marshal/YAML, rake/dbconsole): the intent
is reclassify-not-implement, but **~19 are still live `it.skip`** in counted files
(source-verified 2026-06-02) — see attack-plan Story **H-3** for the list and the
reclassification work.

---

## Wave 0 — tracking hygiene

**Follow-up (from #2779 finding):** the `resolver.test.ts` "url missing scheme"
divergence is a documented JS-vs-Ruby behavior gap (trails has no symbols;
scheme-less string → env lookup → `AdapterNotSpecified`, pinned by
`connection-handling.test.ts`). Move it from a live `it.skip` into
`unported-files.ts` as a documented divergence (~5 LOC) so it stops counting as
a live skip.

---

## Wave 1 — global Arel visitor removal (tail)

### Story 1.6 — Phase C: delete the `syncHandlerVisitor` test dance `[tests-only]` ~per-grep · dep-clear

- Ours: ~635 `syncHandlerVisitor`/`setupHandlerSuite` sites
  (`grep -rn "syncHandlerVisitor\|setupHandlerSuite" packages/activerecord/src`).
  With the global no longer dialect-synced these `beforeEach` calls are dead.
- Done: grep returns zero; full AR suite green in CI.

**Follow-up bullets:**

- (from #2768) latent ~250+ LOC: a genuine `SchemaCreation` port so the adapter
  owns the DDL visitor (Rails `schema_creation.accept(td)`), instead of
  `TableDefinition.toSql()` self-compiling. Only if full DDL-compilation
  fidelity becomes a goal; `schema-statements.ts:164` `createTable` correctly
  stays on `td.toSql()`.
- (from #2810) the order-array fallback (`query-methods.ts:416,499`) +
  `BoundSqlLiteral` baking (`:1465,1485`) deliberately stay on arel-default
  `ToSql` — a direct `.connection` there can throw `ConnectionNotEstablished` in
  adapter-less join-model contexts. Revisit only if Phase C exposes a
  never-throw connection accessor.

**Parallel fidelity items (any time, independent files):** DatabaseTasks
**P3-5** — move the `puts` formatting from the CLI into
`tasks/database-tasks.ts` `migrateStatus()` (~911) to match
`DatabaseTasks#migrate_status` (~302); `inheritance.ts`
`initializeInternalsCallback` JSDoc fix (~2 LOC); type-audit **W1b** variadic
overloads (`relation.ts:~822,941` `as any`).

---

## Wave 2 — Tier 1 follow-ups

The four Wave-2 stories landed; these residual follow-ups remain (each its own
story):

- **2.1 — async-isolation:** `database-selector.test.ts` "preventing writes
  works in a threaded environment". `connectedToStack` is a mutable array
  shallow-copied by `IsolatedExecutionState.scope`, so concurrent async tasks
  bleed `preventWrites`. Needs per-scope array instances (Ruby uses
  thread-local).
- **2.2 — "view-a" PR (~200 LOC, feasible now):** `createView`/`dropView` not
  yet in `connection-adapters/abstract/schema-statements.ts` (`views()` +
  `viewExists()` already exist). Ship ~15 feasible `view.test.ts` tests; leave 6
  cross-blocked: `does not dump view as table` (×2, gated on Story 3.4/U3);
  `UpdateableViewTest` (×4, PG/MySQL-only → second named pool / multi-adapter).
- **2.2 — 3 remaining forbidden-attributes skips:** `sti inheritance column`
  needs STI dispatch at `new` wired (`subclassFromAttributes` exists at
  `inheritance.ts:596` but isn't called from the ctor; ~40 LOC + careful
  regression). The 2 strong-params nested-association cases are **Phase-G**.
- **2.3 — tidy (~2 tests):** delete the redundant subdir file
  `packages/activerecord/src/validations/validations.test.ts` (not
  test:compare-mapped; duplicates 2 tests in the root file).
- **2.3 — deviation (own story if `valid?` fidelity matters):** trails `valid?`
  does NOT run uniqueness synchronously (registered into `_asyncValidations`,
  run on save) — JS can't block on the async DB query.
- **2.4 — TZ-aware un-skips (now unblocked by the shipped `InTimeZone` helper):**
  `date-time-precision.test.ts:139` "formatting datetime … when time zone
  aware"; `adapters/postgresql/infinity.test.ts:117` "assigning 'infinity' on a
  datetime column with TZ aware attributes".
- **2.4 — fold into Story 3.PG-\* type work:** NaN decimal support (`numeric
fields with nan`) — `DecimalType` has no NaN representation; BigDecimal-NaN
  sentinel + `'NaN'::numeric` serialization needed.
- **2.4 — ~15 LOC:** give `buildDateTime` (and time/timestamp paths) the same
  `Time`-rollover guard `buildDate` got — needs the datetime overflow tests to
  prove it (none un-skipped yet).

---

## Wave 3 — Tier 2 adapter + schema (largest isolated yield)

The PG/MySQL type families, 3.1, 3.2, 3.3-U1, the 3.4 helper port, and the
3.misc first batch have landed. Remaining:

### Epic 3.3-U — schema-dumper representation unification `[architectural, multi-PR]`

Route live dumps through the Rails-shaped `columnSpec` hook so per-adapter
`prepareColumnOptions` overrides take effect (U1 landed). Remaining:

- **Story 3.3-U2 — AdapterSchemaSource resolves dsl-type + raw sqlType**
  `[impl]` ~90 LOC · dep-clear. `AdapterSchemaSource.columns()` currently maps
  `col.sqlType || col.type` into `ColumnInfo.type`, collapsing dsl-type and raw
  sql-type. Carry the dsl cast type in `type` and the raw SQL type in a new
  `sqlType` field so `schemaType`/`schemaLimit`/`schemaPrecision` work on live
  columns. Convert **all remaining dialect Ruby-isms** to TS text + update their
  unit tests: virtual `type: :sym` / `size: :sym` outputs **and**
  `mysql/schema-dumper.ts` `schemaPrecision` datetime-precision-0
  `"nil"`→`"null"` (U1 only fixed the abstract base).
- **Story 3.3-U3 — route `emitTable` through `columnSpec`** `[impl]` ~120 LOC ·
  dep: U2. Replace the inline `colspec` block with `columnSpec` /
  `columnSpecForPrimaryKey` + `formatColspecRaw`; reconcile defaults
  (`cleanDefault`→`schemaDefault`), incl. the abstract `columnSpecForPrimaryKey`
  `spec["default"] ??= "nil"` Ruby-ism → `"null"`; update round-trip snapshots;
  verify live PG/MySQL in CI (`TEST_ADAPTER=postgresql`/`mysql2`).
- **U3 still gates:** PG serial dump logic (currently in base `emitTable`, folds
  into PG subclass once U3 lands — #2816 finding); `comment.test.ts`
  dump-bearing tests; the `id: { type, collation }` PK wrapping +
  native-default `limit` suppression; `type_to_sql` unmapped-type uppercasing
  (#2824 finding, RISKY).

### Story 3.4 — charset-collation dump (remaining) `[un-skip]` · dep: 3.3-U3

- The staged `it.skip("schema dump includes collation")` in
  `adapters/abstract-mysql-adapter/charset-collation.test.ts` un-skips once U3
  lands; re-derive its PROVISIONAL regexes against real U3 output. Also un-skip
  `mysql-enum.test.ts:43` `it.skip("schema dumping")` (same wiring). Verify on a
  MySQL/MariaDB whose db-default collation ≠ `utf8mb4_bin` (local 13306 is
  `utf8mb4_bin`, which would suppress the `id` collation; CI's fresh `mariadb:11`
  differs).

### Story 3.PG-\* — PostgreSQL type-family residuals · dep: 3.3-U3 for dump-bearing ones

Per-family **residual** skips:

| Family          | Residual skips                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `array` (6)     | serialize machinery, DDL exception translation, hstore[], TimeZone registry, timestamp[] usec               |
| `uuid` (3)      | uuid migration + 2 legacy-migrator dump (migration framework + 3.3)                                         |
| `bytea`         | `serialize` (general write-path, see follow-up); 5 trails-invented skips have no Rails counterpart          |
| `timestamp` (2) | `timestamp migration` (no Rails counterpart, should be deleted); `group by date` (needs fixtures framework) |
| `hstore` (6)    | 2 permanent YAML/Marshal, 1 no-Rails-counterpart, 1 Wave-8 migration, 2 serialize-coder                     |

**Cross-cutting follow-ups (each its own story):**

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
  `TEST_ADAPTER=postgresql` + live PG). All PG un-skips were verified locally
  only. Worth a CI lane.

### Story 3.PG-enum — enum write-casting (`type_for_attribute` refactor) `[impl, BLOCKER #3]` >300 LOC, split · dep: none

- Ours: `where({ enumCol: "label" })` value serialization isn't wired through
  the type caster (serialize path shipped #2687; cast path remains). Requires
  the `type_for_attribute` cast refactor — split via `<base>`/`<base>b`.
- Rails: `lib/active_record/enum.rb`, `lib/active_record/model_schema.rb`
  (`type_for_attribute`).
- Tests: `relation` "missing with enum\*" (5), enum where-casting cases.
- Done: string-label enum predicates cast correctly; the 5 relation enum skips green.

### Story 3.MY-\* — MySQL adapter fidelity (remaining) `[un-skip + impl]` · dep: none

| Bundle                        | Status / Notes                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `mysql-enum` (1)              | "enum with attribute" blocked on **general enum label mass-assignment** (writeAttribute bypasses the enum macro setter — NOT a MySQL gap) |
| B110/B131/B49 column-metadata | `mysql2-adapter.ts#columns`, `new_column_from_field` parity                                                                               |

**Follow-ups (cross-adapter, from #2823):**

- ~1 LOC: PG `execQuery` override (`postgresql-adapter.ts:732`) is still
  unguarded for prevent-writes — add `checkIfWriteQuery` to match MySQL.
- ~5 LOC: `ReadOnlyError` message diverges from Rails (`"…while in readonly
mode: #{sql}"`); align across PG/SQLite/MySQL.
- (from #2796) MySQL `decimal(N,0)` now reflects as `DecimalWithoutScale`
  (precision/scale extraction fix) — may unblock/affect MySQL decimal
  expectations; scan when picking up the remaining bundles.

**CI gap:** MySQL adapter tests need `TEST_ADAPTER=mysql2` + live MariaDB (port
13306); CI does not exercise them. `mysql2-adapter.test.ts` "throws for invalid
charset" is a pre-existing failure under MariaDB 11.8.

### Story 3.misc — generic adapter + comment (remaining) `[un-skip]` · dep: 3.3-U3 for comment

~53 skips remain in `adapter.test.ts`, clustered:

- **comment.test.ts (17)** — `CommentTest` gated on `supports_comments?` (false
  on SQLite); needs live PG/MySQL **plus 3.3-U3's columnSpec/dumper hook** for
  dump-bearing tests.
- **schema cluster (~6)** — `remove index when name and wrong column name` (×2,
  needs accounts fixture + ArgumentError); exception-translation;
  `type_to_sql for unmapped types` (RISKY — same native-type-unification as 3.3).
- **fixture cluster (~20)** — needs accounts/posts/subscribers/authors/Event/Book
  fixtures wired into `adapter.test.ts`.
- **adapter-mysql / adapter-pg / transactions / connection-pool / query-cache**
  clusters — blocked on their respective frameworks / `TEST_ADAPTER`.

---

## Wave 4 — connection-pool / multi-db (pool campaign remainder)

### Story 4.3 — pool/handler file campaign (remaining batches) `[un-skip]` ~250 LOC × N · dep-clear

Remaining skipped clusters, by size (from #2837 finding):

- `connection-pool.test.ts` (18) — largest; sub-cluster to stay under 500 LOC.
- `connection-adapters/connection-handler.test.ts` (9) — writing-role
  validation, custom-pool-switch, fork/pid clusters (some likely
  Ruby-process-semantics permanent skips — verify against
  `scripts/api-compare/unported-files.ts` before un-skipping).
- `connection-handling.test.ts` (6) — permanent-checkout / `#connection`
  deprecation-alias cluster.
- `connection-adapters/connection-handlers-multi-db.test.ts` (2) — threaded-env
  - multi-db relation loading.
- `connection-management.test.ts` (2) — non-joinable-transaction clearing +
  async-query cancellation.
- 🚫 `standalone-connection.test.ts` (4) — externally blocked, skip.

---

## Wave 5 — transactions + migration

### Story 5.2 — migration runner (remaining batches) `[un-skip + impl]` ~200 LOC · dep: none

The raise-on-duplicate + method-missing un-skips landed (#2799); the rest of the
migration-runner campaign is still open and **actionable, not externally
blocked** (11 live `it.skip` tagged `BLOCKED: migration — migration runner gap`,
the histogram's `migration 27` bucket spanning these plus adapter-gated cases):

- Ours: `migration.test.ts` (7 — migration-copy feature: timestamps/magic-
  comments/same-plugin/non-existing+empty dirs at `:2659,2666,2682,2689,2696`;
  `migration instance has connection` `:1343`; `name collision across dbs`
  `:1462`, tagged connection-pool); `invertible-migration.test.ts` (4 — Batch 48
  CommandRecorder inversion: revert `change_column_default` `:170`, table-name
  prefix `:321`, add-index-on-expression `:367`, add-check-constraint invalid
  option `:417`). Plus Batch 132 (`migration.ts:~1908` delegate to
  `adapter.createTableDefinition`).
- Rails: `test/cases/migration_test.rb`, `invertible_migration_test.rb`; impl
  `lib/active_record/migration.rb`, `migration/command_recorder.rb`.
- Done: the 11 migration-runner skips green; sub-cluster to stay under 500 LOC
  (migration-copy vs CommandRecorder-inversion are natural sibling splits).

### Story 5.1 follow-ups

Open follow-ups from the transaction-callbacks story (each needs production
work, own story):

- **HIGH RISK / own story** — `touch` → transactional commit/rollback callbacks
  (3 tests): `timestamp.ts` `touch` builds a direct UPDATE, fires only
  after_touch; wiring `withTransactionReturningStatus` risks regressing many
  touch tests.
- **Needs ordering-flag decision** — after_commit reverse-ordering; our impl
  runs commit callbacks in definition order (pinned by `CallbackOrderTest`);
  `run_after_transaction_callbacks_in_order_defined=false` would conflict.
- **~focused PR + regression** — Batch 80 (`update()`/`updateBang()` → property
  setters; deliberately uses a raw `writeAttribute` loop today).
- Plus: `belongs_to touch:true` parent callbacks; before_commit DB-write in
  same tx; deprecated
  `run_commit_callbacks_on_first_saved_instances_in_transaction` flag (2 tests);
  create-through-association; "call after rollback when commit fails" (needs a
  test-layer commit-monkeypatch hook).
- 2 instrumentation skips are genuine env gaps (reconnect-with-restore;
  in-memory SQLite can't fail rollback) — left as-is.

---

## Wave 6 — query-cache (remaining un-skips)

### Story 6.1 — query-cache residual un-skips `[un-skip + impl]` · dep-clear

`query-cache.test.ts` still carries ~12 skips after the class-methods/executor-
hooks batch landed. Triage:

- **Now unblocked by 7.1** — `cache is expired by habtm update` / `…by habtm
delete` (`:848,853`): needs Post⇔Category HABTM collection-proxy setup
  (canonical fixtures + the `destroyAssociations` wiring shipped in 7.1).
- **Actionable impl** — `query cached even when types are reset` (`:540`,
  `resetColumnInformation` not implemented for this path); `cache is ignored for
locked relations` (`:492`).
- **Env-gated** — `cache is available when using a not connected connection`
  (`:512`, in-memory DB can't test lazy connections); `cache gets cleared after
migration` (sqlite-skipped).
- **Likely-permanent (Ruby process/thread semantics)** —
  `forked processes`/`across threads`/`local to the current thread`/`shared
connection`/`threads use the same connection` (`:220,223,573,611,614,885`);
  verify against `scripts/api-compare/unported-files.ts` before attempting.
- Rails: `test/cases/query_cache_test.rb`; impl
  `lib/active_record/connection_adapters/abstract/query_cache.rb`.

---

## Wave 7 — Tier 4 integrated: associations (277) + relation remainder — LAST

The association infra (7.1–7.5) has landed. Per-file campaigns come from a
`/audit-report` pass (read-only, no PR) per 100-plan methodology. Open infra
follow-ups first:

### Story 7.2 review-fix follow-up `[fidelity, ~60 LOC]` · dep-clear

**⚠ HIGHEST-PRIORITY (#2808 + #2840 findings): review fixes never landed.** 4
fixes + a regression test were implemented & verified locally but are absent
from `main` (the merge raced ahead of the review-response commit). They share
one root cause — `_namedInnerJoins` is a new (4th) join store and several sites
that enumerate join stores weren't updated. **Verified still outstanding on
`main` 2026-06-02** (`merger.ts` has no `_namedInnerJoins`; not in
`STRUCTURAL_FIELDS`):

1. **(HIGH, user-visible bug)** `relation/merger.ts#mergeJoins` drops
   `_namedInnerJoins` on the immutable `merge()` path.
2. `or` structural-compat omits `_namedInnerJoins` (`STRUCTURAL_FIELDS` in
   `relation/query-methods.ts`).
3. `relation.ts#isEmptyScope` omits `_namedInnerJoins`.
4. `relation.ts#referencesEagerLoadedTables` can't see named-inner-join table
   aliases (spurious eager-load promotion).

Open one small follow-up PR with fixes 1–4 + the regression test from a fresh
branch off updated `main`. (The 5th item — a defensive recursion guard — is moot:
the poly-twice follow-up removed the self-recursion from
`_throughChainHasNestedSource`.)

### Story 7.4 follow-up — `conditions-on-join-table` ✅ shipped (#2841)

`conditions on join table with include and limit` (`eager.test.ts`) is
un-skipped. The "deeper schema-cache reflection bug" worry was wrong — the
`Developer.lastName` virtual + `developers` fixtures (#2830/#2831) were enough;
wiring the test in a fixture-backed `describe("EagerAssociationTest")` with
`defineSchema(…, { dropExisting: true })` got it green on SQLite + PG. The real
gap it surfaced (collection eager-load + LIMIT must materialize parent IDs in a
separate `SELECT DISTINCT pk … LIMIT n` query, not a nested `pk IN (… LIMIT n)`
subquery — MariaDB rejects the latter) was also fixed, mirroring Rails
`distinct_relation_for_primary_key`.

**Sibling follow-ups (from #2841 finding, each its own story):**

- **~40–80 LOC — `columns_for_distinct` not mirrored.** `_buildEagerIdSubquery`
  (`relation.ts`) projects only the pk under `SELECT DISTINCT` and does not
  append `order_values` to the SELECT list (Rails `columns_for_distinct`,
  `schema_statements.rb:1429`). A limited collection eager-load that ORDERs on a
  joined column thus emits an invalid `SELECT DISTINCT id … ORDER BY <unselected
col>` on PG/MySQL. **Prerequisite** for un-skipping the sibling `order on join
table with include and limit` (`eager_test.rb:1196`, orders by
  `developers_projects.joined_on`), still skipped.
- **~5 LOC — dead code.** `distinctRelationForPrimaryKey`
  (`connection-adapters/abstract/schema-statements.ts:1340`) is ported but
  uncalled; the live path is `relation.ts` `_buildEagerJoinManager` /
  `_buildEagerIdSubquery`. Remove or wire.

### Association + relation campaigns (audit-gated)

Each row: schedule `/audit-report <slug>` → triage into ~250-LOC slots → un-skip.
All four infra deps (7.1/7.2/7.4-impl/7.5) are satisfied — every "Needs 7.x" row
is dep-clear and ready to audit (subject to the §7.2 review-fix follow-up landing
for `merge()`-bearing eager cases):

| Campaign         | Ours                                                        | Rails                                                       | ~skips | Needs                           |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | -----: | ------------------------------- |
| eager            | `associations/eager.test.ts`                                | `associations/eager_test.rb`                                |     59 | 7.2 ✅, 7.4 ✅ (#2841)          |
| join-model       | `associations/join-model.test.ts`                           | `associations/join_model_test.rb`                           |     41 | 7.2 ✅; DidYouMean (B1972)      |
| strict-loading   | `strict-loading.test.ts`                                    | `strict_loading_test.rb`                                    |     14 | batch 1 landed; rest dep-clear  |
| has-one          | `associations/has-one-associations.test.ts`                 | `associations/has_one_associations_test.rb`                 |     24 | batch 1 ✅ #2843; batch 2 ↓     |
| relation-scoping | `scoping/relation-scoping.test.ts`                          | `scoping/relation_scoping_test.rb`                          |     28 | STI type-constraint (#1983)     |
| inverse          | `associations/inverse-associations.test.ts`                 | `associations/inverse_associations_test.rb`                 |     23 | 7.5 ✅                          |
| habtm            | `associations/has-and-belongs-to-many-associations.test.ts` | `associations/has_and_belongs_to_many_associations_test.rb` |     23 | 7.1 ✅                          |
| where            | `relation/where.test.ts`                                    | `relation/where_test.rb`                                    |     23 | polymorphic fixtures            |
| cascaded-eager   | `associations/cascaded-eager-loading.test.ts`               | `associations/cascaded_eager_loading_test.rb`               |     12 | batch 1 ✅ #2845; batches 2–5 ↓ |
| has-one-through  | `associations/has-one-through-associations.test.ts`         | `associations/has_one_through_associations_test.rb`         |     16 | —                               |
| where-chain      | `relation/where-chain.test.ts`                              | `relation/where_chain_test.rb`                              |     12 | join aliasing                   |
| counter-cache    | `counter-cache.test.ts`                                     | `counter_cache_test.rb`                                     |      5 | Batch 134                       |

Remaining strict-loading batches (eager-load preload-cascade, has-one/has-many
no-raise, build/writer strict-bypass + loader-reordering, has-one-through
autosave, fixtures) are dep-clear. The `callbacks` and `nested-through`
campaigns are done (0 skips) — not listed.

**Sized next batches (newly prioritized from #2843/#2845 audit findings):**

- **has-one batch 2 (~150–250 LOC)** — the replace/creation-failure cluster (4
  skips: `creation failure replaces existing` ×2, `replacement failure …` ×2).
  Blocked on two pre-existing `has-one-association.ts` parity gaps: **(A)**
  `removeTargetBang` default/nullify branch is incomplete vs Rails
  `remove_target!` `else` (`has_one_association.rb:96-107`) — missing
  `remove_inverse_instance` + `RecordNotSaved`-on-failed-save, and the no-`dependent`
  case no-ops instead of nullifying the FK; **(B)** `replace`
  (`:111-137`) never `load_target`s the existing record (Rails opens with
  `return target unless load_target || record`), so a writer can't see which old
  record to remove — auto-load likely needs the writer path made async (design
  flag). Fix (B) first; it unblocks the batch.
- **cascaded-eager batches 2–5** — Batch 2: STI three-level ping-pong +
  multiple-stis-and-order (Firm/DependentFirm STI on companies, SpecialComment/
  VerySpecialComment STI, ordering on JD aliases). Batch 3: Vertex recursive
  four-levels (HMT + HABTM self-join). Batch 4 (largest): joins/eager_load +
  references + count/distinct over eager joins. Batch 5: Person grafts + has_one
  preload-constraint (after_initialize instrumentation). Reuse the
  `dropExisting` canonical-fixture `describe` pattern.

**Relation still-blocked (flag, schedule after infra):** `eager_load` toSql +
STI + non-preload (3, assoc track A5); `missing`-with-enum (5, → Story 3.PG-enum

- join aliasing); parameterized join strings R6c (2, design needed).

---

## Cross-cutting follow-ups (orphaned from now-deleted plan docs)

The QueryLogs and encryption-contexts parity plans are complete and their docs
removed; these still-open follow-ups are preserved here:

- **QueryLogs (optional polish):** make `tagContent` read
  `ActiveSupport::ExecutionContext.to_h` like Rails (every query merges the live
  ExecutionContext) instead of the QueryLogs instance `_context` via
  `updateContext` — touches `query-logs.ts` + activesupport `ExecutionContext`;
  and align the three `escaping …` unit tests (`query-logs.test.ts:71-83`) to
  Rails' exact literal inputs (`query_logs_test.rb:43-56`). Not needed for parity.
- **Encryption `isEncrypted`/`encrypted?` context divergence (~1 line):**
  `isEncrypted` (`encryption/encrypted-attribute-type.ts:128-130`) wraps in
  `this.scheme.withContext(...)` but reads `this._encryptor` directly, ignoring
  the pushed context (Rails `encrypted_attribute_type.rb:48` reads the context
  encryptor → returns `false` under a swapped `NullEncryptor`). Fix:
  `this.scheme.withContext(() => this.encryptor.isEncrypted(value))`. Verify
  `encrypted-fixtures.test.ts` + `unencrypted-attributes.test.ts` stay green
  (feeds `support_unencrypted_data` detection) before adopting.

---

## Net path to 100%

The authoritative net path + phase sequence is in
[`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md) (§2 + "Net
path"). In brief: Phase 0 hygiene → Phase 1 architectural unblockers (I-1 dumper,
I-2 enum cast, I-3 serialize, I-4 pluck-cast, I-5 CI adapter job) → Phase 2
bounded clusters (F-1…F-8) → Phase 3 adapter type-families → Phase 4 the
associations+relation tail, last.

## Conventions (CLAUDE.md — apply to every story)

- ≤500 LOC per PR; split via non-overlapping **sibling** branches off `main`
  (`<base>`/`<base>b`/`<base>c`), **not** stacked PRs.
- Use `scripts/start-worktree.sh`; leave the default worktree for the user.
- Open in draft; run `/link <PR#>` after opening; `/post-merge-findings` after merge.
- Never rename Rails-derived test names; run only touched test files locally.
- Refresh counts with `pnpm test:compare --cached --package activerecord` after each merge.
  </content>
