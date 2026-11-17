import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { seconds } from "@blazetrails/activesupport";
import { travel } from "@blazetrails/activesupport/testing/time-helpers";
import { Trails } from "@blazetrails/trailties";
import { Time } from "@blazetrails/date";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { constGet, constSet } from "@blazetrails/ruby-compat";
import { Batch, Job, SolidQueueAdapter } from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { BatchCompletionJob } from "./support/batch-completion-job.js";

class BatchWithArgumentsJob extends ApplicationJob {
  declare batch: () => Promise<Batch | null>;

  async perform(arg1: unknown, arg2: unknown): Promise<void> {
    Trails.logger?.info(`Hi ${(await this.batch())!.id}, ${arg1}, ${arg2}!`);
  }
}

class NiceJob extends ApplicationJob {
  static {
    this.retryOn(Error, { wait: seconds(1) });
  }

  perform(arg: unknown): void {
    Trails.logger?.info(`Hi ${arg}!`);
  }
}

class BatchTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(constGet(Object, "SolidQueue") as object, "BatchTest", BatchTest);
for (const klass of [BatchWithArgumentsJob, NiceJob]) constSet(BatchTest, klass.name, klass);

describe("SolidQueue::BatchTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(() => {
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
});
