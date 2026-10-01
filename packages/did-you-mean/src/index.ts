import { Formatter, PlainFormatter } from "./formatter.js";

export { Levenshtein } from "./levenshtein.js";
export { Jaro, JaroWinkler } from "./jaro-winkler.js";
export { SpellChecker } from "./spell-checker.js";
export type { SpellCheckerOptions } from "./spell-checker.js";

export { Formatter, PlainFormatter };

interface FormatterClass {
  new (): { messageFor(corrections: string[]): string };
  messageFor(corrections: string[]): string;
}

let ractorFormatter: FormatterClass | null = null;

export function formatter(): FormatterClass {
  return ractorFormatter || Formatter;
}

export function setFormatter<T extends FormatterClass | null>(formatter: T): T {
  return (ractorFormatter = formatter) as T;
}
