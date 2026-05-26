# Fixtures adoption plan

Tracks migrating the existing AR test suite from inline `defineSchema()` +
ad-hoc `Model.create({...})` seeding to `useFixtures([...])` against the
122 ported fixtures under
`packages/activerecord/src/test-helpers/fixtures/`.

This is the follow-up the fixtures-port plan punted on ("PR 8 — proof-of-
concept conversion … Out of scope: migrating any other test files — that's
a separate plan doc"). This is that doc.

## Decisions (locked in 2026-05-22)

| #   | Decision                                                                                              | Rationale                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Scope:** every AR test whose Rails counterpart calls `fixtures(:foo)`                               | Mirrors Rails line-for-line where Rails has a counterpart; eliminates the inline-seed surface where TM Phase 6 hazards keep tripping                                                                                |
| 2   | **Aggressiveness:** per file, rewrite BOTH setup AND test body to mirror the Rails counterpart        | Drives `test:compare` matches as a side effect; setup-only would leave assertions diverged                                                                                                                          |
| 3   | **Sequencing:** Phase B canary blocks on pool epic Phase E                                            | Pinned-connection-per-test is the natural home for `setup_fixtures`-shaped load-once-per-worker; doing this before would either preserve the AsyncContext sidecar across the conversion or be reworked when E lands |
| 4   | **Batching:** by loader-readiness tier, not by test-directory cluster                                 | A test-directory sweep would block on whichever file hits the worst loader gap; tiering ships clean files first and unblocks the rest with surgical loader PRs                                                      |
| 5   | **DIFF / ERB-UNSUPPORTED fixtures don't block consumers**                                             | If a test only references the rows that ARE comparable in `fixtures:compare`, the file is adoptable now; fixtures-port PR 7b (strict-fail) is independent                                                           |
| 6   | **Files whose Rails counterpart inlines `Model.create` (no fixtures)** stay out of scope for adoption | The Phase F lint rule keys on `test:compare` membership AND Rails fixture usage; non-fixture-using counterparts aren't penalized                                                                                    |
| 7   | **`useFixtures` runs once per worker, not per test, post-pool E**                                     | Matches Rails `setup_fixtures` semantics; tests roll back their writes via `withTransactionalFixtures`, fixture data remains. Implementation hook lands as Spike S1 (Prerequisites, below).                         |

## Prerequisites (must land before Phase B)

1. **Pool epic Phase E.** `createTestAdapter()` returns a pinned pool-
   checkout; sidecar's `_txLockStorage` / `_manualTxDepth` / `AsyncContext`
   filter are deleted. Tracked in `connection-pooled-test-adapter-plan.md`.
2. **Spike S1 — worker-level fixture seed (standalone PR, ~100–150 LOC).**
   Today `useFixtures` seeds per-test (`use-fixtures.test.ts`). Under
   the pool, the seed runs once during worker setup; tests' TX wraps
   open AFTER the seed and roll back only their own writes. Possible
   homes: custom `VitestTestRunner` (the same one the pool epic adds
   for `withExecutionContext`), `setupFiles`, or a new
   `useFixtures.setupOnce()` API. Spike picks one and ships
   **before** Phase B canary so the canary PR is purely the
   conversion pattern, not pattern+infra mixed.
3. **Schema-port wired.** `setup-adapter-suite.ts` loads `test-schema.ts`
   (#2140); 159 AR test files already on `withTransactionalFixtures`.
   No additional work — just a precondition check.

## Phase A — Inventory and tiering (docs only)

Generate `docs/fixtures-adoption-inventory.md` (committed, regenerated
each Phase). One row per AR test file with a Rails counterpart. Columns:

| Column                | Source                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ts-file`             | `find packages/activerecord/src -name '*.test.ts'`                                                                          |
| `rails-counterpart`   | `scripts/api-compare/test-mapping.json` (existing)                                                                          |
| `rails-fixtures-used` | Parse `fixtures :foo, :bar` from the Ruby file via a small script under `scripts/fixtures-adoption/`                        |
| `fixture-readiness`   | `pnpm fixtures:compare --json`: MATCH / DIFF / ERB-UNSUPPORTED per fixture; aggregate worst per file                        |
| `loader-blocked-by`   | Cross-reference rails-fixtures-used against the open loader-gap list (string-PK / enum / NOT NULL timestamp / composite-FK) |
| `current-setup`       | grep classification: `inline-create` / `defineSchema` / `withTransactionalFixtures` / `mixed`                               |
| `tm-phase6-hazard`    | grep for inline DDL, dependent: \[destroy\|nullify\|restrict\], engineered-id assertions                                    |
| `tier`                | derived: 1 / 2 / 3 / 4 (rules below)                                                                                        |

**Tier rules:**

- **Tier 1** — all fixtures MATCH, no loader gaps, no Phase 6 hazard,
  `withTransactionalFixtures` already in place. Mechanical sweep.
- **Tier 2** — fixtures MATCH but one or more rows blocked by a loader
  gap. Promoted to Tier 1 by the corresponding loader PR.
- **Tier 3** — fixture has ERB-UNSUPPORTED or DIFF that the test
  actually depends on, OR file has a Phase 6 hazard. Per-file surgery.
- **Tier 4** — Rails counterpart exists but doesn't use fixtures
  (inline `Model.create` on the Rails side too). Out of scope for
  conversion; covered by Phase F lint rule's exclusion list.

**Deliverable:** Phase A ships as a single ~150–300 LOC PR: the
inventory script under `scripts/fixtures-adoption/` + the generated
`inventory.md` + a `pnpm fixtures:adoption:inventory` task in root
`package.json`. The script is idempotent; rerun after every batch.

**Success criteria:**

- Inventory committed; tier counts settle the Phase C–E sizing
- Script runs in <30s on a warm checkout
- 100% of AR test files in `packages/activerecord/src/**/*.test.ts`
  classified; "unmapped Rails counterpart" appears as `tier=4-unmapped`
  not silently dropped

## Phase B — Canary conversion (1 file, target ≤300 LOC)

**File selection rule** (mechanical, not "pick the cleanest"):
the Tier 1 file with the **smallest LOC delta** between TS and Rails
counterpart, AND that consumes ≥3 distinct fixture tables (so the
accessor pattern is exercised across multiple fixtures, not trivially).
Top candidate from manual look: a small file under `relation/` or
`finder-respond-to.test.ts`; final pick comes from Phase A inventory.

**Per-PR deliverables:**

- Spike S1 is already merged (separate PR per Prerequisites)
- Inline `Model.create` / `defineSchema` setup deleted from the canary file
- Top-of-file `const { authors, posts } = useFixtures({...})`
- Test bodies rewritten to call `authors("david")`-style accessors and
  assert literal Rails ids/counts where the Rails source does
- **Test names unchanged** (CLAUDE.md: never rename tests)
- A new section in this doc, "Canary pattern," capturing the worked
  shape for batch PRs to reference

**Success criteria:**

- `test:compare` shows the canary file's match-rate increased; no
  regressions elsewhere
- Local `pnpm vitest run <canary-file>` green on sqlite3 + PG + MySQL
  (PG/MySQL via CI legs; do not run full suite locally per CLAUDE.md)
- Spike S1 hook is generic — no canary-file-specific code

## Phase C — Tier 1 sweep (batches of ~250 LOC)

Mechanical conversion. Bundle 3–8 small Tier 1 files OR one large
Tier 1 file per PR, targeting the 300-LOC ceiling.

**Ceiling escape valve.** Rails-mirrored body rewrites (Decision 2)
can push a single file over 300 LOC on their own — particularly the
large association and relation files. When that happens: ship the
file alone, note "ceiling waiver — Rails-mirrored body port"
in the PR body. Same precedent as fixtures-port PR 7a (~1.9k LOC,
documented waiver). Do NOT trim the body rewrite to fit ceiling;
that defeats Decision 2.

**Within Phase C, batch order is by Rails-counterpart cluster** so a
single reviewer can trace pattern reuse across a coherent slice:
`associations/`, `validations/`, `relation/`, `persistence/`,
`scoping/`, etc. This is a _secondary_ ordering — Tier 1 status is the
gate, cluster is just batch-packing.

**Per-PR checklist (codified in PR template if useful):**

- [ ] All files in batch are Tier 1 per latest `inventory.md`
- [ ] Each file's diff = setup-block delete + body rewrite; no new
      helpers (if a gap shows up, ship it standalone first)
- [ ] `test:compare` net change is ≥0 across affected files
- [ ] No test names changed
- [ ] No `withTransactionalFixtures` rollback failures observed locally

**Stop-and-fix triggers** (block the batch):

- Loader gap surfaces that Phase A missed → file moves to Tier 2;
  open a loader PR
- `test:compare` regression in a file outside the batch (cross-file
  contamination from the shared worker pool) → investigate
- Rollback fails because a fixture row's data trips a constraint
  on PG/MySQL but not SQLite (real bug, common at this stage) →
  diagnose; don't paper over with `skipIf`

## Phase D — Loader gap PRs + Tier 2 → 1 promotion

Each open loader gap from the fixtures port becomes a pair of
PRs: the loader fix + the Tier 2 → 1 batch it unlocks. Shipped in this
order to keep diffs small:

| Loader gap                                    | Loader PR   | Unlocks (Tier 2 → 1 batch)                                       |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `resolveDeclaredPk` string-PK                 | ~20 LOC     | `subscribers`, `string-key-objects` consumers                    |
| NOT NULL `created_at`/`updated_at` auto-stamp | ~30–50 LOC  | `people` consumers                                               |
| Enum-aware insert                             | ~40 LOC     | `parrots`, `memberships` consumers                               |
| `ref()` key-path for composite FK             | ~50 LOC     | CPK cluster consumers                                            |
| `belongs_to`-reflection FK resolver           | ~80–150 LOC | **Defer.** Cosmetic; doesn't gate any test                       |
| Registry rollback widening                    | ~5 LOC      | Bundle into the next adjacent loader PR; too small to ship alone |

**Phase D success criteria:**

- After all four prioritized loader PRs land, Tier 2 count is 0
- Each batch PR cites the loader PR it depends on
- `inventory.md` re-runs cleanly between each pair

## Phase E — Tier 3 surgery

Per-file diagnosis. Each file's path is determined case-by-case:

- **ERB-UNSUPPORTED dependency:** does the test actually reference the
  un-expanded rows? `grep` the test file for the relevant fixture
  labels. If not, file is adoptable now (drop unreferenced rows from
  `useFixtures` declaration). If yes, blocks on fixtures-port PR 7b's
  allow-list or stays Tier 3.
- **DIFF dependency:** same triage. Most DIFFs are compare-script gaps,
  not real data divergence — verify against the row's actual TS data
  before deferring.
- **Phase 6 hazard** (inline DDL / MariaDB savepoint / PG sequence drift):
  the hazard fix from TM Phase 6 follow-ups lands first; adoption follows.
  Bundle the adoption with the hazard-fix PR if both fit under 300 LOC.

Tier 3 is not a sweep — each file is a small bespoke PR. Track residual
count in `inventory.md`.

## Phase F — Retire inline-seed patterns globally

Once Tier 1 + 2 are at 0, Tier 3 is ≤10 files, and the Phase B canary
pattern has been reused across 20+ batch PRs:

1. **Lint rule `blazetrails/prefer-fixtures` under `eslint/`**
   (~100 LOC, matches existing custom-rule shape — see
   `blazetrails/rails-private-jsdoc`, `blazetrails/sqlite-driver-await`).
   Static check: flag `Model.create` (or any `Model.<persistedMethod>`)
   inside `beforeAll`/`beforeEach` bodies in any `*.test.ts` file
   under `packages/activerecord/src/` UNLESS the file path is
   in `eslint/prefer-fixtures-allowlist.json`. The allowlist is
   **generated** by `pnpm fixtures:adoption:inventory` from current
   Tier 3 + Tier 4 + Tier 4-unmapped; it's a committed file, not
   computed at lint time. No `test:compare` JSON lookup happens
   during linting — that runtime dependency would be fragile.
   Files leave the allowlist as they're adopted in subsequent batches.
2. **Drop `defineSchema()` helper's per-file usage doc** in
   `test-helpers/define-schema.ts`. Helper stays (still used by
   `define-schema-pg-types.test.ts` where it's the SUT), but the
   canonical schema source is `setup-adapter-suite.ts`.
3. **CLAUDE.md update:** test conventions section points at
   `useFixtures` as the default seed pattern; `Model.create` reserved
   for assertion mutations within a test body, not setup.

**Phase F success criteria:**

- Lint rule active on `main`; CI green
- 0 `Model.create` inside `beforeAll`/`beforeEach` in non-allowlisted
  files

## Sizing estimate (derivation, not magic numbers)

Inputs (verified against the worktree):

- 490 total AR test files (`find packages/activerecord/src -name '*.test.ts' | wc -l`)
- 159 already on `withTransactionalFixtures` / `defineSchema`
- 122 fixtures translated (fixtures port — complete)
- 94 fixtures currently MATCH under `fixtures:compare`

Rough projection (refined in Phase A):

- **~120–150 files** have Rails counterparts using fixtures (estimate
  from test:compare mapping density; Phase A makes this exact)
- **~70–90 Tier 1** at start (clean fixtures + no loader gap) → ~12–18
  batch PRs at the 250-LOC ceiling, plus 1 canary
- **~20–30 Tier 2** at start → 4 loader PRs + 4 batch PRs as gaps close
- **~10–20 Tier 3** → ~10–20 small bespoke PRs over a longer tail

**Total PR count: ~30–45.** Wall-clock dominated by review cycles, not
LOC. Assume 2–4 weeks for Phase C steady-state once pool E lands and
the canary pattern is settled.

## Risks

1. **Test-data mutation contract.** `withTransactionalFixtures`
   rolls back writes per-test, so tests CAN mutate fixture rows
   freely. Pool E preserves this. **Risk:** if Phase F ever loosens
   the rollback (perf optimization, etc.), tests will start
   interfering through fixture-row mutation. Mitigate: document the
   "fixture rows are stable inside a test, rolled back at end" invariant
   in the Phase F CLAUDE.md update; add a lint hint if it ever changes.
2. **`test:compare` regression during partial conversion.** A file
   half-converted (setup-only, body not yet aligned to Rails) can
   score _worse_ on `test:compare` than the pre-conversion version
   because TS-only assertions hide what's missing. Mitigate: Decision
   2 (no setup-only conversions); each file ships fully or not at all.
3. **Pool E slippage blocks Phase B.** If pool epic Phase D drags
   (currently 1 batch in flight, 4–8 more expected), this plan
   stalls. Mitigate: Phase A (inventory) is fully unblocked and ships
   while pool D runs. Doesn't reduce wall-clock but keeps the queue
   warm.
4. **Loader-gap discovery during Phase C.** Phase A's static analysis
   may miss runtime-only loader gaps that only fail when a specific
   row inserts. Mitigate: each batch PR runs the affected files
   against PG + MySQL CI legs before merge (standard CI matrix
   already in place).
5. **CI matrix cost.** Each Phase C batch triggers the full
   `postgres-tests` + `mysql-tests` jobs in `.github/workflows/ci.yml`.
   ~30–45 PRs adds material CI minutes. Mitigate: bundle aggressively
   toward the 300-LOC ceiling; consider paths-filter narrowing if
   minutes get noisy.

## Post-merge follow-ups

**From #2391 (Phase G batch 1 — first 2 D-1 migrated files)**

Only 2 of the 25 D-1 migrated files in #2397 met fixture-adoption criteria
(compatible schema + all fixtures MATCH + no loader gap). The other 23 are
blocked on:

- Schema-reflected attributes don't generate dirty-tracking methods (~20 LOC
  in `model-schema.ts`; tracked in connection-pooled-test-adapter-plan.md).
  This is the primary gate — it blocks ~23 candidate files from reaching Tier 1.
- Remaining D-1 codemod variants (multi-describe, sidecar, adapter-specific
  files) haven't been migrated yet; Phase G can't adopt those files until
  their pool wiring is in place.

Status note: Phase G is in flight but at ~8% of target scope until the
schema-reflected dirty-tracking gap and remaining D-1 variants land.

## Cross-references

- fixtures port (complete) — the data substrate;
  Loader gaps section feeds Phase D's pairings
- [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md)
  — Phase E gates this plan's Phase B
- [`tm-unification-plan.md`](tm-unification-plan.md) Phase 6 hazard
  catalogue — Tier 3 files inherit those hazards
- `vendor/rails/activerecord/test/cases/` — the Rails counterparts
  whose test bodies and assertions this plan mirrors
- `scripts/api-compare/test-mapping.json` — Phase A's Rails-counterpart
  source of truth
