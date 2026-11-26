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
  SolidQueue,
  SolidQueueAdapter,
} from "../../lib/index.js";
import { Process as RbProcess, SystemExit, getProcessAdapter } from "@blazetrails/ruby-compat";
import { Record } from "../../lib/record.js";
import { ExpectedTestError } from "../support/expected-test-error.js";
import { waitForJobsToFinishFor } from "../support/jobs-test-helper.js";
import { ApplicationJob } from "../support/application-job.js";
import { JobResult, StoreResultJob } from "../support/job-result.js";
import { loadAppSchema } from "../support/queue-schema.js";
import {
  assertNoRegisteredProcesses,
  findProcessesRegisteredAs,
  runSupervisor,
  signalProcess,
  waitFor,
  waitForProcessTerminationWithTimeout,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import "../test-helper.js";

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

class AsyncProcessesLifecycleTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "AsyncProcessesLifecycleTest", AsyncProcessesLifecycleTest);

describe("AsyncProcessesLifecycleTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;
  let pid: ReturnType<typeof runSupervisor>;

  async function assertCleanTermination() {
    await waitForRegisteredProcesses(0, { timeout: 0.2 });
    await assertNoRegisteredProcesses();
    expect(await ClaimedExecution.isNone()).toBeTruthy();
    expect(pid.isExists).toBeFalsy();
  }

  async function assertRegisteredSupervisor() {
    const processes = await findProcessesRegisteredAs("Supervisor(async)").toArray();
    expect(processes.length).toEqual(1);
    expect(processes[0].pid).toEqual(RbProcess.pid);
  }

  async function assertClaimedJobs() {
    expect(await ClaimedExecution.isAny()).toBeTruthy();
  }

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    pid = runSupervisor({
      mode: "async",
      workers: [{ queues: "background" }, { queues: "default", threads: 5 }],
    });

    await waitForRegisteredProcesses(3, { timeout: 3 });
    await assertRegisteredWorkersFor("background", "default", { supervisorPid: RbProcess.pid });
  });

  afterEach(async () => {
    if (pid.isExists) await pid.terminate();
    vi.restoreAllMocks();
    vi.spyOn(getProcessAdapter(), "exit").mockImplementation((code) => {
      throw new SystemExit(code ?? 0);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("enqueue jobs in multiple queues", async () => {
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`);
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`, "default");

    await waitForJobsToFinishFor(2);

    expect(await Record.uncached(() => JobResult.count())).toBe(12);
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "background");
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "default");

    await pid.terminate();
    await assertCleanTermination();
  });

  // BLOCKED: solid-queue-fork-mode-unported-register
  it.skip("kill supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 3 });

    await waitForJobsToFinishFor(2, { except: pause });
    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    await signalProcess(pid, "KILL", { wait: 0.1 });
    await waitForRegisteredProcesses(1, { timeout: 2 });

    expect(pid.isExists).toBeFalsy();

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");

    await assertRegisteredSupervisor();
    await assertRegisteredWorkersFor("background", "default", { supervisorPid: RbProcess.pid });
    await assertStartedJobResult("pause");
    await assertClaimedJobs();
  });

  it("term supervisor multiple times", async () => {
    for (let i = 0; i < 5; i++) await signalProcess(pid, "TERM", { wait: 0.1 });

    await waitWhileWithTimeout(Number(SolidQueue.shutdownTimeout) + 1, async () => pid.isExists);
    await assertCleanTermination();
  });

  // BLOCKED: solid-queue-fork-mode-unported-register
  it.skip("quit supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 60 });

    await waitForJobsToFinishFor(3, { except: pause });
    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    await signalProcess(pid, "QUIT", { wait: 0.1 });

    await waitWhileWithTimeout(2, async () => pid.isExists);
    expect(pid.isExists).toBeFalsy();

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");
    await assertStartedJobResult("pause");
    await assertJobStatus(pause, "claimed");

    await assertRegisteredSupervisor();
    await assertRegisteredWorkersFor("background", "default", { supervisorPid: RbProcess.pid });
    await assertClaimedJobs();
  });

  it("term supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 0.2 });

    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    await signalProcess(pid, "TERM", { wait: 0.1 });
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
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 0.2 });

    await waitWhileWithTimeout(
      3,
      async () => !(await JobResult.where({ status: "started", value: "pause" }).isExists()),
    );

    await signalProcess(pid, "INT", { wait: 0.1 });
    await waitForJobsToFinishFor(2);

    await assertCompletedJobResults("no pause");
    await assertCompletedJobResults("pause");

    await assertJobStatus(noPause, "finished");
    await assertJobStatus(pause, "finished");

    await waitForProcessTerminationWithTimeout(pid, { timeout: 1 });
    await assertCleanTermination();
  });

  it(
    "term supervisor exceeding timeout while there are jobs in-flight",
    { timeout: 15_000 },
    async () => {
      const shutdownTimeout = Number(SolidQueue.shutdownTimeout);
      const noPause = await enqueueStoreResultJob("no pause");
      const pause = await enqueueStoreResultJob("pause", "background", {
        pause: shutdownTimeout + 30,
      });

      await waitForJobsToFinishFor(3, { except: pause });
      await waitFor({ timeout: 5 }, () =>
        JobResult.where({ queue_name: "background", status: "started", value: "pause" }).isExists(),
      );
      await assertStartedJobResult("pause");

      await signalProcess(pid, "TERM", { wait: 0.2 });
      await waitForJobsToFinishFor(2, { except: pause });

      await waitForProcessTerminationWithTimeout(pid, {
        timeout: shutdownTimeout + 5,
        exitstatus: null,
      });
      expect(pid.isExists).toBeFalsy();

      await assertCompletedJobResults("no pause");
      await assertJobStatus(noPause, "finished");

      await Record.uncached(async () => {
        const jobResults = (await JobResult.all().toArray()).map((r) => ({
          id: r.id,
          queue: r.queue_name,
          status: r.status,
          value: r.value,
          updated_at: r.updated_at,
        }));
        const processes = (await Process.all().toArray()).map((p) => ({
          id: p.id,
          kind: p.kind,
          pid: p.pid,
          last_heartbeat_at: p.last_heartbeat_at,
        }));
        expect(
          (await JobResult.findBy({ value: "pause" }))?.status,
          "Expected the pause job not to complete. " +
            `Job results: ${JSON.stringify(jobResults)}; ` +
            `registered processes: ${JSON.stringify(processes)}`,
        ).not.toEqual("completed");
      });

      await assertJobStatus(pause, "ready");
      await assertCleanTermination();
    },
  );

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

    await pid.terminate();
    await assertCleanTermination();
  });
});
