import "./test-helpers/helper.js";
import "@blazetrails/activesupport/testing/autorun";
import {
  include,
  rbModAncestors,
  NotImplementedError,
  rbObjIsKindOf,
  registerConstant,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestHost } from "./codegen-runtime.js";
import { QueueAdapters } from "./namespaces.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import { TestAdapter } from "./queue-adapters/test-adapter.js";
import { TestHelper } from "./test-helper.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("ActiveJobTestCaseTest", () => {
  class ActiveJobTestCaseTest extends TestHost {}
  registerConstant("ActiveJobTestCaseTest", ActiveJobTestCaseTest);
  include(ActiveJobTestCaseTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("include helper", async ({ testCase }: any) => {
    expect(
      await rbModAncestors(await (testCase.constructor as typeof ActiveJobTestCaseTest)),
    ).toContain(TestHelper);
  });
  it("set test adapter", async ({ testCase }: any) => {
    const expected: any = await (async () => {
      const caseValue = await await Base.queueAdapterName();
      if (caseValue === "test") {
        return TestAdapter;
      } else if (caseValue === "inline") {
        return InlineAdapter;
      } else if (caseValue === "async") {
        return AsyncAdapter;
      } else if (caseValue === "backburner") {
        return (QueueAdapters as any).BackburnerAdapter;
      } else if (caseValue === "delayed_job") {
        return (QueueAdapters as any).DelayedJobAdapter;
      } else if (caseValue === "queue_classic") {
        return (QueueAdapters as any).QueueClassicAdapter;
      } else if (caseValue === "resque") {
        return (QueueAdapters as any).ResqueAdapter;
      } else if (caseValue === "sidekiq") {
        return (QueueAdapters as any).SidekiqAdapter;
      } else if (caseValue === "sneakers") {
        return (QueueAdapters as any).SneakersAdapter;
      } else if (caseValue === "sucker_punch") {
        return (QueueAdapters as any).SuckerPunchAdapter;
      } else {
        throw new NotImplementedError();
      }
    })();
    expect(rbObjIsKindOf(await testCase.queueAdapter(), expected)).toBe(true);
  });
  it("does not perform enqueued jobs by default", async ({ testCase }: any) => {
    expect((await new TestAdapter().performEnqueuedJobs) ?? null).toBeNull();
  });
});
export class TestClassAttributeInheritanceJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  static setQueueAdapter(...rest: any[]): any {
    throw new RuntimeError("Attempting to break `class_attribute` inheritance, bad!");
  }
}
registerConstant(
  "ActiveJobTestCaseTest::TestClassAttributeInheritanceJob",
  TestClassAttributeInheritanceJob,
);
