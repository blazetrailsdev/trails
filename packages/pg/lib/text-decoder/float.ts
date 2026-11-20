import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

/** @noRailsEquivalent PERMANENT */
export class Float extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return pgTextDecFloat(string);
  }
}

/** @internal */
function pgTextDecFloat(val: string): number {
  switch (val[0]) {
    case "N":
      return NaN;
    case "I":
      return Infinity;
    case "-":
      if (val[1] === "I") {
        return -Infinity;
      } else {
        return rbCstrToDbl(val);
      }
    default:
      return rbCstrToDbl(val);
  }
}

/** @internal */
function rbCstrToDbl(val: string): number {
  const d = parseFloat(val.replaceAll("_", ""));
  return Number.isNaN(d) ? 0 : d;
}

PG.TextDecoder.Float = Float;
