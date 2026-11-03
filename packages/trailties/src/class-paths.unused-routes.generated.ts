import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/unused-routes.js";

registerClassPaths([
  [() => m0.UnusedRoutesCommand, "Trails::Command::UnusedRoutesCommand"],
  [() => m0.RouteInfo, "Trails::Command::UnusedRoutesCommand::RouteInfo"],
]);
