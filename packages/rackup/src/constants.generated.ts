import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./handler.js";
import * as m1 from "./lobster.js";
import * as m2 from "./server.js";

defineConstants([
  [() => m0.Handler, "Rackup::Handler"],
  [() => m1.Lobster, "Rackup::Lobster"],
  [() => m2.Server, "Rackup::Server"],
  [() => m2.Options, "Rackup::Server::Options"],
]);
