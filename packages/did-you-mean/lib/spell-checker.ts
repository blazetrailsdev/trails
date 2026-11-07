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
    words = words
      .sort(
        (a, b) =>
          JaroWinkler.distance(String(a), normalizedInput) -
          JaroWinkler.distance(String(b), normalizedInput),
      )
      .reverse();

    threshold = Math.ceil(codepointLength(normalizedInput) * 0.25);
    let corrections = words.filter(
      (c) => Levenshtein.distance(normalize(c), normalizedInput) <= threshold,
    );

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
