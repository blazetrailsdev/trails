import { beforeEach, describe, it, type TestContext } from "vitest";
import { assertEqual, assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, rbModName, rbObjClass, registerConstant } from "@blazetrails/ruby-compat";
import { QueueAdapters } from "./namespaces.js";
import "./queue-adapters/inline-adapter.js";
import "./queue-adapters/test-adapter.js";
import { TestCase } from "./test-case.js";
import type { TestHelper } from "./test-helper.js";
import { isAdapterIs } from "./test-helpers/helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

class NotTestAdapterTest extends TestCase {
  static override toString(): string {
    return "NotTestAdapterTest";
  }
}
registerConstant("NotTestAdapterTest", NotTestAdapterTest);

class AdapterIsNotTestAdapterTest extends TestCase {
  static override toString(): string {
    return "AdapterIsNotTestAdapterTest";
  }

  override queueAdapterForTest = (): unknown => new QueueAdapters.InlineAdapter();
}
registerConstant("AdapterIsNotTestAdapterTest", AdapterIsNotTestAdapterTest);

describe.skipIf(isAdapterIs("test"))("NotTestAdapterTest", () => {
  let adapter: string | null;
  beforeEach(({ testCase }: TestContext) => {
    adapter = rbModName(rbObjClass((testCase as unknown as TestHelper).queueAdapter()));
  });

  it("assert_enqueued_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_enqueued_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertEnqueuedJobs(0, {}, () => {}),
    );
  });

  it("assert_no_enqueued_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_no_enqueued_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertNoEnqueuedJobs({}, () => {}),
    );
  });

  it("assert_performed_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_performed_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertPerformedJobs(0, {}, () => {}),
    );
  });

  it("assert_no_performed_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_no_performed_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertNoPerformedJobs({}, () => {}),
    );
  });

  it("assert_enqueued_with raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_enqueued_with requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertEnqueuedWith({}, () => {}),
    );
  });

  it("assert_performed_with raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_performed_with requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertPerformedWith({}, () => {}),
    );
  });

  it("perform_enqueued_jobs without a block", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `perform_enqueued_jobs (without a block) requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.performEnqueuedJobs(),
    );
  });

  it("perform_enqueued_jobs with a block does not raise", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() => t.performEnqueuedJobs({}, () => {}));
  });
});

describe("AdapterIsNotTestAdapterTest", () => {
  it("perform enqueued jobs just yields", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    JobBuffer.clear();
    await t.performEnqueuedJobs({}, async () => {
      await HelloJob.performLater("kevin");
    });
    assertEqual(1, JobBuffer.values().length);
  });
});
