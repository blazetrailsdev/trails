import { TopLevel } from "@blazetrails/ruby-compat";
import * as Utils from "./utils.js";

export const Rack = { name: "Rack", Utils } as { name: string; Utils: typeof Utils } & Record<
  string,
  unknown
>;
TopLevel.Rack = Rack;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Rack?: typeof Rack;
  }
}
