/**
 * What this worker's boot (`test-setup-dy.ts`) actually did.
 *
 * No Rails counterpart: Rails boots one process against one database that is
 * loaded once. trails picks between a TRUNCATE fast path and a full
 * purge+reload per worker, and the fast path's closing re-stamp is what makes
 * that fast path available to the *next* worker recycled onto the database.
 * Boot runs once per worker and later files' between-test resets clear the
 * stamp, so a test file has no deterministic view of post-boot database state —
 * the boot has to hand it over. `template-stamp.test.ts` reads it back.
 *
 * @internal Boot path only.
 */
export type BootArm = "fastPath" | "fullLoad";

/** @internal */
export interface BootOutcome {
  arm: BootArm;
  stamped: boolean;
  /**
   * Whether this boot re-laid the `<adapter>_specific_schema.rb` half. A fast
   * path that found the stamp's snapshot intact skips that arm and truncates
   * those tables in place instead — the per-file saving measured in #6121. It
   * is recorded rather than timed so a lane where the memo silently stops
   * being taken fails a test instead of only getting slower.
   */
  relaidAdapterSpecific: boolean;
}

let outcome: BootOutcome | null = null;

/** @internal */
export function recordBootOutcome(
  arm: BootArm,
  stamped: boolean,
  relaidAdapterSpecific: boolean,
): void {
  outcome = { arm, stamped, relaidAdapterSpecific };
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
