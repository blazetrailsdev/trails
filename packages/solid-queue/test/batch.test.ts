import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { Deadlocked } from "@blazetrails/activerecord";
import { ActiveJob, performAllLater } from "@blazetrails/activejob";
import {
  cattrAccessor,
  Notifications,
  objectWith,
  seconds,
  sole,
} from "@blazetrails/activesupport";
import { travel } from "@blazetrails/activesupport/testing/time-helpers";
import { Trails } from "@blazetrails/trailties";
import { Time } from "@blazetrails/date";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import { TestCase } from "@blazetrails/activesupport/test-case";
import {
  Concurrent,
  NameError,
  Queue,
  Thread,
  constGet,
  constSet,
  kernelThrow,
  rbFSleep,
  rbModAncestors,
  rbModName,
} from "@blazetrails/ruby-compat";
import {
  Batch,
  BatchExecution,
  ClaimedExecution,
  Job,
  Process,
  ReadyExecution,
  Record,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { BatchCompletionJob } from "./support/batch-completion-job.js";
import { DiscardableUpdateResultJob } from "./support/discardable-update-result-job.js";
import { ExpectedTestError } from "./support/expected-test-error.js";
import { JobResult } from "./support/job-result.js";
import { NonOverlappingUpdateResultJob } from "./support/non-overlapping-update-result-job.js";
import { loadAppSchema } from "./support/queue-schema.js";

class BatchWithArgumentsJob extends ApplicationJob {
  declare batch: () => Promise<Batch | null>;

  async perform(arg1: unknown, arg2: unknown): Promise<void> {
    Trails.logger?.info(`Hi ${(await this.batch())!.id}, ${arg1}, ${arg2}!`);
  }
}

class NiceJob extends ApplicationJob {
  declare batch: () => Promise<Batch | null>;

  static {
    this.retryOn(Error, { wait: seconds(1) });
  }

  perform(arg: unknown): void {
    Trails.logger?.info(`Hi ${arg}!`);
  }
}

class OtherAdapterCallbackJob extends ApplicationJob {
  static {
    this.queueAdapter = "test";
  }

  perform(): void {}
}

class HookedCallbackJob extends ApplicationJob {
  declare static enqueueHookRan: boolean;

  static {
    cattrAccessor.call(this, "enqueueHookRan", { default: false });
    this.beforeEnqueue(function (this: HookedCallbackJob) {
      (this.constructor as typeof HookedCallbackJob).enqueueHookRan = true;
    });
  }

  perform(): void {}
}

class AbortingCallbackJob extends ApplicationJob {
  static {
    this.beforeEnqueue(() => kernelThrow(":abort"));
  }

  perform(): void {}
}

async function performForOutcome(outcome: string, perform: Promise<unknown>): Promise<void> {
  if (outcome === "failed") {
    await expect(perform).rejects.toThrow(ExpectedTestError);
  } else {
    await assertNothingRaised(() => perform);
  }
}

async function checkJobForOutcome(outcome: string, job: Job): Promise<void> {
  if (outcome === "destroyed") {
    expect(await Job.isExists(job.id)).toBeFalsy();
  } else {
    expect(await (await job.reload()).status()).toBe(outcome);
  }
}

class BatchTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(constGet(Object, "SolidQueue") as object, "BatchTest", BatchTest);
for (const klass of [
  BatchWithArgumentsJob,
  NiceJob,
  OtherAdapterCallbackJob,
  HookedCallbackJob,
  AbortingCallbackJob,
])
  constSet(BatchTest, klass.name, klass);

describe("SolidQueue::BatchTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  afterEach(async () => {
    await Job.destroyAll();
    await Batch.destroyAll();
  });

  it("batch will be completed on success", async () => {
    const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, () => {});
    const jobBatch = (await Batch.findBy({ id: batch.id }))!;
    expect(jobBatch.on_finish).not.toBeNull();
    expect(jobBatch.on_finish!["job_class"]).toBe(BatchCompletionJob.name);
  });

  it("batch will be completed on finish", async () => {
    const batch = await Batch.enqueue({ onSuccess: BatchCompletionJob }, () => {});
    const jobBatch = (await Batch.findBy({ id: batch.id }))!;
    expect(jobBatch.on_success).not.toBeNull();
    expect(jobBatch.on_success!["job_class"]).toBe(BatchCompletionJob.name);
  });

  it("sets the batch_id on jobs created inside of the enqueue block", async () => {
    const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, async () => {
      await NiceJob.performLater("world");
      await NiceJob.performLater("people");
    });

    expect(await Job.count()).toBe(2);
    expect((await Job.last(2)).map((job) => job.batch_id)).toEqual([batch.id, batch.id]);
  });

  it("batch id is present inside the block", async () => {
    expect(Batch.currentBatchId()).toBeNull();
    await Batch.enqueue({ onFinish: BatchCompletionJob }, () => {
      expect(Batch.currentBatchId()).not.toBeNull();
    });
    expect(Batch.currentBatchId()).toBeNull();
  });

  it("allow arguments and options for callbacks", async () => {
    await Batch.enqueue(
      { onFinish: new BatchWithArgumentsJob(1, 2).set({ queue: "batch" }) },
      async () => {
        await NiceJob.performLater("world");
      },
    );

    expect(((await Batch.last()) as Batch).on_finish!["arguments"]).not.toBeNull();
    expect(((await Batch.last()) as Batch).on_finish!["arguments"]).toEqual([1, 2]);
    expect(((await Batch.last()) as Batch).on_finish!["queue_name"]).toBe("batch");
  });

  it("creates batch with metadata", async () => {
    await Batch.enqueue({ source: "test", priority: "high", user_id: 123 }, async () => {
      await NiceJob.performLater("world");
    });

    expect(((await Batch.last()) as Batch).metadata).not.toBeNull();
    expect(((await Batch.last()) as Batch).metadata.get("source")).toBe("test");
    expect(((await Batch.last()) as Batch).metadata.get("priority")).toBe("high");
    expect(((await Batch.last()) as Batch).metadata.get("user_id")).toBe(123);
  });

  it("merges an explicit metadata hash with extra keyword arguments", async () => {
    await Batch.enqueue({ metadata: { source: "test" }, user_id: 123 }, async () => {
      await NiceJob.performLater("world");
    });

    expect(((await Batch.last()) as Batch).metadata.get("source")).toBe("test");
    expect(((await Batch.last()) as Batch).metadata.get("user_id")).toBe(123);
  });

  it("creates batch with description", async () => {
    await Batch.enqueue(
      { description: "Process user imports for account 123", onFinish: BatchCompletionJob },
      async () => {
        await NiceJob.performLater("world");
      },
    );

    expect(((await Batch.last()) as Batch).description).toBe(
      "Process user imports for account 123",
    );
  });

  it("instance enqueue with preset attributes", async () => {
    const batch = new Batch();
    batch.description = "My batch";
    batch.setOnFinish(BatchCompletionJob);
    await batch.enqueue(async () => {
      await NiceJob.performLater("world");
    });

    expect(batch.description).toBe("My batch");
    expect(batch.on_finish!["job_class"]).toBe(BatchCompletionJob.name);
    expect(await batch.jobs.count()).toBe(1);
    expect(batch.isEnqueued()).toBeTruthy();
  });

  it("cannot enqueue finished batch", async () => {
    const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, async () => {
      await NiceJob.performLater("world");
    });

    await batch.updateColumns({ finished_at: Time.current() });

    await expect(
      batch.enqueue(async () => {
        await NiceJob.performLater("another");
      }),
    ).rejects.toThrow(Batch.AlreadyFinished);
  });

  it("can add jobs to running batch", async () => {
    const batch = await Batch.enqueue(
      { description: "Original", onFinish: BatchCompletionJob },
      async () => {
        await NiceJob.performLater("first");
      },
    );

    expect(batch.isEnqueued()).toBeTruthy();
    expect(await batch.jobs.count()).toBe(1);

    await batch.enqueue(async () => {
      await NiceJob.performLater("second");
    });

    expect(await batch.jobs.count()).toBe(2);
  });

  it("callback jobs run their Active Job enqueue callbacks", async () => {
    HookedCallbackJob.enqueueHookRan = false;
    const batch = await Batch.enqueue({ onFinish: HookedCallbackJob }, async () => {
      await NiceJob.performLater("world");
    });

    await (await batch.jobs.sole()).finishedBang();

    expect((await batch.reload()).isFinished()).toBeTruthy();
    expect(HookedCallbackJob.enqueueHookRan).toBeTruthy();
    expect(await Job.where({ class_name: rbModName(HookedCallbackJob) }).count()).toBe(1);
  });

  it("callback jobs honor an aborting before_enqueue without breaking completion", async () => {
    const batch = await Batch.enqueue({ onFinish: AbortingCallbackJob }, async () => {
      await NiceJob.performLater("world");
    });

    await (await batch.jobs.sole()).finishedBang();

    expect((await batch.reload()).isFinished()).toBeTruthy();
    expect(await Job.where({ class_name: rbModName(AbortingCallbackJob) }).count()).toBe(0);
  });

  it("callback jobs enqueue through solid_queue regardless of their class adapter", async () => {
    const batch = await Batch.enqueue({ onFinish: OtherAdapterCallbackJob }, async () => {
      await NiceJob.performLater("world");
    });

    await (await batch.jobs.sole()).finishedBang();

    expect((await batch.reload()).isFinished()).toBeTruthy();
    expect(await Job.where({ class_name: rbModName(OtherAdapterCallbackJob) }).count()).toBe(1);
  });

  for (const outcome of ["finished", "failed", "destroyed"] as const) {
    for (const errorClass of [Job.EnqueueError, Deadlocked, NameError]) {
      it(`batch completion ${rbModName(errorClass)} does not prevent ${outcome} jobs from unblocking the next job`, async () => {
        const result = await JobResult.createBang({ queue_name: "default", status: "" });
        const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, async () => {
          await NonOverlappingUpdateResultJob.performLater(result, {
            name: "A",
            exception: outcome === "failed" ? ExpectedTestError : null,
          });
        });
        const job = await batch.jobs.sole();
        const nextActiveJob = await NonOverlappingUpdateResultJob.performLater(result, {
          name: "B",
        });
        const nextJob = await Job.findByBang({ active_job_id: (nextActiveJob as NiceJob).jobId });
        const process = await Process.register({ kind: "Worker", pid: 42, name: "worker-123" });
        const claimedExecution = sole(await ReadyExecution.claim(job.queue_name, 1, process.id));
        const callbackError = new errorClass("batch callback failed");
        const events: Array<{ payload: { [key: string]: unknown } }> = [];

        expect(await nextJob.isBlocked()).toBeTruthy();
        const stub = vi
          .spyOn(Batch.prototype, "enqueueCallbackJobs")
          .mockRejectedValue(callbackError);

        await objectWith(
          SolidQueue,
          { preserveFinishedJobs: outcome !== "destroyed" },
          async () => {
            await Notifications.subscribed(
              (event: unknown) => {
                events.push(event as { payload: { [key: string]: unknown } });
              },
              "batch_progress_error.solid_queue",
              async () => {
                await performForOutcome(outcome, claimedExecution.perform());
              },
            );
          },
        );

        expect(await ClaimedExecution.isExists(claimedExecution.id)).toBeFalsy();
        await checkJobForOutcome(outcome, job);
        expect(await (await nextJob.reload()).isReady()).toBeTruthy();
        expect(await nextJob.isBlocked()).toBeFalsy();
        expect((await Semaphore.findByBang({ key: job.concurrency_key })).value).toBe(0);
        expect((await batch.reload()).isFinished()).toBeFalsy();
        expect(await batch.batchExecutions.toArray()).toBeEmpty();
        expect(await Job.where({ class_name: BatchCompletionJob.name }).count()).toBe(0);
        expect(events.length).toBe(1);
        expect(events[0].payload["batch_id"]).toBe(batch.id);
        expect(events[0].payload["job_id"]).toBe(job.id);
        expect(events[0].payload["error"]).toBe(callbackError);

        stub.mockRestore();
        await Batch.sweepStalled();

        expect((await batch.reload()).isFinished()).toBeTruthy();
        expect(await batch.failedJobs()).toBe(outcome === "failed" ? 1 : 0);
        expect(await Job.where({ class_name: BatchCompletionJob.name }).count()).toBe(1);
      });
    }
  }

  it("assigns a reserved active_job_batch_id on create", async () => {
    const batch = await Batch.enqueue({}, async () => {
      await NiceJob.performLater("world");
    });

    expect(batch.active_job_batch_id).toBeTruthy();
  });

  it("cannot enqueue when the batch was finished concurrently", async () => {
    const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, async () => {
      await NiceJob.performLater("world");
    });

    const stale = await Batch.find(batch.id);
    await Batch.where({ id: batch.id }).updateAll({ finished_at: Time.current() });

    await expect(
      stale.enqueue(async () => {
        await NiceJob.performLater("another");
      }),
    ).rejects.toThrow(Batch.AlreadyFinished);
  });

  it("jobs enqueued inside the block join the batch even when instantiated outside", async () => {
    const job = new NiceJob("outside");

    const batch = await Batch.enqueue({}, async () => {
      await job.enqueue();
    });

    expect((await Job.findByBang({ active_job_id: job.jobId })).batch_id).toBe(batch.id);
  });

  it("jobs instantiated inside the block keep its batch when enqueued outside any context", async () => {
    let job: NiceJob | null = null;
    const batch = await Batch.enqueue({}, async () => {
      await NiceJob.performLater("anchor");
      job = new NiceJob("inside");
    });

    await job!.enqueue();

    expect((await Job.findByBang({ active_job_id: job!.jobId })).batch_id).toBe(batch.id);
  });

  it("in-flight counters do not double count failed jobs", async () => {
    const batch = await Batch.enqueue({}, async () => {
      for (let i = 0; i < 3; i++) await NiceJob.performLater(i);
    });

    const jobs = await batch.jobs.order("id").toArray();
    await jobs[0].failedWith(new Error("boom"));

    await batch.reload();
    expect(batch.total_jobs).toBe(3);
    expect(await batch.pendingJobs()).toBe(2);
    expect(await batch.failedJobs()).toBe(1);
    expect(await batch.completedJobs()).toBe(0);
    expect(await batch.progressPercentage()).toBe(33.33);

    await jobs[1].finishedBang();

    await batch.reload();
    expect(await batch.pendingJobs()).toBe(1);
    expect(await batch.completedJobs()).toBe(1);
    expect(await batch.progressPercentage()).toBe(66.67);
  });

  it("start completes batches whose jobs finished before the batch was started", async () => {
    const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, async () => {
      await NiceJob.performLater("world");
    });

    await batch.updateColumns({ enqueued_at: null });
    await (await batch.jobs.sole()).finishedBang();

    expect((await batch.reload()).isFinished()).toBeFalsy();

    await batch.start();

    expect((await batch.reload()).isFinished()).toBeTruthy();
  });

  it("concurrent completion checks finish the batch exactly once", async () => {
    const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, async () => {
      await NiceJob.performLater("world");
    });

    await BatchExecution.where({ batch_id: batch.id }).deleteAll();

    const concurrency = 8;
    const barrier = new Concurrent.CyclicBarrier(concurrency);
    const threads = Array.from(
      { length: concurrency },
      () =>
        new Thread(async () => {
          await Record.connectionPool().withConnection(async () => {
            await barrier.wait();
            for (let i = 0; i < 3; i++) await (await Batch.find(batch.id)).finish();
          });
        }),
    );
    for (const thread of threads) await thread.join();

    await batch.reload();
    expect(batch.isFinished()).toBeTruthy();
    expect(await batch.completedJobs()).toBe(batch.total_jobs);
    expect(await Job.where({ class_name: "BatchCompletionJob" }).count()).toBe(1);

    await batch.finish();
    expect(await Job.where({ class_name: "BatchCompletionJob" }).count()).toBe(1);
  });

  it("concurrent adders to the same batch keep exact accounting", async () => {
    const batch = await Batch.enqueue({}, async () => {
      await NiceJob.performLater("seed");
    });

    const [concurrency, addsPerThread] = [8, 5];
    const barrier = new Concurrent.CyclicBarrier(concurrency);
    const errors = new Queue<unknown>();
    const threads = Array.from(
      { length: concurrency },
      () =>
        new Thread(async () => {
          await Record.connectionPool().withConnection(async () => {
            await barrier.wait();
            for (let i = 0; i < addsPerThread; i++) {
              try {
                await (
                  await Batch.find(batch.id)
                ).enqueue(async () => {
                  await NiceJob.performLater("added");
                });
              } catch (e) {
                errors.push(e);
              }
            }
          });
        }),
    );
    for (const thread of threads) await thread.join();

    const raised: unknown[] = [];
    while (!errors.isEmpty()) raised.push(await errors.pop());
    expect(raised).toBeEmpty();

    const expected = 1 + concurrency * addsPerThread;
    expect(await Job.where({ batch_id: batch.id }).count()).toBe(expected);
    expect((await batch.reload()).total_jobs).toBe(expected);
  });

  it("a completion check that races a concurrent adder does not finish the batch", async () => {
    const batch = await Batch.enqueue({ onFinish: BatchCompletionJob }, async () => {
      await NiceJob.performLater("world");
    });
    const job = await Job.where({ batch_id: batch.id }).sole();

    await BatchExecution.where({ batch_id: batch.id }).deleteAll();

    const adderStarted = new Queue<boolean>();
    const adder = new Thread(async () => {
      await Record.connectionPool().withConnection(async () => {
        await Record.transaction(async () => {
          await Batch.where({ id: batch.id }).unfinished().updateAll("total_jobs = total_jobs + 1");
          await BatchExecution.insertAllBang([{ batch_id: batch.id, job_id: job.id }]);
          adderStarted.push(true);
          await rbFSleep(0.5);
        });
      });
    });

    await adderStarted.pop();
    await (await Batch.find(batch.id)).finish();
    await adder.join();

    expect((await batch.reload()).isFinished()).toBeFalsy();
    expect(await BatchExecution.where({ batch_id: batch.id }).count()).toBe(1);
  });

  it("start is single-winner: stale instances cannot restart a started batch", async () => {
    const batch = await Batch.createBang({ on_finish: BatchCompletionJob });
    await batch.updateColumns({ enqueued_at: null, finished_at: null, total_jobs: 0 });
    await Job.destroyAll();

    const staleA = await Batch.find(batch.id);
    const staleB = await Batch.find(batch.id);

    await staleA.start();
    const startedAt = (await batch.reload()).enqueued_at;

    expect(batch.isFinished()).toBeTruthy();
    expect(batch.total_jobs).toBe(0);
    expect(await Job.where({ class_name: "BatchCompletionJob" }).count()).toBe(1);

    await travel(seconds(1), {}, async () => {
      await staleB.start();
    });

    expect((await batch.reload()).enqueued_at).toEqual(startedAt);
    expect(await Job.where({ class_name: "BatchCompletionJob" }).count()).toBe(1);
  });

  it("batch capture runs before deferred enqueues", () => {
    const ancestors = rbModAncestors(ApplicationJob);
    expect(ancestors).toContain(ActiveJob.BatchId);

    expect(ancestors.indexOf(ActiveJob.BatchId!)).toBeLessThan(
      ancestors.indexOf(ActiveJob.EnqueueAfterTransactionCommit),
    );
  });

  it("reused job instances join the currently active batch", async () => {
    const job = new NiceJob("reused");
    const batchA = await Batch.enqueue({}, async () => {
      await job.enqueue();
    });
    const batchB = await Batch.enqueue({}, async () => {
      await job.enqueue();
    });

    expect(await Job.where({ active_job_id: job.jobId }).order("id").pluck("batch_id")).toEqual([
      batchA.id,
      batchB.id,
    ]);
  });

  it("batch accessor reflects a batch assigned after a nil read", async () => {
    const job = new NiceJob("late");
    expect(await job.batch()).toBeNull();

    const batch = await Batch.enqueue({}, async () => {
      await job.enqueue();
    });

    expect((await job.batch())!.id).toBe(batch.id);
  });

  it("conflict-discarded jobs count the same for single and bulk enqueues", async () => {
    const result1 = await JobResult.createBang({ queue_name: "default", status: "" });
    const batch1 = await Batch.enqueue({}, async () => {
      await DiscardableUpdateResultJob.performLater(result1, { name: "A" });
      await DiscardableUpdateResultJob.performLater(result1, { name: "B" });
    });

    const result2 = await JobResult.createBang({ queue_name: "default", status: "" });
    const batch2 = await Batch.enqueue({}, async () => {
      await performAllLater([
        new DiscardableUpdateResultJob(result2, { name: "A" }),
        new DiscardableUpdateResultJob(result2, { name: "B" }),
      ]);
    });

    expect((await batch1.reload()).total_jobs).toBe((await batch2.reload()).total_jobs);
    expect(await batch1.pendingJobs()).toBe(await batch2.pendingJobs());
  });
});
