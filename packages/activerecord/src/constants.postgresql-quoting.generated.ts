import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/postgresql/quoting.js";

defineConstants([
  [
    () => m0.IntegerOutOf64BitRange,
    "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting::IntegerOutOf64BitRange",
  ],
]);
