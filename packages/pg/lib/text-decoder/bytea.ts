import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

/** @noRailsEquivalent PERMANENT */
export class Bytea extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return PG.Connection.unescapeBytea(string);
  }
}

PG.TextDecoder.Bytea = Bytea;
