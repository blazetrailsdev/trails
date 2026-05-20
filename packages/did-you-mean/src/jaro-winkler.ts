// Ported from Ruby's did_you_mean/jaro_winkler.rb
// (https://github.com/ruby/did_you_mean), MIT License.

/** @internal */
function codepoints(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) out.push(ch.codePointAt(0)!);
  return out;
}

/** Mirrors Ruby `DidYouMean::Jaro.distance`. */
export class Jaro {
  /** Jaro distance over Unicode codepoints. */
  static distance(str1: string, str2: string): number {
    let cp1 = codepoints(str1);
    let cp2 = codepoints(str2);
    if (cp1.length > cp2.length) {
      const tmp = cp1;
      cp1 = cp2;
      cp2 = tmp;
    }
    const length1 = cp1.length;
    const length2 = cp2.length;

    if (length2 === 0) return 0;

    let m = 0;
    let t = 0;
    const range = length2 > 3 ? Math.floor(length2 / 2) - 1 : 0;
    const flags1 = new Uint8Array(length1);
    const flags2 = new Uint8Array(length2);

    for (let i = 0; i < length1; i++) {
      const last = i + range;
      let j = i >= range ? i - range : 0;
      const jEnd = last < length2 - 1 ? last : length2 - 1;
      while (j <= jEnd) {
        if (flags2[j] === 0 && cp1[i] === cp2[j]) {
          flags2[j] = 1;
          flags1[i] = 1;
          m += 1;
          break;
        }
        j += 1;
      }
    }

    if (m === 0) return 0;

    let k = 0;
    for (let i = 0; i < length1; i++) {
      if (flags1[i] !== 0) {
        // flags1 and flags2 carry the same number of set bits (m matches),
        // so this scan always finds one.
        let j = k;
        let index = k;
        while (j < length2) {
          index = j;
          if (flags2[j] !== 0) {
            k = j + 1;
            break;
          }
          j += 1;
        }
        if (cp1[i] !== cp2[index]) t += 1;
      }
    }
    t = Math.floor(t / 2);

    return (m / length1 + m / length2 + (m - t) / m) / 3;
  }
}

const JW_WEIGHT = 0.1;
const JW_THRESHOLD = 0.7;

/** Mirrors Ruby `DidYouMean::JaroWinkler.distance`. */
export class JaroWinkler {
  /** Jaro-Winkler distance (boost for shared prefixes up to length 4). */
  static distance(str1: string, str2: string): number {
    const j = Jaro.distance(str1, str2);
    if (j <= JW_THRESHOLD) return j;

    const cp1 = codepoints(str1);
    const cp2 = codepoints(str2);
    let prefixBonus = 0;
    for (let i = 0; i < cp1.length; i++) {
      if (cp1[i] === cp2[prefixBonus] && prefixBonus < 4) {
        prefixBonus += 1;
      } else {
        break;
      }
    }
    return j + prefixBonus * JW_WEIGHT * (1 - j);
  }
}
