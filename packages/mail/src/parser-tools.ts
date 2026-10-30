import { byteslice, Encoding, forceEncoding, Range } from "@blazetrails/ruby-compat";

export const ParserTools = {
  chars(data: Uint8Array, fromBytes: number | null, toBytes: number | null): string | Uint8Array {
    return forceEncoding(byteslice(data, new Range(fromBytes, toBytes))!, Encoding.UTF_8);
  },
};
