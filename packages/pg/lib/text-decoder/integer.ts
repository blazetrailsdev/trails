import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

export class Integer extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return pgTextDecInteger(string);
  }
}

/** @internal */
function pgTextDecInteger(val: string): number | bigint {
  const maxLen = 15;

  if (val.length <= maxLen) {
    let valPos = 0;
    let digit = val[valPos];
    let neg = false;
    let i = 0;
    let error = false;

    if (digit === "-") {
      neg = true;
      i = 0;
    } else if (digit !== undefined && digit >= "0" && digit <= "9") {
      neg = false;
      i = digit.charCodeAt(0) - 48;
    } else {
      error = true;
    }

    while (!error && (digit = val[++valPos]) !== undefined) {
      if (digit >= "0" && digit <= "9") {
        i = i * 10 + (digit.charCodeAt(0) - 48);
      } else {
        error = true;
      }
    }

    if (!error) {
      return neg ? 0 - i : i;
    }
  }
  return rbCstr2inum(val);
}

/** @internal */
function rbCstr2inum(val: string): number | bigint {
  const m = /^\s*([+-]?)(\d+(?:_\d+)*)/.exec(val);
  if (m === null) return 0;
  const value = BigInt(m[1] + m[2].replaceAll("_", ""));
  const num = Number(value);
  return Number.isSafeInteger(num) ? num : value;
}

PG.TextDecoder.Integer = Integer;
