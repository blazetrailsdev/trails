import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/sqlite3/schema-dumper.js";

defineConstants([
  [() => m0.SchemaDumper, "ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper"],
]);
