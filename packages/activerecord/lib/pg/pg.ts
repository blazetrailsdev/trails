import { PG } from "@blazetrails/pg";

export { PG };

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace PG {
  export type Connection = import("@blazetrails/pg").Connection;
  export type Result = import("@blazetrails/pg").Result;
  export type Error = import("@blazetrails/pg").Error;
  export type TypeMapByOid = import("@blazetrails/pg").TypeMapByOid;
  export type SimpleDecoder = import("@blazetrails/pg").SimpleDecoder;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextEncoder {
    export type Array = InstanceType<import("@blazetrails/pg").PGNamespace["TextEncoder"]["Array"]>;
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace TextDecoder {
    export type Array = InstanceType<import("@blazetrails/pg").PGNamespace["TextDecoder"]["Array"]>;
  }
}
