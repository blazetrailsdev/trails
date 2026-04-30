# CI Improvement Plan

## Current state

`.github/workflows/ci.yml` — 813 lines, 21 jobs + 1 aggregate (`ci`).

Counts that matter:

- `pnpm install --frozen-lockfile`: 18 invocations
- `pnpm build` (full): 6 invocations across `build-and-typecheck`, `guides-typecheck`, `website`, `rails-comparison`, plus partial `--filter` builds in `schema-parity-trails` and `query-parity-trails`
- Identical Node+pnpm setup blocks: 20+
- `vitest run --no-file-parallelism packages/activerecord`: 3 jobs (sqlite/postgres/mariadb)

Parity is already gated behind `parity_sqlite` (schedule/push/dispatch + per-adapter PR labels), so it's not on the default-PR critical path. Focus is the always-on jobs.

> ⚠️ **No timing data yet.** This plan deliberately avoids quoting wall-time savings until Phase 0 instruments the workflow. Anything labeled "Impact" below is a directional claim, not a measurement.

## Pain points (ranked, with evidence)

### 1. `pnpm build` runs 6 times per PR with no shared output — High

Every consumer of `dist/` rebuilds from source. Composite project references exist but `.tsbuildinfo` doesn't cross job boundaries. This is the largest single source of redundant work; bigger than install dedup.

### 2. Adapter tests serialize all DB-touching tests — High

`vitest run --no-file-parallelism packages/activerecord` runs **all** AR test files in a single worker because tests share one DB. The flag exists for correctness (per-test DB isolation), so removing it requires a real isolation strategy — see "DB isolation options" below. This is likely the single longest job on the critical path.

### 3. 18 redundant `pnpm install` calls — Medium-High

Even with `cache: pnpm`, install still resolves the workspace graph and links 500+ packages. Mitigated by a composite action + `node_modules` cache, not by `workflow_call`.

### 4. Three structurally identical AR adapter jobs — Medium

`sqlite-tests` / `postgres-tests` / `mariadb-tests` differ only in services + one env var. Matrix would not save setup time (each matrix entry is its own job) but eliminates copy-paste drift and makes the next change (e.g. a new adapter) one-line.

### 5. `rails-comparison` is strictly serial — Medium

10 ordered steps. Ruby setup runs after pnpm install; Rails-source fetch can't start until pnpm install finishes; TS API extraction (which only needs pnpm + build) is gated behind Ruby work. Real concurrency available here.

### 6. Parity `*-diff` jobs do a full install for a diff — Low-Medium

`schema-parity-diff` / `query-parity-diff` install the workspace, download two artifacts, run one tsx script. If the diff scripts can be made to run from prebuilt `dist/` (artifact) or rewritten as a Node script with no workspace deps, install drops out.

### 7. `query-parity-trails` rebuilds AR every run — Low-Medium

Lines 562–566 build activesupport → activemodel → arel → activerecord in dep order on every run. Same artifact would unblock this from #1.

### 8. Minor

- `dx-type-tests` and `virtualized-dx-type-tests` both rebuild before testing; could share build artifact

## DB isolation options (the `--no-file-parallelism` question)

The flag is a correctness fix, not laziness. Removing it needs a story for concurrent test files hitting the same database. Options, roughly in increasing setup cost / decreasing operational risk:

**Sizing note.** GitHub-hosted `ubuntu-latest` is 4 vCPU. Vitest with `pool: 'forks'` (the only pool that gives real process isolation for connection pools) defaults to ~3 workers. So "per-worker" = 3, not N. All options below assume `pool: 'forks'`.

**A. Database-per-worker.** Test setup uses `rails_js_test_${VITEST_POOL_ID}` (1..3) and tears down. Schema loaded once per worker at suite start, not per file.

- Pros: clean blast-radius, mirrors `ActiveRecord::TestDatabases`.
- Cons: schema load × 3 — could eat the parallelism win if schema is large. Mitigation: load schema into a template DB once, `CREATE DATABASE … TEMPLATE` per worker (Postgres) or `mysqldump | mysql` (MariaDB).
- Best fit: postgres + mariadb.

**B. Schema-per-worker (Postgres).** One database, `SET search_path TO test_${POOL_ID}`. Cheaper than DB-per-worker.

- Pros: faster setup; schema-load amortized.
- Cons: Postgres-only; AR's schema-cache + introspection paths must respect search_path.

**C. Transactional tests (Rails-style), opt-out per file.** Wrap each test in a transaction, rollback on teardown. Most files opt in (`use_transactional_tests = true` in Rails); files testing transaction behavior opt out and use option A. This is exactly Rails' production model.

- Pros: fastest; no DB provisioning per worker; well-understood semantics.
- Cons: needs a per-file flag in vitest setup; opt-out files still need isolation (combine with A or D).
- Combines well with A — A handles the opt-outs.

**D. SQLite-only: file-per-worker.** Trivial — each worker uses `:memory:` or `/tmp/test-${POOL_ID}.sqlite3`.

- Doesn't help postgres/mariadb but cleanly unblocks the SQLite job, which is the most-run adapter.

**Recommendation:** Start with D for `sqlite-tests` (low risk, immediate critical-path win, validated by Phase 0.6). Then A+C combined for postgres+mariadb: most files use C (transactional), transaction-behavior files opt out and rely on A.

