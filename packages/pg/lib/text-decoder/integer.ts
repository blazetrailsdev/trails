import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

export class Integer extends SimpleDecoder {
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    const value = BigInt(string);
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value;
  }
}

PG.TextDecoder.Integer = Integer;
