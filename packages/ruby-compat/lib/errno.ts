import { StandardError, syserrTbl } from "./standard-error.js";

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

  /** @noRailsEquivalent PERMANENT */
  static [Symbol.hasInstance](error: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, error) ||
      (this === SystemCallError &&
        error instanceof Error &&
        syserrTbl.has(String((error as { code?: unknown }).code)))
    );
  }
}

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
 * `Errno::EAGAIN`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: the error a non-blocking `read(2)` raises with nothing to read.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EAGAIN`.
 */
class EAGAIN extends SystemCallError {
  static readonly Errno = 11;
  readonly code = "EAGAIN";

  constructor(mesg?: string) {
    super(
      mesg == null
        ? "Resource temporarily unavailable"
        : `Resource temporarily unavailable - ${mesg}`,
    );
    this.name = "Errno::EAGAIN";
    this.errno = EAGAIN.Errno;
  }
}

/**
 * `Errno::EINVAL`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EINVAL`, which
 * `Mail::Encodings.unquote_and_convert_to` rescues.
 */
class EINVAL extends SystemCallError {
  static readonly Errno = 22;
  readonly code = "EINVAL";

  constructor(message?: string) {
    super(`Invalid argument${message ? ` - ${message}` : ""}`);
    this.name = "Errno::EINVAL";
    this.errno = EINVAL.Errno;
  }
}

/**
 * `Errno::EINTR`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: a system call interrupted by a signal.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EINTR`, which SolidCable's
 * `Listener` rescues.
 */
class EINTR extends SystemCallError {
  static readonly Errno = 4;
  readonly code = "EINTR";

  constructor(mesg?: string) {
    super(mesg == null ? "Interrupted system call" : `Interrupted system call - ${mesg}`);
    this.name = "Errno::EINTR";
    this.errno = EINTR.Errno;
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
 * `Errno::ESPIPE`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: the error `lseek(2)` raises on a pipe.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ESPIPE`, which rack's
 * rewindable-input spec raises without defining.
 */
class ESPIPE extends SystemCallError {
  static readonly Errno = 29;
  readonly code = "ESPIPE";

  constructor(mesg?: string) {
    super(mesg == null ? "Illegal seek" : `Illegal seek - ${mesg}`);
    this.name = "Errno::ESPIPE";
    this.errno = ESPIPE.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ESPIPE";
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
 * `Errno::ENOTDIR`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is. The fs layer's own error carrying `code: "ENOTDIR"` is this
 * class to `rescue Errno::ENOTDIR`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENOTDIR`, which Rack rescues
 * without defining.
 */
class ENOTDIR extends SystemCallError {
  static readonly Errno = 20;
  readonly code = "ENOTDIR";

  constructor(mesg?: string) {
    super(mesg == null ? "Not a directory" : `Not a directory - ${mesg}`);
    this.name = "Errno::ENOTDIR";
    this.errno = ENOTDIR.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ENOTDIR";
  }
}

/**
 * `Errno::ECHILD`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: what `waitpid(2)` raises with no child left to wait for.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ECHILD`.
 */
class ECHILD extends SystemCallError {
  static readonly Errno = 10;
  readonly code = "ECHILD";

  constructor(mesg?: string) {
    super(mesg == null ? "No child processes" : `No child processes - ${mesg}`);
    this.name = "Errno::ECHILD";
    this.errno = ECHILD.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ECHILD";
  }
}

/**
 * `Errno::ESRCH`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is. The fs layer's own error carrying `code: "ESRCH"` is this
 * class to `rescue Errno::ESRCH`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ESRCH`, which Rack rescues
 * without defining.
 */
class ESRCH extends SystemCallError {
  static readonly Errno = 3;
  readonly code = "ESRCH";

  constructor(mesg?: string) {
    super(mesg == null ? "No such process" : `No such process - ${mesg}`);
    this.name = "Errno::ESRCH";
    this.errno = ESRCH.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ESRCH";
  }
}

/**
 * `Errno::EPERM`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: the error `kill(2)` raises for a process the caller may not
 * signal. The host's own error carrying `code: "EPERM"` is this class to
 * `rescue Errno::EPERM`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EPERM`, which Solid Queue
 * rescues without defining.
 */
class EPERM extends SystemCallError {
  static readonly Errno = 1;
  readonly code = "EPERM";

  constructor(mesg?: string) {
    super(mesg == null ? "Operation not permitted" : `Operation not permitted - ${mesg}`);
    this.name = "Errno::EPERM";
    this.errno = EPERM.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "EPERM";
  }
}

/**
 * `Errno::EACCES`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: what `Kernel#system` raises for a program it may not run.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EACCES`.
 */
class EACCES extends SystemCallError {
  static readonly Errno = 13;
  readonly code = "EACCES";

  constructor(mesg?: string) {
    super(mesg == null ? "Permission denied" : `Permission denied - ${mesg}`);
    this.name = "Errno::EACCES";
    this.errno = EACCES.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "EACCES";
  }
}

/**
 * `Errno::EMFILE`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is. The fs layer's own error carrying `code: "EMFILE"` is this
 * class to `rescue Errno::EMFILE`; a subclass answers the ordinary prototype test.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EMFILE`, which Rack
 * subclasses without defining.
 */
class EMFILE extends SystemCallError {
  static readonly Errno = 24;
  readonly code = "EMFILE";

  constructor(mesg?: string) {
    super(mesg == null ? "Too many open files" : `Too many open files - ${mesg}`);
    this.name = "Errno::EMFILE";
    this.errno = EMFILE.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, error) ||
      (this === EMFILE && (error as { code?: unknown } | null | undefined)?.code === "EMFILE")
    );
  }
}

