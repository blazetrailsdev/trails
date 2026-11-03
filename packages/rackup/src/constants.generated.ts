import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./handler.js";
import * as m1 from "./server.js";

defineConstants([
  [() => m0.Handler, "Rackup::Handler"],
  [() => m1.Server, "Rackup::Server"],
  [() => m1.Options, "Rackup::Server::Options"],
]);
