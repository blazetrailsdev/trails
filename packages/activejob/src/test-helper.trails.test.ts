import { describe, expect, it, type TestContext } from "vitest";
import "./queue-adapters/test-adapter.js";
import type { TestAdapter } from "./queue-adapters/test-adapter.js";
import { ArgumentError, registerConstant } from "@blazetrails/ruby-compat";
import { TestCase } from "./test-case.js";
import type { TestHelper } from "./test-helper.js";
import { isAdapterIs } from "./test-helpers/helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

class TestHelperPerformedJobsTest extends TestCase {
  static override toString(): string {
    return "TestHelperPerformedJobsTest";
  }
}
registerConstant("TestHelperPerformedJobsTest", TestHelperPerformedJobsTest);

describe.skipIf(!isAdapterIs("test"))("TestHelperPerformedJobsTest", () => {
  it("restores the adapter settings only after the block settles", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    const adapter = t.queueAdapter() as TestAdapter;
    adapter.performEnqueuedJobs = false;
    let during: unknown;
    await t.performEnqueuedJobs({ queue: "q" }, async () => {
      await Promise.resolve();
      during = [adapter.performEnqueuedJobs, adapter.queue];
    });
    expect(during).toEqual([true, "q"]);
    expect([adapter.performEnqueuedJobs, adapter.queue]).toEqual([false, null]);
  });

  it("flushes enqueued jobs without a block and returns the count", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    const adapter = t.queueAdapter() as TestAdapter;
    adapter.performEnqueuedJobs = false;
    await HelloJob.performLater("a");
    await HelloJob.performLater("b");
    expect(await t.performEnqueuedJobs()).toBe(2);
    expect(JobBuffer.values()).toEqual(["a says hello", "b says hello"]);
    expect(adapter.enqueuedJobs).toHaveLength(0);
    await t.assertPerformedJobs(2);
    await t.assertPerformedWith({ job: HelloJob, args: ["b"] });
  });

  it("raises unknown keyword from every kwarg assertion", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    const bogus = { bogus: 1 } as never;
    const err = new ArgumentError("unknown keyword: :bogus");
    await expect(t.assertEnqueuedJobs(0, bogus)).rejects.toThrow(err);
    await expect(t.assertNoEnqueuedJobs(bogus)).rejects.toThrow(err);
    await expect(t.assertPerformedJobs(0, bogus)).rejects.toThrow(err);
    await expect(t.assertNoPerformedJobs(bogus)).rejects.toThrow(err);
    await expect(t.assertPerformedWith(bogus)).rejects.toThrow(err);
    await expect(t.performEnqueuedJobs(bogus)).rejects.toThrow(err);
  });
});
