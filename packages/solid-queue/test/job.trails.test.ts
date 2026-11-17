import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { RecordNotUnique } from "@blazetrails/activerecord";
import { RuntimeError } from "@blazetrails/ruby-compat";
import {
  BlockedExecution,
  FailedExecution,
  Job,
  ScheduledExecution,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";

describe("SolidQueue::Job#execution (trails)", () => {
  beforeAll(async () => {
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
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

describe("SolidQueue::Job::Retryable#failed_with (trails)", () => {
  beforeAll(async () => {
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Job.destroyAll();
  });

  it("retries the create when the conflicting failed execution is gone by the lookup", async () => {
    await AddToBufferJob.performLater(1);
    const job = (await Job.last()) as Job;
    const createBang = FailedExecution.createBang.bind(FailedExecution);
    vi.spyOn(FailedExecution, "createBang")
      .mockRejectedValueOnce(new RecordNotUnique("duplicate"))
      .mockImplementation(createBang);

    await job.failedWith(new RuntimeError("boom"));

    expect(await (await job.reload()).isFailed()).toBeTruthy();
    expect(((await job.failedExecution) as FailedExecution).message()).toEqual("boom");
  });
});
