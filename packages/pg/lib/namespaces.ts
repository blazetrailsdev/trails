import { TopLevel } from "@blazetrails/ruby-compat";
import type {
  ConnectionBad,
  Error,
  FeatureNotSupported,
  ServerError,
  UnableToSend,
} from "./exceptions.js";
import type { Constants } from "./pg.js";

export interface PGNamespace extends Readonly<{
  Connection: abstract new (...args: never[]) => object;
}> {
  readonly name: string;
  Constants: typeof Constants;
  Error: typeof Error;
  ServerError: typeof ServerError;
  UnableToSend: typeof UnableToSend;
  ConnectionBad: typeof ConnectionBad;
  FeatureNotSupported: typeof FeatureNotSupported;
}

export const PG = { name: "PG" } as PGNamespace & typeof Constants;

TopLevel.PG = PG;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    PG?: typeof PG;
  }
}
