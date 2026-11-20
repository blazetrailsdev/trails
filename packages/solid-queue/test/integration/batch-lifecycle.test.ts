import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Base as ActiveJobBase, performAllLater } from "@blazetrails/activejob";
import { days, seconds } from "@blazetrails/activesupport";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import type { Time } from "@blazetrails/date";
import { RuntimeError, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Batch, Dispatcher, Job, SolidQueue, SolidQueueAdapter, Worker } from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import { AddToBufferJob, JobBuffer } from "../support/add-to-buffer-job.js";
import { JobResult } from "../support/job-result.js";
import { RaisingJob } from "../support/raising-job.js";
import { loadAppSchema } from "../support/queue-schema.js";
import type {} from "../../lib/active-job/batch-id.js";
import {
  silentOnThreadErrorFor,
  waitForBatchesToFinishFor,
  waitForJobsToFinishFor,
} from "../support/jobs-test-helper.js";
import { destroyRecords } from "../test-helper.js";

class FailingJobError extends RuntimeError {}

class BatchedJob extends ApplicationJob {
  declare batch: () => Promise<Batch | null>;
}

class BatchOnSuccessJob extends BatchedJob {
  static {
    this.queueAs("background");
  }

  async perform(customMessage = ""): Promise<void> {
    JobBuffer.add(`${customMessage}: ${(await this.batch())!.completed_jobs} jobs succeeded!`);
  }
}

class BatchOnFailureJob extends BatchedJob {
  static {
    this.queueAs("background");
  }

  async perform(customMessage = ""): Promise<void> {
    JobBuffer.add(`${customMessage}: ${(await this.batch())!.failed_jobs} jobs failed!`);
  }
}

class FailFastJob extends ApplicationJob {
  static {
    this.queueAs("background");
  }

  perform(): void {
    throw new FailingJobError("Failing job");
  }
}

class FailingJob extends ApplicationJob {
  static {
    this.queueAs("background");

    this.retryOn(FailingJobError, { attempts: 3, wait: seconds(0.1) });
  }

  perform(): void {
    throw new FailingJobError("Failing job");
  }
}

class DiscardingJob extends ApplicationJob {
  static {
    this.queueAs("background");

    this.discardOn(FailingJobError);
  }

  perform(): void {
    throw new FailingJobError("Failing job");
  }
}

class AddsMoreJobsJob extends BatchedJob {
  static {
    this.queueAs("background");
  }

  async perform(): Promise<void> {
    await (await this.batch())!.enqueue(async () => {
      await AddToBufferJob.performLater("added from inside 1");
      await AddToBufferJob.performLater("added from inside 2");
      await Batch.enqueue({}, async () => {
        await AddToBufferJob.performLater("added from inside 3");
      });
    });
  }
}

class OnFinishJob extends BatchedJob {
  static {
    this.queueAs("background");
  }

  async perform(): Promise<void> {
    JobBuffer.add(`Hi finish ${(await this.batch())!.id}!`);
  }
}

class OnSuccessJob extends BatchedJob {
  static {
    this.queueAs("background");
  }

  async perform(): Promise<void> {
    JobBuffer.add(`Hi success ${(await this.batch())!.id}!`);
  }
}

class OnFailureJob extends BatchedJob {
  static {
    this.queueAs("background");
  }

  async perform(): Promise<void> {
    JobBuffer.add(`Hi failure ${(await this.batch())!.id}!`);
  }
}

class BatchLifecycleTest {}
constSet(TopLevel, "BatchLifecycleTest", BatchLifecycleTest);
for (const klass of [
  FailingJobError,
  BatchOnSuccessJob,
  BatchOnFailureJob,
  FailFastJob,
  FailingJob,
  DiscardingJob,
  AddsMoreJobsJob,
  OnFinishJob,
  OnSuccessJob,
  OnFailureJob,
])
  constSet(BatchLifecycleTest, klass.name, klass);

function assertFinishedInOrder(...finishables: { finished_at: unknown }[]) {
  for (let i = 0; i + 1 < finishables.length; i++) {
    expect(
      (finishables[i].finished_at as Time).toF() < (finishables[i + 1].finished_at as Time).toF(),
    ).toBe(true);
  }
}

