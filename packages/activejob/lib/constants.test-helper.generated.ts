import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./test-helper.js";

defineConstants([
  [() => m0.TestHelper, "ActiveJob::TestHelper"],
  [() => m0.TestQueueAdapter, "ActiveJob::TestHelper::TestQueueAdapter"],
  [() => m0.ClassMethods, "ActiveJob::TestHelper::TestQueueAdapter::ClassMethods"],
]);
