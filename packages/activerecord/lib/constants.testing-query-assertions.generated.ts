import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./testing/query-assertions.js";

defineConstants([
  [() => m0.QueryAssertions, "ActiveRecord::Assertions::QueryAssertions"],
  [() => m0.SQLCounter, "ActiveRecord::Assertions::QueryAssertions::SQLCounter"],
]);
