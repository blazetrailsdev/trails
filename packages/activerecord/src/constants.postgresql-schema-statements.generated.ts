import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/postgresql/schema-statements.js";

defineConstants([
  [() => m0.SchemaStatements, "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements"],
]);
