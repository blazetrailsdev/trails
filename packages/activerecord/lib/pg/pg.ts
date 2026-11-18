import { TopLevel } from "@blazetrails/activesupport";
import { Connection } from "./connection.js";
import {
  ConnectionBad,
  Constants,
  Error as PGError,
  FeatureNotSupported,
  ServerError,
  UnableToSend,
} from "@blazetrails/pg";
import {
  PG_DIAG_SEVERITY_NONLOCALIZED,
  PG_DIAG_MESSAGE_DETAIL,
  PG_DIAG_MESSAGE_HINT,
  PG_DIAG_STATEMENT_POSITION,
  PG_DIAG_INTERNAL_POSITION,
  PG_DIAG_INTERNAL_QUERY,
  PG_DIAG_CONTEXT,
  PG_DIAG_SOURCE_FILE,
  PG_DIAG_SOURCE_LINE,
  PG_DIAG_SCHEMA_NAME,
  PG_DIAG_TABLE_NAME,
  PG_DIAG_COLUMN_NAME,
  PG_DIAG_DATATYPE_NAME,
  PG_DIAG_CONSTRAINT_NAME,
} from "./exceptions.js";
import { Result as PGResult } from "./result.js";
import { Array as TextDecoderArray } from "./text-decoder/array.js";
import { Array as TextEncoderArray } from "./text-encoder/array.js";

export const PG = {
  get Result(): typeof PGResult {
    return PGResult;
  },
  get Connection(): typeof Connection {
    return Connection;
  },
  connect(connParams: Record<string, unknown>): Promise<Connection> {
    return Connection.connect(connParams);
  },
  Error: PGError,
  ConnectionBad,
  ServerError,
  UnableToSend,
  FeatureNotSupported,
  Constants,
  ...Constants,
  PG_DIAG_SEVERITY_NONLOCALIZED,
  PG_DIAG_MESSAGE_DETAIL,
  PG_DIAG_MESSAGE_HINT,
  PG_DIAG_STATEMENT_POSITION,
  PG_DIAG_INTERNAL_POSITION,
  PG_DIAG_INTERNAL_QUERY,
  PG_DIAG_CONTEXT,
  PG_DIAG_SOURCE_FILE,
  PG_DIAG_SOURCE_LINE,
  PG_DIAG_SCHEMA_NAME,
  PG_DIAG_TABLE_NAME,
  PG_DIAG_COLUMN_NAME,
  PG_DIAG_DATATYPE_NAME,
  PG_DIAG_CONSTRAINT_NAME,
  TextEncoder: { Array: TextEncoderArray },
  TextDecoder: { Array: TextDecoderArray },
};
TopLevel.PG = PG;

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace PG {
  export type Result = PGResult;
  export type Error = PGError;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextEncoder {
    export type Array = TextEncoderArray;
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextDecoder {
    export type Array = TextDecoderArray;
  }
}
