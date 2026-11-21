import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

export class Bytea extends SimpleDecoder {
  /** @noRailsEquivalent PERMANENT */
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return pgTextDecBytea(string);
  }
}

/** @internal */
function pgTextDecBytea(val: string): Uint8Array {
  return PG.Connection.unescapeBytea(val);
}

PG.TextDecoder.Bytea = Bytea;
