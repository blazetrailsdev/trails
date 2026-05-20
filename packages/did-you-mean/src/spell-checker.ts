// Ported from Ruby's did_you_mean/spell_checker.rb
// (https://github.com/ruby/did_you_mean), MIT License.

import { JaroWinkler } from "./jaro-winkler.js";
import { Levenshtein } from "./levenshtein.js";

export interface SpellCheckerOptions {
  dictionary: ReadonlyArray<string>;
}

/** @internal */
function normalize(input: string): string {
  return input.toLowerCase().replaceAll("@", "");
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
    const rawInput = String(input);
    const normalizedInput = normalize(rawInput);
    const inputLen = codepointLength(normalizedInput);
    const jwThreshold = inputLen > 3 ? 0.834 : 0.77;

    const candidates: Array<{ word: string; index: number; score: number }> = [];
    for (let i = 0; i < this.#dictionary.length; i++) {
      const word = this.#dictionary[i];
      if (rawInput === String(word)) continue;
      const jw = JaroWinkler.distance(normalize(word), normalizedInput);
      if (jw < jwThreshold) continue;
      candidates.push({
        word,
        index: i,
        score: JaroWinkler.distance(String(word), normalizedInput),
      });
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Ruby does `sort_by` then `reverse!`. MRI's sort is not stable, but
      // the observable effect on ties in practice is that elements come out
      // in reverse insertion order — match that.
      return b.index - a.index;
    });

    const mistypeThreshold = Math.ceil(inputLen * 0.25);
    let corrections = candidates
      .filter((c) => Levenshtein.distance(normalize(c.word), normalizedInput) <= mistypeThreshold)
      .map((c) => c.word);

    if (corrections.length === 0) {
      corrections = candidates
        .filter((c) => {
          const w = normalize(c.word);
          const len = Math.min(inputLen, codepointLength(w));
          return Levenshtein.distance(w, normalizedInput) < len;
        })
        .slice(0, 1)
        .map((c) => c.word);
    }

    return corrections;
  }
}
