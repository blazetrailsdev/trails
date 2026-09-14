import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `LocalJumpError` (`vendor/ruby/error.c:3225`) — what a `yield`
 * with no block raises (`vendor/ruby/vm_insnhelper.c:5549`
 * `rb_vm_localjump_error("no block given (yield)", Qnil, 0)`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `LocalJumpError`, which Rails
 * inherits rather than defines.
 */
export class LocalJumpError extends StandardError {}

LocalJumpError.prototype.name = "LocalJumpError";
