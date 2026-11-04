import { TopLevel } from "@blazetrails/ruby-compat";
import { VERSION } from "./version.js";
import { Handler } from "./handler.js";
import { Lobster } from "./lobster.js";
import { Server } from "./server.js";
import { Stream } from "./stream.js";
import "./handler/node.js";

export { VERSION } from "./version.js";
export { Handler, Lobster, Server, Stream };
export type { ServerOptions } from "./server.js";

const Rackup = { name: "Rackup", VERSION, Handler, Lobster, Server, Stream };
TopLevel.Rackup = Rackup;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Rackup?: typeof Rackup;
  }
}
import "./constants.generated.js";
