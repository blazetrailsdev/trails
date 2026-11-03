import { TopLevel } from "@blazetrails/ruby-compat";
import { VERSION } from "./version.js";
import { Handler } from "./handler.js";
import { Server } from "./server.js";

export { VERSION } from "./version.js";
export { Handler, Server };

const Rackup = { name: "Rackup", VERSION, Handler, Server };
TopLevel.Rackup = Rackup;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Rackup?: typeof Rackup;
  }
}
import "./constants.generated.js";
