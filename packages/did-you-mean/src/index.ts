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

export function formatter(): FormatterLike {
  return ractorFormatter || Formatter;
}

export function setFormatter(formatter: FormatterLike | null): void {
  ractorFormatter = formatter;
}
