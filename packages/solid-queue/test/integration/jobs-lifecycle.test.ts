import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { days, ordinalize } from "@blazetrails/activesupport";
import {
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import type { Time } from "@blazetrails/date";
import { RuntimeError } from "@blazetrails/ruby-compat";
import {
  Dispatcher,
  FailedExecution,
  Job,
  Process,
  ScheduledExecution,
  SolidQueue,
  SolidQueueAdapter,
  Worker,
} from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import { AddToBufferJob, JobBuffer } from "../support/add-to-buffer-job.js";
import { RaisingJob } from "../support/raising-job.js";
import { ExpectedTestError } from "../support/expected-test-error.js";
import { loadAppSchema } from "../support/queue-schema.js";
import { silentOnThreadErrorFor, waitForJobsToFinishFor } from "../support/jobs-test-helper.js";

async function deletingFinishedJobs(block: () => Promise<void>) {
  const previous = SolidQueue.preserveFinishedJobs;
  SolidQueue.preserveFinishedJobs = false;
  try {
    await block();
  } finally {
    SolidQueue.preserveFinishedJobs = previous;
  }
}

describe("JobsLifecycleTest", { timeout: 15_000 }, () => {
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
      [ExpectedTestError, RaisingJob.DefaultError],
      onThreadError,
    );
    worker = new Worker({ queues: "background", threads: 3 });
    dispatcher = new Dispatcher({ batchSize: 10, pollingInterval: 0.2 });
  });

  afterEach(async () => {
    SolidQueue.onThreadError = onThreadError;
    await worker.stop();
    await dispatcher.stop();
    travelBack();

    JobBuffer.clear();
    await Job.destroyAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("enqueue and run jobs", async () => {
    await AddToBufferJob.performLater("hey");
    await AddToBufferJob.performLater("ho");

    await dispatcher.start();
    await worker.start();

    await waitForJobsToFinishFor(2);

    expect(JobBuffer.values.sort()).toEqual(["hey", "ho"]);
    expect(await Job.finished().count()).toBe(2);
  });

  it("enqueue and run jobs that fail without retries", async () => {
    await RaisingJob.performLater(ExpectedTestError, "A");
    await RaisingJob.performLater(ExpectedTestError, "B");
    const _jobs = await Job.last(2);

    await dispatcher.start();
    await worker.start();

    await waitForJobsToFinishFor(3);

    const message = "raised ExpectedTestError for the 1st time";
    expect(JobBuffer.values.sort()).toEqual([`A: ${message}`, `B: ${message}`]);

    expect(await Job.finished().toArray()).toBeEmpty();
  });

  it("enqueue and run jobs that fail and succeed after retrying", async () => {
    await RaisingJob.performLater(RaisingJob.DefaultError, "A", 5);
    await RaisingJob.performLater(RaisingJob.DefaultError, "B");

    await dispatcher.start();
    await worker.start();

    await waitForJobsToFinishFor(3);

    const messagesFromA = [1, 2, 3].map(
      (i) => `A: raised RaisingJob::DefaultError for the ${ordinalize(i)} time`,
    );
    const messagesFromB = [
      "B: raised RaisingJob::DefaultError for the 1st time",
      "Successfully completed job",
    ];

    expect(JobBuffer.values.sort()).toEqual([...messagesFromA, ...messagesFromB]);

    expect(await Job.finished().count()).toBe(4);
    expect(await FailedExecution.count()).toBe(1);
  });

  it("retry job that failed after being automatically retried", async () => {
    await RaisingJob.performLater(RaisingJob.DefaultError, "A", 5);

    await dispatcher.start();
    await worker.start();

    await waitForJobsToFinishFor(3);

    expect(await Job.finished().count()).toBe(2);
    expect(await FailedExecution.count()).toBe(1);

    const failedExecution = (await FailedExecution.last())!;
    await (await failedExecution.job).retry();

    await waitForJobsToFinishFor(3);

    expect(await Job.finished().count()).toBe(4);
    expect(await FailedExecution.count()).toBe(1);
  });

  it("enqueue and run jobs that fail and it's discarded", async () => {
    await RaisingJob.performLater(RaisingJob.DiscardableError, "A");

    await dispatcher.start();
    await worker.start();

    await waitForJobsToFinishFor(1);

    expect(JobBuffer.values.sort()).toEqual([
      "A: raised RaisingJob::DiscardableError for the 1st time",
    ]);

    expect(await Job.finished().count()).toBe(1);
    expect(await FailedExecution.count()).toBe(0);
  });

  it("schedule and run jobs", async () => {
    await AddToBufferJob.set({ wait: days(1) }).performLater("I'm scheduled");
    await AddToBufferJob.set({ wait: days(3) }).performLater("I'm scheduled later");

    await dispatcher.start();
    await worker.start();

    expect(await ScheduledExecution.count()).toBe(2);

    travelTo(days(2).fromNow() as Time);

    await waitForJobsToFinishFor(2);

    expect(JobBuffer.size()).toBe(1);
    expect(JobBuffer.lastValue()).toBe("I'm scheduled");

    travelTo(days(5).fromNow() as Time);

    await waitForJobsToFinishFor(2);

    expect(JobBuffer.size()).toBe(2);
    expect(JobBuffer.lastValue()).toBe("I'm scheduled later");

    expect(await Job.finished().count()).toBe(2);
  });

  it("delete finished jobs after they run", async () => {
    await deletingFinishedJobs(async () => {
      await AddToBufferJob.performLater("hey");
      await worker.start();

      await waitForJobsToFinishFor(2);
    });

    expect(await Job.count()).toBe(0);
  });

  it("clear finished jobs after configured period", async () => {
    for (let i = 0; i < 10; i++) await AddToBufferJob.performLater(2);
    const jobs = await Job.last(10);

    await assertNoDifference(
      () => Job.count(),
      null,
      async () => {
        await Job.clearFinishedInBatches();
      },
    );

    const sample = [...jobs].sort(() => Math.random() - 0.5).slice(0, 5);
    for (const job of sample) await job.finishedBang();

    await assertNoDifference(
      () => Job.count(),
      null,
      async () => {
        await Job.clearFinishedInBatches();
      },
    );

    travelTo(days(3).fromNow() as Time);

    await assertDifference(
      () => Job.count(),
      -5,
      null,
      async () => {
        await Job.clearFinishedInBatches();
      },
    );
  });

  it("respect class name when clearing finished jobs", async () => {
    for (let i = 0; i < 10; i++) await AddToBufferJob.performLater(2);
    for (let i = 0; i < 10; i++) await RaisingJob.performLater(RuntimeError, "A");
    const jobs = await Job.all().toArray();

    for (const job of jobs) await job.finishedBang();

    travelTo(days(3).fromNow() as Time);

    await Job.clearFinishedInBatches({ className: "AddToBufferJob" });

    expect(await Job.where({ class_name: "AddToBufferJob" }).count()).toBe(0);
    expect(await Job.where({ class_name: "RaisingJob" }).count()).toBe(10);
  });
});
