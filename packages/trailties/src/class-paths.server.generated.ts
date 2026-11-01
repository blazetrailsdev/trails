import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/server.js";

registerClassPaths([
  [() => m0.ServerCommand, "Rails::Command::ServerCommand"],
  [() => m0.Server, "Rails::Server"],
  [() => m0.Options, "Rails::Server::Options"],
]);
