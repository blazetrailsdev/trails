import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./test-case.js";
import * as m1 from "./test-helper.js";

defineConstants([
  [() => m0.TestCase, "ActiveJob::TestCase"],
  [() => m1.TestHelper, "ActiveJob::TestHelper"],
  [() => m1.TestQueueAdapter, "ActiveJob::TestHelper::TestQueueAdapter"],
  [() => m1.ClassMethods, "ActiveJob::TestHelper::TestQueueAdapter::ClassMethods"],
]);
