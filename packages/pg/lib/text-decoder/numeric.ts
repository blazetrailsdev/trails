import { BigDecimal } from "@blazetrails/ruby-compat/big-decimal";
import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

export class Numeric extends SimpleDecoder {
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    return new BigDecimal(string);
  }
}

PG.TextDecoder.Numeric = Numeric;
