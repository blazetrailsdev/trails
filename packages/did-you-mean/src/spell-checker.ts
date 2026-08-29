// Ported from Ruby's did_you_mean/spell_checker.rb
// (https://github.com/ruby/did_you_mean), MIT License.

import { JaroWinkler } from "./jaro-winkler.js";
import { Levenshtein } from "./levenshtein.js";

export interface SpellCheckerOptions {
  dictionary: ReadonlyArray<string>;
}

/** @internal */
function normalize(strOrSymbol: string): string {
  return strOrSymbol.toLowerCase().replaceAll("@", "");
}

/** @internal */
function codepointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/**
 * Port of Ruby's DidYouMean::SpellChecker. Suggests dictionary entries close
 * to a misspelled input using Jaro-Winkler for ranking and Levenshtein for
 * filtering, matching upstream thresholds and tie-breaking.
 */
export class SpellChecker {
  readonly #dictionary: ReadonlyArray<string>;

  constructor(options: SpellCheckerOptions) {
    this.#dictionary = options.dictionary;
  }

  correct(input: string): string[] {
    const normalizedInput = normalize(input);
    let threshold = codepointLength(normalizedInput) > 3 ? 0.834 : 0.77;

    let words = this.#dictionary.filter(
      (word) => JaroWinkler.distance(normalize(word), normalizedInput) >= threshold,
    );
    words = words.filter((word) => String(input) !== String(word));
    // MRI's sort is not stable, but the observable effect on ties is that
    // elements come out in reverse insertion order; JS's stable ascending sort
    // plus `reverse()` reproduces exactly that.
    words = words
      .sort(
        (a, b) =>
          JaroWinkler.distance(String(a), normalizedInput) -
          JaroWinkler.distance(String(b), normalizedInput),
      )
      .reverse();

    // Correct mistypes
    threshold = Math.ceil(codepointLength(normalizedInput) * 0.25);
    let corrections = words.filter(
      (c) => Levenshtein.distance(normalize(c), normalizedInput) <= threshold,
    );

    // Correct misspells
    if (corrections.length === 0) {
      corrections = words
        .filter((word) => {
          word = normalize(word);
          const length =
            codepointLength(normalizedInput) < codepointLength(word)
              ? codepointLength(normalizedInput)
              : codepointLength(word);

          return Levenshtein.distance(word, normalizedInput) < length;
        })
        .slice(0, 1);
    }

    return corrections;
  }
}
