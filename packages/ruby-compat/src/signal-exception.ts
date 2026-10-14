import { Exception } from "./exception.js";

/**
 * Ruby's core `SignalException` (`vendor/ruby/v3.3.11/error.c:3318`
 * `rb_eSignal`), an `Exception` subclass outside `StandardError`, so a bare
 * `rescue` does not take it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `SignalException`, which Rails
 * inherits rather than defines.
 */
export class SignalException extends Exception {}

SignalException.prototype.name = "SignalException";

/**
 * Ruby's core `Interrupt` (`vendor/ruby/v3.3.11/error.c:3319`
 * `rb_eInterrupt`), the `SignalException` raised for `SIGINT`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Interrupt`, which Rails inherits
 * rather than defines.
 */
export class Interrupt extends SignalException {}

Interrupt.prototype.name = "Interrupt";
