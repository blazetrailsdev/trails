import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/console.js";

defineConstants([
  [() => m0.ConsoleCommand, "Rails::Command::ConsoleCommand"],
  [() => m0.Console, "Rails::Console"],
]);
