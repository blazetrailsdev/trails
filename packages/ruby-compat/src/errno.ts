import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `SystemCallError` (`vendor/ruby/v3.3.11/error.c:3380`
 * `rb_eSystemCallError`), the parent of every `Errno::` class. Its `errno` is
 * `syserr_errno` (`error.c:2812-2816`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `SystemCallError`, which Rails
 * rescues without defining.
 */
export class SystemCallError extends StandardError {
  /** @noRailsEquivalent PERMANENT */
  errno: number | null = null;
}

SystemCallError.prototype.name = "SystemCallError";

/**
 * `Errno::ENOTTY`, one of the classes `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`)
 * defines under `Errno` with its `Errno` constant. `syserr_initialize`
 * (`error.c:2786-2800`) builds the message from `strerror`, appending
 * `" - mesg"` when one is given. `code` is the name the fs layer's own errors
 * carry, which ruby-compat's `rescue SystemCallError` arms test.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENOTTY`, which Rails
 * rescues without defining.
 */
class ENOTTY extends SystemCallError {
  static readonly Errno = 25;
  readonly code = "ENOTTY";

  constructor(mesg?: string) {
    super(
      mesg == null ? "Inappropriate ioctl for device" : `Inappropriate ioctl for device - ${mesg}`,
    );
    this.name = "Errno::ENOTTY";
    this.errno = ENOTTY.Errno;
  }
}

/**
 * Ruby's core `Errno` module (`vendor/ruby/v3.3.11/error.c:2666-2694`), holding the
 * `SystemCallError` subclass for each errno a raise site in ruby-compat names.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno`, which Rails rescues
 * without defining.
 */
export const Errno = { ENOTTY };
