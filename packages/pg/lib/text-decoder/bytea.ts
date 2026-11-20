import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

export class Bytea extends SimpleDecoder {
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return PG.Connection.unescapeBytea(string);
  }
}

PG.TextDecoder.Bytea = Bytea;
