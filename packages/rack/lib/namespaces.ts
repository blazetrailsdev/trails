import { TopLevel } from "@blazetrails/ruby-compat";
import { BadRequest } from "./bad-request.js";
import { Mime } from "./mime.js";
import { QueryParser } from "./query-parser.js";
import * as Utils from "./utils.js";

export const Rack = { name: "Rack", Utils } as { name: string; Utils: typeof Utils } & Record<
  string,
  unknown
>;
Rack.BadRequest = BadRequest;
Rack.Mime = Mime;
Rack.QueryParser = QueryParser;
TopLevel.Rack = Rack;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Rack?: typeof Rack;
  }
}
