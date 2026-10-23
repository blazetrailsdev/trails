import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BlockedExecution, Job, ScheduledExecution, SolidQueueAdapter } from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { AddToBufferJob } from "./test-helpers/add-to-buffer-job.js";
import { loadQueueSchema } from "./test-helpers/queue-schema.js";

describe("SolidQueue::Job#execution (trails)", () => {
  beforeAll(async () => {
    await loadQueueSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
  });

  afterEach(async () => {
    await Job.destroyAll();
  });

  it("reads the scheduled execution before the blocked one, as Job's ancestors order them", async () => {
    await AddToBufferJob.performLater(1);
    const job = (await Job.last()) as Job;
    await (await job.readyExecution)!.destroyBang();
    await job.updateBang({ concurrency_key: "AddToBufferJob/1" });
    await BlockedExecution.createBang({ job_id: job.id });
    await ScheduledExecution.createBang({ job_id: job.id, scheduled_at: job.scheduled_at });

    expect(await (await job.reload()).status()).toBe("scheduled");
  });
});
