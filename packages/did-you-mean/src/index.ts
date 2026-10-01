import { Formatter } from "./formatter.js";

export { Levenshtein } from "./levenshtein.js";
export { Jaro, JaroWinkler } from "./jaro-winkler.js";
export { SpellChecker } from "./spell-checker.js";
export type { SpellCheckerOptions } from "./spell-checker.js";

export { Formatter };

export function formatter(): typeof Formatter {
  return Formatter;
}
