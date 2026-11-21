import { TopLevel } from "@blazetrails/ruby-compat";
import type { Error } from "./error.js";

export interface Mysql2Namespace {
  readonly name: string;
  Error: typeof Error;
}

export const Mysql2 = { name: "Mysql2" } as Mysql2Namespace;

TopLevel.Mysql2 = Mysql2;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Mysql2?: typeof Mysql2;
  }
}
