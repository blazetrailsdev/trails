import { TopLevel } from "@blazetrails/ruby-compat";
import type {
  ConnectionBad,
  Error,
  FeatureNotSupported,
  ServerError,
  UnableToSend,
} from "./exceptions.js";
import type { Coder, CompositeCoder } from "./coder.js";
import type { Constants } from "./pg.js";
import type { Result } from "./result.js";
import type { Array as TextDecoderArray } from "./text-decoder/array.js";
import type { Array as TextEncoderArray } from "./text-encoder/array.js";

export interface PGNamespace extends Readonly<{
  Connection: { readonly prototype: object; [Symbol.hasInstance](value: unknown): boolean };
}> {
  readonly name: string;
  Constants: typeof Constants;
  Error: typeof Error;
  ServerError: typeof ServerError;
  UnableToSend: typeof UnableToSend;
  ConnectionBad: typeof ConnectionBad;
  FeatureNotSupported: typeof FeatureNotSupported;
  Coder: typeof Coder;
  CompositeCoder: typeof CompositeCoder;
  Result: typeof Result;
  readonly TextEncoder: { Array: typeof TextEncoderArray };
  readonly TextDecoder: { Array: typeof TextDecoderArray };
}

export const PG = {
  name: "PG",
  TextEncoder: {},
  TextDecoder: {},
} as PGNamespace & typeof Constants;

TopLevel.PG = PG;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    PG?: typeof PG;
  }
}
