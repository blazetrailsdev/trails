import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/postgresql/schema-definitions.js";

defineConstants([
  [() => m0.AlterTable, "ActiveRecord::ConnectionAdapters::PostgreSQL::AlterTable"],
  [() => m0.ColumnMethods, "ActiveRecord::ConnectionAdapters::PostgreSQL::ColumnMethods"],
  [
    () => m0.ExclusionConstraintDefinition,
    "ActiveRecord::ConnectionAdapters::PostgreSQL::ExclusionConstraintDefinition",
  ],
  [() => m0.Table, "ActiveRecord::ConnectionAdapters::PostgreSQL::Table"],
  [() => m0.TableDefinition, "ActiveRecord::ConnectionAdapters::PostgreSQL::TableDefinition"],
  [
    () => m0.UniqueConstraintDefinition,
    "ActiveRecord::ConnectionAdapters::PostgreSQL::UniqueConstraintDefinition",
  ],
]);
