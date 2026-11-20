import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../support/dummy-application.js";
import { Base, StatementInvalid } from "@blazetrails/activerecord";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { minutes, seconds } from "@blazetrails/activesupport";
import {
  assert,
  assertDifference,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import {
  BlockedExecution,
  FailedExecution,
  Job,
  Record,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
} from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import { ExpectedTestError } from "../support/expected-test-error.js";
import { JobResult } from "../support/job-result.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Range, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { loadAppSchema } from "../support/queue-schema.js";
import { DiscardableUpdateResultJob } from "../support/discardable-update-result-job.js";
import { NonOverlappingUpdateResultJob } from "../support/non-overlapping-update-result-job.js";
import { ThrottledUpdateResultJob } from "../support/throttled-update-result-job.js";
import { UpdateResultJob } from "../support/update-result-job.js";
import {
  assertNoUnfinishedJobs,
  silentOnThreadErrorFor,
  waitForJobsToFinishFor,
} from "../support/jobs-test-helper.js";
import {
  runSupervisor,
  sleep,
  waitFor,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";
import { destroyRecords } from "../test-helper.js";

async function assertStoredSequence(result: JobResult, ...sequences: string[][]) {
  const expected = sequences.map(
    (sequence) => "seq: " + sequence.map((name) => `s${name}c${name}`).join(""),
  );
  await Record.uncached(async () => {
    expect(expected).toContain((await result.reload()).status);
  });
}

async function waitForSemaphoresToBeReleasedFor(timeout: number) {
  await waitWhileWithTimeout(
    timeout,
    async () =>
      await Record.uncached(async () => await Semaphore.available().invertWhere().isAny()),
  );
}

class ConcurrencyControlsTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "ConcurrencyControlsTest", ConcurrencyControlsTest);

describe("ConcurrencyControlsTest", { timeout: 30_000 }, () => {
  let result: JobResult;
  let run: ReturnType<typeof runSupervisor>;
  let onThreadError: typeof SolidQueue.onThreadError;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    await destroyRecords();
  });

  beforeEach(async () => {
    onThreadError = SolidQueue.onThreadError;
    SolidQueue.onThreadError = silentOnThreadErrorFor(ExpectedTestError, onThreadError);
    result = await JobResult.createBang({ queue_name: "default", status: "seq: " });

    const defaultWorker = { queues: "default", pollingInterval: 0.1, processes: 3, threads: 2 };
    const dispatcher = { pollingInterval: 0.1, batchSize: 200, concurrencyMaintenanceInterval: 1 };

    run = runSupervisor({ workers: [defaultWorker], dispatchers: [dispatcher] });

    await waitForRegisteredProcesses(5, { timeout: 0.5 });
  });

  afterEach(async () => {
    await run.terminate();
    vi.restoreAllMocks();
    SolidQueue.onThreadError = onThreadError;
    await destroyRecords();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("run several conflicting jobs over the same record sequentially", async () => {
    for (const name of new Range("A", "F").toA()) {
      await NonOverlappingUpdateResultJob.performLater(result, { name, pause: 0.2 });
    }

    for (const name of new Range("G", "K").toA()) {
      await NonOverlappingUpdateResultJob.performLater(result, { name });
    }

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, new Range("A", "K").toA());
  });

  it("schedule several conflicting jobs over the same record sequentially", async () => {
    await UpdateResultJob.set({ wait: seconds(0.23) }).performLater(result, {
      name: "000",
      pause: 0.1,
    });

    for (const [i, name] of new Range("A", "F").toA().entries()) {
      await NonOverlappingUpdateResultJob.set({ wait: seconds(0.2 + i * 0.01) }).performLater(
        result,
        {
          name,
          pause: 0.3,
        },
      );
    }

    for (const [i, name] of new Range("G", "K").toA().entries()) {
      await NonOverlappingUpdateResultJob.set({ wait: seconds(0.3 + i * 0.01) }).performLater(
        result,
        {
          name,
        },
      );
    }

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, new Range("A", "K").toA());
  });

  it("run several jobs over the same record limiting concurrency", async () => {
    let incr = 0;
    await assertNoDifference(
      async () => await BlockedExecution.count(),
      null,
      async () => {
        for (const name of new Range("A", "C").toA()) {
          await ThrottledUpdateResultJob.performLater(result, { name, pause: 0.5 + incr });
          incr += 0.5;
        }
      },
    );

    await sleep(0.01);
    await assertDifference(
      async () => await BlockedExecution.count(),
      +5,
      null,
      async () => {
        for (const name of new Range("D", "H").toA()) {
          await ThrottledUpdateResultJob.performLater(result, { name, pause: 0.05 });
        }
      },
    );

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, ["C"]);
  });

  it("run several jobs over the same record sequentially, with some of them failing", async () => {
    for (const [i, name] of new Range("A", "F").toA().entries()) {
      await NonOverlappingUpdateResultJob.performLater(result, {
        name,
        pause: 0.2,
        exception: i % 2 === 0 ? ExpectedTestError : null,
      });
    }

    for (const name of new Range("G", "K").toA()) {
      await NonOverlappingUpdateResultJob.performLater(result, { name });
    }

    await waitForJobsToFinishFor(5);
    expect(await FailedExecution.count()).toBe(3);

    await assertStoredSequence(result, ["B", "D", "F", ...new Range("G", "K").toA()]);
  });

  it("rely on dispatcher to unblock blocked executions with an available semaphore", async () => {
    const job = await Job.findByBang({
      active_job_id: (
        (await NonOverlappingUpdateResultJob.performLater(result, {
          name: "A",
        })) as ApplicationJob
      ).jobId,
    });

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await waitWhileWithTimeout(1, async () =>
      Record.uncached(() => Semaphore.where({ value: 0 }).isAny()),
    );
    await Record.uncached(async () => {
      expect(await Semaphore.wait(job)).toBeTruthy();
    });

    await assertDifference(
      async () => await BlockedExecution.count(),
      +10,
      null,
      async () => {
        for (const name of new Range("B", "K").toA()) {
          await NonOverlappingUpdateResultJob.performLater(result, { name });
        }
      },
    );

    await BlockedExecution.updateAll({ expires_at: minutes(15).ago() });
    expect(await Semaphore.signal(job)).toBeTruthy();

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, new Range("A", "K").toA(), [
      "A",
      "C",
      "B",
      ...new Range("D", "K").toA(),
    ]);
  });

  it("rely on dispatcher to unblock blocked executions with an expired semaphore", async () => {
    const job = await Job.findByBang({
      active_job_id: (
        (await NonOverlappingUpdateResultJob.performLater(result, {
          name: "A",
        })) as ApplicationJob
      ).jobId,
    });
    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await waitWhileWithTimeout(1, async () =>
      Record.uncached(() => Semaphore.where({ value: 0 }).isAny()),
    );
    await Record.uncached(async () => {
      expect(await Semaphore.wait(job)).toBeTruthy();
    });

    await assertDifference(
      async () => await BlockedExecution.count(),
      +10,
      null,
      async () => {
        for (const name of new Range("B", "K").toA()) {
          await NonOverlappingUpdateResultJob.performLater(result, { name });
        }
      },
    );

    await Semaphore.where({ key: job.concurrency_key }).updateAll({
      expires_at: minutes(15).ago(),
    });
    await BlockedExecution.updateAll({ expires_at: minutes(15).ago() });

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, new Range("A", "K").toA(), [
      "A",
      "C",
      "B",
      ...new Range("D", "K").toA(),
    ]);
  });

  it("don't block claimed executions that get released", async () => {
    await NonOverlappingUpdateResultJob.performLater(result, {
      name: "I'll be released to ready",
      pause: Number(SolidQueue.shutdownTimeout) + 10,
    });
    const job = (await Job.last()) as Job;

    await sleep(0.2);
    expect(await job.isClaimed()).toBeTruthy();

    const terminating = sleep(0.1).then(() => run.terminate());
    await sleep(Number(SolidQueue.shutdownTimeout) + 0.6);
    await terminating;

    expect((await job.reload()).isFinished()).toBeFalsy();
    expect(await (await job.reload()).isReady()).toBeTruthy();
  });

  it("verify transactions remain valid after Job creation conflicts via limits_concurrency", async () => {
    await Base.transaction(async () => {
      await NonOverlappingUpdateResultJob.performLater(result, { name: "A", pause: 0.2 });
      await NonOverlappingUpdateResultJob.performLater(result, { name: "B" });

      try {
        expect(await Job.count()).toBe(2);
        assert(true, "Transaction state valid");
      } catch (e) {
        if (!(e instanceof StatementInvalid)) throw e;
        assert(false, "Transaction state unexpectedly invalid");
      }
    });
  });

  it("discard jobs when concurrency limit is reached with on_conflict: :discard", async () => {
    const job1 = (await DiscardableUpdateResultJob.performLater(result, {
      name: "1",
      pause: 1,
    })) as DiscardableUpdateResultJob;
    await waitFor({ timeout: 2 }, async () => {
      const job = await Job.findBy({ active_job_id: job1.jobId });
      return (await job?.isClaimed()) ?? false;
    });

    const job2 = (await DiscardableUpdateResultJob.performLater(result, {
      name: "2",
    })) as DiscardableUpdateResultJob;
    const job3 = (await DiscardableUpdateResultJob.performLater(result, {
      name: "3",
    })) as DiscardableUpdateResultJob;

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, ["1"]);

    const jobs = Job.where({ active_job_id: [job1, job2, job3].map((job) => job.jobId) });
    expect(await jobs.count()).toBe(1);

    expect(job1.providerJobId).toBe(((await jobs.first()) as Job).id);
    expect(job2.providerJobId).toBeNull();
    expect(job3.providerJobId).toBeNull();
  });

  it("discard on conflict across different concurrency keys", async () => {
    const anotherResult = await JobResult.createBang({ queue_name: "default", status: "seq: " });
    await DiscardableUpdateResultJob.performLater(result, { name: "1", pause: 2 });
    await DiscardableUpdateResultJob.performLater(anotherResult, { name: "2", pause: 2 });
    await sleep(0.1);
    await DiscardableUpdateResultJob.performLater(result, { name: "3" });
    await DiscardableUpdateResultJob.performLater(anotherResult, { name: "4" });

    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, ["1"]);
    await assertStoredSequence(anotherResult, ["2"]);
  });

  it("discard on conflict and release semaphore", async () => {
    await DiscardableUpdateResultJob.performLater(result, { name: "1", pause: 0.1 });
    await DiscardableUpdateResultJob.performLater(result, { name: "2" });

    await waitForJobsToFinishFor(5);
    await waitForSemaphoresToBeReleasedFor(2);

    await assertNoUnfinishedJobs();

    await DiscardableUpdateResultJob.performLater(result, { name: "3" });
    await waitForJobsToFinishFor(5);
    await assertNoUnfinishedJobs();

    await assertStoredSequence(result, ["1", "3"]);
  });
});
