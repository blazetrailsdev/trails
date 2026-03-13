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
