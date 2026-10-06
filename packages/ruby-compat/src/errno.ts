import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `SystemCallError` (`vendor/ruby/v3.3.11/error.c:3380`
 * `rb_eSystemCallError`), the parent of every `Errno::` class. Its `errno` is
 * `syserr_errno` (`error.c:2812-2816`). The fs layer's own errors are `Error`s
 * carrying an errno name as `.code` (`"EACCES"`) and no trails class, and are
 * this class to `rescue SystemCallError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `SystemCallError`, which Rails
 * rescues without defining.
 */
export class SystemCallError extends StandardError {
  /** @noRailsEquivalent PERMANENT */
  errno: number | null = null;

  /** @noRailsEquivalent CONVERGEABLE system-call-error-instanceof-reads-an-errno-table-and-all-takes-a-pattern */
  static [Symbol.hasInstance](error: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, error) ||
      (this === SystemCallError &&
        error instanceof Error &&
        /^E[A-Z0-9]+$/.test(String((error as { code?: unknown }).code)))
    );
  }
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
 * `Errno::EPIPE`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is. A write to a closed pipe reaches JS as the host's own
 * error carrying `code: "EPIPE"`, which is this class to `rescue Errno::EPIPE`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EPIPE`, which Thor rescues
 * without defining.
 */
class EPIPE extends SystemCallError {
  static readonly Errno = 32;
  readonly code = "EPIPE";

  constructor(mesg?: string) {
    super(mesg == null ? "Broken pipe" : `Broken pipe - ${mesg}`);
    this.name = "Errno::EPIPE";
    this.errno = EPIPE.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "EPIPE";
  }
}

/**
 * `Errno::EEXIST`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is. The fs layer's own error carrying `code: "EEXIST"` is this
 * class to `rescue Errno::EEXIST`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EEXIST`, which Thor rescues
 * without defining.
 */
class EEXIST extends SystemCallError {
  static readonly Errno = 17;
  readonly code = "EEXIST";

  constructor(mesg?: string) {
    super(mesg == null ? "File exists" : `File exists - ${mesg}`);
    this.name = "Errno::EEXIST";
    this.errno = EEXIST.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "EEXIST";
  }
}

/**
 * `Errno::ENOENT`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is. The fs layer's own error carrying `code: "ENOENT"` is this
 * class to `rescue Errno::ENOENT`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENOENT`, which Rails
 * rescues without defining.
 */
class ENOENT extends SystemCallError {
  static readonly Errno = 2;
  readonly code = "ENOENT";

  constructor(mesg?: string) {
    super(mesg == null ? "No such file or directory" : `No such file or directory - ${mesg}`);
    this.name = "Errno::ENOENT";
    this.errno = ENOENT.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ENOENT";
  }
}

/**
 * `Errno::EISDIR`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is. The fs layer's own error carrying `code: "EISDIR"` is this
 * class to `rescue Errno::EISDIR`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EISDIR`, which Thor rescues
 * without defining.
 */
class EISDIR extends SystemCallError {
  static readonly Errno = 21;
  readonly code = "EISDIR";

  constructor(mesg?: string) {
    super(mesg == null ? "Is a directory" : `Is a directory - ${mesg}`);
    this.name = "Errno::EISDIR";
    this.errno = EISDIR.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "EISDIR";
  }
}

/**
 * Ruby's core `Errno` module (`vendor/ruby/v3.3.11/error.c:2666-2694`), holding the
 * `SystemCallError` subclass for each errno a raise site in ruby-compat names.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno`, which Rails rescues
 * without defining.
 */
export const Errno = { EEXIST, EISDIR, ENOENT, ENOTTY, EPIPE };
