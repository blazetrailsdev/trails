import { beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/helper.js";
import { ConfigurationJob } from "./test-helpers/jobs/configuration-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

type ConfiguredJob = { performNow(): Promise<unknown>; performLater(): Promise<unknown> };

describe("QueuePriorityTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("priority unset by default", () => {
    expect(HelloJob.priority).toBeNull();
  });

  it("uses given priority", () => {
    const originalPriority = HelloJob.priority;

    try {
      HelloJob.queueWithPriority(90);
      expect(new HelloJob().priority).toBe(90);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });

  it("evals block given to priority to determine priority", () => {
    const originalPriority = HelloJob.priority;

    try {
      HelloJob.queueWithPriority(undefined, () => 25);
      expect(new HelloJob().priority).toBe(25);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });

  it("can use arguments to determine priority in priority block", () => {
    const originalPriority = HelloJob.priority;

    try {
      HelloJob.queueWithPriority(undefined, function (this: unknown) {
        return (this as HelloJob).arguments[0] === "1" ? 99 : 11;
      });
      expect(new HelloJob("1").priority).toBe(99);
      expect(new HelloJob("3").priority).toBe(11);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });

  it("is assigned when perform_now", async () => {
    await (ConfigurationJob.set({ priority: 123 }) as ConfiguredJob).performNow();
    const job = JobBuffer.lastValue() as ConfigurationJob;
    expect(job.priority).toBe(123);
  });

  it("is assigned when perform_later", async () => {
    await (ConfigurationJob.set({ priority: 123 }) as ConfiguredJob).performLater();
    const job = JobBuffer.lastValue() as ConfigurationJob;
    expect(job.priority).toBe(123);
  });
});
