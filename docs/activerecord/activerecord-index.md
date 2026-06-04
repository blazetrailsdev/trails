# activerecord — shipping index

Snapshot **2026-06-02** (cleanup round 2). The sequenced view of what's left to
ship for `@blazetrails/activerecord`, plus the map of which doc owns what after
the 2026-06-01 consolidation (19 → 10 docs).

For the audit reports that produced the original sequencing, see
`~/.btwhooks/data/github/blazetrailsdev/trails/audits/` (slugs `ar-completion`,
`test-infra`, `dx-packaging`, 2026-05-22).

## Current state

- **api:compare**: 4969/4969 (100%) — public surface closed.
- **test:compare**: 6959/7856 (88.6%), 890 skipped, 3 missing, 15 wrong-describe,
  4 misplaced (2026-06-02, cached). Full inventory + phase ordering:
  [`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md).
- **Type-audit**: Waves 1–3 shipped; W1b + small follow-ups + W4 remain.
- **Test infra**: pool epic **complete** (Phases A–F, 2026-05-28); fixtures
  port data-complete (`missing=0` across 146 YAMLs).

## Doc map (post-consolidation)

| Doc                                                                                      | Owns                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activerecord-index.md` (this)                                                           | doc map + high-level state                                                                                                                                  |
| [`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md)                     | **authoritative test:compare 100% ordering** — complete grouped skip inventory, CI-lane analysis, phase sequence (0–4), per-file table, source-verification |
| [`workplan.md`](workplan.md)                                                             | **per-story specs** (anchors, Rails refs, LOC, deps, acceptance) for the open waves; ordering deferred to the attack plan via a wave→phase crosswalk        |
| [`activerecord-100-plan.md`](activerecord-100-plan.md)                                   | test:compare drive — batch list (Part 1) + per-file backlog table (Part 2); historical batch detail                                                         |
| [`activerecord-gaps.md`](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0005-activerecord-gaps)                                           | residual gaps from the 5 merged gap plans (associations, relation, connection-pool, database-tasks, query-cache) — mostly blocked/done                      |
| [`adapter-architecture-cleanup.md`](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0010-adapter-cleanup)                     | adapter→connection collapse, global-Arel-visitor removal, hash-only constructor, `this.adapter` audit                                                       |
| [`activerecord-type-audit.md`](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0009-type-audit)                               | type cleanup (W1b, small follow-ups, W4)                                                                                                                    |
| [`parity-verification.md`](parity-verification.md)                                       | reference: schema + query parity pipelines                                                                                                                  |
| [`fixtures-adoption-inventory.md`](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0014-fixtures-adoption)                       | reference: script-generated fixture tiering                                                                                                                 |
| [`trails-models-dump-schema-ts-migration.md`](https://github.com/blazetrailsdev/tasks/tree/main/rfcs/0003-activerecord-cli) | plan: make `trails-models-dump` derive models from committed `db/schema.ts` instead of a live DB                                                            |

## Focused work set (what's actually buildable)

1. **test:compare drive** — [`test-compare-100-attack-plan.md`](test-compare-100-attack-plan.md)
   is the authoritative phase plan (pick a phase/story there, get its spec from
   `workplan.md`). The main live backlog.
2. **adapter-architecture** — `adapter-architecture-cleanup.md`: global-Arel-visitor
   removal (Phases A–C, **unblocked**), adapter→connection PR A/B/C, hash-only
   constructor (gated on #2700).
3. **type cleanup** — `activerecord-type-audit.md` (~250 LOC, bundleable).
4. **Small unblocked gap items** — `activerecord-gaps.md` "Unblocked" section
   (DatabaseTasks P3-5 migrateStatus stdout ~30 LOC; associations Track 9; a
   2-LOC JSDoc fix). Everything else in that doc is blocked or done.

## Completed / retired tracks (archival)

- **Pool epic** (Phases A–F, 2026-05-28) — end state: no `_sharedAdapter`, no
  `_txLockStorage`/`_manualTxDepth`/AsyncContext filter, no `ddl-tracker.ts`,
  no `TestAdapterFixtures`/`SidecarFixtures` wrappers, no Proxy.
  `createTestAdapter()` returns the raw pool-leased `DatabaseAdapter`.
  Plan doc `connection-pooled-test-adapter-plan.md` retired into this index.
- **Fixtures port** — `missing=0` across all 146 YAMLs; subdir slash-key
  registry + recursive compare scan + strict-fail flip all shipped. Plan
  retired.
- **Fixtures adoption** — empirical yield ~8% (most AR tests use bespoke
  per-describe models with no canonical counterpart). **Do NOT spin up a
  sweep.** 5 unconverted Tier 1 files remain — convert opportunistically when
  touching those files. Tiering data in `fixtures-adoption-inventory.md`. Plan
  doc retired into this note.
- **Query-cache mixin** — all 3 phases shipped (#2662/#2672/#2684). See
  `activerecord-gaps.md`.
- **TM Phase 9b-3** (delete dormant fallback) — **closed-don't-reopen**; live
  Rails-parity code for HABTM join models.
- **SQLite driver abstraction** — PR 1/2/3/4/5/7/M shipped; only PR 6 (CI
  matrix + website docs) remains, standalone. Driver-registry pattern lives in
  `activesupport.md`.
- **test-perf template-clone** — speculative spike, never started; dropped. The
  `isolate: false` approach was measured a no-op in this repo's vitest forks
  pool. Reopen only if AR test wall-clock becomes a release blocker.

## Phase 7 — DX / packaging (independent, not core-AR)

Owned outside `docs/activerecord/`:
[`browser-compat-plan.md`](../infrastructure/browser-compat-plan.md) (~65%) and
[`virtual-source-files-plan.md`](../infrastructure/virtual-source-files-plan.md)
(~70%). No test-infra or AR-100 dependency.

## Sequencing summary

```
test:compare drive (attack-plan)     ── continuous; Phase 0→4 (specs in workplan.md) ──
adapter-architecture cleanup         ── parallel (visitor removal unblocked) ──
type cleanup (type-audit)            ── parallel ──
gap residuals (gaps)                 ── mostly blocked; pick unblocked items only ──
DX / packaging (Phase 7)             ── parallel, separate ──
```
