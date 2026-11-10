import { Exception } from "./exception.js";

/**
 * Ruby's core `StandardError` (`vendor/ruby/v3.3.11/error.c:3319` `rb_eStandardError`)
 * — the root of the ordinary rescuable hierarchy, and what a bare
 * `raise StandardError, "message"` builds.
 *
 * The fs layer's coded errors (`"EACCES"`) are {@link SystemCallError}s
 * (`errno.ts`), so they are this class too, as `Errno::*` is under
 * `rescue StandardError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `StandardError`, which Rails
 * inherits rather than defines.
 */
export class StandardError extends Exception {
  /** @noRailsEquivalent CONVERGEABLE system-call-error-instanceof-reads-an-errno-table-and-all-takes-a-pattern */
  static [Symbol.hasInstance](error: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, error) ||
      (this === StandardError &&
        error instanceof Error &&
        /^E[A-Z0-9]+$/.test(String((error as { code?: unknown }).code)))
    );
  }
}
