/**
 * Ruby's core `RuntimeError` (`vendor/ruby/error.c:3365`) — what a bare
 * `raise "message"` builds, and what `RuntimeError.new(string)` is. A bare
 * `raise RuntimeError` carries the class name as its message, which is why
 * `message` defaults to `"RuntimeError"`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `RuntimeError`, which Rails
 * inherits rather than defines.
 */
export class RuntimeError extends Error {
  constructor(message: string = "RuntimeError") {
    super(message);
    this.name = "RuntimeError";
  }
}
