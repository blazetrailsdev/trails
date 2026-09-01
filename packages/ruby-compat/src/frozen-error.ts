import { RuntimeError } from "./runtime-error.js";

/**
 * Ruby's core `FrozenError` (`vendor/ruby/error.c:3366`), a `RuntimeError`
 * subclass — what `rb_check_frozen` raises, with its own
 * `"can't modify frozen %s: %s"` message over the receiver's class and its
 * `inspect`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `FrozenError`, which Rails inherits
 * rather than defines.
 */
export class FrozenError extends RuntimeError {
  constructor(message: string = "FrozenError") {
    super(message);
    this.name = "FrozenError";
  }
}
