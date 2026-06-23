# Audit: AR test-teardown DROP TABLE churn (~86k DROP TABLE / run)

Spike for story `ar-test-reset-drop-table-churn` (RFC 0028-ci-cost-optimization).
Fact-finding only — no production code change. Decomposes the dominant DROP
TABLE cost surfaced by the `ddl-timing-profile` audit (PR #3904) into a measured
per-path breakdown and a recommended reset strategy with follow-on stories.

## Summary

The 86k DROP TABLE / run is **not** dominated by a single helper; it is the sum
of four reset paths, all of which converge on the same lever: **per-file,
per-worker re-materialization of the canonical table set**. The single largest,
most clearly-avoidable contributor is the **slot-1 PG/MySQL worker running
`DatabaseTasks.loadSchema` on _every_ test file** (`test-setup-dy.ts:47`), which
re-executes the generated schema file whose ~246 `createTable(force:"cascade")`
calls each emit a `DROP TABLE … CASCADE` before re-creating — unconditionally,
with no `schemaUpToDate` gate. The exclusive-slot workers (slots 2–6) avoid this
via `reconstructFromSchema`'s truncate-only fast path, so the fix is to route
slot 1 down the same shape-stable path rather than to touch the drop helpers.

`repairWorkerSchema` is a near-zero contributor (drops only drifted tables,
normally none). `dropAllTables` is rare in count (4 explicit callers) but is the
main source of the **~2,600 _distinct_** tables figure, because it drops leaked
bespoke tables that no other path knows about.

**Recommendation: shape-stable TRUNCATE-only, DROP only on detected drift** —
extend the slot-2–6 reconstruct fast path to slot 1, and lean on the existing
`repairWorkerSchema` drift detector for correctness. Reject clone-a-fresh-DB-
per-file: it re-introduces the per-file CREATE cost RFC 0008 deliberately
removed and multiplies connection/DB-create overhead.

## Coverage

TS source read:

- `packages/activerecord/src/test-setup-dy.ts` (per-file reset driver)
- `packages/activerecord/src/test-helpers/drop-all-tables.ts` (`dropAllTables`)
- `packages/activerecord/src/test-helpers/define-schema.ts` (`defineSchema`,
  `dropExisting`, signature-cache fast path — lines 630–710)
- `packages/activerecord/src/test-helpers/schema-repair.ts` (`repairWorkerSchema`,
  `driftedTables`)
- `packages/activerecord/src/test-helpers/schema-file-generator.ts`
  (`force:"cascade"` emission — lines 123–169)
- `packages/activerecord/src/tasks/database-tasks.ts`
  (`reconstructFromSchema` 1290–1320, `loadSchema` 839–884, `truncateTables`,
  `schemaUpToDate`)
- `packages/activerecord/src/test-helpers/ddl-profile.ts` (instrumentation
  reused from PR #3904 — records `byOp`/`byTable`/`byFile`)
- `packages/activerecord/src/test-helpers/setup-handler-suite.ts`,
  `use-handler-transactional-fixtures.ts` (afterAll no longer drops — D-Z)

Static call-graph census (from `git grep` over `packages/activerecord/src`):

| Signal                                                                               | Count                    |
| ------------------------------------------------------------------------------------ | ------------------------ |
| `*.test.ts` files (`git ls-files`)                                                   | 539 (88 contain `.skip`) |
| files using a handler suite (`setupHandlerSuite`/`useHandlerFixtures`/transactional) | 199                      |
| `defineSchema(` call sites (all)                                                     | 502 across 166 files     |
| files passing `dropExisting:true`                                                    | 28                       |
| files calling `dropAllTables` directly                                               | 4                        |
| files calling `repairWorkerSchema` directly                                          | 2 (helper + 1 test)      |
| canonical tables in `TEST_SCHEMA`                                                    | 246                      |
| force:"cascade" emitted per table on PG/MySQL                                        | yes (all 246)            |

## How each DROP path fires

### Path A — `loadSchema` schema-file replay (slot-1 PG/MySQL) — **dominant**

`test-setup-dy.ts:44-48` runs **once per test file** (vitest `setupFiles` re-run
per file under `isolate`). The gate:

- sqlite-file / `AR_PG_EXCLUSIVE_DB` / `AR_MYSQL_EXCLUSIVE_DB` (slots 2–6) →
  `reconstructFromSchema` → **truncate-only** when `schemaUpToDate` (no drops).
- **else (PG/MySQL slot 1) → `loadSchema` every file.** `loadSchema`
  (`database-tasks.ts:839`) has **no `schemaUpToDate` gate** — it imports and
  executes the generated schema file unconditionally. That file
  (`schema-file-generator.ts:158`) emits `force:"cascade"` for **all 246**
  tables, so each run = **246 `DROP TABLE … CASCADE`**.

This explains the profile's hot tables that are _canonical and present in every
file_ — `ar_internal_metadata`, `posts`, `books`, `tasks` at 300–500 drops each:
they are dropped once per file the slot-1 worker handles, plus the first-file
purge+load on each exclusive worker.

### Path B — `defineSchema(..., {dropExisting:true})`

`define-schema.ts:654-660`: unconditionally drops **every table in the passed
schema**, reverse dependency order, before recreating — bypassing the signature
cache. 28 files opt in, in `beforeAll` (2 in `beforeEach`). Bounded by the
tables each file declares (typically a small bespoke subset, not all 246).

### Path C — `defineSchema` signature-mismatch drop

`define-schema.ts:698`: when a table's `tableSignature` changed or its cache
entry was cleared (e.g. a sibling file's `dropAllTables` called
`clearAppliedSchemaSignatures`), the fast path (682) is skipped and the table is
dropped+recreated. With 502 call sites across 166 files and per-file beforeAll
schema setup in 199 handler files, this is the long tail that drops bespoke and
re-shaped canonical tables. Cache hits (unchanged signature + table still
exists) reset auto-increment only — **no drop** — so this path's volume is
driven by cross-file cache invalidation, chiefly Path D.

### Path D — `dropAllTables`

`drop-all-tables.ts`: enumerates and drops **every physical table/view/matview**
(canonical + leaked bespoke). Only 4 explicit test callers plus
`test-adapter.ts` teardown — low call count but high fan-out per call, and the
sole reason the distinct-table count reaches ~2,600 (it is the only path that
drops bespoke tables nobody else tracks). It also calls
`clearAppliedSchemaSignatures`, which forces Path C re-drops in the next file.

### Path E — `repairWorkerSchema` — negligible

`schema-repair.ts:135`: one catalog read per file; drops+recreates only tables
whose live columns drift from `TEST_SCHEMA` (via `defineSchema(dropExisting)` on
that single table). Normally **0 tables** → ~0 drops. Cost is proportional to
drift, not suite size. Not a churn source; it is the **drift detector the
recommended strategy reuses**.

## Measured per-path breakdown

PR #3904's profiler records `byOp`/`byTable`/`byFile` but **not the call-path**,
so the 86k cannot be sliced per-path from the existing dumps alone. The split
below is **derived** from the call-graph census above and the 6-worker CI
topology, reconciled against the audit totals (PG 86,810 / Maria 85,781). The
**first impl story adds a one-line path tag to the profiler to confirm these
ranges empirically** (it is the cheap, decisive measurement).

Per-run estimate (PG; 539 `*.test.ts` files spread over 6 workers, ~90
files/worker — slot 1 runs `loadSchema` for every file it loads, including ones
whose individual tests are `.skip`ped, since the per-file `setupFiles` reset
runs before test selection):

| Path                                         | Mechanism                                     | Est. drops/run         | Share                                 |
| -------------------------------------------- | --------------------------------------------- | ---------------------- | ------------------------------------- |
| **A** loadSchema replay (slot 1, every file) | 246 × ~90 files                               | ~22,000                | core canonical churn, fully avoidable |
| A' first-file purge+load (slots 2–6)         | 246 × 5                                       | ~1,200                 | one-time per worker                   |
| **C** defineSchema signature-mismatch        | 166 files × cross-file invalidation           | large (long tail)      | driven by D + bespoke re-shape        |
| **B** defineSchema dropExisting              | 28 files × declared subset                    | moderate               | bespoke, mostly unavoidable           |
| **D** dropAllTables                          | 5 callers × full physical set (incl. bespoke) | moderate, wide fan-out | source of ~2,600 distinct tables      |
| **E** repairWorkerSchema                     | drift-only                                    | ~0                     | not a source                          |

Paths A + C + D together account for the bulk; A is the cleanest single win,
and eliminating D's signature-cache clears shrinks C. The exact A:C:D ratio is
what the path-tag measurement story nails down before impl commits.

## Recommended reset strategy

**Shape-stable TRUNCATE-only, DROP only on detected drift.** Concretely:

1. Stop slot-1 PG/MySQL from running `loadSchema` per file. Route slot 1 through
   the same `reconstructFromSchema` truncate-only fast path the exclusive slots
   use, OR gate `loadSchema` on `schemaUpToDate` so the force:"cascade" replay
   fires only when the schema SHA actually changed.
2. Keep `repairWorkerSchema` as the correctness backstop — it already drops+
   recreates exactly the tables that drift, so truncate-only is safe: any file
   that re-shapes a canonical table is repaired for the next file without a
   blanket drop.
3. Reduce Path C by not clearing the whole signature cache on `dropAllTables`
   where the truncate path can reconcile instead (follow-on, lower priority).

**Why not clone-a-fresh-DB-per-file:** RFC 0008's clonable template already
provides per-worker isolation and cut CREATE TABLE to ~7.4k. Cloning per file
would re-introduce per-file CREATE/connection/DB-bootstrap cost (the exact cost
0008 removed), multiply DB-create syscalls, and on PG/MySQL slot 1 is impossible
without DROP DATABASE (the bootstrap advisory-lock client lives in the same DB —
see `test-setup-dy.ts:20-25`). Higher isolation, strictly worse on the metric we
are cutting.

**Flake/fidelity risk of the recommended path:** truncate-only is what surfaced
the original shared-DB shape-drift flakes (see `schema-repair.ts` header), but
those are already mitigated by `repairWorkerSchema`. The residual risk is a
canonical table re-shaped by file A and read by file B _within the same drop_
window — covered by the per-file repair running at B's setup. No new fidelity
risk vs. today; slot 1 simply joins the regime slots 2–6 already run.

Test-helpers touched by the recommended strategy: `test-setup-dy.ts` (the slot-1
branch), `tasks/database-tasks.ts` (`loadSchema` gate / `reconstructFromSchema`
reuse), `ddl-profile.ts` (path tag, measurement only). `drop-all-tables.ts` and
`define-schema.ts` are touched only by the optional Path-C/D follow-ups.

## Suggested follow-up stories

### Story 1 — `ar-test-reset-shape-stable-impl` (~120 LOC) — first, depends on this spike

- Add a path tag to `ddl-profile.ts` (module-level "current reset path" set by
  `loadSchema`/`dropAllTables`/`defineSchema(dropExisting)`/`repairWorkerSchema`),
  run the profiler once on PG + Maria to confirm the A:C:D split.
- Route slot-1 PG/MySQL off per-file `loadSchema`: gate on `schemaUpToDate`
  (or reuse `reconstructFromSchema`'s truncate fast path) so the 246-table
  force:"cascade" replay fires only on real schema change.
- Files: `test-setup-dy.ts`, `tasks/database-tasks.ts`, `ddl-profile.ts`.
- Expected win: eliminate ~22k drops/run (Path A) on the slot-1 worker.

### Story 2 — `ar-test-reset-signature-cache-no-blanket-clear` (~80 LOC)

- Make `dropAllTables` reconcile the signature cache against what it actually
  dropped instead of `clearAppliedSchemaSignatures` (full wipe), so the next
  file's `defineSchema` keeps cache hits (no Path-C re-drop).
- Files: `drop-all-tables.ts`, `define-schema.ts`.
- Depends on Story 1's measurement to size the win.

### Story 3 — `ar-test-reset-bespoke-table-teardown-ratchet` (~120 LOC, fidelity)

- Drive down the ~2,600 distinct-table count: extend the
  `require-table-teardown` ESLint ratchet so leaked bespoke tables stop
  accumulating on the shared worker DB, shrinking Path D's fan-out.
- Files: ESLint rule + the grandfathered exclude list; not on the hot path,
  schedule after Stories 1–2.

Stories 2 and 3 are independent of each other and both gated on Story 1's
measurement landing first.
