import { PG } from "@blazetrails/pg";
import { Connection } from "./connection.js";
import * as DiagConstants from "./exceptions.js";
import { Result as PGResult } from "./result.js";
import { Array as TextDecoderArray } from "./text-decoder/array.js";
import { Array as TextEncoderArray } from "./text-encoder/array.js";

declare module "@blazetrails/pg" {
  interface PGNamespace extends Readonly<typeof DiagConstants> {
    readonly Result: typeof PGResult;
    readonly Connection: typeof Connection;
    connect(connParams: Record<string, unknown>): Promise<Connection>;
    TextEncoder: { Array: typeof TextEncoderArray };
    TextDecoder: { Array: typeof TextDecoderArray };
  }
}

Object.defineProperties(PG, {
  Result: { get: () => PGResult, configurable: true },
  Connection: { get: () => Connection, configurable: true },
});
PG.connect = (connParams) => Connection.connect(connParams);
Object.assign(PG, DiagConstants);
PG.TextEncoder = { Array: TextEncoderArray };
PG.TextDecoder = { Array: TextDecoderArray };

const _PG = PG;
export { _PG as PG };

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace PG {
  export type Result = PGResult;
  export type Error = import("@blazetrails/pg").Error;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextEncoder {
    export type Array = TextEncoderArray;
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextDecoder {
    export type Array = TextDecoderArray;
  }
}
