/**
 * Advisory-slot pool sizing for the parallel AR DB test harness.
 *
 * `AR_DB_FORKS` is the *requested* vitest worker count; the *effective* count
 * is that request clamped down to the host's `numCpus - 1` ceiling.
 * vitest.config.ts applies that clamp once and rewrites `AR_DB_FORKS` to the
 * result, so the pool sized here tracks the workers that actually start rather
 * than the number someone asked for — a runner with a different vCPU count
 * needs no workflow edit. The advisory-lock
 * **slot pool** — the set of per-worker
 * slot DBs provisioned by globalSetup and claimed by each worker in
 * test-setup-worker-db.ts — is sized SEPARATELY, with headroom over the worker
 * count, so a worker that vitest recycles in between files always finds a free
 * slot even though the outgoing worker frees its lock only on process exit.
 *
 * Without headroom (pool == workers) the transient overlap during a fork-pool
 * recycle can exhaust the pool: the replacement worker starts and tries to
 * claim a slot before the outgoing process has exited and released its lock.
 * Measured in the tune-ar-db-forks-to-runner-cores sweep (PR #3870), forks=2
 * with a 2-slot pool failed deterministically with "all 2 advisory lock slots
 * are held". Sizing the pool at `workers + headroom` absorbs that overlap.
 *
 * Precedence:
 *   - `AR_DB_SLOTS` (explicit pool size) wins when set.
 *   - otherwise `workerForkCount() + SLOT_HEADROOM`.
 *
 * The extra slot DBs are cheap (template clones for PG/SQLite, empty
 * schema-loads for MySQL) and idle when unclaimed, so over-provisioning the
 * pool costs only a few extra CREATE DATABASEs in globalSetup.
 */

// Spare slots beyond the worker count. One is enough to cover a single
// recycle overlap; two leaves margin for back-to-back recycles.
const SLOT_HEADROOM = 2;

/**
 * Fork count used when neither `TRAILS_TEST_FORKS` nor `AR_DB_FORKS` is set.
 * Shared with vitest.config.ts so the pool and the worker pool agree on the
 * default just as they agree on the clamp.
 */
export const DEFAULT_FORKS = 6;

/**
 * Effective vitest worker count.
 *
 * The clamp itself (`min(requested, numCpus - 1)`) lives in vitest.config.ts,
 * which rewrites `AR_DB_FORKS` to the clamped result before any worker or
 * globalSetup runs — so this module reads the *effective* count without
 * duplicating the expression and without importing `node:os` (banned in
 * package sources for browser compatibility; the os-adapter exposes no
 * `availableParallelism`). A value read here that vitest did not compute
 * (a bare `tsx` invocation) is a plain request and only over-provisions.
 *
 * A non-numeric or non-positive value (unset, "auto", "0") falls back to
 * {@link DEFAULT_FORKS}, the same default vitest.config.ts uses.
 */
export function workerForkCount(): number {
  const n = parseInt(process.env.AR_DB_FORKS ?? "", 10);
  return Math.max(Number.isFinite(n) && n > 0 ? n : DEFAULT_FORKS, 1);
}

/**
 * Number of advisory-lock slot DBs to provision and to scan when claiming.
 * Decoupled from the *effective* worker count: `AR_DB_SLOTS` override, else
 * `workers + SLOT_HEADROOM`. An explicit override is clamped to at least
 * `workers + 1` so it can never undercut the worker count and reintroduce the
 * pool-exhaustion this decoupling exists to prevent.
 */
export function slotPoolSize(): number {
  const workers = workerForkCount();
  const override = parseInt(process.env.AR_DB_SLOTS ?? "", 10);
  if (Number.isFinite(override) && override > 0) return Math.max(override, workers + 1);
  return workers + SLOT_HEADROOM;
}
