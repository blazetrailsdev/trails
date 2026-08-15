/**
 * Transliterate accented/special characters to ASCII approximations.
 * Mirrors ActiveSupport::Inflector.transliterate behavior.
 */

// Map of characters that NFD decomposition doesn't handle well
const APPROXIMATIONS: Record<string, string> = {
  Æ: "AE",
  æ: "ae",
  Œ: "OE",
  œ: "oe",
  Ð: "D",
  ð: "d",
  Þ: "Th",
  þ: "th",
  ß: "ss",
  Ø: "O",
  ø: "o",
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Ħ: "H",
  ħ: "h",
  Ŋ: "N",
  ŋ: "n",
  Ŧ: "T",
  ŧ: "t",
  ĸ: "k",
  Ĳ: "IJ",
  ĳ: "ij",
  ﬁ: "fi",
  ﬂ: "fl",
};

/**
 * Replaces non-ASCII characters with ASCII approximations.
 * Characters that can't be approximated are replaced with `replacement`.
 */
export function transliterate(str: string | null | undefined, replacement = "?"): string {
  if (str == null) return "";
  const s = String(str);
  if (s.length === 0) return s;

  // First apply manual approximations
  let result = s;
  for (const [char, approx] of Object.entries(APPROXIMATIONS)) {
    result = result.split(char).join(approx);
  }

  // Then use NFD normalization to decompose accented chars,
  // then strip combining marks
  result = result.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Replace any remaining non-ASCII chars with replacement
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[^\x00-\x7F]/g, replacement);

  return result;
}

/**
 * Replaces special characters in a string so that it may be used as part of a
 * "pretty" URL.
 *
 * Mirrors: `Inflector.parameterize`
 * (`inflector/transliterate.rb:123-147`). Rails forwards a `locale:` kwarg to
 * `transliterate`, which selects that locale's `i18n.transliterate.rule`;
 * trails' `transliterate` has no locale arm yet, so there is nothing to
 * forward it to.
 */
export function parameterize(
  string: string,
  { separator = "-", preserveCase = false }: { separator?: string; preserveCase?: boolean } = {},
): string {
  // Replace accented chars with their ASCII equivalents.
  let parameterizedString = transliterate(string);

  // Turn unwanted chars into the separator.
  parameterizedString = parameterizedString.replace(/[^a-z0-9\-_]+/gi, separator);

  if (separator !== null && separator !== "") {
    let reDuplicateSeparator: RegExp;
    let reLeadingTrailingSeparator: RegExp;
    if (separator === "-") {
      reDuplicateSeparator = /-{2,}/g;
      reLeadingTrailingSeparator = /^-|-$/gi;
    } else {
      const reSep = separator.replace(/[.*+?^${}()|[\]\\\-#\s]/g, "\\$&");
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
