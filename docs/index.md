# Docs index

Snapshot 2026-05-11. Every plan/tracker doc in `docs/`, grouped by what
it's for, with current priority and rough remaining-work size.

Priority legend:

- **P0** — blocks launch / on the launch roadmap critical path
- **P1** — active core-package work, near completion or in-flight
- **P2** — useful but non-blocking; long tail
- **P3** — design / proposal / aspirational; not actively executing

Work-size legend (rough order-of-magnitude):

- **S** — < 5 PRs
- **M** — 5–15 PRs
- **L** — 15–40 PRs
- **XL** — 40+ PRs

---

## Launch / cross-cutting

| Doc                                                            | Priority | Work | Notes                                                                                             |
| -------------------------------------------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------- |
| [`launch-roadmap.md`](launch-roadmap.md)                       | P0       | —    | The "what blocks public launch" doc. Everything else feeds into this.                             |
| [`virtual-source-files-plan.md`](virtual-source-files-plan.md) | P0       | M    | Phase 1 done; **Phase 2 (tsserver plugin)** is the open work. 6 sub-PRs (2.1–2.6) + Phase 3 docs. |

## Per-package "Road to 100%" trackers

Live package-scoped api numbers come from
`pnpm tsx scripts/api-compare/compare.ts --package <name>` (after the
extract step has run; `pnpm api:compare` is a chained `&&` script and
doesn't forward `--package` to `compare.ts`). Test numbers come from
`pnpm test:compare`. Doc snapshots may lag — re-check before scoping.

| Doc                                                                    | api:compare               | Priority | Work | Notes                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`activerecord-100-plan.md`](activerecord-100-plan.md)                 | **100% pub** / 72.1% all  | P1       | M    | Public api:compare closed. **Live work tracker** (in-flight, followups, story count). Cluster slot detail in `activerecord-100-clusters.md`. Private parity in `private-api-parity-100-plan.md`. |
| [`activerecord-100-clusters.md`](activerecord-100-clusters.md)         | —                         | P1       | M    | **Cluster slot detail** for the AR post-100% audit clusters. Companion to `activerecord-100-plan.md` — slot descriptions, LOC sizing, audit attribution, overlap notes.                          |
| [`activemodel-privates-100-plan.md`](activemodel-privates-100-plan.md) | 99.1% pub / 82.4% all     | P1       | S–M  | Track A done. Tracks B + C are small. **Track D** (readAttribute → MissingAttributeError) is its own ~6-PR initiative.                                                                           |
| [`actioncontroller-100-percent.md`](actioncontroller-100-percent.md)   | 57% pub / 43.4% all       | P1       | L    | Merged with the privates backlog: 4 waves remaining. Biggest gaps: http_authentication (33), test_case (32), live (17).                                                                          |
| [`actiondispatch-100-percent.md`](actiondispatch-100-percent.md)       | 4.9% (api), 30.9% (tests) | P2       | XL   | Missing tests, not stubs. Primarily feature porting + test reconciliation.                                                                                                                       |
| [`activesupport.md`](activesupport.md)                                 | 24.7% (denominator stale) | P2       | —    | **Not a 100% target.** Scope is "what siblings need + standalone runtime utilities"; Ruby-isms explicitly out.                                                                                   |
| [`private-api-parity-100-plan.md`](private-api-parity-100-plan.md)     | 72.1% AR all              | P1       | L    | Tier 1/2/4 done. Tier 3 (adapters, ~310 methods, ~16 PRs) is the next big block. Tiers 5–7 in parallel.                                                                                          |

## Plans / backlogs

| Doc                                                                      | Priority | Work | Notes                                                                                                                                                  |
| ------------------------------------------------------------------------ | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`test-compare-100-plan.md`](test-compare-100-plan.md)                   | P1       | XL   | Strategy + BLOCKED vocab + workflow reference for AR test:compare un-skip work. Current slot tracker in `activerecord-100-plan.md`.                    |
| [`explicit-test-schema-plan.md`](explicit-test-schema-plan.md)           | P1       | M    | `defineSchema` + `AR_NO_AUTO_SCHEMA` test-infra migration. TS-4 batches in progress.                                                                   |
| [`globalid-plan.md`](globalid-plan.md)                                   | P2       | M    | GID-0 vendor done; GID-1+ port plan. Early.                                                                                                            |
| [`trailties-plan.md`](trailties-plan.md)                                 | P2       | XL   | Phase 0 done. Greenfield from Phase 1 onward — Paths, Initializable, generators, Engine, Application — ~30 PRs minimum.                                |
| [`ci-improvement-plan.md`](ci-improvement-plan.md)                       | P2       | M    | Phase 0 mostly shipped. Phase 1 is the real work: composite setup action, shared build artifact, SQLite parallelism. Phase 2 = matrix + DB-per-worker. |
| [`sqlite-driver-abstraction-plan.md`](sqlite-driver-abstraction-plan.md) | P2       | S    | PR M / 4 / 5 / 7 shipped. Mostly archival; minor residual.                                                                                             |
| [`browser-compat-plan.md`](browser-compat-plan.md)                       | P2       | S    | BC-3/3b shipped. One remaining eager `pg` import in `postgresql/temporal-type-parsers.ts`.                                                             |

## Verification harnesses

| Doc                                                | Priority | Work | Notes                                                                                                                                     |
| -------------------------------------------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`parity-verification.md`](parity-verification.md) | P1       | —    | Schema + query parity pipelines (`pnpm parity:schema` / `pnpm parity:query`). Both shipped; reference for adding fixtures + format bumps. |

## Postmortems / archived

These docs are explicitly archived — diagnosis or strategy captured for future readers; not active plans. Don't add new work here.

| Doc                                                          | Notes                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [`ar-test-parallelism-plan.md`](ar-test-parallelism-plan.md) | ✅ shipped 2026-05-05/06 (#1223–#1228). Self-labeled archived; kept as diagnosis postmortem. |
