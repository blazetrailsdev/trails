import { ArgumentError } from "./hash-utils.js";
import { I18n } from "./i18n.js";
import { rbObjClass, regexpEscape } from "@blazetrails/ruby-compat";

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

export function parameterize(
  string: string,
  {
    separator = "-",
    preserveCase = false,
    locale = null,
  }: { separator?: string; preserveCase?: boolean; locale?: string | null } = {},
): string {
  let parameterizedString = transliterate(string, "?", { locale });

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
    parameterizedString = parameterizedString.replace(reDuplicateSeparator, separator);
    parameterizedString = parameterizedString.replace(reLeadingTrailingSeparator, "");
  }

  if (!preserveCase) parameterizedString = parameterizedString.toLowerCase();
  return parameterizedString;
}
