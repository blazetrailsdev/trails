import { ArgumentError } from "./argument-error.js";
import { RuntimeError } from "./runtime-error.js";

/**
 * Ruby's core `FrozenError` (`vendor/ruby/error.c:3366`), a `RuntimeError`
 * subclass — what `rb_check_frozen` raises, with its own
 * `"can't modify frozen %s: %s"` message over the receiver's class and its
 * `inspect`, and the frozen object as its `receiver`
 * (`vendor/ruby/error.c:3779` `rb_frozen_error_raise`).
 *
 * Ruby's chain is `FrozenError < RuntimeError < StandardError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `FrozenError`, which Rails inherits
 * rather than defines.
 */
export class FrozenError extends RuntimeError {
  #receiver: unknown;
  #hasReceiver: boolean;

  /**
   * Ruby's `FrozenError.new(msg=nil, receiver: nil)`
   * (`vendor/ruby/error.c:2013` `frozen_err_initialize`).
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(message?: string, options: { receiver?: unknown } = {}) {
    super(message);
    this.#hasReceiver = "receiver" in options;
    this.#receiver = options.receiver;
  }

  /**
   * Ruby's `FrozenError#receiver`, which is `name_err_receiver`
   * (`vendor/ruby/error.c:2433`, aliased as `frozen_err_receiver`).
   *
   * @noRailsEquivalent PERMANENT
   */
  receiver(): unknown {
    if (this.#hasReceiver) return this.#receiver;
    throw new ArgumentError("no receiver is available");
  }
}

FrozenError.prototype.name = "FrozenError";
FrozenError.prototype.message = "FrozenError";
