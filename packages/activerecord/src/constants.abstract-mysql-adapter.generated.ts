import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/abstract-mysql-adapter.js";

defineConstants([
  [() => m0.AbstractMysqlAdapter, "ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter"],
  [() => m0.StatementPool, "ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter::StatementPool"],
]);
