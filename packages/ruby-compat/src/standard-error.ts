/**
 * Ruby's core `StandardError` (`vendor/ruby/error.c:3319` `rb_eStandardError`)
 * — the root of the ordinary rescuable hierarchy, and what a bare
 * `raise StandardError, "message"` builds.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `StandardError`, which Rails
 * inherits rather than defines.
 */
export class StandardError extends Error {}

StandardError.prototype.name = "StandardError";
