import { ArgumentError } from "./argument-error.js";
import { Exception } from "./exception.js";
import { NSIG, signo2signm, trapSignm } from "./process-adapter.js";

/**
 * Ruby's core `SignalException` (`vendor/ruby/v3.3.11/error.c:3318`
 * `rb_eSignal`), an `Exception` subclass outside `StandardError`, so a bare
 * `rescue` does not take it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `SignalException`, which Rails
 * inherits rather than defines.
 */
export class SignalException extends Exception {
  private readonly _signo: number | undefined;

  /**
   * `esignal_init` (`vendor/ruby/v3.3.11/signal.c:344-379`): an Integer is a
   * signal number, named by `rb_signo2signm` (`:323-332`, `SIG%s` or `SIG%u`)
   * unless a name follows it; a name is looked up by `signm2signo` and given
   * its `SIG` prefix.
   */
  constructor(...argv: unknown[]) {
    let argnum = 1;
    let sig: unknown = null;
    let signo: number | undefined;

    if (argv.length > 0) {
      if (typeof argv[0] === "number") {
        sig = argv[0];
        argnum = 2;
      } else sig = argv[0];
    }
    if (argnum === 2) {
      signo = sig as number;
      if (signo < 0 || signo > NSIG) {
        throw new ArgumentError(`invalid signal number (${signo})`);
      }
      if (argv.length > 1) {
        sig = argv[1];
      } else {
        const signm = signo2signm(signo);
        sig = signm != null ? `SIG${signm}` : `SIG${signo}`;
      }
    } else if (sig != null) {
      const signm = String(sig);
      signo = trapSignm(signm);
      if (!signm.startsWith("SIG")) sig = `SIG${signm}`;
    }
    super(...((sig == null ? [] : [sig]) as [string?]));
    this._signo = signo;
  }

  /** `esignal_signo` (`vendor/ruby/v3.3.11/signal.c:389-393`). */
  signo(): number | undefined {
    return this._signo;
  }
}

/**
 * Ruby's core `Interrupt` (`vendor/ruby/v3.3.11/error.c:3319`
 * `rb_eInterrupt`), the `SignalException` raised for `SIGINT`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Interrupt`, which Rails inherits
 * rather than defines.
 */
export class Interrupt extends SignalException {
  /** `interrupt_init` (`vendor/ruby/v3.3.11/signal.c:397-405`): `SIGINT`, and the message given. */
  constructor(mesg: unknown = null) {
    super(2, mesg);
  }
}