async function jobBang(activeJob: unknown): Promise<Job> {
  return await Job.findByBang({ active_job_id: (activeJob as ActiveJobBase).jobId });
}

function batchJobs(...batches: Batch[]) {
  return Job.where({ batch_id: batches.map((batch) => batch.id) });
}

describe("BatchLifecycleTest", { timeout: 20_000 }, () => {
  let worker: Worker;
  let dispatcher: Dispatcher;
  let onThreadError: typeof SolidQueue.onThreadError;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(() => {
    onThreadError = SolidQueue.onThreadError;
    SolidQueue.onThreadError = silentOnThreadErrorFor(
      [FailingJobError, RaisingJob.DefaultError],
      onThreadError,
    );
    worker = new Worker({ queues: "background", threads: 3 });
    dispatcher = new Dispatcher({
      batchSize: 10,
      pollingInterval: 0.2,
      concurrencyMaintenanceInterval: 1,
    });
  });

  afterEach(async () => {
    SolidQueue.onThreadError = onThreadError;
    await worker.stop();
    await dispatcher.stop();
    travelBack();

    JobBuffer.clear();

    await destroyRecords();
    await Batch.destroyAll();

    ApplicationJob.enqueueAfterTransactionCommit = false;
    SolidQueue.preserveFinishedJobs = true;
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("empty batches fire callbacks", async () => {
    await Batch.enqueue({ onSuccess: new BatchOnSuccessJob("3") }, async () => {
      await Batch.enqueue({ onSuccess: new BatchOnSuccessJob("2") }, async () => {
        await Batch.enqueue({ onSuccess: new BatchOnSuccessJob("1") }, () => {});
        await Batch.enqueue({ onSuccess: new BatchOnSuccessJob("1.1") }, () => {});
      });
    });

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    const expectedValues = [
      "1: 0 jobs succeeded!",
      "1.1: 0 jobs succeeded!",
      "2: 0 jobs succeeded!",
      "3: 0 jobs succeeded!",
    ];
    expect([...JobBuffer.values].sort()).toEqual(expectedValues.sort());
    expect(await Batch.finished().count()).toBe(4);
  });

  it("all jobs are run, including jobs enqueued inside of other jobs", async () => {
    let batch2: Batch | null = null;
    let job1!: unknown, job2!: unknown, job3!: unknown;
    const batch1 = await Batch.enqueue({}, async () => {
      job1 = await AddToBufferJob.performLater("hey");
      batch2 = await Batch.enqueue({}, async () => {
        job2 = await AddToBufferJob.performLater("ho");
        job3 = await AddsMoreJobsJob.performLater();
      });
    });

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);

    expect([...JobBuffer.values].sort()).toEqual([
      "added from inside 1",
      "added from inside 2",
      "added from inside 3",
      "hey",
      "ho",
    ]);
    expect(await Batch.finished().count()).toBe(3);
    await batch2!.reload();
    assertFinishedInOrder(await jobBang(job3), batch2!);
    assertFinishedInOrder(await jobBang(job2), batch2!);
    await batch1.reload();
    assertFinishedInOrder(await jobBang(job1), batch1);
  });

  it("prebuilt jobs capture their batch before enqueue is deferred", async () => {
    ApplicationJob.enqueueAfterTransactionCommit = true;

    const job = new AddToBufferJob("prebuilt");
    expect(job.batchId).toBeNull();

    let batch: Batch | null = null;
    await JobResult.transaction(async () => {
      await JobResult.createBang({ queue_name: "default", status: "" });

      batch = await Batch.enqueue({}, async () => {
        await job.enqueue();
      });

      expect(await Job.findBy({ active_job_id: job.jobId })).toBeNull();
    });

    const persistedJob = await jobBang(job);
    expect(persistedJob.batch_id).toBe(batch!.id);
    await batch!.reload();
    expect(batch!.total_jobs).toBe(1);
    expect(await batch!.batchExecutions.count()).toBe(1);
  });

  it("when self.enqueue_after_transaction_commit = true", async () => {
    ApplicationJob.enqueueAfterTransactionCommit = true;
    let batch1: Batch | null = null;
    let batch2: Batch | null = null;
    let batch3: Batch | null = null;
    let job1!: unknown, job2!: unknown, job3!: unknown;
    await JobResult.transaction(async () => {
      await JobResult.createBang({ queue_name: "default", status: "" });

      batch1 = await Batch.enqueue({}, async () => {
        job1 = await AddToBufferJob.performLater("hey");
        await JobResult.transaction(
          async () => {
            await JobResult.createBang({ queue_name: "default", status: "" });
            batch2 = await Batch.enqueue({}, async () => {
              job2 = await AddToBufferJob.performLater("ho");
              batch3 = await Batch.enqueue({}, async () => {
                job3 = await AddToBufferJob.performLater("let's go");
              });
            });
          },
          { requiresNew: true },
        );
      });
    });

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);

    const jobs = batchJobs(batch1!, batch2!, batch3!);
    expect([...JobBuffer.values].sort()).toEqual(["hey", "ho", "let's go"]);
    expect(await Batch.finished().count()).toBe(3);
    expect(await jobs.finished().count()).toBe(3);
    expect(await jobs.count()).toBe(3);
    for (const batch of [batch1!, batch2!, batch3!]) await batch.reload();
    assertFinishedInOrder(await jobBang(job3), batch3!);
    assertFinishedInOrder(await jobBang(job2), batch2!);
    assertFinishedInOrder(await jobBang(job1), batch1!);
  });

  it("failed jobs fire properly", async () => {
    let batch2: Batch | null = null;
    const batch1 = await Batch.enqueue({ onFailure: new BatchOnFailureJob("0") }, async () => {
      await FailingJob.performLater();
      batch2 = await Batch.enqueue({ onFailure: new BatchOnFailureJob("1") }, async () => {
        await FailingJob.performLater();
      });
    });

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    const jobBatch1 = (await Batch.findBy({ id: batch1.id }))!;
    const jobBatch2 = (await Batch.findBy({ id: batch2!.id }))!;

    expect(await Batch.count()).toBe(2);
    expect(await Batch.finished().count()).toBe(2);

    expect(jobBatch1.total_jobs).toBe(1);
    expect(jobBatch1.failed_jobs).toBe(1);
    expect(jobBatch1.completed_jobs).toBe(0);
    expect(await jobBatch1.pendingJobs()).toBe(0);
    expect(await jobBatch1.jobs.count()).toBe(3);

    expect(jobBatch2.total_jobs).toBe(1);
    expect(jobBatch2.failed_jobs).toBe(1);
    expect(jobBatch2.completed_jobs).toBe(0);
    expect(await jobBatch2.pendingJobs()).toBe(0);
    expect(await jobBatch2.jobs.count()).toBe(3);

    expect((await Batch.all().toArray()).map((batch) => batch.isFailed()).sort()).toEqual([
      true,
      true,
    ]);
    expect([...JobBuffer.values].sort()).toEqual(["0: 1 jobs failed!", "1: 1 jobs failed!"]);
  });

  it("jobs that succeed after retrying count once toward the batch totals", async () => {
    const batch = await Batch.enqueue({}, async () => {
      await RaisingJob.performLater(RaisingJob.DefaultError, "A");
      await AddToBufferJob.performLater("hey");
    });

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    await batch.reload();
    expect(batch.isSucceeded()).toBeTruthy();
    expect(batch.total_jobs).toBe(2);
    expect(batch.completed_jobs).toBe(2);
    expect(batch.failed_jobs).toBe(0);
    expect(await batch.jobs.count()).toBe(3);
  });

  it("executes the same with perform_all_later as it does a normal enqueue", async () => {
    let batch2: Batch | null = null;
    const batch1 = await Batch.enqueue({}, async () => {
      await performAllLater([new FailingJob(), new FailingJob()]);
      batch2 = await Batch.enqueue({}, async () => {
        await performAllLater([new AddToBufferJob("ok"), new AddToBufferJob("ok2")]);
      });
    });

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    await batch1.reload();
    expect(await batch1.jobs.count()).toBe(6);
    expect(batch1.total_jobs).toBe(2);
    expect(await Batch.finished().count()).toBe(2);
    expect(batch1.isFailed()).toBe(true);
    await batch2!.reload();
    expect(await batch2!.jobs.count()).toBe(2);
    expect(batch2!.total_jobs).toBe(2);
    expect(batch2!.isSucceeded()).toBe(true);
  });

  it("discarded jobs fire properly", async () => {
    let batch2: Batch | null = null;
    const batch1 = await Batch.enqueue({ onSuccess: new BatchOnSuccessJob("0") }, async () => {
      await DiscardingJob.performLater();
      batch2 = await Batch.enqueue({ onSuccess: new BatchOnSuccessJob("1") }, async () => {
        await DiscardingJob.performLater();
      });
    });

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    const jobBatch1 = (await Batch.findBy({ id: batch1.id }))!;
    const jobBatch2 = (await Batch.findBy({ id: batch2!.id }))!;

    expect(await Batch.count()).toBe(2);
    expect(await Batch.finished().count()).toBe(2);

    expect(jobBatch1.total_jobs).toBe(1);
    expect(jobBatch1.failed_jobs).toBe(0);
    expect(jobBatch1.completed_jobs).toBe(1);
    expect(await jobBatch1.pendingJobs()).toBe(0);

    expect(jobBatch2.total_jobs).toBe(1);
    expect(jobBatch2.failed_jobs).toBe(0);
    expect(jobBatch2.completed_jobs).toBe(1);
    expect(await jobBatch2.pendingJobs()).toBe(0);

    expect((await Batch.all().toArray()).map((batch) => batch.isSucceeded()).sort()).toEqual([
      true,
      true,
    ]);
    expect([...JobBuffer.values].sort()).toEqual(["0: 1 jobs succeeded!", "1: 1 jobs succeeded!"]);
  });

  it("preserve_finished_jobs = false", async () => {
    SolidQueue.preserveFinishedJobs = false;
    const batch1 = await Batch.enqueue({}, async () => {
      await AddToBufferJob.performLater("hey");
    });

    await batch1.reload();
    expect(batch1.isFinished()).toBe(false);
    expect(await batch1.jobs.count()).toBe(1);
    expect(await batch1.jobs.finished().count()).toBe(0);

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    await batch1.reload();
    expect(batch1.isFinished()).toBe(true);
    expect(await Job.count()).toBe(0);
  });

  it("batch interface", async () => {
    const batch = await Batch.enqueue(
      {
        onFinish: OnFinishJob,
        onSuccess: OnSuccessJob,
        onFailure: OnFailureJob,
        source: "test",
        priority: "high",
        user_id: 123,
      },
      async () => {
        await AddToBufferJob.performLater("hey");
      },
    );

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    expect([...JobBuffer.values].sort()).toEqual(
      [`Hi finish ${batch.id}!`, `Hi success ${batch.id}!`, "hey"].sort(),
    );
    await batch.reload();
    expect(batch.completed_jobs).toBe(1);
    expect(batch.failed_jobs).toBe(0);
    expect(await batch.pendingJobs()).toBe(0);
    expect(batch.total_jobs).toBe(1);
  });

  it("clear finished batches after configured period", async () => {
    for (let i = 0; i < 5; i++)
      await Batch.enqueue({}, async () => {
        await AddToBufferJob.performLater("hey");
      });
    for (let i = 0; i < 5; i++)
      await Batch.enqueue({}, async () => {
        await FailFastJob.performLater();
      });

    await assertNoDifference(
      () => Batch.count(),
      () => Batch.clearFinishedInBatches(),
    );

    await dispatcher.start();
    await worker.start();

    await waitForBatchesToFinishFor(5);
    await waitForJobsToFinishFor(5);

    await assertNoDifference(
      () => Batch.count(),
      () => Batch.clearFinishedInBatches(),
    );

    travelTo(days(3).fromNow() as Time);

    await assertDifference(
      () => Batch.count(),
      -5,
      null,
      () => Batch.clearFinishedInBatches(),
    );

    expect(await Batch.count()).toBe(5);
    expect(await Batch.failed().count()).toBe(5);
  });
});
