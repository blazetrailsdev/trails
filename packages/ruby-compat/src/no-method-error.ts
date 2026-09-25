import { NameError } from "./name-error.js";

/**
 * Ruby's core `NoMethodError` (`vendor/ruby/error.c:3360`), raised by the
 * `else super` arm of a `method_missing`. It subclasses {@link NameError}
 * because Ruby's does (`NoMethodError < NameError`), so a `rescue NameError`
 * site catches it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `NoMethodError`, which Rails
 * inherits rather than defines.
 */
export class NoMethodError extends NameError {
  #args: unknown;
  #privateCall: boolean;

  /**
   * Ruby's `NoMethodError.new(msg=nil, name=nil, args=nil, private=false,
   * receiver: nil)` (`vendor/ruby/error.c:2186` `nometh_err_initialize`):
   * `msg`, `name` and `receiver:` go to `NameError#initialize`, and `args` /
   * `private` are set by `nometh_err_init_attr` (`vendor/ruby/error.c:2162`).
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(
    message: string,
    name?: string,
    args: unknown = null,
    priv = false,
    options: { receiver?: unknown } = {},
  ) {
    super(message, name, options);
    this.#args = args;
    this.#privateCall = priv;
  }

  /**
   * Ruby's `NoMethodError#args` (`vendor/ruby/error.c:2457` `nometh_err_args`).
   *
   * @noRailsEquivalent PERMANENT
   */
  args(): unknown {
    return this.#args;
  }

  /**
   * Ruby's `NoMethodError#private_call?` (`vendor/ruby/error.c:2470`
   * `nometh_err_private_call_p`).
   *
   * @noRailsEquivalent PERMANENT
   */
  isPrivateCall(): boolean {
    return this.#privateCall;
  }
}

NoMethodError.prototype.name = "NoMethodError";
