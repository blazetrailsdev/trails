import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/postgresql/utils.js";

defineConstants([
  [() => m0.Name, "ActiveRecord::ConnectionAdapters::PostgreSQL::Name"],
  [() => m0.Utils, "ActiveRecord::ConnectionAdapters::PostgreSQL::Utils"],
]);
