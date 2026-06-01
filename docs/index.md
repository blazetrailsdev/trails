# Docs index

Snapshot 2026-05-26. Every plan/tracker doc in `docs/`, grouped by what
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

| Doc                                                                           | Priority | Work | Notes                                                                                             |
| ----------------------------------------------------------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------- |
| [`launch-roadmap.md`](launch-roadmap.md)                                      | P0       | —    | The "what blocks public launch" doc. Everything else feeds into this.                             |
| [`virtual-source-files-plan.md`](infrastructure/virtual-source-files-plan.md) | P0       | M    | Phase 1 done; **Phase 2 (tsserver plugin)** is the open work. 6 sub-PRs (2.1–2.6) + Phase 3 docs. |

## Per-package "Road to 100%" trackers

Live package-scoped api numbers come from
`pnpm tsx scripts/api-compare/compare.ts --package <name>` (after the
extract step has run; `pnpm api:compare` is a chained `&&` script and
doesn't forward `--package` to `compare.ts`). Test numbers come from
`pnpm test:compare`. Doc snapshots may lag — re-check before scoping.

| Doc                                                                 | api:compare                          | Priority | Work | Notes                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------ | -------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`activerecord-100-plan.md`](activerecord/activerecord-100-plan.md) | **100% pub** / 100% rounded          | P1       | M    | Public api:compare closed; private parity at 100% rounded (4956/4958). **Single consolidated tracker** — open batches, per-cluster followups, cross-cluster followups, story count, guardrails. test:compare 6568/7885 (83.3%).                                              |
| [`actionpack-100-percent.md`](actionpack-100-percent.md)            | AD 94.6% / AC 85.8% / Abs 100% (api) | P1       | L    | Consolidated tracker for ActionDispatch + ActionController + AbstractController (was two docs). Open: AC `base.rb` 38%, http_authentication, test_case, strong_parameters; AD partials + journey follow-ups + test:compare clusters.                                         |
| [`actionview-100-percent.md`](actionview-100-percent.md)            | 8.2% (api)                           | P3       | XL   | Roadmap. `.tse` extension; ERB-style tags; build-time compilation into gitignored `.trails/` mirror dir; dual render API (typed registry + explicit import); trails-tsc promoted to own package with plugin API. Phase 0.5 stubs unblock actionpack followups blocked on AV. |
| [`activesupport.md`](activesupport.md)                              | 24.7% (denominator stale)            | P2       | —    | **Not a 100% target.** Scope is "what siblings need + standalone runtime utilities"; Ruby-isms explicitly out.                                                                                                                                                               |
| [`rack-100-percent.md`](rack-100-percent.md)                        | 60% (api) / 100% (test name-match)   | P2       | M    | 12 PR slots, ~2.3k LOC total. Multipart cluster directly unblocks actiondispatch `param_builder`. test:compare 100% is name-match only — audit test bodies as each slot lands. Session/Static deferred (separate gems / out of scope).                                       |

## Plans / backlogs

| Doc                                                                                         | Priority | Work | Notes                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | -------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`activerecord-index.md`](activerecord/activerecord-index.md)                               | P1       | —    | **Sequenced shipping plan for activerecord.** Phases 1–7 with cross-doc dependencies. Read this first when triaging AR work.            |
| [`activerecord-type-audit.md`](activerecord/activerecord-type-audit.md)                     | P1       | M    | Type-debt audit + 4-wave reduction plan. Waves 1–3 shipped; W1b + ~150 LOC follow-ups bundle + W4 deferred.                             |
| [`activerecord-100-plan.md`](activerecord/activerecord-100-plan.md)                         | P1       | L    | test:compare drive — batch list (Part 1) + per-file backlog table (Part 2, merged from the former `activerecord-test-compare-100.md`).  |
| [`activerecord-gaps.md`](activerecord/activerecord-gaps.md)                                 | P2       | S    | Residual gaps (associations/relation/connection-pool/database-tasks/query-cache, merged). Mostly blocked/done; pick "Unblocked" items.  |
| [`trailties-plan.md`](trailties/trailties-plan.md)                                          | P2       | XL   | Phase 0 done. Greenfield from Phase 1 onward — Paths, Initializable, generators, Engine, Application — ~30 PRs minimum.                 |
| [`self-hosted-runner-restart-plan.md`](infrastructure/self-hosted-runner-restart-plan.md)   | P2       | S    | Post-incident restart plan after the ~1 TB egress event. pnpm store-path + Docker image-layer fixes before scaling `gh-runner` back up. |
| [`browser-compat-plan.md`](infrastructure/browser-compat-plan.md)                           | P2       | S    | ~65% complete. BC-3 adapter registry, 2 ESLint rules, browser-bundle CI smoke, BC-5 audits remain.                                      |
| [`adapter-architecture-cleanup.md`](activerecord/adapter-architecture-cleanup.md)           | P1       | M    | Adapter→Connection collapse (PR A/B/C), global Arel-visitor removal (Phases A–C, unblocked), hash-only constructor. Merged 2026-06-01.  |
| [`tse-plan.md`](trailties/tse-plan.md)                                                      | P3       | XL   | TSE template engine implementation plan. Phase 1 (lexer+codegen) shipped; Phase 2 (compiler CLI, d.ts emit, LS plugin) in design.       |
| [`system-testing-plan.md`](system-testing-plan.md)                                          | P2       | S    | System testing via Playwright (replaces Capybara/Selenium). 56 methods across 6 files; 2 PRs.                                           |
| [`html-sanitizer-plan.md`](html-sanitizer-plan.md)                                          | P3       | M    | HTML sanitizer implementation plan for ActionText / ActionView safe-list sanitization.                                                  |
| [`trailties-template-builder.md`](trailties/trailties-template-builder.md)                  | P2       | M    | Generator templates — TypeScript-native plan. Locked 2026-05-21.                                                                        |
| [`trailties-thor-port.md`](trailties/trailties-thor-port.md)                                | P2       | M    | Commander → Thor port for trailties CLI.                                                                                                |
| [`lint-deps-plan.md`](infrastructure/lint-deps-plan.md)                                     | P2       | S    | lint:deps — Arel + ActiveModel dep-parity plan. Phase 1 done.                                                                           |
| [`rails-file-structure-mirror-plan.md`](infrastructure/rails-file-structure-mirror-plan.md) | P2       | S    | Rails file-structure mirror plan. Planning stage; method-order slice landed.                                                            |

## Verification harnesses

| Doc                                                             | Priority | Work | Notes                                                                                                                                     |
| --------------------------------------------------------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`parity-verification.md`](activerecord/parity-verification.md) | P1       | —    | Schema + query parity pipelines (`pnpm parity:schema` / `pnpm parity:query`). Both shipped; reference for adding fixtures + format bumps. |
