# Docs index

Snapshot 2026-05-22. Every plan/tracker doc in `docs/`, grouped by what
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

| Doc                                                      | api:compare                          | Priority | Work | Notes                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------ | -------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`activerecord-100-plan.md`](activerecord-100-plan.md)   | **100% pub** / 100% rounded          | P1       | M    | Public api:compare closed; private parity at 100% rounded (4956/4958). **Single consolidated tracker** — open batches, per-cluster followups, cross-cluster followups, story count, guardrails. test:compare 6568/7885 (83.3%).                                              |
| [`actionpack-100-percent.md`](actionpack-100-percent.md) | AD 93.9% / AC 73.8% / Abs 100% (api) | P1       | L    | Consolidated tracker for ActionDispatch + ActionController + AbstractController (was two docs). Open: AC `base.rb` 38%, http_authentication, test_case, strong_parameters; AD partials + journey follow-ups + test:compare clusters.                                         |
| [`actionview-100-percent.md`](actionview-100-percent.md) | 8.2% (api)                           | P3       | XL   | Roadmap. `.tse` extension; ERB-style tags; build-time compilation into gitignored `.trails/` mirror dir; dual render API (typed registry + explicit import); trails-tsc promoted to own package with plugin API. Phase 0.5 stubs unblock actionpack followups blocked on AV. |
| [`activesupport.md`](activesupport.md)                   | 24.7% (denominator stale)            | P2       | —    | **Not a 100% target.** Scope is "what siblings need + standalone runtime utilities"; Ruby-isms explicitly out.                                                                                                                                                               |
| [`rack-100-percent.md`](rack-100-percent.md)             | 60% (api) / 100% (test name-match)   | P2       | M    | 12 PR slots, ~2.3k LOC total. Multipart cluster directly unblocks actiondispatch `param_builder`. test:compare 100% is name-match only — audit test bodies as each slot lands. Session/Static deferred (separate gems / out of scope).                                       |

## Plans / backlogs

| Doc                                                                                | Priority | Work | Notes                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | -------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`activerecord-index.md`](activerecord-index.md)                                   | P1       | —    | **Sequenced shipping plan for activerecord.** Phases 1–7 with cross-doc dependencies. Read this first when triaging AR work.                                                                                                             |
| [`activerecord-type-audit.md`](activerecord-type-audit.md)                         | P1       | M    | Type-debt audit + 4-wave reduction plan. Waves 1–3 shipped; W1b + ~150 LOC follow-ups bundle + W4 deferred.                                                                                                                              |
| [`fixtures-port-plan.md`](fixtures-port-plan.md)                                   | P1       | S    | ~90% complete. PR 7a (waiver) + 7b (strict flip) + PR 8 (PoC adoption) remain.                                                                                                                                                           |
| [`fixtures-adoption-plan.md`](fixtures-adoption-plan.md)                           | P1       | L    | Migrate AR tests from inline `defineSchema` + `Model.create` setup to `useFixtures([...])`. Phase A unblocked; Phase B+ gated on pool epic Phase E.                                                                                      |
| [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md) | P1       | M    | Pool epic. Phase B/C shipped (#2242/#2245); Phase D sweep in flight; Phases E/F collapse with TM Phase 9b-4.                                                                                                                             |
| [`trailties-plan.md`](trailties-plan.md)                                           | P2       | XL   | Phase 0 done. Greenfield from Phase 1 onward — Paths, Initializable, generators, Engine, Application — ~30 PRs minimum.                                                                                                                  |
| [`tm-unification-plan.md`](tm-unification-plan.md)                                 | P1       | M    | Route every adapter through `TransactionManager`. Phases 1–8 closed; 9a + 9b-1/9b-2a–e merged; 9b-3 closed misdesigned (#2189), fallback stays per Rails parity; 9b-4 collapses with pool Phase F.                                       |
| [`self-hosted-runner-restart-plan.md`](self-hosted-runner-restart-plan.md)         | P2       | S    | Post-incident restart plan after the ~1 TB egress event. pnpm store-path + Docker image-layer fixes before scaling `gh-runner` back up.                                                                                                  |
| [`ci-improvement-plan.md`](ci-improvement-plan.md)                                 | P2       | S    | ActionPack CI split plan — split `packages/actionpack` out of the shared `unit-tests` job into a dedicated no-DB `actionpack-tests` job ahead of the Wave 7 journey port. (Scope narrowed from prior multi-phase roadmap on 2026-05-14.) |
| [`browser-compat-plan.md`](browser-compat-plan.md)                                 | P2       | S    | ~65% complete. BC-3 adapter registry, 2 ESLint rules, browser-bundle CI smoke, BC-5 audits remain.                                                                                                                                       |

## Verification harnesses

| Doc                                                | Priority | Work | Notes                                                                                                                                     |
| -------------------------------------------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`parity-verification.md`](parity-verification.md) | P1       | —    | Schema + query parity pipelines (`pnpm parity:schema` / `pnpm parity:query`). Both shipped; reference for adding fixtures + format bumps. |
