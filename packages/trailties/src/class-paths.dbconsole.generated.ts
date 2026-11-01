import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/dbconsole.js";

registerClassPaths([
  [() => m0.DbconsoleCommand, "Rails::Command::DbconsoleCommand"],
  [() => m0.DBConsole, "Rails::DBConsole"],
]);
