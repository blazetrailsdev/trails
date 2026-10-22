import { runLoadHooks } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { include, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";
import { TestHelper } from "./test-helper.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase extends ActiveSupportTestCase {
  static override toString(): string {
    return "ActiveJob::TestCase";
  }
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface TestCase extends Omit<TestHelper, "beforeSetup" | "afterTeardown"> {}
include(TestCase, TestHelper);

runLoadHooks("active_job_test_case", TestCase);
rbModConstSet(ActiveJob, "TestCase", TestCase);
