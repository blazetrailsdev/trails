import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/unused-routes.js";

registerClassPaths([
  [() => m0.UnusedRoutesCommand, "Rails::Command::UnusedRoutesCommand"],
  [() => m0.RouteInfo, "Rails::Command::UnusedRoutesCommand::RouteInfo"],
]);