/**
 * `Errno::ECONNRESET`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`)
 * as {@link ENOTTY} is. A write to a socket the peer reset reaches JS as the
 * host's own error carrying `code: "ECONNRESET"`, which is this class to
 * `rescue Errno::ECONNRESET`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ECONNRESET`, which Action
 * Cable rescues without defining.
 */
class ECONNRESET extends SystemCallError {
  static readonly Errno = 104;
  readonly code = "ECONNRESET";

  constructor(mesg?: string) {
    super(mesg == null ? "Connection reset by peer" : `Connection reset by peer - ${mesg}`);
    this.name = "Errno::ECONNRESET";
    this.errno = ECONNRESET.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ECONNRESET";
  }
}

/**
 * `Errno::ECONNREFUSED`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`)
 * as {@link ENOTTY} is: the error `connect(2)` raises when nothing listens on
 * the port.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ECONNREFUSED`.
 */
class ECONNREFUSED extends SystemCallError {
  static readonly Errno = 111;
  readonly code = "ECONNREFUSED";

  constructor(mesg?: string) {
    super(mesg == null ? "Connection refused" : `Connection refused - ${mesg}`);
    this.name = "Errno::ECONNREFUSED";
    this.errno = ECONNREFUSED.Errno;
  }
}

/**
 * `Errno::ECONNABORTED`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`)
 * as {@link ENOTTY} is: the host's own error carrying `code: "ECONNABORTED"` is this
 * class to `rescue Errno::ECONNABORTED`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ECONNABORTED`.
 */
class ECONNABORTED extends SystemCallError {
  static readonly Errno = 103;
  readonly code = "ECONNABORTED";

  constructor(mesg?: string) {
    super(
      mesg == null
        ? "Software caused connection abort"
        : `Software caused connection abort - ${mesg}`,
    );
    this.name = "Errno::ECONNABORTED";
    this.errno = ECONNABORTED.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ECONNABORTED";
  }
}

/**
 * `Errno::ETIMEDOUT`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`)
 * as {@link ENOTTY} is: the host's own error carrying `code: "ETIMEDOUT"` is this
 * class to `rescue Errno::ETIMEDOUT`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ETIMEDOUT`.
 */
class ETIMEDOUT extends SystemCallError {
  static readonly Errno = 110;
  readonly code = "ETIMEDOUT";

  constructor(mesg?: string) {
    super(mesg == null ? "Connection timed out" : `Connection timed out - ${mesg}`);
    this.name = "Errno::ETIMEDOUT";
    this.errno = ETIMEDOUT.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ETIMEDOUT";
  }
}

/**
 * `Errno::EHOSTUNREACH`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`)
 * as {@link ENOTTY} is: the host's own error carrying `code: "EHOSTUNREACH"` is this
 * class to `rescue Errno::EHOSTUNREACH`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EHOSTUNREACH`.
 */
class EHOSTUNREACH extends SystemCallError {
  static readonly Errno = 113;
  readonly code = "EHOSTUNREACH";

  constructor(mesg?: string) {
    super(mesg == null ? "No route to host" : `No route to host - ${mesg}`);
    this.name = "Errno::EHOSTUNREACH";
    this.errno = EHOSTUNREACH.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "EHOSTUNREACH";
  }
}

/**
 * `Errno::ENETUNREACH`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`)
 * as {@link ENOTTY} is: the host's own error carrying `code: "ENETUNREACH"` is this
 * class to `rescue Errno::ENETUNREACH`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENETUNREACH`.
 */
class ENETUNREACH extends SystemCallError {
  static readonly Errno = 101;
  readonly code = "ENETUNREACH";

  constructor(mesg?: string) {
    super(mesg == null ? "Network is unreachable" : `Network is unreachable - ${mesg}`);
    this.name = "Errno::ENETUNREACH";
    this.errno = ENETUNREACH.Errno;
  }

  static [Symbol.hasInstance](error: unknown): boolean {
    return (error as { code?: unknown } | null | undefined)?.code === "ENETUNREACH";
  }
}

/**
 * `Errno::E2BIG`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::E2BIG`.
 */
class E2BIG extends SystemCallError {
  static readonly Errno = 7;
  readonly code = "E2BIG";

  constructor(mesg?: string) {
    super(mesg == null ? "Argument list too long" : `Argument list too long - ${mesg}`);
    this.name = "Errno::E2BIG";
    this.errno = E2BIG.Errno;
  }
}

