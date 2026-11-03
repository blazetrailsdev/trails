import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/dbconsole.js";

defineConstants([
  [() => m0.DbconsoleCommand, "Rails::Command::DbconsoleCommand"],
  [() => m0.DBConsole, "Rails::DBConsole"],
]);
