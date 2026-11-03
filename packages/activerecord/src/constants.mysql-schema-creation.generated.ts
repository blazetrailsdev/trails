import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/mysql/schema-creation.js";

defineConstants([
  [() => m0.SchemaCreation, "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation"],
]);
