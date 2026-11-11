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
  Process,
  Record,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
} from "../../lib/index.js";
import { ApplicationJob } from "../support/application-job.js";
import { ExpectedTestError } from "../support/expected-test-error.js";
import { JobResult } from "../support/job-result.js";
import { Range } from "@blazetrails/ruby-compat";
import { loadAppSchema } from "../support/queue-schema.js";
import { SequentialUpdateResultJob } from "../support/sequential-update-result-job.js";
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
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";

async function assertStoredSequence(result: JobResult, ...sequences: string[][]) {
  const expected = sequences.map(
    (sequence) => "seq: " + sequence.map((name) => `s${name}c${name}`).join(""),
  );
  await Record.uncached(async () => {
    expect(expected).toContain((await result.reload()).status);
  });
}

describe("ConcurrencyControlsTest", { timeout: 30_000 }, () => {
  let result: JobResult;
  let run: ReturnType<typeof runSupervisor>;
  let onThreadError: typeof SolidQueue.onThreadError;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
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
    await Job.destroyAll();
    await JobResult.deleteAll();
    await Process.destroyAll();
    await Semaphore.deleteAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("run several conflicting jobs over the same record sequentially", async () => {
    for (const name of new Range("A", "F").toA()) {
      await SequentialUpdateResultJob.performLater(result, { name, pause: 0.2 });
    }

    for (const name of new Range("G", "K").toA()) {
      await SequentialUpdateResultJob.performLater(result, { name });
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
      await SequentialUpdateResultJob.set({ wait: seconds(0.2 + i * 0.01) }).performLater(result, {
        name,
        pause: 0.3,
      });
    }

    for (const [i, name] of new Range("G", "K").toA().entries()) {
      await SequentialUpdateResultJob.set({ wait: seconds(0.3 + i * 0.01) }).performLater(result, {
        name,
      });
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
      await SequentialUpdateResultJob.performLater(result, {
        name,
        pause: 0.2,
        exception: i % 2 === 0 ? ExpectedTestError : null,
      });
    }

    for (const name of new Range("G", "K").toA()) {
      await SequentialUpdateResultJob.performLater(result, { name });
    }

    await waitForJobsToFinishFor(5);
    expect(await FailedExecution.count()).toBe(3);

    await assertStoredSequence(result, ["B", "D", "F", ...new Range("G", "K").toA()]);
  });

  it("rely on dispatcher to unblock blocked executions with an available semaphore", async () => {
    const job = (await SequentialUpdateResultJob.performLater(result, {
      name: "A",
    })) as SequentialUpdateResultJob;

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
          await SequentialUpdateResultJob.performLater(result, { name });
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
    const job = (await SequentialUpdateResultJob.performLater(result, {
      name: "A",
    })) as SequentialUpdateResultJob;
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
          await SequentialUpdateResultJob.performLater(result, { name });
        }
      },
    );

    await Semaphore.where({ key: job.concurrencyKey() }).updateAll({
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
    await SequentialUpdateResultJob.performLater(result, {
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
      await SequentialUpdateResultJob.performLater(result, { name: "A", pause: 0.2 });
      await SequentialUpdateResultJob.performLater(result, { name: "B" });

      try {
        expect(await Job.count()).toBe(2);
        assert(true, "Transaction state valid");
      } catch (e) {
        if (!(e instanceof StatementInvalid)) throw e;
        assert(false, "Transaction state unexpectedly invalid");
      }
    });
  });
});
