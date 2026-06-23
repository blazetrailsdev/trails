/**
 * Advisory-slot pool sizing for the parallel AR DB test harness.
 *
 * `AR_DB_FORKS` is the vitest worker count (it drives `maxForks` in
 * vitest.config.ts). The advisory-lock **slot pool** — the set of per-worker
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
 * vitest worker count (`AR_DB_FORKS`), clamped to >= 1. A non-numeric or
 * non-positive value (e.g. unset, "auto", "0") is treated as single-worker —
 * matching the pre-decoupling `!Number.isFinite(forks) || forks <= 1` guard.
 */
export function workerForkCount(): number {
  const n = parseInt(process.env.AR_DB_FORKS ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Number of advisory-lock slot DBs to provision and to scan when claiming.
 * Decoupled from the worker count: `AR_DB_SLOTS` override, else
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
