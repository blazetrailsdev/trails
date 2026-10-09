import { ConnectionBad, PG_DIAG_SQLSTATE } from "./exceptions.js";
import { Result as PGResult } from "./result.js";
import { Array as TextDecoderArray } from "./text-decoder/array.js";
import { Array as TextEncoderArray } from "./text-encoder/array.js";

export const PG = {
  Result: PGResult,
  ConnectionBad,
  PG_DIAG_SQLSTATE,
  TextEncoder: { Array: TextEncoderArray },
  TextDecoder: { Array: TextDecoderArray },
};
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace PG {
  export type Result = PGResult;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextEncoder {
    export type Array = TextEncoderArray;
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextDecoder {
    export type Array = TextDecoderArray;
  }
}
