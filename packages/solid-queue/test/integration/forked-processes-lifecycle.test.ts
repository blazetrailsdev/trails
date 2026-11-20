import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import type { Base as ActiveJobBase } from "@blazetrails/activejob";
import {
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  SolidQueue,
  SolidQueueAdapter,
} from "../../lib/index.js";
import { Process as RbProcess, SystemCallError } from "@blazetrails/ruby-compat";
import { Record } from "../../lib/record.js";
import { ExpectedTestError } from "../support/expected-test-error.js";
import { waitForJobsToFinishFor } from "../support/jobs-test-helper.js";
import { ApplicationJob } from "../support/application-job.js";
import { JobResult, StoreResultJob } from "../support/job-result.js";
import { loadAppSchema } from "../support/queue-schema.js";
import {
  assertNoRegisteredProcesses,
  findProcessesRegisteredAs,
  isProcessExists,
  runSupervisorAsFork,
  signalProcess,
  terminateProcess,
  waitFor,
  waitForProcessTerminationWithTimeout,
  sleep,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { destroyRecords } from "../test-helper.js";

async function enqueueStoreResultJob(
  value: string,
  queueName = "background",
  options: { pause?: number; exception?: unknown; exitValue?: number } = {},
) {
  return (await StoreResultJob.set({ queue: queueName }).performLater(
    value,
    options,
  )) as ActiveJobBase;
}

async function assertCompletedJobResults(value: string, queueName = "background", count = 1) {
  await Record.uncached(async () => {
    expect(
      await JobResult.where({ queue_name: queueName, status: "completed", value }).count(),
    ).toBe(count);
  });
}

async function assertStartedJobResult(value: string, queueName = "background", count = 1) {
  await Record.uncached(async () => {
    expect(await JobResult.where({ queue_name: queueName, status: "started", value }).count()).toBe(
      count,
    );
  });
}

async function assertJobStatus(
  activeJob: ActiveJobBase,
  status: "finished" | "ready" | "claimed" | "failed",
) {
  await Record.uncached(async () => {
    const job = (await Job.findBy({ active_job_id: activeJob.jobId }))!;
    const predicates = {
      finished: () => job.isFinished(),
      ready: () => job.isReady(),
      claimed: () => job.isClaimed(),
      failed: () => job.isFailed(),
    };
    expect(await predicates[status]()).toBeTruthy();
  });
}

async function assertRegisteredWorkersFor(
  ...args: [...queues: string[], options: { supervisorPid?: number | null }]
) {
  const { supervisorPid = null } = args.at(-1) as { supervisorPid?: number | null };
  const queues = args.slice(0, -1) as string[];
  const workers = await findProcessesRegisteredAs("Worker").toArray();
  const registeredQueues = workers
    .map((process) => process.metadata.get("queues") as string | null)
    .filter((q) => q != null);
  expect([...registeredQueues].sort()).toEqual([...queues].sort());
  if (supervisorPid != null) {
    const pids = await Promise.all(workers.map(async (process) => (await process.supervisor)!.pid));
    expect([...new Set(pids)]).toEqual([supervisorPid]);
  }
}

class ForkedProcessesLifecycleTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "ForkedProcessesLifecycleTest", ForkedProcessesLifecycleTest);

