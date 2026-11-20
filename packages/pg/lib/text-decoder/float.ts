import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

/** @noRailsEquivalent PERMANENT */
export class Float extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return parseFloat(string);
  }
}

PG.TextDecoder.Float = Float;
