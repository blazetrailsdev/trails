import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/mysql2/database-statements.js";

defineConstants([
  [() => m0.DatabaseStatements, "ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements"],
]);