describe("ForkedProcessesLifecycleTest", { timeout: 60_000 }, () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;
  let pid: number;

  async function assertCleanTermination() {
    await waitForRegisteredProcesses(0, { timeout: 0.2 });
    await assertNoRegisteredProcesses();
    expect(await ClaimedExecution.isNone()).toBe(true);
    expect(isProcessExists(pid)).toBe(false);
  }

  async function assertRegisteredSupervisorWith(pid: number) {
    const processes = await findProcessesRegisteredAs("Supervisor(fork)").toArray();
    expect(processes.length).toEqual(1);
    expect(processes[0].pid).toEqual(pid);
  }

  async function assertNoRegisteredWorkers() {
    expect(await findProcessesRegisteredAs("Worker").toArray()).toEqual([]);
  }

  async function assertNoClaimedJobs() {
    expect(await ClaimedExecution.isNone()).toBe(true);
  }

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    await destroyRecords();
    pid = runSupervisorAsFork({
      workers: [{ queues: "background" }, { queues: "default", threads: 5 }],
    });

    await waitForRegisteredProcesses(3, { timeout: 10 });
    await assertRegisteredWorkersFor("background", "default", { supervisorPid: pid });
  });

  afterEach(async () => {
    if (isProcessExists(pid)) await terminateProcess(pid).catch(() => RbProcess.kill("KILL", pid));
    for (const process of await Record.uncached(() => Process.all().toArray())) {
      try {
        RbProcess.kill("KILL", process.pid);
      } catch (error) {
        if (!(error instanceof SystemCallError)) throw error;
      }
    }
    vi.restoreAllMocks();
    await destroyRecords();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("enqueue jobs in multiple queues", async () => {
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`);
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`, "default");

    await waitForJobsToFinishFor(2);

    expect(await Record.uncached(() => JobResult.count())).toEqual(12);
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "background");
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "default");

    await terminateProcess(pid);
    await assertCleanTermination();
  });

  it("kill supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 1 });

    signalProcess(pid, "KILL", { wait: 0.2 });
    await waitForJobsToFinishFor(2);
    await waitForRegisteredProcesses(1, { timeout: 3 });

    expect(isProcessExists(pid)).toBe(false);

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");

    await assertCompletedJobResults("pause");
    await assertJobStatus(pause, "finished");

    await assertRegisteredSupervisorWith(pid);
    await assertNoRegisteredWorkers();
    await assertNoClaimedJobs();
  });

  it("term supervisor multiple times", async () => {
    for (let i = 0; i < 5; i++) signalProcess(pid, "TERM", { wait: 0.1 });

    await waitWhileWithTimeout(SolidQueue.shutdownTimeout.toF() + 1, async () =>
      isProcessExists(pid),
    );
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

    signalProcess(pid, "QUIT", { wait: 0.1 });

    await waitWhileWithTimeout(2, async () => isProcessExists(pid));
    expect(isProcessExists(pid)).toBe(false);

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");

    await assertStartedJobResult("pause");
    await assertJobStatus(pause, "ready");
    await assertCleanTermination();
  });

  it("term supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 1 });

    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    signalProcess(pid, "TERM", { wait: 0.1 });
    await waitForJobsToFinishFor(3);

    await assertCompletedJobResults("no pause");
    await assertCompletedJobResults("pause");

    await assertJobStatus(noPause, "finished");
    await assertJobStatus(pause, "finished");

    await waitForProcessTerminationWithTimeout(pid, { timeout: 1 });
    await assertCleanTermination();
  });

  it("int supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 1 });

    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    signalProcess(pid, "INT", { wait: 0.1 });
    await waitForJobsToFinishFor(3);

    await assertCompletedJobResults("no pause");
    await assertCompletedJobResults("pause");

    await assertJobStatus(noPause, "finished");
    await assertJobStatus(pause, "finished");

    await waitForProcessTerminationWithTimeout(pid, { timeout: 1 });
    await assertCleanTermination();
  });

  it("term supervisor exceeding timeout while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", {
      pause: SolidQueue.shutdownTimeout.toF() + 30,
    });

    await waitWhileWithTimeout(5, () =>
      ReadyExecution.joins(":job")
        .where({ solid_queue_jobs: { active_job_id: pause.jobId } })
        .isExists(),
    );
    await waitWhileWithTimeout(
      5,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    signalProcess(pid, "TERM", { wait: 0.5 });
    await waitForJobsToFinishFor(2, { except: pause });

    await waitFor(
      { timeout: SolidQueue.shutdownTimeout.toF() + 5 },
      async () => !isProcessExists(pid),
    );
    expect(isProcessExists(pid)).toBe(false);

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");

    await assertStartedJobResult("pause");
    await assertJobStatus(pause, "ready");
    await assertCleanTermination();
  });

  it("process some jobs that raise errors", async () => {
    for (let i = 0; i < 2; i++) await enqueueStoreResultJob("no error", "background");
    for (let i = 0; i < 2; i++) await enqueueStoreResultJob("no error", "default");
    const error1 = await enqueueStoreResultJob("error", "background", {
      exception: ExpectedTestError,
    });
    await enqueueStoreResultJob("no error", "background", { pause: 0.03 });
    const error2 = await enqueueStoreResultJob("error", "background", {
      exception: ExpectedTestError,
      pause: 0.05,
    });
    for (let i = 0; i < 2; i++) await enqueueStoreResultJob("no error", "default", { pause: 0.01 });
    const error3 = await enqueueStoreResultJob("error", "default", {
      exception: ExpectedTestError,
    });

    await waitForJobsToFinishFor(2, { except: [error1, error2, error3] });

    await assertCompletedJobResults("no error", "background", 3);
    await assertCompletedJobResults("no error", "default", 4);

    await waitWhileWithTimeout(1, async () => (await FailedExecution.count()) < 3);
    for (const job of [error1, error2, error3]) await assertJobStatus(job, "failed");

    await terminateProcess(pid);
    await assertCleanTermination();
  });

  it("process a job that exits", async () => {
    for (let i = 0; i < 4; i++) await enqueueStoreResultJob("no exit", "background");
    for (let i = 0; i < 2; i++) await enqueueStoreResultJob("no exit", "default");
    await enqueueStoreResultJob("paused no exit", "default", { pause: 0.5 });

    const exitJob = await enqueueStoreResultJob("exit", "background", { exitValue: 1, pause: 0.5 });
    const pauseJob = await enqueueStoreResultJob("exit", "background", { pause: 1 });

    await waitForJobsToFinishFor(3, { except: [exitJob, pauseJob] });

    await assertCompletedJobResults("no exit", "default", 2);
    await assertCompletedJobResults("no exit", "background", 4);
    await assertCompletedJobResults("paused no exit", "default", 1);

    expect(isProcessExists(pid)).toBe(true);
    await terminateProcess(pid);

    for (const job of [exitJob, pauseJob]) await assertJobStatus(job, "failed");

    await assertCleanTermination();
  });

  it("terminate worker individually", async () => {
    await enqueueStoreResultJob("pause", "background", { pause: 0.5 });
    await enqueueStoreResultJob("pause", "default", { pause: 0.5 });

    const worker = (await findProcessesRegisteredAs("Worker").first())!;

    await waitWhileWithTimeout(1, async () => (await ReadyExecution.count()) > 0);
    signalProcess(worker.pid, "TERM", { wait: 0.1 });

    await waitForRegisteredProcesses(2, { timeout: 3 });
    expect(await Process.findBy({ id: worker.id })).toBeNull();

    await waitForJobsToFinishFor(1);
    await assertCompletedJobResults("pause", "background");
    await assertCompletedJobResults("pause", "default");

    await waitForRegisteredProcesses(3, { timeout: 10 });
    await assertRegisteredWorkersFor("background", "default", { supervisorPid: pid });

    await enqueueStoreResultJob("no_pause");
    await enqueueStoreResultJob("no_pause", "default");
    await waitForJobsToFinishFor(1);

    await assertCompletedJobResults("no_pause", "background");
    await assertCompletedJobResults("no_pause", "default");

    await terminateProcess(pid);
    await assertCleanTermination();
  });

  it("kill worker individually", async () => {
    const killedPause = await enqueueStoreResultJob("killed_pause", "background", { pause: 5 });
    await enqueueStoreResultJob("pause", "default", { pause: 0.5 });

    await waitForJobsToFinishFor(1, { except: [killedPause] });
    await waitFor({ timeout: 10 }, () =>
      JobResult.where({ status: "started", value: "killed_pause" }).isExists(),
    );

    const worker = (await findProcessesRegisteredAs("Worker").toArray()).find((process) =>
      (process.metadata.get("queues") as string).includes("background"),
    )!;
    signalProcess(worker.pid, "KILL", { wait: 0.5 });

    await sleep(0.5);
    expect(await Process.isExists({ id: worker.id })).toBe(true);

    await waitForRegisteredProcesses(4, { timeout: 10 });

    await assertStartedJobResult("killed_pause");
    await assertJobStatus(killedPause, "failed");
    await assertCompletedJobResults("pause", "default");

    await enqueueStoreResultJob("no_pause");
    await enqueueStoreResultJob("no_pause", "default");
    await sleep(2);

    await assertCompletedJobResults("no_pause", "background");
    await assertCompletedJobResults("no_pause", "default");

    await terminateProcess(pid);
    await assertCleanTermination();
  });
});
