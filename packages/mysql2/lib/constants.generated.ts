import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./client.js";
import * as m1 from "./error.js";
import * as m2 from "./result.js";
import * as m3 from "./statement.js";

defineConstants([
  [() => m0, "Client", "Mysql2::Client"],
  [() => m1, "Error", "Mysql2::Error"],
  [() => m1, "Error.ConnectionError", "Mysql2::Error::ConnectionError"],
  [() => m1, "Error.TimeoutError", "Mysql2::Error::TimeoutError"],
  [() => m2, "Result", "Mysql2::Result"],
  [() => m3, "Statement", "Mysql2::Statement"],
]);
