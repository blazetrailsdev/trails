/**
 * Ruby's core `IOError` (`vendor/ruby/io.c:15342`), a `StandardError`
 * subclass — what `rb_io_check_closed` raises with `"closed stream"` when a
 * stream method is reached on a descriptor that is already gone
 * (`vendor/ruby/io.c:744`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `IOError`, which Rails inherits
 * rather than defines.
 */
export class IOError extends Error {
  constructor(message: string = "IOError") {
    super(message);
    this.name = "IOError";
  }
}
