# Fixtures adoption plan

> **Status (2026-06-01):**
>
> - Phases A + B (inventory script, canary conversions) — **SHIPPED** (#2318, #2391).
> - Empirical yield: ~8% of AR test files are cleanly convertible (most use bespoke
>   per-describe models with no canonical counterpart). See `fixtures-adoption-inventory.md`
>   for per-file classification.
> - **Recommendation (from inventory doc):** do NOT spin up a 12–18 PR sweep. Only 5
>   unconverted Tier 1 files remain. Convert opportunistically (bundled into adjacent PRs
>   touching those files). Treat adoption as a per-file Rails-parity nicety, not a program.
> - D-1 progress is no longer the gate — the structural constraint is that the AR suite is
>   built on bespoke per-describe models (146 Tier 3 files) and no-DB-op unit tests
>   (342 Tier 4 files), neither of which a canonical-fixture loader can serve.

Tracks migrating the existing AR test suite from inline `defineSchema()` +
ad-hoc `Model.create({...})` seeding to `useFixtures([...])` against the
122 ported fixtures under
`packages/activerecord/src/test-helpers/fixtures/`.

## Decisions (locked 2026-05-22)

| #   | Decision                                                                                       | Rationale                                                                                    |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **Scope:** every AR test whose Rails counterpart calls `fixtures(:foo)`                        | Mirrors Rails line-for-line; eliminates inline-seed surface where TM Phase 6 hazards trip    |
| 2   | **Aggressiveness:** per file, rewrite BOTH setup AND test body to mirror the Rails counterpart | Drives `test:compare` matches as a side effect; setup-only leaves assertions diverged        |
| 3   | **Batching:** by loader-readiness tier, not by test-directory cluster                          | A test-directory sweep would block on whichever file hits the worst loader gap               |
| 4   | **DIFF / ERB-UNSUPPORTED fixtures don't block consumers**                                      | If a test only references rows that ARE comparable in `fixtures:compare`, it's adoptable now |
| 5   | **Files whose Rails counterpart inlines `Model.create` (no fixtures)** stay out of scope       | Phase F lint rule's exclusion list handles them                                              |
| 6   | **`useFixtures` runs once per worker, not per test, post-pool E**                              | Matches Rails `setup_fixtures` semantics; Spike S1 implementation hook TBD                   |

## Phase C — Tier 1 sweep (batches of ~250 LOC)

**5 unconverted Tier 1 files remain** (see `fixtures-adoption-inventory.md`). Convert
opportunistically — bundle into adjacent PRs touching those files rather than standalone
sweep PRs.

**Ceiling escape valve.** Rails-mirrored body rewrites (Decision 2) can push a single file
over 300 LOC. When that happens: ship the file alone, note "ceiling waiver — Rails-mirrored
body port" in the PR body.

**Per-PR checklist:**

- [ ] All files in batch are Tier 1 per latest `fixtures-adoption-inventory.md`
- [ ] Each file's diff = setup-block delete + body rewrite; no new helpers
- [ ] `test:compare` net change is ≥0 across affected files
- [ ] No test names changed
- [ ] No `withTransactionalFixtures` rollback failures observed locally

## Phase D — Loader gap PRs + Tier 2 → 1 promotion

Each open loader gap becomes a pair of PRs: the loader fix + the Tier 2 → 1 batch it unlocks.

| Loader gap                                    | Est. LOC | Unlocks                                       |
| --------------------------------------------- | -------- | --------------------------------------------- |
| `resolveDeclaredPk` string-PK                 | ~20      | `subscribers`, `string-key-objects` consumers |
| NOT NULL `created_at`/`updated_at` auto-stamp | ~30–50   | `people` consumers                            |
| Enum-aware insert                             | ~40      | `parrots`, `memberships` consumers            |
| `ref()` key-path for composite FK             | ~50      | CPK cluster consumers                         |
| `belongs_to`-reflection FK resolver           | ~80–150  | **Defer.** Cosmetic; doesn't gate any test    |

## Phase E — Tier 3 surgery

Per-file diagnosis. Each file's path determined case-by-case:

- **ERB-UNSUPPORTED dependency:** does the test actually reference the un-expanded rows?
  If not, file is adoptable now. If yes, blocks on fixtures-port PR 7b's allow-list.
- **DIFF dependency:** most DIFFs are compare-script gaps, not real data divergence —
  verify against the row's actual TS data before deferring.
- **Phase 6 hazard** (inline DDL / MariaDB savepoint / PG sequence drift): hazard fix
  lands first; bundle adoption with the hazard-fix PR if both fit under 300 LOC.

## Phase F — Retire inline-seed patterns globally

Once Tier 1 + 2 are at 0, Tier 3 is ≤10 files, and the Phase B pattern has been reused
across 20+ batch PRs:

1. **Lint rule `blazetrails/prefer-fixtures`** (~100 LOC). Flag `Model.create` inside
   `beforeAll`/`beforeEach` in `*.test.ts` under `packages/activerecord/src/` unless the
   file is in `eslint/prefer-fixtures-allowlist.json` (generated from Tier 3 + 4 files by
   `pnpm fixtures:adoption:inventory`).
2. **Drop `defineSchema()` helper's per-file usage doc** in `test-helpers/define-schema.ts`.
   Helper stays (still used by `define-schema-pg-types.test.ts` where it's the SUT).
3. **CLAUDE.md update:** test conventions section points at `useFixtures` as the default
   seed pattern.

## Cross-references

- `fixtures-adoption-inventory.md` — per-file tier classification; re-run `pnpm fixtures:adoption:inventory` to refresh
- [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md) — pool epic; fully complete 2026-05-28
- `vendor/rails/activerecord/test/cases/` — Rails counterparts whose test bodies this plan mirrors
- `scripts/api-compare/test-mapping.json` — Rails-counterpart source of truth
