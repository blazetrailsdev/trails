# activerecord test parallelism plan (postmortem)

Status: ✅ **shipped.** All six PRs (P1..P6) merged 2026-05-05/06 via #1223 #1224 #1225 #1226 #1227 #1228. CI is green on PG/MariaDB with file-level parallelism re-enabled. This document captures the diagnosis and rollout for future readers; it is not an active plan.

## Background

The activerecord package runs ~12k vitest tests against three backends in
separate CI jobs (`.github/workflows/ci.yml`):

- `sqlite-tests` — `:memory:` per fork, naturally isolated.
- `postgres-tests` (lines 264–300) — provisions `rails_js_test_2..4`
  alongside the base `rails_js_test`, sets `AR_DB_FORKS=4`.
- `mariadb-tests` (lines 302–339) — same shape against MariaDB.

The shared module-level `_sharedAdapter` in `packages/activerecord/src/test-adapter.ts:51`
holds one adapter per worker process; every test file in the worker shares
its connection pool and its `dropAllTables` state.

### What PR #1092 added

PR #1092 ("Parallel AR tests merged") attempted real per-worker DB
isolation. Four pieces survived in the tree:

1. `AR_DB_FORKS: 4` in `.github/workflows/ci.yml` lines 300 and 339.
2. The "Create parallel test databases" CI step (lines 292–296, 330–335)
   that pre-creates `rails_js_test_2..4` on PG / MariaDB.
3. The slot-mapping formula in
   `packages/activerecord/src/test-setup-worker-db.ts:21`:
   `slot = ((VITEST_WORKER_ID - 1) % AR_DB_FORKS) + 1`, applied as a URL
   suffix to `PG_TEST_URL` / `MYSQL_TEST_URL`.
4. The fork pinning in `vitest.config.ts:106–110`:
   `pool: "forks"`, `poolOptions.forks.maxForks = minForks = AR_DB_MAX_FORKS`,
   where `AR_DB_MAX_FORKS = AR_DB_FORKS ?? (realDb ? 1 : undefined)`.

The intent: fix the worker count at 4, pin each worker to a distinct DB
via a stable `VITEST_WORKER_ID`, run files in parallel.

### Why it doesn't actually parallelize safely

`VITEST_WORKER_ID` is not a stable slot identifier. Vitest 3.2 increments
it monotonically per spawned worker, recycling forks freely; observed CI
runs see IDs into the 400s for ~160 files. With `AR_DB_FORKS=4`, IDs 1, 5,
9, … all map to slot 1. If two live workers hold colliding IDs at the same
moment, both connect to `rails_js_test_1` and race on
`dropAllTables` / `defineSchema`.

`maxForks=minForks=N` does not prevent this: it caps _concurrent_ forks
but vitest still recycles workers (each new fork gets a fresh
`VITEST_WORKER_ID`). The only knob that reliably serializes file
execution is the CLI flag `--no-file-parallelism`, which is the
short-term mitigation tracked in the in-flight PR #1222.

### Symptom

Pre-TS-4: the dynamic test-adapter's regex-based recovery path
(`test-adapter.ts`, the historical "missing column ALTER" code) masked
cross-worker drops by re-CREATEing tables mid-query. As TS-4 migrates
files to explicit `defineSchema` + `dropAllTables`, that masking is gone,
and `associations/join-model.test.ts` plus any TS-4-migrated file
intermittently fails on PG/MariaDB with `relation "X" does not exist`
when worker B's `dropAllTables` lands inside worker A's setup.

### What is in flight

- PR #1222 (branch `fix/ar-pg-worker-db-isolation`): re-add
  `--no-file-parallelism` to the three test commands. Restores stability,
  loses the parallel speed-up. Treat as a stop-gap.
- `docs/explicit-test-schema-plan.md` (TS-1..TS-final): replacing the
  dynamic test-adapter with explicit `defineSchema`. ~25% migrated.

## Design alternatives

