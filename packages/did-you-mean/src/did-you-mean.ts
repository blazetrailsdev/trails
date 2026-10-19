import { Hash, rbClassInheritedP, rbModToS } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { Correctable } from "./core-ext/name-error.js";
import { Formatter } from "./formatter.js";
import { NullChecker } from "./spell-checkers/null-checker.js";

const _spellCheckers = new Hash<string, unknown>(NullChecker);

export function spellCheckers(): Hash<string, unknown> {
  return _spellCheckers;
}

export function correctError(
  errorClass: abstract new (...args: never) => object,
  spellChecker: unknown,
): void {
  spellCheckers().set(rbModToS(errorClass), spellChecker);

  if (typeof errorClass === "function" && rbClassInheritedP(errorClass, Correctable) !== true) {
    prepend(errorClass, Correctable);
  }
}

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
