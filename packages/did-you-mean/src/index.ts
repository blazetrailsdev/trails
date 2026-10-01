import { Formatter, PlainFormatter } from "./formatter.js";

export { Levenshtein } from "./levenshtein.js";
export { Jaro, JaroWinkler } from "./jaro-winkler.js";
export { SpellChecker } from "./spell-checker.js";
export type { SpellCheckerOptions } from "./spell-checker.js";

export { Formatter, PlainFormatter };

interface FormatterLike {
  messageFor(corrections: string[]): string;
}

let ractorFormatter: FormatterLike | null = null;

export function formatter(): typeof Formatter | FormatterLike {
  return ractorFormatter || Formatter;
}

export function setFormatter<T extends FormatterLike | null>(formatter: T): T {
  return (ractorFormatter = formatter) as T;
}
