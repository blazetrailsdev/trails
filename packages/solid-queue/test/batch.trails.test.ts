import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import { Batch, Job, SolidQueueAdapter } from "../lib/index.js";
import type {} from "../lib/active-job/batch-id.js";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";

describe("ActiveJob::BatchId#initialize (trails)", () => {
  beforeAll(() => {
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
  });

  afterEach(async () => {
    await Job.destroyAll();
    await Batch.destroyAll();
  });

  it("seeds the batch of a job built inside the batch block", async () => {
    let job!: AddToBufferJob;
    const batch = await Batch.enqueue({}, async () => {
      job = new AddToBufferJob("built inside");
      await AddToBufferJob.performLater("enqueued inside");
    });
    expect(job.batchId).toBe(batch.id);
    expect(new AddToBufferJob("built outside").batchId).toBeNull();
  });
});
