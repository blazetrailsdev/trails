import { IOError } from "./io-error.js";

/**
 * Ruby's core `EOFError` (`vendor/ruby/io.c:15343`), an `IOError` subclass —
 * what `rb_eof_error` raises with `"end of file reached"` when a read that
 * must return bytes reaches the end of the stream, which is the arm
 * `io_readpartial` (`vendor/ruby/io.c:3590-3597`) takes on a `nil` partial
 * read.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `EOFError`, which Rails inherits
 * rather than defines.
 */
export class EOFError extends IOError {}
