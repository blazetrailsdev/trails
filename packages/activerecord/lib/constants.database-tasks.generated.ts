import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./tasks/database-tasks.js";

defineConstants([
  [() => m0, "DatabaseNotSupported", "ActiveRecord::Tasks::DatabaseNotSupported"],
  [() => m0, "DatabaseTasks", "ActiveRecord::Tasks::DatabaseTasks"],
]);
