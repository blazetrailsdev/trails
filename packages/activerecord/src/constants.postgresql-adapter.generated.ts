import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/postgresql-adapter.js";

defineConstants([
  [() => m0.PostgreSQLAdapter, "ActiveRecord::ConnectionAdapters::PostgreSQLAdapter"],
  [() => m0.MoneyDecoder, "ActiveRecord::ConnectionAdapters::PostgreSQLAdapter::MoneyDecoder"],
  [() => m0.StatementPool, "ActiveRecord::ConnectionAdapters::PostgreSQLAdapter::StatementPool"],
]);
