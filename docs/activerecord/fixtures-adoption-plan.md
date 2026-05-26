# Fixtures adoption plan

> **Status (2026-05-26):**
>
> - Canary conversions shipped: **PR #2318** (`boolean.test.ts`, PoC), **PR #2391** (`type/string.test.ts` + `coders/json.test.ts`, first batch).
> - Phase B canary outcome: pattern works; the cleaner-than-Rails "import canonical model + local subclass for test-specific traits" shape emerged as the template.
> - Empirical yield from #2391: of 25 currently D-1 migrated files, **only 2 (~8%) cleanly converted**. Remaining 23 hit bespoke models / test-specific class mods / non-fixture setup / schema incompatibility.
> - **D-1 progress is the true gate.** Phase G can only target D-1'd files. With ~87 files still bypass-ridden after PR #2400, the convertible pool grows as D-1 codemod sweeps land.
> - D-Y (#2372) absorbed most of what Phase E was supposed to enable for fixture seeding — the "blocks on Phase E" sequencing decision is obsolete.
> - Phase B "Spike S1" worker-level seeding still relevant but lower urgency; per-test seed works fine in the canary PRs.

Tracks migrating the existing AR test suite from inline `defineSchema()` +
ad-hoc `Model.create({...})` seeding to `useFixtures([...])` against the
122 ported fixtures under
`packages/activerecord/src/test-helpers/fixtures/`.

This is the follow-up the fixtures-port plan punted on ("PR 8 — proof-of-
concept conversion … Out of scope: migrating any other test files — that's
a separate plan doc"). This is that doc.

## Decisions (locked in 2026-05-22)

| #   | Decision                                                                                              | Rationale                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Scope:** every AR test whose Rails counterpart calls `fixtures(:foo)`                               | Mirrors Rails line-for-line where Rails has a counterpart; eliminates the inline-seed surface where TM Phase 6 hazards keep tripping                                                                                                                                                               |
| 2   | **Aggressiveness:** per file, rewrite BOTH setup AND test body to mirror the Rails counterpart        | Drives `test:compare` matches as a side effect; setup-only would leave assertions diverged                                                                                                                                                                                                         |
| 3   | ~~**Sequencing:** Phase B canary blocks on pool epic Phase E~~ **OBSOLETE 2026-05-26**                | D-Y (#2372) shipped canonical schema preload + additive `defineSchema`, absorbing most of what Phase E was supposed to enable. Canary shipped before E (#2318, #2391). Phase E remains required for the worker-level Spike S1 seeding optimization but is no longer a hard gate for adoption work. |
| 4   | **Batching:** by loader-readiness tier, not by test-directory cluster                                 | A test-directory sweep would block on whichever file hits the worst loader gap; tiering ships clean files first and unblocks the rest with surgical loader PRs                                                                                                                                     |
| 5   | **DIFF / ERB-UNSUPPORTED fixtures don't block consumers**                                             | If a test only references the rows that ARE comparable in `fixtures:compare`, the file is adoptable now; fixtures-port PR 7b (strict-fail) is independent                                                                                                                                          |
| 6   | **Files whose Rails counterpart inlines `Model.create` (no fixtures)** stay out of scope for adoption | The Phase F lint rule keys on `test:compare` membership AND Rails fixture usage; non-fixture-using counterparts aren't penalized                                                                                                                                                                   |
| 7   | **`useFixtures` runs once per worker, not per test, post-pool E**                                     | Matches Rails `setup_fixtures` semantics; tests roll back their writes via `withTransactionalFixtures`, fixture data remains. Implementation hook lands as Spike S1 (Prerequisites, below).                                                                                                        |

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

## Phase B — Canary conversion — **SHIPPED**

Shipped in two PRs:

- **PR #2318** — `boolean.test.ts`. Single-file PoC, established the
  base pattern: drop inline `defineSchema()`, import canonical model
  (or use it as a parent for a local subclass when test-specific traits
  are needed), call `useFixtures({...})` at top, convert assertions to
  fixture-ref ids.
- **PR #2391** — `type/string.test.ts` + `coders/json.test.ts`.
  Validated the "canonical parent + local subclass" pattern for
  tests that need extra attributes/serializers beyond canonical.

### Canary pattern (worked shape)

For a file currently inlining `class X extends Base {}`:

```ts
// before
class StringTestAuthor extends Base {
  static {
    this.adapter = adapter;
    this.attribute("name", "string");
  }
}
let author: StringTestAuthor;
beforeEach(async () => {
  author = await StringTestAuthor.create({ name: "Sean" });
});

// after — pattern from #2391
import { Author } from "../test-helpers/models/author.js";
class StringTestAuthor extends Author {
  static {
    this.attribute("name", "string");
  } // explicit attr generates nameChanged()
}
const { authors } = useFixtures({ authors: [StringTestAuthor, { sean: { name: "Sean" } }] });
// in test body: StringTestAuthor.find(authors("sean").id)
```

Key insights from the canary PRs:

1. **Canonical-as-parent works well** when the test needs validations/
   serializers the canonical doesn't have. Avoids fighting schema mismatch.
2. **Schema-reflected attributes don't auto-generate dynamic dirty methods**
   (e.g. `nameChanged()`) — declare via `this.attribute("name", "string")`
   inside the local subclass when the test exercises them.
3. **D-Y absorbs `defineSchema` calls** for canonical-compatible schemas;
   converted files drop `defineSchema` entirely when their tables are all
   in canonical.
4. **`vi.stubEnv("AR_NO_AUTO_SCHEMA")`** patterns can be dropped — D-Y
   handles the orchestration.

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

Each open loader gap from `fixtures-port-plan.md` becomes a pair of
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

## Sizing estimate (updated 2026-05-26 with empirical yield)

Inputs (verified against the worktree):

- 492 total AR test files
- 195 with inline `class X extends Base` (Phase G candidates)
- 215 canonical models ported (all clusters complete; see models-port project)
- 122 fixtures translated; hard-fail gate live
- D-1 backlog: **87 files still containing `this.adapter = adapter`** (was 200+ at pivot; 47 cleared by 5 codemod variants; 16 fully + 20 partial from #2400 most recent)

### Empirical yield from canary PRs

PR #2391 (the first multi-file batch) attempted 25 candidate files
(those already D-1 migrated) and **converted 2 cleanly (~8%)**. The
23 it couldn't convert hit one of: bespoke models not in canonical
(Metric/Invoice/Event), test-specific class modifications (validations,
serialize), no DB operations (only `new Model()`), or schema
incompatibility with canonical.

### Revised projection

- **D-1 is the true gate.** Phase G can only operate on D-1'd files.
  As D-1 codemod sweeps land (2 in flight: partial-finisher, PG/MySQL
  variant), the convertible pool grows.
- **~8% yield** holds as a working estimate. If 87 → 50 remaining D-1
  files after current sweeps, with ~150 files total addressed, the
  Phase G convertible pool is **~12-15 files**, not 70-90.
- **Most "inline-class" test files stay inline** because their classes
  are test-local inventions (Widget/Gizmo/Holdable) with no canonical
  counterpart. Those benefit from D-Y's `defineSchema` no-op fast-path
  and D-Z's `dropAllTables` elimination but don't convert to fixtures.
- Long-tail bespoke conversions (Tier 3 equivalents) likely 10-20 more
  files where Phase G's pattern needs adaptation per-file.

### Revised total

**~15-25 Phase G PRs total**, not 30-45. Cycle-time wins come
predominantly from D-Y + D-Z infra, not from Phase G adoption. The
adoption work mostly serves Rails-parity (assertions mirror Rails)
rather than performance.

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
3. ~~**Pool E slippage blocks Phase B.**~~ **OBSOLETE 2026-05-26** —
   D-Y (#2372) absorbed the relevant infra; Phase B canary shipped
   (#2318, #2391) before E.
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

## Cross-references

- `fixtures-port-plan.md` (completed, deleted) — the data substrate;
  Loader gaps section feeds Phase D's pairings
- [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md)
  — Phase E gates this plan's Phase B
- `tm-unification-plan.md` (completed, deleted) Phase 6 hazard
  catalogue — Tier 3 files inherit those hazards
- `vendor/rails/activerecord/test/cases/` — the Rails counterparts
  whose test bodies and assertions this plan mirrors
- `scripts/api-compare/test-mapping.json` — Phase A's Rails-counterpart
  source of truth
