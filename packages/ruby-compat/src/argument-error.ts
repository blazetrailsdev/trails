import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `ArgumentError` (`vendor/ruby/v3.3.11/error.c:3323` `rb_eArgError`) —
 * what `Comparable`'s derived operators raise through `rb_cmperr`
 * (`vendor/ruby/v3.3.11/compar.c:28`). `@blazetrails/date` re-exports it so its own
 * public surface is unchanged.
 *
 * Extends `StandardError`, mirroring Ruby's `ArgumentError < StandardError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `ArgumentError`, which Rails
 * inherits rather than defines.
 */
export class ArgumentError extends StandardError {}

ArgumentError.prototype.name = "ArgumentError";
