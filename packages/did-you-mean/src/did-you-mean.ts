import { Formatter } from "./formatter.js";

export interface FormatterLike {
  messageFor(corrections: string[]): string;
}

let ractorFormatter: FormatterLike | null = null;

export function formatter(): typeof Formatter | FormatterLike {
  return ractorFormatter || Formatter;
}

export function setFormatter<T extends FormatterLike | null>(formatter: T): T {
  return (ractorFormatter = formatter) as T;
}