/**
 * `Errno::EFAULT`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EFAULT`.
 */
class EFAULT extends SystemCallError {
  static readonly Errno = 14;
  readonly code = "EFAULT";

  constructor(mesg?: string) {
    super(mesg == null ? "Bad address" : `Bad address - ${mesg}`);
    this.name = "Errno::EFAULT";
    this.errno = EFAULT.Errno;
  }
}

/**
 * `Errno::EIO`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::EIO`.
 */
class EIO extends SystemCallError {
  static readonly Errno = 5;
  readonly code = "EIO";

  constructor(mesg?: string) {
    super(mesg == null ? "Input/output error" : `Input/output error - ${mesg}`);
    this.name = "Errno::EIO";
    this.errno = EIO.Errno;
  }
}

/**
 * `Errno::ELIBBAD`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ELIBBAD`.
 */
class ELIBBAD extends SystemCallError {
  static readonly Errno = 80;
  readonly code = "ELIBBAD";

  constructor(mesg?: string) {
    super(
      mesg == null
        ? "Accessing a corrupted shared library"
        : `Accessing a corrupted shared library - ${mesg}`,
    );
    this.name = "Errno::ELIBBAD";
    this.errno = ELIBBAD.Errno;
  }
}

/**
 * `Errno::ELOOP`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ELOOP`.
 */
class ELOOP extends SystemCallError {
  static readonly Errno = 40;
  readonly code = "ELOOP";

  constructor(mesg?: string) {
    super(
      mesg == null
        ? "Too many levels of symbolic links"
        : `Too many levels of symbolic links - ${mesg}`,
    );
    this.name = "Errno::ELOOP";
    this.errno = ELOOP.Errno;
  }
}

/**
 * `Errno::ENAMETOOLONG`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENAMETOOLONG`.
 */
class ENAMETOOLONG extends SystemCallError {
  static readonly Errno = 36;
  readonly code = "ENAMETOOLONG";

  constructor(mesg?: string) {
    super(mesg == null ? "File name too long" : `File name too long - ${mesg}`);
    this.name = "Errno::ENAMETOOLONG";
    this.errno = ENAMETOOLONG.Errno;
  }
}

/**
 * `Errno::ENFILE`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENFILE`.
 */
class ENFILE extends SystemCallError {
  static readonly Errno = 23;
  readonly code = "ENFILE";

  constructor(mesg?: string) {
    super(
      mesg == null ? "Too many open files in system" : `Too many open files in system - ${mesg}`,
    );
    this.name = "Errno::ENFILE";
    this.errno = ENFILE.Errno;
  }
}

/**
 * `Errno::ENOEXEC`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENOEXEC`.
 */
class ENOEXEC extends SystemCallError {
  static readonly Errno = 8;
  readonly code = "ENOEXEC";

  constructor(mesg?: string) {
    super(mesg == null ? "Exec format error" : `Exec format error - ${mesg}`);
    this.name = "Errno::ENOEXEC";
    this.errno = ENOEXEC.Errno;
  }
}

/**
 * `Errno::ENOMEM`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ENOMEM`.
 */
class ENOMEM extends SystemCallError {
  static readonly Errno = 12;
  readonly code = "ENOMEM";

  constructor(mesg?: string) {
    super(mesg == null ? "Cannot allocate memory" : `Cannot allocate memory - ${mesg}`);
    this.name = "Errno::ENOMEM";
    this.errno = ENOMEM.Errno;
  }
}

/**
 * `Errno::ETXTBSY`, defined by `set_syserr` (`vendor/ruby/v3.3.11/error.c:2700-2737`) as
 * {@link ENOTTY} is: an errno `execve(2)` or `fork(2)` reports for a spawn.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno::ETXTBSY`.
 */
class ETXTBSY extends SystemCallError {
  static readonly Errno = 26;
  readonly code = "ETXTBSY";

  constructor(mesg?: string) {
    super(mesg == null ? "Text file busy" : `Text file busy - ${mesg}`);
    this.name = "Errno::ETXTBSY";
    this.errno = ETXTBSY.Errno;
  }
}

/**
 * Ruby's core `Errno` module (`vendor/ruby/v3.3.11/error.c:2666-2694`), holding the
 * `SystemCallError` subclass for each errno a raise site in ruby-compat names.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Errno`, which Rails rescues
 * without defining.
 */
export const Errno = {
  E2BIG,
  EACCES,
  EAGAIN,
  ECHILD,
  ECONNABORTED,
  ECONNREFUSED,
  ECONNRESET,
  EEXIST,
  EFAULT,
  EHOSTUNREACH,
  EINTR,
  EINVAL,
  EIO,
  EISDIR,
  ELIBBAD,
  ELOOP,
  EMFILE,
  ENAMETOOLONG,
  ENETUNREACH,
  ENFILE,
  ENOENT,
  ENOEXEC,
  ENOMEM,
  ENOTDIR,
  ENOTTY,
  EPERM,
  EPIPE,
  ESPIPE,
  ESRCH,
  ETIMEDOUT,
  ETXTBSY,
};
