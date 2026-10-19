import { Formatter, PlainFormatter } from "./formatter.js";

export { Levenshtein } from "./levenshtein.js";
export { Jaro, JaroWinkler } from "./jaro-winkler.js";
export { SpellChecker } from "./spell-checker.js";
export type { SpellCheckerOptions } from "./spell-checker.js";
export { Correctable } from "./core-ext/name-error.js";

export { Formatter, PlainFormatter };
export { correctError, formatter, setFormatter, spellCheckers } from "./did-you-mean.js";
export { NullChecker } from "./spell-checkers/null-checker.js";
