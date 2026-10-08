import { EncodingError } from "./encoding-error.js";

/**
 * Ruby core `Encoding::UndefinedConversionError`
 * (`vendor/ruby/v3.3.11/transcode.c:4505` `rb_eUndefinedConversionError`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class UndefinedConversionError extends EncodingError {}
