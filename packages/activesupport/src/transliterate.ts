/**
 * Transliterate accented/special characters to ASCII approximations.
 *
 * Mirrors: ActiveSupport::Inflector (inflector/transliterate.rb).
 */

import { ArgumentError } from "./hash-utils.js";
import { I18n } from "./i18n.js";
import { rbObjClass, regexpEscape } from "@blazetrails/ruby-compat";

/**
 * Replaces non-ASCII characters with an ASCII approximation, or if none
 * exists, a replacement character which defaults to "?".
 *
 * This method is I18n aware, so you can set up custom approximations for a
 * locale by storing them under the `i18n.transliterate.rule` key
 * (inflector/transliterate.rb:19-52).
 *
 * Mirrors: `Inflector.transliterate` (inflector/transliterate.rb:64-95).
 * Ruby's encoding arms (ALLOWED_ENCODINGS_FOR_TRANSLITERATE, `force_encoding`,
 * `tidy_bytes`, and the closing re-encode) have no analogue: a JS string has no
 * encoding to check, transcode, or restore, and no invalid bytes to tidy — the
 * `unicode_normalize(:nfc)` is all that survives of that pipeline.
 */
export function transliterate(
  string: string,
  replacement = "?",
  { locale = null }: { locale?: string | null } = {},
): string {
  if (typeof string !== "string")
    throw new ArgumentError(`Can only transliterate strings. Received ${rbObjClass(string)}`);
  // eslint-disable-next-line no-control-regex -- Ruby's `ascii_only?` (transliterate.rb:69)
  if (/^[\x00-\x7f]*$/.test(string)) return string;

  return I18n.transliterate(string.normalize("NFC"), { replacement, locale }) as string;
}

/**
 * Replaces special characters in a string so that it may be used as part of a
 * "pretty" URL.
 *
 * Mirrors: `Inflector.parameterize`
 * (`inflector/transliterate.rb:123-147`).
 */
export function parameterize(
  string: string,
  {
    separator = "-",
    preserveCase = false,
    locale = null,
  }: { separator?: string; preserveCase?: boolean; locale?: string | null } = {},
): string {
  // Replace accented chars with their ASCII equivalents.
  let parameterizedString = transliterate(string, "?", { locale });

  // Turn unwanted chars into the separator.
  parameterizedString = parameterizedString.replace(/[^a-z0-9\-_]+/gi, separator);

  if (separator !== null && separator !== "") {
    let reDuplicateSeparator: RegExp;
    let reLeadingTrailingSeparator: RegExp;
    if (separator === "-") {
      reDuplicateSeparator = /-{2,}/g;
      reLeadingTrailingSeparator = /^-|-$/gi;
    } else {
      const reSep = regexpEscape(separator);
      reDuplicateSeparator = new RegExp(`${reSep}{2,}`, "g");
      reLeadingTrailingSeparator = new RegExp(`^${reSep}|${reSep}$`, "gi");
    }
    // No more than one of the separator in a row.
    parameterizedString = parameterizedString.replace(reDuplicateSeparator, separator);
    // Remove leading/trailing separator.
    parameterizedString = parameterizedString.replace(reLeadingTrailingSeparator, "");
  }

  if (!preserveCase) parameterizedString = parameterizedString.toLowerCase();
  return parameterizedString;
}
