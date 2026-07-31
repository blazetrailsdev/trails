/**
 * What this worker's boot (`test-setup-dy.ts`) actually did.
 *
 * No Rails counterpart: Rails boots one process against one database, so there
 * is nothing to record. trails picks between a TRUNCATE fast path and a full
 * purge+reload per worker, and the fast path's closing re-stamp is what makes
 * the fast path available to the *next* worker recycled onto the database. Boot
 * runs once per worker and later files' between-test resets clear the stamp, so
 * a test file has no deterministic view of post-boot database state — the boot
 * has to hand it over. `template-stamp.test.ts` reads it back.
 *
 * @internal Boot path only.
 */
export type BootArm = "fastPath" | "fullLoad";

export interface BootOutcome {
  /** Which arm of the load-path gate the boot took. */
  arm: BootArm;
  /** Whether the database reported `canonicalSchemaUpToDate` when boot finished. */
  stamped: boolean;
}

let outcome: BootOutcome | null = null;

/** @internal */
export function recordBootOutcome(arm: BootArm, stamped: boolean): void {
  outcome = { arm, stamped };
}

/**
 * The recorded outcome, or null in a context that did not run the boot setup
 * file.
 *
 * @internal
 */
export function bootOutcome(): BootOutcome | null {
  return outcome;
}
