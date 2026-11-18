import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import type { Base as ActiveJobBase } from "@blazetrails/activejob";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { ClaimedExecution, Job, Process, SolidQueueAdapter } from "../../lib/index.js";
import { Process as RbProcess, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Record } from "../../lib/record.js";
import { waitForJobsToFinishFor } from "../support/jobs-test-helper.js";
import { ApplicationJob } from "../support/application-job.js";
import { JobResult, StoreResultJob } from "../support/job-result.js";
import { loadAppSchema } from "../support/queue-schema.js";
import {
  assertMetadata,
  assertNoRegisteredProcesses,
  findProcessesRegisteredAs,
  runSupervisor,
  signalProcess,
  waitForProcessTerminationWithTimeout,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";

async function enqueueStoreResultJob(
  value: string,
  queueName = "background",
  options: { pause?: number } = {},
) {
  return (await StoreResultJob.set({ queue: queueName }).performLater(
    value,
    options,
  )) as ActiveJobBase;
}

async function assertCompletedJobResults(value: string, queueName = "background", count = 1) {
  const actual = await Record.uncached(() =>
    JobResult.where({ queue_name: queueName, status: "completed", value }).count(),
  );
  expect(actual).toBe(count);
}

async function assertStartedJobResult(value: string, queueName = "background", count = 1) {
  const actual = await Record.uncached(() =>
    JobResult.where({ queue_name: queueName, status: "started", value }).count(),
  );
  expect(actual).toBe(count);
}

async function assertJobStatus(activeJob: ActiveJobBase, status: "finished" | "ready") {
  await Record.uncached(async () => {
    const job = (await Job.findBy({ active_job_id: activeJob.jobId }))!;
    const predicates = { finished: () => job.isFinished(), ready: () => job.isReady() };
    expect(await predicates[status]()).toBeTruthy();
  });
}

async function assertRegisteredWorkersFor(queues: string[], supervisorPid: number | null = null) {
  const workers = await findProcessesRegisteredAs("Worker").toArray();
  const registeredQueues = workers
    .map((process) => process.metadata.get("queues") as string | null)
    .filter((q) => q != null);
  expect([...queues].sort()).toEqual([...registeredQueues].sort());
  if (supervisorPid != null) {
    const pids = await Promise.all(workers.map(async (process) => (await process.supervisor)!.pid));
    expect([...new Set(pids)]).toEqual([supervisorPid]);
  }
}

class FiberProcessesLifecycleTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "FiberProcessesLifecycleTest", FiberProcessesLifecycleTest);

describe("FiberProcessesLifecycleTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;
  let previousIsolationLevel: typeof IsolatedExecutionState.isolationLevel;
  let run: ReturnType<typeof runSupervisor>;

  async function assertCleanTermination() {
    await waitForRegisteredProcesses(0, { timeout: 0.2 });
    await assertNoRegisteredProcesses();
    expect(await ClaimedExecution.isNone()).toBeTruthy();
    expect(run.isExists).toBeFalsy();
  }

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    previousIsolationLevel = IsolatedExecutionState.isolationLevel;
    run = runSupervisor(
      { workers: [{ queues: "background", fibers: 3, pollingInterval: 0.1 }] },
      () => {
        IsolatedExecutionState.isolationLevel = "fiber";
      },
    );

    await waitForRegisteredProcesses(2, { timeout: 3 });
    await assertRegisteredWorkersFor(["background"], RbProcess.pid);
  });

  afterEach(async () => {
    if (run.isExists) await run.terminate();
    if (previousIsolationLevel != null)
      IsolatedExecutionState.isolationLevel = previousIsolationLevel;
    vi.restoreAllMocks();
    await Job.destroyAll();
    await JobResult.deleteAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("process jobs in fibers in a forked worker", async () => {
    const worker = (await findProcessesRegisteredAs("Worker").first())!;
    assertMetadata(worker, { pool_type: "fiber", pool_size: 3 });

    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`);

    await waitForJobsToFinishFor(3);

    expect(await Record.uncached(() => JobResult.count())).toBe(6);
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "background");

    await signalProcess(run, "TERM");
    await waitForProcessTerminationWithTimeout(run);
    await assertCleanTermination();
  });

  it("term supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 1 });

    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    await signalProcess(run, "TERM", { wait: 0.1 });
    await waitForJobsToFinishFor(3);

    await assertCompletedJobResults("no pause");
    await assertCompletedJobResults("pause");

    await assertJobStatus(noPause, "finished");
    await assertJobStatus(pause, "finished");

    await waitForProcessTerminationWithTimeout(run, { timeout: 1 });
    await assertCleanTermination();
  });

  it("quit supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 60 });

    await waitForJobsToFinishFor(3, { except: pause });
    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    await signalProcess(run, "QUIT", { wait: 0.1 });

    await waitWhileWithTimeout(2, async () => run.isExists);
    expect(run.isExists).toBeFalsy();

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");

    await assertStartedJobResult("pause");
    await assertJobStatus(pause, "ready");
    await assertCleanTermination();
  });
});
