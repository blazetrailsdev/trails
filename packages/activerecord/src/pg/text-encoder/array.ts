import { rbObjAsString } from "@blazetrails/ruby-compat";
import { CompositeEncoder } from "../composite-encoder.js";

function quoteArrayBuffer(pIn: string, delimiter: string): string {
  const needquote =
    pIn.length === 0 ||
    pIn.toUpperCase() === "NULL" ||
    [...pIn].some((ch) => `"\\{} \t\n\r\v\f${delimiter}`.includes(ch));
  return needquote ? `"${pIn.replace(/(["\\])/g, "\\$1")}"` : pIn;
}

function writeArray(self: Array, value: readonly unknown[], quote: boolean): string {
  const out = value.map((entry) => {
    if (globalThis.Array.isArray(entry)) return writeArray(self, entry, quote);
    if (entry == null) return "NULL";
    const elem = self.elementsType as { encode(value: unknown): string } | null;
    const str = elem ? elem.encode(entry) : rbObjAsString(entry);
    return quote ? quoteArrayBuffer(str, self.delimiter) : str;
  });
  return `{${out.join(self.delimiter)}}`;
}

export class Array extends CompositeEncoder {
  encode(value: readonly unknown[], encoding?: unknown): string;
  encode(value: unknown, encoding?: unknown): string | null;
  encode(value: unknown, _encoding: unknown = null): string | null {
    if (value == null) return null;
    if (globalThis.Array.isArray(value)) return writeArray(this, value, this.isNeedsQuotation());
    return rbObjAsString(value);
  }
}
