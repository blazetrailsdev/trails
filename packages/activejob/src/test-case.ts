import { ActiveSupport, runLoadHooks } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { include } from "@blazetrails/ruby-compat";
import { TestHelper } from "./test-helper.js";

export class TestCase extends ActiveSupportTestCase {
  static toString(): string {
    return "ActiveJob::TestCase";
  }
}
export interface TestCase extends Omit<TestHelper, "queueAdapterForTest"> {
  enqueuedJobs: unknown;
  performedJobs: unknown;
  queueAdapterForTest(
    ...args: Parameters<TestHelper["queueAdapterForTest"]>
  ): ReturnType<TestHelper["queueAdapterForTest"]>;
}
include(TestCase, TestHelper);
{
  runLoadHooks("active_job_test_case", TestCase);
}
