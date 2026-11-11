import { describe, it, type TestContext } from "vitest";
import {
  assertIncludes,
  assertKindOf,
  assertNil,
} from "@blazetrails/activesupport/testing/assertions";
import { NotImplementedError, rbModAncestors, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../lib/base.js";
import { ActiveJob, QueueAdapters } from "../lib/namespaces.js";
import "../lib/queue-adapters/async-adapter.js";
import "../lib/queue-adapters/inline-adapter.js";
import "../lib/queue-adapters/test-adapter.js";
import { TestCase } from "../lib/test-case.js";
import "./helper.js";
import "./jobs/hello-job.js";

class ActiveJobTestCaseTest extends TestCase {
  static override toString(): string {
    return "ActiveJobTestCaseTest";
  }
}
constSet(TopLevel, "ActiveJobTestCaseTest", ActiveJobTestCaseTest);

class TestClassAttributeInheritanceJob extends Base {
  static override set queueAdapter(_: unknown) {
    throw new Error("Attempting to break `class_attribute` inheritance, bad!");
  }
}
void TestClassAttributeInheritanceJob;

describe("ActiveJobTestCaseTest", () => {
  it("include helper", ({ testCase }: TestContext) => {
    assertIncludes(rbModAncestors(testCase.constructor as typeof TestCase), ActiveJob.TestHelper);
  });

  it("set test adapter", ({ testCase }: TestContext) => {
    const queueAdapters = QueueAdapters as unknown as Record<string, new () => object>;
    let expected: new () => object;
    switch (ActiveJob.Base.queueAdapterName) {
      case "test":
        expected = queueAdapters.TestAdapter;
        break;
      case "inline":
        expected = queueAdapters.InlineAdapter;
        break;
      case "async":
        expected = queueAdapters.AsyncAdapter;
        break;
      case "backburner":
        expected = queueAdapters.BackburnerAdapter;
        break;
      case "delayed_job":
        expected = queueAdapters.DelayedJobAdapter;
        break;
      case "queue_classic":
        expected = queueAdapters.QueueClassicAdapter;
        break;
      case "resque":
        expected = queueAdapters.ResqueAdapter;
        break;
      case "sidekiq":
        expected = queueAdapters.SidekiqAdapter;
        break;
      case "sneakers":
        expected = queueAdapters.SneakersAdapter;
        break;
      case "sucker_punch":
        expected = queueAdapters.SuckerPunchAdapter;
        break;
      default:
        throw new NotImplementedError();
    }

    assertKindOf(expected, (testCase as ActiveJobTestCaseTest).queueAdapter());
  });

  it("does not perform enqueued jobs by default", () => {
    assertNil(new QueueAdapters.TestAdapter().performEnqueuedJobs);
  });
});
