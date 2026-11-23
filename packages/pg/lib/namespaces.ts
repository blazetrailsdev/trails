import { TopLevel } from "@blazetrails/ruby-compat";
import type {
  ConnectionBad,
  Error,
  FeatureNotSupported,
  ServerError,
  UnableToSend,
} from "./exceptions.js";
import type { Coder, CompositeCoder } from "./coder.js";
import type { SimpleCoder } from "./simple-coder.js";
import type { Constants } from "./pg.js";
import type { Result } from "./result.js";
import type { Array as TextDecoderArray } from "./text-decoder/array.js";
import type { Integer as TextDecoderInteger } from "./text-decoder/integer.js";
import type { Float as TextDecoderFloat } from "./text-decoder/float.js";
import type { Numeric as TextDecoderNumeric } from "./text-decoder/numeric.js";
import type { Boolean as TextDecoderBoolean } from "./text-decoder/boolean.js";
import type { Bytea as TextDecoderBytea } from "./text-decoder/bytea.js";
import type { Date as TextDecoderDate } from "./text-decoder/date.js";
import type {
  Timestamp as TextDecoderTimestamp,
  TimestampLocal as TextDecoderTimestampLocal,
  TimestampUtc as TextDecoderTimestampUtc,
  TimestampUtcToLocal as TextDecoderTimestampUtcToLocal,
} from "./text-decoder/timestamp.js";
import type { Array as TextEncoderArray } from "./text-encoder/array.js";
import type { Boolean as TextEncoderBoolean } from "./text-encoder/boolean.js";
import type { Integer as TextEncoderInteger } from "./text-encoder/integer.js";
import type { Connection } from "./connection.js";
import type { SimpleDecoder } from "./simple-decoder.js";
import type { SimpleEncoder } from "./simple-encoder.js";
import type { TypeMap } from "./type-map.js";
import type { TypeMapAllStrings } from "./type-map-all-strings.js";
import type { TypeMapByClass } from "./type-map-by-class.js";
import type { TypeMapByOid } from "./type-map-by-oid.js";

export interface PGNamespace {
  readonly name: string;
  Connection: typeof Connection;
  connect: {
    (connParams?: Record<string, unknown>): Promise<Connection>;
    <R>(
      connParams: Record<string, unknown>,
      block: (conn: Connection) => R | Promise<R>,
    ): Promise<R>;
  };
  Constants: typeof Constants;
  ERROR_CLASSES: Record<string, typeof Error>;
  Error: typeof Error;
  ServerError: typeof ServerError;
  UnableToSend: typeof UnableToSend;
  ConnectionBad: typeof ConnectionBad;
  FeatureNotSupported: typeof FeatureNotSupported;
  Coder: typeof Coder;
  SimpleCoder: typeof SimpleCoder;
  CompositeCoder: typeof CompositeCoder;
  SimpleEncoder: typeof SimpleEncoder;
  SimpleDecoder: typeof SimpleDecoder;
  Result: typeof Result;
  TypeMap: typeof TypeMap;
  TypeMapAllStrings: typeof TypeMapAllStrings;
  TypeMapByClass: typeof TypeMapByClass;
  TypeMapByOid: typeof TypeMapByOid;
  readonly TextEncoder: {
    Array: typeof TextEncoderArray;
    Integer: typeof TextEncoderInteger;
    Boolean: typeof TextEncoderBoolean;
  };
  readonly TextDecoder: {
    Array: typeof TextDecoderArray;
    Integer: typeof TextDecoderInteger;
    Float: typeof TextDecoderFloat;
    Numeric: typeof TextDecoderNumeric;
    Boolean: typeof TextDecoderBoolean;
    Bytea: typeof TextDecoderBytea;
    Date: typeof TextDecoderDate;
    Timestamp: typeof TextDecoderTimestamp;
    TimestampUtc: typeof TextDecoderTimestampUtc;
    TimestampUtcToLocal: typeof TextDecoderTimestampUtcToLocal;
    TimestampLocal: typeof TextDecoderTimestampLocal;
    TimestampWithoutTimeZone: typeof TextDecoderTimestampLocal;
    TimestampWithTimeZone: typeof TextDecoderTimestamp;
  };
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

export declare namespace PG {
  export type Connection = import("./connection.js").Connection;
  export type Result = import("./result.js").Result;
  export type Error = import("./exceptions.js").Error;
  export type TypeMap = import("./type-map.js").TypeMap;
  export type TypeMapAllStrings = import("./type-map-all-strings.js").TypeMapAllStrings;
  export type TypeMapByOid = import("./type-map-by-oid.js").TypeMapByOid;
  export type SimpleDecoder = import("./simple-decoder.js").SimpleDecoder;
  export namespace TextEncoder {
    export type Array = import("./text-encoder/array.js").Array;
  }
  export namespace TextDecoder {
    export type Array = import("./text-decoder/array.js").Array;
  }
}
