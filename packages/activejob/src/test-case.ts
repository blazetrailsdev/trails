// @ts-nocheck
import { ActiveSupport, runLoadHooks } from "@blazetrails/activesupport";
import { include, registerConstant, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";
import { TestHelper } from "./test-helper.js";

export class TestCase extends ActiveSupport.TestCase {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ActiveJob::TestCase", TestCase);
include(TestCase, TestHelper);
{
  runLoadHooks("active_job_test_case", TestCase);
}
rbModConstSet(ActiveJobSeat, "TestCase", TestCase);
