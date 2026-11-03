import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/console.js";

registerClassPaths([
  [() => m0.ConsoleCommand, "Trails::Command::ConsoleCommand"],
  [() => m0.Console, "Trails::Console"],
]);
