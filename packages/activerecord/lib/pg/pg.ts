import { PG } from "@blazetrails/pg";
import { Connection } from "./connection.js";

declare module "@blazetrails/pg" {
  interface PGNamespace {
    readonly Connection: typeof Connection;
    connect(connParams: Record<string, unknown>): Promise<Connection>;
  }
}

Object.defineProperties(PG, {
  Connection: { get: () => Connection, configurable: true },
});
PG.connect = (connParams) => Connection.connect(connParams);

export { PG };

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace PG {
  export type Result = import("@blazetrails/pg").Result;
  export type Error = import("@blazetrails/pg").Error;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextEncoder {
    export type Array = InstanceType<import("@blazetrails/pg").PGNamespace["TextEncoder"]["Array"]>;
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextDecoder {
    export type Array = InstanceType<import("@blazetrails/pg").PGNamespace["TextDecoder"]["Array"]>;
  }
}
