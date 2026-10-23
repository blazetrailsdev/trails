import "./test-helpers/helper.js";
import "@blazetrails/activesupport/testing/autorun";
import {
  include,
  rbModAncestors,
  NotImplementedError,
  registerConstant,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import { TestAdapter } from "./queue-adapters/test-adapter.js";
import { TestCase } from "./test-case.js";
import { TestHelper } from "./test-helper.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

class ActiveJobTestCaseTest extends TestCase {}
registerConstant("ActiveJobTestCaseTest", ActiveJobTestCaseTest);
include(ActiveJobTestCaseTest, TestHelper);

describe("ActiveJobTestCaseTest", () => {
  beforeEach<{ testCase: ActiveJobTestCaseTest }>(async ({ testCase }) => {
    await testCase.setup();
  });
  afterEach<{ testCase: ActiveJobTestCaseTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });
  it<{ testCase: ActiveJobTestCaseTest }>("include helper", async ({ testCase }) => {
    expect(
      await rbModAncestors(await (testCase.constructor as typeof ActiveJobTestCaseTest)),
    ).toContainEqual(TestHelper);
  });
  it<{ testCase: ActiveJobTestCaseTest }>("set test adapter", async ({ testCase }) => {
    let expected = await (async () => {
      const caseValue = await Base.queueAdapterName;
      if (caseValue === "test") {
        return TestAdapter;
      } else if (caseValue === "inline") {
        return InlineAdapter;
      } else if (caseValue === "async") {
        return AsyncAdapter;
      } else if (caseValue === "backburner") {
        return undefined;
      } else if (caseValue === "delayed_job") {
        return undefined;
      } else if (caseValue === "queue_classic") {
        return undefined;
      } else if (caseValue === "resque") {
        return undefined;
      } else if (caseValue === "sidekiq") {
        return undefined;
      } else if (caseValue === "sneakers") {
        return undefined;
      } else if (caseValue === "sucker_punch") {
        return undefined;
      } else {
        throw new NotImplementedError();
      }
    })();
    expect(testCase.queueAdapter()).toBeInstanceOf(expected);
  });
  it<{ testCase: ActiveJobTestCaseTest }>("does not perform enqueued jobs by default", async ({
    testCase,
  }) => {
    expect(new TestAdapter().performEnqueuedJobs).toBeNull();
  });
});
export class TestClassAttributeInheritanceJob extends Base {
  static toString(): string {
    return "ActiveJobTestCaseTest::TestClassAttributeInheritanceJob";
  }

  static setQueueAdapter(...rest: unknown[]) {
    throw new RuntimeError("Attempting to break `class_attribute` inheritance, bad!");
  }
}
registerConstant(
  "ActiveJobTestCaseTest::TestClassAttributeInheritanceJob",
  TestClassAttributeInheritanceJob,
);
