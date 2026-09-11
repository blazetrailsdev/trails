import { EncodingError } from "./encoding-error.js";

/**
 * Ruby's core `Encoding::InvalidByteSequenceError`
 * (`vendor/ruby/transcode.c:4506` `rb_eInvalidByteSequenceError`), an
 * `EncodingError` subclass — what a converter raises on bytes its source
 * encoding cannot read (`econv_invalid_byte_sequence`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError`,
 * which Rails inherits rather than defines.
 */
export class InvalidByteSequenceError extends EncodingError {}