| Option                                                                                                                                                                          | Pros                                                                                                             | Cons                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. PG advisory locks / MariaDB `GET_LOCK`** for slot acquisition. Worker iterates `pg_try_advisory_lock(N)` for `N=1..MAX`, claims first success, holds for process lifetime. | No reliance on `VITEST_WORKER_ID`. Self-healing on crash (PG drops session locks on disconnect). Backend-native. | Two code paths (PG + MariaDB) to maintain. SQLite no-op. Slot count still bounded by pre-provisioned DBs.                                                                   |
| **B. `flock` lockfiles** (`/tmp/ar-test-slot-N.lock`).                                                                                                                          | Backend-uniform; single code path.                                                                               | Stale locks survive `SIGKILL` on Linux (kernel releases on exit, OK in practice — but containers and `kill -9` edge cases need care). Adds FS dependency to a DB-only flow. |
| **C. Database-per-file** (`CREATE DATABASE` in adapter setup, drop in teardown).                                                                                                | Total isolation; no shared state.                                                                                | PG `CREATE DATABASE` ≈ 200–500ms × ~165 files ≈ 30–80s overhead per backend. Likely _negates_ parallelism savings; also serialized on the `template1` lock.                 |
| **D. Schema-per-worker** (single DB, `SET search_path` per slot).                                                                                                               | One DB, fast setup.                                                                                              | MariaDB has no schema namespace (schema == database). PG-only solution; still needs slot acquisition. FK-across-schemas surprises in test fixtures.                         |
| **E. Status quo + CLI flag (#1222)**.                                                                                                                                           | Zero design risk.                                                                                                | Loses ~3min/job; doesn't scale as the suite grows.                                                                                                                          |

Option C variant — _worker-scoped_ `CREATE DATABASE` once at init, drop
on exit — collapses the 80s into a one-time cost per worker. Combined
with advisory locking it removes the need for the pre-provisioned
`rails_js_test_2..4` step entirely.

## Recommendation

**Option A (advisory locks) over a fixed pool of pre-provisioned DBs**,
phased in behind a feature flag. Rationale:

- Removes the `VITEST_WORKER_ID` dependency, the actual root cause.
- Keeps pre-provisioning (cheap, one-shot in CI) so we don't pay
  per-worker `CREATE DATABASE` cost.
- PG / MariaDB locks are released automatically on disconnect →
  crash-safe by construction.
- Compatible with the TS-4 migration: each slot is exclusively held
  by one worker for its lifetime, so files in that worker — whether
  using the dynamic adapter or `defineSchema` — never cross paths
  with files in another worker.

Migration-period compatibility: dynamic-adapter files and `defineSchema`
files coexist within a single worker today; the only invariant the new
mechanism must preserve is _one worker = one DB for the worker's
lifetime_. Advisory locks give us exactly that without `VITEST_WORKER_ID`.

## Implementation plan

Each PR ≤300 LOC; draft; conventional commits.

1. **PR-P1 — advisory-lock slot acquisition (PG)** ✅ #1223
   `test-setup-worker-db.ts`: on first DB use, open a bootstrap
   connection to the base URL and try `pg_try_advisory_lock(slot)` for
   `slot=1..AR_DB_FORKS`. Rewrite `PG_TEST_URL` to the claimed slot's
   DB. Hold the bootstrap connection for the lifetime of the process
   (release-on-exit handler as defence in depth). No CI changes.
   Gate behind `AR_DB_LOCK_MODE=advisory`; default unchanged.
2. **PR-P2 — same for MariaDB** via `GET_LOCK('ar_test_slot_N', 0)`. ✅ #1224
3. **PR-P3 — flip default to `advisory`** and remove the
   `((id-1) % forks) + 1` formula. Keep `AR_DB_FORKS` as the slot count;
   keep the "Create parallel test databases" CI step. ✅ #1225
4. **PR-P4 — unpin worker count.** Remove `maxForks/minForks` from
   `vitest.config.ts`; allow vitest to spawn freely. Workers that can't
   acquire a slot busy-wait briefly (bounded retry) — slot count caps
   real concurrency, not worker count. ✅ #1226
5. **PR-P5 — revert #1222** (remove `--no-file-parallelism`) once P1–P4
   showed zero flakes across PG and MariaDB CI. ✅ #1227
6. **PR-P6 — cleanup.** Deleted the `AR_DB_LOCK_MODE` flag and residual
   modulo helpers; kept `AR_DB_FORKS` and the "Create parallel test
   databases" step (they define the pool size). ✅ #1228

Migration ordering vs TS-4 (as it played out): P1–P4 were independent of TS-4 (the lock mechanism cares only about worker–DB binding, not how the schema is defined). P5 landed after TS-4 had reached the files most prone to cross-worker leakage (`associations/join-model.test.ts`, `dirty.test.ts`, `relation.test.ts`), so when CI stayed green on parallelism re-enable, the parallelism change was the clearly attributable cause rather than residual dynamic-adapter races.

Rollback path (preserved here as architectural note, not active): each PR was independently revertable. P5 was the only behaviour-visible flip; if flakes had returned, reverting P5 alone would have left P1–P4 dormant under serialized execution and let us diagnose without CI pressure. Did not need to use it.

## Success criteria

- PG and MariaDB CI wall-clock ≤ current parallel-broken time and
  strictly less than `--no-file-parallelism` time. Target: ≥2 min
  saved per backend job vs serial.
- Across 50 consecutive CI runs post-P5: zero failures in
  `associations/join-model.test.ts`, `dirty.test.ts`, `relation.test.ts`,
  `transactions/*.test.ts`, `callbacks.test.ts`,
  `serialized-attribute.test.ts` attributable to cross-worker DB races.
- `git grep -n 'VITEST_WORKER_ID\|AR_DB_MAX_FORKS\|((.*-.*1.*).*%.*)+1' packages/activerecord`
  returns nothing.
- `AR_DB_FORKS` and the "Create parallel test databases" CI step remain
  (they define the slot pool); the modulo formula and the
  `maxForks/minForks` pinning are gone.

## Open questions

- Does vitest's fork lifecycle keep the bootstrap PG connection alive
  long enough? `pool: "forks"` reuses workers across files, but if a
  worker is recycled mid-suite the lock is lost — needs an empirical
  check on a long run.
- MariaDB `GET_LOCK` semantics under connection pooling: does the
  underlying mysql2 driver guarantee one physical connection for the
  bootstrap? May need to bypass the pool and hold a raw connection.
- Acceptable busy-wait policy in P4 if all `AR_DB_FORKS` slots are
  held: linear backoff vs blocking acquire (`pg_advisory_lock` without
  `try`)? Blocking is simpler but masks deadlocks during development.
- Does the `_sharedAdapter` re-init path (`test-adapter.ts:400–424`)
  need to release and re-acquire the lock, or is the bootstrap
  connection sufficient? Likely the latter, but verify before P3.
- Do we want one slot pool shared across PG and MariaDB CI jobs (they
  run in separate runners, so no), or per-backend (yes — current shape).
  Document so future maintainers don't unify accidentally.
