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

| Doc                                                                  | api:compare                 | Priority | Work | Notes                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | --------------------------- | -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`activerecord-100-plan.md`](activerecord-100-plan.md)               | **100% pub** / 100% rounded | P1       | M    | Public api:compare closed; private parity at 100% rounded (4956/4958). **Single consolidated tracker** — open batches, per-cluster followups, cross-cluster followups, story count, guardrails. test:compare 6568/7885 (83.3%).                                                  |
| [`actioncontroller-100-percent.md`](actioncontroller-100-percent.md) | 57% pub / 43.4% all         | P1       | L    | Merged with the privates backlog: 4 waves remaining. Biggest gaps: http_authentication (33), test_case (32), live (17).                                                                                                                                                          |
| [`actionpack-100-percent.md`](actionpack-100-percent.md)             | 4.9% (api), 30.9% (tests)   | P2       | XL   | ActionDispatch port-gap inventory + Wave 7 journey followups + test:compare missing clusters. ActionController has its own doc.                                                                                                                                                  |
| [`actionview-100-percent.md`](actionview-100-percent.md)             | 1.3% (api)                  | P3       | XL   | New roadmap. `.tse` extension; ERB-style tags; build-time compilation into gitignored `.trails/` mirror dir; dual render API (typed registry + explicit import); trails-tsc promoted to own package with plugin API. Phase 0.5 stubs unblock actionpack followups blocked on AV. |
| [`activesupport.md`](activesupport.md)                               | 24.7% (denominator stale)   | P2       | —    | **Not a 100% target.** Scope is "what siblings need + standalone runtime utilities"; Ruby-isms explicitly out.                                                                                                                                                                   |

## Plans / backlogs

| Doc                                                                        | Priority | Work | Notes                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | -------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`test-compare-100-plan.md`](test-compare-100-plan.md)                     | P1       | XL   | Strategy + BLOCKED vocab + workflow reference for AR test:compare un-skip work. Current slot tracker in `activerecord-100-plan.md`.                                                                                                      |
| [`explicit-test-schema-plan.md`](explicit-test-schema-plan.md)             | P1       | M    | `defineSchema` + `AR_NO_AUTO_SCHEMA` test-infra migration. TS-4 batches in progress.                                                                                                                                                     |
| [`activerecord-type-audit.md`](activerecord-type-audit.md)                 | P1       | L    | Type-debt audit + 4-wave reduction plan. W1a + Wave 2 (W2a–W2e) shipped; W3 + W4 + CP PR C ahead. CP PR B (#1519) eliminated 11 directives via Calculations method-syntax restructure.                                                   |
| [`trailties-plan.md`](trailties-plan.md)                                   | P2       | XL   | Phase 0 done. Greenfield from Phase 1 onward — Paths, Initializable, generators, Engine, Application — ~30 PRs minimum.                                                                                                                  |
| [`shared-adapter-test-suite-plan.md`](shared-adapter-test-suite-plan.md)   | P2       | M    | Run the shared AR test suite against sqlite3/postgresql/mysql2 (Rails-style `ARCONN` axis). Phase 2a closed (#1632); Phase 2b/3 ahead.                                                                                                   |
| [`tm-unification-plan.md`](tm-unification-plan.md)                         | P2       | L    | Route every adapter through `TransactionManager` so `_transactionFallback` can be deleted. Phases 1–4 closed (#1627/#1658/#1642); Phase 5 (universal `defineSchema`) partial; Phases 6/7 ahead.                                          |
| [`self-hosted-runner-restart-plan.md`](self-hosted-runner-restart-plan.md) | P2       | S    | Post-incident restart plan after the ~1 TB egress event. pnpm store-path + Docker image-layer fixes before scaling `gh-runner` back up.                                                                                                  |
| [`ci-improvement-plan.md`](ci-improvement-plan.md)                         | P2       | S    | ActionPack CI split plan — split `packages/actionpack` out of the shared `unit-tests` job into a dedicated no-DB `actionpack-tests` job ahead of the Wave 7 journey port. (Scope narrowed from prior multi-phase roadmap on 2026-05-14.) |
| [`sqlite-driver-abstraction-plan.md`](sqlite-driver-abstraction-plan.md)   | P2       | S    | PR M / 4 / 5 / 7 shipped. Mostly archival; minor residual.                                                                                                                                                                               |
| [`browser-compat-plan.md`](browser-compat-plan.md)                         | P2       | S    | All BC-N migrations shipped (BC-3/3b/#1549). Doc retained as policy reference for new packages.                                                                                                                                          |

## Verification harnesses

| Doc                                                | Priority | Work | Notes                                                                                                                                     |
| -------------------------------------------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`parity-verification.md`](parity-verification.md) | P1       | —    | Schema + query parity pipelines (`pnpm parity:schema` / `pnpm parity:query`). Both shipped; reference for adding fixtures + format bumps. |
