import "./test-helpers/helper.js";
import { ConfigurationJob } from "./test-helpers/jobs/configuration-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("QueuePriorityTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("priority unset by default", async () => {
    expect(await HelloJob.priority).toBeNull();
  });

  it("uses given priority", async () => {
    const originalPriority = await HelloJob.priority;
    try {
      HelloJob.queueWithPriority(90);
      expect(await new HelloJob().priority).toEqual(90);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });

  it("evals block given to priority to determine priority", async () => {
    const originalPriority = await HelloJob.priority;
    try {
      await HelloJob.queueWithPriority(undefined, function () {
        return 25;
      });
      expect(await new HelloJob().priority).toEqual(25);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });

  it("can use arguments to determine priority in priority block", async () => {
    const originalPriority = await HelloJob.priority;
    try {
      await HelloJob.queueWithPriority(undefined, function () {
        if (this.arguments[0] === "1") {
          return 99;
        } else {
          return 11;
        }
      });
      expect(await new HelloJob("1").priority).toEqual(99);
      expect(await new HelloJob("3").priority).toEqual(11);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });

  it("is assigned when perform_now", async () => {
    await ConfigurationJob.set({ priority: 123 }).performNow();
    const job = JobBuffer.lastValue();
    expect(await job.priority).toEqual(123);
  });

  it("is assigned when perform_later", async () => {
    await ConfigurationJob.set({ priority: 123 }).performLater();
    const job = JobBuffer.lastValue();
    expect(await job.priority).toEqual(123);
  });
});
