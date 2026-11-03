import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/postgresql/schema-dumper.js";

defineConstants([
  [() => m0.SchemaDumper, "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper"],
]);
