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
import { Process as RbProcess } from "@blazetrails/ruby-compat";
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
  sleep,
  waitFor,
  waitForProcessTerminationWithTimeout,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";

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

class ProcessesLifecycleTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "ProcessesLifecycleTest", ProcessesLifecycleTest);

describe("ProcessesLifecycleTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;
  let run: ReturnType<typeof runSupervisor>;

  async function assertCleanTermination() {
    await waitForRegisteredProcesses(0, { timeout: 0.2 });
    await assertNoRegisteredProcesses();
    expect(await ClaimedExecution.isNone()).toBeTruthy();
    expect(run.isExists).toBeFalsy();
  }

  async function assertRegisteredSupervisorWith(pid: number) {
    const processes = await findProcessesRegisteredAs("Supervisor").toArray();
    expect(processes.length).toEqual(1);
    expect(processes[0].pid).toEqual(pid);
  }

  async function assertNoRegisteredWorkers() {
    expect(await findProcessesRegisteredAs("Worker").toArray()).toEqual([]);
  }

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    run = runSupervisor({
      workers: [{ queues: "background" }, { queues: "default", threads: 5 }],
    });

    await waitForRegisteredProcesses(3, { timeout: 3 });
    const workers = await Process.where({ kind: "Worker" }).toArray();
    expect(workers.map((process) => process.metadata.get("queues")).sort()).toEqual([
      "background",
      "default",
    ]);
    await assertRegisteredWorkersFor("background", "default", { supervisorPid: RbProcess.pid });
  });

  afterEach(async () => {
    await run.terminate();
    vi.restoreAllMocks();
    await Job.destroyAll();
    await JobResult.deleteAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("enqueue jobs in multiple queues", async () => {
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`);
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`, "default");

    await waitWhileWithTimeout(2, async () => await Job.where({ finished_at: null }).isAny());

    expect(await JobResult.count()).toBe(12);
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "background");
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "default");

    await run.terminate();
    await assertCleanTermination();
  });

  // PERMANENT-SKIP: CLAUDE.md § "Runtime facts Node does not expose", `fork`
  it.skip("kill supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 1 });

    const signal = signalProcess(run, "KILL", { wait: 0.2 });
    await waitForJobsToFinishFor(2);
    await waitForRegisteredProcesses(1, { timeout: 3 });
    await signal;

    expect(run.isExists).toBeFalsy();

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");

    await assertCompletedJobResults("pause");
    await assertJobStatus(pause, "finished");

    await assertRegisteredSupervisorWith(RbProcess.pid);
    await assertNoRegisteredWorkers();
    expect(await ClaimedExecution.isNone()).toBeTruthy();
  });

  it("term supervisor multiple times", async () => {
    for (let i = 0; i < 5; i++) await signalProcess(run, "TERM", { wait: 0.1 });

    await sleep(1);
    await assertCleanTermination();
  });

  it("quit supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 1 });

    await waitWhileWithTimeout(1, async () => (await ReadyExecution.count()) > 0);

    const signal = signalProcess(run, "QUIT", { wait: 0.4 });
    await waitForJobsToFinishFor(2, { except: pause });

    await waitWhileWithTimeout(2, async () => run.isExists);
    expect(run.isExists).toBeFalsy();

    await assertCompletedJobResults("no pause");
    await assertJobStatus(noPause, "finished");

    await assertStartedJobResult("pause");
    await assertJobStatus(pause, "ready");
    await signal;
    await assertCleanTermination();
  });

  it("term supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 0.2 });

    const signal = signalProcess(run, "TERM", { wait: 0.3 });
    await waitForJobsToFinishFor(3);

    await assertCompletedJobResults("no pause");
    await assertCompletedJobResults("pause");

    await assertJobStatus(noPause, "finished");
    await assertJobStatus(pause, "finished");

    await signal;
    await waitForProcessTerminationWithTimeout(run);
    await assertCleanTermination();
  });

  it("int supervisor while there are jobs in-flight", async () => {
    const noPause = await enqueueStoreResultJob("no pause");
    const pause = await enqueueStoreResultJob("pause", "background", { pause: 0.2 });

    const signal = signalProcess(run, "INT", { wait: 0.3 });
    await waitForJobsToFinishFor(2);

    await assertCompletedJobResults("no pause");
    await assertCompletedJobResults("pause");

    await assertJobStatus(noPause, "finished");
    await assertJobStatus(pause, "finished");

    await signal;
    await waitForProcessTerminationWithTimeout(run);
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

      const signal = signalProcess(run, "TERM", { wait: 0.2 });
      await waitForJobsToFinishFor(2, { except: pause });

      await signal;
      await waitForProcessTerminationWithTimeout(run, {
        timeout: shutdownTimeout + 5,
        exitstatus: null,
      });
      expect(run.isExists).toBe(false);

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

    await run.terminate();
    await assertCleanTermination();
  });
});
