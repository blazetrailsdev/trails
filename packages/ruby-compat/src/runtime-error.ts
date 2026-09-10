import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `RuntimeError` (`vendor/ruby/error.c:3365`) — what a bare
 * `raise "message"` builds, and what `RuntimeError.new(string)` is. A bare
 * `raise RuntimeError` carries the class name as its message, which is why
 * `message` defaults to `"RuntimeError"`.
 *
 * Extends `StandardError`, mirroring Ruby's `RuntimeError < StandardError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `RuntimeError`, which Rails
 * inherits rather than defines.
 */
export class RuntimeError extends StandardError {
  constructor(message: string = "RuntimeError") {
    super(message);
    this.name = "RuntimeError";
  }
}
