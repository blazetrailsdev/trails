import { TopLevel } from "@blazetrails/ruby-compat/object";
import { BadRequest } from "./bad-request.js";
import { Mime } from "./mime.js";
import { QueryParser } from "./query-parser.js";
import * as Utils from "./utils.js";

/** @noRailsEquivalent PERMANENT */
export interface RackNamespace extends Record<string, unknown> {
  name: string;
  Utils: typeof Utils;
}

export const Rack = { name: "Rack", Utils } as RackNamespace;
Rack.BadRequest = BadRequest;
Rack.Mime = Mime;
Rack.QueryParser = QueryParser;
TopLevel.Rack = Rack;

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    Rack?: typeof Rack;
  }
}
