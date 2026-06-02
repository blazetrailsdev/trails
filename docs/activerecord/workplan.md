# activerecord — prioritized work plan (test:compare 100% + Rails fidelity)

> **Snapshot 2026-06-02 (forward-looking only).** This doc now lists **only
> unfinished work**. Completed waves/stories are collapsed to one-line
> "✅ complete" markers (with their PRs) so the spawn-loop knows not to re-pick
> them; the per-story bodies for shipped work have been removed. Each remaining
> story carries our source anchors (`file:line`), the Rails source reference,
> the tests it moves, an LOC estimate, dependencies, and an acceptance line.
>
> **Of the four architectural blockers** (canonical list in §"The dependency
> spine"), **three of four are satisfied on `main`** — #1 ConnectionHandler,
> #2 AliasTracker / join-table aliasing, #4 global Arel-visitor removal
> (Phase A). **#3, the `type_for_attribute` cast refactor (Story 3.PG-enum), is
> still open and still gating.**
>
> **Anchor verification status:** Waves 0–3 `file:line` anchors were verified
> against the tree on 2026-06-01. Waves 4–7 anchors are doc-sourced — line
> numbers drift, so re-`grep` before editing. Never trust a cited line blindly.
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
- **test:compare** (cached, 2026-06-02): 6917/7856 passing-matched (**88%**),
  ~932 skipped, 4 misplaced.
- **Open work:** Wave 1 Phase B/C tail, the Wave-3 schema-dumper subtrack (Epic
  3.3-U2/U3) + 3.PG-enum (BLOCKER #3, still gating) + the residual PG/MySQL/
  generic-adapter skips, the Wave-4 pool-campaign remainder, Wave-5 transaction
  follow-ups, and the Wave-7 association/relation campaigns.

### Live skip-annotation histogram (ground truth, 2026-06-02)

```
associations 277 │ relation 178 │ adapter-pg 173 │ schema 112 │ connection-pool 69
adapter-mysql 42 │ fixture 39 │ migration 27 │ transactions 18 │ type 14
unknown 8 │ query-cache 4 │ serialize 3 │ serialization 2 │ nested-attributes 2
adapter-sqlite 2   (+~10 residual 1-off malformed tags: the/needs/STI/SQLite/…)
```

## The dependency spine (why this order)

Rule (from the 100-plan): **isolated → integrated**. `associations`/`relation`
touch everything, so closing them early means re-opening them every time a
lower-tier fix lands. The two biggest buckets (≈44% of all skips) come **last**.

Four hard architectural blockers gate the most downstream work. **Three of four
are satisfied on `main`:**

1. ✅ **ConnectionHandler P9 port** (Story 4.1, no-op — already on `main`).
2. ✅ **AliasTracker / join-table aliasing** (Story 7.2, #2808). 1
   cross-arg-collision skip remains; see the §7.2 review-fix follow-up.
3. **`type_for_attribute` cast refactor** (>300 LOC) → gates enum write-casting
   - several relation/type tests. _Lead PR: Story 3.PG-enum — still open._
4. ✅ **Global Arel visitor removal** — Phase A (#2768/#2769/#2774/#2810) +
   Phase B (Story 1.5, #2834). Phase C (1.6) still open but dep-clear.

**Externally blocked — do NOT schedule:**

- `StandaloneConnection` (`connection-adapters/standalone-connection.test.ts`, 4
  tests) — vendored `connection_pool.rb` has no `StandaloneConnection`; needs a
  Rails source refresh.
- `adapter.ts` deletion / `DatabaseAdapter` removal — Phase G fixtures (deferred).
- `accepts_nested_attributes_for` (`associations/nested-error.test.ts`, 4) — Phase G.

Permanent skips (`load_async`, GVL, Marshal/YAML, rake/dbconsole) are
**reclassified, not implemented** — Story 0.1.

---

## Wave 0 — Free denominator + tracking hygiene ✅ complete (#2777, #2778)

**Open follow-up (from #2779 finding):** the `resolver.test.ts` "url missing
scheme" divergence is a documented JS-vs-Ruby behavior gap (trails has no
symbols; scheme-less string → env lookup → `AdapterNotSpecified`, pinned by
`connection-handling.test.ts`). Move it from a live `it.skip` into
`unported-files.ts` as a documented divergence (~5 LOC) so it stops counting as
a live skip.

---

## Wave 1 — Fidelity foundation: global Arel visitor removal

Phase A (Stories 1.1–1.4) ✅ complete (#2768, #2769, #2774, #2810); Phase B
(Story 1.5) ✅ complete (#2834). Remaining:

### Story 1.6 — Phase C: delete the `syncHandlerVisitor` test dance `[tests-only]` ~per-grep · dep: 1.5 ✅ (deps satisfied)

- Ours: ~635 `syncHandlerVisitor`/`setupHandlerSuite` sites
  (`grep -rn "syncHandlerVisitor\|setupHandlerSuite" packages/activerecord/src`).
  With the global no longer dialect-synced these `beforeEach` calls are dead.
- Done: grep returns zero; full AR suite green in CI.

**Open follow-up bullets:**

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

## Wave 2 — Tier 1 isolated un-skips ✅ complete (#2779, #2784, #2785, #2796)

All four stories landed. Open follow-ups (each its own story):

- **2.1 — async-isolation (separate impl story):** `database-selector.test.ts`
  "preventing writes works in a threaded environment". `connectedToStack` is a
  mutable array shallow-copied by `IsolatedExecutionState.scope`, so concurrent
  async tasks bleed `preventWrites`. Needs per-scope array instances (Ruby uses
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
- **2.4 — now unblocked by the shipped `InTimeZone` helper:**
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

Shipped: 3.1 (#2794), 3.2 (no-op), 3.3-U1 (#2826), 3.4 helper port (#2832), the
PG type families (serial/array/uuid/money/bytea/timestamp/hstore +
network/range/interval/oid no-ops), 3.MY prevent-writes/bind-parameter/boolean/
case-sensitivity (#2823/#2815/#2820/#2819), and 3.misc batch (#2824). Remaining:

### Epic 3.3-U — schema-dumper representation unification `[architectural, multi-PR]`

Route live dumps through the Rails-shaped `columnSpec` hook so per-adapter
`prepareColumnOptions` overrides take effect. U1 shipped (#2826). Remaining:

- **Story 3.3-U2 — AdapterSchemaSource resolves dsl-type + raw sqlType**
  `[impl]` ~90 LOC · dep: U1 ✅. `AdapterSchemaSource.columns()` currently maps
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

- Helper port shipped (#2832). The staged `it.skip("schema dump includes
collation")` in `adapters/abstract-mysql-adapter/charset-collation.test.ts`
  un-skips once U3 lands; re-derive its PROVISIONAL regexes against real U3
  output. Also un-skip `mysql-enum.test.ts:43` `it.skip("schema dumping")` (same
  wiring). Verify on a MySQL/MariaDB whose db-default collation ≠ `utf8mb4_bin`.

### Story 3.PG-\* — PostgreSQL type-family residuals · dep: 3.3-U3 for dump-bearing ones

Families shipped; per-family **residual** skips:

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

~53 skips remain in `adapter.test.ts` (batch #2824 un-skipped 4), clustered:

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

## Wave 4 — connection-pool / multi-db

Shipped: 4.1 (no-op, BLOCKER #1), 4.2 second named pool (#2839), 4.3 batch 1 —
multi-pool-config cluster (#2837). Remaining:

### Story 4.3 — pool/handler file campaign (remaining batches) `[un-skip]` ~250 LOC × N · dep: 4.1 ✅

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

## Wave 5 — Tier 3 transactions + migration

Shipped: 5.1 transaction callbacks + isolation (#2797), 5.2 migration runner
(#2799). Open follow-ups from 5.1 (each needs production work, own story):

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

## Wave 6 — query-cache ✅ complete (#2662, #2672, #2684, #2833)

Story 6.1 shipped: live mixin + `Base.cache`/`uncached` class methods +
`QueryCache.run`/`complete` + `installExecutorHooks` (Batch 64). Nothing open.

---

## Wave 7 — Tier 4 integrated: associations (277) + relation remainder — LAST

Infra PRs first, then per-file campaigns. Each campaign's exact slots come from
a `/audit-report` pass (read-only, no PR) per 100-plan methodology.

### Association infra ✅ complete

7.1 destroyAssociations (#2800), 7.2 join-table aliasing (#2808, BLOCKER #2),
7.3 composite-FK HMT write (#2806), 7.4 JD HABTM + whereBang (impl pre-shipped
#2521/#2608; test un-skip #2827), 7.5 collection-dedup / inverse-of (#2583 impl

- #2811 un-skips). Open follow-ups:

#### Story 7.2 review-fix follow-up `[fidelity, ~60 LOC]` · dep-clear

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
branch off updated `main`. (Item 5 — the defensive recursion guard — is **MOOT**:
#2840 removed the self-recursion from `_throughChainHasNestedSource`.)

#### Story 7.4 follow-up — `conditions-on-join-table` `[blocked]`

1 deferred eager test (`has-and-belongs-to-many-associations.test.ts`) still
fails in multi-test context (`no such column: developers.lastName`) — a deeper
`Developer` schema-cache reflection bug (`loadSchemaFromCacheSync` misses
`developers`; `Project` works). Needs a framework fix, not fixtures.

### Association + relation campaigns (audit-gated)

Each row: schedule `/audit-report <slug>` → triage into ~250-LOC slots → un-skip.
**All four infra deps (7.1/7.2/7.4-impl/7.5) are satisfied — every "Needs 7.x"
row is dep-clear and ready to audit** (subject to the §7.2 review-fix follow-up
landing for `merge()`-bearing eager cases):

| Campaign         | Ours                                                        | Rails                                                       |             ~skips | Needs                       |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | -----------------: | --------------------------- |
| eager            | `associations/eager.test.ts`                                | `associations/eager_test.rb`                                |                 70 | 7.2 ✅, 7.4 ✅              |
| join-model       | `associations/join-model.test.ts`                           | `associations/join_model_test.rb`                           |                 41 | 7.2 ✅; DidYouMean (B1972)  |
| strict-loading   | `strict-loading.test.ts`                                    | `strict_loading_test.rb`                                    | 30 (batch 1 #2842) | —                           |
| has-one          | `associations/has-one-associations.test.ts`                 | `associations/has_one_associations_test.rb`                 |                 28 | fixture data folded in      |
| relation-scoping | `scoping/relation-scoping.test.ts`                          | `scoping/relation_scoping_test.rb`                          |                 28 | STI type-constraint (#1983) |
| inverse          | `associations/inverse-associations.test.ts`                 | `associations/inverse_associations_test.rb`                 |                 23 | 7.5 ✅                      |
| habtm            | `associations/has-and-belongs-to-many-associations.test.ts` | `associations/has_and_belongs_to_many_associations_test.rb` |                 23 | 7.1 ✅                      |
| where            | `relation/where.test.ts`                                    | `relation/where_test.rb`                                    |                 23 | polymorphic fixtures        |
| cascaded-eager   | `associations/cascaded-eager-loading.test.ts`               | `associations/cascaded_eager_loading_test.rb`               |                 18 | 7.2 ✅                      |
| has-one-through  | `associations/has-one-through-associations.test.ts`         | `associations/has_one_through_associations_test.rb`         |                 16 | —                           |
| where-chain      | `relation/where-chain.test.ts`                              | `relation/where_chain_test.rb`                              |                 12 | join aliasing               |
| counter-cache    | `counter-cache.test.ts`                                     | `counter_cache_test.rb`                                     |                  5 | Batch 134                   |

`callbacks` (#2838) and `nested-through` (no-op) campaigns are **complete** — 0
skips; do not re-pick. `strict-loading` batch 1 shipped (#2842); remaining
batches (eager-load preload-cascade, has-one/has-many no-raise, build/writer
strict-bypass + loader-reordering, has-one-through autosave, fixtures) are
dep-clear — see #2842 finding.

**Relation still-blocked (flag, schedule after infra):** `eager_load` toSql +
STI + non-preload (3, assoc track A5); `missing`-with-enum (5, → Story 3.PG-enum

- join aliasing); parameterized join strings R6c (2, design needed).

### Discovered follow-ups (not yet scoped)

- **~10 LOC audit (from #2840 finding):** other `Querying.*` static delegators
  that destructure a fixed arg count where the `Relation.*` instance method is
  variadic may carry the same latent arg-dropping bug #2840 fixed in
  `Querying#joins` (`const [tableOrSql, on] = args` silently dropped 3rd+ args).
  Grep `querying.ts` for `const [...] = args` patterns.

---

## Net path to 100%

1. **Wave 3** schema-dumper subtrack (Epic 3.3-U2/U3) unblocks the
   comment/charset/dump-bearing residuals and the last #3 blocker work alongside
   **3.PG-enum** (`type_for_attribute`).
2. **Wave 4** pool-campaign remainder and **Wave 5** transaction follow-ups are
   bounded, parallelizable clusters.
3. **Wave 7 campaigns** are the long tail (~300 association+relation skips), each
   opened by a read-only audit, executed last — all infra deps satisfied.

## Conventions (CLAUDE.md — apply to every story)

- ≤500 LOC per PR; split via non-overlapping **sibling** branches off `main`
  (`<base>`/`<base>b`/`<base>c`), **not** stacked PRs.
- Use `scripts/start-worktree.sh`; leave the default worktree for the user.
- Open in draft; run `/link <PR#>` after opening; `/post-merge-findings` after merge.
- Never rename Rails-derived test names; run only touched test files locally.
- Refresh counts with `pnpm test:compare --cached --package activerecord` after each merge.
  </content>
  </invoke>
