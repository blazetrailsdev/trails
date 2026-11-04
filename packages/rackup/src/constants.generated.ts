import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./handler.js";
import * as m1 from "./lobster.js";
import * as m2 from "./server.js";
import * as m3 from "./stream.js";

defineConstants([
  [() => m0.Handler, "Rackup::Handler"],
  [() => m1.Lobster, "Rackup::Lobster"],
  [() => m2.Server, "Rackup::Server"],
  [() => m2.Options, "Rackup::Server::Options"],
  [() => m3.Stream, "Rackup::Stream"],
  [() => m3.Reader, "Rackup::Stream::Reader"],
]);
