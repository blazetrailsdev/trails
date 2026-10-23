import { beforeEach, describe, expect, it, type TestContext } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { include, registerConstant } from "@blazetrails/ruby-compat";
import { TestHelper } from "./test-helper.js";
import { isAdapterIs } from "./test-helpers/helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { RetryJob } from "./test-helpers/jobs/retry-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

class InstrumentationTest extends TestCase {
  static override toString(): string {
    return "InstrumentationTest";
  }
}
include(InstrumentationTest, TestHelper);
registerConstant("InstrumentationTest", InstrumentationTest);

async function subscribed(name: string | RegExp, block: () => unknown): Promise<unknown[][]> {
  const events: unknown[][] = [];
  await Notifications.subscribed((...args: unknown[]) => void events.push(args), name, block);
  return events;
}

describe("InstrumentationTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("perform_now emits perform events", async () => {
    const events = await subscribed(/perform.*\.active_job/, () => HelloJob.performNow("World!"));
    expect(events.length).toBe(2);
    expect(events[0][0]).toBe("perform_start.active_job");
    expect(events[1][0]).toBe("perform.active_job");
  });

  it("perform_later emits an enqueue event", async () => {
    const events = await subscribed("enqueue.active_job", () => HelloJob.performLater("World!"));
    expect(events.length).toBe(1);
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "retry emits an enqueue retry event",
    async ({ testCase }: TestContext) => {
      const t = testCase as unknown as TestHelper;
      const events = await subscribed("enqueue_retry.active_job", () =>
        t.performEnqueuedJobs({}, () => RetryJob.performLater("DefaultsError", 2)),
      );
      expect(events.length).toBe(1);
    },
  );

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "retry exhaustion emits a retry_stopped event",
    async ({ testCase }: TestContext) => {
      const t = testCase as unknown as TestHelper;
      const events = await subscribed("retry_stopped.active_job", () =>
        t.performEnqueuedJobs({}, () => RetryJob.performLater("CustomCatchError", 6)),
      );
      expect(events.length).toBe(1);
    },
  );

  it("discard emits a discard event", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    const events = await subscribed("discard.active_job", () =>
      t.performEnqueuedJobs({}, () => RetryJob.performLater("DiscardableError", 2)),
    );
    expect(events.length).toBe(1);
  });
});
