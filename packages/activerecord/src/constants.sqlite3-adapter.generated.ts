import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/sqlite3-adapter.js";

defineConstants([
  [() => m0.SQLite3Adapter, "ActiveRecord::ConnectionAdapters::SQLite3Adapter"],
  [() => m0.SQLite3Integer, "ActiveRecord::ConnectionAdapters::SQLite3Adapter::SQLite3Integer"],
  [() => m0.StatementPool, "ActiveRecord::ConnectionAdapters::SQLite3Adapter::StatementPool"],
]);
