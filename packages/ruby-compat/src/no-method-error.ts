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
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}
