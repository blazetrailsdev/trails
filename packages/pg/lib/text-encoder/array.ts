import { ArgumentError, rbObjAsString } from "@blazetrails/ruby-compat";
import { CompositeEncoder } from "../composite-encoder.js";
import { PG } from "../namespaces.js";

function quoteArrayBuffer(pIn: string, delimiter: string): string {
  const needquote =
    pIn.length === 0 ||
    pIn.toUpperCase() === "NULL" ||
    [...pIn].some((ch) => `"\\{} \t\n\r\v\f${delimiter}`.includes(ch));
  return needquote ? `"${pIn.replace(/(["\\])/g, "\\$1")}"` : pIn;
}

function writeArray(
  self: Array,
  value: readonly unknown[],
  quote: boolean,
  dimension: number,
): string {
  const dimensions = self.dimensions ?? -1;
  if (value.length === 0 && dimensions >= 0 && dimension !== dimensions) {
    throw new ArgumentError(
      `less array dimensions to encode (${dimension}) than expected (${dimensions})`,
    );
  }
  const out = value.map((entry) => {
    if (entry == null) {
      if (dimensions >= 0 && dimension !== dimensions)
        throw new ArgumentError(
          `less array dimensions to encode (${dimension}) than expected (${dimensions})`,
        );
      return "NULL";
    }
    if (globalThis.Array.isArray(entry) && (dimensions < 0 || dimension < dimensions)) {
      return writeArray(self, entry, quote, dimension + 1);
    }
    if (dimensions >= 0 && dimension !== dimensions)
      throw new ArgumentError(
        `less array dimensions to encode (${dimension}) than expected (${dimensions})`,
      );
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
    if (globalThis.Array.isArray(value)) return writeArray(this, value, this.isNeedsQuotation(), 1);
    return rbObjAsString(value);
  }
}

PG.TextEncoder.Array = Array;
