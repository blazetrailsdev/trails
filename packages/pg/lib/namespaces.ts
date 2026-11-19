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
import type { Boolean as TextEncoderBoolean } from "./text-encoder/boolean.js";
import type { Integer as TextEncoderInteger } from "./text-encoder/integer.js";
import type { Connection } from "./connection.js";
import type { SimpleDecoder } from "./simple-decoder.js";
import type { SimpleEncoder } from "./simple-encoder.js";
import type { TypeMapByClass } from "./type-map-by-class.js";
import type { TypeMapByOid } from "./type-map-by-oid.js";

export interface PGNamespace {
  readonly name: string;
  Connection: typeof Connection;
  connect(connParams?: Record<string, unknown>): Promise<Connection>;
  Constants: typeof Constants;
  Error: typeof Error;
  ServerError: typeof ServerError;
  UnableToSend: typeof UnableToSend;
  ConnectionBad: typeof ConnectionBad;
  FeatureNotSupported: typeof FeatureNotSupported;
  Coder: typeof Coder;
  CompositeCoder: typeof CompositeCoder;
  SimpleEncoder: typeof SimpleEncoder;
  SimpleDecoder: typeof SimpleDecoder;
  Result: typeof Result;
  TypeMapByClass: typeof TypeMapByClass;
  TypeMapByOid: typeof TypeMapByOid;
  readonly TextEncoder: {
    Array: typeof TextEncoderArray;
    Integer: typeof TextEncoderInteger;
    Boolean: typeof TextEncoderBoolean;
  };
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
