import { ArgumentError } from "./argument-error.js";
import { IndexError } from "./index-error.js";

/**
 * Ruby's core `KeyError` (`vendor/ruby/error.c:3325`) — what `Hash#fetch`
 * raises for an absent key (`vendor/ruby/hash.c:2203` `rb_key_err_raise`).
 * `@blazetrails/activesupport`'s index re-exports it, so that package's
 * public surface is unchanged.
 *
 * Callers pass the whole message, exactly as Ruby composes it: a Symbol key
 * renders `key not found: :expression`, a String key
 * `key not found: "expression"`.
 *
 * Ruby's chain is `KeyError < IndexError < StandardError`
 * (`vendor/ruby/error.c:3325`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `KeyError`, which Rails inherits
 * rather than defines.
 */
export class KeyError extends IndexError {
  #receiver: unknown;
  #hasReceiver: boolean;
  #key: unknown;
  #hasKey: boolean;

  /**
   * Ruby's `KeyError.new(message=nil, receiver: nil, key: nil)`
   * (`vendor/ruby/error.c:2537` `key_err_initialize`), which sets each
   * attribute only when its keyword was passed.
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(message?: string, options: { receiver?: unknown; key?: unknown } = {}) {
    super(message);
    this.#hasReceiver = "receiver" in options;
    this.#receiver = options.receiver;
    this.#hasKey = "key" in options;
    this.#key = options.key;
  }

  /**
   * Ruby's `KeyError#receiver` (`vendor/ruby/error.c:2491` `key_err_receiver`).
   *
   * @noRailsEquivalent PERMANENT
   */
  receiver(): unknown {
    if (this.#hasReceiver) return this.#receiver;
    throw new ArgumentError("no receiver is available");
  }

  /**
   * Ruby's `KeyError#key` (`vendor/ruby/error.c:2508` `key_err_key`).
   *
   * @noRailsEquivalent PERMANENT
   */
  key(): unknown {
    if (this.#hasKey) return this.#key;
    throw new ArgumentError("no key is available");
  }
}

KeyError.prototype.name = "KeyError";
