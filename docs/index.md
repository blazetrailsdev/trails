# Docs index

Snapshot 2026-05-14. Every plan/tracker doc in `docs/`, grouped by what
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

| Doc                                                                  | api:compare               | Priority | Work | Notes                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------- | -------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`activerecord-100-plan.md`](activerecord-100-plan.md)               | **100% pub** / 99.8% all  | P1       | M    | Public api:compare closed; private parity at 99.8% (4950/4958). **Live work tracker** (in-flight, followups, story count). Cluster slot detail in `activerecord-100-clusters.md`. |
| [`activerecord-100-clusters.md`](activerecord-100-clusters.md)       | —                         | P1       | M    | **Cluster slot detail** for the AR post-100% audit clusters. Companion to `activerecord-100-plan.md` — slot descriptions, LOC sizing, audit attribution, overlap notes.           |
| [`actioncontroller-100-percent.md`](actioncontroller-100-percent.md) | 57% pub / 43.4% all       | P1       | L    | Merged with the privates backlog: 4 waves remaining. Biggest gaps: http_authentication (33), test_case (32), live (17).                                                           |
| [`actiondispatch-100-percent.md`](actiondispatch-100-percent.md)     | 4.9% (api), 30.9% (tests) | P2       | XL   | Missing tests, not stubs. Primarily feature porting + test reconciliation.                                                                                                        |
| [`activesupport.md`](activesupport.md)                               | 24.7% (denominator stale) | P2       | —    | **Not a 100% target.** Scope is "what siblings need + standalone runtime utilities"; Ruby-isms explicitly out.                                                                    |

## Plans / backlogs

| Doc                                                                                      | Priority | Work | Notes                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`test-compare-100-plan.md`](test-compare-100-plan.md)                                   | P1       | XL   | Strategy + BLOCKED vocab + workflow reference for AR test:compare un-skip work. Current slot tracker in `activerecord-100-plan.md`.                                                             |
| [`explicit-test-schema-plan.md`](explicit-test-schema-plan.md)                           | P1       | M    | `defineSchema` + `AR_NO_AUTO_SCHEMA` test-infra migration. TS-4 batches in progress.                                                                                                            |
| [`activemodel-callbacks-convergence-plan.md`](activemodel-callbacks-convergence-plan.md) | P1       | S    | Converge activemodel's 617-line callbacks engine onto activesupport's. PRs 1–5 merged; PRs 6 (run-path migration + around-save unification) and 7 (bridge removal) remaining.                   |
| [`activerecord-type-audit.md`](activerecord-type-audit.md)                               | P1       | L    | Type-debt audit + 4-wave reduction plan. W1a + Wave 2 (W2a–W2e) shipped; W3 + W4 + CP PR C ahead. CP PR B (#1519) eliminated 11 directives via Calculations method-syntax restructure.          |
| [`connection-pool-sync-checkout-plan.md`](connection-pool-sync-checkout-plan.md)         | P1       | S    | Fix `ConnectionPool#checkout()` to block up to `checkout_timeout` like Rails instead of failing fast under saturation.                                                                          |
| [`actionpack-restructure-audit.md`](actionpack-restructure-audit.md)                     | P1       | L    | Directory-layout audit (~55% file coverage vs Rails). Waves 1–6 mechanical moves + Wave 7 journey/ port (sized separately, ~6–8 PRs) + Wave 8+ selective fill-in. `system_testing/` not ported. |
| [`actionpack-journey-port-plan.md`](actionpack-journey-port-plan.md)                     | P1       | L    | Wave 7 sizing audit: 14 Rails files (2062 LOC) → 8 cluster PRs (L/S/V/P/G/R₁/R₂/R₃) + wire-up. With CLAUDE.md 300-LOC ceiling: ~17 PRs.                                                         |
| [`globalid-plan.md`](globalid-plan.md)                                                   | P2       | S    | GID-0 vendor done. GID-1+ ports to new `packages/globalid/` package (Rails-shaped, AR depends one-way). ~5 PRs, ~600 LOC.                                                                       |
| [`trailties-plan.md`](trailties-plan.md)                                                 | P2       | XL   | Phase 0 done. Greenfield from Phase 1 onward — Paths, Initializable, generators, Engine, Application — ~30 PRs minimum.                                                                         |
| [`ci-improvement-plan.md`](ci-improvement-plan.md)                                       | P2       | M    | Phase 0 mostly shipped. Phase 1 is the real work: composite setup action, shared build artifact, SQLite parallelism. Phase 2 = matrix + DB-per-worker.                                          |
| [`sqlite-driver-abstraction-plan.md`](sqlite-driver-abstraction-plan.md)                 | P2       | S    | PR M / 4 / 5 / 7 shipped. Mostly archival; minor residual.                                                                                                                                      |
| [`browser-compat-plan.md`](browser-compat-plan.md)                                       | P2       | S    | BC-3/3b shipped. One remaining eager `pg` import in `postgresql/temporal-type-parsers.ts`.                                                                                                      |

## Verification harnesses

| Doc                                                | Priority | Work | Notes                                                                                                                                     |
| -------------------------------------------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`parity-verification.md`](parity-verification.md) | P1       | —    | Schema + query parity pipelines (`pnpm parity:schema` / `pnpm parity:query`). Both shipped; reference for adding fixtures + format bumps. |