Open question: how much of the AR suite _can_ run in parallel today? A quick experiment — run with `--no-file-parallelism` removed against SQLite-`:memory:` per worker — would answer this without writing infrastructure.

## Proposed improvements

### Phase 0 — Free wins + measure (do today)

**0.5 Build-graph audit.** Locally: `time pnpm build` cold, then warm. Measure `dist/` size. Determines whether shared-build-artifact (1.2) or `.tsbuildinfo` cache wins — they're mutually exclusive.

- Effort: S — Risk: none.

**0.6 SQLite parallelism experiment.** Drop `--no-file-parallelism` from `sqlite-tests` locally with `:memory:` per `VITEST_POOL_ID`, see how many tests fail. Answers "how much of the suite can parallelize today without infrastructure" before we commit to a strategy.

- Effort: S — Risk: none (local branch, throwaway).

### Phase 1 — Dedup work (after Phase 0 confirms targets)

**1.1 Composite action for setup.** `.github/actions/setup/action.yml` runs checkout + pnpm + node + install. All jobs `uses: ./.github/actions/setup`.

- Impact: removes 18 copies of identical YAML; pnpm version bumps become one line.
- Effort: S — Risk: low.
- Note: this is _not_ `workflow_call` — that's per-job, wrong primitive.
- Caveat: composite actions can't trivially own `actions/checkout` if callers need different `fetch-depth` (`changes` uses `fetch-depth: 0`). Either parameterize or keep checkout in callers.

**1.2 Share build output across jobs (one of two strategies — pick after 0.5).**

_Strategy A: artifact._ New `build` job runs `pnpm build`, uploads `packages/*/dist/`. Consumers `needs: build` and download.

- Wins when: `dist/` is small enough that upload+download < cold rebuild.
- Loses when: `dist/` is large; artifact transfer dominates.

_Strategy B: `actions/cache` keyed on source hash._ Cache `packages/**/dist/` + `**/.tsbuildinfo` keyed on `hashFiles('packages/**/src/**', 'packages/**/tsconfig*.json', 'pnpm-lock.yaml')`.

- Wins when: incremental rebuild is fast (composite project), cache hit lets `tsc --build` no-op.
- Loses when: cache misses are common (cache key too tight) or warm rebuild was already fast.

Pick after measuring 0.5. Don't ship both — they're alternatives, not complements.

- Effort: M — Risk: medium.

**1.3 SQLite parallel tests.** Per option D above: `:memory:` or per-worker file, drop `--no-file-parallelism` from `sqlite-tests` only.

- Impact: directly cuts the critical path for the most-common adapter.
- Effort: S–M (depends on test setup hooks).
- Risk: low — failure mode is loud (test failures), not silent.

### Phase 2 — Restructure (only if Phase 1 isn't enough)

**2.1 AR adapter matrix.** Collapse three jobs to one with `strategy.matrix.adapter` + conditional services. Cosmetic / DRY win, not a wall-time win.

- Effort: M — Risk: medium (conditional `services:` is awkward in Actions; verify before merging).

**2.2 Postgres/MariaDB DB-per-worker.** Per option A above. Larger lift than 1.3 because schema load runs N times; benefit depends on whether postgres/mariadb jobs are actually critical-path (Phase 0 will tell us).

- Effort: L — Risk: medium.

**2.3 Pipeline `rails-comparison`.** Split into three jobs: `fetch-rails-sources` (Ruby, no Node) + `extract-ts-api` (Node, no Ruby) running in parallel, then `compare` (needs both).

- Effort: M — Risk: low.

**2.4 Drop install from parity diff jobs.** Either bundle the diff script as an artifact, or rewrite to plain Node with zero workspace deps. Makes diff jobs ~install-time fast.

- Effort: M — Risk: low (parity is label-gated; safe to iterate).

### Phase 3 — Cleanup

- Per-package path filters in `changes` so AR-only changes can skip non-AR jobs and vice versa. Pair with a nightly full-matrix run so we don't ship regressions through path-filter holes.

## Phased rollout

| Phase          | What                                                                   | Effort | Risk    |
| -------------- | ---------------------------------------------------------------------- | ------ | ------- |
| 0. Measure     | Timing report + build audit                                            | S      | none    |
| 1. Dedup       | Composite setup, shared build artifact, SQLite parallel                | S–M    | low–med |
| 2. Restructure | Matrix, PG/MySQL parallel, pipeline rails-comparison, parity diff slim | M–L    | medium  |
| 3. Cleanup     | prettier gate, path filters                                            | S      | low     |

Hard rule: **Phase 0 ships first**. Don't optimize without numbers.

## Open questions

1. What are the actual top-3 longest jobs today? (Phase 0)
2. Is full `pnpm build` actually slow, or is it already incremental + fast? (Phase 0.5)
3. How many AR test files genuinely need DB isolation vs. how many would run cleanly in parallel against a shared SQLite `:memory:`? Worth a 30-min experiment.
4. Could `rails-comparison` be path-gated to API-surface changes only, deferring the rest to nightly?
5. Are postgres+mariadb adapter jobs actually on the critical path, or is SQLite the bottleneck? (Phase 0)
6. Is `cache: pnpm` from `setup-node` already covering enough — i.e. is the bottleneck the install itself or the workspace linking step? Worth a `pnpm install --frozen-lockfile` time measurement on a warm cache.
