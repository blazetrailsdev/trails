import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/dbconsole.js";

registerClassPaths([
  [() => m0.DbconsoleCommand, "Trails::Command::DbconsoleCommand"],
  [() => m0.DBConsole, "Trails::DBConsole"],
]);
