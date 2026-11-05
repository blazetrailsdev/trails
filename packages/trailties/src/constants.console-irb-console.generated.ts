import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/console/irb-console.js";

defineConstants([
  [() => m0.AppInstance, "Rails::Console::IrbConsole::AppInstance"],
  [() => m0.ControllerHelper, "Rails::Console::IrbConsole::ControllerHelper"],
  [() => m0.ControllerInstance, "Rails::Console::IrbConsole::ControllerInstance"],
  [() => m0.NewSession, "Rails::Console::IrbConsole::NewSession"],
  [() => m0.RailsHelperBase, "Rails::Console::IrbConsole::RailsHelperBase"],
  [() => m0.ReloadHelper, "Rails::Console::IrbConsole::ReloadHelper"],
  [() => m0.IRBConsole, "Trails::Console::IRBConsole"],
]);
