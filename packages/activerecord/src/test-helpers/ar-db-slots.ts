/**
 * Advisory-slot pool sizing for the parallel AR DB test harness.
 *
 * `AR_DB_FORKS` is the vitest worker count. The requested value is clamped
 * here to the host's `numCpus - 1` (the same ceiling vitest derives), so the
 * pool sized here tracks the workers that actually start. The advisory-lock
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

import { getOs } from "@blazetrails/activesupport";
import { DEFAULT_FORKS } from "./ar-db-forks-default.js";

// Spare slots beyond the worker count. One is enough to cover a single
// recycle overlap; two leaves margin for back-to-back recycles.
const SLOT_HEADROOM = 2;

export { DEFAULT_FORKS };

/**
 * Host ceiling on concurrent workers: `numCpus - 1`, matching the cap vitest
 * derives for its own fork pool. Read through the OS adapter because package
 * sources may not import `node:os`. If no adapter can be resolved (a runtime
 * with no notion of CPU count), the request goes unclamped — that can only
 * over-provision the pool, never undercut it.
 */
function hostForkCap(): number | null {
  try {
    return Math.max(getOs().availableParallelism() - 1, 1);
  } catch {
    return null;
  }
}

/**
 * Effective vitest worker count — the `AR_DB_FORKS` request clamped to
 * {@link hostForkCap}, so it is correct regardless of who calls it. The env
 * var can only lower the count, never raise it past the host. Non-numeric or
 * non-positive (unset, "auto", "0") falls back to {@link DEFAULT_FORKS}.
 */
export function workerForkCount(): number {
  const n = parseInt(process.env.AR_DB_FORKS ?? "", 10);
  const requested = Number.isFinite(n) && n > 0 ? n : DEFAULT_FORKS;
  const cap = hostForkCap();
  return cap === null ? requested : Math.min(requested, cap);
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
