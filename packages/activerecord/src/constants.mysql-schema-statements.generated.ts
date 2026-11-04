import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/mysql/schema-statements.js";

defineConstants([
  [() => m0.SchemaStatements, "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements"],
]);
