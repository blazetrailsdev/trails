import { beforeEach, describe, expect, it } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { isAdapterIs } from "./test-helpers/helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

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

  if (!isAdapterIs("inline", "sneakers")) {
    // BLOCKED: port-activejob-test-helper-performed-assertions
    it.skip("retry emits an enqueue retry event", () => {});

    // BLOCKED: port-activejob-test-helper-performed-assertions
    it.skip("retry exhaustion emits a retry_stopped event", () => {});
  }

  // BLOCKED: port-activejob-test-helper-performed-assertions
  it.skip("discard emits a discard event", () => {});
});
