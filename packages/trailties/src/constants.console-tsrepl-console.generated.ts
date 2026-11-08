import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/console/tsrepl-console.js";

defineConstants([
  [() => m0.AppInstance, "Trails::Console::AppInstance"],
  [() => m0.ControllerHelper, "Trails::Console::ControllerHelper"],
  [() => m0.ControllerInstance, "Trails::Console::ControllerInstance"],
  [() => m0.NewSession, "Trails::Console::NewSession"],
  [() => m0.ReloadHelper, "Trails::Console::ReloadHelper"],
  [() => m0.RailsHelperBase, "Trails::Console::TrailsHelperBase"],
  [() => m0.TSREPLConsole, "Trails::Console::TSREPLConsole"],
]);
