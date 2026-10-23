import { Hash, rbClassInheritedP, toS, warn } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { Correctable } from "./core-ext/name-error.js";
import { Formatter } from "./formatter.js";
import { NullChecker } from "./spell-checkers/null-checker.js";

let _spellCheckers = new Hash<string, unknown>(NullChecker);

export function spellCheckers(): Hash<string, unknown> {
  return _spellCheckers;
}

export function correctError(errorClass: object, spellChecker: unknown): void {
  const newMapping = new Hash<string, unknown>();
  for (const [key, value] of _spellCheckers) newMapping.set(key, value);
  newMapping.set(toS(errorClass), spellChecker);
  newMapping.setDefault(NullChecker);

  _spellCheckers = newMapping;

  if (typeof errorClass === "function" && rbClassInheritedP(errorClass, Correctable) !== true) {
    prepend(errorClass as abstract new (...args: never) => object, Correctable);
  }
}

/** @internal */
export class DeprecatedMapping {
  set(key: object, value: unknown): void {
    warn(
      `Calling \`DidYouMean::SPELL_CHECKERS[${toS(key)}] = ${toS(value)}' has been deprecated. ` +
        `Please call \`DidYouMean.correct_error(${toS(key)}, ${toS(value)})' instead.`,
    );

    correctError(key, value);
  }

  mergeBang(hash: Map<object, unknown>): void {
    warn(
      "Calling `DidYouMean::SPELL_CHECKERS.merge!(error_name => spell_checker)' has been deprecated. " +
        "Please call `DidYouMean.correct_error(error_name, spell_checker)' instead.",
    );

    hash.forEach((spellChecker, errorClass) => {
      correctError(errorClass, spellChecker);
    });
  }
}

export const SPELL_CHECKERS = new DeprecatedMapping();

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
