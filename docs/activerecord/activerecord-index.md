# activerecord — shipping index

Snapshot 2026-05-22. The sequenced view of what's left to ship for
`@blazetrails/activerecord`. Each phase below links to the detail doc(s)
that own the work. Phases are ordered by what unblocks what; items inside
a phase can run in parallel.

For per-doc completion estimates and the audit reports that produced this
sequencing, see `~/.btwhooks/data/github/blazetrailsdev/trails/audits/`
(slugs `ar-completion`, `test-infra`, `dx-packaging`, 2026-05-22).

## Current state

- **api:compare**: 4969/4969 (100%) — public surface closed.
- **test:compare**: 6669/7870 (84.7%), 1193 skipped (2026-05-22, cached).
- **Type-audit**: Waves 1–3 shipped; W1b + small follow-ups + W4 remain.
- **Test infra**: pool epic active (Phase B/C shipped, D in flight); TM
  unification Phase 9b in progress; fixtures port data-complete.

## Phase ordering

### Phase 1 — Test-infra critical path (active)

Owner: [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md) (TM unification plan completed, deleted). This is the live focus and the gate for most test:compare un-skips.

- **Pool Phase D sweep** — migrate all `createTestAdapter()` consumers
  to `createPooledTestAdapter()`. 1 batch in flight (#2250 / #2253);
  expect 4–8 batches total at ~200–300 LOC each. **Main gate.**
- **TM Phase 6 savepoint-tolerance fix** (~50–100 LOC) — unlocks the
  `dependent:` cluster on MariaDB.

TM Phase 9b-1 (PG visitor) and 9b-2a–e (MySQL visitor incl. Arel
`Table.star`) already merged 2026-05-20→21. 9b-3 is closed
(see Phase 2). 9b-4 is bundled with Pool Phase F (see Phase 2).

### Phase 2 — Test-infra collapse — **Complete** (see [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md) archive)

Pool Phases E and F shipped 2026-05-28. End state: NO `_sharedAdapter`,
NO `_txLockStorage`/`_manualTxDepth`/AsyncContext filter, NO `recordDdlTracking`/
`ddl-tracker.ts`, NO `TestAdapterFixtures`/`SidecarFixtures` wrappers, NO Proxy.
`createTestAdapter()` returns the raw pool-leased `DatabaseAdapter`. Full Rails parity.

- **Pool Phase E** — shipped: E1 (#2514), E2 (#2527), E3 (#2533), E5 (#2536). E4 absorbed into F5.
- **Pool Phase F** — shipped: F1 (#2537), F2 (#2538), F3 (in main), F4 (in main), F5 (#2545).
- TM Phase 9b-3 (delete dormant fallback) remains **closed-don't-reopen** — live Rails-parity code for HABTM join models.

### Phase 3 — Fixtures port strict-flip

Owner: `fixtures-port-plan.md` (completed, deleted). Data substrate
is complete (94/8 DIFF MATCH); only the strict-fail flip remains. Can
run in parallel with Phase 1/2.

- Compare-script enhancements (~150 LOC): enum-symbol comparator, HABTM
  key handling, custom FK override map, datetime tolerance.
- PR 7a — ~1.9k LOC waiver port of `fixtures_test.rb` +
  `test_fixtures_test.rb` + `encryption/encrypted_fixtures_test.rb`.
- PR 7b — ~30 LOC strict-fail flip + remove 4 `unported-files.ts` exclusions.
- PR 8 — proof-of-concept conversion of one test file to `useFixtures(...)`.

### Phase 3b — Fixtures adoption — **actively pickable** (Phase 2 gate lifted)

Owner: [`fixtures-adoption-plan.md`](fixtures-adoption-plan.md). Migrates
the existing AR test suite from inline `defineSchema()` + `Model.create`
seeding to `useFixtures([...])` against the 122 ported fixtures.
Rails-mirrored body rewrites against Rails counterparts, so this drives
`test:compare` match-rate as a side effect (orthogonal to Phase 4
un-skipping; both run in parallel once gated).

- **Phase A — Inventory script** (~150–300 LOC, unblocked). Ships now,
  parallel with Phases 1/2. Produces `docs/fixtures-adoption-inventory.md`
  with per-file tier (1/2/3/4) classification.
- **Spike S1 — worker-level fixture seed** (~100–150 LOC, standalone PR).
  Ships before Phase B so the canary is pure conversion, not pattern+infra.
- **Phase B — Canary conversion** (1 file, ≤300 LOC). Pool Phase E gate lifted.
- **Phase C — Tier 1 sweep** (~12–18 batch PRs at the 300-LOC ceiling).
- **Phase D — Loader gap PRs + Tier 2 → 1 promotion** (4 loader PRs +
  4 batch PRs).
- **Phase E — Tier 3 surgery** (per-file bespoke, ~10–20 small PRs).
- **Phase F** — `blazetrails/prefer-fixtures` lint rule + CLAUDE.md update + retire `defineSchema()` per-file usage.

Total ~30–45 PRs, ~2–4 weeks Phase C steady-state. Pool Phase E has landed.

### Phase 4 — test:compare drive — **actively pickable** (Phase 1/2 gate lifted)

Owner: [`activerecord-100-plan.md`](activerecord-100-plan.md) (live
batches + strategy + BLOCKED vocab) + [`activerecord-test-compare-100.md`](activerecord-test-compare-100.md)
(per-file tracker).

Unblocked once Phase 1 lands (most skipped tests need the pooled adapter
to run cleanly). Top-10 highest-skip files account for ~430 of 1193
remaining skips — prioritize their underlying implementation batches:

- `associations/eager.test.ts` (70) — Batch B6.4d2 / Phase 5 migration
- `adapter.test.ts` (70)
- `insert-all.test.ts` (42) — Batch B1964 (~250 LOC)
- `associations/join-model.test.ts` (41) — HMT / #1972
- `database-configurations/hash-config.test.ts` (34) — Audit-DB1
- `strict-loading.test.ts` (30)
- `relation-scoping.test.ts` (28) — #1983
- `database-tasks.test.ts` (26) — B1986
- `query-cache.test.ts` (25) — Batch 64 Phase 4
- `schema-dumper.test.ts` (25) — #1989

Refresh snapshots first: `pnpm test:compare --cached --json --package activerecord`.

### Phase 5 — Schema / adapter / association fidelity long-tail

Owner: [`activerecord-100-plan.md`](activerecord-100-plan.md). Runs
continuously alongside Phase 4; each cluster is independent.

- **Schema dump fidelity** — Batches 3, 77, 78, 97, 143 + #1989 follow-ups.
- **Associations** — 14, 28b (AliasTracker; partially shipped, ~80 LOC
  remaining), 29, 33/37/141 (HABTM), 100 (preloader), 119/140
  (CollectionProxy), 134 (resetCounters).
- **Adapter fidelity** — Batches 48/50/52 (MySQL), 56/60/63/64/65/66/67
  (PG long-tail), B110/B131/B49/B1898 (MySQL), B128/B132/B135 (PG),
  B73/B126 (SQLite).
- **Encryption / IES** — B6.4 cluster, B1959, #2034 PR 2–5, #2047
  KeyGenerator follow-ups.
- **Migration / DatabaseTasks** — Batch 153, Audit-DB1, B1986, B1993.

### Phase 6 — Type cleanup

Owner: [`activerecord-type-audit.md`](activerecord-type-audit.md).
Independent of test-infra work.

- **W1b** — variadic rest overloads (~100 LOC, low risk).
- **Small follow-ups bundle** (~150 LOC): `Errors<TBase>` PR D,
  Validations mixin tightening, BiasableQueue module shape,
  `_canRouteThroughViaAssociationScope`, `collection-proxy.ts`
  `_reflectOnAssociation` cast, HABTM `Reflection.create` overload,
  `processDependentAssociations` errors cast.
- **W4** — deferred indefinitely (Reflection discriminated union,
  ~96 sites, high risk, multi-PR).

### Phase 7 — DX / packaging (independent)

Owner: [`browser-compat-plan.md`](../infrastructure/browser-compat-plan.md) +
[`virtual-source-files-plan.md`](../infrastructure/virtual-source-files-plan.md). No
test-infra or AR-100 dependency.

- **Browser-compat** (~65% complete):
  - BC-3 self-registering adapter registry (~100 LOC).
  - BC-4 `no-direct-process-env` ESLint rule (~80 LOC).
  - BC-4 `no-native-package-import` ESLint rule (~80 LOC).
  - BC-4 browser-bundle CI smoke (~50 LOC + workflow).
  - BC-5 per-package portability audits.
  - §BC-3 doc refresh (stale live-grep block).
- **Virtual-source-files** (~70% complete):
  - Phase 2.1–2.6 tsserver plugin (~1400 LOC across 6 PRs).
  - Phase 3 docs + consumer cutover (~150 LOC).
  - Follow-ups: association `scope:` narrowing, enum value-label unions,
    adoption metrics.

## Effectively complete (archival)

- **SQLite driver abstraction** — PR 1/2/3/4/5/7/M shipped (`SqliteDriver`
  interface + better-sqlite3/node:sqlite/expo-sqlite). Only PR 6 (CI
  matrix across the 3 drivers + website docs) remains; standalone, not on
  the critical path. Plan doc retired; driver-registry pattern lives in
  `activesupport.md`.

## Retired / consolidated

- `explicit-test-schema-plan.md` deleted — TS-4 migration is functionally
  the same as TM Phase 6; live state in `tm-unification-plan.md`.
- `shared-adapter-test-suite-plan.md` deleted — Phase 1/2a shipped
  (#1630, #1632); Phase 2b superseded by pool epic Phase C (#2245);
  Phase 4 already in `.github/workflows/ci.yml` under a different
  design; Phase 5 (`covered_on:`) moved into `activerecord-100-plan.md`
  Architectural section.
- `test-compare-100-plan.md` deleted — strategy + workflow + BLOCKED
  vocab folded into `activerecord-100-plan.md`.

## Related (not AR-owned)

- `ci-improvement-plan.md` (not yet written) — actionpack CI
  split; touches AR-test isolation but driven by actionpack.

## Sequencing summary

```
Phase 1 (test-infra critical path)  ──► Phase 2 (collapse)  ──► Phase 4 (drive un-skips)
   │                                          │
   │                                          └─► Phase 3b B–F (fixtures adoption)
   │
   ├─ Phase 3 (fixtures strict-flip)        ── parallel ──
   ├─ Phase 3b A (adoption inventory)       ── parallel (unblocked) ──
   ├─ Phase 5 (fidelity long-tail)          ── parallel ──
   ├─ Phase 6 (type cleanup)                ── parallel ──
   └─ Phase 7 (DX/packaging)                ── parallel ──
```
