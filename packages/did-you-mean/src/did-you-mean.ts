import { Hash, rbClassInheritedP, rbModToS } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { Correctable } from "./core-ext/name-error.js";
import { Formatter } from "./formatter.js";
import { NullChecker } from "./spell-checkers/null-checker.js";

let _spellCheckers = new Hash<string, unknown>(NullChecker);

export function spellCheckers(): Hash<string, unknown> {
  return _spellCheckers;
}

export function correctError(
  errorClass: abstract new (...args: never) => object,
  spellChecker: unknown,
): void {
  const newMapping = new Hash<string, unknown>();
  for (const [key, value] of _spellCheckers) newMapping.set(key, value);
  newMapping.set(rbModToS(errorClass), spellChecker);
  newMapping.setDefault(NullChecker);

  _spellCheckers = newMapping;

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
