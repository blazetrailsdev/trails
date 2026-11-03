import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/server.js";

defineConstants([
  [() => m0.ServerCommand, "Trails::Command::ServerCommand"],
  [() => m0.Server, "Trails::Server"],
  [() => m0.Options, "Trails::Server::Options"],
]);
