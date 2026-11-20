import { Exception } from "./exception.js";
import { signo2signm } from "./process-adapter.js";

/**
 * Ruby's core `SignalException` (`vendor/ruby/v3.3.11/error.c:3318`
 * `rb_eSignal`), an `Exception` subclass outside `StandardError`, so a bare
 * `rescue` does not take it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `SignalException`, which Rails
 * inherits rather than defines.
 */
export class SignalException extends Exception {
  /**
   * `esignal_init` (`vendor/ruby/v3.3.11/signal.c:345`): a signal number is
   * named `SIG` plus its `siglist` name.
   */
  constructor(sig?: string | number) {
    super(typeof sig === "number" ? `SIG${signo2signm(sig)}` : sig);
  }
}

/**
 * Ruby's core `Interrupt` (`vendor/ruby/v3.3.11/error.c:3319`
 * `rb_eInterrupt`), the `SignalException` raised for `SIGINT`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Interrupt`, which Rails inherits
 * rather than defines.
 */
export class Interrupt extends SignalException {}
