import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/mysql/schema-definitions.js";

defineConstants([
  [() => m0.ColumnMethods, "ActiveRecord::ConnectionAdapters::MySQL::ColumnMethods"],
  [() => m0.Table, "ActiveRecord::ConnectionAdapters::MySQL::Table"],
  [() => m0.TableDefinition, "ActiveRecord::ConnectionAdapters::MySQL::TableDefinition"],
]);
