// Ported from Ruby's did_you_mean/levenshtein.rb
// (https://github.com/ruby/did_you_mean), MIT License.
// The Ruby implementation is itself based on the Text gem:
// Copyright (c) 2006-2013 Paul Battley, Michael Neumann, Tim Fletcher.

/** @internal */
function codepoints(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) out.push(ch.codePointAt(0)!);
  return out;
}

/** @internal */
function min3(a: number, b: number, c: number): number {
  if (a < b && a < c) return a;
  if (b < c) return b;
  return c;
}

/** Mirrors Ruby `DidYouMean::Levenshtein.distance`. */
export class Levenshtein {
  /** Two-row dynamic-programming Levenshtein distance, codepoint-aware. */
  static distance(str1: string, str2: string): number {
    const cp1 = codepoints(str1);
    const cp2 = codepoints(str2);
    const n = cp1.length;
    const m = cp2.length;
    if (n === 0) return m;
    if (m === 0) return n;

    const d: number[] = [];
    for (let k = 0; k <= m; k++) d.push(k);
    let x = 0;

    for (let idx = 0; idx < n; idx++) {
      let i = idx + 1;
      const char1 = cp1[idx];
      let j = 0;
      while (j < m) {
        const cost = char1 === cp2[j] ? 0 : 1;
        x = min3(d[j + 1] + 1, i + 1, d[j] + cost);
        d[j] = i;
        i = x;
        j += 1;
      }
      d[m] = x;
    }

    return x;
  }
}
