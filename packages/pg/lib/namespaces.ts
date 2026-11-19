import { TopLevel } from "@blazetrails/ruby-compat";
import type {
  ConnectionBad,
  Error,
  FeatureNotSupported,
  ServerError,
  UnableToSend,
} from "./exceptions.js";
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
  Result: typeof Result;
  TextEncoder: { Array: typeof TextEncoderArray };
  TextDecoder: { Array: typeof TextDecoderArray };
}

export const PG = { name: "PG" } as PGNamespace & typeof Constants;

TopLevel.PG = PG;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    PG?: typeof PG;
  }
}
