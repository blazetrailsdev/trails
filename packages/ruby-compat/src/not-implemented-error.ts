/**
 * Ruby's core `NotImplementedError` (`vendor/ruby/error.c:3346`) — a
 * `ScriptError`, not a `StandardError`, raised by an abstract method's
 * `raise NotImplementedError`. That bare form carries the class name as its
 * message, which is why `message` defaults to `"NotImplementedError"`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `NotImplementedError`, which Rails
 * inherits rather than defines.
 */
export class NotImplementedError extends Error {
  constructor(message: string = "NotImplementedError") {
    super(message);
    this.name = "NotImplementedError";
  }
}
