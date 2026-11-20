import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

/** @noRailsEquivalent PERMANENT */
export class Boolean extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return string === "t";
  }
}

PG.TextDecoder.Boolean = Boolean;
