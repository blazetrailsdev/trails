import { EncodingError } from "./encoding-error.js";

/**
 * Ruby's core `Encoding::ConverterNotFoundError`
 * (`vendor/ruby/v3.3.11/transcode.c:4507` `rb_eConverterNotFoundError`), an
 * `EncodingError` subclass — what `rb_econv_open_exc`
 * (`vendor/ruby/v3.3.11/transcode.c:2097-2105`) raises where no converter between two
 * encodings exists.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Encoding::ConverterNotFoundError`,
 * which Rails inherits rather than defines.
 */
export class ConverterNotFoundError extends EncodingError {}
